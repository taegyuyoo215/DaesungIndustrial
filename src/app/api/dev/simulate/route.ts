import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { runAutoDiagnosis } from '@/lib/autodiagnosis'
import { calcBearingFreqs, DEFAULT_BEARING } from '@/lib/fftAnalysis'
import type { BearingFreqs } from '@/types'

// ── 심각도별 목표 범위 ─────────────────────────────────────
const RANGES = {
  critical: { vel: [6.5, 10.0], temp: [64, 75], kurt: [7.0, 12.0] },
  warning:  { vel: [2.8,  5.5], temp: [58, 67], kurt: [4.0,  7.0] },
  normal:   { vel: [0.8,  2.5], temp: [42, 58], kurt: [1.2,  3.5] },
} as const

type Severity = keyof typeof RANGES

function rand(min: number, max: number) {
  return min + Math.random() * (max - min)
}

function smooth(prev: number, min: number, max: number, stepPct = 0.05): number {
  const range = max - min
  const step  = range * stepPct
  const next  = prev + (Math.random() - 0.5) * 2 * step
  return Math.max(min, Math.min(max, next))
}

// ── FFT 스펙트럼 생성 ─────────────────────────────────────
// 결함 주파수 주변에 가우시안 피크를 올려 실제 스펙트럼처럼 생성
function generateSpectrum(
  freqs: BearingFreqs,
  sev: Severity,
  velRms: number,
  axis: 'x' | 'y' | 'z',
): { freqBins: number[]; ampBins: number[] } {
  const FMAX = 500   // Hz
  const RES  = 1     // Hz (501 bins)
  const N    = Math.floor(FMAX / RES) + 1

  // 축별 스케일 (X가 주축, Y/Z는 약간 낮음)
  const axisScale = axis === 'x' ? 1.0 : axis === 'y' ? rand(0.65, 0.85) : rand(0.45, 0.70)

  // 노이즈 플로어
  const noiseAmp = sev === 'normal' ? 0.04 : sev === 'warning' ? 0.10 : 0.08
  const ampBins  = Array.from({ length: N }, () => noiseAmp * rand(0.4, 1.0))

  // 가우시안 피크 추가
  const addPeak = (freqHz: number, peakAmp: number, widthHz = 3) => {
    const center = Math.round(freqHz / RES)
    const sigma  = widthHz / 2
    for (let di = -widthHz * 3; di <= widthHz * 3; di++) {
      const i = center + di
      if (i < 0 || i >= N) continue
      const g = peakAmp * Math.exp(-(di * di) / (2 * sigma * sigma))
      if (g > ampBins[i]) ampBins[i] = g
    }
  }

  // 회전 주파수 피크 (항상 존재)
  const scale1x = velRms * 0.15 * axisScale
  addPeak(freqs.f1x, Math.max(0.2, scale1x))
  addPeak(freqs.f2x, Math.max(0.1, scale1x * 0.5))
  addPeak(freqs.f3x, Math.max(0.05, scale1x * 0.25))

  // 결함 주파수 피크 (심각도에 따라)
  if (sev === 'critical' || sev === 'warning') {
    addPeak(freqs.bpfo, rand(1.1, 1.8) * axisScale, 4)
    addPeak(freqs.bpfi, rand(0.7, 1.2) * axisScale, 4)
    addPeak(freqs.bsf,  rand(0.5, 0.9) * axisScale, 3)
    addPeak(freqs.ftf,  rand(0.3, 0.6) * axisScale, 2)
  } else {
    // 정상: 결함 주파수에 낮은 배경 피크만
    addPeak(freqs.bpfo, rand(0.03, 0.09) * axisScale, 2)
    addPeak(freqs.bpfi, rand(0.02, 0.07) * axisScale, 2)
  }

  const freqBins = Array.from({ length: N }, (_, i) => +(i * RES).toFixed(1))
  return { freqBins, ampBins: ampBins.map(v => +v.toFixed(4)) }
}

interface SensorRow {
  sensor_id:             number
  motor_id:              number
  severity:              string | null
  vel_y:                 string | null
  temp:                  string | null
  kurt_y:                string | null
  rated_rpm:             number | null
  bearing_ball_count:    number | null
  bearing_ball_dia_mm:   number | null
  bearing_pitch_dia_mm:  number | null
  bearing_contact_angle_deg: number | null
}

