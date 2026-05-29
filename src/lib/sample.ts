import type { ParsedExport } from './types'
import { instantFromEpoch } from './appleHealthDate'

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
    // Within the recent week, linearly progress from baseline (day 6 ago)
    // to fully degraded (today). This gives the engine v2 trend detectors
    // a clean linear slope to fire on, instead of a noisy step.
    const recentProgress = isRecentWeek ? (6 - d) / 6 : 0

    // HRV: baseline ~55ms, linearly declining to ~46ms across recent week.
    const hrvBase = 55
    const hrvNoise = (rng() - 0.5) * 2.5
    const hrvDip = -9 * recentProgress
    const hrvValue = Math.max(20, hrvBase + hrvDip + hrvNoise)
    out.hrv.push({
      start: instantFromEpoch(atHour(date, 4).getTime()),
      valueMs: round1(hrvValue),
      source: 'Apple Watch',
    })

    // RHR: baseline 56bpm, linearly climbing to ~62bpm across recent week.
    const rhrBase = 56
    const rhrNoise = (rng() - 0.5) * 1.5
    const rhrUp = 6 * recentProgress
    out.rhr.push({
      start: instantFromEpoch(atHour(date, 5).getTime()),
      valueBpm: Math.round(rhrBase + rhrUp + rhrNoise),
      source: 'Apple Watch',
    })

    // Sleep: 7.5h normally, linearly declining to ~5.5h across recent week.
    const sleepNoise = (rng() - 0.5) * 0.4
    const sleepHours = isRecentWeek
      ? 7.5 - 2.0 * recentProgress + sleepNoise
      : 7.4 + rng() * 0.6
    const sleepEnd = atHour(date, 7)
    const sleepStart = new Date(sleepEnd.getTime() - sleepHours * 3_600_000)
    out.sleep.push({
      start: instantFromEpoch(sleepStart.getTime()),
      end: instantFromEpoch(sleepEnd.getTime()),
      stage: 'asleepUnspecified',
      source: 'Apple Watch',
    })

    // Workouts: 4x/week, 45min, with one 75min long session.
    if (d % 2 === 0) {
      const dur = d % 6 === 0 ? 75 : 45
      const start = atHour(date, 18)
      const end = new Date(start.getTime() + dur * 60_000)
      out.workouts.push({
        start: instantFromEpoch(start.getTime()),
        end: instantFromEpoch(end.getTime()),
        activity: 'running',
        durationMin: dur,
        source: 'Apple Watch',
      })
    }
  }

  out.range = {
    startMs: out.hrv[0].start.instantMs,
    endMs: out.hrv.at(-1)!.start.instantMs,
  }
  return out
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setUTCDate(c.getUTCDate() + n)
  return c
}

function atHour(d: Date, h: number): Date {
  const c = new Date(d)
  c.setUTCHours(h, 0, 0, 0)
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
