import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

// ── 타입 ──────────────────────────────────────────────────

interface DiagRow {
  motor_id: number
  motor_name: string
  location: string | null
  fault_type: string | null
  confidence: string | null
  severity: string | null
  rul_days: number | null
  diagnosed_at: string
}

interface AlarmRow {
  motor_name: string
  motor_id: number
  severity: string
  message: string | null
}

// ── GET /api/ai-report ────────────────────────────────────
// 외부 AI API 없이 diagnosis_results + alarms DB 데이터만으로 종합 리포트 생성

export async function GET() {
  try {
    const [diags, alarms] = await Promise.all([
      // 모터별 최신 진단 결과 1건씩
      query<DiagRow>(`
        SELECT DISTINCT ON (d.motor_id)
          d.motor_id,
          m.name       AS motor_name,
          m.location,
          d.fault_type,
          d.confidence,
          d.severity,
          d.rul_days,
          d.diagnosed_at
        FROM diagnosis_results d
        JOIN motors m ON m.id = d.motor_id
        ORDER BY d.motor_id, d.diagnosed_at DESC
      `),
      // 활성 알람 전체
      query<AlarmRow>(`
        SELECT m.name AS motor_name, m.id AS motor_id, a.severity, a.message
        FROM alarms a
        JOIN motors m ON m.id = a.motor_id
        WHERE a.state = 'active'
        ORDER BY a.triggered_at DESC
        LIMIT 30
      `),
    ])

    // ── 분류 ──────────────────────────────────────────────

    const criticalDiags = diags.filter(d => d.severity === 'critical')
    const warningDiags  = diags.filter(d => d.severity === 'warning')
    const normalCount   = diags.filter(d => !d.severity || d.severity === 'normal').length

    // 알람 수 by motor_id
    const alarmCountMap = alarms.reduce<Record<number, number>>((acc, a) => {
      acc[a.motor_id] = (acc[a.motor_id] ?? 0) + 1
      return acc
    }, {})

    // ── 건강도 점수 (0~100) ───────────────────────────────
    const total = diags.length || 1
    const healthScore = Math.round(
      (normalCount * 100 + warningDiags.length * 50 + criticalDiags.length * 0) / total
    )

    // ── 요약 문구 ─────────────────────────────────────────
    const parts: string[] = []
    if (criticalDiags.length > 0) parts.push(`${criticalDiags.length}대 즉시 조치 필요`)
    if (warningDiags.length > 0)  parts.push(`${warningDiags.length}대 주의 관찰`)
    if (alarms.length > 0)        parts.push(`활성 알람 ${alarms.length}건`)
    const summary = parts.length > 0
      ? parts.join(' · ')
      : `전체 ${diags.length}대 설비 정상 운전 중`

    return NextResponse.json({
      health_score: healthScore,
      summary,
      critical: criticalDiags.map(d => ({
        motor_name: d.motor_name,
        location:   d.location,
        fault_type: d.fault_type,
        confidence: d.confidence != null ? Math.round(Number(d.confidence)) : null,
        rul_days:   d.rul_days,
        alarms:     alarmCountMap[d.motor_id] ?? 0,
      })),
      warning: warningDiags.map(d => ({
        motor_name: d.motor_name,
        location:   d.location,
        fault_type: d.fault_type,
        confidence: d.confidence != null ? Math.round(Number(d.confidence)) : null,
        rul_days:   d.rul_days,
      })),
      total_motors:  diags.length,
      active_alarms: alarms.length,
      generated_at:  new Date().toISOString(),
    })
  } catch (err) {
    console.error('[GET /api/ai-report]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
