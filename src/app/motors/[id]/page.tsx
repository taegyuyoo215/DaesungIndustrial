import StatusBadge from "@/components/StatusBadge";
import TrendChart from "@/components/charts/TrendChart";
import FFTChart from "@/components/charts/FFTChart";
import Link from "next/link";

// ────────────────────── 더미 진단 데이터 ──────────────────────
const motorDetail = {
  id: "m03",
  name: "팬 모터 #3",
  location: "B동 1라인",
  status: "critical" as const,
  rpm: 3600,
  power: 22,           // kW
  motorClass: "II",    // ISO 분류
  installedAt: "2021-06-15",
  lastMaintained: "2025-09-20",
  sensor: "QM30VT3-MQP (S/N: VT3-00123)",

  // 실시간 수치
  rmsVelocity:   { x: 7.8, y: 8.2, z: 5.4 },    // mm/s
  hfAcceleration:{ x: 3.9, y: 4.1, z: 2.7 },    // g
  peakAccel:     { x: 18.2, y: 20.5, z: 12.8 }, // g
  kurtosis:      { x: 9.2, y: 9.8, z: 6.4 },
  temperature: 74,

  // 진단 결과
  diagnosis: {
    faultType: "베어링 외륜 결함 (BPFO)",
    confidence: 84,
    rulDays: 12,
    evidence: [
      { label: "HF Acceleration Y축", value: "4.1 g", threshold: "2.0 g", exceeded: true },
      { label: "Kurtosis Y축", value: "9.8", threshold: "6.0", exceeded: true },
      { label: "BPFO (120 Hz) 대역 에너지", value: "+340%", threshold: "+100%", exceeded: true },
      { label: "온도", value: "74 °C", threshold: "70 °C", exceeded: true },
    ],
  },

  // 알람 이력 (최근)
  recentAlarms: [
    { time: "2026-03-05 14:23", severity: "critical", message: "BPFO 120Hz 에너지 급등" },
    { time: "2026-03-04 09:11", severity: "warning",  message: "HF Acceleration 임계값 초과" },
    { time: "2026-03-02 16:45", severity: "warning",  message: "Kurtosis 상승 감지" },
  ],
};

// ────────────────────── 서브 컴포넌트 ──────────────────────
function MeasurementRow({ label, x, y, z, unit, warnVal }: {
  label: string; x: number; y: number; z: number; unit: string; warnVal: number;
}) {
  const cell = (val: number) => (
    <td className={`px-4 py-3 text-sm font-semibold text-right ${val > warnVal ? "text-red-600" : "text-slate-700"}`}>
      {val.toFixed(1)} <span className="font-normal text-slate-400 text-xs">{unit}</span>
    </td>
  );
  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3 text-sm text-slate-600">{label}</td>
      {cell(x)}{cell(y)}{cell(z)}
    </tr>
  );
}