export async function POST() {
  try {
    const sensors = await query<SensorRow>(`
      SELECT
        s.id                        AS sensor_id,
        s.motor_id,
        COALESCE(d.severity, 'normal') AS severity,
        lm.vel_y_rms::text          AS vel_y,
        lm.temperature_c::text      AS temp,
        lm.kurtosis_y::text         AS kurt_y,
        m.rated_rpm,
        m.bearing_ball_count,
        m.bearing_ball_dia_mm,
        m.bearing_pitch_dia_mm,
        m.bearing_contact_angle_deg
      FROM sensors s
      JOIN motors m ON m.id = s.motor_id
      LEFT JOIN LATERAL (
        SELECT vel_y_rms, temperature_c, kurtosis_y
        FROM measurements
        WHERE sensor_id = s.id
        ORDER BY time DESC
        LIMIT 1
      ) lm ON true
      LEFT JOIN LATERAL (
        SELECT severity
        FROM diagnosis_results
        WHERE motor_id = s.motor_id
        ORDER BY diagnosed_at DESC
        LIMIT 1
      ) d ON true
      WHERE s.status = 'active'
    `)

    if (sensors.length === 0) {
      return NextResponse.json({ ok: true, count: 0 })
    }

    const now = new Date()
    let count = 0

    for (const s of sensors) {
      const sev = (s.severity ?? 'normal') as Severity
      const r   = RANGES[sev] ?? RANGES.normal

      const prevVel  = s.vel_y  != null ? Number(s.vel_y)  : rand(r.vel[0],  r.vel[1])
      const prevTemp = s.temp   != null ? Number(s.temp)   : rand(r.temp[0], r.temp[1])
      const prevKurt = s.kurt_y != null ? Number(s.kurt_y) : rand(r.kurt[0], r.kurt[1])

      const velY  = smooth(prevVel,  r.vel[0],  r.vel[1])
      const tempC = smooth(prevTemp, r.temp[0], r.temp[1], 0.02)
      const kurtY = smooth(prevKurt, r.kurt[0], r.kurt[1])

      const velX  = velY  * rand(0.8, 1.2)
      const velZ  = velY  * rand(0.8, 1.2)
      const hfX   = velY  * rand(1.5, 2.5)
      const hfY   = velY  * rand(1.5, 2.5)
      const hfZ   = velY  * rand(1.5, 2.5)
      const kurtX = kurtY * rand(0.8, 1.2)
      const kurtZ = kurtY * rand(0.8, 1.2)

      // 베어링 주파수 계산
      const rpm = s.rated_rpm ?? 1800
      const f1x = rpm / 60
      const bfreqs = calcBearingFreqs(
        rpm,
        s.bearing_ball_count        ?? DEFAULT_BEARING.ballCount,
        s.bearing_ball_dia_mm       ?? DEFAULT_BEARING.ballDiaMm,
        s.bearing_pitch_dia_mm      ?? DEFAULT_BEARING.pitchDiaMm,
        s.bearing_contact_angle_deg ?? DEFAULT_BEARING.contactAngleDeg,
      )

      // Crest Factor: 축별로 약간 다른 값 (심각도 기반)
      const crestBase = sev === 'critical' ? rand(4.0, 6.5)
                      : sev === 'warning'  ? rand(2.6, 4.2)
                      : rand(1.2, 2.2)
      const crestX = crestBase
      const crestY = crestBase * rand(0.75, 0.95)
      const crestZ = crestBase * rand(0.55, 0.80)

      // 지배 주파수: 축별로 약간 다른 값 (정상=1X, 이상=결함 주파수)
      const faultFreq = sev === 'critical' ? bfreqs.bpfo
                      : sev === 'warning'  ? (Math.random() < 0.6 ? bfreqs.bpfo : bfreqs.bpfi)
                      : f1x
      const peakVelFreqX = faultFreq + rand(-1.5, 1.5)
      const peakVelFreqY = faultFreq + rand(-1.5, 1.5)
      const peakVelFreqZ = faultFreq + rand(-1.5, 1.5)

      // ── measurements 삽입 ────────────────────────────────
      await query(`
        INSERT INTO measurements (
          time, sensor_id,
          vel_x_rms, vel_y_rms, vel_z_rms,
          hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms,
          kurtosis_x, kurtosis_y, kurtosis_z,
          temperature_c, motor_running,
          crest_x, crest_y, crest_z,
          peak_vel_freq_x, peak_vel_freq_y, peak_vel_freq_z
        ) VALUES (
          $1, $2,
          $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12, true,
          $13, $14, $15,
          $16, $17, $18
        )
      `, [
        now, s.sensor_id,
        velX, velY, velZ,
        hfX,  hfY,  hfZ,
        kurtX, kurtY, kurtZ,
        tempC,
        crestX, crestY, crestZ,
        peakVelFreqX, peakVelFreqY, peakVelFreqZ,
      ])

      // ── FFT 스펙트럼 삽입 (X / Y / Z 세 축) ─────────────

      for (const axis of ['x', 'y', 'z'] as const) {
        const velRms = axis === 'x' ? velX : axis === 'y' ? velY : velZ
        const { freqBins, ampBins } = generateSpectrum(bfreqs, sev, velRms, axis)
        await query(`
          INSERT INTO fft_spectra
            (motor_id, sensor_id, measured_at, axis, fmax_hz, resolution_hz, rpm_measured, freq_bins, amp_bins)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          s.motor_id, s.sensor_id, now, axis,
          500, 1, s.rated_rpm ?? 1800,
          freqBins, ampBins,
        ])
      }

      // ── 자동 진단 ─────────────────────────────────────────
      await runAutoDiagnosis({
        motorId: s.motor_id,
        meas: {
          vel_y_rms:      velY,
          hf_accel_x_rms: hfX,
          kurtosis_x:     kurtX,
          kurtosis_y:     kurtY,
          kurtosis_z:     kurtZ,
          temperature_c:  tempC,
          crest_x:        crestX,
          pkpk_accel_x:   null,
          motor_running:  true,
        },
      })

      count++
    }

    return NextResponse.json({ ok: true, count })
  } catch (err) {
    console.error('[POST /api/dev/simulate]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
