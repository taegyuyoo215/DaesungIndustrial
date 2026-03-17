import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { MotorStatus, Severity } from '@/types'

function calcSeverity(row: Record<string, unknown>): Severity {
  // 모터 정지 중이면 'off' 대신 'normal' 반환 (Severity 타입 범위 내)
  if (row.motor_running === false) return 'normal'

  const crest   = Number(row.crest_x      ?? 0)
  const hf      = Number(row.hf_accel_x_rms ?? 0)
  const pkpk    = Number(row.pkpk_accel_x  ?? 0)
  const vel     = Number(row.vel_y_rms     ?? 0)
  const kurtX   = Number(row.kurtosis_x    ?? 0)
  const kurtY   = Number(row.kurtosis_y    ?? 0)
  const kurtZ   = Number(row.kurtosis_z    ?? 0)
  const kurtMax = Math.max(kurtX, kurtY, kurtZ)
  const temp    = Number(row.temperature_c ?? 0)

  // ── Critical 판정 ────────────────────────────────────────
  if (Number(row.active_critical_alarms) > 0)   return 'critical'
  if (crest >= 4.0 || hf >= 3.0)                return 'critical'
  if (vel   >= 7.1)                              return 'critical'
  if (kurtMax >= 8.0)                            return 'critical'
  if (temp  >= 70)                               return 'critical'

  // ── Warning 판정 ─────────────────────────────────────────
  if (Number(row.active_warning_alarms) > 0)     return 'warning'
  if (crest >= 2.5 || hf >= 1.5)                return 'warning'
  if (pkpk  >= 5.0)                              return 'warning'   // looseness 의심
  if (vel   >= 2.8 || kurtMax >= 5.0 || temp >= 60) return 'warning'

  return 'normal'
}

export async function GET() {
  try {
    const rows = await query<Record<string, unknown>>(`
      SELECT
        m.id, m.site_id, si.name AS site_name,
        m.name, m.location,
        m.rated_rpm, m.rated_power_kw, m.iso_class,
        m.installed_at, m.created_at,
        sens.id          AS sensor_id,
        sens.modbus_addr,
        sens.status      AS sensor_status,
        sens.last_seen_at,
        lm.time          AS last_measured_at,
        lm.vel_x_rms, lm.vel_y_rms, lm.vel_z_rms,
        lm.hf_accel_x_rms,
        lm.kurtosis_x, lm.kurtosis_y, lm.kurtosis_z,
        lm.crest_x, lm.pkpk_accel_x, lm.peak_vel_freq_x,
        lm.motor_running,
        lm.temperature_c,
        -- 24시간 전 대비 변화량
        ROUND((lm.vel_y_rms    - pm.prev_vel_y)::numeric,    3) AS vel_y_delta,
        ROUND((lm.temperature_c - pm.prev_temp)::numeric,    2) AS temp_delta,
        ROUND((lm.kurtosis_x   - pm.prev_kurtosis)::numeric, 3) AS kurtosis_delta,
        (
          SELECT COUNT(*) FROM alarms a
          WHERE a.motor_id = m.id AND a.state = 'active' AND a.severity = 'critical'
        ) AS active_critical_alarms,
        (
          SELECT COUNT(*) FROM alarms a
          WHERE a.motor_id = m.id AND a.state = 'active' AND a.severity = 'warning'
        ) AS active_warning_alarms
      FROM motors m
      JOIN sites si ON si.id = m.site_id
      LEFT JOIN sensors sens ON sens.motor_id = m.id AND sens.status = 'active'
      LEFT JOIN LATERAL (
        SELECT * FROM measurements
        WHERE sensor_id = sens.id
        ORDER BY time DESC
        LIMIT 1
      ) lm ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          vel_y_rms     AS prev_vel_y,
          temperature_c AS prev_temp,
          kurtosis_x    AS prev_kurtosis
        FROM measurements
        WHERE sensor_id = sens.id
          AND time BETWEEN NOW() - INTERVAL '25 hours' AND NOW() - INTERVAL '23 hours'
        ORDER BY time DESC
        LIMIT 1
      ) pm ON TRUE
      ORDER BY m.id
    `)

    const data: MotorStatus[] = rows.map(row => ({
      ...(row as unknown as MotorStatus),
      severity:       calcSeverity(row),
      vel_y_delta:    row.vel_y_delta    != null ? Number(row.vel_y_delta)    : null,
      temp_delta:     row.temp_delta     != null ? Number(row.temp_delta)     : null,
      kurtosis_delta: row.kurtosis_delta != null ? Number(row.kurtosis_delta) : null,
    }))

    return NextResponse.json({ data, total: data.length })
  } catch (err) {
    console.error('[GET /api/motors]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
