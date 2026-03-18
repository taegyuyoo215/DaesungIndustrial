import { NextResponse } from 'next/server'
import { runAutoDiagnosisAll } from '@/lib/autodiagnosis'

// POST /api/diagnosis/auto
// 모든 활성 모터의 최신 측정값을 검사하여 진단 결과 + 알람 자동 생성
export async function POST() {
  try {
    const count = await runAutoDiagnosisAll()
    return NextResponse.json({ ok: true, processed: count })
  } catch (err) {
    console.error('[POST /api/diagnosis/auto]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
