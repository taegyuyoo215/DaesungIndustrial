'use client'

import { useState, useEffect, useCallback } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import type { Layout, LayoutItem } from 'react-grid-layout/legacy'
import useSWR from 'swr'
import Link from 'next/link'
import type { TrendPoint } from '@/components/charts/TrendChart'
import MultiTrendChart from '@/components/charts/MultiTrendChart'
import StatusBadge from '@/components/StatusBadge'
import { fetcher } from '@/lib/fetcher'
import type {
  MotorStatus, Motor, Measurement, DiagnosisResult,
  Alarm, MaintenanceLog, ApiResponse, BearingFreqs, FftSpectrum,
} from '@/types'

const RGL = WidthProvider(GridLayout)

// ── 타입 ──────────────────────────────────────────────────

interface MotorDetailData {
  motor: Motor & { site_name: string }
  sensor: { id: number; serial_number: string; modbus_addr: number } | null
  latestMeasurement: Measurement | null
  latestDiagnosis: DiagnosisResult | null
  activeAlarms: Alarm[]
  maintenanceLogs: MaintenanceLog[]
  thresholds: { id: number; metric: string; warn_value: number; alarm_value: number }[]
}

interface TrendRow {
  bucket: string
  vel_y_avg: string | null
  kurtosis_y_avg: string | null
  temp_avg: string | null
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

const FAULT_DESC: Record<string, string> = {
  bearing_outer: '베어링 외륜 손상으로 인한 주기적 충격 신호가 감지됩니다. 방치 시 베어링 전체 파손으로 이어질 수 있습니다.',
  bearing_inner: '베어링 내륜 결함으로 인한 비정상 진동 패턴이 감지됩니다. 스핀들 손상으로 확대될 수 있습니다.',
  imbalance:     '회전체 불평형으로 인해 1× 회전 주파수 성분이 과도하게 검출됩니다. 지속 시 베어링 조기 마모를 유발합니다.',
  misalignment:  '축 오정렬로 인해 2× 및 고조파 성분이 증가하고 있습니다. 커플링과 베어링에 과부하가 걸립니다.',
  looseness:     '구조적 풀림으로 인한 다수의 고조파 성분이 감지됩니다. 2차 진동으로 인한 부품 파손 위험이 있습니다.',
  overheat:      '운전 온도가 허용 범위를 초과하였습니다. 지속 시 권선 절연 파괴 및 모터 소손 위험이 있습니다.',
}

const FAULT_ACTIONS: Record<string, string[]> = {
  bearing_outer: ['즉시 베어링 교체 일정 수립', '모니터링 주기 단축 (실시간 감시)', '교체 후 진동 재측정 확인'],
  bearing_inner: ['베어링 상태 정밀 점검', '윤활 상태 확인 및 보충', '교체 준비 및 스케줄링'],
  imbalance:     ['회전체 밸런싱 작업 실시', '체결 볼트 조임 상태 확인', '밸런싱 후 진동 재측정'],
  misalignment:  ['레이저 얼라이먼트 측정', '커플링 및 베어링 하중 분포 점검', '정렬 조정 후 진동 재측정'],
  looseness:     ['체결부 전수 점검 및 조임', '기초 볼트 및 방진 패드 상태 점검', '재체결 후 진동 재측정'],
  overheat:      ['냉각 시스템 및 통풍 점검', '부하 감소 또는 운전 중단 검토', '권선 절연 저항 측정'],
}

const VEL_WARN  = 2.8
const VEL_CRIT  = 7.1
const TEMP_WARN = 60
const TEMP_CRIT = 70
const KURT_WARN = 5.0
const KURT_CRIT = 8.0

// ── 위젯 레이아웃 기본값 & 저장/복원 ──────────────────────

const LAYOUT_STORAGE_KEY = 'motor-iq:dashboard-layout-v4'  // v4: 알람 위젯 분리

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'motor',  x: 0, y: 0, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'alarms', x: 3, y: 0, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'vel',    x: 6, y: 0, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'temp',   x: 9, y: 0, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'kurt',   x: 6, y: 4, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'trend',  x: 0, y: 8, w: 9, h: 12, minW: 3, minH: 4 },
  { i: 'ai',     x: 9, y: 4, w: 3, h: 12, minW: 2, minH: 4 },
]

function loadLayout(): LayoutItem[] {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const saved: LayoutItem[] = JSON.parse(raw)
    // 저장된 레이아웃에 새 항목이 없으면 기본값으로 보완
    const keys = new Set(saved.map(l => l.i))
    const merged = [...saved]
    for (const def of DEFAULT_LAYOUT) {
      if (!keys.has(def.i)) merged.push(def)
    }
    return merged
  } catch {
    return DEFAULT_LAYOUT
  }
}

function saveLayout(layout: LayoutItem[]) {
  try { localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout)) } catch { /* ignore */ }
}

// ── Widget 래퍼 ────────────────────────────────────────────

type AccentColor = 'blue' | 'orange' | 'purple' | 'emerald' | 'red' | 'amber' | 'slate' | 'indigo'

const ACCENT_CLS: Record<AccentColor, string> = {
  blue:    'border-l-blue-500',
  orange:  'border-l-orange-500',
  purple:  'border-l-purple-500',
  emerald: 'border-l-emerald-500',
  red:     'border-l-red-500',
  amber:   'border-l-amber-500',
  slate:   'border-l-slate-400',
  indigo:  'border-l-indigo-500',
}

