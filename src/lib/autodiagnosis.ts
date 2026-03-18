/**
 * autodiagnosis.ts
 * 측정값이 임계값을 초과할 때 diagnosis_results + alarms 를 자동 생성하는 엔진.
 * simulate route 등 측정값 삽입 후 호출된다.
 */

import { query, queryOne } from '@/lib/db'
import type { FaultType, Severity } from '@/types'

// ── 임계값 상수 (DB thresholds 테이블의 글로벌 기본값과 일치) ──────────
const TH = {
  vel:   { warn: 2.8,  crit: 7.1  },
  kurt:  { warn: 5.0,  crit: 8.0  },
  temp:  { warn: 60,   crit: 70   },
  hf:    { warn: 1.5,  crit: 3.0  },
  crest: { warn: 2.5,  crit: 4.0  },
  pkpk:  { warn: 5.0,  crit: 10.0 },
}

// 동일 severity + fault_type 의 진단이 있으면 이 시간(ms) 내에는 재생성 안 함
const DEDUP_MS = 30 * 60 * 1000   // 30분

// ── 내부 타입 ──────────────────────────────────────────────────────────

interface Meas {
  vel_y_rms:      number | null
  hf_accel_x_rms: number | null
  kurtosis_x:     number | null
  kurtosis_y:     number | null
  kurtosis_z:     number | null
  temperature_c:  number | null
  crest_x:        number | null
  pkpk_accel_x:   number | null
  motor_running:  boolean | null
}

interface EvidenceMetric {
  label: string
  value: string
  threshold: string
  exceeded: boolean
}

interface DiagInput {
  motorId: number
  meas: Meas
}

interface DiagOutput {
  faultType: FaultType
  severity: Severity
  confidence: number
  rulDays: number | null
  evidence: EvidenceMetric[]
}

// ── 규칙 기반 진단 엔진 ────────────────────────────────────────────────

