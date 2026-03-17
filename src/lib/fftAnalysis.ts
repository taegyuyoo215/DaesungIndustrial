/**
 * FFT 분석 공통 유틸리티
 * - 베어링 결함 주파수 계산 (calcBearingFreqs)
 * - 특정 주파수 진폭 추출 (ampAtFreq)
 * - 추세 분석 (computeFaultTrend)
 * - 종합 상태 판정 (overallFftStatus)
 */
import type { FftSpectrum, BearingFreqs, FftTrendItem } from '@/types'

// ── 기본 베어링 사양 (6206계열) ────────────────────────────
export const DEFAULT_BEARING = {
  ballCount:        8,
  ballDiaMm:        9.5,
  pitchDiaMm:       46.5,
  contactAngleDeg:  15,
}

// ── 베어링 결함 주파수 계산 ────────────────────────────────
export function calcBearingFreqs(
  rpm:              number,
  ballCount:        number,
  ballDiaMm:        number,
  pitchDiaMm:       number,
  contactAngleDeg:  number,
): BearingFreqs {
  const f1x   = rpm / 60
  const ratio = (ballDiaMm / pitchDiaMm) * Math.cos((contactAngleDeg * Math.PI) / 180)
  const ftf   = 0.5 * (1 - ratio) * f1x
  const bpfo  = (ballCount / 2) * (1 - ratio) * f1x
  const bpfi  = (ballCount / 2) * (1 + ratio) * f1x
  const bsf   = (pitchDiaMm / (2 * ballDiaMm)) * (1 - ratio ** 2) * f1x
  return {
    rpm,
    f1x:  +f1x.toFixed(2),
    f2x:  +(f1x * 2).toFixed(2),
    f3x:  +(f1x * 3).toFixed(2),
    ftf:  +ftf.toFixed(2),
    bsf:  +bsf.toFixed(2),
    bpfo: +bpfo.toFixed(2),
    bpfi: +bpfi.toFixed(2),
  }
}

// ── 결함 주파수별 임계값 ──────────────────────────────────
export const FAULT_THRESHOLDS: Record<string, { warn: number; earlyWarn: number }> = {
  '1X':   { warn: 3.0, earlyWarn: 1.5 },
  '2X':   { warn: 2.5, earlyWarn: 1.2 },
  'BPFO': { warn: 1.0, earlyWarn: 0.5 },
  'BPFI': { warn: 1.0, earlyWarn: 0.5 },
  'BSF':  { warn: 1.5, earlyWarn: 0.7 },
  'FTF':  { warn: 0.8, earlyWarn: 0.4 },
}

// ── 특정 주파수에서의 진폭 추출 ──────────────────────────
export function ampAtFreq(spec: FftSpectrum, targetHz: number, tolHz = 5): number {
  if (!spec.freq_bins.length) return 0
  const idx = spec.freq_bins.reduce((best, f, i) =>
    Math.abs(f - targetHz) < Math.abs(spec.freq_bins[best] - targetHz) ? i : best, 0)
  return Math.abs(spec.freq_bins[idx] - targetHz) <= tolHz ? spec.amp_bins[idx] : 0
}

// ── 추세 분석 ────────────────────────────────────────────
/**
 * @param spectra DB에서 ORDER BY DESC로 가져온 스펙트럼 (최신순)
 * @returns 결함 주파수별 추세 분석 결과 (oldest→newest 방향)
 */