// ────────────────────── 페이지 ──────────────────────
export default function MotorDetailPage() {
  const m = motorDetail;
  const d = m.diagnosis;

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-2">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600">대시보드</Link>
        <span className="text-slate-300">/</span>
        <span className="text-sm text-slate-700 font-medium">{m.name}</span>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{m.name}</h1>
            <StatusBadge status={m.status} />
          </div>
          <p className="text-sm text-slate-500 mt-1">{m.location} · {m.sensor}</p>
        </div>
        <div className="flex gap-2">
          <button className="border border-slate-300 text-slate-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50">
            정비 기록 추가
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
            보고서 생성
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* 좌측: 진단 결과 + 측정값 */}
        <div className="col-span-2 space-y-6">

          {/* 진단 결과 카드 */}
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">AI 진단 결과</p>
                <h2 className="text-lg font-bold text-red-800">{d.faultType}</h2>
              </div>
              <div className="text-right">
                <p className="text-xs text-red-500 mb-1">신뢰도</p>
                <p className="text-2xl font-extrabold text-red-700">{d.confidence}%</p>
              </div>
            </div>

            {/* RUL */}
            <div className="mt-4 bg-white rounded-lg px-4 py-3 border border-red-200 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-500">예측 잔존 수명 (RUL)</p>
                <p className="text-xl font-bold text-red-700 mt-0.5">{d.rulDays}일 이내 정비 필요</p>
              </div>
              <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${(d.rulDays / 90) * 100}%` }} />
              </div>
            </div>

            {/* 진단 근거 */}
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wide">진단 근거</p>
              {d.evidence.map((ev) => (
                <div key={ev.label} className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-red-100">
                  <span className="text-sm text-slate-700">{ev.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400">임계: {ev.threshold}</span>
                    <span className={`text-sm font-bold ${ev.exceeded ? "text-red-600" : "text-green-600"}`}>
                      {ev.value} {ev.exceeded ? "↑" : "✓"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 실시간 측정값 테이블 */}
          <div className="bg-white rounded-xl border border-slate-200">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">실시간 측정값</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">항목</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">X축</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Y축</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-400 uppercase tracking-wide">Z축</th>
                </tr>
              </thead>
              <tbody>
                <MeasurementRow label="RMS Velocity" {...m.rmsVelocity} unit="mm/s" warnVal={4.5} />
                <MeasurementRow label="HF Acceleration" {...m.hfAcceleration} unit="g" warnVal={3.5} />
                <MeasurementRow label="Peak Acceleration" {...m.peakAccel} unit="g" warnVal={15.0} />
                <MeasurementRow label="Kurtosis" {...m.kurtosis} unit="" warnVal={6.0} />
              </tbody>
            </table>
            <div className="px-5 py-3 border-t border-slate-100 flex items-center gap-4">
              <span className="text-xs text-slate-500">온도</span>
              <span className={`text-sm font-bold ${m.temperature > 70 ? "text-red-600" : "text-slate-700"}`}>
                {m.temperature} °C
              </span>
              <span className="text-xs text-slate-400 ml-auto">업데이트: 14:35:22</span>
            </div>
          </div>

          {/* 트렌드 차트 */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-3">진동·온도 트렌드 (최근 7일)</h3>
            <div className="grid grid-cols-2 gap-4">
              <TrendChart label="RMS Velocity (Y축)" unit="mm/s" color="#3b82f6" warningLine={2.8} criticalLine={4.5} />
              <TrendChart label="HF Acceleration (Y축)" unit="g" color="#ef4444" warningLine={2.0} criticalLine={3.5} />
              <TrendChart label="Kurtosis (Y축)" unit="" color="#8b5cf6" warningLine={6} criticalLine={10} />
              <TrendChart label="온도" unit="°C" color="#f97316" warningLine={60} criticalLine={70} />
            </div>
          </div>

          {/* FFT 차트 */}
          <FFTChart />
        </div>

        {/* 우측: 설비 정보 + 알람 이력 */}
        <div className="space-y-6">
          {/* 설비 정보 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">설비 정보</h3>
            <div className="space-y-3">
              {[
                { label: "정격 RPM", value: `${m.rpm} rpm` },
                { label: "정격 출력", value: `${m.power} kW` },
                { label: "ISO 분류", value: `Class ${m.motorClass}` },
                { label: "설치일", value: m.installedAt },
                { label: "최근 정비일", value: m.lastMaintained },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">{item.label}</span>
                  <span className="text-sm font-medium text-slate-700">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* VIBE-IQ 상태 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">VIBE-IQ 상태</h3>
            <div className="space-y-3">
              {[
                { label: "베이스라인 학습", value: "완료", ok: true },
                { label: "학습 기간", value: "7일 (2026-01-10~17)", ok: true },
                { label: "센서 연결 상태", value: "정상 (RS-485)", ok: true },
                { label: "마지막 수신", value: "14:35:22", ok: true },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center">
                  <span className="text-xs text-slate-400">{item.label}</span>
                  <span className={`text-xs font-semibold ${item.ok ? "text-green-600" : "text-red-600"}`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 최근 알람 이력 */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">최근 알람</h3>
            <div className="space-y-3">
              {m.recentAlarms.map((alarm, i) => (
                <div key={i} className="flex gap-3">
                  <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                    alarm.severity === "critical" ? "bg-red-500" : "bg-yellow-400"
                  }`} />
                  <div>
                    <p className="text-xs font-medium text-slate-700">{alarm.message}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{alarm.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
