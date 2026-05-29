import type {
  HrvSample,
  ParsedExport,
  RhrSample,
  SleepSample,
  SleepStage,
  WorkoutSample,
} from './types'
import { parseAppleHealthDate } from './appleHealthDate'

const HRV_TYPE = 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'
const RHR_TYPE = 'HKQuantityTypeIdentifierRestingHeartRate'
const SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis'

const SLEEP_VALUE_MAP: Record<string, SleepStage> = {
  HKCategoryValueSleepAnalysisInBed: 'inBed',
  HKCategoryValueSleepAnalysisAsleep: 'asleepUnspecified',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'asleepUnspecified',
  HKCategoryValueSleepAnalysisAsleepCore: 'asleepCore',
  HKCategoryValueSleepAnalysisAsleepDeep: 'asleepDeep',
  HKCategoryValueSleepAnalysisAsleepREM: 'asleepREM',
  HKCategoryValueSleepAnalysisAwake: 'awake',
}

/**
 * Pull a single attribute value out of a tag string by name.
 * Apple Health uses double-quoted attributes consistently.
 */
function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}="([^"]*)"`)
  const m = re.exec(tag)
  return m?.[1]
}

function normalizeActivity(raw: string | undefined): string {
  if (!raw) return 'unknown'
  return raw.replace(/^HKWorkoutActivityType/, '').toLowerCase()
}

function minutesBetween(startMs: number, endMs: number): number {
  return Math.max(0, (endMs - startMs) / 60_000)
}

/**
 * Convert a workout `duration` to minutes using its `durationUnit`. Apple Health
 * normally writes minutes ("min"), but the unit is explicit in the export, so
 * read it rather than assuming. Unknown/absent units fall back to minutes.
 */
function durationToMinutes(value: number, unit: string | undefined): number {
  switch (unit) {
    case 's':
    case 'sec':
      return value / 60
    case 'hr':
    case 'h':
      return value * 60
    case 'min':
    default:
      return value
  }
}

function widenRange(
  range: { startMs: number; endMs: number } | null,
  ms: number,
): { startMs: number; endMs: number } {
  if (!range) return { startMs: ms, endMs: ms }
  return {
    startMs: Math.min(range.startMs, ms),
    endMs: Math.max(range.endMs, ms),
  }
}

function handleRecord(tag: string, out: ParsedExport): void {
  const type = attr(tag, 'type')
  if (!type) return
  const startStr = attr(tag, 'startDate')
  if (!startStr) return
  const start = parseAppleHealthDate(startStr)
  if (!start) return
  const source = attr(tag, 'sourceName') ?? 'unknown'

  if (type === HRV_TYPE) {
    const value = Number(attr(tag, 'value'))
    if (Number.isFinite(value)) {
      const sample: HrvSample = { start, valueMs: value, source }
      out.hrv.push(sample)
      out.range = widenRange(out.range, start.instantMs)
    }
    return
  }
  if (type === RHR_TYPE) {
    const value = Number(attr(tag, 'value'))
    if (Number.isFinite(value)) {
      const sample: RhrSample = { start, valueBpm: value, source }
      out.rhr.push(sample)
      out.range = widenRange(out.range, start.instantMs)
    }
    return
  }
  if (type === SLEEP_TYPE) {
    const endStr = attr(tag, 'endDate')
    const value = attr(tag, 'value')
    if (!endStr || !value) return
    const end = parseAppleHealthDate(endStr)
    if (!end) return
    const stage = SLEEP_VALUE_MAP[value]
    if (!stage) return
    const sample: SleepSample = { start, end, stage, source }
    out.sleep.push(sample)
    out.range = widenRange(widenRange(out.range, start.instantMs), end.instantMs)
  }
}

function handleWorkout(tag: string, out: ParsedExport): void {
  const startStr = attr(tag, 'startDate')
  const endStr = attr(tag, 'endDate')
  if (!startStr || !endStr) return
  const start = parseAppleHealthDate(startStr)
  const end = parseAppleHealthDate(endStr)
  if (!start || !end) return
  const activity = normalizeActivity(attr(tag, 'workoutActivityType'))
  const source = attr(tag, 'sourceName') ?? 'unknown'
  const durationValue = Number(attr(tag, 'duration'))
  const durationMin =
    Number.isFinite(durationValue) && durationValue > 0
      ? durationToMinutes(durationValue, attr(tag, 'durationUnit'))
      : minutesBetween(start.instantMs, end.instantMs)
  const sample: WorkoutSample = { start, end, activity, durationMin, source }
  out.workouts.push(sample)
  out.range = widenRange(widenRange(out.range, start.instantMs), end.instantMs)
}

/**
 * Dispatch one `<Record>` / `<Workout>` tag into the accumulating export.
 * Returns true when the tag was a record or workout (so the streaming worker
 * can count records seen). Shared by the worker and parseRecordsFromXmlString
 * so the two never diverge.
 */
export function flushTagInto(tag: string, out: ParsedExport): boolean {
  if (tag.startsWith('<Record')) {
    handleRecord(tag, out)
    return true
  }
  if (tag.startsWith('<Workout')) {
    handleWorkout(tag, out)
    return true
  }
  return false
}

export function nextOpening(buf: string, from: number): number {
  const r = buf.indexOf('<Record', from)
  const w = buf.indexOf('<Workout', from)
  if (r === -1) return w
  if (w === -1) return r
  return Math.min(r, w)
}

/**
 * Given an index of a `<Record` or `<Workout` opening, return the index just
 * past the element's end — either the `/>` of a self-closing tag, or the
 * `</Record>` / `</Workout>` matching close. Returns -1 when the element is
 * incomplete (caller keeps the remainder for the next chunk).
 */
export function findTagOrElementEnd(buf: string, start: number): number {
  const tagNameEnd = buf.indexOf(' ', start)
  if (tagNameEnd === -1) return -1
  const openTagEnd = buf.indexOf('>', tagNameEnd)
  if (openTagEnd === -1) return -1
  if (buf[openTagEnd - 1] === '/') {
    // Self-closing.
    return openTagEnd + 1
  }
  const tagName = buf.slice(start + 1, tagNameEnd) // "Record" or "Workout"
  const closeMarker = `</${tagName}>`
  const closeIdx = buf.indexOf(closeMarker, openTagEnd)
  if (closeIdx === -1) return -1
  return closeIdx + closeMarker.length
}

/**
 * Parse a complete Apple Health export XML string into a ParsedExport. This is
 * the non-streaming core used by tests; the worker shares the same per-tag
 * handlers via flushTagInto for multi-hundred-MB streaming.
 */
export function parseRecordsFromXmlString(xml: string): ParsedExport {
  const result: ParsedExport = { hrv: [], rhr: [], sleep: [], workouts: [], range: null }
  let cursor = 0
  while (cursor < xml.length) {
    const next = nextOpening(xml, cursor)
    if (next === -1) break
    const closeEnd = findTagOrElementEnd(xml, next)
    if (closeEnd === -1) break
    flushTagInto(xml.slice(next, closeEnd), result)
    cursor = closeEnd
  }
  return result
}
