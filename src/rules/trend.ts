/**
 * Engine v2 trend detection, ported from fit-ontology's reasoning.py.
 *
 * Each trend signal (HRV / RHR / sleep) runs two slope estimators:
 *
 *   acute  — 7-day OLS slope of the raw daily series, normalized by
 *            the 28-day baseline SD so the threshold lives in SD/day.
 *            Responsive but noisy.
 *
 *   chronic — 28-day EWMA (halflife=10 days), then OLS slope on the
 *            smoothed series. Damps short-window noise; reflects
 *            sustained direction. Plews, Laursen et al. (2013)
 *            recommend ~4-week windows for individual-level monitoring
 *            because the 7-day variance is too high to act on alone.
 *
 * combineAcuteChronic resolves the (acute, chronic) pair per the engine
 * v2 decision table:
 *   - acute alone → demote one band (the noise-suppression rule)
 *   - chronic stronger than acute → promote acute one band
 *   - chronic ≤ acute → trust the acute band
 *   - both silent → null
 *
 * applyLevelDominates: when composite recovery ≥ floor (default 90),
 * demote every trend signal by one more band. Levels-based signals
 * (e.g. workout load ACWR) are unaffected — the rule is about trend
 * noise on a clean recovery picture, not a blanket override.
 *
 * Thresholds are ported as-is from the engine v2 constants. The
 * acute and chronic bands are intentionally different because the
 * EWMA smoother halves slope variance vs raw OLS.
 */

export type TrendSeverity = 'mild' | 'moderate' | 'severe'

/** Acute (7d OLS) thresholds in SD/day. Magnitude, signed against the "bad" direction. */
export const ACUTE_THRESHOLDS = {
  mild: 0.05,
  moderate: 0.10,
  severe: 0.20,
}

/** Chronic (28d EWMA-then-OLS) thresholds in SD/day. About half the acute values. */
export const CHRONIC_THRESHOLDS = {
  mild: 0.02,
  moderate: 0.04,
  severe: 0.08,
}

export const EWMA_HALFLIFE_DAYS = 10
export const ACUTE_WINDOW_DAYS = 7
export const CHRONIC_WINDOW_DAYS = 28
export const MIN_SAMPLES = 4

/**
 * When composite recovery ≥ this floor, trend signals are demoted by one
 * band before the verdict combiner reads severity counts. Picked from
 * fit-ontology's level-dominates calibration.
 */
export const LEVEL_DOMINATES_RECOVERY_FLOOR = 90

export type SlopeResult = {
  /** Signed slope in metric-units per day. */
  slopePerDay: number
  /** How many daily points contributed. */
  nSamples: number
  method: 'ols' | 'ewma'
  windowDays: number
  /** 0..1; OLS always 1.0; short EWMA windows down-weight to 0. */
  confidenceWeight: number
}

/**
 * Ordinary least-squares slope of values vs an x-vector (day indices).
 * Returns null when x-variance is zero.
 */
function olsSlope(xs: number[], ys: number[]): number | null {
  if (xs.length === 0 || xs.length !== ys.length) return null
  let sumX = 0
  let sumY = 0
  for (let i = 0; i < xs.length; i++) {
    sumX += xs[i]
    sumY += ys[i]
  }
  const meanX = sumX / xs.length
  const meanY = sumY / ys.length
  let num = 0
  let den = 0
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - meanX
    num += dx * (ys[i] - meanY)
    den += dx * dx
  }
  if (den === 0) return null
  return num / den
}

/**
 * EWMA smoother matching pandas' default (adjusted=true) formula.
 * For a halflife h, alpha = 1 - exp(-ln(2)/h). Adjusted normalization
 * means the early samples don't bias toward x[0].
 */
function ewmaSmoothed(values: number[], halflife: number): number[] {
  if (values.length === 0) return []
  const alpha = 1 - Math.exp(-Math.LN2 / halflife)
  const out: number[] = new Array(values.length)
  let weightedSum = 0
  let weight = 0
  for (let i = 0; i < values.length; i++) {
    // pandas adjusted: weights are (1-alpha)^(i-j) for j=0..i, normalised by sum.
    weightedSum = (1 - alpha) * weightedSum + values[i]
    weight = (1 - alpha) * weight + 1
    out[i] = weightedSum / weight
  }
  return out
}

/**
 * Compute the OLS slope on a daily series. Pass dense daily values
 * (oldest-first); the x-vector is just 0..n-1.
 */
