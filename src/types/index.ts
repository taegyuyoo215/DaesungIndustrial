// ──────────────────────────────────────────────────────────
// MOTOR-IQ 공통 타입 정의
// ──────────────────────────────────────────────────────────

// ── 공통 ──────────────────────────────────────────────────

export type Severity = 'normal' | 'warning' | 'critical'
export type AlarmState = 'active' | 'acknowledged' | 'resolved'
export type FaultType =
  | 'bearing_outer'
  | 'bearing_inner'
  | 'imbalance'
  | 'misalignment'
  | 'looseness'
  | 'overheat'
  | 'normal'

// ── 모터 ──────────────────────────────────────────────────

export interface Motor {
  id: number
  site_id: number
  site_name?: string
  name: string
  location: string | null
  rated_rpm: number | null
  rated_power_kw: number | null
  iso_class: 'I' | 'II' | 'III' | 'IV' | null
  bearing_model: string | null
  bearing_ball_count: number | null
  bearing_contact_angle_deg: number | null
  bearing_ball_dia_mm: number | null
  bearing_pitch_dia_mm: number | null
  installed_at: string | null
  created_at: string
}

// 대시보드용 모터 상태 (v_motor_status 뷰)
export interface MotorStatus extends Motor {
  sensor_id: number | null
  modbus_addr: number | null
  last_measured_at: string | null
  vel_x_rms: number | null
  vel_y_rms: number | null
  vel_z_rms: number | null
  temperature_c: number | null
  kurtosis_x: number | null
  kurtosis_y: number | null
  kurtosis_z: number | null
  hf_accel_x_rms: number | null
  crest_x: number | null
  pkpk_accel_x: number | null
  peak_vel_freq_x: number | null
  motor_running: boolean | null
  active_alarms: number
  // 계산 필드
  severity: Severity
  // 24h 전 대비 변화량
  vel_y_delta: number | null
  temp_delta: number | null
  kurtosis_delta: number | null
}

// ── 센서 ──────────────────────────────────────────────────

export interface Sensor {
  id: number
  motor_id: number
  motor_name?: string
  serial_number: string
  modbus_addr: number
  fmax_setting: 1 | 2 | 3 | 4 | 5
  hfe_enabled: boolean
  measure_interval_ms: number
  status: 'active' | 'inactive' | 'error'
  last_seen_at: string | null
  created_at: string
}

// ── 측정값 ────────────────────────────────────────────────

export interface Measurement {
  time: string
  sensor_id: number
  vel_x_rms: number | null
  vel_y_rms: number | null
  vel_z_rms: number | null
  hf_accel_x_rms: number | null
  hf_accel_y_rms: number | null
  hf_accel_z_rms: number | null
  pkpk_accel_x: number | null
  pkpk_accel_y: number | null
  pkpk_accel_z: number | null
  hf_peak_x: number | null
  hf_peak_y: number | null
  hf_peak_z: number | null
  crest_x: number | null
  crest_y: number | null
  crest_z: number | null
  kurtosis_x: number | null
  kurtosis_y: number | null
  kurtosis_z: number | null
  peak_vel_freq_x: number | null
  peak_vel_freq_y: number | null
  peak_vel_freq_z: number | null
  temperature_c: number | null
  motor_running: boolean | null
  mag_hf_accel: number | null
}

// 트렌드 차트용 집계 데이터
export interface HourlyAvg {
  bucket: string
  sensor_id: number
  vel_x_avg: number | null
  vel_y_avg: number | null
  vel_z_avg: number | null
  kurtosis_x_max: number | null
  temp_avg: number | null
  crest_x_avg: number | null
  pkpk_x_avg: number | null
  peak_vel_freq_x_avg: number | null
  kurtosis_z_avg: number | null
}

// 원시 지표 상태 (FFT 페이지 센서 현황 패널)
export interface RawMetricStatus {
  label: string
  value: number
  status: 'normal' | 'early_warning' | 'warning'
  unit: string
}

// ── 임계값 ────────────────────────────────────────────────