function Widget({
  title,
  accent = 'slate',
  icon,
  action,
  children,
  className = '',
  compact = false,
}: {
  title:      string
  accent?:    AccentColor
  icon?:      React.ReactNode
  action?:    React.ReactNode
  children:   React.ReactNode
  className?: string
  compact?:   boolean
}) {
  return (
    <div className={`h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex flex-col overflow-hidden ${className}`}>
      {/* 헤더 — 드래그 핸들 (편집 모드에서만 grab 커서) */}
      <div
        className={`widget-drag-handle flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-200 dark:border-slate-800 border-l-[3px] ${ACCENT_CLS[accent]} shrink-0 select-none`}
      >
        <div className="flex items-center gap-1.5">
          {/* 그립 아이콘 */}
          <svg className="w-3 h-3 text-slate-300 dark:text-slate-700 shrink-0" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2"  r="1.2"/><circle cx="8" cy="2"  r="1.2"/>
            <circle cx="2" cy="8"  r="1.2"/><circle cx="8" cy="8"  r="1.2"/>
            <circle cx="2" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/>
          </svg>
          {icon && <span className="text-slate-400 dark:text-slate-500 text-sm leading-none">{icon}</span>}
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 tracking-wide">{title}</span>
        </div>
        {/* 액션 영역: 드래그 이벤트 차단 */}
        {action && (
          <div
            className="text-xs cursor-auto"
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
          >
            {action}
          </div>
        )}
      </div>
      {/* 콘텐츠 */}
      <div className={`flex-1 min-h-0 relative overflow-hidden ${compact ? '' : 'flex flex-col p-4'}`}>
        {children}
      </div>
    </div>
  )
}

// ── 모터 선택 칩 ──────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  normal:   'bg-emerald-500',
  warning:  'bg-amber-500',
  critical: 'bg-red-500',
}

function MotorChip({
  motor, selected, onClick,
}: {
  motor: MotorStatus; selected: boolean; onClick: () => void
}) {
  const isOffline = !motor.last_measured_at
  const severity  = isOffline ? 'normal' : motor.severity

  const cls = selected
    ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
    : severity === 'critical'
      ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800 text-red-800 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
      : severity === 'warning'
        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/30'
        : 'bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-all shrink-0 ${cls}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${selected ? 'bg-white/80' : STATUS_DOT[severity]}`} />
      {motor.name}
    </button>
  )
}

// ── 지표 위젯 ─────────────────────────────────────────────