export function computeOlsSlope(values: number[], windowDays: number): SlopeResult | null {
  if (values.length < MIN_SAMPLES) return null
  const xs = values.map((_, i) => i)
  const slope = olsSlope(xs, values)
  if (slope === null) return null
  return {
    slopePerDay: slope,
    nSamples: values.length,
    method: 'ols',
    windowDays,
    confidenceWeight: 1.0,
  }
}

/**
 * Compute EWMA-smoothed-then-OLS slope. Short windows are returned with
 * confidenceWeight ramped to 0 (matches engine v2's EWMA_MIN_SAMPLES=14
 * ramp-up).
 */
export function computeEwmaSlope(values: number[], windowDays: number): SlopeResult | null {
  if (values.length < MIN_SAMPLES) return null
  const smoothed = ewmaSmoothed(values, EWMA_HALFLIFE_DAYS)
  const xs = smoothed.map((_, i) => i)
  const slope = olsSlope(xs, smoothed)
  if (slope === null) return null
  const minSamples = 14
  let weight: number
  if (values.length < minSamples) weight = 0
  else if (values.length >= windowDays) weight = 1
  else weight = (values.length - minSamples) / Math.max(1, windowDays - minSamples)
  return {
    slopePerDay: slope,
    nSamples: values.length,
    method: 'ewma',
    windowDays,
    confidenceWeight: weight,
  }
}

/**
 * Bucket a SD/day slope magnitude (already signed in the "bad" direction)
 * into a severity band. Returns null when the slope is in the "good"
 * direction (negative) or below the mild threshold.
 */
export function slopeSeverity(
  signedBadSdPerDay: number,
  thresholds: { mild: number; moderate: number; severe: number },
): TrendSeverity | null {
  if (signedBadSdPerDay >= thresholds.severe) return 'severe'
  if (signedBadSdPerDay >= thresholds.moderate) return 'moderate'
  if (signedBadSdPerDay >= thresholds.mild) return 'mild'
  return null
}

const SEVERITY_RANK: Record<TrendSeverity | 'none', number> = {
  none: 0,
  mild: 1,
  moderate: 2,
  severe: 3,
}
const RANK_SEVERITY = ['none', 'mild', 'moderate', 'severe'] as const

/**
 * Engine v2's E3 combiner. See module docstring for the principles.
 */
export function combineAcuteChronic(
  acute: TrendSeverity | null,
  chronic: TrendSeverity | null,
): TrendSeverity | null {
  const a = SEVERITY_RANK[acute ?? 'none']
  const c = SEVERITY_RANK[chronic ?? 'none']
  if (a === 0 && c === 0) return null
  if (a === 0) {
    // Chronic-only: severe → mild surface, weaker → none.
    return c === 3 ? 'mild' : null
  }
  if (c === 0) {
    // Acute-only: demote by one band. Mild → none entirely.
    const demoted = RANK_SEVERITY[Math.max(0, a - 1)]
    return demoted === 'none' ? null : demoted
  }
  if (c > a) {
    // Chronic stronger: promote acute by one band, cap at severe.
    return RANK_SEVERITY[Math.min(3, a + 1)] as TrendSeverity
  }
  // Chronic confirms acute at same or lower tier: trust the acute.
  return RANK_SEVERITY[a] as TrendSeverity
}

/** Demote a trend severity by one band. Mild → null (dropped entirely). */
export function demoteOneBand(sev: TrendSeverity): TrendSeverity | null {
  const next = Math.max(0, SEVERITY_RANK[sev] - 1)
  return next === 0 ? null : (RANK_SEVERITY[next] as TrendSeverity)
}

/**
 * Composite recovery score (0–100). Lower means worse recovery.
 * Simplified vs engine v2 — we only have HRV/RHR/sleep as recovery
 * markers in recovery-trail, so the composite is the mean of available
 * band scores. Mirrors engine v2's _band_score logic: each metric scores
 * 100 if within the mild threshold, drops linearly through moderate and
 * severe, floors at 0.
 */
