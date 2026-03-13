'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { fetcher } from '@/lib/fetcher'
import type { MotorStatus, Alarm, MaintenanceLog, ApiResponse } from '@/types'

// ── 기간 옵션 ─────────────────────────────────────────────

const PERIODS = [
  { label: '7일',  days: 7  },
  { label: '30일', days: 30 },
  { label: '90일', days: 90 },
]

// ── 심각도 배지 ───────────────────────────────────────────

function SevBadge({ severity }: { severity: string }) {
  const s: Record<string, string> = {
    critical: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200',
    warning:  'bg-yellow-50 dark:bg-amber-900/20 text-yellow-700 dark:text-amber-400 border-yellow-200',
    normal:   'bg-green-50 dark:bg-emerald-900/20 text-green-700 dark:text-emerald-400 border-green-200',
  }
  const labels: Record<string, string> = { critical: '경보', warning: '주의', normal: '정상' }
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${s[severity] ?? s.normal}`}>
      {labels[severity] ?? severity}
    </span>
  )
}

// ── 요약 카드 ─────────────────────────────────────────────

function StatCard({ label, value, sub, color }: {
  label: string; value: number | string; sub?: string; color: string
}) {
  return (
    <div className={`bg-white dark:bg-slate-900 rounded-xl border-2 ${color} p-5`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">{sub}</p>}
    </div>
  )
}

// ── 페이지 ────────────────────────────────────────────────

export default function ReportsPage() {
  const { data: motorRes } =
    useSWR<ApiResponse<MotorStatus[]>>('/api/motors', fetcher)

  const { data: alarmRes } =
    useSWR<ApiResponse<Alarm[]>>('/api/alarms?limit=200', fetcher)

  const { data: maintRes } =
    useSWR<ApiResponse<MaintenanceLog[]>>('/api/maintenance?limit=200', fetcher)

  const motors      = motorRes?.data ?? []
  const allAlarms   = alarmRes?.data ?? []
  const maintenance = maintRes?.data ?? []

  // ── 집계 ─────────────────────────────────────────────────

  const summary = {
    total:    motors.length,
    normal:   motors.filter(m => m.severity === 'normal').length,
    warning:  motors.filter(m => m.severity === 'warning').length,
    critical: motors.filter(m => m.severity === 'critical').length,
  }

  const alarmStats = {
    total:       allAlarms.length,
    critical:    allAlarms.filter(a => a.severity === 'critical').length,
    warning:     allAlarms.filter(a => a.severity === 'warning').length,
    active:      allAlarms.filter(a => a.state === 'active').length,
    resolved:    allAlarms.filter(a => a.state === 'resolved').length,
  }

  // 모터별 알람 집계
  const alarmByMotor = motors.map(m => ({
    id:       m.id,
    name:     m.name,
    location: m.location,
    severity: m.severity,
    critical: allAlarms.filter(a => a.motor_id === m.id && a.severity === 'critical').length,
    warning:  allAlarms.filter(a => a.motor_id === m.id && a.severity === 'warning').length,
    total:    allAlarms.filter(a => a.motor_id === m.id).length,
    lastMaint: maintenance.find(ml => ml.motor_id === m.id)?.performed_at,
  })).sort((a, b) => b.total - a.total)

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">보고서</h1>
          <p className="text-sm text-slate-500 mt-1">
            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 기준
          </p>
        </div>
        <button
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          onClick={() => window.print()}
        >
          출력 / PDF
        </button>
      </div>

      {/* 모터 현황 요약 */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">모터 현황 요약</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="전체 모터"  value={summary.total}    color="border-slate-200 dark:border-slate-800"  />
          <StatCard label="정상"       value={summary.normal}   color="border-green-300"  sub="이상 없음" />
          <StatCard label="주의"       value={summary.warning}  color="border-yellow-300" sub="점검 권고" />
          <StatCard label="경보"       value={summary.critical} color="border-red-400"    sub="즉시 조치 필요" />
        </div>
      </div>

      {/* 알람 현황 요약 */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">알람 현황</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="전체 알람"   value={alarmStats.total}    color="border-slate-200 dark:border-slate-800" />
          <StatCard label="경보"        value={alarmStats.critical}  color="border-red-400"   />
          <StatCard label="주의"        value={alarmStats.warning}   color="border-yellow-300" />
          <StatCard label="해결됨"      value={alarmStats.resolved}  color="border-green-300" sub={`활성 ${alarmStats.active}건`} />
        </div>
      </div>

      {/* 모터별 알람 집계 테이블 */}
      <div className="mb-8">
        <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">모터별 알람 현황</h2>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-200 dark:border-slate-800">
                {['모터', '위치', '상태', '경보', '주의', '전체 알람', '최근 정비일'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {alarmByMotor.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-slate-400 text-sm">
                    데이터를 불러오는 중...
                  </td>
                </tr>
              ) : (
                alarmByMotor.map(row => (
                  <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-5 py-4">
                      <Link href={`/motors/${row.id}`} className="text-sm font-semibold text-slate-800 dark:text-slate-200 hover:underline">
                        {row.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">{row.location ?? '—'}</td>
                    <td className="px-5 py-4"><SevBadge severity={row.severity} /></td>
                    <td className="px-5 py-4 text-sm font-bold text-red-600">{row.critical || '—'}</td>
                    <td className="px-5 py-4 text-sm font-bold text-yellow-600">{row.warning || '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-700 dark:text-slate-300">{row.total || '0'}</td>
                    <td className="px-5 py-4 text-sm text-slate-500 whitespace-nowrap">
                      {row.lastMaint
                        ? new Date(row.lastMaint).toLocaleDateString('ko-KR')
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 최근 정비 이력 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300">최근 정비 이력</h2>
          <Link href="/maintenance" className="text-sm text-blue-600 hover:underline">전체 보기 →</Link>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-200 dark:border-slate-800">
                {['정비 일시', '모터', '유형', '내용', '담당자'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {maintenance.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">
                    정비 이력이 없습니다
                  </td>
                </tr>
              ) : (
                maintenance.slice(0, 10).map(log => (
                  <tr key={log.id} className="border-t border-slate-100 dark:border-slate-800/60">
                    <td className="px-5 py-4 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {new Date(log.performed_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-5 py-4">
                      <Link href={`/motors/${log.motor_id}`} className="text-sm font-semibold text-slate-800 dark:text-slate-200 hover:underline">
                        {log.motor_name ?? `Motor #${log.motor_id}`}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700 dark:text-slate-300">{log.work_type}</td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">{log.description ?? '—'}</p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-400">{log.performed_by_name ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
