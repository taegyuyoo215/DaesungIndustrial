import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { z } from 'zod'

const UpdateSchema = z.object({
  modbus_addr:         z.number().int().min(1).max(32).optional(),
  fmax_setting:        z.number().int().min(1).max(5).optional(),
  hfe_enabled:         z.boolean().optional(),
  measure_interval_ms: z.number().int().min(500).optional(),
  status:              z.enum(['active', 'inactive', 'error']).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sensorId = Number(id)
  if (isNaN(sensorId)) return NextResponse.json({ error: '잘못된 ID' }, { status: 400 })

  const body = await req.json()
  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '입력값 오류', detail: parsed.error.flatten() }, { status: 400 })
  }

  const fields = Object.entries(parsed.data)
    .filter(([, v]) => v !== undefined)
    .map(([k, v], i) => `${k} = $${i + 1}`)
  const values = Object.values(parsed.data).filter(v => v !== undefined)

  if (fields.length === 0) return NextResponse.json({ error: '변경할 값이 없습니다' }, { status: 400 })

  try {
    await query(
      `UPDATE sensors SET ${fields.join(', ')} WHERE id = $${values.length + 1}`,
      [...values, sensorId]
    )
    const updated = await queryOne(`SELECT * FROM sensors WHERE id = $1`, [sensorId])
    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('[PATCH /api/settings/sensors/[id]]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const sensorId = Number(id)
  if (isNaN(sensorId)) return NextResponse.json({ error: '잘못된 ID' }, { status: 400 })

  try {
    // soft delete
    await query(`UPDATE sensors SET status = 'inactive' WHERE id = $1`, [sensorId])
    return NextResponse.json({ data: { id: sensorId, status: 'inactive' } })
  } catch (err) {
    console.error('[DELETE /api/settings/sensors/[id]]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
