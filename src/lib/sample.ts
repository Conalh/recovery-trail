import type { ParsedExport } from './types'

/**
 * Deterministic synthetic Apple Health export — 30 days ending today,
 * shaped to land in the "caution" verdict so the dashboard demonstrates
 * a fired rule without contriving an injury.
 */
export function sampleParsedExport(today: Date = new Date()): ParsedExport {
  const out: ParsedExport = { hrv: [], rhr: [], sleep: [], workouts: [], range: null }
  const rng = mulberry32(0x5eed_1234)
  const startDays = 30

  for (let d = startDays; d >= 0; d--) {
    const date = addDays(today, -d)
    const isRecentWeek = d < 7

    // HRV: baseline ~55ms, recent week dipping to ~48ms.
    const hrvBase = 55
    const hrvNoise = (rng() - 0.5) * 8
    const hrvDip = isRecentWeek ? -7 : 0
    const hrvValue = Math.max(20, hrvBase + hrvDip + hrvNoise)
    out.hrv.push({
      startDate: atHour(date, 4).toISOString(),
      valueMs: round1(hrvValue),
      source: 'Apple Watch',
    })

    // RHR: baseline 56bpm, recent week creeping up to 60bpm.
    const rhrBase = 56
    const rhrNoise = (rng() - 0.5) * 3
    const rhrUp = isRecentWeek ? 4 : 0
    out.rhr.push({
      startDate: atHour(date, 5).toISOString(),
      valueBpm: Math.round(rhrBase + rhrUp + rhrNoise),
      source: 'Apple Watch',
    })

    // Sleep: 7-8h normally, 5.5-6h in recent week.
    const sleepHours = isRecentWeek ? 5.5 + rng() * 0.5 : 7 + rng() * 1
    const sleepEnd = atHour(date, 7)
    const sleepStart = new Date(sleepEnd.getTime() - sleepHours * 3_600_000)
    out.sleep.push({
      startDate: sleepStart.toISOString(),
      endDate: sleepEnd.toISOString(),
      stage: 'asleepUnspecified',
      source: 'Apple Watch',
    })

    // Workouts: 4x/week, 45min, with one 75min long session.
    if (d % 2 === 0) {
      const dur = d % 6 === 0 ? 75 : 45
      const start = atHour(date, 18)
      const end = new Date(start.getTime() + dur * 60_000)
      out.workouts.push({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        activity: 'running',
        durationMin: dur,
        source: 'Apple Watch',
      })
    }
  }

  out.range = { start: out.hrv[0].startDate, end: out.hrv.at(-1)!.startDate }
  return out
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

function atHour(d: Date, h: number): Date {
  const c = new Date(d)
  c.setHours(h, 0, 0, 0)
  return c
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** Tiny seeded RNG so the sample renders identically every load. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b_79f5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
