/**
 * GET  /api/floor-plan  — 현재 도면 + 핀 + 모터 상태 조회
 * POST /api/floor-plan  — 도면 PDF 업로드 (multipart/form-data)
 * DELETE /api/floor-plan?id=1 — 도면 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const FLOOR_PLANS_DIR = path.join(process.cwd(), 'floor-plans')

async function ensureDir() {
  if (!existsSync(FLOOR_PLANS_DIR)) await mkdir(FLOOR_PLANS_DIR, { recursive: true })
}

// ── GET ───────────────────────────────────────────────────────

// ── GET ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const idParam = req.nextUrl.searchParams.get('id')
    
    // 1. 상세 조회 (특정 ID)
    if (idParam) {
      const id = parseInt(idParam, 10)
      if (isNaN(id)) return NextResponse.json({ ok: false, error: '유효하지 않은 ID' }, { status: 400 })

      const fp = await queryOne<{
        id: number; name: string; file_name: string; page_count: number; created_at: string
      }>(`SELECT id, name, file_name, page_count, created_at
          FROM floor_plans WHERE id = $1`, [id])

      if (!fp) return NextResponse.json({ ok: false, error: '도면을 찾을 수 없습니다.' }, { status: 404 })

      // 핀 + 모터 상태
      const pins = await query<{
        id: number; motor_id: number; motor_name: string; location: string | null
        page: number; x_pct: number; y_pct: number
        severity: string; vel_y_rms: number | null
        temperature_c: number | null; fault_type: string | null
      }>(`
        SELECT
          mp.id, mp.motor_id, m.name AS motor_name, m.location,
          mp.page,
          mp.x_pct::float, mp.y_pct::float,
          COALESCE(d.severity,
            CASE
              WHEN lm.hf_accel_x_rms >= 3.0 OR lm.vel_y_rms >= 7.1
                OR lm.kurtosis_y >= 8.0 OR lm.temperature_c >= 70 THEN 'critical'
              WHEN lm.hf_accel_x_rms >= 1.5 OR lm.vel_y_rms >= 2.8
                OR lm.kurtosis_y >= 5.0 OR lm.temperature_c >= 60 THEN 'warning'
              ELSE 'normal'
            END
          ) AS severity,
          lm.vel_y_rms::float,
          lm.temperature_c::float,
          d.fault_type
        FROM motor_pins mp
        JOIN motors m ON m.id = mp.motor_id
        LEFT JOIN sensors s ON s.motor_id = m.id AND s.status = 'active'
        LEFT JOIN LATERAL (
          SELECT vel_y_rms, temperature_c, kurtosis_y, hf_accel_x_rms
          FROM measurements WHERE sensor_id = s.id ORDER BY time DESC LIMIT 1
        ) lm ON true
        LEFT JOIN LATERAL (
          SELECT severity, fault_type
          FROM diagnosis_results WHERE motor_id = m.id ORDER BY diagnosed_at DESC LIMIT 1
        ) d ON true
        WHERE mp.floor_plan_id = $1
        ORDER BY mp.page, mp.id
      `, [fp.id])

      return NextResponse.json({ ok: true, floorPlan: fp, pins })
    }

    // 2. 전체 목록 조회 (ID 없을 때)
    const list = await query<{
      id: number; name: string; file_name: string; page_count: number; created_at: string;
      critical_count: number; warning_count: number;
    }>(`
      SELECT 
        fp.id, fp.name, fp.file_name, fp.page_count, fp.created_at,
        COUNT(CASE WHEN status.severity = 'critical' THEN 1 END)::int as critical_count,
        COUNT(CASE WHEN status.severity = 'warning' THEN 1 END)::int as warning_count
      FROM floor_plans fp
      LEFT JOIN (
        SELECT 
          mp.floor_plan_id,
          COALESCE(d.severity,
            CASE
              WHEN lm.hf_accel_x_rms >= 3.0 OR lm.vel_y_rms >= 7.1
                OR lm.kurtosis_y >= 8.0 OR lm.temperature_c >= 70 THEN 'critical'
              WHEN lm.hf_accel_x_rms >= 1.5 OR lm.vel_y_rms >= 2.8
                OR lm.kurtosis_y >= 5.0 OR lm.temperature_c >= 60 THEN 'warning'
              ELSE 'normal'
            END
          ) AS severity
        FROM motor_pins mp
        JOIN motors m ON m.id = mp.motor_id
        LEFT JOIN sensors s ON s.motor_id = m.id AND s.status = 'active'
        LEFT JOIN LATERAL (
          SELECT vel_y_rms, temperature_c, kurtosis_y, hf_accel_x_rms
          FROM measurements WHERE sensor_id = s.id ORDER BY time DESC LIMIT 1
        ) lm ON true
        LEFT JOIN LATERAL (
          SELECT severity
          FROM diagnosis_results WHERE motor_id = m.id ORDER BY diagnosed_at DESC LIMIT 1
        ) d ON true
      ) status ON fp.id = status.floor_plan_id
      GROUP BY fp.id, fp.name, fp.file_name, fp.page_count, fp.created_at
      ORDER BY fp.created_at DESC
    `)

    return NextResponse.json({ ok: true, list })

  } catch (err) {
    console.error('[GET /api/floor-plan]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// ── POST ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const name = (form.get('name') as string | null)?.trim()
    const file = form.get('file') as File | null
    const pageCount = parseInt((form.get('page_count') as string | null) ?? '1', 10)

    if (!name) return NextResponse.json({ ok: false, error: '도면 이름을 입력하세요.' }, { status: 400 })
    if (!file) return NextResponse.json({ ok: false, error: '파일을 첨부하세요.' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const allowed = ['pdf', 'jpg', 'jpeg', 'png', 'webp']
    if (!allowed.includes(ext)) {
      return NextResponse.json({ ok: false, error: 'PDF 또는 이미지 파일(JPG, PNG, WebP)만 업로드 가능합니다.' }, { status: 400 })
    }

    await ensureDir()

    const fileName = `${randomUUID()}.${ext}`
    const filePath = path.join(FLOOR_PLANS_DIR, fileName)
    const buf = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(buf))

    const row = await queryOne<{ id: number }>(
      `INSERT INTO floor_plans (name, file_path, file_name, page_count)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [name, filePath, file.name, pageCount]
    )

    return NextResponse.json({ ok: true, id: row!.id })
  } catch (err) {
    console.error('[POST /api/floor-plan]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// ── DELETE ────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '', 10)
  if (isNaN(id)) return NextResponse.json({ ok: false, error: '유효하지 않은 ID' }, { status: 400 })

  try {
    const row = await queryOne<{ file_path: string }>(
      `SELECT file_path FROM floor_plans WHERE id = $1`, [id]
    )
    if (!row) return NextResponse.json({ ok: false, error: '도면을 찾을 수 없습니다.' }, { status: 404 })

    if (existsSync(row.file_path)) await unlink(row.file_path)
    await query(`DELETE FROM floor_plans WHERE id = $1`, [id])

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
