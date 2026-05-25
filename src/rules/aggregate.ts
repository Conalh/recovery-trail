import type { HrvSample, ParsedExport, RhrSample, SleepSample, WorkoutSample } from '../lib/types'

/** Return the calendar-day ISO date (YYYY-MM-DD) of an ISO timestamp in local time. */
export function dayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(dayIso: string, n: number): string {
  const d = new Date(dayIso + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return dayKey(d.toISOString())
}

export function diffDays(later: string, earlier: string): number {
  const a = new Date(later + 'T00:00:00').getTime()
  const b = new Date(earlier + 'T00:00:00').getTime()
  return Math.round((a - b) / 86_400_000)
}

export type DailyMetric = { day: string; value: number; sampleCount: number }

/** Mean of valueMs per calendar day. */
export function dailyHrv(samples: HrvSample[]): DailyMetric[] {
  return reduceByDay(
    samples.map((s) => ({ day: dayKey(s.startDate), value: s.valueMs })),
    'mean',
  )
}

/** Minimum BPM per calendar day (Apple records many resting-HR samples; the minimum is the most resting). */
export function dailyRhr(samples: RhrSample[]): DailyMetric[] {
  return reduceByDay(
    samples.map((s) => ({ day: dayKey(s.startDate), value: s.valueBpm })),
    'min',
  )
}

/**
 * Sum of asleep durations (hours) per "wake day" — sleep that ends on day D
 * is counted toward day D's recovery picture. Excludes inBed / awake stages.
 */
export function dailySleepHours(samples: SleepSample[]): DailyMetric[] {
  const asleep = samples.filter((s) => s.stage.startsWith('asleep'))
  const perDay = new Map<string, { value: number; sampleCount: number }>()
  for (const s of asleep) {
    const day = dayKey(s.endDate)
    if (!day) continue
    const start = Date.parse(s.startDate)
    const end = Date.parse(s.endDate)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const hours = (end - start) / 3_600_000
    const cur = perDay.get(day) ?? { value: 0, sampleCount: 0 }
    cur.value += hours
    cur.sampleCount += 1
    perDay.set(day, cur)
  }
  return Array.from(perDay.entries())
    .map(([day, v]) => ({ day, value: v.value, sampleCount: v.sampleCount }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
}

/** Sum of workout durations (minutes) per calendar day. */
export function dailyWorkoutMinutes(samples: WorkoutSample[]): DailyMetric[] {
  return reduceByDay(
    samples.map((s) => ({ day: dayKey(s.startDate), value: s.durationMin })),
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
    let v = 0
    if (mode === 'mean') v = values.reduce((a, b) => a + b, 0) / values.length
    else if (mode === 'min') v = Math.min(...values)
    else v = values.reduce((a, b) => a + b, 0)
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
  for (const s of parsed.hrv) candidates.push(dayKey(s.startDate))
  for (const s of parsed.rhr) candidates.push(dayKey(s.startDate))
  for (const s of parsed.sleep) candidates.push(dayKey(s.endDate))
  for (const s of parsed.workouts) candidates.push(dayKey(s.startDate))
  if (candidates.length === 0) return null
  return candidates.reduce((a, b) => (a > b ? a : b))
}
