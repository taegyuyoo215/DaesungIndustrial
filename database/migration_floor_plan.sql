-- ============================================================
-- Migration: 도면(Floor Plan) + 모터 핀 위치 테이블
-- ============================================================

-- 도면 메타데이터
CREATE TABLE IF NOT EXISTS floor_plans (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,
  file_path   TEXT        NOT NULL,
  file_name   TEXT        NOT NULL,
  page_count  INTEGER     NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 모터 핀 위치 (비율 좌표 0~100)
CREATE TABLE IF NOT EXISTS motor_pins (
  id             SERIAL PRIMARY KEY,
  floor_plan_id  INTEGER     NOT NULL REFERENCES floor_plans(id) ON DELETE CASCADE,
  motor_id       INTEGER     NOT NULL REFERENCES motors(id) ON DELETE CASCADE,
  page           INTEGER     NOT NULL DEFAULT 1,
  x_pct          NUMERIC(6,3) NOT NULL,
  y_pct          NUMERIC(6,3) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(floor_plan_id, motor_id)
);
