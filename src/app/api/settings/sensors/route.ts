import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { Sensor } from '@/types'
import { z } from 'zod'

const CreateSchema = z.object({
  motor_id:            z.number().int().positive(),
  serial_number:       z.string().min(1),
  modbus_addr:         z.number().int().min(1).max(32),
  fmax_setting:        z.number().int().min(1).max(5).default(1),
  hfe_enabled:         z.boolean().default(false),
  measure_interval_ms: z.number().int().min(500).default(60000),
})

export async function GET() {
  try {
    const rows = await query<Sensor>(`
      SELECT s.*, m.name AS motor_name
      FROM sensors s
      JOIN motors m ON m.id = s.motor_id
      ORDER BY s.modbus_addr
    `)
    return NextResponse.json({ data: rows, total: rows.length })
  } catch (err) {
    console.error('[GET /api/settings/sensors]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = CreateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: '입력값 오류', detail: parsed.error.flatten() }, { status: 400 })
    }
    const d = parsed.data
    const [row] = await query(`
      INSERT INTO sensors (motor_id, serial_number, modbus_addr, fmax_setting, hfe_enabled, measure_interval_ms)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [d.motor_id, d.serial_number, d.modbus_addr, d.fmax_setting, d.hfe_enabled, d.measure_interval_ms])

    return NextResponse.json({ data: row }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/settings/sensors]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
