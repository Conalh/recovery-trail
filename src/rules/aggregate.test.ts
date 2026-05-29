import { describe, it, expect } from 'vitest'
import {
  addDays,
  baselineMean,
  dailyHrv,
  dailyRhr,
  dailySleepHours,
  dailyWorkoutMinutes,
  diffDays,
  latestDay,
  windowMean,
  type DailyMetric,
} from './aggregate'
import type { Instant } from '../lib/appleHealthDate'
import type {
  HrvSample,
  ParsedExport,
  RhrSample,
  SleepSample,
  WorkoutSample,
} from '../lib/types'

const ASOF = '2026-01-29'

function inst(day: string, hour = 0, min = 0): Instant {
  const [y, m, d] = day.split('-').map(Number)
  return { instantMs: Date.UTC(y, m - 1, d, hour, min), sourceDay: day }
}
function at(ms: number, day: string): Instant {
  return { instantMs: ms, sourceDay: day }
}

describe('addDays / diffDays', () => {
  it('does UTC date arithmetic across month boundaries', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('returns whole-day differences', () => {
    expect(diffDays('2026-02-01', '2026-01-29')).toBe(3)
    expect(diffDays('2026-01-29', '2026-01-29')).toBe(0)
  })
})

describe('daily aggregators', () => {
  it('means HRV per day, takes the RHR minimum, sums workout minutes', () => {
    const hrv: HrvSample[] = [
      { start: inst('2026-01-15', 4), valueMs: 50, source: 't' },
      { start: inst('2026-01-15', 5), valueMs: 60, source: 't' },
    ]
    expect(dailyHrv(hrv)).toEqual([{ day: '2026-01-15', value: 55, sampleCount: 2 }])

    const rhr: RhrSample[] = [
      { start: inst('2026-01-15', 4), valueBpm: 60, source: 't' },
      { start: inst('2026-01-15', 5), valueBpm: 52, source: 't' },
    ]
    expect(dailyRhr(rhr)[0].value).toBe(52)

    const workouts: WorkoutSample[] = [
      { start: inst('2026-01-15', 18), end: inst('2026-01-15', 19), activity: 'run', durationMin: 45, source: 't' },
      { start: inst('2026-01-15', 20), end: inst('2026-01-15', 21), activity: 'run', durationMin: 30, source: 't' },
    ]
    expect(dailyWorkoutMinutes(workouts)[0].value).toBe(75)
  })

  it('merges overlapping sleep intervals instead of double-counting', () => {
    // 23:00->05:00 (6h) and 01:00->06:00 (5h), overlapping 01:00-05:00. Union is 7h.
    const sleep: SleepSample[] = [
      { start: at(Date.UTC(2026, 0, 14, 23, 0), '2026-01-15'), end: at(Date.UTC(2026, 0, 15, 5, 0), '2026-01-15'), stage: 'asleepCore', source: 'a' },
      { start: at(Date.UTC(2026, 0, 15, 1, 0), '2026-01-15'), end: at(Date.UTC(2026, 0, 15, 6, 0), '2026-01-15'), stage: 'asleepREM', source: 'b' },
    ]
    const out = dailySleepHours(sleep)
    expect(out).toHaveLength(1)
    expect(out[0].day).toBe('2026-01-15')
    expect(out[0].value).toBeCloseTo(7, 5) // not 6 + 5 = 11
  })
})

describe('windowMean / baselineMean', () => {
  it('includes [end-windowDays+1, end] and excludes the day exactly windowDays back', () => {
    const series: DailyMetric[] = [
      { day: addDays(ASOF, -7), value: 1, sampleCount: 1 },
      { day: addDays(ASOF, -6), value: 2, sampleCount: 1 },
      { day: ASOF, value: 4, sampleCount: 1 },
    ]
    const r = windowMean(series, ASOF, 7)
    expect(r.count).toBe(2) // -6 and 0; -7 is excluded (gap 7 >= 7)
    expect(r.mean).toBe(3)
  })

  it('is a date-window mean, diverging from last-28-samples on sparse data', () => {
    const series: DailyMetric[] = []
    for (let d = 54; d >= 30; d--) series.push({ day: addDays(ASOF, -d), value: 100, sampleCount: 1 })
    for (let d = 4; d >= 0; d--) series.push({ day: addDays(ASOF, -d), value: 50, sampleCount: 1 })
    // Only the 5 recent days fall inside a 28-calendar-day window.
    expect(baselineMean(series, ASOF, 28)).toBe(50)
    expect(windowMean(series, ASOF, 28).mean).toBe(50)
    const naiveLast28 = series.slice(-28).reduce((a, b) => a + b.value, 0) / 28
    expect(naiveLast28).not.toBe(50) // the old UI definition would have disagreed
  })

  it('returns null when the window holds no readings', () => {
    expect(baselineMean([], ASOF, 28)).toBeNull()
    expect(baselineMean([{ day: addDays(ASOF, -40), value: 5, sampleCount: 1 }], ASOF, 28)).toBeNull()
  })
})

describe('latestDay', () => {
  it('takes the max calendar day across all series, including sleep wake days', () => {
    const parsed: ParsedExport = {
      hrv: [{ start: inst('2026-01-20', 4), valueMs: 50, source: 't' }],
      rhr: [],
      sleep: [
        { start: at(Date.UTC(2026, 0, 21, 23, 0), '2026-01-21'), end: at(Date.UTC(2026, 0, 22, 6, 0), '2026-01-22'), stage: 'asleepCore', source: 't' },
      ],
      workouts: [],
      range: null,
    }
    expect(latestDay(parsed)).toBe('2026-01-22')
  })
})
