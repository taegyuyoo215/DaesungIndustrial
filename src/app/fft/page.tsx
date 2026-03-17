'use client'

import { useState } from 'react'
import useSWR from 'swr'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import FFTChart from '@/components/charts/FFTChart'
import { fetcher } from '@/lib/fetcher'
import { useTheme } from '@/components/ThemeProvider'
import type { ApiResponse, MotorStatus, BearingFreqs, FftSpectrum, FftTrendItem } from '@/types'

// ── API 응답 타입 ─────────────────────────────────────────
interface RawMetrics {
  crest_x:         number | null
  hf_accel_x_rms:  number | null
  peak_vel_freq_x: number | null
  motor_running:   boolean | null
}

interface FftApiResponse {
  motor: { id: number; name: string; rated_rpm: number | null }
  bearingFreqs: BearingFreqs
  spectra: FftSpectrum[]
  faultTrend: FftTrendItem[]
  rawMetrics: RawMetrics | null
  peakTrend: { bucket: string; peak_x: number | null; peak_y: number | null; peak_z: number | null }[]
}

interface AnalyzeResult {
  overall_status: 'normal' | 'early_warning' | 'warning'
  alarm_created: boolean
  diagnosis_created: boolean
  fault_trend: FftTrendItem[]
}

type Axis = 'x' | 'y' | 'z'

const AXES: { key: Axis; label: string }[] = [
  { key: 'x', label: 'X축' },
  { key: 'y', label: 'Y축' },
  { key: 'z', label: 'Z축' },
]

type FmaxMode = 'auto' | 'all' | number

const FMAX_MANUAL = [200, 500, 1000] as const

// ── 상태 설정 ─────────────────────────────────────────────
const STATUS_CFG = {
  warning: {
    label: '경보', labelEn: 'WARNING',
    bg: 'bg-red-950/50', border: 'border-red-800/50',
    text: 'text-red-400', badge: 'bg-red-500 text-white',
    desc: 'text-red-300',
    icon: '⚠',
  },
  early_warning: {
    label: '조기경보', labelEn: 'EARLY WARNING',
    bg: 'bg-amber-950/40', border: 'border-amber-800/40',
    text: 'text-amber-400', badge: 'bg-amber-500 text-white',
    desc: 'text-amber-300',
    icon: '↑',
  },
  normal: {
    label: '정상', labelEn: 'NORMAL',
    bg: 'bg-emerald-950/30', border: 'border-emerald-800/30',
    text: 'text-emerald-400', badge: 'bg-emerald-600 text-white',
    desc: 'text-slate-400',
    icon: '✓',
  },
}

const TREND_ICON  = { rising: '↑', stable: '→', falling: '↓' } as const
const TREND_COLOR = {
  rising:  'text-amber-400',
  stable:  'text-slate-400',
  falling: 'text-emerald-400',
} as const

// ── 진단 배너 ─────────────────────────────────────────────
function DiagBanner({
  faultTrend, isDark,
}: {
  faultTrend: FftTrendItem[]
  isDark: boolean
}) {
  const overallStatus =
    faultTrend.some(t => t.status === 'warning')       ? 'warning'
    : faultTrend.some(t => t.status === 'early_warning') ? 'early_warning'
    : 'normal'

  const cfg = STATUS_CFG[overallStatus]
  const anomalous = faultTrend.filter(t => t.status !== 'normal')

  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${cfg.bg} ${cfg.border}`}>
      <span className={`text-xl mt-0.5 ${cfg.text}`}>{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</p>
          {anomalous.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {anomalous.map(t => (
                <span key={t.label}
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${STATUS_CFG[t.status].badge}`}>
                  {t.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {overallStatus === 'normal' ? (
          <p className={`text-xs mt-0.5 ${cfg.desc}`}>
            결함 주파수에서 유의미한 이상이 감지되지 않았습니다.
          </p>
        ) : overallStatus === 'early_warning' ? (
          <p className={`text-xs mt-0.5 ${cfg.desc}`}>
            raw 측정값은 정상 범위이나, 결함 주파수 진폭이 상승 추세입니다.
            즉각적인 조치는 불필요하나 모니터링 주기를 단축하세요.
          </p>
        ) : (
          <p className={`text-xs mt-0.5 ${cfg.desc}`}>
            결함 주파수 진폭이 경보 임계값을 초과했습니다. 정비 일정을 수립하세요.
          </p>
        )}
      </div>
    </div>
  )
}

