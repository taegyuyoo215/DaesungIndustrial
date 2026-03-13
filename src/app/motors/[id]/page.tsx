'use client'

import { useParams } from 'next/navigation'
import useSWR from 'swr'
import Link from 'next/link'
import StatusBadge from '@/components/StatusBadge'
import TrendChart from '@/components/charts/TrendChart'
import { fetcher } from '@/lib/fetcher'
import type {
  Motor, Sensor, Measurement, DiagnosisResult,
  Alarm, MaintenanceLog, Threshold, Severity, ApiResponse,
} from '@/types'

// ── 타입 ─────────────────────────────────────────────────

interface MotorDetailData {
  motor: Motor & { site_name: string }
  sensor: Sensor | null
  latestMeasurement: Measurement | null
  latestDiagnosis: DiagnosisResult | null
  activeAlarms: Alarm[]
  maintenanceLogs: MaintenanceLog[]
  thresholds: Threshold[]
}

interface HourlyRow {
  bucket: string
  vel_y_avg: number | null
  hf_accel_y_avg: number | null
  kurtosis_y_avg: number | null
  temp_avg: number | null
}

// ── 상수 ─────────────────────────────────────────────────

const faultLabels: Record<string, string> = {
  bearing_outer: '베어링 외륜 결함 (BPFO)',
  bearing_inner: '베어링 내륜 결함 (BPFI)',
  imbalance:     '불평형 (Imbalance)',
  misalignment:  '오정렬 (Misalignment)',
  looseness:     '풀림 (Looseness)',
  overheat:      '과열',
  normal:        '정상',
}

const fmaxLabels = ['5300Hz', '2650Hz', '1325Hz', '662Hz', '325Hz']

// ── 헬퍼 ─────────────────────────────────────────────────

function getTh(thresholds: Threshold[], metric: string, motorId: number) {
  return (
    thresholds.find(t => t.motor_id === motorId && t.metric === metric) ??
    thresholds.find(t => t.motor_id === null   && t.metric === metric)
  )
}

function computeSeverity(m: Measurement, thresholds: Threshold[], motorId: number): Severity {
  const velTh  = getTh(thresholds, 'vel_rms',     motorId)
  const kurtTh = getTh(thresholds, 'kurtosis',    motorId)
  const tempTh = getTh(thresholds, 'temperature', motorId)
  const v = Number(m.vel_y_rms ?? 0)
  const k = Number(m.kurtosis_x ?? 0)
  const t = Number(m.temperature_c ?? 0)

  if (
    (velTh  && v >= velTh.alarm_value)  ||
    (kurtTh && k >= kurtTh.alarm_value) ||
    (tempTh && t >= tempTh.alarm_value)
  ) return 'critical'

  if (
    (velTh  && v >= velTh.warn_value)  ||
    (kurtTh && k >= kurtTh.warn_value) ||
    (tempTh && t >= tempTh.warn_value)
  ) return 'warning'

  return 'normal'
}

const severityStyle = {
  normal:   { card: 'bg-green-50 border-green-300',   badge: 'text-green-500',  title: 'text-green-800',  rul: 'border-green-200',  bar: 'bg-green-400'  },
  warning:  { card: 'bg-yellow-50 border-yellow-300', badge: 'text-yellow-500', title: 'text-yellow-800', rul: 'border-yellow-200', bar: 'bg-yellow-400' },
  critical: { card: 'bg-red-50 border-red-300',       badge: 'text-red-500',    title: 'text-red-800',    rul: 'border-red-200',    bar: 'bg-red-500'    },
}

// ── 서브 컴포넌트 ─────────────────────────────────────────