export function compositeRecoveryScore(parts: {
  hrvDropSd?: number | null
  rhrRiseBpm?: number | null
  sleepHoursAcute?: number | null
}): number | null {
  const scores: number[] = []
  if (parts.hrvDropSd !== null && parts.hrvDropSd !== undefined) {
    scores.push(bandScore(Math.max(0, parts.hrvDropSd), 1.0, 1.5, 2.5))
  }
  if (parts.rhrRiseBpm !== null && parts.rhrRiseBpm !== undefined) {
    scores.push(bandScore(Math.max(0, parts.rhrRiseBpm), 3, 5, 8))
  }
  if (parts.sleepHoursAcute !== null && parts.sleepHoursAcute !== undefined) {
    const hoursBelowFloor = Math.max(0, 7 - parts.sleepHoursAcute)
    scores.push(bandScore(hoursBelowFloor, 0.5, 1.0, 1.5))
  }
  if (scores.length === 0) return null
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

/**
 * Map a "badness" magnitude through mild/moderate/severe thresholds onto
 * a 0–100 band score. Below mild → 100; above severe → 0; linear ramps
 * between bands so the score moves smoothly with the underlying metric.
 */
function bandScore(badness: number, mild: number, moderate: number, severe: number): number {
  if (badness <= 0) return 100
  if (badness < mild) return 100 - (badness / mild) * 10 // 100 → 90
  if (badness < moderate) return 90 - ((badness - mild) / (moderate - mild)) * 25 // 90 → 65
  if (badness < severe) return 65 - ((badness - moderate) / (severe - moderate)) * 35 // 65 → 30
  return Math.max(0, 30 - ((badness - severe) / severe) * 30)
}

export type TrendDetectionResult = {
  /** Combined severity after acute/chronic resolution, before level-dominates. */
  combined: TrendSeverity | null
  acuteSeverity: TrendSeverity | null
  chronicSeverity: TrendSeverity | null
  /** Which window(s) actually fired into the combiner before resolution. */
  windowsFired: 'acute' | 'chronic' | 'both' | null
  /** Raw slope magnitudes in SD/day, signed in the BAD direction. */
  acuteSdPerDay: number | null
  chronicSdPerDay: number | null
  /** Raw slope per day in metric units (ms/day, bpm/day, hrs/day). */
  acuteRawPerDay: number | null
  chronicRawPerDay: number | null
}

/**
 * Run the dual-window detector on a metric. Pass the daily series
 * (oldest-first, ending today) and the baseline SD computed over the
 * 28-day window. `higherIsBetter` controls the "bad direction" sign.
 */
export function detectTrend(
  series: number[],
  baselineSd: number | null,
  higherIsBetter: boolean,
): TrendDetectionResult {
  const empty: TrendDetectionResult = {
    combined: null,
    acuteSeverity: null,
    chronicSeverity: null,
    windowsFired: null,
    acuteSdPerDay: null,
    chronicSdPerDay: null,
    acuteRawPerDay: null,
    chronicRawPerDay: null,
  }
  if (!baselineSd || baselineSd === 0) return empty

  const acuteWindow = series.slice(-ACUTE_WINDOW_DAYS)
  const chronicWindow = series.slice(-CHRONIC_WINDOW_DAYS)

  const acuteResult = computeOlsSlope(acuteWindow, ACUTE_WINDOW_DAYS)
  const chronicResult = computeEwmaSlope(chronicWindow, CHRONIC_WINDOW_DAYS)

  // Sign in the "bad" direction: higher-is-better metrics are bad when
  // slope is negative; lower-is-better metrics are bad when slope is
  // positive.
  const sign = higherIsBetter ? -1 : 1

  const acuteSdPerDay =
    acuteResult ? (sign * acuteResult.slopePerDay) / baselineSd : null
  const chronicSdPerDay =
    chronicResult && chronicResult.confidenceWeight > 0
      ? (sign * chronicResult.slopePerDay) / baselineSd
      : null

  const acuteSev =
    acuteSdPerDay !== null ? slopeSeverity(acuteSdPerDay, ACUTE_THRESHOLDS) : null
  const chronicSev =
    chronicSdPerDay !== null ? slopeSeverity(chronicSdPerDay, CHRONIC_THRESHOLDS) : null
  const combined = combineAcuteChronic(acuteSev, chronicSev)

  let windowsFired: 'acute' | 'chronic' | 'both' | null = null
  if (acuteSev && chronicSev) windowsFired = 'both'
  else if (acuteSev) windowsFired = 'acute'
  else if (chronicSev) windowsFired = 'chronic'

  return {
    combined,
    acuteSeverity: acuteSev,
    chronicSeverity: chronicSev,
    windowsFired,
    acuteSdPerDay,
    chronicSdPerDay,
    acuteRawPerDay: acuteResult ? acuteResult.slopePerDay : null,
    chronicRawPerDay: chronicResult ? chronicResult.slopePerDay : null,
  }
}

/** SD of a numeric series, population formula (ddof=0). */
export function populationStdDev(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance =
    values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}
