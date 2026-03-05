/**
 * SVG 기반 FFT 스펙트럼 차트 와이어프레임
 * 실제 구현 시 Recharts BarChart / ECharts 로 교체
 */

interface FFTBin {
  freq: number;   // Hz
  energy: number; // 0~100
  highlight?: "bpfo" | "bpfi" | "1x" | "2x";
}

// 더미 FFT 데이터
const dummyBins: FFTBin[] = [
  { freq: 30,  energy: 72, highlight: "1x"   },  // 1X (30Hz, 1800 RPM)
  { freq: 60,  energy: 28, highlight: "2x"   },  // 2X
  { freq: 90,  energy: 12 },
  { freq: 120, energy: 65, highlight: "bpfo" },  // BPFO 피크
  { freq: 150, energy: 8  },
  { freq: 180, energy: 18 },
  { freq: 210, energy: 5  },
  { freq: 240, energy: 25, highlight: "bpfi" },  // BPFI
  { freq: 300, energy: 10 },
  { freq: 360, energy: 6  },
  { freq: 420, energy: 14 },
  { freq: 480, energy: 4  },
  { freq: 540, energy: 9  },
  { freq: 600, energy: 3  },
];

const highlightColors: Record<string, string> = {
  bpfo: "#ef4444",
  bpfi: "#f97316",
  "1x": "#3b82f6",
  "2x": "#8b5cf6",
};

export default function FFTChart() {
  const W = 100;
  const H = 60;
  const barWidth = W / dummyBins.length - 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-slate-700">FFT 스펙트럼</p>
        <span className="text-xs text-slate-400">주파수 (Hz)</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-28">
        {/* 그리드 */}
        {[0.25, 0.5, 0.75].map((r) => (
          <line key={r} x1="0" y1={H * r} x2={W} y2={H * r}
            stroke="#f1f5f9" strokeWidth="0.5" />
        ))}
        {/* 바 */}
        {dummyBins.map((bin, i) => {
          const x = i * (W / dummyBins.length) + 0.5;
          const barH = (bin.energy / 100) * (H - 4);
          const y = H - barH;
          const color = bin.highlight ? highlightColors[bin.highlight] : "#94a3b8";
          return (
            <rect key={bin.freq} x={x} y={y} width={barWidth} height={barH}
              fill={color} fillOpacity={bin.highlight ? 0.85 : 0.5} rx="0.3" />
          );
        })}
      </svg>
      {/* x축 레이블 */}
      <div className="flex justify-between mt-1">
        {["0", "150", "300", "450", "600"].map((f) => (
          <span key={f} className="text-[10px] text-slate-400">{f}Hz</span>
        ))}
      </div>
      {/* 범례 */}
      <div className="flex flex-wrap gap-3 mt-3">
        {[
          { key: "1x",   label: "1X (불평형)",   color: "#3b82f6" },
          { key: "2x",   label: "2X (오정렬)",   color: "#8b5cf6" },
          { key: "bpfo", label: "BPFO (외륜결함)", color: "#ef4444" },
          { key: "bpfi", label: "BPFI (내륜결함)", color: "#f97316" },
        ].map((l) => (
          <div key={l.key} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
            <span className="text-[10px] text-slate-500">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
