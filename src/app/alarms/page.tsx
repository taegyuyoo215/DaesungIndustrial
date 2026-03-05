// ────────────────────── 더미 데이터 ──────────────────────
type Severity = "critical" | "warning";
type AlarmState = "active" | "acknowledged" | "resolved";

interface Alarm {
  id: number;
  motorName: string;
  location: string;
  severity: Severity;
  state: AlarmState;
  faultType: string;
  message: string;
  triggeredAt: string;
  resolvedAt?: string;
  acknowledgedBy?: string;
}

const alarms: Alarm[] = [
  { id: 1,  motorName: "팬 모터 #3",   location: "B동 1라인", severity: "critical", state: "active",       faultType: "베어링 결함",  message: "BPFO 120Hz 에너지 급등 — 외륜 결함 의심",       triggeredAt: "2026-03-05 14:23" },
  { id: 2,  motorName: "펌프 모터 #2", location: "A동 2라인", severity: "warning",  state: "acknowledged", faultType: "오정렬",       message: "RMS Velocity 임계값 초과 (3.8 mm/s)",            triggeredAt: "2026-03-05 13:51", acknowledgedBy: "김엔지니어" },
  { id: 3,  motorName: "호이스트 #6",  location: "C동 2라인", severity: "warning",  state: "active",       faultType: "불평형",       message: "1X 주파수 성분 증가 감지",                        triggeredAt: "2026-03-05 12:10" },
  { id: 4,  motorName: "컴프레서 #1",  location: "A동 1라인", severity: "warning",  state: "resolved",     faultType: "과열",         message: "온도 65°C 초과 — 냉각 점검 필요",               triggeredAt: "2026-03-04 17:30", resolvedAt: "2026-03-04 18:15" },
  { id: 5,  motorName: "믹서 모터 #5", location: "C동 1라인", severity: "critical", state: "resolved",     faultType: "베어링 결함",  message: "Kurtosis 11.2 — 베어링 내륜 결함 의심",          triggeredAt: "2026-03-03 09:00", resolvedAt: "2026-03-03 14:00" },
  { id: 6,  motorName: "컨베이어 #4",  location: "B동 2라인", severity: "warning",  state: "resolved",     faultType: "풀림",         message: "고조파 다수 출현 — 구조적 풀림 의심",             triggeredAt: "2026-03-02 11:20", resolvedAt: "2026-03-02 16:30" },
];

// ────────────────────── 서브 컴포넌트 ──────────────────────
const severityConfig = {
  critical: { dot: "bg-red-500",    badge: "bg-red-50 text-red-700 border-red-200",    label: "경보" },
  warning:  { dot: "bg-yellow-400", badge: "bg-yellow-50 text-yellow-700 border-yellow-200", label: "주의" },
};

const stateConfig = {
  active:       { label: "활성",    style: "bg-red-50 text-red-600 border border-red-200" },
  acknowledged: { label: "확인됨",  style: "bg-blue-50 text-blue-600 border border-blue-200" },
  resolved:     { label: "해결됨",  style: "bg-green-50 text-green-600 border border-green-200" },
};

function AlarmRow({ alarm }: { alarm: Alarm }) {
  const sc = severityConfig[alarm.severity];
  const ac = stateConfig[alarm.state];
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-5 py-4">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sc.dot}`} />
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${sc.badge}`}>
            {sc.label}
          </span>
        </div>
      </td>
      <td className="px-5 py-4">
        <p className="text-sm font-semibold text-slate-800">{alarm.motorName}</p>
        <p className="text-xs text-slate-400 mt-0.5">{alarm.location}</p>
      </td>
      <td className="px-5 py-4">
        <p className="text-sm font-medium text-slate-700">{alarm.faultType}</p>
        <p className="text-xs text-slate-500 mt-0.5">{alarm.message}</p>
      </td>
      <td className="px-5 py-4">
        <p className="text-sm text-slate-700">{alarm.triggeredAt}</p>
        {alarm.resolvedAt && (
          <p className="text-xs text-slate-400 mt-0.5">해결: {alarm.resolvedAt}</p>
        )}
      </td>
      <td className="px-5 py-4">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ac.style}`}>
          {ac.label}
        </span>
        {alarm.acknowledgedBy && (
          <p className="text-[11px] text-slate-400 mt-1">{alarm.acknowledgedBy}</p>
        )}
      </td>
      <td className="px-5 py-4">
        <div className="flex gap-2">
          {alarm.state === "active" && (
            <button className="text-xs text-blue-600 hover:underline font-medium">확인</button>
          )}
          <button className="text-xs text-slate-500 hover:underline">상세</button>
        </div>
      </td>
    </tr>
  );
}

// ────────────────────── 페이지 ──────────────────────
export default function AlarmsPage() {
  const active   = alarms.filter((a) => a.state === "active").length;
  const critical = alarms.filter((a) => a.severity === "critical" && a.state === "active").length;

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">알람 이력</h1>
          <p className="text-sm text-slate-500 mt-1">
            활성 알람 {active}건 · 경보 {critical}건
          </p>
        </div>
        <button className="border border-slate-300 text-slate-600 text-sm font-medium px-4 py-2 rounded-lg hover:bg-slate-50">
          Excel 내보내기
        </button>
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl border border-slate-200 px-5 py-4 mb-6 flex items-center gap-4">
        <div className="flex gap-2">
          {["전체", "경보", "주의"].map((f) => (
            <button key={f} className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              f === "전체" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
            }`}>{f}</button>
          ))}
        </div>
        <div className="w-px h-6 bg-slate-200" />
        <div className="flex gap-2">
          {["전체 상태", "활성", "확인됨", "해결됨"].map((f) => (
            <button key={f} className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${
              f === "전체 상태" ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-50"
            }`}>{f}</button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="text"
            placeholder="모터명 검색..."
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 w-48 focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
      </div>

      {/* 알람 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {["심각도", "모터", "고장 유형 / 메시지", "발생 시간", "상태", "액션"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {alarms.map((alarm) => (
              <AlarmRow key={alarm.id} alarm={alarm} />
            ))}
          </tbody>
        </table>

        {/* 페이지네이션 */}
        <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between">
          <p className="text-xs text-slate-400">{alarms.length}개 중 1-{alarms.length} 표시</p>
          <div className="flex gap-1">
            {[1, 2, 3].map((p) => (
              <button key={p} className={`w-8 h-8 text-sm rounded-lg ${
                p === 1 ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"
              }`}>{p}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
