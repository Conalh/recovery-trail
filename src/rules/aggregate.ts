import type { HrvSample, ParsedExport, RhrSample, SleepSample, WorkoutSample } from '../lib/types'

/**
 * Add `n` days to a YYYY-MM-DD day string. UTC arithmetic on the date
 * components, so it is locale- and DST-independent.
 */
export function addDays(dayIso: string, n: number): string {
  const [y, m, d] = dayIso.split('-').map(Number)
  const t = Date.UTC(y, m - 1, d) + n * 86_400_000
  const dt = new Date(t)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Whole-day difference (later - earlier) between two YYYY-MM-DD strings, UTC-based. */
export function diffDays(later: string, earlier: string): number {
  const [ly, lm, ld] = later.split('-').map(Number)
  const [ey, em, ed] = earlier.split('-').map(Number)
  return Math.round((Date.UTC(ly, lm - 1, ld) - Date.UTC(ey, em - 1, ed)) / 86_400_000)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export type DailyMetric = { day: string; value: number; sampleCount: number }

/** Mean of valueMs per calendar day (the sample's source day). */
export function dailyHrv(samples: HrvSample[]): DailyMetric[] {
  return reduceByDay(
    samples.map((s) => ({ day: s.start.sourceDay, value: s.valueMs })),
    'mean',
  )
}

/** Minimum BPM per calendar day (Apple records many resting-HR samples; the minimum is the most resting). */
export function dailyRhr(samples: RhrSample[]): DailyMetric[] {
  return reduceByDay(
    samples.map((s) => ({ day: s.start.sourceDay, value: s.valueBpm })),
    'min',
  )
}

/**
 * Sum of asleep durations (hours) per "wake day" — sleep that ends on day D is
 * counted toward day D's recovery picture. Overlapping intervals (e.g. a stage
 * record nested inside an aggregate record, or duplicates from two sources) are
 * MERGED before summing so total sleep is never double-counted. Excludes
 * inBed / awake stages.
 */
export function dailySleepHours(samples: SleepSample[]): DailyMetric[] {
  const asleep = samples.filter((s) => s.stage.startsWith('asleep'))
  const perDay = new Map<string, Array<[number, number]>>()
  for (const s of asleep) {
    const day = s.end.sourceDay
    if (!day) continue
    const start = s.start.instantMs
    const end = s.end.instantMs
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const arr = perDay.get(day) ?? []
    arr.push([start, end])
    perDay.set(day, arr)
  }
  return Array.from(perDay.entries())
    .map(([day, intervals]) => {
      const ms = mergeIntervals(intervals).reduce((acc, [s, e]) => acc + (e - s), 0)
      return { day, value: ms / 3_600_000, sampleCount: intervals.length }
    })
    .sort((a, b) => (a.day < b.day ? -1 : 1))
}

/** Merge overlapping/adjacent [start, end] intervals into a minimal disjoint set. */
function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  if (intervals.length <= 1) return intervals
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = [[sorted[0][0], sorted[0][1]]]
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1]
    if (sorted[i][0] <= last[1]) {
      last[1] = Math.max(last[1], sorted[i][1])
    } else {
      merged.push([sorted[i][0], sorted[i][1]])
    }
  }
  return merged
}

/** Sum of workout durations (minutes) per calendar day. */
export function dailyWorkoutMinutes(samples: WorkoutSample[]): DailyMetric[] {
  return reduceByDay(
    samples.map((s) => ({ day: s.start.sourceDay, value: s.durationMin })),
    'sum',
  )
}

function reduceByDay(
  pairs: { day: string; value: number }[],
  mode: 'mean' | 'min' | 'sum',
): DailyMetric[] {
  const acc = new Map<string, number[]>()
  for (const { day, value } of pairs) {
    if (!day || !Number.isFinite(value)) continue
    const arr = acc.get(day) ?? []
    arr.push(value)
    acc.set(day, arr)
  }
  const out: DailyMetric[] = []
  for (const [day, values] of acc) {
    const v =
      mode === 'mean'
        ? values.reduce((a, b) => a + b, 0) / values.length
        : mode === 'min'
          ? Math.min(...values)
          : values.reduce((a, b) => a + b, 0)
    out.push({ day, value: v, sampleCount: values.length })
  }
  return out.sort((a, b) => (a.day < b.day ? -1 : 1))
}

/** Mean of values from `metrics` that fall in [end-windowDays+1, end] inclusive. */
export function windowMean(
  metrics: DailyMetric[],
  end: string,
  windowDays: number,
): { mean: number; count: number } {
  let sum = 0
  let count = 0
  for (const m of metrics) {
    const gap = diffDays(end, m.day)
    if (gap < 0 || gap >= windowDays) continue
    sum += m.value
    count += 1
  }
  return count === 0 ? { mean: 0, count: 0 } : { mean: sum / count, count }
}

/**
 * Mean of `metrics` over the [end-windowDays+1, end] calendar window, or null
 * when the window holds no readings. This is the single baseline definition
 * shared by the rule engine and the UI (heatmap / narrative) so they never
 * disagree on what "baseline" means for a sparse series.
 */
export function baselineMean(
  metrics: DailyMetric[],
  end: string,
  windowDays: number,
): number | null {
  const r = windowMean(metrics, end, windowDays)
  return r.count === 0 ? null : r.mean
}

/** Values from `metrics` that fall in [end-windowDays+1, end] inclusive, oldest-first. */
export function windowValues(
  metrics: DailyMetric[],
  end: string,
  windowDays: number,
): number[] {
  const out: number[] = []
  for (const m of metrics) {
    const gap = diffDays(end, m.day)
    if (gap < 0 || gap >= windowDays) continue
    out.push(m.value)
  }
  return out
}

/** Sum of values from `metrics` that fall in [end-windowDays+1, end] inclusive. */
export function windowSum(
  metrics: DailyMetric[],
  end: string,
  windowDays: number,
): { sum: number; count: number } {
  let sum = 0
  let count = 0
  for (const m of metrics) {
    const gap = diffDays(end, m.day)
    if (gap < 0 || gap >= windowDays) continue
    sum += m.value
    count += 1
  }
  return { sum, count }
}

/** Returns the latest day across all metric series in a ParsedExport, or null. */
export function latestDay(parsed: ParsedExport): string | null {
  const candidates: string[] = []
  for (const s of parsed.hrv) candidates.push(s.start.sourceDay)
  for (const s of parsed.rhr) candidates.push(s.start.sourceDay)
  for (const s of parsed.sleep) candidates.push(s.end.sourceDay)
  for (const s of parsed.workouts) candidates.push(s.start.sourceDay)
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (a > b ? a : b))
}
