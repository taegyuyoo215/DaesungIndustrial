-- ============================================================
-- MOTOR-IQ  데이터베이스 초기화 스크립트
-- PostgreSQL 16 (TimescaleDB 없이 표준 PostgreSQL 사용)
-- 소규모 환경 (센서 10대 이하, 1분 주기) 기준
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. 공장(사이트) 테이블
-- ─────────────────────────────────────────────
CREATE TABLE sites (
    id          SERIAL PRIMARY KEY,
    name        TEXT        NOT NULL,               -- 예: "A공장"
    location    TEXT,                               -- 예: "경기도 안산시"
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sites (name, location) VALUES
    ('A공장', '경기도 안산시'),
    ('B공장', '충남 아산시');

-- ─────────────────────────────────────────────
-- 2. 사용자 테이블
-- ─────────────────────────────────────────────
CREATE TABLE users (
    id           SERIAL PRIMARY KEY,
    site_id      INTEGER     REFERENCES sites(id),
    username     TEXT        NOT NULL UNIQUE,
    email        TEXT        NOT NULL UNIQUE,
    role         TEXT        NOT NULL CHECK (role IN ('admin', 'engineer', 'operator')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO users (site_id, username, email, role) VALUES
    (1, 'admin',    'admin@company.com',    'admin'),
    (1, 'engineer1','engineer@company.com', 'engineer'),
    (1, 'operator1','operator@company.com', 'operator');

-- ─────────────────────────────────────────────
-- 3. 모터(설비) 테이블
-- ─────────────────────────────────────────────
CREATE TABLE motors (
    id              SERIAL PRIMARY KEY,
    site_id         INTEGER     NOT NULL REFERENCES sites(id),
    name            TEXT        NOT NULL,           -- 예: "컴프레서 #1"
    location        TEXT,                           -- 예: "A동 1라인"
    rated_rpm       INTEGER,                        -- 정격 RPM
    rated_power_kw  NUMERIC(8,2),                   -- 정격 출력(kW)
    iso_class       TEXT CHECK (iso_class IN ('I','II','III','IV')),  -- ISO 10816 등급
    -- 베어링 사양 (BPFO/BPFI/BSF/FTF 계산용)
    bearing_model       TEXT,
    bearing_ball_count  INTEGER,
    bearing_contact_angle_deg NUMERIC(5,2),
    bearing_ball_dia_mm NUMERIC(6,3),
    bearing_pitch_dia_mm NUMERIC(6,3),
    -- 메타
    installed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO motors (site_id, name, location, rated_rpm, rated_power_kw, iso_class) VALUES
    (1, '컴프레서 #1',  'A동 1라인', 1800, 22.0,  'II'),
    (1, '펌프 모터 #2', 'A동 2라인', 1800, 15.0,  'II'),
    (1, '팬 모터 #3',   'B동 1라인', 1500, 7.5,   'I'),
    (1, '컨베이어 #4',  'B동 2라인', 1200, 5.5,   'I'),
    (1, '믹서 모터 #5', 'C동 1라인', 3000, 45.0,  'II'),
    (1, '호이스트 #6',  'C동 2라인', 900,  11.0,  'I');

-- ─────────────────────────────────────────────
-- 4. 센서 테이블 (QM30VT3)
-- ─────────────────────────────────────────────
CREATE TABLE sensors (
    id              SERIAL PRIMARY KEY,
    motor_id        INTEGER     NOT NULL REFERENCES motors(id),
    serial_number   TEXT        NOT NULL UNIQUE,    -- 예: "VT3-00121"
    modbus_addr     SMALLINT    NOT NULL CHECK (modbus_addr BETWEEN 1 AND 32),
    fmax_setting    SMALLINT    NOT NULL DEFAULT 1 CHECK (fmax_setting BETWEEN 1 AND 5),
    -- 1=5300Hz, 2=2650Hz, 3=1325Hz, 4=662Hz, 5=325Hz
    hfe_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
    measure_interval_ms INTEGER NOT NULL DEFAULT 500,
    status          TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','error')),
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO sensors (motor_id, serial_number, modbus_addr, fmax_setting, hfe_enabled) VALUES
    (1, 'VT3-00121', 1, 1, FALSE),
    (2, 'VT3-00122', 2, 1, FALSE),
    (3, 'VT3-00123', 3, 1, TRUE),
    (4, 'VT3-00124', 4, 1, FALSE),
    (5, 'VT3-00125', 5, 1, FALSE),
    (6, 'VT3-00126', 6, 1, FALSE);

-- ─────────────────────────────────────────────
-- 5. 측정값 테이블 (TimescaleDB Hypertable)
--    레지스터 주소는 motor-diagnosis.md 참조
-- ─────────────────────────────────────────────
CREATE TABLE measurements (
    time            TIMESTAMPTZ NOT NULL,           -- 측정 시각
    sensor_id       INTEGER     NOT NULL REFERENCES sensors(id),

    -- RMS Velocity (mm/s) — reg 40037/39/41, scale 1e-3
    vel_x_rms       NUMERIC(8,4),                   -- X축 (mm/s)
    vel_y_rms       NUMERIC(8,4),                   -- Y축 (mm/s)
    vel_z_rms       NUMERIC(8,4),                   -- Z축 (mm/s)

    -- HF RMS Acceleration (g) — reg 40002/04/06, scale 1e-3
    hf_accel_x_rms  NUMERIC(8,4),
    hf_accel_y_rms  NUMERIC(8,4),
    hf_accel_z_rms  NUMERIC(8,4),

    -- Full Band Pk-Pk Acceleration (g) — reg 40008/09/10, scale 1e-3
    pkpk_accel_x    NUMERIC(8,4),
    pkpk_accel_y    NUMERIC(8,4),
    pkpk_accel_z    NUMERIC(8,4),

    -- HF Peak Acceleration (g) — reg 40011/12/13, scale 1e-3
    hf_peak_x       NUMERIC(8,4),
    hf_peak_y       NUMERIC(8,4),
    hf_peak_z       NUMERIC(8,4),

    -- HF Crest Factor — reg 40014/15/16, scale 1e-3
    crest_x         NUMERIC(8,4),
    crest_y         NUMERIC(8,4),
    crest_z         NUMERIC(8,4),

    -- HF Kurtosis — reg 40017/18/19, scale 1e-3
    kurtosis_x      NUMERIC(8,4),
    kurtosis_y      NUMERIC(8,4),
    kurtosis_z      NUMERIC(8,4),

    -- Peak Velocity Frequency (Hz) — reg 40026/27/28, scale 1e-1
    peak_vel_freq_x NUMERIC(8,2),
    peak_vel_freq_y NUMERIC(8,2),
    peak_vel_freq_z NUMERIC(8,2),

    -- Temperature (°C) — reg 40043, scale 1e-2
    temperature_c   NUMERIC(6,2),

    -- Motor Run Flag — reg 40029
    motor_running   BOOLEAN,

    -- Magnitude HF Accel XYZ (g) — reg 40033, scale 1e-3
    mag_hf_accel    NUMERIC(8,4)
);

-- 조회 성능을 위한 인덱스 (sensor_id + time 복합 인덱스)
CREATE INDEX ON measurements (sensor_id, time DESC);

-- 최신 측정값 조회 최적화
CREATE INDEX ON measurements (time DESC);

-- ─────────────────────────────────────────────
-- 6. 임계값 테이블
--    ISO 10816 기준값 + 모터별 커스텀 오버라이드
-- ─────────────────────────────────────────────
CREATE TABLE thresholds (
    id          SERIAL PRIMARY KEY,
    motor_id    INTEGER     REFERENCES motors(id),  -- NULL이면 ISO 기본값
    metric      TEXT        NOT NULL,               -- 'vel_rms' | 'hf_accel' | 'kurtosis' | 'temperature'
    warn_value  NUMERIC(10,4) NOT NULL,
    alarm_value NUMERIC(10,4) NOT NULL,
    unit        TEXT,
    created_by  INTEGER     REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- UPSERT를 위한 unique 제약 (motor_id가 NULL인 경우 포함)
    UNIQUE NULLS NOT DISTINCT (motor_id, metric)
);

-- ISO 10816 기본 임계값 (motor_id = NULL → 전역 기본값)
INSERT INTO thresholds (motor_id, metric, warn_value, alarm_value, unit) VALUES
    -- Class I (≤15 kW)
    (3, 'vel_rms',    2.3,  4.5,  'mm/s'),    -- 팬 모터 #3
    (4, 'vel_rms',    2.3,  4.5,  'mm/s'),    -- 컨베이어 #4
    (6, 'vel_rms',    2.3,  4.5,  'mm/s'),    -- 호이스트 #6
    -- Class II (15~75 kW)
    (1, 'vel_rms',    2.8,  7.1,  'mm/s'),    -- 컴프레서 #1
    (2, 'vel_rms',    2.8,  7.1,  'mm/s'),    -- 펌프 모터 #2
    (5, 'vel_rms',    7.1, 11.2,  'mm/s'),    -- 믹서 모터 #5 (Class III)
    -- HF Kurtosis (베어링 이상 감지)
    (NULL, 'kurtosis', 5.0,  8.0,  NULL),
    -- 온도
    (NULL, 'temperature', 70.0, 85.0, '°C');

-- ─────────────────────────────────────────────
-- 7. AI 진단 결과 테이블
-- ─────────────────────────────────────────────
CREATE TABLE diagnosis_results (
    id              SERIAL PRIMARY KEY,
    motor_id        INTEGER     NOT NULL REFERENCES motors(id),
    diagnosed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fault_type      TEXT,           -- 'bearing_outer' | 'imbalance' | 'misalignment' | 'looseness' | 'overheat' | 'normal'
    confidence      NUMERIC(5,2),   -- 0.00 ~ 100.00 (%)
    severity        TEXT CHECK (severity IN ('normal','warning','critical')),
    rul_days        INTEGER,        -- 잔여 수명 예측 (일)
    evidence        JSONB,          -- 근거 데이터 (key metrics, frequency peaks, etc.)
    model_version   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 조회 인덱스
CREATE INDEX ON diagnosis_results (motor_id, diagnosed_at DESC);

-- ─────────────────────────────────────────────
-- 8. 알람 테이블
-- ─────────────────────────────────────────────
CREATE TABLE alarms (
    id                  SERIAL PRIMARY KEY,
    motor_id            INTEGER     NOT NULL REFERENCES motors(id),
    diagnosis_result_id INTEGER     REFERENCES diagnosis_results(id),
    severity            TEXT        NOT NULL CHECK (severity IN ('warning','critical')),
    state               TEXT        NOT NULL DEFAULT 'active' CHECK (state IN ('active','acknowledged','resolved')),
    fault_type          TEXT,
    message             TEXT,
    triggered_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at     TIMESTAMPTZ,
    acknowledged_by     INTEGER     REFERENCES users(id),
    resolved_at         TIMESTAMPTZ,
    resolved_by         INTEGER     REFERENCES users(id)
);

CREATE INDEX ON alarms (motor_id, triggered_at DESC);
CREATE INDEX ON alarms (state) WHERE state != 'resolved';

-- ─────────────────────────────────────────────
-- 9. 정비 이력 테이블
-- ─────────────────────────────────────────────
CREATE TABLE maintenance_logs (
    id              SERIAL PRIMARY KEY,
    motor_id        INTEGER     NOT NULL REFERENCES motors(id),
    alarm_id        INTEGER     REFERENCES alarms(id),
    work_type       TEXT        NOT NULL,   -- '베어링 교체' | '윤활' | '정렬 조정' | '밸런싱' | '점검'
    description     TEXT,
    parts_replaced  JSONB,                  -- [{"name":"6206 베어링","qty":2}]
    performed_by    INTEGER     REFERENCES users(id),
    performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_due_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- 유용한 뷰(View) 정의
-- ─────────────────────────────────────────────

-- 모터 현재 상태 요약 뷰
CREATE VIEW v_motor_status AS
SELECT
    m.id            AS motor_id,
    m.name          AS motor_name,
    m.location,
    m.site_id,
    si.name         AS site_name,
    sens.id         AS sensor_id,
    sens.modbus_addr,
    -- 최신 측정값
    last_m.time         AS last_measured_at,
    last_m.vel_x_rms,
    last_m.vel_y_rms,
    last_m.vel_z_rms,
    last_m.temperature_c,
    last_m.kurtosis_x,
    -- 활성 알람 수
    (SELECT COUNT(*) FROM alarms a WHERE a.motor_id = m.id AND a.state = 'active') AS active_alarms
FROM motors m
JOIN sites si ON si.id = m.site_id
LEFT JOIN sensors sens ON sens.motor_id = m.id AND sens.status = 'active'
LEFT JOIN LATERAL (
    SELECT * FROM measurements
    WHERE sensor_id = sens.id
    ORDER BY time DESC
    LIMIT 1
) last_m ON TRUE;

-- 1시간 평균 집계 뷰 (대시보드 트렌드 차트용)
-- time_bucket (TimescaleDB 전용) → date_trunc (표준 PostgreSQL) 로 대체
CREATE VIEW v_hourly_avg AS
SELECT
    date_trunc('hour', time) AS bucket,
    sensor_id,
    AVG(vel_x_rms)      AS vel_x_avg,
    AVG(vel_y_rms)      AS vel_y_avg,
    AVG(vel_z_rms)      AS vel_z_avg,
    MAX(kurtosis_x)     AS kurtosis_x_max,
    AVG(temperature_c)  AS temp_avg
FROM measurements
GROUP BY date_trunc('hour', time), sensor_id;

-- ─────────────────────────────────────────────
-- 완료 메시지
-- ─────────────────────────────────────────────
DO $$
BEGIN
    RAISE NOTICE '=====================================================';
    RAISE NOTICE 'MOTOR-IQ DB 초기화 완료!';
    RAISE NOTICE '테이블: sites, users, motors, sensors, measurements';
    RAISE NOTICE '        thresholds, diagnosis_results, alarms, maintenance_logs';
    RAISE NOTICE '표준 PostgreSQL 16 (TimescaleDB 없음)';
    RAISE NOTICE '=====================================================';
END $$;