function diagnose(m: Meas): DiagOutput {
  const vel   = Number(m.vel_y_rms      ?? 0)
  const hf    = Number(m.hf_accel_x_rms ?? 0)
  const kurt  = Math.max(
    Number(m.kurtosis_x ?? 0),
    Number(m.kurtosis_y ?? 0),
    Number(m.kurtosis_z ?? 0),
  )
  const temp  = Number(m.temperature_c  ?? 0)
  const crest = Number(m.crest_x        ?? 0)
  const pkpk  = Number(m.pkpk_accel_x   ?? 0)

  // ── severity 판정 ───────────────────────────────────────────────────
  let severity: Severity = 'normal'

  if (
    vel >= TH.vel.crit || kurt >= TH.kurt.crit ||
    temp >= TH.temp.crit || hf >= TH.hf.crit ||
    crest >= TH.crest.crit
  ) {
    severity = 'critical'
  } else if (
    vel >= TH.vel.warn || kurt >= TH.kurt.warn ||
    temp >= TH.temp.warn || hf >= TH.hf.warn ||
    crest >= TH.crest.warn || pkpk >= TH.pkpk.warn
  ) {
    severity = 'warning'
  }

  // ── fault_type 판정 (우선순위 순) ──────────────────────────────────
  let faultType: FaultType = 'normal'

  if (temp >= TH.temp.warn) {
    faultType = 'overheat'
  } else if (hf >= TH.hf.crit) {
    // HF 자체가 위험 수준이면 베어링 외륜 (kurtosis 무관)
    faultType = 'bearing_outer'
  } else if (hf >= TH.hf.warn && kurt >= TH.kurt.warn) {
    // 고주파 + 충격성 → 베어링 내/외륜
    faultType = kurt >= TH.kurt.crit ? 'bearing_outer' : 'bearing_inner'
  } else if (kurt >= TH.kurt.warn) {
    // 충격성만 높음 → 베어링 내륜
    faultType = 'bearing_inner'
  } else if (pkpk >= TH.pkpk.warn || crest >= TH.crest.warn) {
    // 충격 지표(pk-pk / crest) → 풀림
    faultType = 'looseness'
  } else if (vel >= TH.vel.crit) {
    // 속도 크고 충격 없음 → 불평형
    faultType = 'imbalance'
  } else if (vel >= TH.vel.warn) {
    // 속도 중간 → 오정렬
    faultType = 'misalignment'
  }

  // 심각도가 있는데 fault_type 특정 실패 시 가장 높은 지표로 귀속
  if (severity !== 'normal' && faultType === 'normal') {
    if (hf >= TH.hf.warn)        faultType = 'bearing_outer'
    else if (vel >= TH.vel.warn) faultType = 'imbalance'
    else                         faultType = 'looseness'
  }

  // ── confidence ─────────────────────────────────────────────────────
  let confidence: number
  if (severity === 'critical') {
    confidence = Math.round(80 + Math.random() * 12)   // 80-92
  } else if (severity === 'warning') {
    confidence = Math.round(65 + Math.random() * 15)   // 65-80
  } else {
    confidence = Math.round(92 + Math.random() * 7)    // 92-99
  }

  // ── RUL (잔존 수명 예측) ────────────────────────────────────────────
  let rulDays: number | null = null
  if (severity === 'critical') {
    rulDays = Math.round(7  + Math.random() * 14)   // 7-21일
  } else if (severity === 'warning') {
    rulDays = Math.round(30 + Math.random() * 30)   // 30-60일
  }

  // ── evidence (진단 근거) ────────────────────────────────────────────
  const evidence: EvidenceMetric[] = [
    {
      label:     'RMS Velocity',
      value:     vel.toFixed(2),
      threshold: `${TH.vel.warn} mm/s`,
      exceeded:  vel >= TH.vel.warn,
    },
    {
      label:     'HF Acceleration',
      value:     hf.toFixed(2),
      threshold: `${TH.hf.warn} g`,
      exceeded:  hf >= TH.hf.warn,
    },
    {
      label:     'Kurtosis (max)',
      value:     kurt.toFixed(2),
      threshold: `${TH.kurt.warn}`,
      exceeded:  kurt >= TH.kurt.warn,
    },
    {
      label:     '온도',
      value:     temp.toFixed(1),
      threshold: `${TH.temp.warn} °C`,
      exceeded:  temp >= TH.temp.warn,
    },
  ].filter(e => e.exceeded || Number(e.value) > 0)

  return { faultType, severity, confidence, rulDays, evidence }
}

// ── 알람 메시지 생성 ───────────────────────────────────────────────────

const ALARM_MSG: Record<FaultType, string> = {
  bearing_outer: '베어링 외륜 결함 감지 — 고주파 충격 신호 증가',
  bearing_inner: '베어링 내륜 결함 감지 — 충격 지표 상승',
  imbalance:     '회전체 불평형 감지 — RMS 속도 과다',
  misalignment:  '축 오정렬 감지 — 진동 속도 상승',
  looseness:     '구조적 풀림 감지 — 충격 진동 증가',
  overheat:      '과열 감지 — 운전 온도 허용 범위 초과',
  normal:        '정상 상태',
}

// ── 메인 함수: 모터 1개에 대해 자동 진단 실행 ─────────────────────────

