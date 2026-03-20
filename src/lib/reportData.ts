/**
 * reportData.ts
 * 보고서 생성에 필요한 DB 데이터를 조회하고
 * Excel / Word 템플릿에 주입할 수 있는 구조로 반환합니다.
 *
 * ── 템플릿 플레이스홀더 목록 ─────────────────────────────────
 *
 * [단일값] Excel: {{key}}  /  Word: {key}
 *   report_date          보고서 생성일 (예: 2026-03-20)
 *   report_title         보고서 제목
 *   motor_count_total    전체 모터 수
 *   motor_count_normal   정상 모터 수
 *   motor_count_warning  주의 모터 수
 *   motor_count_critical 경보 모터 수
 *   alarm_count_total    전체 알람 수
 *   alarm_count_active   활성 알람 수
 *   alarm_count_resolved 해결 알람 수
 *   alarm_count_critical 경보 알람 수
 *   alarm_count_warning  주의 알람 수
 *   maintenance_count    정비 이력 건수
 *
 * [반복 - Word 전용] {#motors}...{/motors}
 *   {name}           모터명
 *   {location}       위치
 *   {severity_ko}    상태 (정상/주의/경보)
 *   {vel_y_rms}      진동 RMS (mm/s)
 *   {temperature_c}  온도 (°C)
 *   {kurtosis_y}     Kurtosis
 *   {fault_type_ko}  결함 유형 (한국어)
 *   {rul_days}       잔존수명 (일)
 *
 * [반복 - Word 전용] {#alarms}...{/alarms}
 *   {alarm_date}     발생일
 *   {motor_name}     모터명
 *   {severity_ko}    심각도
 *   {fault_type_ko}  결함 유형
 *   {message}        메시지
 *   {state_ko}       상태 (활성/확인됨/해결됨)
 *
 * [반복 - Word 전용] {#maintenance}...{/maintenance}
 *   {performed_at}       정비일
 *   {motor_name}         모터명
 *   {work_type}          유형
 *   {description}        내용
 *   {performed_by_name}  담당자
 *
 * [Excel 반복행] 셀에 {{motors.name}}, {{motors.location}} 등을 포함한 행을
 *   자동으로 감지해 모터 수만큼 복제합니다.
 *   (alarms.xxx, maintenance.xxx 도 동일)
 */

import { query } from '@/lib/db'

// ── 한국어 변환 ───────────────────────────────────────────────

const SEVERITY_KO: Record<string, string> = {
  normal:   '정상',
  warning:  '주의',
  critical: '경보',
}

const FAULT_KO: Record<string, string> = {
  bearing_outer: '베어링 외륜 결함',
  bearing_inner: '베어링 내륜 결함',
  imbalance:     '불평형',
  misalignment:  '오정렬',
  looseness:     '풀림',
  overheat:      '과열',
}

const STATE_KO: Record<string, string> = {
  active:       '활성',
  acknowledged: '확인됨',
  resolved:     '해결됨',
}

// ── 타입 ─────────────────────────────────────────────────────

export interface ReportMotor {
  name:          string
  location:      string
  severity:      string
  severity_ko:   string
  vel_y_rms:     string
  temperature_c: string
  kurtosis_y:    string
  fault_type:    string
  fault_type_ko: string
  rul_days:      string
}

export interface ReportAlarm {
  alarm_date:    string
  motor_name:    string
  severity:      string
  severity_ko:   string
  fault_type:    string
  fault_type_ko: string
  message:       string
  state:         string
  state_ko:      string
}

export interface ReportMaintenance {
  performed_at:      string
  motor_name:        string
  work_type:         string
  description:       string
  performed_by_name: string
}

export interface ReportData {
  // 단일값
  report_date:          string
  report_title:         string
  motor_count_total:    number
  motor_count_normal:   number
  motor_count_warning:  number
  motor_count_critical: number
  alarm_count_total:    number
  alarm_count_active:   number
  alarm_count_resolved: number
  alarm_count_critical: number
  alarm_count_warning:  number
  maintenance_count:    number
  // 반복
  motors:      ReportMotor[]
  alarms:      ReportAlarm[]
  maintenance: ReportMaintenance[]
}

// ── 빌더 ─────────────────────────────────────────────────────

