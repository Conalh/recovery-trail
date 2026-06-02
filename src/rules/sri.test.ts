import { describe, it, expect } from 'vitest'
import { buildSleepMasks, sriForWindow, dailySri } from './sri'
import { addDays } from './aggregate'
import type { SleepSample } from '../lib/types'

function asleep(startMs: number, endMs: number): SleepSample {
  return {
    start: { instantMs: startMs, sourceDay: '' },
    end: { instantMs: endMs, sourceDay: '' },
    stage: 'asleepCore',
    source: 't',
  }
}

/** A night ending at 07:00 UTC on `dayIso`, lasting `hours`. */
function night(dayIso: string, hours: number): SleepSample {
  const [y, m, d] = dayIso.split('-').map(Number)
  const wake = Date.UTC(y, m - 1, d, 7)
  return asleep(wake - hours * 3_600_000, wake)
}

describe('sri', () => {
  it('builds per-day clock-epoch masks and splits a midnight-crossing night', () => {
    const masks = buildSleepMasks([night('2026-01-15', 8)]) // 23:00 (14th) → 07:00 (15th)
    expect(masks.get('2026-01-14')).toBeDefined() // evening half
    const d15 = masks.get('2026-01-15')
    expect(d15).toBeDefined()
    expect(d15!.length).toBe(288)
    expect(d15![0]).toBe(1) // 00:00 asleep
    expect(d15![83]).toBe(1) // 06:55 asleep (7h × 12 epochs/h = 84 epochs, 0..83)
    expect(d15![84]).toBe(0) // 07:00 awake
    expect(d15![150]).toBe(0) // midday awake
  })

  it('scores a perfectly regular sleeper near +100 and an irregular one well below it', () => {
    const regular: SleepSample[] = []
    for (let d = 7; d >= 0; d--) regular.push(night(addDays('2026-01-15', -d), 8))
    const sriR = sriForWindow(buildSleepMasks(regular), '2026-01-15', 7, 4)
    expect(sriR).not.toBeNull()
    expect(sriR!).toBeGreaterThan(85)

    const irregular: SleepSample[] = []
    for (let d = 7; d >= 0; d--) {
      const dayIso = addDays('2026-01-15', -d)
      if (d % 2 === 0) {
        irregular.push(night(dayIso, 8)) // overnight
      } else {
        const [y, m, dd] = dayIso.split('-').map(Number)
        const noon = Date.UTC(y, m - 1, dd, 12)
        irregular.push(asleep(noon, noon + 8 * 3_600_000)) // daytime sleep 12:00–20:00
      }
    }
    const sriI = sriForWindow(buildSleepMasks(irregular), '2026-01-15', 7, 4)
    expect(sriI).not.toBeNull()
    expect(sriI!).toBeLessThan(sriR!)
  })

  it('returns null when too few adjacent night pairs are present', () => {
    const masks = buildSleepMasks([night('2026-01-15', 8), night('2026-01-10', 8)])
    expect(sriForWindow(masks, '2026-01-15', 7, 4)).toBeNull()
  })

  it('dailySri yields an in-range rolling series and is empty without sleep', () => {
    const sleep: SleepSample[] = []
    for (let d = 14; d >= 0; d--) sleep.push(night(addDays('2026-01-15', -d), 8))
    const series = dailySri(sleep, '2026-01-15', 7, 4, 14)
    expect(series.length).toBeGreaterThan(0)
    expect(series.every((m) => m.value >= -100 && m.value <= 100)).toBe(true)
    expect(dailySri([], '2026-01-15', 7, 4, 14)).toEqual([])
  })
})
