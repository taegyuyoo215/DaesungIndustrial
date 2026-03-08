# PostgreSQL 설치 및 DB 초기화 가이드

> Docker 없이 Windows에 PostgreSQL을 직접 설치하는 방법

---

## Step 1 — PostgreSQL 16 설치

1. https://www.postgresql.org/download/windows/ 접속
2. **Windows x86-64** 인스톨러 다운로드 (16.x 최신 버전)
3. 설치 실행 → 아래 값으로 설정

| 항목 | 값 |
|------|-----|
| 설치 경로 | 기본값 유지 |
| Port | `5432` |
| Superuser(postgres) 비밀번호 | 기억할 값으로 설정 |
| Locale | Default |

4. **Stack Builder** 화면은 Skip (취소)

---

## Step 2 — DB 및 사용자 생성

PostgreSQL 설치 후 **pgAdmin 4** 또는 **SQL Shell(psql)** 실행

### psql 사용 시

```sql
-- postgres 슈퍼유저로 접속 후 실행
CREATE USER motoriq_user WITH PASSWORD 'motoriq_pass';
CREATE DATABASE motoriq OWNER motoriq_user;
GRANT ALL PRIVILEGES ON DATABASE motoriq TO motoriq_user;
```

### pgAdmin 사용 시
1. pgAdmin 4 실행 → Servers > PostgreSQL 16 > 우클릭
2. `Create > Login/Group Role` → Name: `motoriq_user`, Password: `motoriq_pass`
3. `Create > Database` → Name: `motoriq`, Owner: `motoriq_user`

---

## Step 3 — 스키마 초기화

```bash
# 프로젝트 루트에서 실행
psql -U motoriq_user -d motoriq -f database/init.sql
```

또는 pgAdmin에서 `motoriq` DB 선택 후 `init.sql` 내용을 Query Tool에 붙여넣고 실행

---

## Step 4 — 연결 확인

```bash
psql -U motoriq_user -d motoriq -c "\dt"
```

아래 테이블 목록이 출력되면 성공:
```
 sites, users, motors, sensors, measurements,
 thresholds, diagnosis_results, alarms, maintenance_logs
```

---

## Step 4-1 — 테스트 시드 데이터 입력 (선택)

개발/테스트 환경에서 즉시 동작 확인을 위한 더미 데이터:

```bash
psql -U motoriq_user -d motoriq -f database/seed.sql
```

시드 데이터 내용:
- 측정값: 최근 7일치 (6개 모터 × 약 1,440건/일)
- AI 진단결과: 6건 (경보 1, 주의 2, 정상 2)
- 알람: 5건 (활성 2, 확인됨 1, 해결됨 2)
- 정비 이력: 5건

---

## Step 5 — Next.js 패키지 설치

```bash
cd fa-it-solution
npm install pg @types/pg swr recharts react-hook-form zod
```

---

## 연결 정보 (`.env.local`)

```
DATABASE_URL=postgresql://motoriq_user:motoriq_pass@localhost:5432/motoriq
```

---

## 참고 — pgAdmin 4 다운로드

PostgreSQL 인스톨러에 포함되어 있음. 별도 필요 시:
https://www.pgadmin.org/download/pgadmin-4-windows/
