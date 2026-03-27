'use client'

import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import type { FftBin, BearingFreqs } from '@/types'

// ── 결함 주파수 색상 ─────────────────────────────────────
const FAULT_COLORS: Record<string, string> = {
  '1X':   '#3b82f6',   // 파랑  — 불평형
  '2X':   '#8b5cf6',   // 보라  — 오정렬
  '3X':   '#6366f1',   // 인디고
  'FTF':  '#22d3ee',   // 시안
  'BSF':  '#f59e0b',   // 앰버  — 볼 스핀
  'BPFO': '#ef4444',   // 빨강  — 외륜 결함
  'BPFI': '#f97316',   // 주황  — 내륜 결함
}

const LEGEND_ITEMS = [
  { key: '1X',   label: '1X — 불평형',   color: FAULT_COLORS['1X']   },
  { key: '2X',   label: '2X — 오정렬',   color: FAULT_COLORS['2X']   },
  { key: 'BPFO', label: 'BPFO — 외륜결함', color: FAULT_COLORS['BPFO'] },
  { key: 'BPFI', label: 'BPFI — 내륜결함', color: FAULT_COLORS['BPFI'] },
  { key: 'BSF',  label: 'BSF — 볼결함',  color: FAULT_COLORS['BSF']  },
  { key: 'FTF',  label: 'FTF — 케이지',  color: FAULT_COLORS['FTF']  },
]

// ── 스펙트럼 빈에 레이블 매핑 ────────────────────────────
function labelBins(freqBins: number[], ampBins: number[], freqs: BearingFreqs, toleranceHz = 4): FftBin[] {
  const markers: { freq: number; label: string }[] = [
    { freq: freqs.f1x,  label: '1X'   },
    { freq: freqs.f2x,  label: '2X'   },
    { freq: freqs.f3x,  label: '3X'   },
    { freq: freqs.ftf,  label: 'FTF'  },
    { freq: freqs.bsf,  label: 'BSF'  },
    { freq: freqs.bpfo, label: 'BPFO' },
    { freq: freqs.bpfi, label: 'BPFI' },
  ]

  return freqBins.map((freq, i) => {
    const amp = ampBins[i]
    const match = markers.find((m) => Math.abs(freq - m.freq) <= toleranceHz)
    return {
      freq,
      amp,
      label: match?.label,
      color: match ? FAULT_COLORS[match.label] : undefined,
    }
  })
}

// ── 커스텀 툴팁 ──────────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as FftBin
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-slate-300 font-medium">{d.freq} Hz</p>
      <p className="text-cyan-400 font-bold">{d.amp.toFixed(4)} mm/s</p>
      {d.label && (
        <p className="mt-0.5 font-semibold" style={{ color: d.color }}>
          {d.label}
        </p>
      )}
    </div>
  )
}

// ── 커스텀 바 (결함 주파수는 강조색, 나머지는 기본) ──────
function CustomBar(props: any) {
  const { x, y, width, height, payload } = props
  const fill = (payload as FftBin).color ?? '#334155'
  const opacity = (payload as FftBin).label ? 1 : 0.7
  return <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={opacity} rx={1} />
}

// ── Props ─────────────────────────────────────────────────
interface FFTChartProps {
  freqBins:     number[]
  ampBins:      number[]
  bearingFreqs: BearingFreqs
  /** 최대 표시 주파수 (기본: 전체) */
  fmaxDisplay?: number
  isDark?: boolean
  height?: number
}

export default function FFTChart({ freqBins, ampBins, bearingFreqs, fmaxDisplay, isDark = true, height = 300 }: FFTChartProps) {
  const bins = labelBins(freqBins, ampBins, bearingFreqs)
  const displayed = fmaxDisplay ? bins.filter((b) => b.freq <= fmaxDisplay) : bins

  const axisColor   = isDark ? '#64748b' : '#94a3b8'
  const gridColor   = isDark ? '#1e293b' : '#f1f5f9'
  const textColor   = isDark ? '#94a3b8' : '#64748b'

  // 결함 주파수 ReferenceLine 목록
  const refLines = [
    { freq: bearingFreqs.f1x,  label: '1X'   },
    { freq: bearingFreqs.f2x,  label: '2X'   },
    { freq: bearingFreqs.f3x,  label: '3X'   },
    { freq: bearingFreqs.ftf,  label: 'FTF'  },
    { freq: bearingFreqs.bsf,  label: 'BSF'  },
    { freq: bearingFreqs.bpfo, label: 'BPFO' },
    { freq: bearingFreqs.bpfi, label: 'BPFI' },
  ].filter((r) => !fmaxDisplay || r.freq <= fmaxDisplay)

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={displayed} margin={{ top: 28, right: 24, bottom: 8, left: 4 }}
          barCategoryGap="2%">
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
          <XAxis
            dataKey="freq"
            type="number"
            domain={['dataMin', fmaxDisplay ?? 'dataMax']}
            tickCount={11}
            tickFormatter={(v) => `${v}`}
            tick={{ fill: textColor, fontSize: 11 }}
            axisLine={{ stroke: axisColor }}
            tickLine={{ stroke: axisColor }}
          />
          <YAxis
            dataKey="amp"
            tickFormatter={(v) => v.toFixed(2)}
            tick={{ fill: textColor, fontSize: 11 }}
            axisLine={{ stroke: axisColor }}
            tickLine={{ stroke: axisColor }}
            label={{ value: 'mm/s', angle: -90, position: 'insideLeft', offset: 12, fill: textColor, fontSize: 11 }}
            width={52}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />

          {/* 결함 주파수 수직선 */}
          {refLines.map(({ freq, label }) => (
            <ReferenceLine
              key={label}
              x={freq}
              stroke={FAULT_COLORS[label] ?? '#64748b'}
              strokeDasharray="4 3"
              strokeWidth={1.5}
              label={{ value: label, position: 'top', fill: FAULT_COLORS[label], fontSize: 10, fontWeight: 600 }}
            />
          ))}

          <Bar dataKey="amp" shape={<CustomBar />} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-1">
        {LEGEND_ITEMS.map((l) => (
          <div key={l.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: l.color }} />
            <span className="text-[11px] text-slate-400">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
