/**
 * GET  /api/floor-plan/pins?floor_plan_id=1  — 핀 목록
 * POST /api/floor-plan/pins                  — 핀 추가
 */

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(req: NextRequest) {
  const fpIdStr = req.nextUrl.searchParams.get('floor_plan_id')
  const fpId = fpIdStr ? parseInt(fpIdStr, 10) : NaN

  try {
    if (isNaN(fpId)) {
      // floor_plan_id가 없으면 전체 핀 목록 반환 (중복 체크용)
      const pins = await query<{ id: number; floor_plan_id: number; motor_id: number }>(
        `SELECT id, floor_plan_id, motor_id FROM motor_pins ORDER BY id`
      )
      return NextResponse.json({ ok: true, pins })
    }

    const pins = await query<{ id: number; motor_id: number; page: number; x_pct: number; y_pct: number }>(
      `SELECT id, motor_id, page, x_pct::float, y_pct::float FROM motor_pins WHERE floor_plan_id = $1 ORDER BY id`,
      [fpId]
    )
    return NextResponse.json({ ok: true, pins })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { floor_plan_id, motor_id, page, x_pct, y_pct } = await req.json() as {
      floor_plan_id: number; motor_id: number; page?: number; x_pct: number; y_pct: number
    }

    if (!floor_plan_id || !motor_id || x_pct == null || y_pct == null) {
      return NextResponse.json({ ok: false, error: '필수 파라미터가 누락되었습니다.' }, { status: 400 })
    }

    // [중복 방지 핵심 로직] 
    // 동일한 motor_id가 다른 floor_plan_id에 존재하면 삭제 (이동 처리)
    await query(
      `DELETE FROM motor_pins WHERE motor_id = $1 AND floor_plan_id != $2`,
      [motor_id, floor_plan_id]
    )

    // 이미 해당 도면에 같은 모터가 있으면 위치 업데이트
    const existing = await queryOne<{ id: number }>(
      `SELECT id FROM motor_pins WHERE floor_plan_id = $1 AND motor_id = $2`,
      [floor_plan_id, motor_id]
    )

    if (existing) {
      await queryOne(
        `UPDATE motor_pins SET page = $1, x_pct = $2, y_pct = $3 WHERE id = $4 RETURNING id`,
        [page ?? 1, x_pct, y_pct, existing.id]
      )
      return NextResponse.json({ ok: true, id: existing.id, updated: true })
    }

    const row = await queryOne<{ id: number }>(
      `INSERT INTO motor_pins (floor_plan_id, motor_id, page, x_pct, y_pct)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [floor_plan_id, motor_id, page ?? 1, x_pct, y_pct]
    )
    return NextResponse.json({ ok: true, id: row!.id, updated: false })
  } catch (err) {
    console.error('[POST /api/floor-plan/pins]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const fpId = parseInt(req.nextUrl.searchParams.get('floor_plan_id') ?? '', 10)
  const motorId = parseInt(req.nextUrl.searchParams.get('motor_id') ?? '', 10)

  if (isNaN(fpId) || isNaN(motorId)) {
    return NextResponse.json({ ok: false, error: '유효하지 않은 파라미터' }, { status: 400 })
  }

  try {
    await query(`DELETE FROM motor_pins WHERE floor_plan_id = $1 AND motor_id = $2`, [fpId, motorId])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/floor-plan/pins]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
