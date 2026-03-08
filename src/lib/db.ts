import { Pool } from 'pg'

// 개발/운영 모두 단일 Pool 인스턴스 재사용 (Next.js 핫 리로드 대응)
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

function createPool(): Pool {
  return new Pool({
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     Number(process.env.DB_PORT ?? 5432),
    database: process.env.DB_NAME     ?? 'motoriq',
    user:     process.env.DB_USER     ?? 'motoriq_user',
    password: process.env.DB_PASSWORD ?? 'motoriq_pass',
    max: 10,                  // 최대 커넥션 수
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  })
}

const pool: Pool = globalThis._pgPool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalThis._pgPool = pool

export default pool

/** 편의 함수: 단일 쿼리 실행 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const { rows } = await pool.query(text, params)
  return rows as T[]
}

/** 편의 함수: 단일 행 반환 (없으면 null) */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}
