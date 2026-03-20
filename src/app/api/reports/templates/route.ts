/**
 * GET  /api/reports/templates        — 템플릿 목록 조회
 * POST /api/reports/templates        — 템플릿 업로드 (multipart/form-data)
 *   fields: name (string), file (xlsx | docx)
 */

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const TEMPLATES_DIR = path.join(process.cwd(), 'report-templates')

async function ensureDir() {
  if (!existsSync(TEMPLATES_DIR)) await mkdir(TEMPLATES_DIR, { recursive: true })
}

// ── GET ───────────────────────────────────────────────────────

export async function GET() {
  try {
    const rows = await query<{
      id: number; name: string; file_type: string
      file_name: string; file_size: number | null; created_at: string
    }>(`SELECT id, name, file_type, file_name, file_size, created_at
        FROM report_templates ORDER BY created_at DESC`)

    return NextResponse.json({ ok: true, templates: rows })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}

// ── POST ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const name = (form.get('name') as string | null)?.trim()
    const file = form.get('file') as File | null

    if (!name) {
      return NextResponse.json({ ok: false, error: '템플릿 이름을 입력하세요.' }, { status: 400 })
    }
    if (!file) {
      return NextResponse.json({ ok: false, error: '파일을 첨부하세요.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'docx'].includes(ext ?? '')) {
      return NextResponse.json(
        { ok: false, error: '.xlsx 또는 .docx 파일만 업로드 가능합니다.' },
        { status: 400 }
      )
    }

    await ensureDir()

    const fileName  = `${randomUUID()}.${ext}`
    const filePath  = path.join(TEMPLATES_DIR, fileName)
    const arrayBuf  = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(arrayBuf))

    const rows = await query<{ id: number }>(`
      INSERT INTO report_templates (name, file_type, file_name, file_path, file_size)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [name, ext, file.name, filePath, file.size])

    return NextResponse.json({ ok: true, id: rows[0].id })
  } catch (err) {
    console.error('[POST /api/reports/templates]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
