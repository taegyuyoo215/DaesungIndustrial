'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'

export interface TrendPoint { time: string; value: number | null }

interface TrendChartProps {
  label: string
  unit: string
  data?: TrendPoint[]
  color?: string
  warningLine?: number
  criticalLine?: number
  bare?: boolean  // Widget 내부용 — 카드 래퍼·헤더 생략, absolute inset-0 으로 채움
}

export default function TrendChart({
  label, unit, data = [], color = '#3b82f6', warningLine, criticalLine, bare = false,
}: TrendChartProps) {
  const rangeMs =
    data.length >= 2
      ? new Date(data[data.length - 1].time).getTime() - new Date(data[0].time).getTime()
      : 0
  const showTimeFormat = rangeMs < 6 * 3_600_000

  const tickFmt = (v: string) => {
    const d = new Date(v)
    return showTimeFormat
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : `${d.getMonth() + 1}/${d.getDate()}`
  }

  const tickInterval = showTimeFormat
    ? Math.max(0, Math.floor(data.length / 6) - 1)
    : 'preserveStartEnd' as const

  // 차트 본체 (bare / normal 공용)
  const lineChart = (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="time"
          tick={{ fontSize: 9 }}
          tickFormatter={tickFmt}
          interval={tickInterval}
        />
        <YAxis tick={{ fontSize: 9 }} width={35} />
        <Tooltip
          formatter={(v) => [`${Number(v).toFixed(2)} ${unit}`, label]}
          labelFormatter={(l) => new Date(l).toLocaleString('ko-KR')}
          contentStyle={{ fontSize: 12 }}
        />
        {warningLine !== undefined && (
          <ReferenceLine
            y={warningLine} stroke="#f59e0b" strokeDasharray="3 3"
            label={{ value: '주의', position: 'insideTopRight', fontSize: 9, fill: '#f59e0b' }}
          />
        )}
        {criticalLine !== undefined && (
          <ReferenceLine
            y={criticalLine} stroke="#ef4444" strokeDasharray="3 3"
            label={{ value: '경보', position: 'insideTopRight', fontSize: 9, fill: '#ef4444' }}
          />
        )}
        <Line
          type="monotone" dataKey="value" stroke={color}
          strokeWidth={1.5} dot={false} connectNulls
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )

  // ── bare 모드: Widget content div(position:relative) 기준으로 꽉 채움
  if (bare) {
    return (
      <div className="absolute inset-0">
        {data.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs">
            데이터 없음
          </div>
        ) : lineChart}
      </div>
    )
  }

  // ── 일반 모드: 자체 카드 래퍼 포함
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{label}</p>
        <span className="text-xs text-slate-400 dark:text-slate-600">{unit}</span>
      </div>
      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs">
          데이터 없음
        </div>
      ) : (
        <div className="flex-1 min-h-0">{lineChart}</div>
      )}
    </div>
  )
}