export interface Threshold {
  id: number
  motor_id: number | null
  metric: 'vel_rms' | 'hf_accel' | 'kurtosis' | 'temperature'
  warn_value: number
  alarm_value: number
  unit: string | null
}

// ── 진단 결과 ─────────────────────────────────────────────

export interface DiagnosisResult {
  id: number
  motor_id: number
  diagnosed_at: string
  fault_type: FaultType | null
  confidence: number | null
  severity: Severity | null
  rul_days: number | null
  evidence: DiagnosisEvidence | null
  model_version: string | null
}

export interface DiagnosisEvidence {
  metrics?: { label: string; value: string; threshold: string; exceeded: boolean }[]
  freq_peaks?: { freq_hz: number; label: string; energy: number }[]
}

// ── 알람 ──────────────────────────────────────────────────

export interface Alarm {
  id: number
  motor_id: number
  motor_name?: string
  motor_location?: string
  diagnosis_result_id: number | null
  severity: 'warning' | 'critical'
  state: AlarmState
  fault_type: FaultType | null
  message: string | null
  triggered_at: string
  acknowledged_at: string | null
  acknowledged_by: number | null
  acknowledged_by_name?: string | null
  resolved_at: string | null
  resolved_by: number | null
}

// ── 정비 이력 ─────────────────────────────────────────────

export interface MaintenanceLog {
  id: number
  motor_id: number
  motor_name?: string
  alarm_id: number | null
  work_type: string
  description: string | null
  parts_replaced: PartItem[] | null
  performed_by: number | null
  performed_by_name?: string | null
  performed_at: string
  next_due_at: string | null
  created_at: string
}

export interface PartItem {
  name: string
  qty: number
}

// ── FFT 스펙트럼 ──────────────────────────────────────────

export interface FftSpectrum {
  id: number
  motor_id: number
  sensor_id: number
  measured_at: string
  axis: 'x' | 'y' | 'z'
  fmax_hz: number
  resolution_hz: number
  rpm_measured: number | null
  freq_bins: number[]
  amp_bins: number[]
}

/** 결함 주파수별 추세 분석 결과 */
export interface FftTrendItem {
  label: string                               // '1X' | '2X' | 'BPFO' | 'BPFI' | 'BSF' | 'FTF'
  freq: number                                // Hz
  history: number[]                           // 시간순 진폭 배열 (oldest → newest)
  trend: 'rising' | 'stable' | 'falling'
  rateOfChange: number                        // oldest → newest 변화율 (%)
  status: 'normal' | 'early_warning' | 'warning'
  currentAmp: number                          // 최신 진폭 (mm/s)
  warnThreshold: number                       // 경보 임계값
  earlyWarnThreshold: number                  // 조기경보 임계값
}

/** 차트에 바인딩할 단일 빈 */
export interface FftBin {
  freq: number
  amp: number
  label?: string   // '1X' | '2X' | 'BPFO' | 'BPFI' | 'BSF' | 'FTF'
  color?: string
}

/** 베어링 결함 주파수 계산 결과 */
export interface BearingFreqs {
  rpm: number
  f1x: number    // 1X (shaft)
  f2x: number    // 2X
  f3x: number    // 3X
  ftf: number    // Fundamental Train Frequency
  bsf: number    // Ball Spin Frequency
  bpfo: number   // Ball Pass Frequency Outer race
  bpfi: number   // Ball Pass Frequency Inner race
}

// ── API 응답 래퍼 ─────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  total?: number
  page?: number
  limit?: number
}

export interface ApiError {
  error: string
  detail?: string
}
// ── 도면 및 핀 (지도 기반 대시보드) ────────────────────────
export interface FloorPlan {
  id: number
  name: string
  file_name: string
  file_path?: string
  page_count: number
  created_at: string
}

export interface MotorPin {
  id: number
  motor_id: number
  motor_name: string
  location: string | null
  floor_plan_id?: number
  page: number
  x_pct: number
  y_pct: number
  severity: Severity
  vel_y_rms: number | null
  temperature_c: number | null
  fault_type: FaultType | null
}
