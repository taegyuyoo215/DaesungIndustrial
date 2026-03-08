'use client'

interface SparklineProps {
  data: number[]
  height?: number
  warnValue?: number
  critValue?: number
}

const W = 200
const PADDING = 2

export default function Sparkline({ data, height = 28, warnValue, critValue }: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <div className="w-full flex items-center justify-center" style={{ height }}>
        <span className="text-[10px] text-slate-300">데이터 없음</span>
      </div>
    )
  }

  const H = height - PADDING * 2

  const allValues = [
    ...data,
    ...(warnValue != null ? [warnValue] : []),
    ...(critValue != null ? [critValue] : []),
  ]
  const min = Math.min(...allValues) * 0.92
  const max = Math.max(...allValues) * 1.08
  const range = max - min || 1

  const toX = (i: number) => (i / (data.length - 1)) * W
  const toY = (v: number) => PADDING + H - ((v - min) / range) * H

  const points = data.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')

  const lastVal = data[data.length - 1]
  const lineColor =
    critValue != null && lastVal > critValue ? '#ef4444' :
    warnValue != null && lastVal > warnValue ? '#f59e0b' :
    '#94a3b8'

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height, display: 'block' }}
    >
      {/* 경고 기준선 */}
      {warnValue != null && (
        <line
          x1={0} y1={toY(warnValue).toFixed(1)}
          x2={W} y2={toY(warnValue).toFixed(1)}
          stroke="#f59e0b" strokeWidth={1} strokeDasharray="4 3" opacity={0.5}
        />
      )}
      {/* 경보 기준선 */}
      {critValue != null && (
        <line
          x1={0} y1={toY(critValue).toFixed(1)}
          x2={W} y2={toY(critValue).toFixed(1)}
          stroke="#ef4444" strokeWidth={1} strokeDasharray="4 3" opacity={0.5}
        />
      )}
      {/* 데이터 라인 */}
      <polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 마지막 포인트 점 */}
      <circle
        cx={toX(data.length - 1).toFixed(1)}
        cy={toY(lastVal).toFixed(1)}
        r={2.5}
        fill={lineColor}
      />
    </svg>
  )
}
