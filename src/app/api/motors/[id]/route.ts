import { NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'
import type { Measurement, Alarm, MaintenanceLog, DiagnosisResult } from '@/types'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const motorId = Number(id)
  if (isNaN(motorId)) {
    return NextResponse.json({ error: '잘못된 ID' }, { status: 400 })
  }

  try {
    // 모터 기본 정보
    const motor = await queryOne(`
      SELECT m.*, si.name AS site_name
      FROM motors m
      JOIN sites si ON si.id = m.site_id
      WHERE m.id = $1
    `, [motorId])

    if (!motor) {
      return NextResponse.json({ error: '모터를 찾을 수 없습니다' }, { status: 404 })
    }

    // 연결된 센서
    const sensor = await queryOne(`
      SELECT * FROM sensors WHERE motor_id = $1 AND status = 'active' LIMIT 1
    `, [motorId])

    // 최신 측정값
    const latestMeasurement = sensor
      ? await queryOne<Measurement>(`
          SELECT * FROM measurements
          WHERE sensor_id = $1
          ORDER BY time DESC
          LIMIT 1
        `, [(sensor as Record<string, unknown>).id])
      : null

    // 최신 AI 진단 결과
    const latestDiagnosis = await queryOne<DiagnosisResult>(`
      SELECT * FROM diagnosis_results
      WHERE motor_id = $1
      ORDER BY diagnosed_at DESC
      LIMIT 1
    `, [motorId])

    // 활성 알람
    const activeAlarms = await query<Alarm>(`
      SELECT a.*, u.username AS acknowledged_by_name
      FROM alarms a
      LEFT JOIN users u ON u.id = a.acknowledged_by
      WHERE a.motor_id = $1 AND a.state != 'resolved'
      ORDER BY a.triggered_at DESC
      LIMIT 5
    `, [motorId])

    // 최근 정비 이력 (3건)
    const maintenanceLogs = await query<MaintenanceLog>(`
      SELECT ml.*, u.username AS performed_by_name
      FROM maintenance_logs ml
      LEFT JOIN users u ON u.id = ml.performed_by
      WHERE ml.motor_id = $1
      ORDER BY ml.performed_at DESC
      LIMIT 3
    `, [motorId])

    // 임계값
    const thresholds = await query(`
      SELECT * FROM thresholds
      WHERE motor_id = $1 OR motor_id IS NULL
      ORDER BY motor_id NULLS LAST
    `, [motorId])

    return NextResponse.json({
      data: {
        motor,
        sensor,
        latestMeasurement,
        latestDiagnosis,
        activeAlarms,
        maintenanceLogs,
        thresholds,
      }
    })
  } catch (err) {
    console.error('[GET /api/motors/[id]]', err)
    return NextResponse.json({ error: '서버 오류', detail: String(err) }, { status: 500 })
  }
}
