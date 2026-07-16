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

  it('preserves ISO fractional seconds', () => {
    const r = parseAppleHealthDate('2026-01-29T06:00:00.527Z')!
    expect(r.instantMs).toBe(Date.UTC(2026, 0, 29, 6, 0, 0, 527))
  })

  it('tolerates a colon in the offset', () => {
    expect(parseAppleHealthDate('2026-01-29 06:00:00 -08:00')).toEqual(
      parseAppleHealthDate('2026-01-29 06:00:00 -0800'),
    )
  })

  it('returns null for unparseable input', () => {
    expect(parseAppleHealthDate('not a date')).toBeNull()
  })

  it('rejects normalized calendar dates and invalid offsets', () => {
    expect(parseAppleHealthDate('2026-02-31 06:00:00 -0800')).toBeNull()
    expect(parseAppleHealthDate('2026-01-29 24:00:00 -0800')).toBeNull()
    expect(parseAppleHealthDate('2026-01-29 06:00:00 +2460')).toBeNull()
  })

  it('rejects noncanonical dates instead of using the environment Date parser', () => {
    expect(parseAppleHealthDate('January 29, 2026 06:00:00')).toBeNull()
  })

  it('instantFromEpoch derives a deterministic UTC sourceDay', () => {
    const r = instantFromEpoch(Date.UTC(2026, 0, 30, 7, 30, 0))
    expect(r.sourceDay).toBe('2026-01-30')
    expect(r.instantMs).toBe(Date.UTC(2026, 0, 30, 7, 30, 0))
  })
})
