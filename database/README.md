# MOTOR-IQ DB 설정 가이드

## 사전 요구사항

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) 설치 필요

---

## 빠른 시작

```bash
# 1. database 폴더로 이동
cd database

# 2. TimescaleDB 컨테이너 시작
docker compose up -d

# 3. 컨테이너 상태 확인 (healthy 상태가 될 때까지 대기)
docker compose ps

# 4. DB 접속 확인
docker exec -it motoriq-db psql -U motoriq_user -d motoriq -c "\dt"
```

---

## 생성되는 테이블

| 테이블 | 설명 |
|--------|------|
| `sites` | 공장(사이트) |
| `users` | 사용자 (admin/engineer/operator) |
| `motors` | 모터 설비 정보 |
| `sensors` | QM30VT3 센서 (Modbus 주소 포함) |
| `measurements` | **Hypertable** — 실시간 측정값 (시계열) |
| `thresholds` | ISO 10816 기반 임계값 설정 |
| `diagnosis_results` | AI 진단 결과 |
| `alarms` | 알람 이력 |
| `maintenance_logs` | 정비 이력 |

---

## 연결 정보

```
Host:     localhost
Port:     5432
Database: motoriq
User:     motoriq_user
Password: motoriq_pass
```

**Next.js에서 사용 시** — 프로젝트 루트에 `.env.local` 생성:
```
DATABASE_URL=postgresql://motoriq_user:motoriq_pass@localhost:5432/motoriq
```

---

## 유용한 명령어

```bash
# 컨테이너 중지
docker compose stop

# 컨테이너 + 데이터 완전 삭제 (초기화)
docker compose down -v

# 로그 확인
docker compose logs -f timescaledb

# psql 직접 접속
docker exec -it motoriq-db psql -U motoriq_user -d motoriq
```

---

## 유용한 쿼리 예시

```sql
-- 최근 1시간 측정값 조회
SELECT time, vel_x_rms, temperature_c
FROM measurements
WHERE sensor_id = 1 AND time > NOW() - INTERVAL '1 hour'
ORDER BY time DESC;

-- 1시간 평균 집계 (트렌드 차트용)
SELECT time_bucket('1 hour', time) AS bucket,
       AVG(vel_x_rms) AS vel_avg
FROM measurements
WHERE sensor_id = 1 AND time > NOW() - INTERVAL '7 days'
GROUP BY bucket
ORDER BY bucket;

-- 활성 알람 목록
SELECT m.name, a.fault_type, a.severity, a.triggered_at
FROM alarms a
JOIN motors m ON m.id = a.motor_id
WHERE a.state = 'active'
ORDER BY a.triggered_at DESC;

-- 모터 현재 상태 (뷰 사용)
SELECT * FROM v_motor_status;
```
