import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { MaintenanceLog } from '@/types'
import { z } from 'zod'

const CreateSchema = z.object({
  motor_id:       z.number().int().positive(),
  alarm_id:       z.number().int().positive().optional().nullable(),
  work_type:      z.string().min(1),
  description:    z.string().optional().nullable(),
  parts_replaced: z.array(z.object({ name: z.string(), qty: z.number() })).optional().nullable(),
  performed_by:   z.number().int().positive().optional().nullable(),
  performed_at:   z.string().datetime().optional(),
  next_due_at:    z.string().datetime().optional().nullable(),
})

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const motorId = sp.get('motor_id')
  const page    = Math.max(1, Number(sp.get('page')  ?? 1))
  const limit   = Math.min(50, Number(sp.get('limit') ?? 20))
  const offset  = (page - 1) * limit

  const conditions: string[] = []
  const values: unknown[]    = []
  let idx = 1

  if (motorId) { conditions.push(`ml.motor_id = $${idx++}`) ; values.push(Number(motorId)) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const [rows, countRows] = await Promise.all([
      query<MaintenanceLog>(`
        SELECT
          ml.*,
          m.name     AS motor_name,
          u.username AS performed_by_name
        FROM maintenance_logs ml
        JOIN motors m ON m.id = ml.motor_id
        LEFT JOIN users u ON u.id = ml.performed_by
        ${where}
        ORDER BY ml.performed_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}
      `, [...values, limit, offset]),
      query<{ count: string }>(`
        SELECT COUNT(*) FROM maintenance_logs ml ${where}
      `, values),
    ])

    return NextResponse.json({
      data:  rows,
      total: Number(countRows[0]?.count ?? 0),
      page,
      limit,
    })
  } catch (err) {
    console.error('[GET /api/maintenance]', err)
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
      INSERT INTO maintenance_logs
        (motor_id, alarm_id, work_type, description, parts_replaced, performed_by, performed_at, next_due_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      d.motor_id,
      d.alarm_id ?? null,
      d.work_type,
      d.description ?? null,
      d.parts_replaced ? JSON.stringify(d.parts_replaced) : null,
      d.performed_by ?? null,
      d.performed_at ?? new Date().toISOString(),
      d.next_due_at ?? null,
    ])

    // 연결된 알람이 있으면 자동 해결 처리
    if (d.alarm_id) {
      await query(`
        UPDATE alarms SET state = 'resolved', resolved_at = NOW()
        WHERE id = $1 AND state != 'resolved'
      `, [d.alarm_id])
    }

    return NextResponse.json({ data: row }, { status: 201 })
  } catch (err) {
    console.error('[POST /api/maintenance]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
