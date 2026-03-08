import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

// GET /api/diagnosis
// 모터별 최신 AI 진단 결과 1건씩 반환
export async function GET() {
  try {
    const rows = await query(`
      SELECT DISTINCT ON (d.motor_id)
        d.id,
        d.motor_id,
        d.diagnosed_at,
        d.fault_type,
        d.confidence,
        d.severity,
        d.rul_days,
        m.name  AS motor_name,
        m.location
      FROM diagnosis_results d
      JOIN motors m ON m.id = d.motor_id
      ORDER BY d.motor_id, d.diagnosed_at DESC
    `)
    return NextResponse.json({ data: rows })
  } catch (err) {
    console.error('[GET /api/diagnosis]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
