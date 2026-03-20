-- ============================================================
-- Migration: 보고서 양식 템플릿 관리 테이블
-- ============================================================

CREATE TABLE IF NOT EXISTS report_templates (
  id          SERIAL PRIMARY KEY,
  name        TEXT        NOT NULL,           -- 사용자가 지정한 템플릿 이름
  file_type   TEXT        NOT NULL CHECK (file_type IN ('xlsx','docx')),
  file_name   TEXT        NOT NULL,           -- 원본 업로드 파일명
  file_path   TEXT        NOT NULL,           -- 서버 저장 경로 (report-templates/)
  file_size   INTEGER,                        -- 바이트
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
