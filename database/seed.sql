-- ============================================================
-- MOTOR-IQ 테스트 시드 데이터
-- init.sql 실행 후 이 파일을 실행하세요
-- psql -U motoriq_user -d motoriq -f database/seed.sql
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. 측정값 생성 (최근 7일, 1분 주기)
--    각 모터별 센서 ID: 1~6
-- ─────────────────────────────────────────────

-- 컴프레서 #1 (sensor_id=1): Class II, 정상 범위 내
INSERT INTO measurements (time, sensor_id, vel_x_rms, vel_y_rms, vel_z_rms,
  hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms,
  pkpk_accel_x, pkpk_accel_y, pkpk_accel_z,
  kurtosis_x, kurtosis_y, kurtosis_z,
  temperature_c, motor_running)
SELECT
  NOW() - (n || ' minutes')::INTERVAL,
  1,
  1.2 + sin(n * 0.05) * 0.3 + random() * 0.2,
  1.4 + sin(n * 0.04) * 0.4 + random() * 0.2,
  0.9 + sin(n * 0.06) * 0.2 + random() * 0.1,
  0.8 + random() * 0.3,
  0.9 + random() * 0.4,
  0.6 + random() * 0.2,
  3.2 + random() * 1.0,
  3.5 + random() * 1.2,
  2.8 + random() * 0.8,
  2.1 + random() * 0.5,
  2.3 + random() * 0.6,
  2.0 + random() * 0.4,
  42.0 + sin(n * 0.02) * 3.0 + random() * 2.0,
  TRUE
FROM generate_series(1, 10080) AS g(n);  -- 7일 × 1440분

-- 펌프 모터 #2 (sensor_id=2): Class II, 주의 수준 (vel 상승)
INSERT INTO measurements (time, sensor_id, vel_x_rms, vel_y_rms, vel_z_rms,
  hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms,
  pkpk_accel_x, pkpk_accel_y, pkpk_accel_z,
  kurtosis_x, kurtosis_y, kurtosis_z,
  temperature_c, motor_running)
SELECT
  NOW() - (n || ' minutes')::INTERVAL,
  2,
  -- 3일 전부터 점진적 상승
  CASE WHEN n < 4320 THEN 2.9 + (4320 - n)::float / 4320 * 1.5 + random() * 0.3
       ELSE 2.0 + random() * 0.4 END,
  CASE WHEN n < 4320 THEN 3.2 + (4320 - n)::float / 4320 * 1.8 + random() * 0.4
       ELSE 2.2 + random() * 0.5 END,
  CASE WHEN n < 4320 THEN 2.1 + (4320 - n)::float / 4320 * 0.8 + random() * 0.2
       ELSE 1.5 + random() * 0.3 END,
  1.2 + random() * 0.5,
  1.5 + random() * 0.6,
  0.9 + random() * 0.3,
  5.1 + random() * 1.5,
  5.8 + random() * 1.8,
  4.2 + random() * 1.0,
  3.1 + random() * 0.8,
  3.4 + random() * 0.9,
  2.8 + random() * 0.6,
  52.0 + sin(n * 0.02) * 4.0 + random() * 3.0,
  TRUE
FROM generate_series(1, 10080) AS g(n);

-- 팬 모터 #3 (sensor_id=3): Class I, 경보 수준 (베어링 결함)
INSERT INTO measurements (time, sensor_id, vel_x_rms, vel_y_rms, vel_z_rms,
  hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms,
  pkpk_accel_x, pkpk_accel_y, pkpk_accel_z,
  hf_peak_x, hf_peak_y, hf_peak_z,
  kurtosis_x, kurtosis_y, kurtosis_z,
  temperature_c, motor_running)
