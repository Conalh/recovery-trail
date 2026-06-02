import { describe, it, expect } from 'vitest'
import { parseRecordsFromXmlString } from '../lib/parseAppleHealth'
import {
  addDays,
  dailyHrv,
  dailyRhr,
  dailySleepHours,
  dailyWorkoutMinutes,
} from './aggregate'
import { evaluate } from './evaluate'
import type { ParsedExport } from '../lib/types'

/**
 * Golden fixtures: minimal, real-shaped Apple Health XML run end-to-end
 * (parse → aggregate → evaluate) with fixed dates, so every assertion is
 * deterministic and independent of the current date / runtime timezone.
 */

const ASOF = '2026-01-29'

// ── XML fixture builders ────────────────────────────────────────────────
function hrvXml(day: string, time: string, value: number, tz = '-0800'): string {
  return `<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Apple Watch" unit="ms" startDate="${day} ${time}:00 ${tz}" endDate="${day} ${time}:00 ${tz}" value="${value}"/>`
}
function rhrXml(day: string, time: string, value: number, tz = '-0800'): string {
  return `<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" unit="count/min" startDate="${day} ${time}:00 ${tz}" endDate="${day} ${time}:00 ${tz}" value="${value}"/>`
}
function sleepXml(
  start: string,
  end: string,
  value = 'HKCategoryValueSleepAnalysisAsleepCore',
  source = 'Apple Watch',
): string {
  return `<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="${source}" startDate="${start}" endDate="${end}" value="${value}"/>`
}
function workoutXml(
  day: string,
  durationMin: number,
  unit = 'min',
  rawDuration = durationMin,
): string {
  return `<Workout workoutActivityType="HKWorkoutActivityTypeRunning" sourceName="Watch" duration="${rawDuration}" durationUnit="${unit}" startDate="${day} 18:00:00 -0800" endDate="${day} 19:00:00 -0800"/>`
}

function build(p: Partial<ParsedExport>): ParsedExport {
  return { hrv: [], rhr: [], respRate: [], sleep: [], workouts: [], range: null, ...p }
}

// ── 1. Explicit timezone offsets ────────────────────────────────────────
describe('golden: explicit timezone offsets', () => {
  it('derives instantMs from the written offset and sourceDay from the written date', () => {
    const out = parseRecordsFromXmlString(
      hrvXml('2026-01-29', '06:00', 55, '-0800') +
        hrvXml('2026-01-29', '09:00', 56, '+0530') +
        hrvXml('2026-01-29', '06:00', 57, 'Z'),
    )
    expect(out.hrv.map((s) => s.start.sourceDay)).toEqual([
      '2026-01-29',
      '2026-01-29',
      '2026-01-29',
    ])
    expect(out.hrv.map((s) => s.start.instantMs)).toEqual([
      Date.UTC(2026, 0, 29, 14, 0, 0), // 06:00 -0800
      Date.UTC(2026, 0, 29, 3, 30, 0), // 09:00 +0530
      Date.UTC(2026, 0, 29, 6, 0, 0), // 06:00 Z
    ])
  })

  it('locks the normalized internal shape ({ start: Instant })', () => {
    const out = parseRecordsFromXmlString(hrvXml('2026-01-15', '07:42', 62))
    expect(out.hrv[0]).toEqual({
      start: { instantMs: Date.UTC(2026, 0, 15, 15, 42, 0), sourceDay: '2026-01-15' },
      valueMs: 62,
      source: 'Apple Watch',
    })
  })
})

