import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { addDays } from './aggregate'
import type { Instant } from '../lib/appleHealthDate'
import type {
  HrvSample,
  ParsedExport,
  RhrSample,
  SleepSample,
  WorkoutSample,
} from '../lib/types'

const ASOF = '2026-01-29'

function inst(daysBack: number, hour = 12): Instant {
  const day = addDays(ASOF, -daysBack)
  const [y, m, d] = day.split('-').map(Number)
  return { instantMs: Date.UTC(y, m - 1, d, hour), sourceDay: day }
}
function hrv(daysBack: number, valueMs: number): HrvSample {
  return { start: inst(daysBack, 4), valueMs, source: 't' }
}
function rhr(daysBack: number, valueBpm: number): RhrSample {
  return { start: inst(daysBack, 5), valueBpm, source: 't' }
}
function workout(daysBack: number, durationMin: number): WorkoutSample {
  const start = inst(daysBack, 18)
  return {
    start,
    end: { instantMs: start.instantMs + durationMin * 60_000, sourceDay: start.sourceDay },
    activity: 'running',
    durationMin,
    source: 't',
  }
}
function build(p: Partial<ParsedExport>): ParsedExport {
  return { hrv: [], rhr: [], sleep: [], workouts: [], range: null, ...p }
}
function rangeFrom(daysBack: number): { startMs: number; endMs: number } {
  const day = addDays(ASOF, -daysBack)
  const [y, m, d] = day.split('-').map(Number)
  return { startMs: Date.UTC(y, m - 1, d), endMs: Date.UTC(2026, 0, 29) }
}

describe('evaluate — missing recent data', () => {
  it('does not fire a false HRV-below-baseline when the last 7 days have no HRV', () => {
    // Healthy 28-day baseline (~60ms) but a gap: no readings in the last 7 days.
    const hrvSamples: HrvSample[] = []
    for (let d = 28; d >= 8; d--) hrvSamples.push(hrv(d, 60 + (d % 2 ? 1 : -1)))
    // Recent RHR so asOfDay lands on today.
    const rhrSamples: RhrSample[] = []
    for (let d = 6; d >= 0; d--) rhrSamples.push(rhr(d, 55))

    const rec = evaluate(build({ hrv: hrvSamples, rhr: rhrSamples }))!
    expect(rec.asOfDay).toBe(ASOF)
    expect(rec.fired.find((r) => r.id === 'hrv_below_baseline')).toBeUndefined()
    expect(rec.insufficientData.hrv).toBe(true)
    expect(rec.insufficientData.rhr).toBe(false)
  })
})

describe('evaluate — ACWR calendar-coverage gate', () => {
  it('fires for a 3x/week athlete with full history and an acute spike', () => {
    const workouts: WorkoutSample[] = []
    // 3 prior weeks, 3 sessions/week, 60 min: 9 distinct workout days (would fail the old >=14 gate).
    for (const d of [27, 25, 23, 20, 18, 16, 13, 11, 9]) workouts.push(workout(d, 60))
    // Acute week: 4 sessions of 90 min.
    for (const d of [6, 4, 2, 0]) workouts.push(workout(d, 90))
    const rec = evaluate(build({ workouts, range: rangeFrom(30) }))!
    expect(rec.fired.find((r) => r.id === 'acwr_high' || r.id === 'acwr_very_high')).toBeDefined()
  })

  it('does not fire when calendar coverage is below the chronic window', () => {
    const workouts = [0, 2, 4, 6, 8].map((d) => workout(d, 90))
    const rec = evaluate(build({ workouts, range: rangeFrom(10) }))!
    expect(rec.fired.find((r) => r.id.startsWith('acwr'))).toBeUndefined()
  })

  it('does not fire below the minimum chronic workout-day floor', () => {
    const workouts = [0, 2, 4].map((d) => workout(d, 90)) // only 3 workout days
    const rec = evaluate(build({ workouts, range: rangeFrom(30) }))!
    expect(rec.fired.find((r) => r.id.startsWith('acwr'))).toBeUndefined()
  })

  it('returns a deload verdict for a severe acute spike', () => {
    const workouts: WorkoutSample[] = []
    for (const d of [27, 25, 23, 20, 18, 16, 13, 11, 9]) workouts.push(workout(d, 60))
    for (const d of [6, 4, 2, 0]) workouts.push(workout(d, 130))
    const rec = evaluate(build({ workouts, range: rangeFrom(30) }))!
    expect(rec.fired.find((r) => r.id === 'acwr_very_high')).toBeDefined()
    expect(rec.verdict).toBe('deload')
  })
})

describe('evaluate — baselines and edge cases', () => {
  it('exposes date-window baselines keyed by metric, null where there is no data', () => {
    const rhrSamples: RhrSample[] = []
    for (let d = 27; d >= 0; d--) rhrSamples.push(rhr(d, 50))
    const rec = evaluate(build({ rhr: rhrSamples }))!
    expect(rec.baselines.rhr).toBe(50)
    expect(rec.baselines.hrv).toBeNull()
  })

  it('returns null for an empty export', () => {
    expect(evaluate(build({}))).toBeNull()
  })
})

describe('evaluate — sleep overcounting regression', () => {
  it('does not flag a sleep deficit when overlapping intervals actually sum to enough sleep', () => {
    // Each night logged as two overlapping ~7h intervals (e.g. aggregate + stage records).
    // Naive summing would read ~14h (no deficit either) — but more importantly the merged
    // total must reflect real sleep, here ~7.5h, so no deficit fires.
    const sleep: SleepSample[] = []
    for (let d = 6; d >= 0; d--) {
      const wake = inst(d, 7)
      const a: SleepSample = {
        start: { instantMs: wake.instantMs - 7.5 * 3_600_000, sourceDay: wake.sourceDay },
        end: wake,
        stage: 'asleepCore',
        source: 'watch',
      }
      const b: SleepSample = {
        start: { instantMs: wake.instantMs - 7.0 * 3_600_000, sourceDay: wake.sourceDay },
        end: { instantMs: wake.instantMs - 0.5 * 3_600_000, sourceDay: wake.sourceDay },
        stage: 'asleepREM',
        source: 'phone',
      }
      sleep.push(a, b)
    }
    const rec = evaluate(build({ sleep }))!
    expect(rec.fired.find((r) => r.id === 'sleep_deficit')).toBeUndefined()
  })
})