export async function runAutoDiagnosis({ motorId, meas }: DiagInput): Promise<void> {
  // 정지 중이면 스킵
  if (meas.motor_running === false) return

  const { faultType, severity, confidence, rulDays, evidence } = diagnose(meas)

  // normal이고 이전 진단도 normal이면 30분 안에 중복 생성 안 함
  const lastDiag = await queryOne<{
    id: number
    severity: string
    fault_type: string | null
    diagnosed_at: string
  }>(
    `SELECT id, severity, fault_type, diagnosed_at
     FROM diagnosis_results
     WHERE motor_id = $1
     ORDER BY diagnosed_at DESC
     LIMIT 1`,
    [motorId],
  )

  const now = Date.now()
  if (lastDiag) {
    const lastAge = now - new Date(lastDiag.diagnosed_at).getTime()
    const sameState =
      lastDiag.severity === severity &&
      (lastDiag.fault_type ?? 'normal') === faultType
    if (sameState && lastAge < DEDUP_MS) return   // 중복 → 스킵
  }

  // diagnosis_results 삽입
  const diagRow = await queryOne<{ id: number }>(
    `INSERT INTO diagnosis_results
       (motor_id, diagnosed_at, fault_type, confidence, severity, rul_days, evidence, model_version)
     VALUES ($1, NOW(), $2, $3, $4, $5, $6, '1.0-rule')
     RETURNING id`,
    [
      motorId,
      faultType === 'normal' ? null : faultType,
      confidence,
      severity,
      rulDays,
      JSON.stringify({ metrics: evidence }),
    ],
  )

  if (!diagRow) return

  // warning/critical 이면 알람도 생성 (같은 fault_type 활성 알람 없을 때만)
  if (severity !== 'normal') {
    const existingAlarm = await queryOne<{ id: number }>(
      `SELECT id FROM alarms
       WHERE motor_id = $1
         AND state IN ('active','acknowledged')
         AND fault_type = $2
       LIMIT 1`,
      [motorId, faultType],
    )

    if (!existingAlarm) {
      await query(
        `INSERT INTO alarms
           (motor_id, diagnosis_result_id, severity, state, fault_type, message, triggered_at)
         VALUES ($1, $2, $3, 'active', $4, $5, NOW())`,
        [
          motorId,
          diagRow.id,
          severity,
          faultType,
          ALARM_MSG[faultType] ?? '이상 감지',
        ],
      )
    }
  }

  // severity 가 normal 로 복귀했으면 기존 활성 알람 자동 해결
  if (severity === 'normal' && lastDiag && lastDiag.severity !== 'normal') {
    await query(
      `UPDATE alarms
       SET state = 'resolved', resolved_at = NOW()
       WHERE motor_id = $1 AND state IN ('active','acknowledged')`,
      [motorId],
    )
  }
}

// ── 모든 활성 모터를 한 번에 진단 (초기화·수동 트리거용) ─────────────

export async function runAutoDiagnosisAll(): Promise<number> {
  const rows = await query<{
    motor_id: number
    vel_y_rms: number | null
    hf_accel_x_rms: number | null
    kurtosis_x: number | null
    kurtosis_y: number | null
    kurtosis_z: number | null
    temperature_c: number | null
    crest_x: number | null
    pkpk_accel_x: number | null
    motor_running: boolean | null
  }>(`
    SELECT
      s.motor_id,
      lm.vel_y_rms, lm.hf_accel_x_rms,
      lm.kurtosis_x, lm.kurtosis_y, lm.kurtosis_z,
      lm.temperature_c, lm.crest_x, lm.pkpk_accel_x,
      lm.motor_running
    FROM sensors s
    JOIN motors m ON m.id = s.motor_id
    LEFT JOIN LATERAL (
      SELECT vel_y_rms, hf_accel_x_rms,
             kurtosis_x, kurtosis_y, kurtosis_z,
             temperature_c, crest_x, pkpk_accel_x, motor_running
      FROM measurements
      WHERE sensor_id = s.id
      ORDER BY time DESC
      LIMIT 1
    ) lm ON true
    WHERE s.status = 'active' AND lm.vel_y_rms IS NOT NULL
  `)

  for (const row of rows) {
    await runAutoDiagnosis({
      motorId: row.motor_id,
      meas: {
        vel_y_rms:      row.vel_y_rms,
        hf_accel_x_rms: row.hf_accel_x_rms,
        kurtosis_x:     row.kurtosis_x,
        kurtosis_y:     row.kurtosis_y,
        kurtosis_z:     row.kurtosis_z,
        temperature_c:  row.temperature_c,
        crest_x:        row.crest_x,
        pkpk_accel_x:   row.pkpk_accel_x,
        motor_running:  row.motor_running,
      },
    })
  }

  return rows.length
}
