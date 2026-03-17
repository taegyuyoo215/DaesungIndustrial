import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const motorId = Number(id)
  if (isNaN(motorId)) {
    return NextResponse.json({ error: '잘못된 ID' }, { status: 400 })
  }

  const sp = req.nextUrl.searchParams
  // hours: 최근 N시간치 데이터 (기본 24시간)
  const hours  = Math.min(Number(sp.get('hours')  ?? 24), 168) // 최대 7일
  const metric = sp.get('metric') ?? 'vel_rms'   // vel_rms | hf_accel | kurtosis | temperature
  const bucket = sp.get('bucket') ?? 'raw'       // raw | hour

  try {
    // 센서 ID 조회
    const sensor = await queryOne<{ id: number }>(`
      SELECT id FROM sensors WHERE motor_id = $1 AND status = 'active' LIMIT 1
    `, [motorId])

    if (!sensor) {
      return NextResponse.json({ data: [] })
    }

    const sensorId = sensor.id

    if (bucket === 'hour' || bucket === 'minute') {
      // 시간별 / 분별 평균 (트렌드 차트용)
      // anchor=latest: DB 최신 측정 시각 기준으로 N시간 창을 잡음
      // → 시드 데이터처럼 타임스탬프가 고정된 경우에도 차트가 표시됨
      // → 실제 센서가 연결되면 MAX(time) ≈ NOW() 이므로 실시간과 동일
      const anchor = sp.get('anchor') ?? 'now' // now | latest
      const trunc  = bucket === 'minute' ? 'minute' : 'hour'

      const anchorExpr = anchor === 'latest'
        ? `(SELECT COALESCE(MAX(time), NOW()) FROM measurements WHERE sensor_id = $1)`
        : `NOW()`

      const rows = await query(`
        SELECT
          date_trunc('${trunc}', time) AS bucket,
          AVG(vel_y_rms)         AS vel_y_avg,
          AVG(hf_accel_y_rms)    AS hf_accel_y_avg,
          AVG(kurtosis_y)        AS kurtosis_y_avg,
          AVG(temperature_c)     AS temp_avg,
          AVG(crest_x)           AS crest_x_avg,
          AVG(pkpk_accel_x)      AS pkpk_x_avg,
          AVG(peak_vel_freq_x)   AS peak_vel_freq_x_avg,
          MAX(kurtosis_z)        AS kurtosis_z_avg
        FROM measurements
        WHERE sensor_id = $1
          AND time >= ${anchorExpr} - ($2 || ' hours')::INTERVAL
          AND time <= ${anchorExpr}
        GROUP BY date_trunc('${trunc}', time)
        ORDER BY bucket ASC
      `, [sensorId, hours])
      return NextResponse.json({ data: rows })
    }

    // raw 데이터: metric에 따라 컬럼 선택
    const metricCols: Record<string, string> = {
      vel_rms:     'vel_x_rms, vel_y_rms, vel_z_rms',
      hf_accel:    'hf_accel_x_rms, hf_accel_y_rms, hf_accel_z_rms',
      kurtosis:    'kurtosis_x, kurtosis_y, kurtosis_z',
      temperature: 'temperature_c',
    }
    const cols = metricCols[metric] ?? metricCols.vel_rms

    const rows = await query(`
      SELECT time, ${cols}
      FROM measurements
      WHERE sensor_id = $1
        AND time >= NOW() - ($2 || ' hours')::INTERVAL
      ORDER BY time ASC
    `, [sensorId, hours])

    return NextResponse.json({ data: rows, total: rows.length })
  } catch (err) {
    console.error('[GET /api/motors/[id]/measurements]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