export async function buildReportData(): Promise<ReportData> {
  const now = new Date()

  // 모터 + 최신 측정값 + 최신 진단
  const motorRows = await query<{
    id: number; name: string; location: string | null
    vel_y_rms: string | null; temperature_c: string | null; kurtosis_y: string | null
    fault_type: string | null; severity: string | null; rul_days: number | null
  }>(`
    SELECT
      m.id, m.name, m.location,
      lm.vel_y_rms::text,
      lm.temperature_c::text,
      lm.kurtosis_y::text,
      d.fault_type,
      COALESCE(d.severity,
        CASE
          WHEN lm.hf_accel_x_rms >= 3.0 OR lm.vel_y_rms >= 7.1 OR lm.kurtosis_y >= 8.0 OR lm.temperature_c >= 70 THEN 'critical'
          WHEN lm.hf_accel_x_rms >= 1.5 OR lm.vel_y_rms >= 2.8 OR lm.kurtosis_y >= 5.0 OR lm.temperature_c >= 60 THEN 'warning'
          ELSE 'normal'
        END
      ) AS severity,
      d.rul_days
    FROM motors m
    LEFT JOIN sensors s ON s.motor_id = m.id AND s.status = 'active'
    LEFT JOIN LATERAL (
      SELECT vel_y_rms, temperature_c, kurtosis_y, hf_accel_x_rms
      FROM measurements WHERE sensor_id = s.id ORDER BY time DESC LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT fault_type, severity, rul_days
      FROM diagnosis_results WHERE motor_id = m.id ORDER BY diagnosed_at DESC LIMIT 1
    ) d ON true
    ORDER BY m.id
  `)

  const motors: ReportMotor[] = motorRows.map(r => ({
    name:          r.name,
    location:      r.location ?? '—',
    severity:      r.severity ?? 'normal',
    severity_ko:   SEVERITY_KO[r.severity ?? 'normal'] ?? '정상',
    vel_y_rms:     r.vel_y_rms     ? `${parseFloat(r.vel_y_rms).toFixed(2)} mm/s` : '—',
    temperature_c: r.temperature_c ? `${parseFloat(r.temperature_c).toFixed(1)} °C` : '—',
    kurtosis_y:    r.kurtosis_y    ? parseFloat(r.kurtosis_y).toFixed(2) : '—',
    fault_type:    r.fault_type ?? '',
    fault_type_ko: FAULT_KO[r.fault_type ?? ''] ?? (r.fault_type ? r.fault_type : '이상 없음'),
    rul_days:      r.rul_days != null ? `${r.rul_days}일` : '—',
  }))

  // 알람 (최근 90일)
  const alarmRows = await query<{
    triggered_at: string; motor_name: string
    severity: string; fault_type: string | null; message: string | null; state: string
  }>(`
    SELECT
      a.triggered_at, m.name AS motor_name,
      a.severity, a.fault_type, a.message, a.state
    FROM alarms a
    JOIN motors m ON m.id = a.motor_id
    WHERE a.triggered_at >= NOW() - INTERVAL '90 days'
    ORDER BY a.triggered_at DESC
    LIMIT 200
  `)

  const alarms: ReportAlarm[] = alarmRows.map(r => ({
    alarm_date:    new Date(r.triggered_at).toLocaleDateString('ko-KR'),
    motor_name:    r.motor_name,
    severity:      r.severity,
    severity_ko:   SEVERITY_KO[r.severity] ?? r.severity,
    fault_type:    r.fault_type ?? '',
    fault_type_ko: FAULT_KO[r.fault_type ?? ''] ?? (r.fault_type ?? '—'),
    message:       r.message ?? '—',
    state:         r.state,
    state_ko:      STATE_KO[r.state] ?? r.state,
  }))

  // 정비 이력 (최근 90일)
  const maintRows = await query<{
    performed_at: string; motor_name: string
    work_type: string; description: string | null; performed_by_name: string | null
  }>(`
    SELECT
      ml.performed_at, m.name AS motor_name,
      ml.work_type, ml.description, u.username AS performed_by_name
    FROM maintenance_logs ml
    JOIN motors m ON m.id = ml.motor_id
    LEFT JOIN users u ON u.id = ml.performed_by
    WHERE ml.performed_at >= NOW() - INTERVAL '90 days'
    ORDER BY ml.performed_at DESC
    LIMIT 200
  `)

  const maintenance: ReportMaintenance[] = maintRows.map(r => ({
    performed_at:      new Date(r.performed_at).toLocaleDateString('ko-KR'),
    motor_name:        r.motor_name,
    work_type:         r.work_type,
    description:       r.description ?? '—',
    performed_by_name: r.performed_by_name ?? '—',
  }))

  // 집계
  const countBy = (arr: ReportMotor[], key: keyof ReportMotor, val: string) =>
    arr.filter(m => m[key] === val).length

  return {
    report_date:          now.toLocaleDateString('ko-KR'),
    report_title:         '설비 진단 보고서',
    motor_count_total:    motors.length,
    motor_count_normal:   countBy(motors, 'severity', 'normal'),
    motor_count_warning:  countBy(motors, 'severity', 'warning'),
    motor_count_critical: countBy(motors, 'severity', 'critical'),
    alarm_count_total:    alarms.length,
    alarm_count_active:   alarms.filter(a => a.state === 'active').length,
    alarm_count_resolved: alarms.filter(a => a.state === 'resolved').length,
    alarm_count_critical: alarms.filter(a => a.severity === 'critical').length,
    alarm_count_warning:  alarms.filter(a => a.severity === 'warning').length,
    maintenance_count:    maintenance.length,
    motors,
    alarms,
    maintenance,
  }
}
