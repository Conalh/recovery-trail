/**
 * Explicit Apple Health timestamp parsing.
 *
 * Apple Health's export.xml writes timestamps like "2026-01-29 06:00:00 -0800":
 * a space-separated date and time followed by a space and a signed 4-digit UTC
 * offset with no colon. That is NOT ISO 8601 (ISO uses a 'T' separator and a
 * "-08:00" offset), so `new Date(...)` / `Date.parse(...)` handling of it is
 * implementation-defined per ECMA-262. More importantly, bucketing a reading by
 * `new Date(...).getDate()` uses the *browser's* local timezone, so the same
 * sample lands in a different calendar day depending on where the file is opened.
 *
 * We parse once, at ingest, into a normalized {instantMs, sourceDay} pair:
 *   - instantMs  — UTC epoch milliseconds (for durations / ordering)
 *   - sourceDay  — the calendar date in the timestamp's OWN offset (the date as
 *                  written in the export), never the viewer's locale.
 */

export type Instant = {
  /** UTC epoch milliseconds. */
  instantMs: number
  /** Calendar date (YYYY-MM-DD) in the timestamp's own offset — the date as written. */
  sourceDay: string
}

// Matches "YYYY-MM-DD HH:MM:SS ±HHMM" (Apple) and also tolerates an ISO 'T'
// separator, fractional seconds, and "Z"/±HH:MM offsets, so synthetic sample
// data (toISOString) and future ISO input still parse through the same path.
const AH_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/

/**
 * Parse an Apple Health (or ISO) timestamp into {instantMs, sourceDay}.
 * Returns null for unparseable input (callers drop the record).
 */
export function parseAppleHealthDate(input: string): Instant | null {
  const m = AH_DATE_RE.exec(input.trim())
  if (!m) return null

  const [, y, mo, da, hh, mm, ss, fraction, off] = m
  const year = Number(y)
  const month = Number(mo)
  const day = Number(da)
  const hour = Number(hh)
  const minute = Number(mm)
  const second = Number(ss)
  const millisecond = fraction
    ? Number(fraction.padEnd(3, '0').slice(0, 3))
    : 0

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null
  }

  // Build with setUTCFullYear so years 0000-0099 are not silently remapped to
  // 1900-1999 by Date.UTC. Then round-trip every component to reject normalized
  // dates such as February 31 instead of accepting them as March 3.
  const wall = new Date(0)
  wall.setUTCHours(0, 0, 0, 0)
  wall.setUTCFullYear(year, month - 1, day)
  wall.setUTCHours(hour, minute, second, millisecond)
  if (
    wall.getUTCFullYear() !== year ||
    wall.getUTCMonth() !== month - 1 ||
    wall.getUTCDate() !== day ||
    wall.getUTCHours() !== hour ||
    wall.getUTCMinutes() !== minute ||
    wall.getUTCSeconds() !== second ||
    wall.getUTCMilliseconds() !== millisecond
  ) {
    return null
  }

  const offsetMin = off && off !== 'Z' ? parseOffsetMinutes(off) : 0
  if (offsetMin === null) return null
  const sourceDay = `${y}-${mo}-${da}`
  return { instantMs: wall.getTime() - offsetMin * 60_000, sourceDay }
}

function parseOffsetMinutes(off: string): number | null {
  const sign = off[0] === '-' ? -1 : 1
  const digits = off.slice(1).replace(':', '')
  const hours = Number(digits.slice(0, 2))
  const minutes = Number(digits.slice(2, 4))
  if (hours > 23 || minutes > 59) return null
  return sign * (hours * 60 + minutes)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Build an Instant from a known epoch ms, deriving sourceDay deterministically
 * in UTC. Used by the synthetic sample generator, which already works in epoch ms.
 */
export function instantFromEpoch(ms: number): Instant {
  const d = new Date(ms)
  return {
    instantMs: ms,
    sourceDay: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
  }
}
