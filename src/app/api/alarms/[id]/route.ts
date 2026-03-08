import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

// PATCH /api/alarms/[id]  { action: 'acknowledge' | 'resolve', user_id?: number }
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const alarmId = Number(id)
  if (isNaN(alarmId)) {
    return NextResponse.json({ error: '잘못된 ID' }, { status: 400 })
  }

  const body = await req.json() as { action: string; user_id?: number }
  const { action, user_id } = body

  try {
    const alarm = await queryOne<{ id: number; state: string }>(`
      SELECT id, state FROM alarms WHERE id = $1
    `, [alarmId])

    if (!alarm) {
      return NextResponse.json({ error: '알람을 찾을 수 없습니다' }, { status: 404 })
    }

    if (action === 'acknowledge') {
      if (alarm.state !== 'active') {
        return NextResponse.json({ error: '활성 상태의 알람만 확인 처리할 수 있습니다' }, { status: 400 })
      }
      await query(`
        UPDATE alarms
        SET state = 'acknowledged', acknowledged_at = NOW(), acknowledged_by = $1
        WHERE id = $2
      `, [user_id ?? null, alarmId])
    } else if (action === 'resolve') {
      if (alarm.state === 'resolved') {
        return NextResponse.json({ error: '이미 해결된 알람입니다' }, { status: 400 })
      }
      await query(`
        UPDATE alarms
        SET state = 'resolved', resolved_at = NOW(), resolved_by = $1
        WHERE id = $2
      `, [user_id ?? null, alarmId])
    } else {
      return NextResponse.json({ error: '알 수 없는 action입니다' }, { status: 400 })
    }

    const updated = await queryOne(`SELECT * FROM alarms WHERE id = $1`, [alarmId])
    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('[PATCH /api/alarms/[id]]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
