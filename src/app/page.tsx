'use client'

import useSWR from 'swr'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import Sparkline from '@/components/Sparkline'
import { fetcher } from '@/lib/fetcher'
import type { MotorStatus, ApiResponse } from '@/types'

// ── 타입 ──────────────────────────────────────────────────

interface MotorDiagnosis {
  id: number
  motor_id: number
  motor_name: string
  location: string | null
  diagnosed_at: string
  fault_type: string | null
  confidence: number | null
  severity: string | null
  rul_days: number | null
}

interface AiReport {
  health_score: number
  summary: string
  critical: {
    motor_name: string
    location: string | null
    fault_type: string | null
    confidence: number | null
    rul_days: number | null
    alarms: number
  }[]
  warning: {
    motor_name: string
    location: string | null
    fault_type: string | null
    confidence: number | null
    rul_days: number | null
  }[]
  total_motors: number
  active_alarms: number
  generated_at: string
}

// ── 상수 ──────────────────────────────────────────────────

const FAULT_LABELS: Record<string, string> = {
  bearing_outer: '베어링 외륜 결함',
  bearing_inner: '베어링 내륜 결함',
  imbalance:     '불평형',
  misalignment:  '오정렬',
  looseness:     '풀림',
  overheat:      '과열',
}

// ISO Class II 기준
const VEL_WARN  = 2.8
const VEL_CRIT  = 7.1
const TEMP_WARN = 60
const TEMP_CRIT = 70
const KURT_WARN = 5.0
const KURT_CRIT = 8.0

// ── AI 진단 종합 리포트 패널 ───────────────────────────────

