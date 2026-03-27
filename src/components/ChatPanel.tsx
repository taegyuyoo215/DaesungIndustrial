'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

// ── 타입 ──────────────────────────────────────────────────
interface Message {
  id:      string
  role:    'user' | 'assistant'
  content: string
  loading?: boolean
}

// ── 빠른 질문 칩 ──────────────────────────────────────────
const QUICK_QUESTIONS = [
  '지금 가장 위험한 모터가 뭐야?',
  '정비가 임박한 설비 알려줘',
  '활성 알람 현황 요약해줘',
  '전체 모터 상태 요약해줘',
]

// ── 마크다운 간이 렌더 (볼드, 리스트) ─────────────────────
function renderMarkdown(text: string) {
  return text
    .split('\n')
    .map((line, i) => {
      // ## 헤딩
      if (line.startsWith('## ')) {
        return (
          <p key={i} className="font-semibold text-slate-200 mt-2 mb-0.5 text-xs">
            {line.slice(3)}
          </p>
        )
      }
      // - 리스트
      if (line.startsWith('- ')) {
        return (
          <p key={i} className="pl-2 text-xs leading-relaxed">
            <span className="text-slate-500 mr-1">•</span>
            {renderInline(line.slice(2))}
          </p>
        )
      }
      // 빈 줄
      if (line.trim() === '') return <div key={i} className="h-1" />
      // 일반 텍스트
      return <p key={i} className="text-xs leading-relaxed">{renderInline(line)}</p>
    })
}

function renderInline(text: string) {
  // **bold**
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-semibold text-slate-100">{part.slice(2, -2)}</strong>
      : <span key={i}>{part}</span>
  )
}

