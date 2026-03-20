/**
 * POST /api/ingest
 *
 * 실제 센서(QM30VT3 등)에서 JSON 형식으로 측정 데이터를 수신하는 엔드포인트.
 *
 * ── 인증 ────────────────────────────────────────────────────
 * 헤더:  X-API-Key: mqt_<64자 hex>
 * 키는 sensors.api_key 에 저장되며, /api/ingest/keys 에서 조회·재발급 가능.
 *
 * ── 요청 Body 예시 ───────────────────────────────────────────
 * {
 *   "timestamp":       "2026-03-20T10:30:00.000Z",  // 생략 시 서버 시각 사용
 *   "vel_x_rms":       1.23,   // mm/s
 *   "vel_y_rms":       0.98,
 *   "vel_z_rms":       0.87,
 *   "hf_accel_x_rms":  2.10,   // g
 *   "hf_accel_y_rms":  1.80,
 *   "hf_accel_z_rms":  1.50,
 *   "hf_peak_x":       3.20,   // g
 *   "hf_peak_y":       2.80,
 *   "hf_peak_z":       2.40,
 *   "pkpk_accel_x":    4.10,   // g
 *   "pkpk_accel_y":    3.60,
 *   "pkpk_accel_z":    3.10,
 *   "kurtosis_x":      2.10,
 *   "kurtosis_y":      1.90,
 *   "kurtosis_z":      2.30,
 *   "crest_x":         1.80,
 *   "crest_y":         1.60,
 *   "crest_z":         1.40,
 *   "peak_vel_freq_x": 30.0,   // Hz
 *   "peak_vel_freq_y": 30.1,
 *   "peak_vel_freq_z": 29.8,
 *   "temperature_c":   45.2,   // °C
 *   "motor_running":   true,
 *   "mag_hf_accel":    3.20,   // g (합성벡터)
 *   "fft": [                   // FFT 스펙트럼 (선택, 여러 축 가능)
 *     {
 *       "axis":         "x",
 *       "fmax_hz":      500,
 *       "resolution_hz":1.0,
 *       "rpm_measured": 1800,
 *       "freq_bins":    [0, 1, 2, ...],
 *       "amp_bins":     [0.01, 0.02, ...]
 *     }
 *   ]
 * }
 *
 * ── 응답 ────────────────────────────────────────────────────
 * 200: { ok: true, sensor_id, motor_id, received_at, diagnosis_triggered }
 * 400: { ok: false, error: "필드 오류 설명" }
 * 401: { ok: false, error: "인증 실패" }
 * 403: { ok: false, error: "비활성 센서" }
 * 500: { ok: false, error: "서버 오류" }
 */

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { runAutoDiagnosis } from '@/lib/autodiagnosis'

// ── 타입 정의 ───────────────────────────────────────────────

interface FftPayload {
  axis:          'x' | 'y' | 'z'
  fmax_hz:       number
  resolution_hz: number
  rpm_measured?: number
  freq_bins:     number[]
  amp_bins:      number[]
}

interface IngestPayload {
  timestamp?:       string       // ISO 8601 (생략 시 서버 시각)

  // RMS Velocity (mm/s)
  vel_x_rms?:       number
  vel_y_rms?:       number
  vel_z_rms?:       number

  // HF RMS Acceleration (g)
  hf_accel_x_rms?:  number
  hf_accel_y_rms?:  number
  hf_accel_z_rms?:  number

  // HF Peak Acceleration (g)
  hf_peak_x?:       number
  hf_peak_y?:       number
  hf_peak_z?:       number

  // Full Band Pk-Pk Acceleration (g)
  pkpk_accel_x?:    number
  pkpk_accel_y?:    number
  pkpk_accel_z?:    number

  // HF Crest Factor
  crest_x?:         number
  crest_y?:         number
  crest_z?:         number

  // HF Kurtosis
  kurtosis_x?:      number
  kurtosis_y?:      number
  kurtosis_z?:      number

  // Peak Velocity Frequency (Hz)
  peak_vel_freq_x?: number
  peak_vel_freq_y?: number
  peak_vel_freq_z?: number

