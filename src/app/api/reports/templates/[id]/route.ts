/**
 * DELETE /api/reports/templates/[id]  — 템플릿 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import { unlink } from 'fs/promises'
import { existsSync } from 'fs'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const templateId = parseInt(id, 10)

  if (isNaN(templateId)) {
    return NextResponse.json({ ok: false, error: '유효하지 않은 ID입니다.' }, { status: 400 })
  }

  try {
    const row = await queryOne<{ file_path: string }>(
      `SELECT file_path FROM report_templates WHERE id = $1`,
      [templateId]
    )
    if (!row) {
      return NextResponse.json({ ok: false, error: '템플릿을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 파일 삭제
    if (existsSync(row.file_path)) {
      await unlink(row.file_path)
    }

    // DB 삭제
    await query(`DELETE FROM report_templates WHERE id = $1`, [templateId])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[DELETE /api/reports/templates]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