// ── ChatPanel ─────────────────────────────────────────────
export default function ChatPanel() {
  const [open, setOpen]       = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      id:      'welcome',
      role:    'assistant',
      content: '안녕하세요! MOTOR-IQ 어시스턴트입니다.\n설비 상태, 알람, 정비 일정 등 무엇이든 질문해 주세요.',
    },
  ])
  const [input, setInput]     = useState('')
  const [loading, setLoading] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 }) 

  const isDraggingRef = useRef(false)
  const movedRef = useRef(false) // 실제 이동 발생 여부
  const dragStartRef = useRef({ x: 0, y: 0 })
  const lastPosRef = useRef({ x: 0, y: 0 })
  const mouseDownStartPosRef = useRef({ x: 0, y: 0 }) // 초기 클릭 위치
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelWrapperRef = useRef<HTMLDivElement>(null)

  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLTextAreaElement>(null)

  // 새 메시지 오면 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // 보관된 위치 동기화
  useEffect(() => {
    lastPosRef.current = position
  }, [position])

  // 패널 열릴 때 input 포커스
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open])

  const sendMessage = useCallback(async (text: string) => {
    const userText = text.trim()
    if (!userText || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText }
    const assistantId = (Date.now() + 1).toString()
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', loading: true }

    setMessages(prev => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)

    try {
      // 대화 히스토리 (최근 10턴)
      const history = [...messages, userMsg]
        .filter(m => !m.loading)
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ messages: history }),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      // SSE 스트리밍 처리
      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let   accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: parsed.error, loading: false }
                    : m
                )
              )
              break
            }
            accumulated += parsed.text ?? ''
            setMessages(prev =>
              prev.map(m =>
                m.id === assistantId
                  ? { ...m, content: accumulated, loading: false }
                  : m
              )
            )
          } catch { /* JSON parse 오류 무시 */ }
        }
      }
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: '죄송합니다, 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', loading: false }
            : m
        )
      )
    } finally {
      setLoading(false)
    }
  }, [messages, loading])

  const handleMouseDown = (e: React.MouseEvent) => {
    // textarea, input, 그리고 헤더 내부의 클릭 가능한 요소들(닫기 버튼 등) 클릭 시에는 드래그 방지
    if ((e.target as HTMLElement).closest('textarea, input, button:not(#ai-chat-main-button)')) {
      if (!(e.target as HTMLElement).closest('.drag-handle')) return
    }
    
    isDraggingRef.current = true
    movedRef.current = false
    dragStartRef.current = { x: e.clientX - lastPosRef.current.x, y: e.clientY - lastPosRef.current.y }
    mouseDownStartPosRef.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  useEffect(() => {
    let animationFrameId: number

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return

      const move = () => {
        const x = e.clientX - dragStartRef.current.x
        const y = e.clientY - dragStartRef.current.y
        lastPosRef.current = { x, y }
        
        // 이동 거리 임계값 체크 (5px 이상 움직이면 드래그로 간주)
        if (Math.abs(e.clientX - mouseDownStartPosRef.current.x) > 5 || Math.abs(e.clientY - mouseDownStartPosRef.current.y) > 5) {
          movedRef.current = true
        }

        if (buttonRef.current) {
          buttonRef.current.style.transform = `translate(${x}px, ${y}px)`
        }
        if (panelWrapperRef.current) {
          panelWrapperRef.current.style.transform = `translate(${x}px, ${y}px)`
        }
      }

      cancelAnimationFrame(animationFrameId)
      animationFrameId = requestAnimationFrame(move)
    }

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        setPosition({ ...lastPosRef.current })
        isDraggingRef.current = false
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <>
      {/* 플로팅 버튼 */}
      <button
        ref={buttonRef}
        id="ai-chat-main-button"
        className={`fixed bottom-6 right-6 w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-[background-color,opacity,box-shadow,transform] duration-300 cursor-grab active:cursor-grabbing ${
          open
            ? 'bg-slate-700 dark:bg-slate-600 text-slate-300 opacity-100'
            : 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-cyan-500/30 opacity-40 hover:opacity-100'
        }`}
        style={{ transform: `translate(${position.x}px, ${position.y}px)`, zIndex: 9999 }}
        onMouseDown={handleMouseDown}
        onClick={() => {
          // 실제로 이동하지 않았을 때만(단순 클릭) 토글
          if (!movedRef.current) {
            setOpen(o => !o)
          }
        }}
        title="드래그하여 이동 / 클릭하여 열기"
      >
        {open ? (
          // ✕
          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
          </svg>
        ) : (
          // 채팅 아이콘
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        )}
      </button>

      <div 
        ref={panelWrapperRef}
        onMouseDown={handleMouseDown}
        className={`fixed bottom-22 right-6 w-80 sm:w-96 transition-[opacity,scale] duration-300 origin-bottom-right cursor-default ${
          open ? 'scale-100 opacity-100 pointer-events-auto' : 'scale-95 opacity-0 pointer-events-none'
        }`}
        style={{ transform: `translate(${position.x}px, ${position.y}px)`, zIndex: 9999 }}
      >
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-slate-900/60 flex flex-col overflow-hidden"
          style={{ height: '520px' }}
        >

          {/* 헤더 (드래그 핸들 역할) */}
          <div 
            onMouseDown={handleMouseDown}
            className="drag-handle flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-200 dark:border-slate-800 shrink-0 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-xs font-bold">
                AI
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">MOTOR-IQ 어시스턴트</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">실시간 설비 데이터 기반 응답</p>
              </div>
            </div>
            
            {/* 나가기 버튼 */}
            <button 
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              title="닫기"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
              </svg>
            </button>
          </div>

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0"
            style={{ scrollbarWidth: 'thin' }}
          >
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  msg.role === 'user'
                    ? 'bg-cyan-500 text-white rounded-br-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-bl-sm'
                }`}>
                  {msg.loading ? (
                    <div className="flex items-center gap-1 py-1 px-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  ) : msg.role === 'user' ? (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="text-xs leading-relaxed">
                      {renderMarkdown(msg.content)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* 빠른 질문 칩 */}
          {messages.length <= 2 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 shrink-0">
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={loading}
                  className="text-[10px] px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-cyan-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors disabled:opacity-40"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* 입력 영역 */}
          <div className="px-3 pb-3 pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0">
            <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2 border border-slate-200 dark:border-slate-700 focus-within:border-cyan-400 transition-colors">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                placeholder="메시지를 입력하세요... (Enter 전송)"
                rows={1}
                className="flex-1 bg-transparent text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 resize-none outline-none leading-relaxed"
                style={{ maxHeight: '80px', overflowY: 'auto' }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="w-7 h-7 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-200 dark:disabled:bg-slate-700 text-white disabled:text-slate-400 flex items-center justify-center transition-colors shrink-0"
              >
                <svg className="w-3.5 h-3.5 rotate-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="19" x2="12" y2="5"/>
                  <polyline points="5 12 12 5 19 12"/>
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1.5 text-center">
              Shift+Enter 줄바꿈 · Enter 전송
            </p>
          </div>

        </div>
      </div>
    </>
  )
}
