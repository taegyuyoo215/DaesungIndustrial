'use client'

import { useState, useRef } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import { fetcher } from '@/lib/fetcher'
import type { MotorStatus, Alarm, MaintenanceLog, ApiResponse } from '@/types'

// ── 타입 ──────────────────────────────────────────────────────

interface ReportTemplate {
  id:         number
  name:       string
  file_type:  'xlsx' | 'docx'
  file_name:  string
  file_size:  number | null
  created_at: string
}

// ── 유틸 ──────────────────────────────────────────────────────

function fmtSize(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ── 심각도 배지 ───────────────────────────────────────────────

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

// ── 요약 카드 ─────────────────────────────────────────────────

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

// ── 템플릿 파일 타입 뱃지 ─────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
      type === 'xlsx'
        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800'
    }`}>
      {type.toUpperCase()}
    </span>
  )
}

// ── 템플릿 관리 패널 ──────────────────────────────────────────

function TemplatePanel() {
  const { data, mutate, isLoading } =
    useSWR<{ ok: boolean; templates: ReportTemplate[] }>('/api/reports/templates', fetcher)
  const templates = data?.templates ?? []

  const [uploading,  setUploading]  = useState(false)
  const [generating, setGenerating] = useState<number | null>(null)
  const [tplName,    setTplName]    = useState('')
  const [error,      setError]      = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('파일을 선택하세요.'); return }
    if (!tplName.trim()) { setError('템플릿 이름을 입력하세요.'); return }
    setError('')
    setUploading(true)

    const form = new FormData()
    form.append('name', tplName.trim())
    form.append('file', file)

    const res = await fetch('/api/reports/templates', { method: 'POST', body: form })
    const json = await res.json()

    setUploading(false)
    if (json.ok) {
      setTplName('')
      if (fileRef.current) fileRef.current.value = ''
      await mutate()
    } else {
      setError(json.error ?? '업로드 실패')
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}" 템플릿을 삭제하시겠습니까?`)) return
    await fetch(`/api/reports/templates/${id}`, { method: 'DELETE' })
    await mutate()
  }

  async function handleGenerate(tpl: ReportTemplate) {
    setGenerating(tpl.id)
    try {
      const res = await fetch('/api/reports/generate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ template_id: tpl.id }),
      })
      if (!res.ok) {
        const json = await res.json()
        alert(`보고서 생성 실패: ${json.error}`)
        return
      }
      // 파일 다운로드
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      const date = new Date().toISOString().slice(0, 10)
      a.href     = url
      a.download = `보고서_${date}.${tpl.file_type}`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* 업로드 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
          양식 업로드
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Excel(.xlsx) 또는 Word(.docx) 양식 파일을 업로드하세요.
          플레이스홀더 작성법은 아래 가이드를 참고하세요.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={tplName}
            onChange={e => setTplName(e.target.value)}
            placeholder="템플릿 이름 (예: 월간 진단 보고서)"
            className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800
              text-slate-900 dark:text-slate-200 rounded-lg px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
          />
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.docx"
            className="text-sm text-slate-500 dark:text-slate-400
              file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
              file:text-xs file:font-medium file:bg-slate-100 dark:file:bg-slate-700
              file:text-slate-700 dark:file:text-slate-300 hover:file:bg-slate-200"
          />
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="shrink-0 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50
              text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {uploading ? '업로드 중...' : '업로드'}
          </button>
        </div>
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      </div>

      {/* 템플릿 목록 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/60">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            저장된 양식 {isLoading ? '…' : `(${templates.length})`}
          </h3>
        </div>

        {templates.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-400 text-sm">
            {isLoading ? '불러오는 중...' : '업로드된 양식이 없습니다.'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#0a0f1e]">
                {['형식', '템플릿 이름', '원본 파일명', '크기', '등록일', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {templates.map(tpl => (
                <tr key={tpl.id} className="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/20">
                  <td className="px-4 py-3"><TypeBadge type={tpl.file_type} /></td>
                  <td className="px-4 py-3 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {tpl.name}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400 font-mono truncate max-w-[180px]">
                    {tpl.file_name}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{fmtSize(tpl.file_size)}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(tpl.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleGenerate(tpl)}
                        disabled={generating === tpl.id}
                        className="text-xs font-medium text-cyan-600 hover:text-cyan-500
                          disabled:opacity-40 flex items-center gap-1"
                      >
                        {generating === tpl.id ? (
                          '생성 중...'
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"
                              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="7 10 12 15 17 10"/>
                              <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            다운로드
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(tpl.id, tpl.name)}
                        className="text-xs text-red-400 hover:text-red-600"
                      >
                        삭제
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 플레이스홀더 가이드 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          플레이스홀더 작성 가이드
        </h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
          {/* Excel */}
          <div>
            <p className="font-semibold text-green-600 dark:text-green-400 mb-2">Excel (.xlsx)</p>
            <div className="bg-slate-50 dark:bg-[#0a0f1e] rounded-lg p-3 font-mono space-y-1 text-slate-600 dark:text-slate-400">
              <p className="text-slate-400 dark:text-slate-600">{'/* 단일값 - 셀에 직접 입력 */'}</p>
              <p>{`{{report_date}}`}       보고서 생성일</p>
              <p>{`{{motor_count_total}}`} 전체 모터 수</p>
              <p>{`{{alarm_count_active}}`} 활성 알람 수</p>
              <p className="pt-1 text-slate-400 dark:text-slate-600">{'/* 반복행 - 해당 행이 자동 복제됨 */'}</p>
              <p>{`{{motors.name}}`}        모터명</p>
              <p>{`{{motors.location}}`}    위치</p>
              <p>{`{{motors.severity_ko}}`} 상태</p>
              <p>{`{{motors.vel_y_rms}}`}   진동</p>
              <p>{`{{alarms.alarm_date}}`}  알람 발생일</p>
              <p>{`{{alarms.motor_name}}`}  모터명</p>
              <p>{`{{maintenance.work_type}}`} 정비 유형</p>
            </div>
          </div>
          {/* Word */}
          <div>
            <p className="font-semibold text-blue-600 dark:text-blue-400 mb-2">Word (.docx)</p>
            <div className="bg-slate-50 dark:bg-[#0a0f1e] rounded-lg p-3 font-mono space-y-1 text-slate-600 dark:text-slate-400">
              <p className="text-slate-400 dark:text-slate-600">{'/* 단일값 */'}</p>
              <p>{`{report_date}`}       보고서 생성일</p>
              <p>{`{motor_count_total}`} 전체 모터 수</p>
              <p>{`{alarm_count_active}`} 활성 알람 수</p>
              <p className="pt-1 text-slate-400 dark:text-slate-600">{'/* 반복 (테이블 행에 사용) */'}</p>
              <p>{`{#motors}`}</p>
              <p className="pl-3">{`{name}  {location}  {severity_ko}`}</p>
              <p>{`{/motors}`}</p>
              <p>{`{#alarms}`}</p>
              <p className="pl-3">{`{alarm_date}  {motor_name}  {severity_ko}`}</p>
              <p>{`{/alarms}`}</p>
              <p>{`{#maintenance}`}</p>
              <p className="pl-3">{`{performed_at}  {motor_name}  {work_type}`}</p>
              <p>{`{/maintenance}`}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 페이지 ────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<'summary' | 'template'>('summary')

  const { data: motorRes }  = useSWR<ApiResponse<MotorStatus[]>>('/api/motors', fetcher)
  const { data: alarmRes }  = useSWR<ApiResponse<Alarm[]>>('/api/alarms?limit=200', fetcher)
  const { data: maintRes }  = useSWR<ApiResponse<MaintenanceLog[]>>('/api/maintenance?limit=200', fetcher)

  const motors      = motorRes?.data ?? []
  const allAlarms   = alarmRes?.data ?? []
  const maintenance = maintRes?.data ?? []

  const summary = {
    total:    motors.length,
    normal:   motors.filter(m => m.severity === 'normal').length,
    warning:  motors.filter(m => m.severity === 'warning').length,
    critical: motors.filter(m => m.severity === 'critical').length,
  }

  const alarmStats = {
    total:    allAlarms.length,
    critical: allAlarms.filter(a => a.severity === 'critical').length,
    warning:  allAlarms.filter(a => a.severity === 'warning').length,
    active:   allAlarms.filter(a => a.state === 'active').length,
    resolved: allAlarms.filter(a => a.state === 'resolved').length,
  }

  const alarmByMotor = motors.map(m => ({
    id:        m.id,
    name:      m.name,
    location:  m.location,
    severity:  m.severity,
    critical:  allAlarms.filter(a => a.motor_id === m.id && a.severity === 'critical').length,
    warning:   allAlarms.filter(a => a.motor_id === m.id && a.severity === 'warning').length,
    total:     allAlarms.filter(a => a.motor_id === m.id).length,
    lastMaint: maintenance.find(ml => ml.motor_id === m.id)?.performed_at,
  })).sort((a, b) => b.total - a.total)

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">보고서</h1>
          <p className="text-sm text-slate-500 mt-1">
            {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} 기준
          </p>
        </div>
        {tab === 'summary' && (
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700
              dark:hover:bg-slate-600 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            출력 / PDF
          </button>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 mb-6">
        {([
          { key: 'summary',  label: '현황 보고서' },
          { key: 'template', label: '양식 보고서' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === key
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 현황 보고서 탭 ──────────────────────────────────── */}
      {tab === 'summary' && (
        <>
          {/* 모터 현황 요약 */}
          <div className="mb-8">
            <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">모터 현황 요약</h2>
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="전체 모터"  value={summary.total}    color="border-slate-200 dark:border-slate-800" />
              <StatCard label="정상"       value={summary.normal}   color="border-green-300"  sub="이상 없음" />
              <StatCard label="주의"       value={summary.warning}  color="border-yellow-300" sub="점검 권고" />
              <StatCard label="경보"       value={summary.critical} color="border-red-400"    sub="즉시 조치 필요" />
            </div>
          </div>

          {/* 알람 현황 요약 */}
          <div className="mb-8">
            <h2 className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-4">알람 현황</h2>
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="전체 알람" value={alarmStats.total}    color="border-slate-200 dark:border-slate-800" />
              <StatCard label="경보"      value={alarmStats.critical} color="border-red-400" />
              <StatCard label="주의"      value={alarmStats.warning}  color="border-yellow-300" />
              <StatCard label="해결됨"    value={alarmStats.resolved} color="border-green-300" sub={`활성 ${alarmStats.active}건`} />
            </div>
          </div>

          {/* 모터별 알람 집계 */}
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
                          {row.lastMaint ? new Date(row.lastMaint).toLocaleDateString('ko-KR') : '—'}
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
              <Link href="/maintenance" className="text-sm text-cyan-600 hover:underline">전체 보기 →</Link>
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
        </>
      )}

      {/* ── 양식 보고서 탭 ──────────────────────────────────── */}
      {tab === 'template' && <TemplatePanel />}
    </div>
  )
}
