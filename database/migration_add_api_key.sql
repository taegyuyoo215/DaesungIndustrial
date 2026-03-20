-- ============================================================
-- Migration: sensors 테이블에 api_key 컬럼 추가
-- 실제 센서가 /api/ingest 로 데이터를 전송할 때 사용하는 인증 키
-- ============================================================

-- 1) api_key 컬럼 추가
ALTER TABLE sensors
  ADD COLUMN IF NOT EXISTS api_key VARCHAR(64) UNIQUE;

-- 2) 기존 센서들에 대해 랜덤 키 생성 (pgcrypto 확장 사용)
--    pgcrypto가 없으면 아래 주석 처리 후 수동으로 키를 입력하세요.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

UPDATE sensors
SET api_key = 'mqt_' || encode(gen_random_bytes(28), 'hex')
WHERE api_key IS NULL;

-- 3) NOT NULL 제약 추가
ALTER TABLE sensors
  ALTER COLUMN api_key SET NOT NULL;

-- 4) 생성된 키 확인
SELECT s.id, s.serial_number, m.name AS motor_name, s.api_key
FROM sensors s
JOIN motors m ON m.id = s.motor_id
ORDER BY s.id;