  // Temperature (°C)
  temperature_c?:   number

  // Motor Run Flag
  motor_running?:   boolean

  // Magnitude HF Accel (g)
  mag_hf_accel?:    number

  // FFT 스펙트럼 (선택)
  fft?:             FftPayload[]
}

interface SensorRow {
  id:       number
  motor_id: number
  status:   string
}

// ── 유효성 검사 ─────────────────────────────────────────────

function validateNumber(val: unknown, field: string): string | null {
  if (val === undefined || val === null) return null
  if (typeof val !== 'number' || isNaN(val) || !isFinite(val))
    return `${field} 값이 유효하지 않습니다 (숫자여야 합니다).`
  return null
}

function validatePayload(body: IngestPayload): string | null {
  // 최소 1개 이상의 측정값이 있어야 함
  const numericFields = [
    'vel_x_rms', 'vel_y_rms', 'vel_z_rms',
    'hf_accel_x_rms', 'hf_accel_y_rms', 'hf_accel_z_rms',
    'kurtosis_x', 'kurtosis_y', 'kurtosis_z',
    'temperature_c',
  ] as const

  const hasAny = numericFields.some(f => body[f] != null)
  if (!hasAny) return '측정값이 하나도 없습니다. vel_x_rms, temperature_c 등 최소 1개 이상 포함해야 합니다.'

  // 숫자 필드 타입 검사
  for (const f of numericFields) {
    const err = validateNumber(body[f], f)
    if (err) return err
  }

  // timestamp 형식 검사
  if (body.timestamp !== undefined) {
    const d = new Date(body.timestamp)
    if (isNaN(d.getTime())) return 'timestamp가 유효한 ISO 8601 형식이 아닙니다.'
    // 미래 5분 초과 거부
    if (d.getTime() > Date.now() + 5 * 60 * 1000)
      return 'timestamp가 현재 시각보다 5분 이상 미래입니다.'
  }

  // FFT 검사
  if (body.fft) {
    if (!Array.isArray(body.fft)) return 'fft 필드는 배열이어야 합니다.'
    for (const f of body.fft) {
      if (!['x', 'y', 'z'].includes(f.axis)) return `fft.axis는 x/y/z 중 하나여야 합니다.`
      if (typeof f.fmax_hz !== 'number') return 'fft.fmax_hz가 유효하지 않습니다.'
      if (typeof f.resolution_hz !== 'number') return 'fft.resolution_hz가 유효하지 않습니다.'
      if (!Array.isArray(f.freq_bins) || !Array.isArray(f.amp_bins))
        return 'fft.freq_bins와 fft.amp_bins는 배열이어야 합니다.'
      if (f.freq_bins.length !== f.amp_bins.length)
        return 'fft.freq_bins와 fft.amp_bins의 길이가 다릅니다.'
      if (f.freq_bins.length === 0)
        return 'fft.freq_bins가 비어 있습니다.'
    }
  }

  return null
}