export function computeFaultTrend(
  spectra: FftSpectrum[],
  freqs: BearingFreqs,
  tolHz = 5,
): FftTrendItem[] {
  // 시간 순서로 재정렬 (oldest → newest)
  const ordered = [...spectra].reverse()

  const faultDefs = [
    { label: '1X',   freq: freqs.f1x  },
    { label: '2X',   freq: freqs.f2x  },
    { label: 'BPFO', freq: freqs.bpfo },
    { label: 'BPFI', freq: freqs.bpfi },
    { label: 'BSF',  freq: freqs.bsf  },
    { label: 'FTF',  freq: freqs.ftf  },
  ]

  return faultDefs.map(({ label, freq }) => {
    const { warn, earlyWarn } = FAULT_THRESHOLDS[label] ?? { warn: 1.0, earlyWarn: 0.5 }

    // 각 스펙트럼에서 진폭 추출
    const history = ordered.map(s => +ampAtFreq(s, freq, tolHz).toFixed(4))
    const currentAmp = history[history.length - 1] ?? 0

    // 추세 판정: 모든 연속 차분이 같은 방향이어야 rising/falling
    let trend: 'rising' | 'stable' | 'falling' = 'stable'
    if (history.length >= 2) {
      const diffs = history.slice(1).map((v, i) => v - history[i])
      if (diffs.every(d => d >  0.0005)) trend = 'rising'
      else if (diffs.every(d => d < -0.0005)) trend = 'falling'
    }

    // 변화율 (oldest → newest)
    const rateOfChange =
      history.length >= 2 && history[0] > 0.001
        ? +((currentAmp - history[0]) / history[0] * 100).toFixed(1)
        : 0

    // 상태 판정
    // 1) 진폭이 경보 임계값 초과 → warning
    // 2) 상승 추세 + 조기경보 임계값 초과 → early_warning
    // 3) 급격한 상승(>30%) + 조기경보 임계값의 80% 초과 → early_warning
    let status: 'normal' | 'early_warning' | 'warning' = 'normal'
    if (currentAmp >= warn) {
      status = 'warning'
    } else if (trend === 'rising' && currentAmp >= earlyWarn) {
      status = 'early_warning'
    } else if (rateOfChange > 30 && currentAmp >= earlyWarn * 0.8) {
      status = 'early_warning'
    }

    return {
      label, freq, history, trend, rateOfChange, status,
      currentAmp, warnThreshold: warn, earlyWarnThreshold: earlyWarn,
    }
  })
}

// ── 종합 상태 ────────────────────────────────────────────
export function overallFftStatus(
  trends: FftTrendItem[],
): 'normal' | 'early_warning' | 'warning' {
  if (trends.some(t => t.status === 'warning'))       return 'warning'
  if (trends.some(t => t.status === 'early_warning')) return 'early_warning'
  return 'normal'
}

// ── FFT 레이블 → DB fault_type ────────────────────────────
export const FFT_TO_FAULT_TYPE: Record<string, string> = {
  'BPFO': 'bearing_outer',
  'BPFI': 'bearing_inner',
  '1X':   'imbalance',
  '2X':   'misalignment',
  'BSF':  'bearing_outer',
  'FTF':  'bearing_outer',
}

// 이상 심각도 우선순위 (BPFO > BPFI > 1X > 2X > BSF > FTF)
export const FAULT_PRIORITY = ['BPFO', 'BPFI', '1X', '2X', 'BSF', 'FTF']

// ── Crest Factor 상태 판정 ────────────────────────────────
export function analyzeCrestFactor(value: number): 'normal' | 'early_warning' | 'warning' {
  if (value >= 4.0) return 'warning'
  if (value >= 2.5) return 'early_warning'
  return 'normal'
}

// ── Peak Velocity 주파수와 결함 주파수 매칭 ───────────────
/**
 * peakHz가 결함 주파수 중 어느 것과 가장 가까운지 반환.
 * tolHz 이내에 있어야 매칭으로 인정.
 */
export function matchDominantFreq(
  peakHz: number,
  freqs: BearingFreqs,
  tolHz = 8,
): string | null {
  const candidates: [string, number][] = [
    ['1X',   freqs.f1x],
    ['2X',   freqs.f2x],
    ['3X',   freqs.f3x],
    ['BPFO', freqs.bpfo],
    ['BPFI', freqs.bpfi],
    ['BSF',  freqs.bsf],
    ['FTF',  freqs.ftf],
  ]
  let best: string | null = null
  let bestDist = Infinity
  for (const [label, freq] of candidates) {
    const dist = Math.abs(peakHz - freq)
    if (dist <= tolHz && dist < bestDist) {
      bestDist = dist
      best     = label
    }
  }
  return best
}
