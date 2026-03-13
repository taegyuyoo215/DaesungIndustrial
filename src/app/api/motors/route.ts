import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { MotorStatus, Severity } from '@/types'

function calcSeverity(row: Record<string, unknown>): Severity {
  if (Number(row.active_critical_alarms) > 0) return 'critical'
  if (Number(row.active_warning_alarms) > 0) return 'warning'
  if (Number(row.vel_y_rms) > 2.8 || Number(row.temperature_c) > 70) return 'warning'
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
        lm.hf_accel_y_rms,
        lm.kurtosis_x, lm.kurtosis_y,
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
