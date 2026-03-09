'use client'

import { useState, useEffect } from 'react'
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

// ── 모터 선택 칩 ──────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  normal:   'bg-emerald-500',
  warning:  'bg-amber-500',
  critical: 'bg-red-500',
}

function MotorChip({
  motor,
  selected,
  onClick,
}: {
  motor: MotorStatus
  selected: boolean
  onClick: () => void
}) {
  const isOffline = !motor.last_measured_at
  const severity  = isOffline ? 'normal' : motor.severity

  const chipCls = selected
    ? 'bg-blue-600 border-blue-500 text-white shadow-sm'
    : severity === 'critical'
      ? 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100'
      : severity === 'warning'
        ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium whitespace-nowrap transition-all shrink-0 ${chipCls}`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${selected ? 'bg-white/80' : STATUS_DOT[severity]}`} />
      {motor.name}
    </button>
  )
}

// ── 지표 카드 ─────────────────────────────────────────────

function MetricCard({
  label, value, unit, delta, warn, crit,
  format = String, offline = false,
}: {
  label:    string
  value:    number
  unit:     string
  delta?:   number | null
  warn:     number
  crit:     number
  format?:  (v: number) => string
  offline?: boolean
}) {
  const isCrit = !offline && value >= crit
  const isWarn = !offline && !isCrit && value >= warn

  const bg = offline ? 'bg-slate-50 border-slate-200'
           : isCrit  ? 'bg-red-50 border-red-200'
           : isWarn  ? 'bg-amber-50 border-amber-200'
           : 'bg-white border-slate-200'

  const valCl = offline ? 'text-slate-300'
              : isCrit  ? 'text-red-600'
              : isWarn  ? 'text-amber-600'
              : 'text-slate-800'

  return (
    <div className={`rounded-xl border p-4 ${bg}`}>
      <p className="text-xs text-slate-500 mb-2">{label}</p>
      <div className="flex items-end gap-1.5">
        <span className={`text-3xl font-black tabular-nums leading-none ${valCl}`}>
          {offline ? '—' : format(value)}
        </span>
        {unit && <span className="text-sm text-slate-400 mb-0.5">{unit}</span>}
      </div>
      {!offline && delta != null && <DeltaTag value={delta} />}
    </div>
  )
}

function DeltaTag({ value }: { value: number }) {
  if (Math.abs(value) < 0.01)
    return <span className="text-[10px] text-slate-400 mt-1.5 block">— 변화 없음</span>
  const isUp = value > 0
  const abs  = Math.abs(value)
  const fmt  = abs < 1 ? abs.toFixed(2) : abs.toFixed(1)
  return (
    <span className={`text-[10px] font-medium mt-1.5 block ${isUp ? 'text-red-500' : 'text-emerald-500'}`}>
      {isUp ? '▲' : '▼'} {fmt} (24h 전 대비)
    </span>
  )
}

// ── AI 진단 카드 (상세) ────────────────────────────────────

