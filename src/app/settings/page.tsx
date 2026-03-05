"use client";
import { useState } from "react";

// ────────────────────── 더미 데이터 ──────────────────────
const registeredSensors = [
  { id: "s01", serial: "VT3-00121", motorName: "컴프레서 #1",  address: 1, status: "connected" },
  { id: "s02", serial: "VT3-00122", motorName: "펌프 모터 #2", address: 2, status: "connected" },
  { id: "s03", serial: "VT3-00123", motorName: "팬 모터 #3",   address: 3, status: "connected" },
  { id: "s04", serial: "VT3-00124", motorName: "컨베이어 #4",  address: 4, status: "disconnected" },
];

const tabs = ["센서 관리", "임계값 설정", "알림 설정", "사용자 관리"];

// ────────────────────── 탭 콘텐츠 ──────────────────────
function SensorManagementTab() {
  return (
    <div className="space-y-6">
      {/* 센서 등록 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">새 센서 등록</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">시리얼 번호</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="VT3-XXXXX" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">모터명</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="예: 컴프레서 #7" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Modbus 주소 (1-32)</label>
            <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="5" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">설치 위치</label>
            <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="예: D동 1라인" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">정격 RPM</label>
            <input type="number" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="1800" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">ISO 등급</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option>Class I (≤15 kW)</option>
              <option>Class II (15~75 kW)</option>
              <option>Class III (75~300 kW)</option>
              <option>Class IV ({'>'} 300 kW)</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2 rounded-lg">
            센서 등록
          </button>
        </div>
      </div>

      {/* 등록된 센서 목록 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">등록된 센서 ({registeredSensors.length})</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              {["시리얼", "연결 모터", "Modbus 주소", "연결 상태", "액션"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registeredSensors.map((s) => (
              <tr key={s.id} className="border-t border-slate-100">
                <td className="px-5 py-3 text-sm font-mono text-slate-700">{s.serial}</td>
                <td className="px-5 py-3 text-sm text-slate-700">{s.motorName}</td>
                <td className="px-5 py-3 text-sm text-slate-500">#{s.address}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    s.status === "connected"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}>
                    {s.status === "connected" ? "연결됨" : "연결 끊김"}
                  </span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex gap-3">
                    <button className="text-xs text-blue-600 hover:underline">편집</button>
                    <button className="text-xs text-red-500 hover:underline">삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThresholdTab() {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        ISO 10816 기준값이 기본으로 적용됩니다. 모터 특성에 따라 개별 조정이 가능합니다.
      </div>

      {/* ISO 등급별 기준 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-700">ISO 등급별 RMS Velocity 기준 (mm/s)</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50">
              {["ISO 등급", "정상", "주의", "경보", "위험"].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["Class I (≤15 kW)",    "< 2.3", "2.3 ~ 4.5", "4.5 ~ 7.1", "> 7.1"],
              ["Class II (15~75 kW)", "< 2.8", "2.8 ~ 7.1", "7.1 ~ 11.2", "> 11.2"],
              ["Class III (75~300 kW)","< 3.5","3.5 ~ 7.1", "7.1 ~ 18.0", "> 18.0"],
              ["Class IV (> 300 kW)", "< 3.5", "3.5 ~ 11.2","11.2 ~ 18.0","> 18.0"],
            ].map(([cls, n, w, a, d]) => (
              <tr key={cls} className="border-t border-slate-100">
                <td className="px-5 py-3 text-sm text-slate-700 font-medium">{cls}</td>
                <td className="px-5 py-3 text-sm text-green-600 font-semibold">{n}</td>
                <td className="px-5 py-3 text-sm text-yellow-600 font-semibold">{w}</td>
                <td className="px-5 py-3 text-sm text-orange-600 font-semibold">{a}</td>
                <td className="px-5 py-3 text-sm text-red-600 font-semibold">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 커스텀 임계값 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">모터별 커스텀 임계값</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">대상 모터</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option>팬 모터 #3</option>
              <option>펌프 모터 #2</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">항목</label>
            <select className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              <option>RMS Velocity (mm/s)</option>
              <option>HF Acceleration (g)</option>
              <option>Kurtosis</option>
              <option>온도 (°C)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">주의 임계값</label>
            <input type="number" step="0.1" className="w-full border border-yellow-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300" placeholder="2.8" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">경보 임계값</label>
            <input type="number" step="0.1" className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300" placeholder="4.5" />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button className="bg-slate-900 hover:bg-slate-700 text-white text-sm font-medium px-5 py-2 rounded-lg">
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-5">이메일 알림 설정</h3>
        <div className="space-y-4">
          {[
            { label: "경보(Critical) 발생 시", defaultOn: true },
            { label: "주의(Warning) 발생 시", defaultOn: true },
            { label: "센서 연결 끊김 시", defaultOn: true },
            { label: "일일 상태 요약 리포트", defaultOn: false },
            { label: "주간 트렌드 리포트", defaultOn: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
              <span className="text-sm text-slate-700">{item.label}</span>
              <div className={`w-10 h-6 rounded-full transition-colors cursor-pointer ${item.defaultOn ? "bg-blue-600" : "bg-slate-200"}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow mt-1 transition-transform ${item.defaultOn ? "translate-x-5" : "translate-x-1"}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">수신자 목록</h3>
        <div className="space-y-2 mb-4">
          {["engineer@company.com", "manager@company.com"].map((email) => (
            <div key={email} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2.5">
              <span className="text-sm text-slate-700">{email}</span>
              <button className="text-xs text-red-500 hover:underline">삭제</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" placeholder="이메일 주소 추가..." />
          <button className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg">추가</button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────── 페이지 ──────────────────────
export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(0);

  const tabContents = [
    <SensorManagementTab key="sensor" />,
    <ThresholdTab key="threshold" />,
    <NotificationTab key="notification" />,
    <div key="user" className="bg-white rounded-xl border border-slate-200 p-6 text-sm text-slate-500">사용자 관리 (준비 중)</div>,
  ];

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">설정</h1>
        <p className="text-sm text-slate-500 mt-1">센서, 임계값, 알림 설정을 관리합니다</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-slate-200 mb-6">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === i
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {tabContents[activeTab]}
    </div>
  );
}
