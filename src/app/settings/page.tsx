'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import type { Sensor, Threshold, Motor, ApiResponse } from '@/types'

const tabs = ['센서 관리', '임계값 설정', '알림 설정', '사용자 관리']

// ── 상태 배지 ─────────────────────────────────────────────

function SensorStatusBadge({ status }: { status: string }) {
  const s: Record<string, string> = {
    active:   'bg-green-50 dark:bg-emerald-900/20 text-green-700 dark:text-emerald-400 border-green-200',
    inactive: 'bg-slate-50 dark:bg-[#0a0f1e] text-slate-500 border-slate-200 dark:border-slate-800',
    error:    'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200',
  }
  const labels: Record<string, string> = { active: '활성', inactive: '비활성', error: '오류' }
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${s[status] ?? s.inactive}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ── 센서 관리 탭 ──────────────────────────────────────────

function SensorManagementTab() {
  const { data, mutate, isLoading } =
    useSWR<ApiResponse<Sensor[]>>('/api/settings/sensors', fetcher)
  const sensors = data?.data ?? []

  const [saving, setSaving] = useState<number | null>(null)

  async function toggleStatus(sensor: Sensor) {
    setSaving(sensor.id)
    const newStatus = sensor.status === 'active' ? 'inactive' : 'active'
    await fetch(`/api/settings/sensors/${sensor.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    await mutate()
    setSaving(null)
  }

  return (
    <div className="space-y-6">
      {/* 등록된 센서 목록 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            등록된 센서 {isLoading ? '…' : `(${sensors.length})`}
          </h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#0a0f1e]">
              {['시리얼', '연결 모터', 'Modbus', 'Fmax', 'HFE', '상태', '마지막 수신', '액션'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-slate-400 text-sm">불러오는 중...</td>
              </tr>
            ) : sensors.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-10 text-center text-slate-400 text-sm">등록된 센서가 없습니다</td>
              </tr>
            ) : (
              sensors.map(s => (
                <tr key={s.id} className="border-t border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-5 py-3 text-sm font-mono text-slate-700 dark:text-slate-300">{s.serial_number}</td>
                  <td className="px-5 py-3 text-sm text-slate-700 dark:text-slate-300">{s.motor_name ?? `Motor #${s.motor_id}`}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">#{s.modbus_addr}</td>
                  <td className="px-5 py-3 text-sm text-slate-500">
                    {['5300Hz','2650Hz','1325Hz','662Hz','325Hz'][s.fmax_setting - 1]}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-500">
                    {s.hfe_enabled ? '활성' : '비활성'}
                  </td>
                  <td className="px-5 py-3">
                    <SensorStatusBadge status={s.status} />
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-400 dark:text-slate-600 whitespace-nowrap">
                    {s.last_seen_at ? new Date(s.last_seen_at).toLocaleString('ko-KR') : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => toggleStatus(s)}
                      disabled={saving === s.id}
                      className="text-xs text-blue-600 hover:underline disabled:opacity-50"
                    >
                      {s.status === 'active' ? '비활성화' : '활성화'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 임계값 설정 탭 ────────────────────────────────────────

function ThresholdTab() {
  const { data: motorRes } = useSWR<ApiResponse<Motor[]>>('/api/motors', fetcher)
  const motors = motorRes?.data ?? []

  const { data: thRes, mutate } =
    useSWR<ApiResponse<Threshold[]>>('/api/settings/thresholds', fetcher)
  const thresholds = thRes?.data ?? []

  const [selectedMotorId, setSelectedMotorId] = useState<string>('')
  const [metric, setMetric] = useState<string>('vel_rms')
  const [warnVal, setWarnVal] = useState('')
  const [alarmVal, setAlarmVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const metricOptions = [
    { value: 'vel_rms',     label: 'RMS Velocity (mm/s)' },
    { value: 'hf_accel',   label: 'HF Acceleration (g)' },
    { value: 'kurtosis',   label: 'Kurtosis' },
    { value: 'temperature', label: '온도 (°C)' },
  ]

  const metricUnits: Record<string, string> = {
    vel_rms: 'mm/s', hf_accel: 'g', kurtosis: '', temperature: '°C'
  }

  async function handleSave() {
    if (!warnVal || !alarmVal) return
    setSaving(true)
    await fetch('/api/settings/thresholds', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        motor_id:    selectedMotorId ? Number(selectedMotorId) : null,
        metric,
        warn_value:  Number(warnVal),
        alarm_value: Number(alarmVal),
        unit:        metricUnits[metric],
      }),
    })
    await mutate()
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        ISO 10816 기준값이 기본으로 적용됩니다. 모터 특성에 따라 개별 조정이 가능합니다.
      </div>

      {/* 현재 임계값 목록 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800/60">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">현재 임계값 목록</h3>
        </div>
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 dark:bg-[#0a0f1e]">
              {['대상 모터', '항목', '주의', '경보', '단위'].map(h => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {thresholds.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-slate-400 text-sm">불러오는 중...</td>
              </tr>
            ) : (
              thresholds.map(t => (
                <tr key={t.id} className="border-t border-slate-100 dark:border-slate-800/60">
                  <td className="px-5 py-3 text-sm text-slate-700 dark:text-slate-300">
                    {t.motor_id
                      ? (motors.find(m => m.id === t.motor_id)?.name ?? `Motor #${t.motor_id}`)
                      : '전역 기본값'}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-700 dark:text-slate-300">
                    {metricOptions.find(o => o.value === t.metric)?.label ?? t.metric}
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold text-yellow-600">
                    {Number(t.warn_value).toFixed(1)}
                  </td>
                  <td className="px-5 py-3 text-sm font-semibold text-red-600">
                    {Number(t.alarm_value).toFixed(1)}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-400 dark:text-slate-600">{t.unit ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 임계값 편집 */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">임계값 추가 / 수정</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">대상 모터</label>
            <select
              value={selectedMotorId}
              onChange={e => setSelectedMotorId(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
            >
              <option value="">전역 기본값</option>
              {motors.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">항목</label>
            <select
              value={metric}
              onChange={e => setMetric(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
            >
              {metricOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">주의 임계값</label>
            <input
              type="number" step="0.1" value={warnVal}
              onChange={e => setWarnVal(e.target.value)}
              placeholder="예: 2.8"
              className="w-full border border-yellow-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-300"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">경보 임계값</label>
            <input
              type="number" step="0.1" value={alarmVal}
              onChange={e => setAlarmVal(e.target.value)}
              placeholder="예: 4.5"
              className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-end gap-3">
          {saved && <span className="text-xs text-green-600 font-medium">저장되었습니다 ✓</span>}
          <button
            onClick={handleSave}
            disabled={saving || !warnVal || !alarmVal}
            className="bg-slate-900 dark:bg-slate-100 hover:bg-slate-700 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-sm font-medium px-5 py-2 rounded-lg disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 알림 설정 탭 ──────────────────────────────────────────

function NotificationTab() {
  const [toggles, setToggles] = useState({
    critical: true,
    warning: true,
    disconnected: true,
    daily: false,
    weekly: false,
  })

  const items: { key: keyof typeof toggles; label: string }[] = [
    { key: 'critical',     label: '경보(Critical) 발생 시' },
    { key: 'warning',      label: '주의(Warning) 발생 시' },
    { key: 'disconnected', label: '센서 연결 끊김 시' },
    { key: 'daily',        label: '일일 상태 요약 리포트' },
    { key: 'weekly',       label: '주간 트렌드 리포트' },
  ]

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-5">이메일 알림 설정</h3>
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.key} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
              <span className="text-sm text-slate-700 dark:text-slate-300">{item.label}</span>
              <button
                onClick={() => setToggles(prev => ({ ...prev, [item.key]: !prev[item.key] }))}
                className={`w-10 h-6 rounded-full transition-colors ${toggles[item.key] ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow mt-1 mx-auto transition-transform ${
                  toggles[item.key] ? 'translate-x-2' : '-translate-x-2'
                }`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">수신자 목록</h3>
        <div className="space-y-2 mb-4">
          {['engineer@company.com', 'manager@company.com'].map(email => (
            <div key={email} className="flex items-center justify-between bg-slate-50 dark:bg-[#0a0f1e] rounded-lg px-4 py-2.5">
              <span className="text-sm text-slate-700 dark:text-slate-300">{email}</span>
              <button className="text-xs text-red-500 hover:underline">삭제</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-cyan-700"
            placeholder="이메일 주소 추가..."
          />
          <button className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg">추가</button>
        </div>
      </div>
    </div>
  )
}

// ── 페이지 ────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState(0)

  const tabContents = [
    <SensorManagementTab key="sensor" />,
    <ThresholdTab key="threshold" />,
    <NotificationTab key="notification" />,
    <div key="user" className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 text-sm text-slate-500">
      사용자 관리 (준비 중)
    </div>,
  ]

  return (
    <div className="p-8 max-w-screen-xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">설정</h1>
        <p className="text-sm text-slate-500 mt-1">센서, 임계값, 알림 설정을 관리합니다</p>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 mb-6">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === i
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {tabContents[activeTab]}
    </div>
  )
}