SELECT
  NOW() - (n || ' minutes')::INTERVAL,
  3,
  -- 베어링 결함: vel과 hf_accel 동시 상승
  5.8 + sin(n * 0.08) * 1.2 + random() * 0.8,
  7.4 + sin(n * 0.07) * 1.5 + random() * 1.0,
  4.2 + sin(n * 0.09) * 0.8 + random() * 0.5,
  3.2 + random() * 0.8,
  4.1 + random() * 1.2,
  2.6 + random() * 0.6,
  14.5 + random() * 4.0,
  20.2 + random() * 5.0,
  11.8 + random() * 3.0,
  25.0 + random() * 8.0,
  32.0 + random() * 10.0,
  18.0 + random() * 5.0,
  -- Kurtosis 높음 (베어링 이상 지표)
  8.5 + random() * 2.0,
  9.8 + random() * 2.5,
  6.2 + random() * 1.5,
  68.0 + sin(n * 0.015) * 4.0 + random() * 3.0,
  TRUE
FROM generate_series(1, 10080) AS g(n);

-- 컨베이어 #4 (sensor_id=4): Class I, 정상
INSERT INTO measurements (time, sensor_id, vel_x_rms, vel_y_rms, vel_z_rms,
  hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms,
  kurtosis_x, kurtosis_y, kurtosis_z,
  temperature_c, motor_running)
SELECT
  NOW() - (n || ' minutes')::INTERVAL,
  4,
  0.8 + sin(n * 0.04) * 0.2 + random() * 0.15,
  1.1 + sin(n * 0.03) * 0.3 + random() * 0.15,
  0.6 + sin(n * 0.05) * 0.15 + random() * 0.1,
  0.5 + random() * 0.2,
  0.6 + random() * 0.25,
  0.4 + random() * 0.15,
  1.8 + random() * 0.4,
  2.0 + random() * 0.5,
  1.6 + random() * 0.3,
  38.0 + sin(n * 0.02) * 2.0 + random() * 1.5,
  TRUE
FROM generate_series(1, 10080) AS g(n);

-- 믹서 모터 #5 (sensor_id=5): Class III, 주의 (온도 상승)
INSERT INTO measurements (time, sensor_id, vel_x_rms, vel_y_rms, vel_z_rms,
  hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms,
  kurtosis_x, kurtosis_y, kurtosis_z,
  temperature_c, motor_running)
SELECT
  NOW() - (n || ' minutes')::INTERVAL,
  5,
  4.5 + sin(n * 0.05) * 0.8 + random() * 0.5,
  5.2 + sin(n * 0.04) * 1.0 + random() * 0.6,
  3.8 + sin(n * 0.06) * 0.6 + random() * 0.4,
  1.8 + random() * 0.5,
  2.1 + random() * 0.6,
  1.5 + random() * 0.4,
  3.5 + random() * 0.8,
  3.8 + random() * 1.0,
  3.2 + random() * 0.7,
  -- 온도 점진적 상승 (최근 3일)
  CASE WHEN n < 4320 THEN 72.0 + (4320 - n)::float / 4320 * 8.0 + random() * 2.0
       ELSE 65.0 + random() * 4.0 END,
  TRUE
FROM generate_series(1, 10080) AS g(n);

-- 호이스트 #6 (sensor_id=6): Class I, 최근 2일 데이터만 (간헐 운전)
INSERT INTO measurements (time, sensor_id, vel_x_rms, vel_y_rms, vel_z_rms,
  hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms,
  kurtosis_x, kurtosis_y, kurtosis_z,
  temperature_c, motor_running)
SELECT
  NOW() - (n || ' minutes')::INTERVAL,
  6,
  1.0 + random() * 0.4,
  1.3 + random() * 0.5,
  0.8 + random() * 0.3,
  0.6 + random() * 0.2,
  0.7 + random() * 0.25,
  0.5 + random() * 0.15,
  2.2 + random() * 0.6,
  2.5 + random() * 0.7,
  2.0 + random() * 0.5,
  44.0 + random() * 3.0,
  -- 30분 운전 / 30분 정지 패턴
  (n % 60) < 30
FROM generate_series(1, 2880) AS g(n);  -- 2일

-- ─────────────────────────────────────────────
-- 2. AI 진단 결과
-- ─────────────────────────────────────────────

