import type { Severity, FaultType } from './base_types'

export interface FloorPlan {
  id: number
  name: string
  file_name: string
  file_path?: string
  page_count: number
  created_at: string
}

export interface MotorPin {
  id: number
  motor_id: number
  motor_name: string
  location: string | null
  floor_plan_id?: number
  page: number
  x_pct: number
  y_pct: number
  severity: Severity
  vel_y_rms: number | null
  temperature_c: number | null
  fault_type: FaultType | null
}
