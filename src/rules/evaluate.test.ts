import { describe, it, expect } from 'vitest'
import { evaluate } from './evaluate'
import { addDays } from './aggregate'
import type { Instant } from '../lib/appleHealthDate'
import type {
  HrvSample,
  ParsedExport,
  RespRateSample,
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
function resp(daysBack: number, valueBrpm: number): RespRateSample {
  return { start: inst(daysBack, 3), valueBrpm, source: 't' }
}
function sleepNight(daysBack: number, hours: number): SleepSample {
  const wake = inst(daysBack, 7)
  return {
    start: { instantMs: wake.instantMs - hours * 3_600_000, sourceDay: wake.sourceDay },
    end: wake,
    stage: 'asleepCore',
    source: 't',
  }
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
  return { hrv: [], rhr: [], respRate: [], sleep: [], workouts: [], range: null, ...p }
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

describe('evaluate — load ramp (uncoupled week-over-week)', () => {
  it('fires for a 3x/week athlete with full history and an acute spike', () => {
    const workouts: WorkoutSample[] = []
    // Prior 3 weeks, 3 sessions/week, 60 min: 9 workout days, 540 min → 180 min/week.
    for (const d of [27, 25, 23, 20, 18, 16, 13, 11, 9]) workouts.push(workout(d, 60))
    // Acute week: 4 × 90 = 360 min → +100% over the prior weekly average.
    for (const d of [6, 4, 2, 0]) workouts.push(workout(d, 90))
    const rec = evaluate(build({ workouts, range: rangeFrom(30) }))!
    expect(rec.fired.find((r) => r.id === 'load_ramp' || r.id === 'load_spike')).toBeDefined()
  })

  it('fires a caution-level ramp (not deload) for a moderate increase', () => {
    const workouts: WorkoutSample[] = []
    // Prior 3 weeks: 540 min → 180 min/week.
    for (const d of [27, 25, 23, 20, 18, 16, 13, 11, 9]) workouts.push(workout(d, 60))
    // Acute week: 3 × 90 = 270 min → +50% over prior (caution band, below deload).
    for (const d of [6, 4, 2]) workouts.push(workout(d, 90))
    const rec = evaluate(build({ workouts, range: rangeFrom(30) }))!
    const load = rec.fired.find((r) => r.id.startsWith('load_'))
    expect(load?.id).toBe('load_ramp')
    expect(load?.severity).toBe('caution')
  })

  it('does not fire when calendar coverage is below the chronic window', () => {
    const workouts = [0, 2, 4, 6, 8].map((d) => workout(d, 90))
    const rec = evaluate(build({ workouts, range: rangeFrom(10) }))!
    expect(rec.fired.find((r) => r.id.startsWith('load_'))).toBeUndefined()
  })

  it('does not fire when the prior baseline is too thin to judge a spike', () => {
    // Every workout lands in the acute week, so the prior 3 weeks are empty —
    // a percentage ramp would be meaningless and the rule must stay silent.
    const workouts = [0, 2, 4].map((d) => workout(d, 90))
    const rec = evaluate(build({ workouts, range: rangeFrom(30) }))!
    expect(rec.fired.find((r) => r.id.startsWith('load_'))).toBeUndefined()
  })

  it('returns a deload verdict for a severe acute spike', () => {
    const workouts: WorkoutSample[] = []
    for (const d of [27, 25, 23, 20, 18, 16, 13, 11, 9]) workouts.push(workout(d, 60))
    // Acute week: 4 × 130 = 520 min → +189% → load_spike (deload).
    for (const d of [6, 4, 2, 0]) workouts.push(workout(d, 130))
    const rec = evaluate(build({ workouts, range: rangeFrom(30) }))!
    expect(rec.fired.find((r) => r.id === 'load_spike')).toBeDefined()
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

describe('evaluate — overnight respiratory rate', () => {
  it('fires resp-above-baseline when the recent overnight rate is elevated', () => {
    const respRate: RespRateSample[] = []
    // 28-day baseline ~14 brpm (days 27..7), recent week ~18 brpm (+3 over the
    // 15 brpm window baseline → at the caution gate).
    for (let d = 27; d >= 7; d--) respRate.push(resp(d, 14))
    for (let d = 6; d >= 0; d--) respRate.push(resp(d, 18))
    const rec = evaluate(build({ respRate }))!
    expect(rec.fired.find((r) => r.id === 'resp_above_baseline')).toBeDefined()
  })

  it('stays quiet when overnight respiratory rate holds at baseline', () => {
    const respRate: RespRateSample[] = []
    for (let d = 27; d >= 0; d--) respRate.push(resp(d, 14 + (d % 2 ? 0.3 : -0.3)))
    const rec = evaluate(build({ respRate }))!
    expect(rec.fired.find((r) => r.id === 'resp_above_baseline')).toBeUndefined()
  })
})

describe('evaluate — sleep regularity (SRI)', () => {
  it('computes a rolling SRI series and baseline from sleep timing', () => {
    const sleep: SleepSample[] = []
    for (let d = 20; d >= 0; d--) sleep.push(sleepNight(d, 8)) // regular 8h nights, wake 07:00
    const rec = evaluate(build({ sleep }))!
    expect(rec.series.sri.length).toBeGreaterThan(0)
    expect(rec.baselines.sri).not.toBeNull()
    // A perfectly regular sleeper should not trip the regularity trend.
    expect(rec.fired.find((r) => r.id === 'sri_trend')).toBeUndefined()
  })
})