-- 팬 모터 #3: 베어링 외륜 결함 경보
INSERT INTO diagnosis_results (motor_id, diagnosed_at, fault_type, confidence, severity, rul_days, evidence, model_version)
VALUES
(3, NOW() - INTERVAL '2 hours', 'bearing_outer', 87.5, 'critical', 8,
  '{"metrics": [
    {"label": "HF Acceleration Y축", "value": "4.1 g", "threshold": "2.0 g", "exceeded": true},
    {"label": "Kurtosis Y축", "value": "9.8", "threshold": "5.0", "exceeded": true},
    {"label": "RMS Velocity Y축", "value": "7.4 mm/s", "threshold": "4.5 mm/s", "exceeded": true},
    {"label": "온도", "value": "68.2 °C", "threshold": "70.0 °C", "exceeded": false}
  ], "freq_peaks": [
    {"freq_hz": 119.8, "label": "BPFO", "energy": 85.2},
    {"freq_hz": 30.0,  "label": "1X",   "energy": 72.1},
    {"freq_hz": 60.0,  "label": "2X",   "energy": 28.4}
  ]}'::jsonb,
  'v1.0.0'
),

-- 팬 모터 #3: 이전 진단 (1주일 전 - 주의 수준)
(3, NOW() - INTERVAL '7 days', 'bearing_outer', 62.0, 'warning', 25,
  '{"metrics": [
    {"label": "HF Acceleration Y축", "value": "2.8 g", "threshold": "2.0 g", "exceeded": true},
    {"label": "Kurtosis Y축", "value": "6.5", "threshold": "5.0", "exceeded": true},
    {"label": "RMS Velocity Y축", "value": "3.8 mm/s", "threshold": "4.5 mm/s", "exceeded": false}
  ]}'::jsonb,
  'v1.0.0'
),

-- 펌프 모터 #2: 오정렬 주의
(2, NOW() - INTERVAL '6 hours', 'misalignment', 71.0, 'warning', 30,
  '{"metrics": [
    {"label": "RMS Velocity Y축", "value": "3.2 mm/s", "threshold": "2.8 mm/s", "exceeded": true},
    {"label": "RMS Velocity X축", "value": "2.9 mm/s", "threshold": "2.8 mm/s", "exceeded": true},
    {"label": "Kurtosis", "value": "3.4", "threshold": "5.0", "exceeded": false}
  ]}'::jsonb,
  'v1.0.0'
),

-- 믹서 모터 #5: 과열 주의
(5, NOW() - INTERVAL '4 hours', 'overheat', 78.0, 'warning', 15,
  '{"metrics": [
    {"label": "온도", "value": "72.1 °C", "threshold": "70.0 °C", "exceeded": true},
    {"label": "RMS Velocity Y축", "value": "5.2 mm/s", "threshold": "7.1 mm/s", "exceeded": false}
  ]}'::jsonb,
  'v1.0.0'
),

-- 컴프레서 #1: 정상
(1, NOW() - INTERVAL '1 hour', 'normal', 95.0, 'normal', NULL, NULL, 'v1.0.0'),

-- 컨베이어 #4: 정상
(4, NOW() - INTERVAL '1 hour', 'normal', 97.0, 'normal', NULL, NULL, 'v1.0.0');

-- ─────────────────────────────────────────────
-- 3. 알람 생성
-- ─────────────────────────────────────────────

-- 팬 모터 #3 경보 (활성)
INSERT INTO alarms (motor_id, diagnosis_result_id, severity, state, fault_type, message, triggered_at)
VALUES
(3, 1, 'critical', 'active', 'bearing_outer',
 'BPFO 120Hz 대역 에너지 급증 — 베어링 외륜 결함 의심. 즉시 점검 필요',
 NOW() - INTERVAL '2 hours'),

-- 팬 모터 #3 이전 경고 (해결됨)
(3, NULL, 'warning', 'resolved', 'bearing_outer',
 'HF Acceleration 임계값 초과 — 베어링 이상 초기 징후',
 NOW() - INTERVAL '7 days'),

