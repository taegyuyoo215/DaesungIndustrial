import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

// GET /api/dashboard/sparklines
// 모터별 최근 24시간 vel_y_rms 시간별 평균 (스파크라인용)
export async function GET() {
  try {
    const rows = await query<{
      motor_id: number
      bucket: string
      vel_y_avg: string
    }>(`
      SELECT
        m.id AS motor_id,
        date_trunc('hour', meas.time) AS bucket,
        ROUND(AVG(meas.vel_y_rms)::numeric, 3) AS vel_y_avg
      FROM motors m
      JOIN sensors s ON s.motor_id = m.id AND s.status = 'active'
      JOIN measurements meas ON meas.sensor_id = s.id
      WHERE meas.time > NOW() - INTERVAL '24 hours'
        AND meas.vel_y_rms IS NOT NULL
      GROUP BY m.id, date_trunc('hour', meas.time)
      ORDER BY m.id, bucket
    `)

    // motor_id 별로 시계열 배열로 그룹화
    const data: Record<number, number[]> = {}
    for (const row of rows) {
      const id = Number(row.motor_id)
      if (!data[id]) data[id] = []
      data[id].push(Number(row.vel_y_avg))
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('[GET /api/dashboard/sparklines]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
