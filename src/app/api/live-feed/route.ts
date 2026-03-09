import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

interface StatsRow {
  total_today:   string
  anomaly_count: string
  missing_count: string
}

interface MeasRow {
  motor_name:    string
  measured_at:   string
  vel_y_rms:     string | null
  temperature_c: string | null
  kurtosis_x:    string | null
  severity:      string
}

export async function GET() {
  try {
    const [statsRows, recentRows] = await Promise.all([
      query<StatsRow>(`
        SELECT
          COUNT(*)::text AS total_today,
          COUNT(*) FILTER (
            WHERE vel_y_rms > 2.8 OR temperature_c > 60 OR kurtosis_x > 5.0
          )::text AS anomaly_count,
          COUNT(*) FILTER (
            WHERE vel_y_rms IS NULL AND temperature_c IS NULL AND kurtosis_x IS NULL
          )::text AS missing_count
        FROM sensor_measurements
        WHERE measured_at >= CURRENT_DATE
      `),
      query<MeasRow>(`
        SELECT
          m.name          AS motor_name,
          sm.measured_at::text,
          sm.vel_y_rms::text,
          sm.temperature_c::text,
          sm.kurtosis_x::text,
          CASE
            WHEN sm.vel_y_rms > 7.1 OR sm.temperature_c > 70 OR sm.kurtosis_x > 8.0 THEN 'critical'
            WHEN sm.vel_y_rms > 2.8 OR sm.temperature_c > 60 OR sm.kurtosis_x > 5.0 THEN 'warning'
            ELSE 'normal'
          END AS severity
        FROM sensor_measurements sm
        JOIN motors m ON m.id = sm.motor_id
        ORDER BY sm.measured_at DESC
        LIMIT 50
      `),
    ])

    const s = statsRows[0] ?? { total_today: '0', anomaly_count: '0', missing_count: '0' }

    return NextResponse.json({
      stats: {
        total_today:   parseInt(s.total_today,   10),
        anomaly_count: parseInt(s.anomaly_count, 10),
        missing_count: parseInt(s.missing_count, 10),
      },
      recent: recentRows.map(r => ({
        motor_name:    r.motor_name,
        measured_at:   r.measured_at,
        vel_y_rms:     r.vel_y_rms     != null ? Number(r.vel_y_rms)     : null,
        temperature_c: r.temperature_c != null ? Number(r.temperature_c) : null,
        kurtosis_x:    r.kurtosis_x    != null ? Number(r.kurtosis_x)    : null,
        severity:      r.severity,
      })),
    })
  } catch (err) {
    console.error('[GET /api/live-feed]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
