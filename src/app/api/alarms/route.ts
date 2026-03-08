import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { Alarm } from '@/types'

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const state    = sp.get('state')    // active | acknowledged | resolved | (없으면 전체)
  const severity = sp.get('severity') // warning | critical
  const motorId  = sp.get('motor_id')
  const page     = Math.max(1, Number(sp.get('page')  ?? 1))
  const limit    = Math.min(50, Number(sp.get('limit') ?? 20))
  const offset   = (page - 1) * limit

  const conditions: string[] = []
  const values: unknown[]    = []
  let idx = 1

  if (state)    { conditions.push(`a.state = $${idx++}`)    ; values.push(state)    }
  if (severity) { conditions.push(`a.severity = $${idx++}`) ; values.push(severity) }
  if (motorId)  { conditions.push(`a.motor_id = $${idx++}`) ; values.push(Number(motorId)) }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  try {
    const [rows, countRows] = await Promise.all([
      query<Alarm>(`
        SELECT
          a.*,
          m.name     AS motor_name,
          m.location AS motor_location,
          u.username AS acknowledged_by_name
        FROM alarms a
        JOIN motors m ON m.id = a.motor_id
        LEFT JOIN users u ON u.id = a.acknowledged_by
        ${where}
        ORDER BY a.triggered_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}
      `, [...values, limit, offset]),
      query<{ count: string }>(`
        SELECT COUNT(*) FROM alarms a ${where}
      `, values),
    ])

    return NextResponse.json({
      data:  rows,
      total: Number(countRows[0]?.count ?? 0),
      page,
      limit,
    })
  } catch (err) {
    console.error('[GET /api/alarms]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
