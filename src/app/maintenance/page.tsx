'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { fetcher } from '@/lib/fetcher'
import type { MaintenanceLog, MotorStatus, ApiResponse } from '@/types'

// ── 상수 ─────────────────────────────────────────────────

const WORK_TYPES = ['베어링 교체', '오정렬 수정', '윤활 보충', '정기 점검', '부품 교체', '기타']

const workTypeColors: Record<string, string> = {
  '베어링 교체': 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200',
  '오정렬 수정': 'bg-orange-50 text-orange-700 border-orange-200',
  '윤활 보충':   'bg-blue-50 text-blue-700 border-blue-200',
  '정기 점검':   'bg-slate-50 dark:bg-[#0a0f1e] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800',
  '부품 교체':   'bg-purple-50 text-purple-700 border-purple-200',
}

function WorkTypeBadge({ type }: { type: string }) {
  const style = workTypeColors[type] ?? 'bg-slate-50 dark:bg-[#0a0f1e] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800'
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${style}`}>
      {type}
    </span>
  )
}

// ── 정비 기록 추가 모달 ───────────────────────────────────

interface AddModalProps {
  motors: MotorStatus[]
  onClose: () => void
  onSaved: () => void
}

interface PartRow { name: string; qty: number }

function AddMaintenanceModal({ motors, onClose, onSaved }: AddModalProps) {
  const [motorId,     setMotorId]     = useState('')
  const [workType,    setWorkType]    = useState(WORK_TYPES[0])
  const [description, setDescription] = useState('')
  const [performedAt, setPerformedAt] = useState(() => new Date().toISOString().slice(0, 16))
  const [nextDueAt,   setNextDueAt]   = useState('')
  const [parts,       setParts]       = useState<PartRow[]>([])
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState('')

  function addPart()   { setParts(p => [...p, { name: '', qty: 1 }]) }
  function removePart(i: number) { setParts(p => p.filter((_, idx) => idx !== i)) }
  function updatePart(i: number, field: keyof PartRow, val: string | number) {
    setParts(p => p.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
  }

  async function handleSubmit() {
    if (!motorId) { setError('모터를 선택해주세요'); return }
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        motor_id:       Number(motorId),
        work_type:      workType,
        description:    description || null,
        parts_replaced: parts.filter(p => p.name.trim()).length > 0
          ? parts.filter(p => p.name.trim())
          : null,
        performed_at:   new Date(performedAt).toISOString(),
        next_due_at:    nextDueAt ? new Date(nextDueAt).toISOString() : null,
      }),
    })

    setSubmitting(false)
    if (res.ok) {
      onSaved()
    } else {
      const data = await res.json()
      setError(data.error ?? '저장 실패')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* 모달 헤더 */}
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">정비 기록 추가</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 text-xl leading-none">×</button>
        </div>

        {/* 모달 본문 */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* 모터 선택 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">대상 모터 *</label>
            <select
              value={motorId}
              onChange={e => setMotorId(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
            >
              <option value="">모터 선택...</option>
              {motors.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.location})</option>
              ))}
            </select>
          </div>

          {/* 작업 유형 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">작업 유형 *</label>
            <div className="flex flex-wrap gap-2">
              {WORK_TYPES.map(type => (
                <button
                  key={type}
                  onClick={() => setWorkType(type)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    workType === type
                      ? (workTypeColors[type] ?? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100')
                      : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/30'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">정비 내용</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="정비 내용을 상세히 입력해주세요..."
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700 resize-none"
            />
          </div>

          {/* 정비 일시 / 다음 예정일 */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">정비 일시 *</label>
              <input
                type="datetime-local"
                value={performedAt}
                onChange={e => setPerformedAt(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">다음 정비 예정일</label>
              <input
                type="datetime-local"
                value={nextDueAt}
                onChange={e => setNextDueAt(e.target.value)}
                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
              />
            </div>
          </div>

          {/* 교체 부품 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-500">교체 부품</label>
              <button
                onClick={addPart}
                className="text-xs text-blue-600 hover:underline"
              >
                + 추가
              </button>
            </div>
            {parts.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-600 py-2">교체 부품이 없으면 비워두세요.</p>
            ) : (
              <div className="space-y-2">
                {parts.map((part, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={part.name}
                      onChange={e => updatePart(i, 'name', e.target.value)}
                      placeholder="부품명 (예: 6206 베어링)"
                      className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
                    />
                    <input
                      type="number"
                      value={part.qty}
                      min={1}
                      onChange={e => updatePart(i, 'qty', Number(e.target.value))}
                      className="w-16 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
                    />
                    <button
                      onClick={() => removePart(i)}
                      className="text-slate-400 hover:text-red-500 text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* 모달 푸터 */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800/60 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            취소
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {submitting ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 정비 이력 페이지 ──────────────────────────────────────

export default function MaintenancePage() {
  const [page, setPage]         = useState(1)
  const [showModal, setShowModal] = useState(false)
  const LIMIT = 20

  const { data, isLoading, mutate } =
    useSWR<ApiResponse<MaintenanceLog[]>>(
      `/api/maintenance?page=${page}&limit=${LIMIT}`,
      fetcher
    )

  const { data: motorRes } =
    useSWR<ApiResponse<MotorStatus[]>>('/api/motors', fetcher)

  const logs       = data?.data ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.ceil(total / LIMIT)
  const motors     = motorRes?.data ?? []

  function handleSaved() {
    setShowModal(false)
    mutate()
  }

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {showModal && (
        <AddMaintenanceModal
          motors={motors}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">정비 이력</h1>
          <p className="text-sm text-slate-500 mt-1">총 {total}건</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + 정비 기록 추가
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-200 dark:border-slate-800">
              {['정비 일시', '모터', '유형', '내용', '담당자', '다음 예정', ''].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-sm">불러오는 중...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-sm">정비 이력이 없습니다</td></tr>
            ) : (
              logs.map(log => (
                <tr key={log.id} className="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-4 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                    {new Date(log.performed_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-5 py-4">
                    <Link href={`/motors/${log.motor_id}`} className="text-sm font-semibold text-slate-800 dark:text-slate-200 hover:underline">
                      {log.motor_name}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <WorkTypeBadge type={log.work_type} />
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">{log.description ?? '—'}</p>
                    {log.parts_replaced && log.parts_replaced.length > 0 && (
                      <p className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">
                        교체: {log.parts_replaced.map(p => `${p.name} ×${p.qty}`).join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-400">
                    {log.performed_by_name ?? '—'}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {log.next_due_at
                      ? new Date(log.next_due_at).toLocaleDateString('ko-KR')
                      : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <Link href={`/motors/${log.motor_id}`} className="text-xs text-slate-500 hover:underline">
                      상세
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
          <p className="text-xs text-slate-400">총 {total}건</p>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(p => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={`w-8 h-8 text-sm rounded-lg ${
                  p === page ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >{p}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
