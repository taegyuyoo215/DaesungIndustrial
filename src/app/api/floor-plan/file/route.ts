/**
 * GET /api/floor-plan/file?id=1  — PDF 파일 스트리밍
 * react-pdf가 직접 URL로 접근할 수 있도록 제공
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'

export async function GET(req: NextRequest) {
  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '', 10)
  if (isNaN(id)) return NextResponse.json({ ok: false, error: '유효하지 않은 ID' }, { status: 400 })

  try {
    const row = await queryOne<{ file_path: string; file_name: string }>(
      `SELECT file_path, file_name FROM floor_plans WHERE id = $1`, [id]
    )
    if (!row) return NextResponse.json({ ok: false, error: '도면을 찾을 수 없습니다.' }, { status: 404 })
    if (!existsSync(row.file_path)) return NextResponse.json({ ok: false, error: '파일이 없습니다.' }, { status: 404 })

    const buf = await readFile(row.file_path)
    const ext = row.file_path.split('.').pop()?.toLowerCase()
    
    let contentType = 'application/pdf'
    if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg'
    else if (ext === 'png') contentType = 'image/png'
    else if (ext === 'webp') contentType = 'image/webp'

    return new Response(buf, {
      headers: {
        'Content-Type':        contentType,
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.file_name)}`,
        'Cache-Control':       'private, max-age=3600',
      },
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
