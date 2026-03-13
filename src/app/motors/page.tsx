'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { useState } from 'react'
import StatusBadge from '@/components/StatusBadge'
import { fetcher } from '@/lib/fetcher'
import type { MotorStatus, ApiResponse } from '@/types'

const SEVERITY_FILTERS = ['전체', '정상', '주의', '경보'] as const
type SeverityFilter = typeof SEVERITY_FILTERS[number]

const severityMap: Record<SeverityFilter, string | null> = {
  '전체': null, '정상': 'normal', '주의': 'warning', '경보': 'critical',
}

function velColor(v: number | null, warn: number, crit: number) {
  if (v === null) return 'text-slate-400 dark:text-slate-600'
  const n = Number(v)
  if (n >= crit) return 'text-red-600 dark:text-red-400 font-bold'
  if (n >= warn) return 'text-yellow-600 dark:text-amber-400 font-semibold'
  return 'text-slate-700 dark:text-slate-300'
}

export default function MotorsPage() {
  const [filter, setFilter] = useState<SeverityFilter>('전체')
  const [search, setSearch] = useState('')

  const { data, isLoading, error } =
    useSWR<ApiResponse<MotorStatus[]>>('/api/motors', fetcher, { refreshInterval: 30_000 })

  const all    = data?.data ?? []
  const motors = all.filter(m => {
    const sev = severityMap[filter]
    if (sev && m.severity !== sev) return false
    if (search) {
      const q = search.toLowerCase()
      return m.name.toLowerCase().includes(q) || (m.location ?? '').toLowerCase().includes(q)
    }
    return true
  })

  const counts = {
    total:    all.length,
    normal:   all.filter(m => m.severity === 'normal').length,
    warning:  all.filter(m => m.severity === 'warning').length,
    critical: all.filter(m => m.severity === 'critical').length,
  }

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">모터 목록</h1>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
            전체 {counts.total}대 · 정상 {counts.normal} · 주의 {counts.warning} · 경보 {counts.critical}
          </p>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-5 py-4 mb-6 flex items-center gap-4 flex-wrap">
        <div className="flex gap-2">
          {SEVERITY_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
                filter === f
                  ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {f}
              {f !== '전체' && (
                <span className="ml-1.5 text-xs opacity-70">
                  {f === '정상' ? counts.normal : f === '주의' ? counts.warning : counts.critical}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="모터명, 위치 검색..."
            className="text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-600 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
          />
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-200 dark:border-slate-800">
              {['모터', '위치', '상태', 'RMS (Y축)', '온도', 'Kurtosis', '활성 알람', '마지막 측정'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-slate-400 dark:text-slate-600 text-sm">불러오는 중...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-red-500 text-sm">
                  데이터 로드 실패 — PostgreSQL 연결을 확인해주세요
                </td>
              </tr>
            ) : motors.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-slate-400 dark:text-slate-600 text-sm">
                  {search ? '검색 결과가 없습니다' : '등록된 모터가 없습니다'}
                </td>
              </tr>
            ) : (
              motors.map(motor => {
                const velY = Number(motor.vel_y_rms ?? 0)
                const temp = Number(motor.temperature_c ?? 0)
                const kurt = Number(motor.kurtosis_x ?? 0)
                const isOffline = !motor.last_measured_at

                return (
                  <tr key={motor.id} className="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-5 py-4">
                      <Link href={`/motors/${motor.id}`} className="font-semibold text-slate-800 dark:text-slate-200 hover:underline text-sm">
                        {motor.name}
                      </Link>
                      <p className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">
                        {motor.iso_class ? `Class ${motor.iso_class}` : '—'}
                        {motor.rated_rpm ? ` · ${motor.rated_rpm} RPM` : ''}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-400">{motor.location ?? '—'}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={isOffline ? 'offline' : motor.severity} />
                    </td>
                    <td className={`px-5 py-4 text-sm ${isOffline ? 'text-slate-300 dark:text-slate-700' : velColor(motor.vel_y_rms, 2.8, 7.1)}`}>
                      {isOffline ? '—' : `${velY.toFixed(2)} mm/s`}
                    </td>
                    <td className={`px-5 py-4 text-sm ${isOffline ? 'text-slate-300 dark:text-slate-700' : velColor(motor.temperature_c, 60, 70)}`}>
                      {isOffline ? '—' : `${Math.round(temp)} °C`}
                    </td>
                    <td className={`px-5 py-4 text-sm ${isOffline ? 'text-slate-300 dark:text-slate-700' : velColor(motor.kurtosis_x, 5.0, 8.0)}`}>
                      {isOffline ? '—' : kurt.toFixed(2)}
                    </td>
                    <td className="px-5 py-4">
                      {motor.active_alarms > 0 ? (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          motor.severity === 'critical'
                            ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                            : 'bg-yellow-50 dark:bg-amber-900/20 text-yellow-700 dark:text-amber-400'
                        }`}>
                          {motor.active_alarms}건
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300 dark:text-slate-700">없음</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400 dark:text-slate-600 whitespace-nowrap">
                      {motor.last_measured_at
                        ? new Date(motor.last_measured_at).toLocaleString('ko-KR')
                        : '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
