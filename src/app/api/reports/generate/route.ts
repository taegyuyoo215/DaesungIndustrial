/**
 * POST /api/reports/generate
 * Body: { template_id: number }
 *
 * 선택한 템플릿에 DB 데이터를 주입해 완성된 파일을 반환합니다.
 *
 * ── Excel 템플릿 규칙 ────────────────────────────────────────
 * • 단일값: 셀에 {{key}} 형식으로 작성
 * • 반복행: 어느 셀이든 {{motors.name}}, {{motors.location}} 등이 포함된 행을
 *           자동 감지 → 모터 수만큼 행 복제 후 데이터 채움
 *   (alarms.xxx, maintenance.xxx 동일)
 *
 * ── Word 템플릿 규칙 (docxtemplater) ─────────────────────────
 * • 단일값: {key}
 * • 반복: {#motors}...{/motors}, {#alarms}...{/alarms} 등
 * • 사용 가능한 키는 src/lib/reportData.ts 참조
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/db'
import { buildReportData, ReportData } from '@/lib/reportData'
import { readFile } from 'fs/promises'
import ExcelJS from 'exceljs'
import PizZip from 'pizzip'
import Docxtemplater from 'docxtemplater'

// ── Excel 생성 ────────────────────────────────────────────────

type CellVal = string | number | boolean | null | undefined

// 단순 {{key}} 치환
function replaceSingle(text: string, flat: Record<string, CellVal>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const val = flat[key.trim()]
    return val != null ? String(val) : `{{${key}}}`
  })
}

// 반복 컬렉션 감지: 셀에 {{motors.xxx}} 형태가 있으면 해당 컬렉션 반환
function detectCollection(row: ExcelJS.Row): string | null {
  let found: string | null = null
  row.eachCell({ includeEmpty: false }, (cell) => {
    if (found) return
    const v = typeof cell.value === 'string' ? cell.value : ''
    const m = v.match(/\{\{(motors|alarms|maintenance)\./)
    if (m) found = m[1]
  })
  return found
}

// 컬렉션 아이템 하나에 대해 row 템플릿을 채워 배열로 반환
function fillRow(
  templates: CellVal[],
  item: Record<string, CellVal>,
  collectionKey: string,
): CellVal[] {
  return templates.map((tpl) => {
    if (typeof tpl !== 'string') return tpl
    return tpl.replace(/\{\{[^.]+\.([^}]+)\}\}/g, (_, field) => {
      const val = item[field.trim()]
      return val != null ? String(val) : ''
    }).replace(/\{\{([^}]+)\}\}/g, (_, key) => {
      // 컬렉션 필드 직접 참조 fallback
      const val = item[key.trim()]
      return val != null ? String(val) : ''
    })
  })
}

async function generateExcel(filePath: string, data: ReportData): Promise<Buffer> {
  const buf = await readFile(filePath)
  const workbook = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buf as any)

  // 단일값 평탄화
  const flat: Record<string, CellVal> = {
    report_date:          data.report_date,
    report_title:         data.report_title,
    motor_count_total:    data.motor_count_total,
    motor_count_normal:   data.motor_count_normal,
    motor_count_warning:  data.motor_count_warning,
    motor_count_critical: data.motor_count_critical,
    alarm_count_total:    data.alarm_count_total,
    alarm_count_active:   data.alarm_count_active,
    alarm_count_resolved: data.alarm_count_resolved,
    alarm_count_critical: data.alarm_count_critical,
    alarm_count_warning:  data.alarm_count_warning,
    maintenance_count:    data.maintenance_count,
  }

  const collections: Record<string, Record<string, CellVal>[]> = {
    motors:      data.motors      as unknown as Record<string, CellVal>[],
    alarms:      data.alarms      as unknown as Record<string, CellVal>[],
    maintenance: data.maintenance as unknown as Record<string, CellVal>[],
  }

  workbook.eachSheet((sheet) => {
    // ── Pass 1: 반복행 확장 ────────────────────────────────
    // 반복행 위치를 역순으로 처리해 행 번호 밀림 방지
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const templateRows: Array<{
      rowNumber: number
      collection: string
      templates: CellVal[]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      styles: any[]
    }> = []

    sheet.eachRow((row, rowNumber) => {
      const col = detectCollection(row)
      if (!col) return
      const templates: CellVal[] = []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const styles: any[] = []
      row.eachCell({ includeEmpty: true }, (cell) => {
        templates.push(typeof cell.value === 'string' ? cell.value : cell.value as CellVal)
        styles.push(cell.style)
      })
      templateRows.push({ rowNumber, collection: col, templates, styles })
    })

    for (const { rowNumber, collection, templates, styles } of templateRows.reverse()) {
      const items = collections[collection] ?? []
      // 템플릿 행 삭제
      sheet.spliceRows(rowNumber, 1)
      // 데이터 행 삽입
      const newRows = items.map(item => fillRow(templates, item, collection))
      if (newRows.length > 0) {
        sheet.spliceRows(rowNumber, 0, ...newRows)
        // 폰트/정렬 스타일 복원 (numFmt 등 undefined 필드 제외)
        for (let i = 0; i < newRows.length; i++) {
          const insertedRow = sheet.getRow(rowNumber + i)
          insertedRow.eachCell({ includeEmpty: true }, (cell, colNum) => {
            const style = styles[colNum - 1]
            if (!style) return
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (style.font)      cell.font      = style.font as any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (style.alignment) cell.alignment = style.alignment as any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (style.fill)      cell.fill      = style.fill as any
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (style.border)    cell.border    = style.border as any
          })
        }
      }
    }

    // ── Pass 2: 단일값 치환 ────────────────────────────────
    sheet.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === 'string' && cell.value.includes('{{')) {
          cell.value = replaceSingle(cell.value, flat)
        }
      })
    })
  })

  const outBuf = await workbook.xlsx.writeBuffer() as ArrayBuffer
  return Buffer.from(outBuf)
}

// ── Word 생성 ─────────────────────────────────────────────────

async function generateDocx(filePath: string, data: ReportData): Promise<Buffer> {
  const content = await readFile(filePath, 'binary')
  const zip = new PizZip(content)

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks:    true,
  })

  doc.render(data)

  return doc.getZip().generate({ type: 'nodebuffer' }) as Buffer
}

// ── POST /api/reports/generate ────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { template_id } = await req.json() as { template_id: number }

    if (!template_id) {
      return NextResponse.json({ ok: false, error: 'template_id가 필요합니다.' }, { status: 400 })
    }

    const tpl = await queryOne<{
      name: string; file_type: string; file_name: string; file_path: string
    }>(
      `SELECT name, file_type, file_name, file_path FROM report_templates WHERE id = $1`,
      [template_id]
    )
    if (!tpl) {
      return NextResponse.json({ ok: false, error: '템플릿을 찾을 수 없습니다.' }, { status: 404 })
    }

    const reportData = await buildReportData()

    let fileBuffer: Buffer
    let mimeType:   string
    let outputName: string

    const date = new Date().toISOString().slice(0, 10)

    if (tpl.file_type === 'xlsx') {
      fileBuffer = await generateExcel(tpl.file_path, reportData)
      mimeType   = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      outputName = `보고서_${date}.xlsx`
    } else {
      fileBuffer = await generateDocx(tpl.file_path, reportData)
      mimeType   = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      outputName = `보고서_${date}.docx`
    }

    return new Response(fileBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type':        mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(outputName)}`,
      },
    })
  } catch (err) {
    console.error('[POST /api/reports/generate]', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