// ── 2. Sleep edge cases ─────────────────────────────────────────────────
describe('golden: sleep edge cases', () => {
  it('attributes a midnight-crossing sleep to the wake day', () => {
    const out = parseRecordsFromXmlString(
      sleepXml('2026-01-14 23:00:00 -0800', '2026-01-15 06:00:00 -0800'),
    )
    expect(out.sleep[0].start.sourceDay).toBe('2026-01-14')
    expect(out.sleep[0].end.sourceDay).toBe('2026-01-15')
    expect(dailySleepHours(out.sleep)).toEqual([
      { day: '2026-01-15', value: 7, sampleCount: 1 },
    ])
  })

  it('computes true elapsed hours across a DST spring-forward (7h, not 8h wall-clock)', () => {
    // US DST starts 2026-03-08: 02:00 -0800 jumps to 03:00 -0700. The wall clock
    // shows 23:00 -> 07:00 (8h) but only 7h actually elapsed.
    const out = parseRecordsFromXmlString(
      sleepXml('2026-03-07 23:00:00 -0800', '2026-03-08 07:00:00 -0700'),
    )
    const daily = dailySleepHours(out.sleep)
    expect(daily).toHaveLength(1)
    expect(daily[0].day).toBe('2026-03-08')
    expect(daily[0].value).toBeCloseTo(7, 6)
  })

  it('merges overlapping intervals instead of double-counting', () => {
    // 23:00->05:00 (6h) and 01:00->06:00 (5h); union is 23:00->06:00 = 7h.
    const out = parseRecordsFromXmlString(
      sleepXml('2026-01-14 23:00:00 -0800', '2026-01-15 05:00:00 -0800') +
        sleepXml(
          '2026-01-15 01:00:00 -0800',
          '2026-01-15 06:00:00 -0800',
          'HKCategoryValueSleepAnalysisAsleepREM',
        ),
    )
    const daily = dailySleepHours(out.sleep)
    expect(daily).toHaveLength(1)
    expect(daily[0].value).toBeCloseTo(7, 6) // not 6 + 5 = 11
    expect(daily[0].sampleCount).toBe(2)
  })

  it('collapses duplicate sleep intervals from multiple sources', () => {
    // Same 7h window reported by both the watch and the phone.
    const out = parseRecordsFromXmlString(
      sleepXml('2026-01-14 23:00:00 -0800', '2026-01-15 06:00:00 -0800', undefined, 'Apple Watch') +
        sleepXml('2026-01-14 23:00:00 -0800', '2026-01-15 06:00:00 -0800', undefined, 'iPhone'),
    )
    const daily = dailySleepHours(out.sleep)
    expect(daily[0].value).toBeCloseTo(7, 6) // counted once, not 14
    expect(daily[0].sampleCount).toBe(2)
  })
})

// ── 3. Workout durationUnit variations ──────────────────────────────────
describe('golden: workout durationUnit', () => {
  it('normalizes min / s / h units and falls back to the start-end span', () => {
    const noDuration =
      '<Workout workoutActivityType="HKWorkoutActivityTypeWalking" sourceName="Watch" startDate="2026-01-20 17:00:00 -0800" endDate="2026-01-20 17:45:00 -0800"/>'
    const out = parseRecordsFromXmlString(
      workoutXml('2026-01-20', 45, 'min') +
        workoutXml('2026-01-21', 45, 's', 2700) +
        workoutXml('2026-01-22', 90, 'h', 1.5) +
        noDuration,
    )
    expect(out.workouts.map((w) => w.durationMin)).toEqual([45, 45, 90, 45])
  })
})

// ── 4. Exact daily aggregates from XML ──────────────────────────────────
describe('golden: exact daily aggregates', () => {
  it('means HRV, takes the RHR minimum, and sums workout minutes per day', () => {
    const xml = [
      hrvXml('2026-01-15', '04:00', 50),
      hrvXml('2026-01-15', '05:00', 60),
      rhrXml('2026-01-15', '04:00', 58),
      rhrXml('2026-01-15', '05:00', 52),
      workoutXml('2026-01-15', 45),
      workoutXml('2026-01-15', 30),
    ].join('')
    const out = parseRecordsFromXmlString(xml)
    expect(dailyHrv(out.hrv)).toEqual([{ day: '2026-01-15', value: 55, sampleCount: 2 }])
    expect(dailyRhr(out.rhr)).toEqual([{ day: '2026-01-15', value: 52, sampleCount: 2 }])
    expect(dailyWorkoutMinutes(out.workouts)).toEqual([
      { day: '2026-01-15', value: 75, sampleCount: 2 },
    ])
  })
})

