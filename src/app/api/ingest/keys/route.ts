/**
 * GET  /api/ingest/keys        — 전체 센서 API 키 목록 조회
 * POST /api/ingest/keys        — 특정 센서 API 키 재발급
 *                                Body: { sensor_id: number }
 */

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { randomBytes } from 'crypto'

function generateApiKey(): string {
  return 'mqt_' + randomBytes(28).toString('hex')
}

// ── GET: 전체 센서 API 키 목록 ───────────────────────────────
export async function GET() {
  try {
    const rows = await query<{
      sensor_id:     number
      serial_number: string
      motor_name:    string
      location:      string | null
      status:        string
      api_key:       string
      last_seen_at:  string | null
    }>(`
      SELECT
        s.id            AS sensor_id,
        s.serial_number,
        m.name          AS motor_name,
        m.location,
        s.status,
        s.api_key,
        s.last_seen_at
      FROM sensors s
      JOIN motors m ON m.id = s.motor_id
      ORDER BY s.id
    `)

    return NextResponse.json({ ok: true, keys: rows })
  } catch (err) {
    console.error('[GET /api/ingest/keys]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// ── POST: API 키 재발급 ──────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { sensor_id } = await req.json() as { sensor_id: number }

    if (!sensor_id || typeof sensor_id !== 'number') {
      return NextResponse.json(
        { ok: false, error: 'sensor_id가 필요합니다.' },
        { status: 400 }
      )
    }

    const sensor = await queryOne<{ id: number }>(
      `SELECT id FROM sensors WHERE id = $1`,
      [sensor_id]
    )
    if (!sensor) {
      return NextResponse.json(
        { ok: false, error: '해당 센서를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const newKey = generateApiKey()
    await query(
      `UPDATE sensors SET api_key = $1 WHERE id = $2`,
      [newKey, sensor_id]
    )

    return NextResponse.json({ ok: true, sensor_id, api_key: newKey })
  } catch (err) {
    console.error('[POST /api/ingest/keys]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
