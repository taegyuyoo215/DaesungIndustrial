'use client'

import {
  ComposedChart, Line, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import type { TrendPoint } from './TrendChart'

interface MultiTrendChartProps {
  velData:  TrendPoint[]
  tempData: TrendPoint[]
  kurtData: TrendPoint[]
}

// 툴팁 커스터마이저
function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { name: string; value: number; color: string; unit: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1.5">{label ? new Date(label).toLocaleString('ko-KR') : ''}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-slate-300">{p.name}</span>
          <span className="font-semibold ml-auto pl-4" style={{ color: p.color }}>
            {p.value != null ? Number(p.value).toFixed(2) : '—'} {p.unit}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function MultiTrendChart({
  velData, tempData, kurtData,
}: MultiTrendChartProps) {
  // 세 데이터셋을 time 기준으로 병합
  const timeMap = new Map<string, { time: string; vel?: number | null; temp?: number | null; kurt?: number | null }>()

  for (const p of velData)  {
    const e = timeMap.get(p.time) ?? { time: p.time }
    e.vel  = p.value
    timeMap.set(p.time, e)
  }
  for (const p of tempData) {
    const e = timeMap.get(p.time) ?? { time: p.time }
    e.temp = p.value
    timeMap.set(p.time, e)
  }
  for (const p of kurtData) {
    const e = timeMap.get(p.time) ?? { time: p.time }
    e.kurt = p.value
    timeMap.set(p.time, e)
  }

  const merged = [...timeMap.values()].sort(
    (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
  )

  const rangeMs =
    merged.length >= 2
      ? new Date(merged[merged.length - 1].time).getTime() - new Date(merged[0].time).getTime()
      : 0
  const rangeDays = rangeMs / (24 * 3_600_000)
  const showTime  = rangeMs < 6 * 3_600_000

  const tickFmt = (v: string) => {
    const d = new Date(v)
    return showTime
      ? `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      : `${d.getMonth() + 1}/${d.getDate()}`
  }

  // 표시할 틱 수를 ~7개로 고정
  // - 1시간 미만(분 단위): 6등분
  // - 다일 범위(7일·30일 등): 데이터 포인트 수 / 7 → 하루 1개꼴
  const tickInterval = showTime
    ? Math.max(0, Math.floor(merged.length / 6) - 1)
    : rangeDays > 1
      ? Math.max(1, Math.floor(merged.length / 7))
      : 'preserveStartEnd' as const

  if (merged.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-400 dark:text-slate-600 text-xs">
        데이터 없음
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={merged} margin={{ top: 8, right: 8, left: 8, bottom: 4 }}>

        {/* 왼쪽 Y축: Velocity + Kurtosis */}
        <YAxis
          yAxisId="left"
          tick={{ fontSize: 9 }}
          width={44}
          tickFormatter={v => Number(v).toFixed(1)}
        />

        {/* 오른쪽 Y축: Temperature */}
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fontSize: 9, fill: '#f97316' }}
          width={44}
          tickFormatter={v => `${Number(v).toFixed(0)}°`}
        />

        <XAxis
          dataKey="time"
          tick={{ fontSize: 9 }}
          tickFormatter={tickFmt}
          interval={tickInterval}
        />

        <Tooltip content={<CustomTooltip />} />

        <Legend
          iconType="plainline"
          iconSize={14}
          wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
          formatter={(value) => <span className="text-slate-400 dark:text-slate-400">{value}</span>}
        />

        {/* 라인: Velocity */}
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="vel"
          name="RMS Vel"
          unit=" mm/s"
          stroke="#3b82f6"
          strokeWidth={1.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />

        {/* 라인: Kurtosis */}
        <Line
          yAxisId="left"
          type="monotone"
          dataKey="kurt"
          name="Kurtosis"
          unit=""
          stroke="#8b5cf6"
          strokeWidth={1.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />

        {/* 라인: Temperature */}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="temp"
          name="온도"
          unit=" °C"
          stroke="#f97316"
          strokeWidth={1.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />

      </ComposedChart>
    </ResponsiveContainer>
  )
}
