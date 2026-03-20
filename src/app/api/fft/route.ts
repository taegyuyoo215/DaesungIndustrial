import { NextRequest, NextResponse } from 'next/server'
import pool from '@/lib/db'
import { calcBearingFreqs, DEFAULT_BEARING, computeFaultTrend } from '@/lib/fftAnalysis'
import type { FftSpectrum } from '@/types'

// ── GET /api/fft?motor_id=1&axis=x&limit=3 ──────────────
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const motorId = parseInt(searchParams.get('motor_id') ?? '0', 10)
  const axis    = (searchParams.get('axis') ?? 'x') as 'x' | 'y' | 'z'
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '3', 10), 10)

  if (!motorId || !['x', 'y', 'z'].includes(axis)) {
    return NextResponse.json({ error: 'motor_id와 axis(x/y/z)가 필요합니다.' }, { status: 400 })
  }

  const client = await pool.connect()
  try {
    // 1) 모터 정보
    const motorRes = await client.query(
      `SELECT id, name, rated_rpm,
              bearing_ball_count, bearing_ball_dia_mm,
              bearing_pitch_dia_mm, bearing_contact_angle_deg
       FROM motors WHERE id = $1`,
      [motorId]
    )
    if (motorRes.rowCount === 0) {
      return NextResponse.json({ error: '모터를 찾을 수 없습니다.' }, { status: 404 })
    }
    const motor = motorRes.rows[0]

    // 2) 최신 FFT 스펙트럼
    const spectraRes = await client.query(
      `SELECT id, motor_id, sensor_id, measured_at, axis,
              fmax_hz, resolution_hz, rpm_measured,
              freq_bins, amp_bins
       FROM fft_spectra
       WHERE motor_id = $1 AND axis = $2
       ORDER BY measured_at DESC
       LIMIT $3`,
      [motorId, axis, limit]
    )

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

    // 3) 베어링 결함 주파수 계산
    const rpm = spectra[0]?.rpm_measured ?? motor.rated_rpm ?? 1800
    const b = {
      ballCount:       motor.bearing_ball_count        ?? DEFAULT_BEARING.ballCount,
      ballDiaMm:       motor.bearing_ball_dia_mm       ?? DEFAULT_BEARING.ballDiaMm,
      pitchDiaMm:      motor.bearing_pitch_dia_mm      ?? DEFAULT_BEARING.pitchDiaMm,
      contactAngleDeg: motor.bearing_contact_angle_deg ?? DEFAULT_BEARING.contactAngleDeg,
    }
    const bearingFreqs = calcBearingFreqs(rpm, b.ballCount, b.ballDiaMm, b.pitchDiaMm, b.contactAngleDeg)

    // 4) 결함 주파수 추세 분석 (스펙트럼 2개 이상일 때)
    const faultTrend = spectra.length >= 2
      ? computeFaultTrend(spectra, bearingFreqs)
      : []

    // 5) Peak 주파수 트렌드 — 분 단위 집계, null 제외 최근 50버킷
    const trendRes = await client.query(
      `SELECT date_trunc('minute', m.time) AS bucket,
              AVG(m.peak_vel_freq_x) AS peak_x,
              AVG(m.peak_vel_freq_y) AS peak_y,
              AVG(m.peak_vel_freq_z) AS peak_z
       FROM measurements m
       JOIN sensors s ON s.id = m.sensor_id
       WHERE s.motor_id = $1
         AND (m.peak_vel_freq_x IS NOT NULL
           OR m.peak_vel_freq_y IS NOT NULL
           OR m.peak_vel_freq_z IS NOT NULL)
       GROUP BY 1
       ORDER BY 1 DESC
       LIMIT 50`,
      [motorId]
    )

    // 6) 최신 raw 지표 1건 (센서 현황 패널용) — 선택 축 기준
    const rawRes = await client.query(
      `SELECT m.crest_${axis}       AS crest,
              m.hf_accel_${axis}_rms AS hf_accel_rms,
              m.peak_vel_freq_${axis} AS peak_vel_freq,
              m.motor_running
       FROM measurements m
       JOIN sensors s ON s.id = m.sensor_id
       WHERE s.motor_id = $1
       ORDER BY m.time DESC
       LIMIT 1`,
      [motorId]
    )
    const rawRow = rawRes.rows[0] ?? null
    const rawMetrics = rawRow ? {
      crest_x:         rawRow.crest         != null ? parseFloat(String(rawRow.crest))         : null,
      hf_accel_x_rms:  rawRow.hf_accel_rms  != null ? parseFloat(String(rawRow.hf_accel_rms))  : null,
      peak_vel_freq_x: rawRow.peak_vel_freq  != null ? parseFloat(String(rawRow.peak_vel_freq)) : null,
      motor_running:   rawRow.motor_running  as boolean | null,
    } : null

    return NextResponse.json({
      motor: { id: motor.id, name: motor.name, rated_rpm: motor.rated_rpm },
      bearingFreqs,
      spectra,
      faultTrend,
      rawMetrics,
      peakTrend: trendRes.rows.reverse().map((r) => ({
        bucket: r.bucket as string,
        peak_x: r.peak_x != null ? parseFloat(String(r.peak_x)) : null,
        peak_y: r.peak_y != null ? parseFloat(String(r.peak_y)) : null,
        peak_z: r.peak_z != null ? parseFloat(String(r.peak_z)) : null,
      })),
    })
  } finally {
    client.release()
  }
}
