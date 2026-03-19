import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { query } from '@/lib/db'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Anthropic 에러 → 사용자 친화적 메시지 변환 ────────────
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)

  if (/credit|billing|balance/i.test(msg))
    return '💳 크레딧이 부족합니다. Anthropic 콘솔(console.anthropic.com) → Plans & Billing에서 충전 후 이용해 주세요.'
  if (/authentication|api.?key|invalid.*key/i.test(msg))
    return '🔑 API 키가 올바르지 않습니다. .env.local의 ANTHROPIC_API_KEY를 확인해 주세요.'
  if (/rate.?limit|too.?many/i.test(msg))
    return '⏱️ 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  if (/overload|capacity/i.test(msg))
    return '🔧 AI 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해 주세요.'
  if (/network|fetch|connect/i.test(msg))
    return '🌐 네트워크 연결을 확인해 주세요.'

  return `⚠️ AI 서비스 오류가 발생했습니다. (${msg})`
}

// ── 메시지 타입 ────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// ── 키워드 기반 컨텍스트 분류 ──────────────────────────────
function needsContext(msg: string) {
  return {
    alarms:      /알람|경보|이상|위험|critical|warning/.test(msg),
    maintenance: /정비|교체|수리|작업|maintenance/.test(msg),
    diagnosis:   /진단|결함|fault|베어링|불평형|오정렬|풀림|과열/.test(msg),
    measurements:/측정|추이|트렌드|온도|진동|velocity|kurtosis/.test(msg),
  }
}

// ── DB 컨텍스트 조회 ───────────────────────────────────────
async function buildContext(userMsg: string): Promise<string> {
  const need = needsContext(userMsg)
  const parts: string[] = []

  // 1. 항상: 모터 전체 상태 요약
  const motors = await query<{
    name: string; location: string; severity: string
    vel_y_rms: number | null; temperature_c: number | null
    kurtosis_y: number | null; last_measured_at: string | null
    motor_running: boolean | null
  }>(`
    SELECT
      m.name, m.location,
      lm.vel_y_rms, lm.temperature_c, lm.kurtosis_y,
      lm.time AS last_measured_at, lm.motor_running,
      CASE
        WHEN lm.hf_accel_x_rms >= 3.0 OR lm.vel_y_rms >= 7.1 OR lm.kurtosis_y >= 8.0 OR lm.temperature_c >= 70 THEN 'critical'
        WHEN lm.hf_accel_x_rms >= 1.5 OR lm.vel_y_rms >= 2.8 OR lm.kurtosis_y >= 5.0 OR lm.temperature_c >= 60 THEN 'warning'
        ELSE 'normal'
      END AS severity
    FROM motors m
    LEFT JOIN sensors s ON s.motor_id = m.id AND s.status = 'active'
    LEFT JOIN LATERAL (
      SELECT vel_y_rms, temperature_c, kurtosis_y, hf_accel_x_rms, time, motor_running
      FROM measurements WHERE sensor_id = s.id ORDER BY time DESC LIMIT 1
    ) lm ON true
    ORDER BY m.id
  `)

  const severityKo = (s: string) => s === 'critical' ? '🔴 위험' : s === 'warning' ? '🟡 주의' : '🟢 정상'
  parts.push('## 모터 현황\n' + motors.map(m =>
    `- ${m.name} (${m.location ?? '-'}): ${severityKo(m.severity)}` +
    (m.vel_y_rms    != null ? `, 진동 ${Number(m.vel_y_rms).toFixed(2)} mm/s`   : '') +
    (m.temperature_c != null ? `, 온도 ${Number(m.temperature_c).toFixed(1)}°C` : '') +
    (m.kurtosis_y   != null ? `, Kurtosis ${Number(m.kurtosis_y).toFixed(2)}`   : '') +
    (m.motor_running === false ? ' [정지중]' : '')
  ).join('\n'))

  // 2. 최신 AI 진단 결과
  if (need.diagnosis || need.alarms) {
    const diags = await query<{
      motor_name: string; fault_type: string | null
      severity: string; confidence: number | null; rul_days: number | null; diagnosed_at: string
    }>(`
      SELECT DISTINCT ON (d.motor_id)
        m.name AS motor_name, d.fault_type, d.severity, d.confidence, d.rul_days, d.diagnosed_at
      FROM diagnosis_results d
      JOIN motors m ON m.id = d.motor_id
      WHERE d.severity IN ('warning','critical')
      ORDER BY d.motor_id, d.diagnosed_at DESC
    `)
    if (diags.length > 0) {
      const faultKo: Record<string, string> = {
        bearing_outer: '베어링 외륜 결함(BPFO)',
        bearing_inner: '베어링 내륜 결함(BPFI)',
        imbalance: '불평형', misalignment: '오정렬',
        looseness: '풀림', overheat: '과열',
      }
      parts.push('\n## AI 진단 결과 (이상 모터)\n' + diags.map(d =>
        `- ${d.motor_name}: ${faultKo[d.fault_type ?? ''] ?? d.fault_type ?? '미확정'}` +
        ` (신뢰도 ${d.confidence ?? '-'}%` +
        (d.rul_days != null ? `, 잔존수명 약 ${d.rul_days}일` : '') + ')'
      ).join('\n'))
    }
  }

  // 3. 활성 알람
  if (need.alarms) {
    const alarms = await query<{
      motor_name: string; severity: string; fault_type: string | null; message: string | null; triggered_at: string
    }>(`
      SELECT m.name AS motor_name, a.severity, a.fault_type, a.message, a.triggered_at
      FROM alarms a
      JOIN motors m ON m.id = a.motor_id
      WHERE a.state IN ('active','acknowledged')
      ORDER BY a.triggered_at DESC
      LIMIT 10
    `)
    if (alarms.length > 0) {
      parts.push('\n## 활성 알람\n' + alarms.map(a =>
        `- [${a.severity === 'critical' ? '위험' : '주의'}] ${a.motor_name}: ${a.message ?? a.fault_type ?? '-'}` +
        ` (${new Date(a.triggered_at).toLocaleDateString('ko-KR')})`
      ).join('\n'))
    }
  }

  // 4. 정비 이력 (최근 5건)
  if (need.maintenance) {
    const logs = await query<{
      motor_name: string; work_type: string; description: string | null; performed_at: string
    }>(`
      SELECT m.name AS motor_name, ml.work_type, ml.description, ml.performed_at
      FROM maintenance_logs ml
      JOIN motors m ON m.id = ml.motor_id
      ORDER BY ml.performed_at DESC
      LIMIT 5
    `)
    if (logs.length > 0) {
      parts.push('\n## 최근 정비 이력\n' + logs.map(l =>
        `- ${l.motor_name}: ${l.work_type}` +
        (l.description ? ` — ${l.description}` : '') +
        ` (${new Date(l.performed_at).toLocaleDateString('ko-KR')})`
      ).join('\n'))
    }
  }

  // 5. 잔존수명 임박 설비 (RUL ≤ 30일)
  if (need.maintenance || need.diagnosis) {
    const urgent = await query<{ motor_name: string; rul_days: number; fault_type: string | null }>(`
      SELECT DISTINCT ON (d.motor_id)
        m.name AS motor_name, d.rul_days, d.fault_type
      FROM diagnosis_results d
      JOIN motors m ON m.id = d.motor_id
      WHERE d.rul_days IS NOT NULL AND d.rul_days <= 30
      ORDER BY d.motor_id, d.diagnosed_at DESC
    `)
    if (urgent.length > 0) {
      parts.push('\n## 정비 임박 설비 (잔존수명 30일 이내)\n' + urgent.map(u =>
        `- ${u.motor_name}: ${u.rul_days}일 이내 (${u.fault_type ?? '-'})`
      ).join('\n'))
    }
  }

  return parts.join('\n')
}

