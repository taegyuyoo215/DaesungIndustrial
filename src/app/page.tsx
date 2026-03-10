'use client'

import { useState, useEffect, useCallback } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import type { Layout, LayoutItem } from 'react-grid-layout/legacy'
import useSWR from 'swr'
import Link from 'next/link'
import TrendChart from '@/components/charts/TrendChart'
import type { TrendPoint } from '@/components/charts/TrendChart'
import StatusBadge from '@/components/StatusBadge'
import { fetcher } from '@/lib/fetcher'
import type {
  MotorStatus, Motor, Measurement, DiagnosisResult,
  Alarm, MaintenanceLog, ApiResponse,
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
    <div className={`h-full bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden ${className}`}>
      {/* 헤더 — 드래그 핸들 */}
      <div
        className={`widget-drag-handle flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 border-l-[3px] ${ACCENT_CLS[accent]} shrink-0 cursor-grab active:cursor-grabbing select-none`}
      >
        <div className="flex items-center gap-1.5">
          {/* 그립 아이콘 */}
          <svg className="w-3 h-3 text-slate-300 shrink-0" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2"  r="1.2"/><circle cx="8" cy="2"  r="1.2"/>
            <circle cx="2" cy="8"  r="1.2"/><circle cx="8" cy="8"  r="1.2"/>
            <circle cx="2" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/>
          </svg>
          {icon && <span className="text-slate-400 text-sm leading-none">{icon}</span>}
          <span className="text-xs font-semibold text-slate-600 tracking-wide">{title}</span>
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
      {/* compact=true(차트용): position:relative 기준점 제공, absolute inset-0 으로 TrendChart가 채움 */}
      {/* compact=false: 일반 flex 흐름 */}
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
      ? 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100'
      : severity === 'warning'
        ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'

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

  const valCl = offline ? 'text-slate-300'
              : isCrit  ? 'text-red-600'
              : isWarn  ? 'text-amber-500'
              : 'text-slate-800'

  const status = offline ? null
    : isCrit ? { text: '임계', badge: 'bg-red-100 text-red-600',    bar: 'bg-red-500'     }
    : isWarn ? { text: '주의', badge: 'bg-amber-100 text-amber-600', bar: 'bg-amber-400'   }
    :          { text: '정상', badge: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' }

  // 게이지 범위: 0 ~ crit×1.25 (경보 위로 여유 공간 확보)
  const gaugeMax  = crit * 1.25
  const gaugePct  = offline ? 0 : Math.min(100, Math.round((value / gaugeMax) * 100))
  const warnPct   = Math.round((warn / gaugeMax) * 100)
  const critPct   = Math.round((crit / gaugeMax) * 100)

  const deltaVal  = delta != null && Math.abs(delta) >= 0.01 ? delta : null

  return (
    <div className={`h-full bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden border-l-[3px] ${ACCENT_CLS[accent]}`}>

      {/* 드래그 핸들 헤더 */}
      <div className="widget-drag-handle flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-100 shrink-0 cursor-grab active:cursor-grabbing select-none">
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-slate-300 shrink-0" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2"  r="1.2"/><circle cx="8" cy="2"  r="1.2"/>
            <circle cx="2" cy="8"  r="1.2"/><circle cx="8" cy="8"  r="1.2"/>
            <circle cx="2" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/>
          </svg>
          <span className="text-xs font-semibold text-slate-600">{title}</span>
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
            <span className="text-sm font-medium text-slate-400">{unit}</span>
          )}
        </div>
        {!offline && deltaVal != null && (
          <span className={`text-[10px] font-medium mt-1 ${deltaVal > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
            {deltaVal > 0 ? '▲' : '▼'} {Math.abs(deltaVal) < 1 ? Math.abs(deltaVal).toFixed(2) : Math.abs(deltaVal).toFixed(1)}
            <span className="text-slate-400 font-normal"> 24h 전 대비</span>
          </span>
        )}
      </div>

      {/* 게이지 바 */}
      <div className="px-3 pb-3 shrink-0">
        <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
          {/* 주의 임계 마커 */}
          <div className="absolute top-0 h-full w-0.5 bg-amber-300 z-10" style={{ left: `${warnPct}%` }} />
          {/* 경보 임계 마커 */}
          <div className="absolute top-0 h-full w-0.5 bg-red-300 z-10" style={{ left: `${critPct}%` }} />
          {/* 값 바 */}
          <div
            className={`h-full rounded-full transition-all duration-500 ${status?.bar ?? 'bg-slate-300'}`}
            style={{ width: `${gaugePct}%` }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-slate-300">0</span>
          <span className="text-[9px] text-amber-400">△ {warn}</span>
          <span className="text-[9px] text-red-400">⚠ {crit}</span>
        </div>
      </div>

    </div>
  )
}

// ── AI 진단 콘텐츠 ─────────────────────────────────────────

function DiagnosisContent({ diagnosis }: { diagnosis: DiagnosisResult | null }) {
  if (!diagnosis)
    return <p className="text-sm text-slate-400">진단 데이터 없음</p>

  const isNormal = diagnosis.fault_type === 'normal' || diagnosis.severity === 'normal'
  const isCrit   = diagnosis.severity === 'critical'
  const conf     = diagnosis.confidence != null ? Math.round(Number(diagnosis.confidence)) : null
  const rul      = diagnosis.rul_days
  const evidence = diagnosis.evidence

  const rulColor = rul == null ? 'text-slate-300' : rul <= 7 ? 'text-red-600' : rul <= 30 ? 'text-amber-600' : 'text-emerald-600'
  const rulBarCl = rul == null ? 'bg-slate-200'   : rul <= 7 ? 'bg-red-500'   : rul <= 30 ? 'bg-amber-500'   : 'bg-emerald-500'
  const rulMsg   = rul == null ? '' : rul <= 7 ? '즉시 조치 필요' : rul <= 30 ? '단기 정비 계획 수립 필요' : '정상 범위 내'
  const rulPct   = rul != null ? Math.min(100, Math.round((rul / 90) * 100)) : 0

  const desc    = diagnosis.fault_type ? FAULT_DESC[diagnosis.fault_type]    : undefined
  const actions = diagnosis.fault_type ? FAULT_ACTIONS[diagnosis.fault_type] : undefined

  return (
    <div className="flex-1 min-h-0 overflow-y-auto space-y-4" style={{ scrollbarWidth: 'thin' }}>

      <p className="text-[10px] text-slate-400">
        {new Date(diagnosis.diagnosed_at).toLocaleString('ko-KR', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        })}
      </p>

      {isNormal ? (
        <div className="flex items-center gap-2.5 bg-emerald-50 rounded-lg px-3 py-2.5">
          <span className="text-xl">🟢</span>
          <div>
            <p className="text-sm font-semibold text-emerald-700">이상 없음 — 정상 상태</p>
            <p className="text-xs text-emerald-600 mt-0.5">현재 측정값이 모든 임계값 이내입니다.</p>
          </div>
        </div>
      ) : (
        <div className={`rounded-lg px-3 py-2.5 ${isCrit ? 'bg-red-50 border border-red-100' : 'bg-amber-50 border border-amber-100'}`}>
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-base font-bold text-slate-800">
              {FAULT_LABELS[diagnosis.fault_type ?? ''] ?? diagnosis.fault_type ?? '알 수 없음'}
            </p>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${isCrit ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
              {isCrit ? '경보' : '주의'}
            </span>
          </div>
          {desc && <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>}
        </div>
      )}

      {conf != null && (
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-slate-500">모델 신뢰도</span>
            <span className="text-xs font-bold tabular-nums">{conf}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
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
            <span className="text-xs text-slate-500">잔여수명 (RUL)</span>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-black tabular-nums ${rulColor}`}>{rul}</span>
              <span className="text-xs text-slate-400">일</span>
            </div>
          </div>
          <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${rulBarCl}`} style={{ width: `${rulPct}%` }} />
          </div>
          <p className={`text-[11px] font-semibold mt-1.5 ${rulColor}`}>{rulMsg}</p>
        </div>
      )}

      {evidence?.metrics && evidence.metrics.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">진단 근거</p>
          <div className="space-y-2">
            {evidence.metrics.map((m, i) => (
              <div key={i} className="flex items-center justify-between">
                <span className={`text-xs ${m.exceeded ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                  {m.exceeded ? '⚠ ' : ''}{m.label}
                </span>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <span className={`text-xs font-bold ${m.exceeded ? 'text-red-600' : 'text-slate-700'}`}>{m.value}</span>
                  <span className="text-[10px] text-slate-300">/</span>
                  <span className="text-[10px] text-slate-400">{m.threshold}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isNormal && actions && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">권장 조치</p>
          <ol className="space-y-1.5">
            {actions.map((action, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <span className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${isCrit ? 'bg-red-500' : 'bg-amber-500'}`}>
                  {i + 1}
                </span>
                {action}
              </li>
            ))}
          </ol>
        </div>
      )}

    </div>
  )
}

// ── 추이 차트 탭 위젯 ─────────────────────────────────────

type TrendTab = 'vel' | 'temp' | 'kurt'

const TREND_TABS = [
  { key: 'vel'  as TrendTab, label: '진동 RMS', unit: 'mm/s', color: '#3b82f6', warn: VEL_WARN,  crit: VEL_CRIT,  activeCls: 'bg-blue-500 text-white',   border: 'border-l-blue-500'   },
  { key: 'temp' as TrendTab, label: '온도',     unit: '°C',   color: '#f97316', warn: TEMP_WARN, crit: TEMP_CRIT, activeCls: 'bg-orange-500 text-white', border: 'border-l-orange-500' },
  { key: 'kurt' as TrendTab, label: 'Kurtosis', unit: '',     color: '#8b5cf6', warn: KURT_WARN, crit: KURT_CRIT, activeCls: 'bg-purple-500 text-white', border: 'border-l-purple-500' },
] as const

function TrendTabWidget({
  velTrend, tempTrend, kurtTrend,
}: {
  velTrend:  TrendPoint[]
  tempTrend: TrendPoint[]
  kurtTrend: TrendPoint[]
}) {
  const [active, setActive] = useState<TrendTab>('vel')

  const tab      = TREND_TABS.find(t => t.key === active)!
  const dataMap  = { vel: velTrend, temp: tempTrend, kurt: kurtTrend }

  return (
    <div className={`h-full bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden`}>

      {/* 헤더 + 탭 */}
      <div className={`widget-drag-handle flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 border-l-[3px] ${tab.border} shrink-0 cursor-grab active:cursor-grabbing select-none`}>
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-slate-300 shrink-0" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2"  r="1.2"/><circle cx="8" cy="2"  r="1.2"/>
            <circle cx="2" cy="8"  r="1.2"/><circle cx="8" cy="8"  r="1.2"/>
            <circle cx="2" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/>
          </svg>
          <span className="text-xs font-semibold text-slate-600 tracking-wide">추이 차트 (최근 1h)</span>
        </div>

        {/* 탭 버튼 — 드래그 이벤트 차단 */}
        <div
          className="flex items-center gap-1 cursor-auto"
          onMouseDown={e => e.stopPropagation()}
          onTouchStart={e => e.stopPropagation()}
        >
          {TREND_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setActive(t.key)}
              className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                active === t.key
                  ? t.activeCls
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 차트 영역 */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        <TrendChart
          label={`${tab.label} 추이 (최근 1h)`}
          unit={tab.unit}
          data={dataMap[active]}
          color={tab.color}
          warningLine={tab.warn}
          criticalLine={tab.crit}
          bare
        />
      </div>

    </div>
  )
}

// ── 위젯 대시보드 ─────────────────────────────────────────

function MotorDashboard({
  selectedStatus, detail, trendData, isLoading,
}: {
  selectedStatus: MotorStatus | undefined
  detail:         MotorDetailData | undefined
  trendData:      TrendRow[]
  isLoading:      boolean
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
      <div className="flex items-center justify-center h-64 gap-2 text-slate-400 text-sm">
        <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        데이터 불러오는 중...
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
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
      {/* 레이아웃 초기화 버튼 */}
      <div className="flex justify-end mb-2 pr-1">
        <button
          onClick={resetLayout}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1 rounded hover:bg-slate-100"
          title="위젯 배치를 기본값으로 초기화"
        >
          <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M2 8a6 6 0 1 0 1.5-4" strokeLinecap="round"/>
            <path d="M2 4v4h4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          레이아웃 초기화
        </button>
      </div>

      <RGL
        layout={layout}
        cols={12}
        rowHeight={50}
        margin={[8, 8]}
        containerPadding={[0, 0]}
        onLayoutChange={handleLayoutChange}
        draggableHandle=".widget-drag-handle"
        resizeHandles={['se']}
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
                  <h2 className="text-sm font-bold text-slate-900">{motor.name}</h2>
                  <StatusBadge status={isOffline ? 'offline' : (m?.severity ?? 'normal')} />
                </div>
                {motorMeta && <p className="text-[11px] text-slate-400">{motorMeta}</p>}
                {latestMeasurement?.time && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    마지막 측정:{' '}
                    {new Date(latestMeasurement.time).toLocaleString('ko-KR', {
                      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                )}
              </div>

              {/* 센서 정보 */}
              <div className="border-t border-slate-100 pt-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">센서 정보</p>
                {sensor ? (
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">시리얼</span>
                      <span className="font-mono text-slate-700">{sensor.serial_number}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Modbus 주소</span>
                      <span className="font-mono text-slate-700">{sensor.modbus_addr}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">연결된 센서 없음</p>
                )}
              </div>

              {/* 정비 이력 요약 */}
              <div className="border-t border-slate-100 pt-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">정비 이력</p>
                {maintenanceLogs.length === 0 ? (
                  <p className="text-[11px] text-slate-400">정비 기록 없음</p>
                ) : (
                  <div className="space-y-1">
                    {maintenanceLogs.slice(0, 2).map(log => (
                      <div key={log.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(log.performed_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })}
                        </span>
                        <p className="text-[11px] text-slate-700 truncate">{log.description}</p>
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
                  <p className="text-[10px] text-slate-400 mb-2 shrink-0">
                    총 <span className="font-semibold text-slate-700">{activeCount.length}</span>건 활성
                  </p>
                  <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                    {activeCount.map(alarm => (
                      <div key={alarm.id} className={`flex items-start gap-2 px-2 py-1.5 rounded-lg ${alarm.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'}`}>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-px ${alarm.severity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                          {alarm.severity === 'critical' ? '경보' : '주의'}
                        </span>
                        <p className="text-xs text-slate-700 leading-relaxed">{alarm.message ?? '알람 발생'}</p>
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
          />
        </div>

        {/* ─ AI 진단 */}
        <div key="ai" className="h-full">
          <Widget title="AI 진단" accent="emerald" icon="✦">
            <DiagnosisContent diagnosis={latestDiagnosis} />
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

  const { data: trendRes, mutate: mutateTrend } =
    useSWR<{ data: TrendRow[] }>(
      selectedId ? `/api/motors/${selectedId}/measurements?hours=1&bucket=minute&anchor=latest` : null,
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
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">대시보드</h1>
          <div className="flex items-center gap-1.5">
            <StatChip label="전체"  value={motors.length} unit="대" dot="bg-slate-400" />
            {critCount > 0 && <StatChip label="경보" value={critCount} unit="대" dot="bg-red-500" />}
            {warnCount > 0 && <StatChip label="주의" value={warnCount} unit="대" dot="bg-amber-400" />}
          </div>
        </div>
        <span className="text-xs text-slate-400">
          {lastUpdated
            ? `업데이트 ${lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
            : '업데이트 중...'}
        </span>
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
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100">
      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-800">{value}</span>
      <span className="text-xs text-slate-400">{unit}</span>
    </div>
  )
}
