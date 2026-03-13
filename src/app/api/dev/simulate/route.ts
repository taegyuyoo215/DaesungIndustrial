import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

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

// 이전값에서 부드럽게 변화하는 함수 (±stepPct 범위 내 랜덤 워크)
function smooth(prev: number, min: number, max: number, stepPct = 0.05): number {
  const range = max - min
  const step  = range * stepPct
  const next  = prev + (Math.random() - 0.5) * 2 * step
  return Math.max(min, Math.min(max, next))
}

interface SensorRow {
  sensor_id: number
  motor_id:  number
  severity:  string | null
  vel_y:     string | null
  temp:      string | null
  kurt_y:    string | null
}

export async function POST() {
  try {
    // 활성 센서 + 최신 측정값 + 진단 심각도 조회
    const sensors = await query<SensorRow>(`
      SELECT
        s.id                 AS sensor_id,
        s.motor_id,
        COALESCE(d.severity, 'normal') AS severity,
        lm.vel_y_rms::text   AS vel_y,
        lm.temperature_c::text AS temp,
        lm.kurtosis_y::text  AS kurt_y
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

      // 이전값 기준 부드러운 랜덤 워크 (이전값 없으면 범위 내 랜덤)
      const prevVel  = s.vel_y  != null ? Number(s.vel_y)  : rand(r.vel[0],  r.vel[1])
      const prevTemp = s.temp   != null ? Number(s.temp)   : rand(r.temp[0], r.temp[1])
      const prevKurt = s.kurt_y != null ? Number(s.kurt_y) : rand(r.kurt[0], r.kurt[1])

      const velY  = smooth(prevVel,  r.vel[0],  r.vel[1])
      const tempC = smooth(prevTemp, r.temp[0], r.temp[1], 0.02) // 온도는 더 천천히
      const kurtY = smooth(prevKurt, r.kurt[0], r.kurt[1])

      // X/Z 축은 Y 기준 ±20% 범위
      const velX  = velY  * rand(0.8, 1.2)
      const velZ  = velY  * rand(0.8, 1.2)
      const hfX   = velY  * rand(1.5, 2.5)
      const hfY   = velY  * rand(1.5, 2.5)
      const hfZ   = velY  * rand(1.5, 2.5)
      const kurtX = kurtY * rand(0.8, 1.2)
      const kurtZ = kurtY * rand(0.8, 1.2)

      await query(`
        INSERT INTO measurements (
          time, sensor_id,
          vel_x_rms, vel_y_rms, vel_z_rms,
          hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms,
          kurtosis_x, kurtosis_y, kurtosis_z,
          temperature_c, motor_running
        ) VALUES (
          $1, $2,
          $3, $4, $5,
          $6, $7, $8,
          $9, $10, $11,
          $12, true
        )
      `, [
        now, s.sensor_id,
        velX, velY, velZ,
        hfX,  hfY,  hfZ,
        kurtX, kurtY, kurtZ,
        tempC,
      ])

      count++
    }

    return NextResponse.json({ ok: true, count })
  } catch (err) {
    console.error('[POST /api/dev/simulate]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