-- 펌프 모터 #2 주의 (확인됨)
(2, 3, 'warning', 'acknowledged', 'misalignment',
 '오정렬 감지 — RMS Velocity X/Y축 불균형. 정렬 점검 권고',
 NOW() - INTERVAL '6 hours'),

-- 믹서 모터 #5 주의 (활성)
(5, 4, 'warning', 'active', 'overheat',
 '온도 임계값 초과 (72.1°C > 70.0°C) — 냉각 계통 점검 필요',
 NOW() - INTERVAL '4 hours'),

-- 팬 모터 #3 이전 경고 2 (해결됨)
(3, NULL, 'warning', 'resolved', 'bearing_outer',
 'Kurtosis 상승 감지 — 베어링 이상 조기 경보',
 NOW() - INTERVAL '4 days');

-- acknowledged 상태 업데이트
UPDATE alarms
SET acknowledged_at = triggered_at + INTERVAL '30 minutes',
    acknowledged_by = 2
WHERE state IN ('acknowledged', 'resolved') AND motor_id IN (2, 3);

-- resolved 상태 업데이트
UPDATE alarms
SET resolved_at = triggered_at + INTERVAL '2 hours'
WHERE state = 'resolved';

-- ─────────────────────────────────────────────
-- 4. 정비 이력
-- ─────────────────────────────────────────────

INSERT INTO maintenance_logs
  (motor_id, alarm_id, work_type, description, parts_replaced, performed_by, performed_at, next_due_at)
VALUES
-- 팬 모터 #3: 이전 베어링 교체 (해결된 알람 연결)
(3, 2, '베어링 교체',
 '베어링 외륜 결함 확인. 구동측 베어링 교체 완료. 교체 후 진동 정상 범위 복귀.',
 '[{"name": "6206 ZZ 베어링", "qty": 2}, {"name": "그리스 (Mobil SHC 220)", "qty": 1}]',
 2,
 NOW() - INTERVAL '6 days',
 NOW() + INTERVAL '84 days'),

-- 컴프레서 #1: 정기 점검
(1, NULL, '정기 점검',
 '분기 정기 점검. 진동/온도 정상. 오일 레벨 정상. 필터 청소 완료.',
 NULL,
 2,
 NOW() - INTERVAL '30 days',
 NOW() + INTERVAL '60 days'),

-- 컨베이어 #4: 윤활 보충
(4, NULL, '윤활 보충',
 '베어링 윤활제 보충. 월간 정기 점검 항목.',
 '[{"name": "리튬 그리스", "qty": 1}]',
 2,
 NOW() - INTERVAL '15 days',
 NOW() + INTERVAL '15 days'),

-- 펌프 모터 #2: 오정렬 수정 (예정 — 알람 확인됨 상태)
(2, 3, '오정렬 수정',
 '커플링 정렬 측정. 레이저 정렬 장비 사용. 0.05mm 이하로 조정.',
 '[{"name": "심(Shim) 세트", "qty": 1}]',
 2,
 NOW() - INTERVAL '2 hours',
 NOW() + INTERVAL '90 days'),

-- 호이스트 #6: 부품 교체
(6, NULL, '부품 교체',
 '브레이크 패드 마모 한계 도달로 교체.',
 '[{"name": "브레이크 패드", "qty": 4}]',
 2,
 NOW() - INTERVAL '60 days',
 NOW() + INTERVAL '120 days');

-- ─────────────────────────────────────────────
-- 완료
-- ─────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE '시드 데이터 입력 완료!';
  RAISE NOTICE '- 측정값: 최근 7일 (10,080건 × 모터5대 + 2,880건 × 1대)';
  RAISE NOTICE '- AI 진단: 6건';
  RAISE NOTICE '- 알람: 5건 (활성 2, 확인됨 1, 해결됨 2)';
  RAISE NOTICE '- 정비 이력: 5건';
END $$;
