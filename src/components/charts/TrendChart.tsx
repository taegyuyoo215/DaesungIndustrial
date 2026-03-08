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
}

export default function TrendChart({
  label, unit, data = [], color = '#3b82f6', warningLine, criticalLine,
}: TrendChartProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <span className="text-xs text-slate-400">{unit}</span>
      </div>
      {data.length === 0 ? (
        <div className="h-28 flex items-center justify-center text-slate-400 text-xs">
          데이터 없음
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={112}>
          <LineChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 9 }}
              tickFormatter={(v) => {
                const d = new Date(v)
                return `${d.getMonth() + 1}/${d.getDate()}`
              }}
              interval="preserveStartEnd"
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
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  )
}
