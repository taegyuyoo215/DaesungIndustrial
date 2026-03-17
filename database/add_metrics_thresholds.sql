-- crest_factor / hf_accel / pkpk_accel 글로벌 임계값 추가
-- 실행: psql -U motoriq_user -d motoriq -f database/add_metrics_thresholds.sql

INSERT INTO thresholds (motor_id, metric, warn_value, alarm_value, unit)
VALUES
  (NULL, 'crest_factor', 2.5,  4.0,  NULL),
  (NULL, 'hf_accel',     1.5,  3.0,  'g'),
  (NULL, 'pkpk_accel',   5.0, 10.0,  'g')
ON CONFLICT DO NOTHING;