// ── 5. Evaluator: missing-data and ACWR coverage ────────────────────────
describe('golden: evaluator missing-data guards', () => {
  it('does not fire a false HRV-below-baseline when the last 7 days lack HRV', () => {
    // Healthy 28-day HRV baseline (~60) but a gap in the last 7 days; recent RHR
    // so asOfDay still lands on today.
    const parts: string[] = []
    for (let d = 28; d >= 8; d--) parts.push(hrvXml(addDays(ASOF, -d), '04:00', 60 + (d % 2 ? 1 : -1)))
    for (let d = 6; d >= 0; d--) parts.push(rhrXml(addDays(ASOF, -d), '05:00', 55))
    const rec = evaluate(parseRecordsFromXmlString(parts.join('')))!
    expect(rec.asOfDay).toBe(ASOF)
    expect(rec.fired.find((r) => r.id === 'hrv_below_baseline')).toBeUndefined()
    expect(rec.insufficientData.hrv).toBe(true)
    expect(rec.insufficientData.rhr).toBe(false)
  })

  it('excludes missing HRV/RHR from the composite score (no phantom-perfect pollution)', () => {
    // Only sleep present (7 nights at exactly 5h). If a missing HRV drop or a
    // missing-RHR clamped-to-zero leaked in, the composite would shift.
    const sleep: string[] = []
    for (let d = 6; d >= 0; d--) {
      const day = addDays(ASOF, -d)
      const wakeDay = day
      const startDay = addDays(ASOF, -(d + 1))
      // 5h: 02:00 -> 07:00 on the wake day.
      sleep.push(sleepXml(`${startDay} 23:00:00 -0800`, `${wakeDay} 04:00:00 -0800`))
    }
    const rec = evaluate(parseRecordsFromXmlString(sleep.join('')))!
    expect(rec.insufficientData).toEqual({ hrv: true, rhr: true })
    // bandScore(2h below the 7h floor) == 20; composite is sleep-only.
    expect(rec.recoveryScore).toBe(20)
  })
})

describe('golden: load-ramp coverage', () => {
  it('does not fire a load ramp when the prior baseline is empty (all workouts in the acute week)', () => {
    // 28 days of calendar coverage (an HRV reading 28 days back) but every
    // workout sits in the acute week, so the prior 3-week baseline is empty.
    const xml = [
      hrvXml(addDays(ASOF, -28), '04:00', 55),
      workoutXml(addDays(ASOF, -0), 120),
      workoutXml(addDays(ASOF, -2), 120),
      workoutXml(addDays(ASOF, -4), 120),
    ].join('')
    const rec = evaluate(parseRecordsFromXmlString(xml))!
    expect(rec.fired.find((r) => r.id.startsWith('load_'))).toBeUndefined()
  })

  it('fires a load ramp for a 3x/week athlete with full coverage and an acute spike', () => {
    const xml = [
      ...[27, 25, 23, 20, 18, 16, 13, 11, 9].map((d) => workoutXml(addDays(ASOF, -d), 60)),
      ...[6, 4, 2, 0].map((d) => workoutXml(addDays(ASOF, -d), 90)),
    ].join('')
    const rec = evaluate(parseRecordsFromXmlString(xml))!
    expect(
      rec.fired.find((r) => r.id === 'load_ramp' || r.id === 'load_spike'),
    ).toBeDefined()
  })

  it('does not fire a load ramp when calendar coverage is under the chronic window', () => {
    const xml = [0, 2, 4, 6, 8].map((d) => workoutXml(addDays(ASOF, -d), 90)).join('')
    const rec = evaluate(parseRecordsFromXmlString(xml))!
    expect(rec.fired.find((r) => r.id.startsWith('load_'))).toBeUndefined()
  })

  it('reports an empty export as no recommendation', () => {
    expect(evaluate(build({}))).toBeNull()
  })
})
