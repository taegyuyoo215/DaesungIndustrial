import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { z } from 'zod'

export async function GET(req: NextRequest) {
  const motorId = req.nextUrl.searchParams.get('motor_id')
  try {
    const rows = await query(`
      SELECT * FROM thresholds
      WHERE motor_id = $1 OR motor_id IS NULL
      ORDER BY motor_id NULLS LAST, metric
    `, [motorId ? Number(motorId) : null])
    return NextResponse.json({ data: rows })
  } catch (err) {
    console.error('[GET /api/settings/thresholds]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}

const UpsertSchema = z.object({
  motor_id:    z.number().int().positive().optional().nullable(),
  metric:      z.enum(['vel_rms', 'hf_accel', 'kurtosis', 'temperature']),
  warn_value:  z.number(),
  alarm_value: z.number(),
  unit:        z.string().optional().nullable(),
})

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = UpsertSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값 오류', detail: parsed.error.flatten() }, { status: 400 })
    }
    const d = parsed.data

    // UPSERT: motor_id + metric 조합으로 update, 없으면 insert
    const [row] = await query(`
      INSERT INTO thresholds (motor_id, metric, warn_value, alarm_value, unit)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (motor_id, metric)
      DO UPDATE SET warn_value = EXCLUDED.warn_value, alarm_value = EXCLUDED.alarm_value, unit = EXCLUDED.unit
      RETURNING *
    `, [d.motor_id ?? null, d.metric, d.warn_value, d.alarm_value, d.unit ?? null])

    return NextResponse.json({ data: row })
  } catch (err) {
    console.error('[PUT /api/settings/thresholds]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
