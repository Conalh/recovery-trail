import { describe, it, expect } from 'vitest'
import {
  ACUTE_THRESHOLDS,
  combineAcuteChronic,
  compositeRecoveryScore,
  computeEwmaSlope,
  computeOlsSlope,
  detectTrend,
  populationStdDev,
  slopeSeverity,
} from './trend'
import { addDays } from './aggregate'

const ASOF = '2026-01-29'

/** Build a {day,value}[] from [daysBeforeAsOf, value] pairs, oldest-first. */
function series(points: Array<[number, number]>): { day: string; value: number }[] {
  return points
    .map(([back, value]) => ({ day: addDays(ASOF, -back), value }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
}

describe('computeOlsSlope', () => {
  it('uses real day offsets, not array index, for the per-day slope', () => {
    const values = [10, 12, 14, 16]
    const dense = computeOlsSlope([0, 1, 2, 3], values, 7)
    const gappy = computeOlsSlope([0, 2, 4, 6], values, 7)
    // Same values, twice the day-spacing → half the per-day slope. The old
    // index-based code reported 2/day for both, masking the gap.
    expect(dense?.slopePerDay).toBeCloseTo(2, 6)
    expect(gappy?.slopePerDay).toBeCloseTo(1, 6)
  })

  it('returns null below MIN_SAMPLES', () => {
    expect(computeOlsSlope([0, 1, 2], [1, 2, 3], 7)).toBeNull()
  })

  it('returns null when the x-axis has zero variance', () => {
    expect(computeOlsSlope([3, 3, 3, 3], [1, 2, 3, 4], 7)).toBeNull()
  })
})

describe('computeEwmaSlope', () => {
  it('ramps confidence to 0 below EWMA_MIN_SAMPLES', () => {
    const r = computeEwmaSlope([0, 1, 2, 3, 4], [5, 4, 3, 2, 1], 28)
    expect(r?.confidenceWeight).toBe(0)
  })

  it('reaches full confidence at a full window', () => {
    const daysX = Array.from({ length: 28 }, (_, i) => i)
    const vals = daysX.map((d) => 50 - d)
    expect(computeEwmaSlope(daysX, vals, 28)?.confidenceWeight).toBe(1)
  })
})

describe('slopeSeverity', () => {
  it('buckets a signed-bad SD/day magnitude by the acute thresholds', () => {
    expect(slopeSeverity(0.25, ACUTE_THRESHOLDS)).toBe('severe')
    expect(slopeSeverity(0.12, ACUTE_THRESHOLDS)).toBe('moderate')
    expect(slopeSeverity(0.06, ACUTE_THRESHOLDS)).toBe('mild')
    expect(slopeSeverity(0.01, ACUTE_THRESHOLDS)).toBeNull()
  })

  it('returns null for the good direction (negative bad-slope)', () => {
    expect(slopeSeverity(-0.5, ACUTE_THRESHOLDS)).toBeNull()
  })
})

describe('combineAcuteChronic', () => {
  it('demotes an acute-only signal by one band', () => {
    expect(combineAcuteChronic('moderate', null)).toBe('mild')
    expect(combineAcuteChronic('mild', null)).toBeNull()
  })

  it('promotes acute one band when chronic is stronger', () => {
    expect(combineAcuteChronic('mild', 'severe')).toBe('moderate')
  })

  it('surfaces a chronic-only signal only when severe', () => {
    expect(combineAcuteChronic(null, 'severe')).toBe('mild')
    expect(combineAcuteChronic(null, 'moderate')).toBeNull()
  })

  it('trusts acute when chronic confirms at an equal-or-lower tier', () => {
    expect(combineAcuteChronic('severe', 'mild')).toBe('severe')
  })

  it('returns null when both windows are silent', () => {
    expect(combineAcuteChronic(null, null)).toBeNull()
  })
})

describe('compositeRecoveryScore', () => {
  it('scores perfect markers at 100', () => {
    expect(compositeRecoveryScore({ hrvDropSd: 0, rhrRiseBpm: 0, sleepHoursAcute: 8 })).toBe(100)
  })

  it('returns null with no markers', () => {
    expect(compositeRecoveryScore({})).toBeNull()
  })

  it('drops as markers worsen', () => {
    const good = compositeRecoveryScore({ hrvDropSd: 0 })!
    const bad = compositeRecoveryScore({ hrvDropSd: 3 })!
    expect(bad).toBeLessThan(good)
  })
})

describe('populationStdDev', () => {
  it('matches the population (ddof=0) formula', () => {
    expect(populationStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 6)
  })

  it('returns null below two samples', () => {
    expect(populationStdDev([1])).toBeNull()
  })
})

describe('detectTrend — date-window regression', () => {
  const sd = 5

  it('selects windows by date, so far-past readings cannot change the verdict', () => {
    const recent: Array<[number, number]> = [
      [4, 60],
      [3, 57],
      [2, 54],
      [1, 51],
      [0, 48],
    ]
    const farPast = Array.from({ length: 10 }, (_, i) => [31 + i, 60] as [number, number])
    const a = detectTrend(series(recent), ASOF, sd, true)
    const b = detectTrend(series([...recent, ...farPast]), ASOF, sd, true)
    // Old slice(-7) pulled the tail of the far-past cluster into the acute
    // window; date-windowing excludes it, so a and b must be identical.
    expect(b).toEqual(a)
    expect(a.combined).not.toBeNull()
  })

  it('does not inflate the per-day slope when days are missing', () => {
    const tight = detectTrend(series([[3, 60], [2, 57], [1, 54], [0, 51]]), ASOF, sd, true)
    const spread = detectTrend(series([[6, 60], [4, 57], [2, 54], [0, 51]]), ASOF, sd, true)
    // Identical values; the spread series covers twice the days, so its
    // per-day slope must be gentler. The old code reported them equal.
    expect(Math.abs(spread.acuteSdPerDay!)).toBeLessThan(Math.abs(tight.acuteSdPerDay!))
  })

  it('returns empty when baseline SD is missing', () => {
    const r = detectTrend(series([[2, 1], [1, 2], [0, 3]]), ASOF, null, true)
    expect(r.combined).toBeNull()
    expect(r.windowsFired).toBeNull()
  })
})