// ── 결함 주파수 추세 테이블 ───────────────────────────────
function FaultTrendTable({
  trends, isDark,
}: {
  trends: FftTrendItem[]
  isDark: boolean
}) {
  const border  = isDark ? 'border-slate-800' : 'border-slate-200'
  const thCls   = `px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-400' : 'text-slate-500'}`
  const tdCls   = `px-3 py-2.5 text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`

  return (
    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'}`}>
      <div className={`px-4 py-3 border-b ${border}`}>
        <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>
          결함 주파수 추세 분석
        </p>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          최근 3회 스펙트럼 기반 · raw 임계값 초과 여부와 무관하게 추세 판정
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className={`border-b ${border}`}>
              <th className={thCls}>항목</th>
              <th className={thCls}>주파수</th>
              <th className={thCls}>진폭 이력 (oldest → newest)</th>
              <th className={thCls + ' text-right'}>변화율</th>
              <th className={thCls}>상태</th>
            </tr>
          </thead>
          <tbody>
            {trends.map((t, i) => {
              const cfg       = STATUS_CFG[t.status]
              const isAnomaly = t.status !== 'normal'
              const trendIcon  = TREND_ICON[t.trend]
              const trendColor = TREND_COLOR[t.trend]
              return (
                <tr
                  key={t.label}
                  className={`${i < trends.length - 1 ? `border-b ${border}` : ''}
                    ${isAnomaly ? (isDark ? 'bg-slate-800/30' : 'bg-amber-50/60') : ''}`}
                >
                  {/* 항목 */}
                  <td className={tdCls}>
                    <span className={`font-bold ${cfg.text}`}>{t.label}</span>
                  </td>
                  {/* 주파수 */}
                  <td className={tdCls + ' font-mono'}>{t.freq} Hz</td>
                  {/* 진폭 이력 */}
                  <td className={tdCls}>
                    <div className="flex items-center gap-1 flex-wrap">
                      {t.history.map((amp, j) => (
                        <span key={j} className="flex items-center gap-1">
                          <span className={`font-mono tabular-nums
                            ${j === t.history.length - 1
                              ? isAnomaly ? cfg.text + ' font-bold' : (isDark ? 'text-slate-100 font-semibold' : 'text-slate-800 font-semibold')
                              : isDark ? 'text-slate-500' : 'text-slate-400'
                            }`}>
                            {amp.toFixed(3)}
                          </span>
                          {j < t.history.length - 1 && (
                            <span className={`text-[10px] ${trendColor}`}>→</span>
                          )}
                        </span>
                      ))}
                      {t.history.length === 0 && (
                        <span className={isDark ? 'text-slate-600' : 'text-slate-400'}>데이터 없음</span>
                      )}
                    </div>
                  </td>
                  {/* 변화율 */}
                  <td className={tdCls + ' text-right'}>
                    <span className={`font-mono font-semibold ${trendColor}`}>
                      {trendIcon} {t.rateOfChange > 0 ? '+' : ''}{t.rateOfChange}%
                    </span>
                  </td>
                  {/* 상태 */}
                  <td className={tdCls}>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                      {cfg.label}
                    </span>
                    {isAnomaly && t.warnThreshold && (
                      <span className={`ml-1.5 text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        임계: {t.warnThreshold} mm/s
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── FFT 진단 실행 버튼 ────────────────────────────────────
function AnalyzeButton({
  motorId, isDark, onResult,
}: {
  motorId: number
  isDark: boolean
  onResult: (r: AnalyzeResult) => void
}) {
  const [loading, setLoading] = useState(false)

  const run = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/fft/analyze', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ motor_id: motorId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'analyze 실패')
      onResult(data as AnalyzeResult)
    } catch (err) {
      alert(err instanceof Error ? err.message : '진단 실행 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all
        ${loading
          ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
          : isDark
            ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/30'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
        }`}
    >
      {loading ? (
        <>
          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          분석 중...
        </>
      ) : (
        <>
          <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M2 8h12M10 4l4 4-4 4" />
          </svg>
          FFT 진단 실행
        </>
      )}
    </button>
  )
}

// ── 분석 결과 알림 배너 ──────────────────────────────────
function AnalyzeResultBanner({
  result, isDark, onClose,
}: {
  result: AnalyzeResult
  isDark: boolean
  onClose: () => void
}) {
  const cfg = STATUS_CFG[result.overall_status]
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${cfg.bg} ${cfg.border}`}>
      <span className={`text-lg mt-0.5 ${cfg.text}`}>{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-bold ${cfg.text}`}>
          FFT 진단 완료 — {cfg.label}
        </p>
        <div className={`text-xs mt-1 space-y-0.5 ${cfg.desc}`}>
          {result.diagnosis_created && <p>· 진단 결과가 기록되었습니다.</p>}
          {result.alarm_created     && <p>· 새 알람이 생성되었습니다 (알람 이력에서 확인 가능).</p>}
          {!result.alarm_created && result.overall_status !== 'normal' &&
            <p>· 동일 유형의 활성 알람이 이미 존재하여 중복 생성하지 않았습니다.</p>}
          {result.overall_status === 'normal' &&
            <p>· 이상 없음. 진단 기록 및 알람이 생성되지 않았습니다.</p>}
        </div>
      </div>
      <button onClick={onClose} className={`shrink-0 text-sm ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}>✕</button>
    </div>
  )
}

// ── 히스토리 비교 카드 ────────────────────────────────────
function HistoryCards({
  spectra, bearingFreqs, isDark,
}: {
  spectra: FftSpectrum[]
  bearingFreqs: BearingFreqs
  isDark: boolean
}) {
  if (spectra.length < 2) return null
  const TOL = 4
  return (
    <div className={`rounded-xl border p-4 ${isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'}`}>
      <p className={`text-sm font-semibold mb-0.5 ${isDark ? 'text-white' : 'text-slate-800'}`}>스펙트럼 이력 비교</p>
      <p className={`text-xs mb-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
        최근 {spectra.length}회 측정 — BPFO 피크 진폭 추이
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {spectra.map((s, i) => {
          const bpfoIdx = s.freq_bins.reduce((best, f, j) =>
            Math.abs(f - bearingFreqs.bpfo) < Math.abs(s.freq_bins[best] - bearingFreqs.bpfo) ? j : best, 0)
          const bpfoAmp = Math.abs(s.freq_bins[bpfoIdx] - bearingFreqs.bpfo) <= TOL ? s.amp_bins[bpfoIdx] : 0
          const isAlert = bpfoAmp > 1.0
          return (
            <div key={s.id} className={`rounded-lg border p-3 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {i === 0 ? '최신' : `${i}회 전`}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold
                  ${isAlert ? 'bg-red-900/40 text-red-400' : isDark ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-100 text-emerald-600'}`}>
                  {isAlert ? '이상' : '정상'}
                </span>
              </div>
              <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {new Date(s.measured_at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                {s.rpm_measured ? ` · ${s.rpm_measured} RPM` : ''}
              </p>
              <div className="mt-2 flex justify-between items-end">
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>BPFO {bearingFreqs.bpfo}Hz</span>
                <span className={`text-sm font-bold font-mono ${isAlert ? 'text-red-400' : 'text-emerald-400'}`}>
                  {bpfoAmp.toFixed(3)} mm/s
                </span>
              </div>
              <div className={`mt-1.5 h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                <div className={`h-full rounded-full transition-all ${isAlert ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(bpfoAmp / 3 * 100, 100)}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 센서 현황 패널 ─────────────────────────────────────────
function SensorStatusPanel({
  rawMetrics, bearingFreqs, isDark,
}: {
  rawMetrics: RawMetrics
  bearingFreqs: BearingFreqs | undefined
  isDark: boolean
}) {
  const crest   = rawMetrics.crest_x         ?? 0
  const hf      = rawMetrics.hf_accel_x_rms  ?? 0
  const peakHz  = rawMetrics.peak_vel_freq_x  ?? 0

  // Crest Factor 상태
  const crestStatus = crest >= 4.0 ? 'warning' : crest >= 2.5 ? 'early_warning' : 'normal'
  // HF 가속도 상태
  const hfStatus    = hf >= 3.0 ? 'warning' : hf >= 1.5 ? 'early_warning' : 'normal'

  // 지배 주파수 결함 주파수 매칭
  let peakLabel: string | null = null
  if (bearingFreqs && peakHz > 0) {
    const TOL = 8
    const candidates: [string, number][] = [
      ['1X', bearingFreqs.f1x], ['2X', bearingFreqs.f2x], ['3X', bearingFreqs.f3x],
      ['BPFO', bearingFreqs.bpfo], ['BPFI', bearingFreqs.bpfi],
      ['BSF', bearingFreqs.bsf], ['FTF', bearingFreqs.ftf],
    ]
    let bestDist = Infinity
    for (const [label, freq] of candidates) {
      const dist = Math.abs(peakHz - freq)
      if (dist <= TOL && dist < bestDist) { bestDist = dist; peakLabel = label }
    }
  }

  const STATUS_META = {
    warning:       { badge: 'bg-red-500 text-white',             dot: 'bg-red-400',     text: '경보'    },
    early_warning: { badge: 'bg-amber-500 text-white',           dot: 'bg-amber-400',   text: '주의'    },
    normal:        { badge: isDark ? 'bg-emerald-900/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-400', text: '정상' },
  }

  const panel = isDark
    ? 'bg-[#0f172a] border-slate-800'
    : 'bg-white border-slate-200'
  const labelCls = isDark ? 'text-slate-500' : 'text-slate-400'
  const valCls   = isDark ? 'text-slate-200' : 'text-slate-700'

  return (
    <div className={`rounded-xl border p-4 mb-4 ${panel}`}>
      <p className={`text-xs font-semibold mb-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
        센서 현황 패널 (최신 raw 지표)
      </p>
      <div className="grid grid-cols-3 gap-4">
        {/* 지배 주파수 */}
        <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
          <p className={`text-[11px] mb-1 ${labelCls}`}>지배 주파수</p>
          <p className={`text-lg font-bold font-mono ${valCls}`}>
            {peakHz > 0 ? `${peakHz.toFixed(1)} Hz` : '—'}
          </p>
          {peakLabel && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 mt-1 inline-block">
              ≈ {peakLabel}
            </span>
          )}
          {peakHz > 0 && !peakLabel && (
            <span className={`text-[10px] mt-1 inline-block ${labelCls}`}>결함 주파수와 불일치</span>
          )}
        </div>

        {/* Crest Factor */}
        <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
          <p className={`text-[11px] mb-1 ${labelCls}`}>Crest Factor</p>
          <p className={`text-lg font-bold font-mono ${valCls}`}>
            {crest > 0 ? crest.toFixed(2) : '—'}
          </p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1 inline-block ${STATUS_META[crestStatus].badge}`}>
            {STATUS_META[crestStatus].text}
          </span>
          <p className={`text-[10px] mt-0.5 ${labelCls}`}>기준: 2.5 / 4.0</p>
        </div>

        {/* HF 가속도 RMS */}
        <div className={`rounded-lg p-3 ${isDark ? 'bg-slate-800/50' : 'bg-slate-50'}`}>
          <p className={`text-[11px] mb-1 ${labelCls}`}>HF 가속도 RMS</p>
          <p className={`text-lg font-bold font-mono ${valCls}`}>
            {hf > 0 ? `${hf.toFixed(2)} g` : '—'}
          </p>
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded mt-1 inline-block ${STATUS_META[hfStatus].badge}`}>
            {STATUS_META[hfStatus].text}
          </span>
          <p className={`text-[10px] mt-0.5 ${labelCls}`}>기준: 1.5g / 3.0g</p>
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ──────────────────────────────────────────
export default function FftPage() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  const [selectedMotorId, setSelectedMotorId] = useState<number>(1)
  const [axis, setAxis] = useState<Axis>('x')
  const [fmaxMode, setFmaxMode] = useState<FmaxMode>('auto')
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null)

  const { data: motorsData } =
    useSWR<ApiResponse<MotorStatus[]>>('/api/motors', fetcher, { revalidateOnFocus: false })
  const motors = motorsData?.data ?? []

  const { data: fftData, isLoading, error, mutate } =
    useSWR<FftApiResponse>(
      `/api/fft?motor_id=${selectedMotorId}&axis=${axis}&limit=3`,
      fetcher,
      { refreshInterval: 60_000, revalidateOnFocus: false }
    )

  const latestSpectrum = fftData?.spectra[0]
  const bearingFreqs   = fftData?.bearingFreqs
  const faultTrend     = fftData?.faultTrend ?? []

  // 스마트 fmax: BPFI × 2.5, 최소 300Hz, 50Hz 단위 올림
  const smartFmax = bearingFreqs
    ? Math.ceil(Math.max(bearingFreqs.bpfi * 2.5, 300) / 50) * 50
    : 300
  const fmaxDisplay: number | undefined =
    fmaxMode === 'auto' ? smartFmax
    : fmaxMode === 'all' ? undefined
    : fmaxMode

  // 스타일 헬퍼
  const card       = `rounded-xl border ${isDark ? 'bg-[#0f172a] border-slate-800' : 'bg-white border-slate-200'}`
  const heading    = `text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`
  const sub        = `text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`
  const btnBase    = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-all'
  const btnActive  = isDark
    ? 'bg-sky-950/80 text-cyan-400 border border-sky-800/50'
    : 'bg-indigo-50 text-indigo-600 border border-indigo-200'
  const btnInactive = isDark
    ? 'text-slate-400 hover:bg-slate-800/60 border border-transparent'
    : 'text-slate-500 hover:bg-slate-100 border border-transparent'

  const axisColor = isDark ? '#64748b' : '#94a3b8'
  const gridColor = isDark ? '#1e293b' : '#f1f5f9'

  return (
    <div className={`flex-1 min-h-screen p-4 md:p-6 space-y-5 ${isDark ? 'bg-[#0a0f1e]' : 'bg-slate-50'}`}>

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>FFT 스펙트럼 분석</h2>
          <p className={sub}>베어링 결함 주파수 감지 및 추세 기반 조기경보</p>
        </div>
        {fftData && (
          <p className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
            마지막 측정: {latestSpectrum ? new Date(latestSpectrum.measured_at).toLocaleString('ko-KR') : '—'}
            {latestSpectrum?.rpm_measured && ` · ${latestSpectrum.rpm_measured} RPM`}
          </p>
        )}
      </div>

      {/* 컨트롤 바 */}
      <div className={`${card} p-4 flex flex-wrap items-center gap-4`}>
        {/* 모터 선택 */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>모터</span>
          <select
            value={selectedMotorId}
            onChange={(e) => { setSelectedMotorId(Number(e.target.value)); setAnalyzeResult(null); setFmaxMode('auto') }}
            className={`text-xs rounded-lg px-2.5 py-1.5 border font-medium outline-none cursor-pointer
              ${isDark ? 'bg-slate-800 border-slate-700 text-slate-200 hover:border-cyan-600'
                       : 'bg-white border-slate-300 text-slate-700 hover:border-indigo-400'}`}
          >
            {motors.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {/* 축 선택 */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>축</span>
          <div className="flex gap-1">
            {AXES.map(({ key, label }) => (
              <button key={key} onClick={() => setAxis(key)}
                className={`${btnBase} ${axis === key ? btnActive : btnInactive}`}>{label}</button>
            ))}
          </div>
        </div>

        {/* Fmax 범위 */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>표시 범위</span>
          <div className="flex gap-1">
            <button onClick={() => setFmaxMode('auto')}
              className={`${btnBase} ${fmaxMode === 'auto' ? btnActive : btnInactive}`}>
              자동 {bearingFreqs ? `(${smartFmax}Hz)` : ''}
            </button>
            <button onClick={() => setFmaxMode('all')}
              className={`${btnBase} ${fmaxMode === 'all' ? btnActive : btnInactive}`}>전체</button>
            {FMAX_MANUAL.map((hz) => (
              <button key={hz} onClick={() => setFmaxMode(hz)}
                className={`${btnBase} ${fmaxMode === hz ? btnActive : btnInactive}`}>{hz} Hz</button>
            ))}
          </div>
        </div>

        {/* FFT 진단 실행 버튼 */}
        <div className="ml-auto">
          <AnalyzeButton
            motorId={selectedMotorId}
            isDark={isDark}
            onResult={(r) => { setAnalyzeResult(r); mutate() }}
          />
        </div>
      </div>

      {/* 분석 실행 결과 */}
      {analyzeResult && (
        <AnalyzeResultBanner
          result={analyzeResult}
          isDark={isDark}
          onClose={() => setAnalyzeResult(null)}
        />
      )}

      {/* 모터 정지 중 경고 배너 */}
      {fftData?.rawMetrics?.motor_running === false && (
        <div className={`flex items-center gap-3 rounded-xl border px-4 py-3
          ${isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-slate-100 border-slate-300'}`}>
          <span className="text-xl">⏹</span>
          <div>
            <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>센서 정지 중</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              motor_running = false — 현재 모터가 정지 상태입니다. FFT 분석 결과는 정지 중 수집된 데이터를 기반으로 합니다.
            </p>
          </div>
        </div>
      )}

      {/* 추세 기반 진단 배너 */}
      {!isLoading && faultTrend.length > 0 && (
        <DiagBanner faultTrend={faultTrend} isDark={isDark} />
      )}

      {/* 센서 현황 패널 */}
      {!isLoading && fftData?.rawMetrics && (
        <SensorStatusPanel
          rawMetrics={fftData.rawMetrics}
          bearingFreqs={bearingFreqs}
          isDark={isDark}
        />
      )}

      {/* 메인 스펙트럼 차트 */}
      <div className={`${card} p-4 md:p-5`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className={heading}>주파수 스펙트럼 — {axis.toUpperCase()}축</p>
            <p className={sub}>진폭 (mm/s) vs 주파수 (Hz) · 점선: 결함 주파수 기준선</p>
          </div>
          {bearingFreqs && (
            <span className={`text-xs px-2 py-1 rounded-md ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
              1X = {bearingFreqs.f1x} Hz
            </span>
          )}
        </div>

        {isLoading && (
          <div className="h-72 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="h-72 flex items-center justify-center">
            <p className="text-sm text-red-400">스펙트럼 데이터를 불러올 수 없습니다.</p>
          </div>
        )}
        {!isLoading && !error && latestSpectrum && bearingFreqs && (
          <FFTChart
            freqBins={latestSpectrum.freq_bins}
            ampBins={latestSpectrum.amp_bins}
            bearingFreqs={bearingFreqs}
            fmaxDisplay={fmaxDisplay}
            isDark={isDark}
          />
        )}
        {!isLoading && !error && !latestSpectrum && (
          <div className="h-72 flex items-center justify-center">
            <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>이 모터의 FFT 데이터가 없습니다.</p>
          </div>
        )}
      </div>

      {/* 하단 두 패널 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* 결함 주파수 추세 테이블 */}
        {faultTrend.length > 0
          ? <FaultTrendTable trends={faultTrend} isDark={isDark} />
          : bearingFreqs && (
            <div className={`${card} p-4`}>
              <p className={`${heading} mb-1`}>결함 주파수</p>
              <p className={`${sub} mb-3`}>스펙트럼 2개 이상 시 추세 분석 활성화</p>
              {[
                ['1X', bearingFreqs.f1x], ['2X', bearingFreqs.f2x],
                ['BPFO', bearingFreqs.bpfo], ['BPFI', bearingFreqs.bpfi],
                ['BSF', bearingFreqs.bsf], ['FTF', bearingFreqs.ftf],
              ].map(([l, f]) => (
                <div key={l as string} className="flex justify-between text-xs py-1">
                  <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{l as string}</span>
                  <span className="font-mono text-cyan-400">{(f as number).toFixed(2)} Hz</span>
                </div>
              ))}
            </div>
          )
        }

        {/* Peak 주파수 트렌드 */}
        <div className={`${card} p-4`}>
          <p className={`${heading} mb-0.5`}>Peak 주파수 트렌드 (24h)</p>
          <p className={`${sub} mb-3`}>시간별 진폭 최대 주파수 변화</p>

          {fftData?.peakTrend && fftData.peakTrend.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={fftData.peakTrend} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                  <XAxis
                    dataKey="bucket"
                    tickFormatter={(v) => new Date(v).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    tick={{ fill: axisColor, fontSize: 10 }}
                    axisLine={{ stroke: axisColor }} tickLine={false}
                  />
                  <YAxis
                    tick={{ fill: axisColor, fontSize: 10 }}
                    axisLine={{ stroke: axisColor }} tickLine={false} width={40}
                    label={{ value: 'Hz', angle: -90, position: 'insideLeft', offset: 12, fill: axisColor, fontSize: 10 }}
                  />
                  <Tooltip
                    contentStyle={{ background: isDark ? '#0f172a' : '#fff', border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, borderRadius: 8, fontSize: 11 }}
                    labelFormatter={(v) => new Date(v).toLocaleString('ko-KR')}
                    formatter={(v: unknown) => [`${Number(v).toFixed(1)} Hz`]}
                  />
                  {bearingFreqs && [
                    { freq: bearingFreqs.f1x,  label: '1X',   color: '#3b82f6' },
                    { freq: bearingFreqs.bpfo, label: 'BPFO', color: '#ef4444' },
                    { freq: bearingFreqs.bpfi, label: 'BPFI', color: '#f97316' },
                  ].map(({ freq, label, color }) => (
                    <ReferenceLine key={label} y={freq} stroke={color} strokeDasharray="4 3" strokeWidth={1}
                      label={{ value: label, position: 'right', fill: color, fontSize: 9 }} />
                  ))}
                  <Line type="monotone" dataKey="peak_x" stroke="#22d3ee" strokeWidth={2} dot={false} name="X축" />
                  <Line type="monotone" dataKey="peak_y" stroke="#a78bfa" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Y축" />
                  <Line type="monotone" dataKey="peak_z" stroke="#6ee7b7" strokeWidth={1.5} dot={false} strokeDasharray="2 2" name="Z축" />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2">
                {[['#22d3ee','X축'],['#a78bfa','Y축'],['#6ee7b7','Z축']].map(([color, label]) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className="w-3 h-0.5 inline-block rounded" style={{ backgroundColor: color }} />
                    <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-48 flex items-center justify-center">
              <p className={`text-sm ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                {isLoading ? '로딩 중...' : '24h 측정 데이터 없음'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 히스토리 비교 */}
      {fftData?.spectra && bearingFreqs && (
        <HistoryCards spectra={fftData.spectra} bearingFreqs={bearingFreqs} isDark={isDark} />
      )}

    </div>
  )
}