function MetricWidget({
  title, value, unit, delta, warn, crit,
  format = String, offline = false, accent,
}: {
  title: string; value: number; unit: string
  delta?: number | null; warn: number; crit: number
  format?: (v: number) => string; offline?: boolean; accent: AccentColor
}) {
  const isCrit = !offline && value >= crit
  const isWarn = !offline && !isCrit && value >= warn

  const valCl = offline ? 'text-slate-300 dark:text-slate-600'
              : isCrit  ? 'text-red-600 dark:text-red-400'
              : isWarn  ? 'text-amber-500 dark:text-amber-400'
              : 'text-slate-800 dark:text-slate-100'

  const status = offline ? null
    : isCrit ? { text: '임계', badge: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',       bar: 'bg-red-500'     }
    : isWarn ? { text: '주의', badge: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400', bar: 'bg-amber-400'   }
    :          { text: '정상', badge: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400', bar: 'bg-emerald-500' }

  // 게이지 범위: 0 ~ crit×1.25 (경보 위로 여유 공간 확보)
  const gaugeMax  = crit * 1.25
  const gaugePct  = offline ? 0 : Math.min(100, Math.round((value / gaugeMax) * 100))
  const warnPct   = Math.round((warn / gaugeMax) * 100)
  const critPct   = Math.round((crit / gaugeMax) * 100)

  const deltaVal  = delta != null && Math.abs(delta) >= 0.01 ? delta : null

  return (
    <div className={`h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex flex-col overflow-hidden border-l-[3px] ${ACCENT_CLS[accent]}`}>

      {/* 드래그 핸들 헤더 */}
      <div className="widget-drag-handle flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-100 dark:border-slate-800 shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-slate-300 dark:text-slate-700 shrink-0" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2"  r="1.2"/><circle cx="8" cy="2"  r="1.2"/>
            <circle cx="2" cy="8"  r="1.2"/><circle cx="8" cy="8"  r="1.2"/>
            <circle cx="2" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/>
          </svg>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{title}</span>
        </div>
        {status && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${status.badge}`}>
            {status.text}
          </span>
        )}
      </div>

      {/* 측정값 영역 */}
      <div className="flex-1 min-h-0 flex flex-col justify-center px-4 py-2">
        <div className="flex items-baseline gap-1.5">
          <span className={`text-3xl font-black tabular-nums leading-none ${valCl}`}>
            {offline ? '—' : format(value)}
          </span>
          {unit && !offline && (
            <span className="text-sm font-medium text-slate-400 dark:text-slate-500">{unit}</span>
          )}
        </div>
        {!offline && deltaVal != null && (
          <span className={`text-[10px] font-medium mt-1 ${deltaVal > 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-500 dark:text-emerald-400'}`}>
            {deltaVal > 0 ? '▲' : '▼'} {Math.abs(deltaVal) < 1 ? Math.abs(deltaVal).toFixed(2) : Math.abs(deltaVal).toFixed(1)}
            <span className="text-slate-400 dark:text-slate-600 font-normal"> 24h 전 대비</span>
          </span>
        )}
      </div>

      {/* 게이지 바 */}
      <div className="px-3 pb-3 shrink-0">
        <div className="relative h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="absolute top-0 h-full w-0.5 bg-amber-300 dark:bg-amber-600 z-10" style={{ left: `${warnPct}%` }} />
          <div className="absolute top-0 h-full w-0.5 bg-red-300 dark:bg-red-700 z-10" style={{ left: `${critPct}%` }} />
          <div
            className={`h-full rounded-full transition-all duration-500 ${status?.bar ?? 'bg-slate-300 dark:bg-slate-600'}`}
            style={{ width: `${gaugePct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-slate-300 dark:text-slate-700">0</span>
          <span className="text-[9px] text-amber-400 dark:text-amber-600">△ {warn}</span>
          <span className="text-[9px] text-red-400 dark:text-red-600">⚠ {crit}</span>
        </div>
      </div>

    </div>
  )
}

// ── FFT 요약 (AI 진단 위젯 내부) ──────────────────────────

interface FftApiData {
  bearingFreqs: BearingFreqs
  spectra: FftSpectrum[]
  faultTrend: import('@/types').FftTrendItem[]
}

const FAULT_COLORS_DASH: Record<string, string> = {
  '1X': '#3b82f6', '2X': '#8b5cf6', 'BPFO': '#ef4444', 'BPFI': '#f97316',
}
const TREND_ICON_DASH  = { rising: '↑', stable: '→', falling: '↓' } as const
const TREND_COLOR_DASH = { rising: 'text-amber-400', stable: 'text-slate-500', falling: 'text-emerald-400' } as const

function FftSummaryInDiagnosis({ motorId }: { motorId: number }) {
  const { data, isLoading } = useSWR<FftApiData>(
    `/api/fft?motor_id=${motorId}&axis=x&limit=3`,  // limit=3 for trend
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false }
  )

  if (isLoading) {
    return (
      <div className="flex items-center gap-1.5 py-1">
        <span className="w-3 h-3 border border-cyan-500/60 border-t-cyan-500 rounded-full animate-spin shrink-0" />
        <span className="text-[10px] text-slate-500">FFT 불러오는 중...</span>
      </div>
    )
  }

  const spec      = data?.spectra[0]
  const freqs     = data?.bearingFreqs
  const trendData = data?.faultTrend ?? []

  if (!spec || !freqs) {
    return <p className="text-[10px] text-slate-500 py-1">FFT 데이터 없음</p>
  }

  // 표시할 주요 4개 항목 (trend 데이터 우선, 없으면 순간값으로 fallback)
  const TOL = 5
  const ampAt = (target: number) => {
    if (!spec.freq_bins.length) return 0
    const idx = spec.freq_bins.reduce((best, f, i) =>
      Math.abs(f - target) < Math.abs(spec.freq_bins[best] - target) ? i : best, 0)
    return Math.abs(spec.freq_bins[idx] - target) <= TOL ? spec.amp_bins[idx] : 0
  }

  const KEY_LABELS = ['1X', '2X', 'BPFO', 'BPFI']
  const keyItems = KEY_LABELS.map(lbl => {
    const trendItem = trendData.find(t => t.label === lbl)
    const freq = lbl === '1X' ? freqs.f1x : lbl === '2X' ? freqs.f2x
               : lbl === 'BPFO' ? freqs.bpfo : freqs.bpfi
    const amp  = trendItem?.currentAmp ?? ampAt(freq)
    const warn = trendItem?.warnThreshold ?? (lbl === '1X' ? 3.0 : lbl === '2X' ? 2.5 : 1.0)
    return { label: lbl, freq, amp, warn, trendItem }
  })

  // 종합 FFT 상태
  const overallFftStat =
    trendData.some(t => t.status === 'warning')       ? 'warning'
    : trendData.some(t => t.status === 'early_warning') ? 'early_warning'
    : 'normal'

  // 상황 설명 문구 생성
  const FAULT_KO: Record<string, string> = {
    '1X': '불평형', '2X': '오정렬',
    'BPFO': '베어링 외륜 결함', 'BPFI': '베어링 내륜 결함',
    'BSF': '볼 결함', 'FTF': '케이지 결함',
  }
  const summaryDesc = (() => {
    if (overallFftStat === 'normal') {
      return { text: '모든 결함 주파수에서 이상 신호가 감지되지 않았습니다.', color: 'text-emerald-500 dark:text-emerald-400' }
    }
    // 가장 심각한 항목 하나 선택
    const dominant = trendData
      .filter(t => t.status !== 'normal')
      .sort((a, b) => {
        const r = { warning: 0, early_warning: 1, normal: 2 }
        return r[a.status] - r[b.status]
      })[0]
    if (!dominant) return null
    const name = FAULT_KO[dominant.label] ?? dominant.label
    if (dominant.status === 'warning') {
      return {
        text: `${dominant.label}(${dominant.freq}Hz) 진폭 ${dominant.currentAmp.toFixed(3)} mm/s — 경보 임계값(${dominant.warnThreshold} mm/s)을 초과했습니다. ${name} 의심.`,
        color: 'text-red-400',
      }
    }
    const dir = dominant.rateOfChange >= 0 ? `+${dominant.rateOfChange}%` : `${dominant.rateOfChange}%`
    return {
      text: `${dominant.label}(${dominant.freq}Hz) 진폭이 ${dir} 상승 추세입니다. raw 지표는 정상이나 ${name} 조기 징후로 판단됩니다.`,
      color: 'text-amber-400',
    }
  })()

  // 미니 SVG 스펙트럼
  const W = 100, H = 38
  const maxAmp = Math.max(...spec.amp_bins, 0.01)
  const faultFreqColors: [number, string][] = [
    [freqs.f1x, '#3b82f6'], [freqs.f2x, '#8b5cf6'],
    [freqs.bpfo, '#ef4444'], [freqs.bpfi, '#f97316'],
  ]

  return (
    <div className="space-y-2.5">
      {/* 헤더 + FFT 종합 상태 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400">FFT 분석 요약</p>
          {overallFftStat === 'early_warning' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400">
              조기경보
            </span>
          )}
          {overallFftStat === 'warning' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-900/40 text-red-400">
              경보
            </span>
          )}
        </div>
        <Link
          href="/fft"
          className="text-[10px] text-blue-500 dark:text-blue-400 hover:underline"
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          전체 분석 →
        </Link>
      </div>

      {/* 상황 설명 */}
      {summaryDesc && (
        <p className={`text-[11px] leading-relaxed ${summaryDesc.color}`}>
          {summaryDesc.text}
        </p>
      )}

      {/* 미니 스펙트럼 */}
      <div className="rounded-lg bg-slate-100 dark:bg-slate-800/60 px-2 pt-1.5 pb-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-14">
          {[0.33, 0.66].map(r => (
            <line key={r} x1="0" y1={H * r} x2={W} y2={H * r}
              stroke="currentColor" strokeWidth="0.4" className="text-slate-300 dark:text-slate-700" />
          ))}
          {spec.freq_bins.map((freq, i) => {
            const barH = Math.max((spec.amp_bins[i] / maxAmp) * (H - 2), 0.5)
            const x    = i * (W / spec.freq_bins.length) + 0.3
            const bW   = Math.max(W / spec.freq_bins.length - 0.8, 0.5)
            const y    = H - barH
            let color = '#475569'; let opacity = 0.55
            for (const [faultFreq, faultColor] of faultFreqColors) {
              if (Math.abs(freq - faultFreq) <= TOL) { color = faultColor; opacity = 1; break }
            }
            return <rect key={i} x={x} y={y} width={bW} height={barH} fill={color} fillOpacity={opacity} rx="0.2" />
          })}
        </svg>
        <div className="flex justify-between">
          {['0', '250', '500', '750', '1k'].map(f => (
            <span key={f} className="text-[8px] text-slate-400 dark:text-slate-600">{f}Hz</span>
          ))}
        </div>
      </div>

      {/* 결함 주파수 진폭 + 추세 */}
      <div className="space-y-1.5">
        {keyItems.map(({ label, freq, amp, warn, trendItem }) => {
          const exceeded = amp >= warn
          const isEarlyWarn = trendItem?.status === 'early_warning'
          const pct = Math.min(100, (amp / (warn * 1.5)) * 100)
          const color = FAULT_COLORS_DASH[label] ?? '#94a3b8'
          const trendIcon  = trendItem ? TREND_ICON_DASH[trendItem.trend]  : null
          const trendColor = trendItem ? TREND_COLOR_DASH[trendItem.trend] : ''
          return (
            <div key={label} className="flex items-center gap-2">
              <span className="text-[10px] font-bold w-8 shrink-0" style={{ color }}>{label}</span>
              <span className="text-[9px] text-slate-400 dark:text-slate-600 w-10 shrink-0 tabular-nums">{freq}Hz</span>
              <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: exceeded ? color : isEarlyWarn ? '#f59e0b' : '#475569' }}
                />
              </div>
              {/* 추세 화살표 */}
              {trendIcon && (
                <span className={`text-[10px] font-bold w-3 shrink-0 ${trendColor}`}>{trendIcon}</span>
              )}
              <span className={`text-[10px] font-mono font-semibold w-11 text-right shrink-0
                ${exceeded ? 'text-red-400'
                  : isEarlyWarn ? 'text-amber-400'
                  : 'text-slate-400 dark:text-slate-600'}`}>
                {amp.toFixed(3)}
              </span>
            </div>
          )
        })}
      </div>

      {/* RPM 정보 */}
      <p className="text-[9px] text-slate-400 dark:text-slate-600 tabular-nums">
        기준 RPM: {freqs.rpm}
        {spec.measured_at && (
          <> · {new Date(spec.measured_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</>
        )}
      </p>
    </div>
  )
}

// ── AI 진단 콘텐츠 ─────────────────────────────────────────

function DiagnosisContent({
  diagnosis, motorId, motorRunning, latestMeasurement,
}: {
  diagnosis: DiagnosisResult | null
  motorId?: number
  motorRunning?: boolean | null
  latestMeasurement?: Measurement | null
}) {
  // 모터 정지 중이면 정지 상태 표시
  if (motorRunning === false) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4" style={{ scrollbarWidth: 'thin' }}>
        <div className="flex items-center gap-2.5 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5">
          <span className="text-xl">⏹</span>
          <div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">모터 정지 중</p>
            <p className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">정지 상태에서는 진단이 수행되지 않습니다.</p>
          </div>
        </div>
        {motorId != null && (
          <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
            <FftSummaryInDiagnosis motorId={motorId} />
          </div>
        )}
      </div>
    )
  }

  if (!diagnosis)
    return <p className="text-sm text-slate-400">진단 데이터 없음</p>

  const isNormal = diagnosis.fault_type === 'normal' || diagnosis.severity === 'normal'
  const isCrit   = diagnosis.severity === 'critical'
  const conf     = diagnosis.confidence != null ? Math.round(Number(diagnosis.confidence)) : null
  const rul      = diagnosis.rul_days
  const evidence = diagnosis.evidence

  const rulColor = rul == null ? 'text-slate-300 dark:text-slate-600' : rul <= 7 ? 'text-red-600 dark:text-red-400' : rul <= 30 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
  const rulBarCl = rul == null ? 'bg-slate-200 dark:bg-slate-700'    : rul <= 7 ? 'bg-red-500'   : rul <= 30 ? 'bg-amber-500'   : 'bg-emerald-500'
  const rulMsg   = rul == null ? '' : rul <= 7 ? '즉시 조치 필요' : rul <= 30 ? '단기 정비 계획 수립 필요' : '정상 범위 내'
  const rulPct   = rul != null ? Math.min(100, Math.round((rul / 90) * 100)) : 0

  const desc    = diagnosis.fault_type ? FAULT_DESC[diagnosis.fault_type]    : undefined
  const actions = diagnosis.fault_type ? FAULT_ACTIONS[diagnosis.fault_type] : undefined

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4" style={{ scrollbarWidth: 'thin' }}>

      <p className="text-[10px] text-slate-400 dark:text-slate-600">
        {new Date(diagnosis.diagnosed_at).toLocaleString('ko-KR', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })}
      </p>

      {isNormal ? (
        <div className="flex items-center gap-2.5 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2.5">
          <span className="text-xl">🟢</span>
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">이상 없음 — 정상 상태</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-0.5">현재 측정값이 모든 임계값 이내입니다.</p>
          </div>
        </div>
      ) : (
        <div className={`rounded-lg px-3 py-2.5 ${isCrit ? 'bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40' : 'bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40'}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-base font-bold text-slate-800 dark:text-slate-100">
              {FAULT_LABELS[diagnosis.fault_type ?? ''] ?? diagnosis.fault_type ?? '알 수 없음'}
            </p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${isCrit ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
              {isCrit ? '경보' : '주의'}
            </span>
          </div>
          {desc && <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>}
        </div>
      )}

      {conf != null && (
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-500">모델 신뢰도</span>
            <span className="text-xs font-bold tabular-nums dark:text-slate-300">{conf}%</span>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${isCrit ? 'bg-red-500' : isNormal ? 'bg-emerald-500' : 'bg-amber-500'}`}
              style={{ width: `${conf}%` }}
            />
          </div>
        </div>
      )}

      {rul != null && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-slate-500 dark:text-slate-500">잔여수명 (RUL)</span>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black tabular-nums ${rulColor}`}>{rul}</span>
              <span className="text-xs text-slate-400 dark:text-slate-600">일</span>
            </div>
          </div>
          <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${rulBarCl}`} style={{ width: `${rulPct}%` }} />
          </div>
          <p className={`text-[11px] font-semibold mt-1.5 ${rulColor}`}>{rulMsg}</p>
        </div>
      )}

      {evidence?.metrics && evidence.metrics.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">진단 근거</p>
          <div className="space-y-2">
            {evidence.metrics.map((m, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className={`text-xs ${m.exceeded ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-slate-500 dark:text-slate-500'}`}>
                  {m.exceeded ? '⚠ ' : ''}{m.label}
                </span>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <span className={`text-xs font-bold ${m.exceeded ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>{m.value}</span>
                  <span className="text-[10px] text-slate-300 dark:text-slate-700">/</span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-600">{m.threshold}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* raw 지표 배지 (crest / hf_accel) */}
      {latestMeasurement && (
        <div className="flex flex-wrap gap-1.5">
          {(() => {
            const crest = Number(latestMeasurement.crest_x ?? 0)
            const hf    = Number(latestMeasurement.hf_accel_x_rms ?? 0)
            const items = []
            if (crest > 0) {
              const s = crest >= 4.0 ? { cls: 'bg-red-900/40 text-red-400', label: `Crest ${crest.toFixed(2)} ⚠` }
                      : crest >= 2.5 ? { cls: 'bg-amber-900/30 text-amber-400', label: `Crest ${crest.toFixed(2)} △` }
                      :                { cls: 'bg-slate-800 text-slate-500', label: `Crest ${crest.toFixed(2)}` }
              items.push(<span key="crest" className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.cls}`}>{s.label}</span>)
            }
            if (hf > 0) {
              const s = hf >= 3.0 ? { cls: 'bg-red-900/40 text-red-400', label: `HF ${hf.toFixed(2)}g ⚠` }
                      : hf >= 1.5 ? { cls: 'bg-amber-900/30 text-amber-400', label: `HF ${hf.toFixed(2)}g △` }
                      :             { cls: 'bg-slate-800 text-slate-500', label: `HF ${hf.toFixed(2)}g` }
              items.push(<span key="hf" className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${s.cls}`}>{s.label}</span>)
            }
            return items
          })()}
        </div>
      )}

      {!isNormal && actions && (
        <div>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">권장 조치</p>
          <ol className="space-y-1.5">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${isCrit ? 'bg-red-500' : 'bg-amber-500'}`}>
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* FFT 분석 요약 */}
      {motorId != null && (
        <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
          <FftSummaryInDiagnosis motorId={motorId} />
        </div>
      )}

    </div>
  )
}

// ── 추이 차트 탭 위젯 ─────────────────────────────────────

export type TrendRangeKey = '1h' | '24h' | '7d' | '30d'

export const TREND_RANGE_OPTIONS: { key: TrendRangeKey; label: string; hours: number; bucket: string }[] = [
  { key: '1h',  label: '1시간', hours: 1,   bucket: 'minute' },
  { key: '24h', label: '24시간', hours: 24,  bucket: 'hour'   },
  { key: '7d',  label: '7일',   hours: 168, bucket: 'hour'   },
  { key: '30d', label: '30일',  hours: 720, bucket: 'day'    },
]


function TrendTabWidget({
  velTrend, tempTrend, kurtTrend, trendRange, onRangeChange,
}: {
  velTrend:      TrendPoint[]
  tempTrend:     TrendPoint[]
  kurtTrend:     TrendPoint[]
  trendRange:    TrendRangeKey
  onRangeChange: (r: TrendRangeKey) => void
}) {
  const rangeLabel = TREND_RANGE_OPTIONS.find(r => r.key === trendRange)?.label ?? ''

  return (
    <div className="h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex flex-col overflow-hidden">

      {/* 헤더: 타이틀 + 기간 토글 */}
      <div className="widget-drag-handle flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-200 dark:border-slate-800 border-l-[3px] border-l-blue-500 shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-slate-300 dark:text-slate-700 shrink-0" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2"  r="1.2"/><circle cx="8" cy="2"  r="1.2"/>
            <circle cx="2" cy="8"  r="1.2"/><circle cx="8" cy="8"  r="1.2"/>
            <circle cx="2" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/>
          </svg>
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 tracking-wide">
            추이 차트 (최근 {rangeLabel})
          </span>
        </div>

        {/* 기간 토글 — 드래그 이벤트 차단 */}
        <div
          className="flex rounded-md overflow-hidden border border-slate-200 dark:border-slate-700 cursor-auto"
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          {TREND_RANGE_OPTIONS.map(opt => (
            <button
              key={opt.key}
              onClick={() => onRangeChange(opt.key)}
              className={`text-[10px] px-2 py-1 font-medium transition-colors ${
                trendRange === opt.key
                  ? 'bg-slate-700 dark:bg-slate-200 text-white dark:text-slate-900'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="flex-1 min-h-0 p-3">
        <MultiTrendChart
          velData={velTrend}
          tempData={tempTrend}
          kurtData={kurtTrend}
        />
      </div>

    </div>
  )
}

// ── 위젯 대시보드 ─────────────────────────────────────────

function MotorDashboard({
  selectedStatus, detail, trendData, isLoading, isEditing, trendRange, onRangeChange,
}: {
  selectedStatus: MotorStatus | undefined
  detail:         MotorDetailData | undefined
  trendData:      TrendRow[]
  isLoading:      boolean
  isEditing:      boolean
  trendRange:     TrendRangeKey
  onRangeChange:  (r: TrendRangeKey) => void
}) {
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setLayout(loadLayout())
    setMounted(true)
  }, [])

  const handleLayoutChange = useCallback((newLayout: Layout) => {
    const mutable = [...newLayout] as LayoutItem[]
    setLayout(mutable)
    saveLayout(mutable)
  }, [])

  const resetLayout = () => {
    setLayout(DEFAULT_LAYOUT)
    saveLayout(DEFAULT_LAYOUT)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-slate-400 dark:text-slate-600 text-sm">
        <span className="w-4 h-4 border-2 border-slate-300 dark:border-slate-700 border-t-slate-600 dark:border-t-slate-400 rounded-full animate-spin" />
        데이터 불러오는 중...
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 dark:text-slate-600 text-sm">
        모터 데이터를 불러올 수 없습니다
      </div>
    )
  }

  const { motor, latestDiagnosis, activeAlarms, latestMeasurement, sensor, maintenanceLogs } = detail
  const m         = selectedStatus
  const isOffline = !latestMeasurement

  const vel  = Number(latestMeasurement?.vel_y_rms     ?? 0)
  const temp = Number(latestMeasurement?.temperature_c ?? 0)
  const kurt = Number(latestMeasurement?.kurtosis_y    ?? 0)

  const timeOffset = trendData.length > 0
    ? Date.now() - new Date(trendData[trendData.length - 1].bucket).getTime()
    : 0
  const shiftTime = (bucket: string) =>
    new Date(new Date(bucket).getTime() + timeOffset).toISOString()

  const velTrend:  TrendPoint[] = trendData.map(r => ({ time: shiftTime(r.bucket), value: r.vel_y_avg      != null ? Number(r.vel_y_avg)      : null }))
  const tempTrend: TrendPoint[] = trendData.map(r => ({ time: shiftTime(r.bucket), value: r.temp_avg       != null ? Number(r.temp_avg)       : null }))
  const kurtTrend: TrendPoint[] = trendData.map(r => ({ time: shiftTime(r.bucket), value: r.kurtosis_y_avg != null ? Number(r.kurtosis_y_avg) : null }))

  const motorMeta = [
    motor.location,
    motor.site_name,
    motor.rated_power_kw && `${motor.rated_power_kw}kW`,
    motor.rated_rpm      && `${motor.rated_rpm}RPM`,
  ].filter(Boolean).join(' · ')

  const activeCount = activeAlarms.filter(a => a.state !== 'resolved')
  const severity: AccentColor = isOffline ? 'slate' : m?.severity === 'critical' ? 'red' : m?.severity === 'warning' ? 'amber' : 'emerald'

  if (!mounted) return null

  return (
    <div className="pb-4">
      {/* 편집 모드 툴바 */}
      {isEditing && (
        <div className="flex items-center justify-between mb-3 px-1 py-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 dark:bg-cyan-500/10">
          <div className="flex items-center gap-2 text-xs text-cyan-600 dark:text-cyan-400 font-medium pl-2">
            <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
              <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
            </svg>
            위젯을 드래그하여 이동하거나, 모서리를 드래그하여 크기를 조절하세요
          </div>
          <button
            onClick={resetLayout}
            className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors px-2 py-1 rounded hover:bg-white/60 dark:hover:bg-slate-800"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 8a6 6 0 1 0 1.5-4" strokeLinecap="round"/>
              <path d="M2 4v4h4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            초기화
          </button>
        </div>
      )}

      <RGL
        layout={layout}
        cols={12}
        rowHeight={50}
        margin={[8, 8]}
        containerPadding={[0, 0]}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".widget-drag-handle"
        resizeHandles={['s', 'w', 'e', 'n', 'sw', 'se', 'nw', 'ne']}
        isDraggable={isEditing}
        isResizable={isEditing}
      >

        {/* ─ 모터 상태 */}
        <div key="motor" className="h-full">
          <Widget
            title="모터 상태"
            accent={severity}
            icon="⚙"
            action={
              <Link href={`/motors/${motor.id}`} className="text-blue-500 hover:underline">
                상세 →
              </Link>
            }
          >
            <div className="flex flex-col h-full justify-between">
              {/* 모터명 + 상태 */}
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">{motor.name}</h2>
                  <StatusBadge status={isOffline ? 'offline' : (m?.severity ?? 'normal')} />
                </div>
                {motorMeta && <p className="text-[11px] text-slate-400 dark:text-slate-500">{motorMeta}</p>}
                {latestMeasurement?.time && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">
                    마지막 측정:{' '}
                    {new Date(latestMeasurement.time).toLocaleString('ko-KR', {
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>

              {/* 센서 정보 */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wide mb-1">센서 정보</p>
                {sensor ? (
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-500">시리얼</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{sensor.serial_number}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-500">Modbus 주소</span>
                      <span className="font-mono text-slate-700 dark:text-slate-300">{sensor.modbus_addr}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 dark:text-slate-600">연결된 센서 없음</p>
                )}
              </div>

              {/* 정비 이력 요약 */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-2">
                <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wide mb-1">정비 이력</p>
                {maintenanceLogs.length === 0 ? (
                  <p className="text-[11px] text-slate-400 dark:text-slate-600">정비 기록 없음</p>
                ) : (
                  <div className="space-y-1">
                    {maintenanceLogs.slice(0, 2).map(log => (
                      <div key={log.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 dark:text-slate-600 shrink-0">
                          {new Date(log.performed_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                        </span>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 truncate">{log.description}</p>
                      </div>
                    ))}
                    {maintenanceLogs.length > 2 && (
                      <Link href="/maintenance" className="text-[11px] text-blue-600 hover:underline block">
                        +{maintenanceLogs.length - 2}건 더 보기
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Widget>
        </div>

        {/* ─ 활성 알람 */}
        <div key="alarms" className="h-full">
          <Widget
            title="활성 알람"
            icon="🔔"
            accent={activeCount.some(a => a.severity === 'critical') ? 'red' : activeCount.length > 0 ? 'amber' : 'slate'}
            action={
              <Link href="/alarms" className="text-blue-500 hover:underline text-xs">
                전체 →
              </Link>
            }
          >
            <div className="flex flex-col h-full">
              {activeCount.length === 0 ? (
                <div className="flex-1 flex items-center justify-center gap-1.5 text-emerald-600">
                  <span>🟢</span>
                  <span className="text-xs font-medium">활성 알람 없음</span>
                </div>
              ) : (
                <>
                  <p className="text-[10px] text-slate-400 dark:text-slate-600 mb-2 shrink-0">
                    총 <span className="font-semibold text-slate-700 dark:text-slate-300">{activeCount.length}</span>건 활성
                  </p>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                    {activeCount.map(alarm => (
                      <div key={alarm.id} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg ${alarm.severity === 'critical' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-px ${alarm.severity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                          {alarm.severity === 'critical' ? '경보' : '주의'}
                        </span>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">{alarm.message ?? '알람 발생'}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </Widget>
        </div>

        {/* ─ 진동 RMS */}
        <div key="vel" className="h-full">
          <MetricWidget
            title="진동 RMS (Y축)" value={vel} unit="mm/s"
            delta={m?.vel_y_delta} warn={VEL_WARN} crit={VEL_CRIT}
            format={v => v.toFixed(2)} offline={isOffline} accent="blue"
          />
        </div>

        {/* ─ 온도 */}
        <div key="temp" className="h-full">
          <MetricWidget
            title="온도" value={temp} unit="°C"
            delta={m?.temp_delta} warn={TEMP_WARN} crit={TEMP_CRIT}
            format={v => Math.round(v).toString()} offline={isOffline} accent="orange"
          />
        </div>

        {/* ─ Kurtosis */}
        <div key="kurt" className="h-full">
          <MetricWidget
            title="Kurtosis (Y축)" value={kurt} unit=""
            warn={KURT_WARN} crit={KURT_CRIT}
            format={v => v.toFixed(2)} offline={isOffline} accent="purple"
          />
        </div>

        {/* ─ 추이 차트 (탭) */}
        <div key="trend" className="h-full">
          <TrendTabWidget
            velTrend={velTrend}
            tempTrend={tempTrend}
            kurtTrend={kurtTrend}
            trendRange={trendRange}
            onRangeChange={onRangeChange}
          />
        </div>

        {/* ─ AI 진단 */}
        <div key="ai" className="h-full">
          <Widget title="AI 진단" accent="emerald" icon="✦">
            <DiagnosisContent
              diagnosis={latestDiagnosis}
              motorId={motor.id}
              motorRunning={latestMeasurement?.motor_running}
              latestMeasurement={latestMeasurement}
            />
          </Widget>
        </div>

      </RGL>
    </div>
  )
}

// ── 대시보드 페이지 ───────────────────────────────────────

export default function DashboardPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [trendRange, setTrendRange] = useState<TrendRangeKey>('1h')

  const { data: motorRes, mutate: mutateMotors } =
    useSWR<ApiResponse<MotorStatus[]>>('/api/motors', fetcher, {
      refreshInterval: 10_000,
      onSuccess: () => setLastUpdated(new Date()),
    })

  const motors = motorRes?.data ?? []

  useEffect(() => {
    if (selectedId !== null || motors.length === 0) return
    const first =
      motors.find(m => m.severity === 'critical') ??
      motors.find(m => m.severity === 'warning')  ??
      motors[0]
    if (first) setSelectedId(first.id)
  }, [motors, selectedId])

  const { data: detailRes, isLoading: detailLoading, mutate: mutateDetail } =
    useSWR<{ data: MotorDetailData }>(
      selectedId ? `/api/motors/${selectedId}` : null,
      fetcher, { refreshInterval: 10_000 }
    )

  const selectedRangeOpt = TREND_RANGE_OPTIONS.find(r => r.key === trendRange)!

  const { data: trendRes, mutate: mutateTrend } =
    useSWR<{ data: TrendRow[] }>(
      selectedId
        ? `/api/motors/${selectedId}/measurements?hours=${selectedRangeOpt.hours}&bucket=${selectedRangeOpt.bucket}&anchor=latest`
        : null,
      fetcher, { refreshInterval: 10_000 }
    )

  useEffect(() => {
    const run = async () => {
      try {
        await fetch('/api/dev/simulate', { method: 'POST' })
        await Promise.all([mutateMotors(), mutateDetail(), mutateTrend()])
      } catch { /* ignore */ }
    }
    run()
    const id = setInterval(run, 10_000)
    return () => clearInterval(id)
  }, [mutateMotors, mutateDetail, mutateTrend])

  const detail         = detailRes?.data
  const trendData      = trendRes?.data ?? []
  const selectedStatus = motors.find(m => m.id === selectedId)

  const critCount = motors.filter(m => m.severity === 'critical').length
  const warnCount = motors.filter(m => m.severity === 'warning').length

  return (
    <div className="min-h-[100dvh] flex flex-col p-3 sm:p-4 lg:p-5">

      {/* ── 헤더 */}
      <div className="flex items-center justify-between gap-2 mb-3 shrink-0 flex-wrap gap-y-1.5">
        <div className="flex items-center gap-3 flex-wrap gap-y-1.5">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">대시보드</h1>
          <div className="flex items-center gap-1.5">
            <StatChip label="전체"  value={motors.length} unit="대" dot="bg-slate-400" />
            {critCount > 0 && <StatChip label="경보" value={critCount} unit="대" dot="bg-red-500" />}
            {warnCount > 0 && <StatChip label="주의" value={warnCount} unit="대" dot="bg-amber-400" />}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400 dark:text-slate-600">
            {lastUpdated
              ? `업데이트 ${lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : '업데이트 중...'}
          </span>
          {/* 편집 / 완료 버튼 */}
          <button
            onClick={() => setIsEditing(e => !e)}
            className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border transition-all ${
              isEditing
                ? 'bg-cyan-500 dark:bg-cyan-500 text-white border-cyan-500 shadow-sm shadow-cyan-500/30'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {isEditing ? (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M2 8l4 4 8-8"/>
                </svg>
                완료
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 2a1.5 1.5 0 0 1 3 3L5 14H2v-3L11 2z"/>
                </svg>
                편집
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── 모터 선택 칩 */}
      <div
        className="flex items-center gap-2 overflow-x-auto pb-1.5 mb-3 shrink-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {motors.length === 0
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 w-20 bg-slate-100 rounded-lg animate-pulse shrink-0" />
            ))
          : motors.map(motor => (
              <MotorChip
                key={motor.id}
                motor={motor}
                selected={selectedId === motor.id}
                onClick={() => setSelectedId(motor.id)}
              />
            ))
        }
      </div>

      {/* ── 위젯 그리드 */}
      <div className="flex-1">
        {selectedId === null ? (
          <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
            위에서 모터를 선택하세요
          </div>
        ) : (
          <MotorDashboard
            selectedStatus={selectedStatus}
            detail={detail}
            trendData={trendData}
            isLoading={detailLoading}
            isEditing={isEditing}
            trendRange={trendRange}
            onRangeChange={setTrendRange}
          />
        )}
      </div>

    </div>
  )
}

// ── 소형 컴포넌트 ─────────────────────────────────────────

function StatChip({ label, value, unit, dot }: {
  label: string; value: number; unit: string; dot: string
}) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{value}</span>
      <span className="text-xs text-slate-400 dark:text-slate-600">{unit}</span>
    </div>
  )
}
