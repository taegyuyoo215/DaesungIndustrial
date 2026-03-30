'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import GridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import type { Layout, LayoutItem } from 'react-grid-layout/legacy'
import useSWR from 'swr'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import type { TrendPoint } from '@/components/charts/TrendChart'
import MultiTrendChart from '@/components/charts/MultiTrendChart'
import FFTChart from '@/components/charts/FFTChart'
import StatusBadge from '@/components/StatusBadge'
import { fetcher } from '@/lib/fetcher'
import type {
  MotorStatus, Motor, Measurement, DiagnosisResult,
  Alarm, MaintenanceLog, ApiResponse, BearingFreqs, FftSpectrum,
  FftTrendItem, FloorPlan, MotorPin
} from '@/types'

const FloorPlanView = dynamic(() => import('@/map_components/FloorPlanView'), { ssr: false })
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

const LAYOUT_STORAGE_KEY = 'motor-iq:dashboard-layout-v4'

const DEFAULT_LAYOUT: LayoutItem[] = [
  { i: 'motor',  x: 0, y: 0, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'alarms', x: 3, y: 0, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'vel',    x: 6, y: 0, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'temp',   x: 9, y: 0, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'kurt',   x: 6, y: 4, w: 3, h: 4,  minW: 2, minH: 2 },
  { i: 'trend',  x: 0, y: 8, w: 9, h: 12, minW: 3, minH: 4 },
  { i: 'ai',     x: 9, y: 4, w: 3, h: 8,  minW: 2, minH: 3 },
]

