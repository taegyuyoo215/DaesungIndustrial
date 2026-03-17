import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import {
  calcBearingFreqs, DEFAULT_BEARING,
  computeFaultTrend, overallFftStatus,
  FFT_TO_FAULT_TYPE, FAULT_PRIORITY,
} from '@/lib/fftAnalysis'
import type { FftSpectrum } from '@/types'

/**
 * POST /api/fft/analyze
 * Body: { motor_id: number }
 *
 * 최신 FFT 스펙트럼 3개를 기반으로 추세 분석 후:
 * - 이상 감지 시 diagnosis_results + alarms 생성
 * - raw 지표(RMS·Kurtosis)가 임계값 이내여도 FFT 추세 이상이면 조기경보 발령
 */
export async function POST(req: NextRequest) {
  let motor_id: number
  try {
    const body = await req.json()
    motor_id = Number(body.motor_id)
    if (!motor_id) throw new Error()
  } catch {
    return NextResponse.json({ error: 'motor_id가 필요합니다.' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    // ── 1. 모터 정보 ────────────────────────────────────
    const motorRes = await client.query(
      `SELECT id, name, rated_rpm,
              bearing_ball_count, bearing_ball_dia_mm,
              bearing_pitch_dia_mm, bearing_contact_angle_deg
       FROM motors WHERE id = $1`,
      [motor_id]
    )
    if (!motorRes.rowCount) {
      return NextResponse.json({ error: '모터를 찾을 수 없습니다.' }, { status: 404 })
    }
    const motor = motorRes.rows[0]

    // ── 2. 최신 FFT 스펙트럼 3개 ─────────────────────────
    const spectraRes = await client.query(
      `SELECT id, motor_id, sensor_id, measured_at, axis,
              fmax_hz, resolution_hz, rpm_measured, freq_bins, amp_bins
       FROM fft_spectra
       WHERE motor_id = $1 AND axis = 'x'
       ORDER BY measured_at DESC LIMIT 3`,
      [motor_id]
    )
    if (!spectraRes.rowCount || spectraRes.rowCount < 2) {
      return NextResponse.json(
        { error: '추세 분석을 위해 FFT 스펙트럼 데이터가 최소 2개 필요합니다.' },
        { status: 422 }
      )
    }

    const spectra: FftSpectrum[] = spectraRes.rows.map((r) => ({
      id:            r.id            as number,
      motor_id:      r.motor_id      as number,
      sensor_id:     r.sensor_id     as number,
      measured_at:   r.measured_at   as string,
      axis:          r.axis          as 'x' | 'y' | 'z',
      fmax_hz:       parseFloat(String(r.fmax_hz)),
      resolution_hz: parseFloat(String(r.resolution_hz)),
      rpm_measured:  r.rpm_measured ? parseFloat(String(r.rpm_measured)) : null,
      freq_bins:     (r.freq_bins as string[]).map(Number),
      amp_bins:      (r.amp_bins  as string[]).map(Number),
    }))

    // ── 3. 베어링 결함 주파수 계산 ───────────────────────
    const rpm = spectra[0].rpm_measured ?? motor.rated_rpm ?? 1800
    const b = {
      ballCount:       motor.bearing_ball_count        ?? DEFAULT_BEARING.ballCount,
      ballDiaMm:       motor.bearing_ball_dia_mm       ?? DEFAULT_BEARING.ballDiaMm,
      pitchDiaMm:      motor.bearing_pitch_dia_mm      ?? DEFAULT_BEARING.pitchDiaMm,
      contactAngleDeg: motor.bearing_contact_angle_deg ?? DEFAULT_BEARING.contactAngleDeg,
    }
    const bearingFreqs = calcBearingFreqs(rpm, b.ballCount, b.ballDiaMm, b.pitchDiaMm, b.contactAngleDeg)

    // ── 4. 최신 raw 지표 조회 ────────────────────────────
    const rawRes = await client.query(
      `SELECT m.crest_x, m.pkpk_accel_x, m.motor_running
       FROM measurements m
       JOIN sensors s ON s.id = m.sensor_id
       WHERE s.motor_id = $1
       ORDER BY m.time DESC LIMIT 1`,
      [motor_id]
    )
    const rawRow = rawRes.rows[0] ?? null
    const crestX  = rawRow ? parseFloat(String(rawRow.crest_x   ?? 0)) : 0
    const pkpkX   = rawRow ? parseFloat(String(rawRow.pkpk_accel_x ?? 0)) : 0
    const motorRunning = rawRow ? (rawRow.motor_running as boolean | null) : null

    // ── 5. 추세 분석 ────────────────────────────────────
    const faultTrend  = computeFaultTrend(spectra, bearingFreqs)
    const overallStat = overallFftStatus(faultTrend)

    // raw 지표 기반 looseness / bearing 보강 판정
    let rawFaultType:     string | null = null
    let rawFaultSeverity: 'warning' | 'early_warning' | null = null
    if (crestX >= 4.0) {
      rawFaultType     = 'bearing_outer'
      rawFaultSeverity = 'warning'
    } else if (pkpkX >= 5.0) {
      rawFaultType     = 'looseness'
      rawFaultSeverity = crestX >= 2.5 ? 'warning' : 'early_warning'
    } else if (crestX >= 2.5) {
      rawFaultType     = 'bearing_outer'
      rawFaultSeverity = 'early_warning'
    }

    let diagnosisId:     number | null = null
    let alarmId:         number | null = null
    let alarmCreated              = false
    let diagnosisCreated          = false

    // 모터 정지 중이면 FFT 분석 스킵
    if (motorRunning === false) {
      return NextResponse.json({
        motor_id,
        overall_status:    'normal',
        fault_trend:       faultTrend,
        diagnosis_id:      null,
        alarm_id:          null,
        alarm_created:     false,
        diagnosis_created: false,
        skipped_reason:    '모터 정지 중',
      })
    }

    // FFT 추세 또는 raw 지표 중 하나라도 이상이면 진단
    const effectiveStat = overallStat !== 'normal' ? overallStat
      : rawFaultSeverity === 'warning' ? 'warning'
      : rawFaultSeverity === 'early_warning' ? 'early_warning'
      : 'normal'

    if (effectiveStat !== 'normal') {
      // ── 6. 주요 이상 항목 결정 ───────────────────────
      const anomalous = faultTrend
        .filter(t => t.status !== 'normal')
        .sort((a, b) => {
          // warning 우선, 그 다음 FAULT_PRIORITY 순
          const statusRank = { warning: 0, early_warning: 1, normal: 2 }
          if (statusRank[a.status] !== statusRank[b.status])
            return statusRank[a.status] - statusRank[b.status]
          return FAULT_PRIORITY.indexOf(a.label) - FAULT_PRIORITY.indexOf(b.label)
        })

      // FFT 추세 이상이 있으면 FFT 결과 우선, 없으면 raw 지표 결과 사용
      let faultType: string
      let isWarn: boolean
      let confidence: number
      let rulDays: number

      if (anomalous.length > 0) {
        const dominant = anomalous[0]
        faultType  = FFT_TO_FAULT_TYPE[dominant.label] ?? 'bearing_outer'
        // raw 지표가 더 심각하면 faultType override
        if (rawFaultSeverity === 'warning' && dominant.status !== 'warning') {
          faultType = rawFaultType ?? faultType
        }
        isWarn     = dominant.status === 'warning' || rawFaultSeverity === 'warning'
        confidence = isWarn ? 82 : dominant.rateOfChange > 20 ? 65 : 50
        rulDays    = isWarn ? 10 : 45
      } else {
        // raw 지표만 이상
        faultType  = rawFaultType ?? 'bearing_outer'
        isWarn     = rawFaultSeverity === 'warning'
        confidence = isWarn ? 72 : 55
        rulDays    = isWarn ? 14 : 45
      }

      // evidence 구성
      const rawMetricsEvidence = []
      if (crestX > 0) rawMetricsEvidence.push({
        label: 'Crest Factor (X축)',
        value: crestX.toFixed(2),
        threshold: '4.0 (경보) / 2.5 (주의)',
        exceeded: crestX >= 4.0,
      })
      if (pkpkX > 0) rawMetricsEvidence.push({
        label: 'Pk-Pk 가속도 (X축)',
        value: `${pkpkX.toFixed(2)} g`,
        threshold: '10.0g (경보) / 5.0g (주의)',
        exceeded: pkpkX >= 10.0,
      })

      const evidence = {
        fft_trend:   anomalous.length > 0,
        raw_metrics: rawFaultType != null,
        source: 'fft-trend-v2',
        freq_peaks: anomalous.map(t => ({
          label:   t.label,
          freq_hz: t.freq,
          history: t.history,
          roc:     t.rateOfChange,
          trend:   t.trend,
          energy:  t.currentAmp,
        })),
        metrics: [
          ...anomalous.map(t => ({
            label:    `${t.label} 진폭 (${t.trend === 'rising' ? '↑상승' : '→안정'})`,
            value:    `${t.currentAmp.toFixed(3)} mm/s`,
            threshold:`${t.warnThreshold} mm/s`,
            exceeded: t.status === 'warning',
          })),
          ...rawMetricsEvidence,
        ],
      }

      // ── 7. diagnosis_results 저장 ────────────────────
      const diagRes = await client.query(
        `INSERT INTO diagnosis_results
           (motor_id, diagnosed_at, fault_type, confidence, severity, rul_days, evidence, model_version)
         VALUES ($1, NOW(), $2, $3, $4, $5, $6, 'fft-trend-v2')
         RETURNING id`,
        [motor_id, faultType, confidence, isWarn ? 'warning' : 'warning', rulDays, JSON.stringify(evidence)]
      )
      diagnosisId      = diagRes.rows[0].id as number
      diagnosisCreated = true

      // ── 8. 동일 fault_type 활성 알람 중복 방지 ──────
      const existRes = await client.query(
        `SELECT id FROM alarms
         WHERE motor_id = $1 AND fault_type = $2 AND state = 'active'
         LIMIT 1`,
        [motor_id, faultType]
      )

      if (!existRes.rowCount) {
        let message: string
        const dominant = anomalous[0]
        if (dominant) {
          const trendDesc =
            dominant.trend === 'rising'
              ? `${dominant.rateOfChange >= 0 ? '+' : ''}${dominant.rateOfChange}% 상승 추세`
              : '이상 감지'
          message = isWarn
            ? `[FFT] ${dominant.label}(${dominant.freq}Hz) 진폭 ${dominant.currentAmp.toFixed(3)} mm/s — 경보 임계값 ${dominant.warnThreshold} mm/s 초과`
            : `[FFT 조기경보] ${dominant.label}(${dominant.freq}Hz) ${trendDesc} — raw 지표 정상이나 주파수 도메인 이상 감지`
        } else if (faultType === 'looseness') {
          message = `[RAW] Pk-Pk 가속도 ${pkpkX.toFixed(2)}g — 풀림(Looseness) 의심`
        } else {
          message = `[RAW] Crest Factor ${crestX.toFixed(2)} — 베어링 충격 신호 증가`
        }

        const alarmRes = await client.query(
          `INSERT INTO alarms
             (motor_id, diagnosis_result_id, severity, state, fault_type, message, triggered_at)
           VALUES ($1, $2, 'warning', 'active', $3, $4, NOW())
           RETURNING id`,
          [motor_id, diagnosisId, faultType, message]
        )
        alarmId      = alarmRes.rows[0].id as number
        alarmCreated = true
      }
    }

    return NextResponse.json({
      motor_id,
      overall_status:    effectiveStat,
      fault_trend:       faultTrend,
      diagnosis_id:      diagnosisId,
      alarm_id:          alarmId,
      alarm_created:     alarmCreated,
      diagnosis_created: diagnosisCreated,
    })
  } finally {
    client.release()
  }
}
