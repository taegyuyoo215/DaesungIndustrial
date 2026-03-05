/**
 * SVG 기반 트렌드 차트 와이어프레임
 * 실제 구현 시 Recharts / ECharts 로 교체
 */

type Point = { x: number; y: number };

function generateWavePath(points: Point[]): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}

// 더미 데이터 생성
function makeDummyPoints(count: number, baseY: number, noise: number): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    x: (i / (count - 1)) * 100,
    y: baseY + (Math.sin(i * 0.6) * noise + Math.random() * noise * 0.5),
  }));
}

interface TrendChartProps {
  label: string;
  unit: string;
  color?: string;
  warningLine?: number;
  criticalLine?: number;
}

export default function TrendChart({
  label,
  unit,
  color = "#3b82f6",
  warningLine,
  criticalLine,
}: TrendChartProps) {
  const W = 100;
  const H = 60;
  const points = makeDummyPoints(30, H * 0.55, H * 0.2);
  // 마지막 구간에서 트렌드 상승 시뮬레이션
  points.slice(-8).forEach((p, i) => { p.y -= i * 1.5; });

  const path = generateWavePath(points);
  const areaPath = `${path} L ${W} ${H} L 0 ${H} Z`;

  // 임계선 y 위치 (단순 비율 매핑)
  const warnY = warningLine ? H * 0.4 : null;
  const critY = criticalLine ? H * 0.2 : null;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <span className="text-xs text-slate-400">{unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-20">
        {/* 그리드 라인 */}
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={r} x1="0" y1={H * r} x2={W} y2={H * r}
            stroke="#f1f5f9" strokeWidth="0.5" />
        ))}
        {/* 경보 라인 */}
        {critY && (
          <line x1="0" y1={critY} x2={W} y2={critY}
            stroke="#ef4444" strokeWidth="0.5" strokeDasharray="2,2" />
        )}
        {warnY && (
          <line x1="0" y1={warnY} x2={W} y2={warnY}
            stroke="#f59e0b" strokeWidth="0.5" strokeDasharray="2,2" />
        )}
        {/* Area */}
        <path d={areaPath} fill={color} fillOpacity="0.1" />
        {/* Line */}
        <path d={path} fill="none" stroke={color} strokeWidth="1.2"
          strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      {/* x축 레이블 */}
      <div className="flex justify-between mt-1">
        {["7일전", "5일전", "3일전", "1일전", "현재"].map((t) => (
          <span key={t} className="text-[10px] text-slate-400">{t}</span>
        ))}
      </div>
    </div>
  );
}