function MeasurementRow({ label, x, y, z, unit, warnVal }: {
  label: string; x: number | null; y: number | null; z: number | null
  unit: string; warnVal: number
}) {
  const cell = (v: number | null) => (
    <td className={`px-4 py-3 text-sm font-semibold text-right ${
      v !== null && v > warnVal ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'
    }`}>
      {v !== null ? Number(v).toFixed(2) : '—'}
      <span className="font-normal text-slate-400 dark:text-slate-600 text-xs ml-1">{unit}</span>
    </td>
  )
  return (
    <tr className="border-t border-slate-100 dark:border-slate-800/60">
      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{label}</td>
      {cell(x)}{cell(y)}{cell(z)}
    </tr>
  )
}

// ── 페이지 ────────────────────────────────────────────────

export default function MotorDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: detailRes, isLoading } =
    useSWR<ApiResponse<MotorDetailData>>(`/api/motors/${id}`, fetcher, { refreshInterval: 30_000 })

  const { data: measRes } =
    useSWR<ApiResponse<HourlyRow[]>>(
      `/api/motors/${id}/measurements?hours=168&bucket=hour`, fetcher
    )

  const detail      = detailRes?.data
  const motor       = detail?.motor
  const sensor      = detail?.sensor
  const m           = detail?.latestMeasurement
  const diag        = detail?.latestDiagnosis
  const alarms      = detail?.activeAlarms ?? []
  const maintenance = detail?.maintenanceLogs ?? []
  const thresholds  = detail?.thresholds ?? []
  const hourly      = measRes?.data ?? []

  // 트렌드 데이터 변환
  const velData  = hourly.map(h => ({ time: h.bucket, value: h.vel_y_avg }))
  const hfData   = hourly.map(h => ({ time: h.bucket, value: h.hf_accel_y_avg }))
  const kurtData = hourly.map(h => ({ time: h.bucket, value: h.kurtosis_y_avg }))
  const tempData = hourly.map(h => ({ time: h.bucket, value: h.temp_avg }))

  // 임계값
  const velTh  = motor ? getTh(thresholds, 'vel_rms',     motor.id) : null
  const kurtTh = motor ? getTh(thresholds, 'kurtosis',    motor.id) : null
  const tempTh = motor ? getTh(thresholds, 'temperature', motor.id) : null

  // 심각도 계산
  const severity: Severity = diag?.severity ?? (motor && m
    ? computeSeverity(m, thresholds, motor.id)
    : 'normal')

  const ss = severityStyle[severity]

  // 로딩
  if (isLoading) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto animate-pulse space-y-4">
        <div className="h-8 bg-slate-100 dark:bg-slate-800 rounded w-1/3" />
        <div className="h-48 bg-slate-100 dark:bg-slate-800 rounded-xl" />
        <div className="h-48 bg-slate-100 dark:bg-slate-800 rounded-xl" />
      </div>
    )
  }

  if (!motor) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-slate-800 rounded-xl p-6 text-center text-red-600 dark:text-red-400">
          모터를 찾을 수 없습니다.
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* 브레드크럼 */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/" className="text-sm text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400">대시보드</Link>
        <span className="text-slate-300 dark:text-slate-700">/</span>
        <span className="text-sm text-slate-700 dark:text-slate-300 font-medium">{motor.name}</span>
      </div>

      {/* 헤더 */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{motor.name}</h1>
            <StatusBadge status={!m ? 'offline' : severity} />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {motor.location}
            {sensor && ` · ${sensor.serial_number} (Modbus #${sensor.modbus_addr})`}
          </p>
        </div>
        <Link
          href="/maintenance"
          className="border border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/30"
        >
          정비 이력
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 좌측 컬럼 */}
        <div className="col-span-2 space-y-6">

          {/* AI 진단 결과 */}
          {diag ? (
            <div className={`border-2 rounded-xl p-5 ${ss.card}`}>
              <div className="flex items-start justify-between">
                <div>
                  <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${ss.badge}`}>
                    AI 진단 결과
                  </p>
                  <h2 className={`text-lg font-bold ${ss.title}`}>
                    {diag.fault_type ? (faultLabels[diag.fault_type] ?? diag.fault_type) : '—'}
                  </h2>
                </div>
                <div className="text-right">
                  <p className={`text-xs mb-1 ${ss.badge}`}>신뢰도</p>
                  <p className={`text-2xl font-extrabold ${ss.title}`}>
                    {diag.confidence != null ? `${diag.confidence}%` : '—'}
                  </p>
                </div>
              </div>

              {diag.rul_days != null && (
                <div className={`mt-4 bg-white dark:bg-slate-900 rounded-lg px-4 py-3 border flex items-center justify-between ${ss.rul}`}>
                  <div>
                    <p className="text-xs text-slate-500">예측 잔존 수명 (RUL)</p>
                    <p className={`text-xl font-bold mt-0.5 ${ss.title}`}>
                      {diag.rul_days}일 이내 정비 필요
                    </p>
                  </div>
                  <div className="w-24 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${ss.bar}`}
                      style={{ width: `${Math.min((diag.rul_days / 90) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {diag.evidence?.metrics && diag.evidence.metrics.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${ss.badge}`}>진단 근거</p>
                  {diag.evidence.metrics.map((ev) => (
                    <div key={ev.label} className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-lg px-4 py-2.5 border border-slate-100 dark:border-slate-800/60">
                      <span className="text-sm text-slate-700 dark:text-slate-300">{ev.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 dark:text-slate-600">임계: {ev.threshold}</span>
                        <span className={`text-sm font-bold ${ev.exceeded ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-emerald-400'}`}>
                          {ev.value} {ev.exceeded ? '↑' : '✓'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-green-50 dark:bg-emerald-900/20 border-2 border-green-300 rounded-xl p-5">
              <p className="text-xs font-semibold text-green-500 uppercase tracking-wide mb-1">AI 진단 결과</p>
              <p className="text-lg font-bold text-green-800 dark:text-emerald-400">진단 데이터 없음</p>
              <p className="text-sm text-green-600 dark:text-emerald-400 mt-1">측정 데이터가 충분히 쌓이면 자동으로 진단됩니다.</p>
            </div>
          )}

          {/* 최신 측정값 테이블 */}
          {m ? (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/60">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">최신 측정값</h3>
              </div>
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#0a0f1e]">
                    {['항목', 'X축', 'Y축', 'Z축'].map(h => (
                      <th key={h} className={`px-4 py-2.5 text-xs font-semibold text-slate-400 dark:text-slate-600 uppercase tracking-wide ${h === '항목' ? 'text-left' : 'text-right'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <MeasurementRow label="RMS Velocity"    x={m.vel_x_rms}       y={m.vel_y_rms}       z={m.vel_z_rms}       unit="mm/s" warnVal={Number(velTh?.warn_value  ?? 2.8)} />
                  <MeasurementRow label="HF Acceleration" x={m.hf_accel_x_rms}  y={m.hf_accel_y_rms}  z={m.hf_accel_z_rms}  unit="g"    warnVal={2.0} />
                  <MeasurementRow label="Peak Accel (pk-pk)" x={m.pkpk_accel_x} y={m.pkpk_accel_y}    z={m.pkpk_accel_z}    unit="g"    warnVal={15.0} />
                  <MeasurementRow label="Kurtosis"        x={m.kurtosis_x}      y={m.kurtosis_y}       z={m.kurtosis_z}      unit=""     warnVal={Number(kurtTh?.warn_value ?? 5.0)} />
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-4">
                <span className="text-xs text-slate-500">온도</span>
                <span className={`text-sm font-bold ${
                  m.temperature_c !== null && tempTh && Number(m.temperature_c) > tempTh.warn_value
                    ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'
                }`}>
                  {m.temperature_c != null ? `${Number(m.temperature_c).toFixed(1)} °C` : '—'}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-600 ml-auto">
                  업데이트: {new Date(m.time).toLocaleString('ko-KR')}
                </span>
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-center text-slate-400 dark:text-slate-600 text-sm">
              측정 데이터가 없습니다 (센서 오프라인)
            </div>
          )}

          {/* 트렌드 차트 (7일) */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">진동·온도 트렌드 (최근 7일)</h3>
            <div className="grid grid-cols-2 gap-4">
              <TrendChart label="RMS Velocity (Y축)" unit="mm/s" data={velData}  color="#3b82f6"
                warningLine={velTh  ? Number(velTh.warn_value)  : undefined}
                criticalLine={velTh ? Number(velTh.alarm_value) : undefined}
              />
              <TrendChart label="HF Acceleration (Y축)" unit="g"  data={hfData}  color="#ef4444"
                warningLine={2.0} criticalLine={3.5}
              />
              <TrendChart label="Kurtosis (Y축)" unit=""     data={kurtData} color="#8b5cf6"
                warningLine={kurtTh  ? Number(kurtTh.warn_value)  : undefined}
                criticalLine={kurtTh ? Number(kurtTh.alarm_value) : undefined}
              />
              <TrendChart label="온도" unit="°C"    data={tempData} color="#f97316"
                warningLine={tempTh  ? Number(tempTh.warn_value)  : undefined}
                criticalLine={tempTh ? Number(tempTh.alarm_value) : undefined}
              />
            </div>
          </div>
        </div>

        {/* 우측 사이드바 */}
        <div className="space-y-6">
          {/* 설비 정보 */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">설비 정보</h3>
            <div className="space-y-3">
              {[
                { label: '정격 RPM',  value: motor.rated_rpm       ? `${motor.rated_rpm} rpm`       : '—' },
                { label: '정격 출력', value: motor.rated_power_kw   ? `${motor.rated_power_kw} kW`   : '—' },
                { label: 'ISO 등급',  value: motor.iso_class        ? `Class ${motor.iso_class}`     : '—' },
                { label: '설치일',    value: motor.installed_at     ? new Date(motor.installed_at).toLocaleDateString('ko-KR') : '—' },
                { label: '공장',      value: motor.site_name },
                { label: '위치',      value: motor.location ?? '—' },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs text-slate-400 dark:text-slate-600">{item.label}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 센서 상태 */}
          {sensor && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">센서 상태</h3>
              <div className="space-y-3">
                {[
                  { label: '시리얼',      value: sensor.serial_number },
                  { label: 'Modbus',      value: `#${sensor.modbus_addr}` },
                  { label: 'Fmax',        value: fmaxLabels[sensor.fmax_setting - 1] ?? '—' },
                  { label: 'HFE',         value: sensor.hfe_enabled ? '활성화' : '비활성화' },
                  { label: '마지막 수신', value: sensor.last_seen_at
                    ? new Date(sensor.last_seen_at).toLocaleString('ko-KR') : '—' },
                ].map(item => (
                  <div key={item.label} className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 dark:text-slate-600">{item.label}</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 활성 알람 */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">활성 알람</h3>
            {alarms.length === 0 ? (
              <p className="text-xs text-slate-400 dark:text-slate-600 text-center py-4">활성 알람 없음</p>
            ) : (
              <div className="space-y-3">
                {alarms.map(alarm => (
                  <div key={alarm.id} className="flex gap-3">
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      alarm.severity === 'critical' ? 'bg-red-500' : 'bg-yellow-400'
                    }`} />
                    <div>
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                        {alarm.message ?? alarm.fault_type ?? '—'}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5">
                        {new Date(alarm.triggered_at).toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 최근 정비 이력 */}
          {maintenance.length > 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">최근 정비</h3>
                <Link href="/maintenance" className="text-xs text-blue-600 hover:underline">전체 보기</Link>
              </div>
              <div className="space-y-3">
                {maintenance.map(log => (
                  <div key={log.id} className="border-l-2 border-blue-200 dark:border-blue-800 pl-3">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300">{log.work_type}</p>
                    {log.description && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-500 mt-0.5 truncate">{log.description}</p>
                    )}
                    <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-0.5">
                      {new Date(log.performed_at).toLocaleDateString('ko-KR')}
                      {log.performed_by_name && ` · ${log.performed_by_name}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