function loadLayout(): LayoutItem[] {
  if (typeof window === 'undefined') return DEFAULT_LAYOUT
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return DEFAULT_LAYOUT
    const saved: LayoutItem[] = JSON.parse(raw)
    const defMap: Record<string, LayoutItem> = {}
    DEFAULT_LAYOUT.forEach(d => { defMap[d.i] = d })

    const merged = saved.map(s => {
      const def = defMap[s.i]
      if (def) {
        // 위치(x,y,w,h)는 유지하되, 제약조건(minW, minH 등)은 최신 기본값으로 덮어씀
        return { ...s, minW: def.minW, minH: def.minH, maxW: def.maxW, maxH: def.maxH }
      }
      return s
    })

    // 없는 키 추가
    const existingKeys = new Set(merged.map(m => m.i))
    for (const def of DEFAULT_LAYOUT) {
      if (!existingKeys.has(def.i)) merged.push(def)
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
  title, accent = 'slate', icon, action, children, className = '', compact = false,
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
            {deltaVal > 0 ? '▲' : '▼'} {Math.abs(deltaVal) < 1 ? Number(Math.abs(deltaVal)).toFixed(2) : Number(Math.abs(deltaVal)).toFixed(1)}
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

// ── AI 진단 요약 (FFT 포함) ─────────────────────────────

function FftSummaryInDiagnosis({ motorId }: { motorId: number }) {
  const { data } = useSWR<{ bearingFreqs: BearingFreqs; spectra: FftSpectrum[]; faultTrend: FftTrendItem[] }>(
    `/api/fft?motor_id=${motorId}&axis=y&limit=3`, fetcher
  )
  if (!data?.spectra[0]) return null
  const spectrum = data.spectra[0]
  
  return (
    <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h5 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">주파수 스펙트럼 (FFT)</h5>
        <Link href={`/fft?motor_id=${motorId}`} className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1">
          상세 분석 <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeWidth="2" d="M9 5l7 7-7 7"/></svg>
        </Link>
      </div>

      <div className="bg-slate-50 dark:bg-slate-950/50 rounded-xl p-2 border border-slate-100 dark:border-slate-800/50">
        <FFTChart 
          freqBins={spectrum.freq_bins} 
          ampBins={spectrum.amp_bins} 
          bearingFreqs={data.bearingFreqs} 
          fmaxDisplay={data.bearingFreqs.f1x * 3.5} 
          isDark={true}
          height={180}
        />
      </div>

      {/* 주파수 진단 분석 결과 (최신 추세 기반) */}
      <div className="bg-slate-50/50 dark:bg-slate-950/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800/50">
        <div className="flex items-center gap-1.5 mb-2.5">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">실시간 주파수 분석 리포트</p>
        </div>
        
        <div className="grid grid-cols-1 gap-2">
          {data.faultTrend && data.faultTrend.some(t => t.status !== 'normal') ? (
            data.faultTrend.filter(t => t.status !== 'normal').map(t => (
              <div key={t.label} className="flex items-center justify-between bg-white dark:bg-slate-900/40 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-black w-10 ${
                    t.status === 'warning' ? 'text-red-500' : 'text-amber-500'
                  }`}>{t.label}</span>
                  <p className="text-[10px] font-medium text-slate-600 dark:text-slate-300">
                    {t.label === '1X' ? '회전 불평형/정렬 불량 구간' : 
                     t.label === '2X' || t.label === '3X' ? '기계적 해이/이완 구간' :
                     t.label.startsWith('BP') || t.label === 'BSF' || t.label === 'FTF' ? '베어링 초기 마모/손상 감지' : '기타 주파수 특이사항'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    t.status === 'warning' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'
                  }`}>{t.status === 'warning' ? '위험' : '주의'}</span>
                  <span className={`text-[9px] font-mono ${
                    t.trend === 'rising' ? 'text-red-400' : 'text-slate-400'
                  }`}>
                    {t.trend === 'rising' ? '↑ 상승 중' : '→ 유지 중'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <div className="flex items-center justify-center py-4 bg-white/50 dark:bg-slate-900/30 rounded-lg border border-dashed border-slate-200 dark:border-slate-800">
              <p className="text-[10px] text-slate-400 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
                결함 주파수(1X~Bearing) 대역에서 특이 징후가 없습니다.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-[10px]">
        <div className="flex flex-col gap-0.5">
          <span className="text-slate-400">데이터 수집 시간</span>
          <span className="font-bold text-slate-700 dark:text-slate-300">{new Date(spectrum.measured_at).toLocaleString('ko-KR')}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-slate-400">Peak 주파수 (1X)</span>
          <span className="font-bold text-blue-500">{Number(data.bearingFreqs.f1x).toFixed(1)} Hz</span>
        </div>
      </div>
    </div>
  )
}

function DiagnosisContent({ diagnosis, motorId, motorRunning }: { diagnosis: DiagnosisResult | null; motorId: number; motorRunning?: boolean | null }) {
  if (motorRunning === false) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
        <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-3">
          <svg className="w-6 h-6 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">모터 정지 중</p>
      </div>
    )
  }
  if (!diagnosis) return <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">데이터 없음</div>

  const isCrit = diagnosis.severity === 'critical'
  const isWarn = diagnosis.severity === 'warning'
  const severityBg = isCrit ? 'bg-red-50 dark:bg-red-900/10' : isWarn ? 'bg-amber-50 dark:bg-amber-900/10' : 'bg-emerald-50 dark:bg-emerald-900/10'
  const severityTx = isCrit ? 'text-red-700 dark:text-red-400' : isWarn ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto thin-scrollbar pr-1">
      <div className="space-y-4">
        <div className={`rounded-xl p-4 border ${severityBg}`}>
          <div className="flex justify-between items-start mb-2">
            <h4 className={`text-base font-black ${severityTx}`}>{FAULT_LABELS[diagnosis.fault_type ?? ''] || '정상'}</h4>
            <span className="text-[10px] font-bold opacity-60 italic">신뢰도 {diagnosis.confidence}%</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed font-medium">
            {diagnosis.fault_type ? FAULT_DESC[diagnosis.fault_type] : '양호한 운전 상태 유지 중입니다.'}
          </p>
        </div>

        {diagnosis.fault_type && FAULT_ACTIONS[diagnosis.fault_type] && (
          <div className="space-y-2">
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">권장 조치 사항</h5>
            <ul className="space-y-1.5">
              {FAULT_ACTIONS[diagnosis.fault_type].map((action, idx) => (
                <li key={idx} className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                  <span className="w-1 h-1 bg-indigo-500 rounded-full mt-1.5 shrink-0" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}

        {diagnosis.rul_days != null && (
          <div className="space-y-2">
            <div className="flex justify-between text-[11px] font-black text-slate-500 uppercase tracking-widest">
              <span>잔여수명 예측 (RUL)</span>
              <span>약 {diagnosis.rul_days}일</span>
            </div>
            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-1000 ${diagnosis.rul_days < 14 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-emerald-500'}`} 
                style={{ width: `${Math.min(100, (diagnosis.rul_days / 90) * 100)}%` }} 
              />
            </div>
          </div>
        )}

        <FftSummaryInDiagnosis motorId={motorId} />
      </div>
    </div>
  )
}

// ── 추이 차트 탭 위젯 ─────────────────────────────────────

type TrendRangeKey = '1h' | '24h' | '7d'
interface TrendRangeOption {
  key: TrendRangeKey
  label: string
  hours: number
  bucket: string
}

const TREND_RANGE_OPTIONS: TrendRangeOption[] = [
  { key: '1h',  label: '1시간', hours: 1,   bucket: 'minute' },
  { key: '24h', label: '24시간', hours: 24,  bucket: 'hour'   },
  { key: '7d',  label: '7일',  hours: 168, bucket: 'hour'   },
]

function TrendTabWidget({ velTrend, tempTrend, kurtTrend, trendRange, onRangeChange }: { velTrend: TrendPoint[]; tempTrend: TrendPoint[]; kurtTrend: TrendPoint[]; trendRange: string; onRangeChange: (r: any) => void }) {
  return (
    <Widget
      title="추이 분석" accent="blue"
      action={
        <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
          {TREND_RANGE_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => onRangeChange(opt.key)} className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${trendRange === opt.key ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-400'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="h-full pt-1">
        <MultiTrendChart velData={velTrend} tempData={tempTrend} kurtData={kurtTrend} />
      </div>
    </Widget>
  )
}

// ── 모터 대시보드 (기존 위젯 그리드) ───────────────────────

function MotorDashboard({
  detail, trendData, isLoading, isEditing, trendRange, onRangeChange
}: {
  detail?: MotorDetailData; trendData: TrendRow[]; isLoading: boolean; isEditing: boolean; trendRange: string; onRangeChange: (r: any) => void
}) {
  const [layout, setLayout] = useState<LayoutItem[]>(DEFAULT_LAYOUT)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setLayout(loadLayout()); setMounted(true) }, [])

  if (!mounted || isLoading) return <div className="h-full flex items-center justify-center text-slate-400 text-sm animate-pulse">상세 데이터 연동 중...</div>
  if (!detail) return <div className="p-12 text-center text-slate-400">분석 정보가 없습니다.</div>

  const { motor, latestDiagnosis, activeAlarms, latestMeasurement: m } = detail
  const isOffline = !m
  const velTrend = trendData.map(r => ({ time: r.bucket, value: Number(r.vel_y_avg) }))
  const tempTrend = trendData.map(r => ({ time: r.bucket, value: Number(r.temp_avg) }))
  const kurtTrend = trendData.map(r => ({ time: r.bucket, value: Number(r.kurtosis_y_avg) }))

  return (
    <div className="h-full overflow-y-auto px-4 pb-4 thin-scrollbar">
      <RGL
        layout={layout}
        cols={12}
        rowHeight={50}
        margin={[12, 12]}
        onLayoutChange={l => { setLayout([...l]); saveLayout([...l]) }}
        draggableHandle=".widget-drag-handle"
        isDraggable={isEditing}
        isResizable={isEditing}
      >
        <div key="motor"><Widget title="모터 개요" accent="emerald" icon="⚓"><div className="flex flex-col justify-center h-full"><h3 className="text-lg font-black text-slate-800 dark:text-slate-100">{motor.name}</h3><p className="text-[11px] text-slate-400 mt-1">{motor.location}</p><div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1"><div className="flex justify-between text-[10px]"><span className="text-slate-400">RPM</span><span className="font-bold">{motor.rated_rpm || '-'}</span></div><div className="flex justify-between text-[10px]"><span className="text-slate-400">ISO</span><span className="font-bold">{motor.iso_class || '-'}</span></div></div></div></Widget></div>
        <div key="alarms">
          <Widget title="최신 알람" accent="red" icon="⚠">
            <div className="flex flex-col gap-2 h-full overflow-y-auto thin-scrollbar pr-1">
              {activeAlarms.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2">
                  <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p className="text-[10px] font-bold uppercase tracking-widest">No Active Alarms</p>
                </div>
              ) : activeAlarms.map(a => (
                <div key={a.id} className="p-2.5 bg-red-50/30 dark:bg-red-900/10 rounded-xl border border-red-100/50 dark:border-red-900/20 group hover:border-red-300 transition-all">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase ${a.severity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'}`}>
                      {a.severity === 'critical' ? 'Critical' : 'Warning'}
                    </span>
                    <span className="text-[8px] text-slate-400 font-mono tracking-tighter">
                      {new Date(a.triggered_at).toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-snug line-clamp-2">
                    {a.message || FAULT_LABELS[a.fault_type || ''] || '알람 발생'}
                  </p>
                  <p className="text-[9px] text-slate-500 mt-1 flex justify-between">
                    <span>{new Date(a.triggered_at).toLocaleDateString('ko-KR')}</span>
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity text-red-500 font-bold">확인 대기</span>
                  </p>
                </div>
              ))}
            </div>
          </Widget>
        </div>
        <div key="vel"><MetricWidget title="진동 RMS" value={Number(m?.vel_y_rms ?? 0)} unit="mm/s" delta={(motor as any).vel_y_delta} warn={VEL_WARN} crit={VEL_CRIT} format={v => Number(v).toFixed(2)} offline={isOffline} accent="blue" /></div>
        <div key="temp"><MetricWidget title="본체 온도" value={Number(m?.temperature_c ?? 0)} unit="°C" delta={(motor as any).temp_delta} warn={TEMP_WARN} crit={TEMP_CRIT} format={v => Math.round(Number(v)).toString()} offline={isOffline} accent="orange" /></div>
        <div key="kurt"><MetricWidget title="Kurtosis" value={Number(m?.kurtosis_y ?? 0)} unit="" warn={KURT_WARN} crit={KURT_CRIT} format={v => Number(v).toFixed(2)} offline={isOffline} accent="purple" /></div>
        <div key="trend"><TrendTabWidget velTrend={velTrend} tempTrend={tempTrend} kurtTrend={kurtTrend} trendRange={trendRange} onRangeChange={onRangeChange} /></div>
        <div key="ai"><Widget title="AI 정밀 분석" accent="indigo" icon="✦"><DiagnosisContent diagnosis={latestDiagnosis} motorId={motor.id} motorRunning={m?.motor_running} /></Widget></div>
      </RGL>
    </div>
  )
}

// ── 메인 대시보드 페이지 ───────────────────────────────────

export default function DashboardPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [selectedFpId, setSelectedFpId] = useState<number | null>(null) // 도면 ID
  const [viewMode, setViewMode] = useState<'map' | 'dashboard'>('map')
  const [trendRange, setTrendRange] = useState<TrendRangeKey>('1h')
  const [isEditing, setIsEditing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const { data: motorRes, mutate: mutateMotors } = useSWR<ApiResponse<MotorStatus[]>>('/api/motors', fetcher, {
    refreshInterval: 10000, onSuccess: () => setLastUpdated(new Date())
  })
  const motors = motorRes?.data ?? []

  useEffect(() => {
    if (selectedId !== null || motors.length === 0) return
    const target = motors.find(m => m.severity === 'critical') ?? motors.find(m => m.severity === 'warning') ?? motors[0]
    if (target) setSelectedId(target.id)
  }, [motors, selectedId])

  const { data: detailRes, isLoading: detailLoading } = useSWR<{ data: MotorDetailData }>(selectedId ? `/api/motors/${selectedId}` : null, fetcher)
  const rangeOpt = TREND_RANGE_OPTIONS.find(r => r.key === trendRange)!
  const { data: trendRes } = useSWR<{ data: TrendRow[] }>(selectedId ? `/api/motors/${selectedId}/measurements?hours=${rangeOpt.hours}&bucket=${rangeOpt.bucket}&anchor=latest` : null, fetcher)
  
  // 도면 목록 및 상세 데이터
  const { data: fpListRes } = useSWR<{ ok: boolean, list: FloorPlan[] }>('/api/floor-plan', fetcher)
  const fpList = fpListRes?.list || []
  const [isAutoCycling, setIsAutoCycling] = useState(false)
  const [autoCycleInterval, setAutoCycleInterval] = useState(10000) // 기본 10초

  // 자동 전환(Auto-Cycling) 로직
  useEffect(() => {
    if (!isAutoCycling || fpList.length <= 1) return

    const timer = setInterval(() => {
      setSelectedFpId(prev => {
        const currentIndex = fpList.findIndex(fp => fp.id === prev)
        const nextIndex = (currentIndex + 1) % fpList.length
        return fpList[nextIndex].id
      })
    }, autoCycleInterval)

    return () => clearInterval(timer)
  }, [isAutoCycling, fpList.length, autoCycleInterval])

  const globalStats = useMemo(() => {
    // motors 목록에서 직접 상태별 개수 집계 (가장 정확함)
    const motorCritical = motors.filter(m => m.severity === 'critical').length
    const motorWarning = motors.filter(m => m.severity === 'warning').length
    const motorNormal = motors.filter(m => !m.severity || m.severity === 'normal').length

    return {
      critical: motorCritical,
      warning: motorWarning,
      normal: motorNormal
    }
  }, [fpList, motors])

  useEffect(() => {
    const list = fpListRes?.list
    if (list && list.length > 0 && selectedFpId === null) {
      setSelectedFpId(list[0].id)
    }
  }, [fpListRes?.list, selectedFpId])

  const { data: fpDetailRes } = useSWR<{ ok: boolean, floorPlan: FloorPlan, pins: MotorPin[] }>(
    selectedFpId ? `/api/floor-plan?id=${selectedFpId}` : null,
    fetcher
  )

  const handlePinClick = useCallback((id: number) => {
    setSelectedId(id)
    setViewMode('dashboard')
  }, [])

  if (!mounted) return null

  const showFpTabs = viewMode === 'map' && fpList.length > 0

  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-950 overflow-hidden font-sans">
      <div className="flex justify-between items-center px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 shadow-sm z-30">
        <div className="flex items-center gap-8">
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 italic tracking-tighter">MOTOR<span className="text-blue-600">IQ</span></h1>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
             <button onClick={() => setViewMode('map')} className={`px-5 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'map' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-400'}`}>지도 뷰</button>
             <button onClick={() => setViewMode('dashboard')} className={`px-5 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'dashboard' ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm' : 'text-slate-400'}`}>상세 대시보드</button>
          </div>
        </div>
        <div className="flex items-center gap-4">
           {viewMode === 'dashboard' && <button onClick={() => setIsEditing(!isEditing)} className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${isEditing ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>{isEditing ? '저장' : '편집'}</button>}
           <span className="text-[10px] text-slate-400 tabular-nums">{lastUpdated?.toLocaleTimeString('ko-KR')}</span>
        </div>
      </div>

      {showFpTabs && (
        <div className="flex flex-col border-b border-slate-200/50 bg-white/50 dark:bg-slate-900/50">
          {/* 전체 현황 요약 바 */}
          <div className="flex items-center gap-4 px-6 py-2 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">장비 통합 현황</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-black text-red-600 dark:text-red-400">{globalStats.critical} 위험</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="text-[10px] font-black text-amber-600 dark:text-amber-400">{globalStats.warning} 주의</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">{globalStats.normal} 정상</span>
              </div>
            </div>
          </div>
          
          {/* 도면 선택 탭 */}
          <div className="flex items-center gap-2 overflow-x-auto px-6 py-2.5 thin-scrollbar">
            {/* 자동 전환 컨트롤 */}
            <div className="flex items-center gap-1.5 pr-4 border-r border-slate-200 dark:border-slate-800 mr-2 shrink-0">
              <button
                onClick={() => setIsAutoCycling(!isAutoCycling)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all active:scale-95 shadow-sm border
                  ${isAutoCycling 
                    ? 'bg-blue-600 border-blue-500 text-white animate-pulse' 
                    : 'bg-white dark:bg-slate-900 border-blue-100 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
                title={isAutoCycling ? "정지" : "자동 전환 시작"}
              >
                {isAutoCycling ? (
                  <>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h4V4z"/></svg>
                    AUTO
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    CYCLE
                  </>
                )}
              </button>
              
              <select
                value={autoCycleInterval}
                onChange={(e) => setAutoCycleInterval(Number(e.target.value))}
                className="bg-slate-100 dark:bg-slate-800 border-none text-[9px] font-bold text-slate-500 rounded-md px-1.5 py-1 focus:ring-0 cursor-pointer"
              >
                <option value={5000}>5s</option>
                <option value={10000}>10s</option>
                <option value={30000}>30s</option>
                <option value={60000}>1m</option>
              </select>
            </div>

            {fpList.map((fp: any) => (
              <button
                key={fp.id}
                onClick={() => {
                  setSelectedFpId(fp.id)
                  setIsAutoCycling(false) // 수동 클릭 시 자동 전환 해제
                }}
                className={`flex items-center gap-3 px-4 py-1.5 rounded-full text-[11px] font-black transition-all border whitespace-nowrap active:scale-95 shadow-sm
                  ${selectedFpId === fp.id 
                    ? 'bg-blue-600 border-blue-500 text-white shadow-blue-500/20' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300 dark:hover:border-slate-600'}`}
              >
                <div className="flex items-center gap-2">
                  <svg className={`w-3 h-3 ${selectedFpId === fp.id ? 'text-blue-200' : 'text-slate-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  {fp.name}
                </div>
                
                {/* 상태 배지 */}
                {(fp.critical_count > 0 || fp.warning_count > 0) && (
                  <div className="flex items-center gap-1 ml-1">
                    {fp.critical_count > 0 && (
                      <span className={`flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full text-[8px] font-black leading-none ${selectedFpId === fp.id ? 'bg-white text-red-600' : 'bg-red-500 text-white'}`}>
                        {fp.critical_count}
                      </span>
                    )}
                    {fp.warning_count > 0 && (
                      <span className={`flex items-center justify-center min-w-[14px] h-3.5 px-1 rounded-full text-[8px] font-black leading-none ${selectedFpId === fp.id ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'}`}>
                        {fp.warning_count}
                      </span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {viewMode === 'dashboard' && (
        <div className="flex items-center gap-2 overflow-x-auto px-6 py-3 bg-white/60 dark:bg-slate-900/60 border-b border-slate-200/50 shrink-0 thin-scrollbar">
          {motors.map(m => <MotorChip key={m.id} motor={m} selected={selectedId === m.id} onClick={() => setSelectedId(m.id)} />)}
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {viewMode === 'map' ? (
          fpDetailRes?.floorPlan ? (
            <FloorPlanView floorPlan={fpDetailRes.floorPlan} pins={fpDetailRes.pins} onPinClick={handlePinClick} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 gap-4">
              <p className="text-[10px] font-black uppercase tracking-widest">Floor Plan Loading...</p>
              <Link href="/settings" className="px-5 py-2 bg-blue-600 text-white rounded-full text-xs font-bold">도면 관리 이동</Link>
            </div>
          )
        ) : (
          <MotorDashboard detail={detailRes?.data} trendData={trendRes?.data ?? []} isLoading={detailLoading} isEditing={isEditing} trendRange={trendRange} onRangeChange={setTrendRange} />
        )}
      </div>
    </div>
  )
}
