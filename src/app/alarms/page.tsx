'use client'

import { useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { fetcher } from '@/lib/fetcher'
import type { Alarm, ApiResponse } from '@/types'

// ── 상수 ──────────────────────────────────────────────────

const severityConfig = {
  critical: { dot: 'bg-red-500 animate-pulse', badge: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200',       label: '경보' },
  warning:  { dot: 'bg-yellow-400',            badge: 'bg-yellow-50 dark:bg-amber-900/20 text-yellow-700 dark:text-amber-400 border-yellow-200', label: '주의' },
} as const

const stateConfig = {
  active:       { label: '활성',   style: 'bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-200'   },
  acknowledged: { label: '확인됨', style: 'bg-blue-50 text-blue-600 border border-blue-200' },
  resolved:     { label: '해결됨', style: 'bg-green-50 dark:bg-emerald-900/20 text-green-600 border border-green-200' },
} as const

// ── 알람 행 ────────────────────────────────────────────────

function AlarmRow({ alarm, onAction }: { alarm: Alarm; onAction: () => void }) {
  const sc = severityConfig[alarm.severity]
  const ac = stateConfig[alarm.state]
  const [loading, setLoading] = useState(false)

  async function handleAck() {
    setLoading(true)
    await fetch(`/api/alarms/${alarm.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'acknowledge' }),
    })
    setLoading(false)
    onAction()
  }

  async function handleResolve() {
    setLoading(true)
    await fetch(`/api/alarms/${alarm.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve' }),
    })
    setLoading(false)
    onAction()
  }

  return (
    <tr className="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sc.dot}`} />
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sc.badge}`}>
            {sc.label}
          </span>
        </div>
      </td>
      <td className="px-5 py-4">
        <Link href={`/motors/${alarm.motor_id}`} className="hover:underline">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{alarm.motor_name}</p>
        </Link>
        <p className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">{alarm.motor_location}</p>
      </td>
      <td className="px-5 py-4">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{alarm.fault_type ?? '—'}</p>
        <p className="text-xs text-slate-500 mt-0.5 max-w-xs truncate">{alarm.message}</p>
      </td>
      <td className="px-5 py-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {new Date(alarm.triggered_at).toLocaleString('ko-KR')}
        </p>
        {alarm.resolved_at && (
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">
            해결: {new Date(alarm.resolved_at).toLocaleString('ko-KR')}
          </p>
        )}
      </td>
      <td className="px-5 py-4">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ac.style}`}>
          {ac.label}
        </span>
        {alarm.acknowledged_by_name && (
          <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-1">{alarm.acknowledged_by_name}</p>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="flex gap-2">
          {alarm.state === 'active' && (
            <button
              onClick={handleAck}
              disabled={loading}
              className="text-xs text-blue-600 hover:underline font-medium disabled:opacity-50"
            >
              확인
            </button>
          )}
          {alarm.state === 'acknowledged' && (
            <button
              onClick={handleResolve}
              disabled={loading}
              className="text-xs text-green-600 hover:underline font-medium disabled:opacity-50"
            >
              해결
            </button>
          )}
          <Link href={`/motors/${alarm.motor_id}`} className="text-xs text-slate-500 hover:underline">
            상세
          </Link>
        </div>
      </td>
    </tr>
  )
}

// ── 알람 페이지 ────────────────────────────────────────────

export default function AlarmsPage() {
  const [severityFilter, setSeverityFilter] = useState<string>('전체')
  const [stateFilter,    setStateFilter]    = useState<string>('전체 상태')
  const [search,         setSearch]         = useState('')
  const [page,           setPage]           = useState(1)
  const LIMIT = 20

  const params = new URLSearchParams()
  if (severityFilter === '경보') params.set('severity', 'critical')
  if (severityFilter === '주의') params.set('severity', 'warning')
  if (stateFilter === '활성')   params.set('state', 'active')
  if (stateFilter === '확인됨') params.set('state', 'acknowledged')
  if (stateFilter === '해결됨') params.set('state', 'resolved')
  params.set('page',  String(page))
  params.set('limit', String(LIMIT))

  const { data, mutate, isLoading } =
    useSWR<ApiResponse<Alarm[]>>(`/api/alarms?${params.toString()}`, fetcher, { refreshInterval: 15_000 })

  const alarms = data?.data ?? []
  const total  = data?.total ?? 0

  const filtered = search
    ? alarms.filter(a =>
        a.motor_name?.toLowerCase().includes(search.toLowerCase()) ||
        a.message?.toLowerCase().includes(search.toLowerCase())
      )
    : alarms

  const activeCount   = alarms.filter(a => a.state === 'active').length
  const criticalCount = alarms.filter(a => a.severity === 'critical' && a.state === 'active').length
  const totalPages    = Math.ceil(total / LIMIT)

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">알람 이력</h1>
          <p className="text-sm text-slate-500 mt-1">
            활성 알람 {activeCount}건 · 경보 {criticalCount}건
          </p>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-5 py-4 mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex gap-2">
          {['전체', '경보', '주의'].map(f => (
            <button
              key={f}
              onClick={() => { setSeverityFilter(f); setPage(1) }}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                severityFilter === f ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >{f}</button>
          ))}
        </div>
        <div className="w-px h-6 bg-slate-200 dark:bg-slate-800" />
        <div className="flex gap-2">
          {['전체 상태', '활성', '확인됨', '해결됨'].map(f => (
            <button
              key={f}
              onClick={() => { setStateFilter(f); setPage(1) }}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                stateFilter === f ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/30'
              }`}
            >{f}</button>
          ))}
        </div>
        <div className="ml-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="모터명, 메시지 검색..."
            className="text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
          />
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-200 dark:border-slate-800">
              {['심각도', '모터', '고장 유형 / 메시지', '발생 시간', '상태', '액션'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">불러오는 중...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">알람이 없습니다</td></tr>
            ) : (
              filtered.map(alarm => (
                <AlarmRow key={alarm.id} alarm={alarm} onAction={() => mutate()} />
              ))
            )}
          </tbody>
        </table>

        {/* 페이지네이션 */}
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
