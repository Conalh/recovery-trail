/**
 * Sleep Regularity Index (SRI) — how consistent the timing of sleep is from one
 * day to the next, independent of how *much* sleep was logged. From AthDash's
 * Tier-1 signal catalog: SRI carries health/recovery signal that total sleep
 * duration misses (it out-predicts duration for all-cause mortality in UK
 * Biobank), and it's gated on the within-person trend, never a population cutoff.
 *
 * Definition (Phillips et al. 2017): the probability that an athlete is in the
 * same state (asleep vs awake) at any two time points exactly 24 h apart,
 * rescaled to −100…+100. +100 = identical sleep/wake pattern every day; 0 =
 * no better than chance. We compute it over clock-time epochs, so it measures
 * *timing* regularity, not "wake day" bucketing.
 *
 * Implementation: each calendar day (UTC) gets an asleep mask over fixed clock
 * epochs. SRI over a window is the mean agreement of every calendar-adjacent
 * day pair across all epochs. We surface a ROLLING SRI per day (trailing
 * window) so it slots into the same baseline/trend engine as the other metrics
 * — higher is better.
 */

import type { SleepSample } from '../lib/types'
import { addDays, type DailyMetric } from './aggregate'

const EPOCH_MIN = 5
const EPOCH_MS = EPOCH_MIN * 60_000
/** 288 five-minute epochs tile a UTC day exactly (Unix day boundaries align to 00:00 UTC). */
const EPOCHS_PER_DAY = (24 * 60) / EPOCH_MIN

function isoFromDayIndex(dayIndex: number): string {
  const dt = new Date(dayIndex * 86_400_000)
  const y = dt.getUTCFullYear()
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const d = String(dt.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Per-calendar-day (UTC) asleep mask over EPOCHS_PER_DAY clock epochs. An epoch
 * is marked asleep when any `asleep*` interval overlaps it; intervals that cross
 * midnight contribute to both days. inBed / awake stages are ignored.
 */
export function buildSleepMasks(sleep: ReadonlyArray<SleepSample>): Map<string, Uint8Array> {
  const masks = new Map<string, Uint8Array>()
  for (const s of sleep) {
    if (!s.stage.startsWith('asleep')) continue
    const startMs = s.start.instantMs
    const endMs = s.end.instantMs
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) continue
    const gStart = Math.floor(startMs / EPOCH_MS)
    const gEnd = Math.floor((endMs - 1) / EPOCH_MS)
    for (let g = gStart; g <= gEnd; g++) {
      const dayIndex = Math.floor(g / EPOCHS_PER_DAY)
      const epoch = g - dayIndex * EPOCHS_PER_DAY
      const dayIso = isoFromDayIndex(dayIndex)
      let mask = masks.get(dayIso)
      if (!mask) {
        mask = new Uint8Array(EPOCHS_PER_DAY)
        masks.set(dayIso, mask)
      }
      mask[epoch] = 1
    }
  }
  return masks
}

/**
 * SRI (−100…+100) over the window [end − windowDays + 1, end]. Pairs only
 * calendar-adjacent days that BOTH have a mask, so a missing night drops that
 * pair rather than counting as a whole irregular day. Returns null when fewer
 * than `minPairs` such pairs exist.
 */
export function sriForWindow(
  masks: Map<string, Uint8Array>,
  end: string,
  windowDays: number,
  minPairs: number,
): number | null {
  let agree = 0
  let total = 0
  let pairs = 0
  for (let back = windowDays - 1; back >= 1; back--) {
    const a = masks.get(addDays(end, -back))
    const b = masks.get(addDays(end, -(back - 1)))
    if (!a || !b) continue
    pairs++
    for (let e = 0; e < EPOCHS_PER_DAY; e++) {
      if (a[e] === b[e]) agree++
      total++
    }
  }
  if (pairs < minPairs || total === 0) return null
  return 200 * (agree / total) - 100
}

/**
 * Rolling SRI per day, oldest-first, for the `lookbackDays` days ending `asOf`.
 * Each day's value is SRI over the trailing `rollingWindowDays`. Days without
 * enough adjacent-night coverage are omitted (like the EWMA ramp-up), so the
 * baseline/trend windows simply see fewer points there.
 */
export function dailySri(
  sleep: ReadonlyArray<SleepSample>,
  asOf: string,
  rollingWindowDays: number,
  minPairs: number,
  lookbackDays: number,
): DailyMetric[] {
  const masks = buildSleepMasks(sleep)
  if (masks.size === 0) return []
  const out: DailyMetric[] = []
  for (let back = lookbackDays; back >= 0; back--) {
    const day = addDays(asOf, -back)
    const sri = sriForWindow(masks, day, rollingWindowDays, minPairs)
    if (sri === null) continue
    out.push({ day, value: sri, sampleCount: 1 })
  }
  return out
}