// ── POST /api/ingest ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1) API 키 인증
  const apiKey = req.headers.get('X-API-Key')
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: 'X-API-Key 헤더가 없습니다.' },
      { status: 401 }
    )
  }

  const sensor = await queryOne<SensorRow>(
    `SELECT id, motor_id, status FROM sensors WHERE api_key = $1`,
    [apiKey]
  )
  if (!sensor) {
    return NextResponse.json(
      { ok: false, error: '유효하지 않은 API 키입니다.' },
      { status: 401 }
    )
  }
  if (sensor.status !== 'active') {
    return NextResponse.json(
      { ok: false, error: `센서가 비활성 상태입니다. (status: ${sensor.status})` },
      { status: 403 }
    )
  }

  // 2) Body 파싱
  let body: IngestPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { ok: false, error: 'JSON 파싱 실패: Content-Type이 application/json인지 확인하세요.' },
      { status: 400 }
    )
  }

  // 3) 유효성 검사
  const validationError = validatePayload(body)
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 })
  }

  const receivedAt = body.timestamp ? new Date(body.timestamp) : new Date()

  try {
    // 4) measurements 삽입
    await query(`
      INSERT INTO measurements (
        time, sensor_id,
        vel_x_rms,      vel_y_rms,      vel_z_rms,
        hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms,
        hf_peak_x,      hf_peak_y,      hf_peak_z,
        pkpk_accel_x,   pkpk_accel_y,   pkpk_accel_z,
        crest_x,        crest_y,        crest_z,
        kurtosis_x,     kurtosis_y,     kurtosis_z,
        peak_vel_freq_x, peak_vel_freq_y, peak_vel_freq_z,
        temperature_c,  motor_running,  mag_hf_accel
      ) VALUES (
        $1, $2,
        $3,  $4,  $5,
        $6,  $7,  $8,
        $9,  $10, $11,
        $12, $13, $14,
        $15, $16, $17,
        $18, $19, $20,
        $21, $22, $23,
        $24, $25, $26
      )
    `, [
      receivedAt,       sensor.id,
      body.vel_x_rms       ?? null, body.vel_y_rms       ?? null, body.vel_z_rms       ?? null,
      body.hf_accel_x_rms  ?? null, body.hf_accel_y_rms  ?? null, body.hf_accel_z_rms  ?? null,
      body.hf_peak_x       ?? null, body.hf_peak_y       ?? null, body.hf_peak_z       ?? null,
      body.pkpk_accel_x    ?? null, body.pkpk_accel_y    ?? null, body.pkpk_accel_z    ?? null,
      body.crest_x         ?? null, body.crest_y         ?? null, body.crest_z         ?? null,
      body.kurtosis_x      ?? null, body.kurtosis_y      ?? null, body.kurtosis_z      ?? null,
      body.peak_vel_freq_x ?? null, body.peak_vel_freq_y ?? null, body.peak_vel_freq_z ?? null,
      body.temperature_c   ?? null, body.motor_running   ?? null, body.mag_hf_accel    ?? null,
    ])

    // 5) FFT 스펙트럼 삽입 (제공된 경우)
    if (body.fft && body.fft.length > 0) {
      for (const f of body.fft) {
        await query(`
          INSERT INTO fft_spectra
            (motor_id, sensor_id, measured_at, axis, fmax_hz, resolution_hz, rpm_measured, freq_bins, amp_bins)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          sensor.motor_id, sensor.id, receivedAt,
          f.axis, f.fmax_hz, f.resolution_hz,
          f.rpm_measured ?? null,
          f.freq_bins, f.amp_bins,
        ])
      }
    }

    // 6) last_seen_at 갱신
    await query(
      `UPDATE sensors SET last_seen_at = $1 WHERE id = $2`,
      [receivedAt, sensor.id]
    )

    // 7) 자동 진단
    let diagnosisTriggered = false
    if (body.vel_y_rms != null || body.kurtosis_y != null || body.temperature_c != null) {
      await runAutoDiagnosis({
        motorId: sensor.motor_id,
        meas: {
          vel_y_rms:      body.vel_y_rms      ?? null,
          hf_accel_x_rms: body.hf_accel_x_rms ?? null,
          kurtosis_x:     body.kurtosis_x     ?? null,
          kurtosis_y:     body.kurtosis_y     ?? null,
          kurtosis_z:     body.kurtosis_z     ?? null,
          temperature_c:  body.temperature_c  ?? null,
          crest_x:        body.crest_x        ?? null,
          pkpk_accel_x:   body.pkpk_accel_x   ?? null,
          motor_running:  body.motor_running   ?? null,
        },
      })
      diagnosisTriggered = true
    }

    return NextResponse.json({
      ok:                  true,
      sensor_id:           sensor.id,
      motor_id:            sensor.motor_id,
      received_at:         receivedAt.toISOString(),
      diagnosis_triggered: diagnosisTriggered,
    })
  } catch (err) {
    console.error('[POST /api/ingest]', err)
    return NextResponse.json(
      { ok: false, error: `서버 오류: ${String(err)}` },
      { status: 500 }
    )
  }
}
