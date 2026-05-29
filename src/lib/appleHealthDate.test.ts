import { describe, it, expect } from 'vitest'
import { instantFromEpoch, parseAppleHealthDate } from './appleHealthDate'

describe('parseAppleHealthDate', () => {
  it('parses the Apple format and applies the offset; sourceDay is the written date', () => {
    const r = parseAppleHealthDate('2026-01-29 06:00:00 -0800')!
    expect(r.sourceDay).toBe('2026-01-29')
    expect(r.instantMs).toBe(Date.UTC(2026, 0, 29, 14, 0, 0)) // 06:00 -0800 == 14:00Z
  })

  it('buckets a late-night reading by its own day, not the UTC day', () => {
    const r = parseAppleHealthDate('2026-01-29 23:30:00 -0800')!
    expect(r.sourceDay).toBe('2026-01-29') // written date
    expect(r.instantMs).toBe(Date.UTC(2026, 0, 30, 7, 30, 0)) // Jan 30 in UTC
  })

  it('handles a positive offset', () => {
    const r = parseAppleHealthDate('2026-01-29 09:00:00 +0900')!
    expect(r.sourceDay).toBe('2026-01-29')
    expect(r.instantMs).toBe(Date.UTC(2026, 0, 29, 0, 0, 0))
  })

  it('accepts ISO Z timestamps (the synthetic sample format)', () => {
    const r = parseAppleHealthDate('2026-01-29T06:00:00.000Z')!
    expect(r.sourceDay).toBe('2026-01-29')
    expect(r.instantMs).toBe(Date.UTC(2026, 0, 29, 6, 0, 0))
  })

  it('tolerates a colon in the offset', () => {
    expect(parseAppleHealthDate('2026-01-29 06:00:00 -08:00')).toEqual(
      parseAppleHealthDate('2026-01-29 06:00:00 -0800'),
    )
  })

  it('returns null for unparseable input', () => {
    expect(parseAppleHealthDate('not a date')).toBeNull()
  })

  it('instantFromEpoch derives a deterministic UTC sourceDay', () => {
    const r = instantFromEpoch(Date.UTC(2026, 0, 30, 7, 30, 0))
    expect(r.sourceDay).toBe('2026-01-30')
    expect(r.instantMs).toBe(Date.UTC(2026, 0, 30, 7, 30, 0))
  })
})