function DiagnosisCard({ diagnosis }: { diagnosis: DiagnosisResult | null }) {
  if (!diagnosis) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4 h-full">
        <p className="text-sm font-semibold text-slate-700 mb-3">✦ AI 진단 결과</p>
        <p className="text-sm text-slate-400">진단 데이터 없음</p>
      </div>
    )
  }

  const isNormal = diagnosis.fault_type === 'normal' || diagnosis.severity === 'normal'
  const isCrit   = diagnosis.severity === 'critical'
  const conf     = diagnosis.confidence != null ? Math.round(Number(diagnosis.confidence)) : null
  const rul      = diagnosis.rul_days
  const evidence = diagnosis.evidence

  const rulColor  = rul == null ? 'text-slate-300'
                  : rul <= 7   ? 'text-red-600'
                  : rul <= 30  ? 'text-amber-600'
                  : 'text-emerald-600'
  const rulBarCl  = rul == null ? 'bg-slate-200'
                  : rul <= 7   ? 'bg-red-500'
                  : rul <= 30  ? 'bg-amber-500'
                  : 'bg-emerald-500'
  const rulMsg    = rul == null ? ''
                  : rul <= 7   ? '즉시 조치 필요'
                  : rul <= 30  ? '단기 정비 계획 수립 필요'
                  : '정상 범위 내'
  const rulPct    = rul != null ? Math.min(100, Math.round((rul / 90) * 100)) : 0

  const desc    = diagnosis.fault_type ? FAULT_DESC[diagnosis.fault_type]    : undefined
  const actions = diagnosis.fault_type ? FAULT_ACTIONS[diagnosis.fault_type] : undefined

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 h-full">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700">✦ AI 진단 결과</p>
        <span className="text-[10px] text-slate-400">
          {new Date(diagnosis.diagnosed_at).toLocaleString('ko-KR', {
            month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
          })}
        </span>
      </div>

      {/* 진단 결과 */}
      {isNormal ? (
        <div className="flex items-center gap-2.5 bg-emerald-50 rounded-lg px-3 py-2.5">
          <span className="text-xl leading-none">🟢</span>
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
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
              isCrit ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {isCrit ? '경보' : '주의'}
            </span>
          </div>
          {desc && <p className="text-xs text-slate-600 leading-relaxed">{desc}</p>}
        </div>
      )}

      {/* 신뢰도 */}
      {conf != null && (
        <div>
          <div className="flex justify-between mb-1.5">
            <span className="text-xs text-slate-500">모델 신뢰도</span>
            <span className="text-xs font-bold tabular-nums">{conf}%</span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCrit ? 'bg-red-500' : isNormal ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${conf}%` }}
            />
          </div>
        </div>
      )}

      {/* 잔여수명 */}
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
            <div
              className={`h-full rounded-full transition-all duration-700 ${rulBarCl}`}
              style={{ width: `${rulPct}%` }}
            />
          </div>
          <p className={`text-[11px] font-semibold mt-1.5 ${rulColor}`}>{rulMsg}</p>
        </div>
      )}

      {/* 진단 근거 (evidence) */}
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
                  <span className={`text-xs font-bold ${m.exceeded ? 'text-red-600' : 'text-slate-700'}`}>
                    {m.value}
                  </span>
                  <span className="text-[10px] text-slate-300">/</span>
                  <span className="text-[10px] text-slate-400">{m.threshold}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 권장 조치 */}
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

// ── 활성 알람 카드 ─────────────────────────────────────────

function AlarmsCard({ alarms }: { alarms: Alarm[] }) {
  const active = alarms.filter(a => a.state !== 'resolved')

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">
          활성 알람
          {active.length > 0 && (
            <span className="ml-1.5 text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">
              {active.length}
            </span>
          )}
        </p>
        <Link href="/alarms" className="text-xs text-blue-600 hover:underline">
          전체 보기 →
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="flex items-center gap-2 text-emerald-600">
          <span className="text-lg">🟢</span>
          <span className="text-sm font-medium">활성 알람 없음</span>
        </div>
      ) : (
        <div className="space-y-2">
          {active.slice(0, 4).map(alarm => (
            <div
              key={alarm.id}
              className={`flex items-start gap-2 p-2.5 rounded-lg ${
                alarm.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'
              }`}
            >
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-px ${
                alarm.severity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
              }`}>
                {alarm.severity === 'critical' ? '경보' : '주의'}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-slate-700 leading-snug">{alarm.message ?? '알람 발생'}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {new Date(alarm.triggered_at).toLocaleString('ko-KR', {
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 선택된 모터 대시보드 ───────────────────────────────────

function MotorDashboard({
  selectedStatus,
  detail,
  trendData,
  isLoading,
}: {
  selectedStatus: MotorStatus | undefined
  detail:         MotorDetailData | undefined
  trendData:      TrendRow[]
  isLoading:      boolean
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-slate-400 text-sm">
        <span className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
        데이터 불러오는 중...
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        모터 데이터를 불러올 수 없습니다
      </div>
    )
  }

  const { motor, latestDiagnosis, activeAlarms, latestMeasurement } = detail
  const m         = selectedStatus
  const isOffline = !latestMeasurement

  // 지표 카드: latestMeasurement 직접 사용 (motors list 캐시가 아닌 실시간 최신값)
  const vel  = Number(latestMeasurement?.vel_y_rms     ?? 0)
  const temp = Number(latestMeasurement?.temperature_c ?? 0)
  const kurt = Number(latestMeasurement?.kurtosis_y    ?? 0)  // Y축 — 트렌드 차트와 동일

  // 시드 데이터의 고정 타임스탬프를 현재 시각 기준으로 시프트
  // 실제 센서 연결 시 offset ≈ 0 이므로 동작에 영향 없음
  const timeOffset = trendData.length > 0
    ? Date.now() - new Date(trendData[trendData.length - 1].bucket).getTime()
    : 0
  const shiftTime = (bucket: string) =>
    new Date(new Date(bucket).getTime() + timeOffset).toISOString()

  const velTrend: TrendPoint[]  = trendData.map(r => ({
    time:  shiftTime(r.bucket),
    value: r.vel_y_avg      != null ? Number(r.vel_y_avg)      : null,
  }))
  const tempTrend: TrendPoint[] = trendData.map(r => ({
    time:  shiftTime(r.bucket),
    value: r.temp_avg       != null ? Number(r.temp_avg)       : null,
  }))
  const kurtTrend: TrendPoint[] = trendData.map(r => ({
    time:  shiftTime(r.bucket),
    value: r.kurtosis_y_avg != null ? Number(r.kurtosis_y_avg) : null,
  }))

  const motorMeta = [
    motor.location,
    motor.site_name,
    motor.rated_power_kw && `${motor.rated_power_kw}kW`,
    motor.rated_rpm      && `${motor.rated_rpm}RPM`,
  ].filter(Boolean).join(' · ')

  return (
    <div className="h-full flex flex-col lg:flex-row gap-3 pb-3">

      {/* ── 좌측: 모터 헤더 + 지표 + 차트 + 알람 */}
      <div className="flex-1 min-w-0 flex flex-col gap-3">

        {/* 모터 헤더 + 활성 알람 통합 카드 */}
        {(() => {
          const activeCount = activeAlarms.filter(a => a.state !== 'resolved')
          return (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">

              {/* 모터 정보 */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-bold text-slate-900">{motor.name}</h2>
                    <StatusBadge status={isOffline ? 'offline' : (m?.severity ?? 'normal')} />
                  </div>
                  {motorMeta && (
                    <p className="text-sm text-slate-400 mt-0.5">{motorMeta}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {latestMeasurement?.time && (
                    <div className="text-right">
                      <p className="text-[10px] text-slate-400">마지막 측정</p>
                      <p className="text-xs font-medium text-slate-600">
                        {new Date(latestMeasurement.time).toLocaleString('ko-KR', {
                          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  )}
                  <Link href={`/motors/${motor.id}`} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
                    상세 보기 →
                  </Link>
                </div>
              </div>

              {/* 구분선 */}
              <div className="border-t border-slate-100" />

              {/* 활성 알람 */}
              {activeCount.length === 0 ? (
                <div className="flex items-center gap-2 text-emerald-600">
                  <span>🟢</span>
                  <span className="text-sm font-medium">활성 알람 없음</span>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {activeCount.slice(0, 4).map(alarm => (
                    <div
                      key={alarm.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ${
                        alarm.severity === 'critical' ? 'bg-red-50' : 'bg-amber-50'
                      }`}
                    >
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        alarm.severity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
                      }`}>
                        {alarm.severity === 'critical' ? '경보' : '주의'}
                      </span>
                      <p className="text-xs text-slate-700 flex-1 truncate">{alarm.message ?? '알람 발생'}</p>
                      <p className="text-[10px] text-slate-400 shrink-0">
                        {new Date(alarm.triggered_at).toLocaleString('ko-KR', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                  ))}
                  {activeCount.length > 4 && (
                    <Link href="/alarms" className="block text-center text-[11px] text-blue-600 hover:underline pt-0.5">
                      +{activeCount.length - 4}건 더 보기 →
                    </Link>
                  )}
                </div>
              )}

            </div>
          )
        })()}

        {/* 핵심 지표 카드 3개 */}
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label="진동 RMS (Y축)"
            value={vel}
            unit="mm/s"
            delta={m?.vel_y_delta}
            warn={VEL_WARN}
            crit={VEL_CRIT}
            format={v => v.toFixed(2)}
            offline={isOffline}
          />
          <MetricCard
            label="온도"
            value={temp}
            unit="°C"
            delta={m?.temp_delta}
            warn={TEMP_WARN}
            crit={TEMP_CRIT}
            format={v => Math.round(v).toString()}
            offline={isOffline}
          />
          <MetricCard
            label="Kurtosis (Y축)"
            value={kurt}
            unit=""
            warn={KURT_WARN}
            crit={KURT_CRIT}
            format={v => v.toFixed(2)}
            offline={isOffline}
          />
        </div>

        {/* 트렌드 차트 3종 — 남은 공간 채우기 */}
        <div className="flex-1 min-h-0 grid grid-cols-1 grid-rows-3 gap-3">
          <TrendChart
            label="진동 RMS 추이 (최근 1h)"
            unit="mm/s"
            data={velTrend}
            color="#3b82f6"
            warningLine={VEL_WARN}
            criticalLine={VEL_CRIT}
          />
          <TrendChart
            label="온도 추이 (최근 1h)"
            unit="°C"
            data={tempTrend}
            color="#f97316"
            warningLine={TEMP_WARN}
            criticalLine={TEMP_CRIT}
          />
          <TrendChart
            label="Kurtosis 추이 (최근 1h)"
            unit=""
            data={kurtTrend}
            color="#8b5cf6"
            warningLine={KURT_WARN}
            criticalLine={KURT_CRIT}
          />
        </div>

      </div>

      {/* ── 우측: AI 진단 (전체 높이) */}
      <div className="w-full lg:w-80 shrink-0 h-full">
        <DiagnosisCard diagnosis={latestDiagnosis} />
      </div>

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

  // 첫 로드 시 자동 선택: critical > warning > 첫 번째
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

  // 10초마다 더미 측정값 삽입 → 완료 후 SWR 강제 갱신
  useEffect(() => {
    const run = async () => {
      try {
        await fetch('/api/dev/simulate', { method: 'POST' })
        await Promise.all([mutateMotors(), mutateDetail(), mutateTrend()])
      } catch { /* ignore */ }
    }
    run() // 첫 마운트 즉시 실행
    const id = setInterval(run, 10_000)
    return () => clearInterval(id)
  }, [mutateMotors, mutateDetail, mutateTrend])

  const detail         = detailRes?.data
  const trendData      = trendRes?.data ?? []
  const selectedStatus = motors.find(m => m.id === selectedId)

  const critCount = motors.filter(m => m.severity === 'critical').length
  const warnCount = motors.filter(m => m.severity === 'warning').length

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden p-3 sm:p-4 lg:p-5">

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

      {/* ── 선택된 모터 대시보드 (스크롤 영역) */}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ scrollbarWidth: 'thin' }}>
        {selectedId === null ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
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
