import type { FiredRule, Severity } from './evaluate'
import type { DailyMetric } from './aggregate'

export type MetricKey = 'hrv' | 'rhr' | 'sleep' | 'load'

export type MetricSpec = {
  key: MetricKey
  label: string
  unit: string
  series: DailyMetric[]
  /** True if higher values are better. Workout is treated as bad-when-high for heatmap purposes (spike risk). */
  higherIsBetter: boolean
  precision: number
}

/**
 * 5-tier cell scale from the prototype: signed % deviation from baseline,
 * sign-flipped by polarity so positive == bad regardless of metric.
 */
export type CellTier = 'goodStrong' | 'goodMild' | 'flat' | 'badMild' | 'badStrong' | 'empty'

export function cellTier(
  value: number | null,
  baseline: number | null,
  higherIsBetter: boolean,
): CellTier {
  if (value === null || baseline === null || baseline === 0) return 'empty'
  const polarity = higherIsBetter ? 1 : -1
  const badness = -polarity * ((value - baseline) / baseline) * 100
  if (badness <= -10) return 'goodStrong'
  if (badness <= -3) return 'goodMild'
  if (badness <= 3) return 'flat'
  if (badness <= 10) return 'badMild'
  return 'badStrong'
}

/** True if a cell is on the "off baseline" side (badMild or badStrong). */
export function isOffBaseline(tier: CellTier): boolean {
  return tier === 'badMild' || tier === 'badStrong'
}

/** Map a rule id to the metric column it belongs in. */
export function metricOfRule(ruleId: string): MetricKey | null {
  if (ruleId.startsWith('hrv_')) return 'hrv'
  if (ruleId.startsWith('rhr_')) return 'rhr'
  if (ruleId.startsWith('sleep_')) return 'sleep'
  if (ruleId.startsWith('acwr_')) return 'load'
  return null
}

/**
 * Synthesize a top-line meta-rule when 3+ rules fire across 3+ different
 * metrics. Frames the situation rather than reciting numbers.
 */
export function metaRule(fired: FiredRule[]): FiredRule | null {
  if (fired.length < 3) return null
  const metrics = new Set<MetricKey>()
  for (const r of fired) {
    const m = metricOfRule(r.id)
    if (m) metrics.add(m)
  }
  if (metrics.size < 3) return null
  const hasDeload = fired.some((r) => r.severity === 'deload')
  const severity: Severity = hasDeload ? 'deload' : 'caution'
  const names = Array.from(metrics)
    .map((m) => ({ hrv: 'HRV', rhr: 'resting HR', sleep: 'sleep', load: 'load' })[m])
    .join(', ')
    .replace(/,([^,]*)$/, ', and$1')
  return {
    id: 'meta_recovery_stack',
    name: 'Recovery stack is down across the board',
    severity,
    why: `${names} are all off baseline at once — not a single isolated marker.`,
    evidence: { metricsAffected: metrics.size, rulesFired: fired.length },
  }
}

/**
 * Data-aware narrative — finds the most recent day when all four metrics
 * were within baseline, then describes the rollover. Falls back to a
 * mixed-window phrasing if no such day exists.
 */
export function narrative(specs: MetricSpec[], asOfDay: string): string {
  const days = collectDaysDescending(specs, asOfDay)
  if (days.length === 0) return 'Not enough data yet for a window picture.'

  const baselines: Record<MetricKey, number | null> = {
    hrv: meanLast(specs.find((s) => s.key === 'hrv')?.series ?? [], 28),
    rhr: meanLast(specs.find((s) => s.key === 'rhr')?.series ?? [], 28),
    sleep: meanLast(specs.find((s) => s.key === 'sleep')?.series ?? [], 28),
    load: meanLast(specs.find((s) => s.key === 'load')?.series ?? [], 28),
  }

  // Find the most recent day where NO metric is off baseline.
  let lastCleanDay: string | null = null
  for (const day of days) {
    const allClean = specs.every((spec) => {
      const v = valueOn(spec.series, day)
      if (v === null) return true
      return !isOffBaseline(cellTier(v, baselines[spec.key], spec.higherIsBetter))
    })
    if (allClean) {
      lastCleanDay = day
      break
    }
  }

  // Count metrics off baseline on the most recent day.
  const latestDay = days[0]
  const flippedNow = specs.filter((spec) => {
    const v = valueOn(spec.series, latestDay)
    return v !== null && isOffBaseline(cellTier(v, baselines[spec.key], spec.higherIsBetter))
  })

  if (flippedNow.length === 0) {
    return 'All four markers are tracking baseline across the window.'
  }
  if (lastCleanDay && lastCleanDay !== latestDay) {
    const shortDay = shortDayLabel(lastCleanDay)
    if (flippedNow.length >= 3) {
      return `Through ${shortDay} everything was at baseline. Then ${countWord(flippedNow.length)} metrics rolled over at once — and stayed there.`
    }
    const names = flippedNow.map((s) => labelOf(s.key)).join(' and ')
    return `Through ${shortDay} everything was at baseline. Then ${names} slipped — and hasn't come back.`
  }
  // No clean day in window.
  if (flippedNow.length >= 3) {
    return `${countWord(flippedNow.length)} of four markers have been off baseline across the window.`
  }
  const names = flippedNow.map((s) => labelOf(s.key)).join(' and ')
  return `${capitalize(names)} have been off baseline across most of the window.`
}

function valueOn(series: DailyMetric[], day: string): number | null {
  const m = series.find((d) => d.day === day)
  return m ? m.value : null
}

function meanLast(series: DailyMetric[], n: number): number | null {
  const tail = series.slice(-n)
  if (tail.length === 0) return null
  return tail.reduce((a, b) => a + b.value, 0) / tail.length
}

function collectDaysDescending(specs: MetricSpec[], asOfDay: string): string[] {
  const set = new Set<string>()
  for (const s of specs) for (const m of s.series.slice(-14)) set.add(m.day)
  return Array.from(set)
    .filter((d) => d <= asOfDay)
    .sort()
    .reverse()
}

function shortDayLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

function countWord(n: number): string {
  return n === 4 ? 'all four' : n === 3 ? 'three' : n === 2 ? 'two' : String(n)
}

function labelOf(k: MetricKey): string {
  return { hrv: 'HRV', rhr: 'resting HR', sleep: 'sleep', load: 'load' }[k]
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