function AiReportPanel() {
  const { data, isLoading } =
    useSWR<AiReport>('/api/ai-report', fetcher, { refreshInterval: 300_000 })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900 mb-4 sm:mb-6 px-4 sm:px-5 py-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 border-2 border-sky-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <span className="text-sm text-slate-400">AI 진단 리포트 로딩 중...</span>
        </div>
      </div>
    )
  }

  if (!data) return null

  const hasUrgent  = data.critical.length > 0
  const hasWarning = data.warning.length > 0

  // 문장형 요약 생성
  const sentenceParts: string[] = []
  if (data.critical.length > 0)
    sentenceParts.push(`${data.critical.length}대 설비에서 즉시 조치가 필요한 결함이 감지되었습니다`)
  if (data.warning.length > 0)
    sentenceParts.push(`${data.warning.length}대 설비는 주의 관찰이 필요합니다`)
  if (data.active_alarms > 0)
    sentenceParts.push(`활성 알람 ${data.active_alarms}건이 발생 중입니다`)
  const sentence = sentenceParts.length > 0
    ? sentenceParts.join('. ') + `. 전체 설비 건강도는 ${data.health_score}점입니다.`
    : `전체 ${data.total_motors}대 설비가 모두 정상 운전 중입니다.`

  const scoreColor =
    data.health_score >= 80 ? 'text-emerald-400' :
    data.health_score >= 50 ? 'text-amber-400'   : 'text-red-400'

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900 text-slate-100 mb-2 sm:mb-3 shrink-0 overflow-hidden">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-2 border-b border-slate-700">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-sm font-bold tracking-tight whitespace-nowrap">✦ AI 진단 종합 리포트</span>
          <span className="text-slate-600 hidden sm:inline">·</span>
          <span className="hidden sm:inline text-xs text-slate-300 truncate">{data.summary}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-slate-500">건강도</span>
          <span className={`text-xl font-black ${scoreColor}`}>{data.health_score}</span>
          <span className="text-xs text-slate-500">/ 100</span>
        </div>
      </div>

      {/* 본문 */}
      <div className="px-4 sm:px-5 py-2.5 space-y-2">
        {/* 문장형 요약 */}
        <p className="text-sm text-slate-300 leading-relaxed">{sentence}</p>

        {/* 즉시 조치 */}
        {hasUrgent && (
          <div>
            <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2">🔴 즉시 조치 필요</p>
            <div className="space-y-1.5">
              {data.critical.map((item, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 bg-red-950/50 border border-red-800/50 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white">{item.motor_name}</span>
                    {item.location && (
                      <span className="text-xs text-slate-400 ml-2">{item.location}</span>
                    )}
                    {item.fault_type && (
                      <span className="ml-2 text-xs text-red-300">
                        {FAULT_LABELS[item.fault_type] ?? item.fault_type}
                        {item.confidence != null && ` (${item.confidence}%)`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:shrink-0">
                    {item.alarms > 0 && (
                      <span className="text-[10px] bg-red-700/60 text-red-200 px-1.5 py-0.5 rounded">알람 {item.alarms}건</span>
                    )}
                    {item.rul_days != null && (
                      <span className="text-xs font-bold text-red-300">잔여 {item.rul_days}일</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 주의 관찰 */}
        {hasWarning && (
          <div>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-2">🟡 주의 관찰</p>
            <div className="space-y-1.5">
              {data.warning.map((item, i) => (
                <div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-2 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-white">{item.motor_name}</span>
                    {item.location && (
                      <span className="text-xs text-slate-400 ml-2">{item.location}</span>
                    )}
                    {item.fault_type && (
                      <span className="ml-2 text-xs text-amber-300">
                        {FAULT_LABELS[item.fault_type] ?? item.fault_type}
                        {item.confidence != null && ` (${item.confidence}%)`}
                      </span>
                    )}
                  </div>
                  {item.rul_days != null && (
                    <span className="text-xs text-amber-300 sm:shrink-0">잔여 {item.rul_days}일</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 모두 정상 */}
        {!hasUrgent && !hasWarning && (
          <div className="flex items-center gap-2 text-emerald-400 text-sm">
            <span>🟢</span>
            <span>전체 {data.total_motors}대 설비 정상 운전 중</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 유틸 ──────────────────────────────────────────────────

function metricColor(value: number, warn: number, crit: number): string {
  if (value >= crit) return 'text-red-600'
  if (value >= warn) return 'text-amber-600'
  return 'text-slate-700'
}
function metricBg(value: number, warn: number, crit: number): string {
  if (value >= crit) return 'bg-red-50'
  if (value >= warn) return 'bg-amber-50'
  return 'bg-slate-50'
}

// ── 변화량 표시 ───────────────────────────────────────────

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null || Math.abs(value) < 0.05) {
    return <span className="text-[10px] text-slate-300 mt-0.5 block">—</span>
  }
  const isUp = value > 0
  const abs  = Math.abs(value)
  const fmt  = abs < 0.1 ? abs.toFixed(2) : abs < 10 ? abs.toFixed(1) : Math.round(abs).toString()
  return (
    <span className={`text-[10px] font-medium mt-0.5 block ${isUp ? 'text-red-500' : 'text-emerald-500'}`}>
      {isUp ? '▲' : '▼'} {fmt}
    </span>
  )
}

// ── 모터 카드 ─────────────────────────────────────────────

function MotorCard({
  motor,
  diagnosis,
  sparkline,
}: {
  motor: MotorStatus
  diagnosis?: MotorDiagnosis
  sparkline?: number[]
}) {
  const velY      = Number(motor.vel_y_rms    ?? 0)
  const temp      = Number(motor.temperature_c ?? 0)
  const kurtosis  = Number(motor.kurtosis_x    ?? 0)
  const isOffline = !motor.last_measured_at

  const accentBar: Record<string, string> = {
    normal:   'bg-emerald-400',
    warning:  'bg-amber-400',
    critical: 'bg-red-500',
  }

  const showDiagBadge =
    diagnosis &&
    diagnosis.fault_type &&
    diagnosis.fault_type !== 'normal' &&
    diagnosis.severity !== 'normal'

  return (
    <Link href={`/motors/${motor.id}`} className="block h-full">
      <div className="bg-white rounded-xl border border-slate-200 hover:shadow-md transition-shadow h-full flex overflow-hidden">
        {/* 좌측 상태 바 */}
        <div className={`w-1 shrink-0 ${accentBar[isOffline ? 'normal' : motor.severity]}`} />

        <div className="flex-1 p-2.5 sm:p-3 flex flex-col gap-1.5 sm:gap-2 min-w-0">
          {/* 헤더 */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 text-sm truncate">{motor.name}</p>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{motor.location}</p>
            </div>
            <StatusBadge status={isOffline ? 'offline' : motor.severity} />
          </div>

          {isOffline ? (
            <div className="flex-1 flex flex-col items-center justify-center py-4 sm:py-6 text-slate-400">
              <p className="text-2xl">📡</p>
              <p className="text-xs mt-1">센서 오프라인</p>
            </div>
          ) : (
            <>
              {/* 측정값 3개 */}
              <div className="grid grid-cols-3 gap-1 sm:gap-1.5">
                {/* 진동 RMS */}
                <div className={`rounded-lg p-1.5 sm:p-2 text-center ${metricBg(velY, VEL_WARN, VEL_CRIT)}`}>
                  <p className="text-[9px] font-semibold text-slate-400 tracking-widest uppercase">RMS</p>
                  <p className={`text-xs sm:text-sm font-bold leading-tight mt-0.5 ${metricColor(velY, VEL_WARN, VEL_CRIT)}`}>
                    {velY.toFixed(1)}
                  </p>
                  <p className="text-[9px] text-slate-400">mm/s</p>
                  <Delta value={motor.vel_y_delta} />
                </div>

                {/* Kurtosis */}
                <div className={`rounded-lg p-1.5 sm:p-2 text-center ${metricBg(kurtosis, KURT_WARN, KURT_CRIT)}`}>
                  <p className="text-[9px] font-semibold text-slate-400 tracking-widest uppercase">Kurt</p>
                  <p className={`text-xs sm:text-sm font-bold leading-tight mt-0.5 ${metricColor(kurtosis, KURT_WARN, KURT_CRIT)}`}>
                    {kurtosis.toFixed(1)}
                  </p>
                  <p className="text-[9px] text-slate-400">—</p>
                  <Delta value={motor.kurtosis_delta} />
                </div>

                {/* 온도 */}
                <div className={`rounded-lg p-1.5 sm:p-2 text-center ${metricBg(temp, TEMP_WARN, TEMP_CRIT)}`}>
                  <p className="text-[9px] font-semibold text-slate-400 tracking-widest uppercase">Temp</p>
                  <p className={`text-xs sm:text-sm font-bold leading-tight mt-0.5 ${metricColor(temp, TEMP_WARN, TEMP_CRIT)}`}>
                    {Math.round(temp)}
                  </p>
                  <p className="text-[9px] text-slate-400">°C</p>
                  <Delta value={motor.temp_delta} />
                </div>
              </div>

              {/* 24h 스파크라인 */}
              <div>
                <p className="text-[9px] text-slate-400 mb-1">24시간 진동 추이 (vel_y RMS)</p>
                <Sparkline
                  data={sparkline ?? []}
                  height={28}
                  warnValue={VEL_WARN}
                  critValue={VEL_CRIT}
                />
              </div>

              {/* 활성 알람 */}
              {motor.active_alarms > 0 && (
                <div className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                  motor.severity === 'critical'
                    ? 'bg-red-50 text-red-700'
                    : 'bg-yellow-50 text-yellow-700'
                }`}>
                  ⚠ 활성 알람 {motor.active_alarms}건
                </div>
              )}

              {/* AI 진단 뱃지 */}
              {showDiagBadge && (
                <div className={`flex items-center justify-between gap-1 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs ${
                  diagnosis!.severity === 'critical'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <span className="font-semibold truncate">
                    {FAULT_LABELS[diagnosis!.fault_type!] ?? diagnosis!.fault_type}
                  </span>
                  <span className="font-bold shrink-0">
                    {diagnosis!.confidence != null
                      ? `${Math.round(Number(diagnosis!.confidence))}%`
                      : ''}
                    {diagnosis!.rul_days != null && (
                      <span className="ml-1 font-normal opacity-75">· {diagnosis!.rul_days}일</span>
                    )}
                  </span>
                </div>
              )}
            </>
          )}

          {/* 마지막 측정 시각 */}
          {motor.last_measured_at && (
            <p className="text-[9px] text-slate-300 text-right mt-auto">
              {new Date(motor.last_measured_at).toLocaleTimeString('ko-KR')}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

// ── 대시보드 페이지 ───────────────────────────────────────

export default function DashboardPage() {
  const { data: motorRes, error: motorErr, isLoading: motorLoading } =
    useSWR<ApiResponse<MotorStatus[]>>('/api/motors', fetcher, { refreshInterval: 30_000 })

  const { data: diagRes } =
    useSWR<ApiResponse<MotorDiagnosis[]>>('/api/diagnosis', fetcher, { refreshInterval: 30_000 })

  const { data: sparklineRes } =
    useSWR<{ data: Record<number, number[]> }>('/api/dashboard/sparklines', fetcher, { refreshInterval: 60_000 })

  const motors     = motorRes?.data    ?? []
  const diagnoses  = diagRes?.data     ?? []
  const sparklines = sparklineRes?.data ?? {}

  const diagMap = new Map(diagnoses.map(d => [d.motor_id, d]))

  // 경보/주의 먼저 정렬
  const sortedMotors = [...motors].sort((a, b) => {
    const order = { critical: 0, warning: 1, normal: 2 }
    return order[a.severity] - order[b.severity]
  })

  // 통계 (센서 원시 데이터 기준)
  const onlineMotors = motors.filter(m => m.last_measured_at)
  const vibAnomaly   = onlineMotors.filter(m => Number(m.vel_y_rms ?? 0) > VEL_WARN).length
  const tempAnomaly  = onlineMotors.filter(m => Number(m.temperature_c ?? 0) > TEMP_WARN).length

  // 10대 기준 5열×2행 — 4열(8대)까지는 1fr로 화면 채움, 5열 이상은 고정폭으로 가로 스크롤
  const cols = Math.max(1, Math.ceil(sortedMotors.length / 2))
  const colTemplate = cols <= 4
    ? `repeat(${cols}, 1fr)`
    : `repeat(${cols}, 240px)`

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden p-3 sm:p-4 lg:p-5">
      {/* ── 헤더 ────────────────────────────────────────── */}
      <div className="mb-3 shrink-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">대시보드</h1>
          <span className="text-xs text-slate-400">30초마다 자동 갱신</span>
        </div>

        {/* 통계 바 */}
        <div className="flex items-center gap-1 mt-1.5 flex-wrap gap-y-1.5">
          <StatChip label="전체" value={motors.length} unit="대" dot="bg-slate-400" />
          <Divider />
          <StatChip label="진동 이상" value={vibAnomaly}  unit="대" dot={vibAnomaly  > 0 ? 'bg-amber-400' : 'bg-slate-300'} />
          <StatChip label="온도 이상" value={tempAnomaly} unit="대" dot={tempAnomaly > 0 ? 'bg-orange-400' : 'bg-slate-300'} />
        </div>
      </div>

      {/* ── AI 분석 리포트 ───────────────────────────────── */}
      <AiReportPanel />

      {/* ── 설비 현황 — 2행 가로 스크롤 ─────────────────── */}
      <div className="shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs sm:text-sm font-semibold text-slate-600 uppercase tracking-wide">
            설비 현황
          </h2>
          <Link href="/motors" className="text-xs text-blue-600 hover:underline">
            목록 보기 →
          </Link>
        </div>

        {/* 스켈레톤 */}
        {motorLoading && (
          <div className="overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: 'repeat(5, 240px)',
                gridTemplateRows: 'repeat(2, auto)',
                gridAutoFlow: 'column',
              }}
            >
              {[...Array(10)].map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-3 h-48 animate-pulse">
                  <div className="h-4 bg-slate-100 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 에러 */}
        {motorErr && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center text-red-600">
            <p className="font-semibold">데이터를 불러올 수 없습니다</p>
            <p className="text-sm mt-1">PostgreSQL 서버 연결을 확인해주세요</p>
          </div>
        )}

        {/* 카드 — 10대 기준 5열×2행, 초과 시 가로 스크롤 */}
        {!motorLoading && !motorErr && (
          <div className="overflow-x-auto pb-1" style={{ scrollbarWidth: 'thin' }}>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: colTemplate,
                gridTemplateRows: 'repeat(2, auto)',
                gridAutoFlow: 'column',
              }}
            >
              {sortedMotors.map(motor => (
                <MotorCard
                  key={motor.id}
                  motor={motor}
                  diagnosis={diagMap.get(motor.id)}
                  sparkline={sparklines[motor.id]}
                />
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

// ── 소형 컴포넌트 ─────────────────────────────────────────

function StatChip({ label, value, unit, dot, pulse = false }: {
  label: string; value: number; unit: string; dot: string; pulse?: boolean
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot} ${pulse ? 'animate-pulse' : ''}`} />
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value}</span>
      <span className="text-xs text-slate-400">{unit}</span>
    </div>
  )
}

function Divider() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5 sm:mx-1 hidden sm:block" />
}