// ── POST /api/chat ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  // API 키 사전 검증
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'your-api-key-here') {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다. .env.local을 확인하세요.' },
      { status: 500 }
    )
  }

  try {
    const { messages }: { messages: ChatMessage[] } = await req.json()
    if (!messages?.length) {
      return NextResponse.json({ error: '메시지가 없습니다' }, { status: 400 })
    }

    const userMsg   = messages[messages.length - 1].content
    const dbContext = await buildContext(userMsg)

    const systemPrompt = `당신은 MOTOR-IQ의 설비 전문가 AI 어시스턴트입니다.
공장 모터의 실시간 센서 데이터, AI 진단 결과, 알람, 정비 이력에 접근할 수 있습니다.
아래 [현재 설비 데이터]를 근거로 정확하고 간결하게 한국어로 답변하세요.

규칙:
- 데이터에 없는 내용은 추측하지 말고 "데이터 없음"으로 답변하세요.
- 수치 인용 시 단위를 포함하세요 (mm/s, °C 등).
- 이상이 있는 모터는 상태(🔴위험/🟡주의)를 함께 표시하세요.
- 정비가 필요하면 구체적인 조치를 제안하세요.
- 답변은 간결하게 작성하되, 중요한 수치는 빠짐없이 포함하세요.

[현재 설비 데이터]
${dbContext}`

    // Anthropic 스트리밍
    const stream = await client.messages.stream({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   messages.map(m => ({ role: m.role, content: m.content })),
    })

    // SSE 스트림 반환
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              const data = JSON.stringify({ text: chunk.delta.text })
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
            }
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        } catch (streamErr) {
          console.error('[chat stream error]', streamErr)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: friendlyError(streamErr) })}\n\n`)
          )
        } finally {
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    })
  } catch (err) {
    console.error('[POST /api/chat]', err)
    return NextResponse.json({ error: friendlyError(err) }, { status: 500 })
  }
}
