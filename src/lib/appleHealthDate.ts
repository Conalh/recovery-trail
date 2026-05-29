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
// separator and "Z"/±HH:MM offsets, so synthetic sample data (toISOString) and
// any future ISO input still parse through the same path.
const AH_DATE_RE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/

/**
 * Parse an Apple Health (or ISO) timestamp into {instantMs, sourceDay}.
 * Returns null for unparseable input (callers drop the record).
 */
export function parseAppleHealthDate(input: string): Instant | null {
  const m = AH_DATE_RE.exec(input.trim())
  if (!m) {
    // Last resort so we never silently drop parseable-but-odd input: use the
    // engine's Date parser, but derive sourceDay from UTC (deterministic and
    // locale-independent) rather than from local getters.
    const t = Date.parse(input)
    if (Number.isNaN(t)) return null
    return instantFromEpoch(t)
  }
  const [, y, mo, da, hh, mm, ss, off] = m
  const sourceDay = `${y}-${mo}-${da}`
  const wallUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(da),
    Number(hh),
    Number(mm),
    Number(ss),
  )
  const offsetMin = off && off !== 'Z' ? parseOffsetMinutes(off) : 0
  return { instantMs: wallUtc - offsetMin * 60_000, sourceDay }
}

function parseOffsetMinutes(off: string): number {
  const sign = off[0] === '-' ? -1 : 1
  const digits = off.slice(1).replace(':', '')
  const hours = Number(digits.slice(0, 2))
  const minutes = Number(digits.slice(2, 4))
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
