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
import FloorPlanView from '@/map_components/FloorPlanView'
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
      <div
        className={`widget-drag-handle flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-[#0a0f1e] border-b border-slate-200 dark:border-slate-800 border-l-[3px] ${ACCENT_CLS[accent]} shrink-0 select-none`}
      >
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-slate-300 dark:text-slate-700 shrink-0" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="2" cy="2"  r="1.2"/><circle cx="8" cy="2"  r="1.2"/>
            <circle cx="2" cy="8"  r="1.2"/><circle cx="8" cy="8"  r="1.2"/>
            <circle cx="2" cy="14" r="1.2"/><circle cx="8" cy="14" r="1.2"/>
          </svg>
          {icon && <span className="text-slate-400 dark:text-slate-500 text-sm leading-none">{icon}</span>}
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 tracking-wide">{title}</span>
        </div>
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

  const gaugeMax  = crit * 1.25
  const gaugePct  = offline ? 0 : Math.min(100, Math.round((value / gaugeMax) * 100))
  const warnPct   = Math.round((warn / gaugeMax) * 100)
  const critPct   = Math.round((crit / gaugeMax) * 100)

  const deltaVal  = delta != null && Math.abs(delta) >= 0.01 ? delta : null

  return (
    <div className={`h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none flex flex-col overflow-hidden border-l-[3px] ${ACCENT_CLS[accent]}`}>
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
