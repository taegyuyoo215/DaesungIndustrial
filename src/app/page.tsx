import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";

// ────────────────────── 더미 데이터 ──────────────────────
const motors = [
  { id: "m01", name: "컴프레서 #1",  location: "A동 1라인", rpm: 1800, rms: 1.2, temp: 42, status: "normal"   as const, fault: null },
  { id: "m02", name: "펌프 모터 #2", location: "A동 2라인", rpm: 1800, rms: 3.8, temp: 58, status: "warning"  as const, fault: "오정렬 의심" },
  { id: "m03", name: "팬 모터 #3",   location: "B동 1라인", rpm: 3600, rms: 8.2, temp: 74, status: "critical" as const, fault: "베어링 외륜 결함" },
  { id: "m04", name: "컨베이어 #4",  location: "B동 2라인", rpm: 900,  rms: 0.9, temp: 39, status: "normal"   as const, fault: null },
  { id: "m05", name: "믹서 모터 #5", location: "C동 1라인", rpm: 1200, rms: 2.1, temp: 51, status: "normal"   as const, fault: null },
  { id: "m06", name: "호이스트 #6",  location: "C동 2라인", rpm: 900,  rms: 4.5, temp: 63, status: "warning"  as const, fault: "불평형 의심" },
];

const recentAlarms = [
  { id: 1, motorName: "팬 모터 #3",   severity: "critical" as const, message: "베어링 외륜 결함 의심 — BPFO 120Hz 에너지 급등", ago: "12분 전" },
  { id: 2, motorName: "펌프 모터 #2", severity: "warning"  as const, message: "RMS Velocity 임계값 초과 (3.8 mm/s > 2.8 mm/s)",   ago: "44분 전" },
  { id: 3, motorName: "호이스트 #6",  severity: "warning"  as const, message: "1X 주파수 성분 증가 — 불평형 의심",                  ago: "2시간 전" },
];

const summary = {
  total:    motors.length,
  normal:   motors.filter((m) => m.status === "normal").length,
  warning:  motors.filter((m) => m.status === "warning").length,
  critical: motors.filter((m) => m.status === "critical").length,
};

// ────────────────────── 서브 컴포넌트 ──────────────────────
function SummaryCard({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`bg-white rounded-xl border-2 ${accent} p-5`}>
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="text-4xl font-extrabold mt-1">{value}</p>
      <p className="text-xs text-slate-400 mt-1">대</p>
    </div>
  );
}

function MotorCard({ motor }: { motor: typeof motors[0] }) {
  const borderMap = { normal: "border-slate-200", warning: "border-yellow-300", critical: "border-red-400" };

  return (
    <Link href={`/motors/${motor.id}`}>
      <div className={`bg-white rounded-xl border-2 ${borderMap[motor.status]} p-5 hover:shadow-md transition-shadow h-full`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="font-semibold text-slate-800">{motor.name}</p>
            <p className="text-xs text-slate-400 mt-0.5">{motor.location}</p>
          </div>
          <StatusBadge status={motor.status} />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: "RMS", value: `${motor.rms.toFixed(1)}`, unit: "mm/s", warn: motor.rms > 2.8, crit: motor.rms > 4.5 },
            { label: "TEMP", value: `${motor.temp}`, unit: "°C", warn: motor.temp > 60, crit: motor.temp > 70 },
            { label: "RPM", value: `${motor.rpm}`, unit: "rpm", warn: false, crit: false },
          ].map((item) => (
            <div key={item.label} className="bg-slate-50 rounded-lg py-2">
              <p className="text-[10px] text-slate-400 tracking-wide">{item.label}</p>
              <p className={`text-sm font-bold mt-0.5 ${item.crit ? "text-red-600" : item.warn ? "text-yellow-600" : "text-slate-700"}`}>
                {item.value}
              </p>
              <p className="text-[10px] text-slate-400">{item.unit}</p>
            </div>
          ))}
        </div>

        {motor.fault && (
          <div className={`mt-3 px-3 py-1.5 rounded-lg text-xs font-medium ${
            motor.status === "critical" ? "bg-red-50 text-red-700" : "bg-yellow-50 text-yellow-700"
          }`}>
            ⚠ {motor.fault}
          </div>
        )}
      </div>
    </Link>
  );
}

// ────────────────────── 페이지 ──────────────────────
export default function DashboardPage() {
  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">대시보드</h1>
          <p className="text-sm text-slate-500 mt-1">
            전체 모터 현황 · 최종 업데이트 2026-03-05 14:35
          </p>
        </div>
        <div className="flex items-center gap-3">
          {summary.critical > 0 && (
            <span className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 rounded-lg px-4 py-2 text-sm font-semibold">
              🔴 경보 {summary.critical}건 발생
            </span>
          )}
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            + 모터 등록
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <SummaryCard label="전체 모터" value={summary.total}    accent="border-slate-200"  />
        <SummaryCard label="정상"      value={summary.normal}   accent="border-green-300"  />
        <SummaryCard label="주의"      value={summary.warning}  accent="border-yellow-300" />
        <SummaryCard label="경보"      value={summary.critical} accent="border-red-400"    />
      </div>

      {/* 모터 카드 그리드 */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-700">모터 현황</h2>
          <Link href="/motors" className="text-sm text-blue-600 hover:underline">전체 보기 →</Link>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {motors.map((motor) => (
            <MotorCard key={motor.id} motor={motor} />
          ))}
        </div>
      </div>

      {/* 최근 알람 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-700">최근 알람</h2>
          <Link href="/alarms" className="text-sm text-blue-600 hover:underline">전체 보기 →</Link>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {recentAlarms.map((alarm) => (
            <div key={alarm.id} className="flex items-center gap-4 px-5 py-4">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                alarm.severity === "critical" ? "bg-red-500" : "bg-yellow-400"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800">{alarm.motorName}</p>
                <p className="text-xs text-slate-500 truncate mt-0.5">{alarm.message}</p>
              </div>
              <span className="text-xs text-slate-400 shrink-0 whitespace-nowrap">{alarm.ago}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
