/**
 * PATCH  /api/floor-plan/pins/[id]  — 핀 위치 수정
 * DELETE /api/floor-plan/pins/[id]  — 핀 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryOne, query } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const pinId = parseInt(id, 10)
  if (isNaN(pinId)) return NextResponse.json({ ok: false, error: '유효하지 않은 ID' }, { status: 400 })

  try {
    const { page, x_pct, y_pct } = await req.json() as { page?: number; x_pct: number; y_pct: number }

    const row = await queryOne<{ id: number }>(
      `UPDATE motor_pins SET page = COALESCE($1, page), x_pct = $2, y_pct = $3
       WHERE id = $4 RETURNING id`,
      [page ?? null, x_pct, y_pct, pinId]
    )
    if (!row) return NextResponse.json({ ok: false, error: '핀을 찾을 수 없습니다.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const pinId = parseInt(id, 10)
  if (isNaN(pinId)) return NextResponse.json({ ok: false, error: '유효하지 않은 ID' }, { status: 400 })

  try {
    await query(`DELETE FROM motor_pins WHERE id = $1`, [pinId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
