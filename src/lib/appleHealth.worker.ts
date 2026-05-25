/// <reference lib="webworker" />
import type {
  HrvSample,
  ParsedExport,
  RhrSample,
  SleepSample,
  SleepStage,
  WorkerInbound,
  WorkerOutbound,
  WorkoutSample,
} from './types'

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

function isoMinutes(startIso: string, endIso: string): number {
  const start = Date.parse(startIso)
  const end = Date.parse(endIso)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, (end - start) / 60_000)
}

function widenRange(
  range: { start: string; end: string } | null,
  iso: string,
): { start: string; end: string } {
  if (!range) return { start: iso, end: iso }
  return {
    start: iso < range.start ? iso : range.start,
    end: iso > range.end ? iso : range.end,
  }
}

/**
 * Stream-parse an Apple Health export.xml. Apple Health writes Records and
 * Workouts as either self-closing tags or tags with metadata children — we
 * scan for opening "<Record" / "<Workout" markers and read forward to the
 * matching close, keeping a sliding buffer so cross-chunk tags survive.
 */
async function parse(file: File, post: (m: WorkerOutbound) => void): Promise<ParsedExport> {
  const result: ParsedExport = {
    hrv: [],
    rhr: [],
    sleep: [],
    workouts: [],
    range: null,
  }

  const stream = file.stream().pipeThrough(new TextDecoderStream())
  const reader = stream.getReader()
  let buffer = ''
  let bytesRead = 0
  let recordsSeen = 0
  let lastReport = 0

  const flushTag = (tag: string) => {
    if (tag.startsWith('<Record')) {
      handleRecord(tag, result)
      recordsSeen++
    } else if (tag.startsWith('<Workout')) {
      handleWorkout(tag, result)
      recordsSeen++
    }
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    bytesRead += value.length
    buffer += value

    // Scan for complete <Record .../> or <Record ...>...</Record>, same for Workout.
    let cursor = 0
    while (cursor < buffer.length) {
      const next = nextOpening(buffer, cursor)
      if (next === -1) {
        // No opening in the remainder; drop everything before cursor.
        buffer = buffer.slice(cursor)
        break
      }
      const closeEnd = findTagOrElementEnd(buffer, next)
      if (closeEnd === -1) {
        // Incomplete tag at end of buffer; keep from `next` onward for the next chunk.
        buffer = buffer.slice(next)
        break
      }
      flushTag(buffer.slice(next, closeEnd))
      cursor = closeEnd
    }

    const now = performance.now()
    if (now - lastReport > 200) {
      lastReport = now
      post({
        type: 'progress',
        progress: { bytesRead, totalBytes: file.size, recordsSeen },
      })
    }
  }

  // Final flush of anything left in the buffer.
  let cursor = 0
  while (cursor < buffer.length) {
    const next = nextOpening(buffer, cursor)
    if (next === -1) break
    const closeEnd = findTagOrElementEnd(buffer, next)
    if (closeEnd === -1) break
    flushTag(buffer.slice(next, closeEnd))
    cursor = closeEnd
  }

  post({
    type: 'progress',
    progress: { bytesRead: file.size, totalBytes: file.size, recordsSeen },
  })

  return result
}

function nextOpening(buf: string, from: number): number {
  const r = buf.indexOf('<Record', from)
  const w = buf.indexOf('<Workout', from)
  if (r === -1) return w
  if (w === -1) return r
  return Math.min(r, w)
}

/**
 * Given an index of a `<Record` or `<Workout` opening, return the index just
 * past the element's end — either the `/>` of a self-closing tag, or the
 * `</Record>` / `</Workout>` matching close.
 */
function findTagOrElementEnd(buf: string, start: number): number {
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

function handleRecord(tag: string, out: ParsedExport): void {
  const type = attr(tag, 'type')
  if (!type) return
  const startDate = attr(tag, 'startDate')
  if (!startDate) return
  const source = attr(tag, 'sourceName') ?? 'unknown'

  if (type === HRV_TYPE) {
    const value = Number(attr(tag, 'value'))
    if (Number.isFinite(value)) {
      const sample: HrvSample = { startDate, valueMs: value, source }
      out.hrv.push(sample)
      out.range = widenRange(out.range, startDate)
    }
    return
  }
  if (type === RHR_TYPE) {
    const value = Number(attr(tag, 'value'))
    if (Number.isFinite(value)) {
      const sample: RhrSample = { startDate, valueBpm: value, source }
      out.rhr.push(sample)
      out.range = widenRange(out.range, startDate)
    }
    return
  }
  if (type === SLEEP_TYPE) {
    const endDate = attr(tag, 'endDate')
    const value = attr(tag, 'value')
    if (!endDate || !value) return
    const stage = SLEEP_VALUE_MAP[value]
    if (!stage) return
    const sample: SleepSample = { startDate, endDate, stage, source }
    out.sleep.push(sample)
    out.range = widenRange(out.range, startDate)
  }
}

function handleWorkout(tag: string, out: ParsedExport): void {
  const startDate = attr(tag, 'startDate')
  const endDate = attr(tag, 'endDate')
  if (!startDate || !endDate) return
  const activity = normalizeActivity(attr(tag, 'workoutActivityType'))
  const source = attr(tag, 'sourceName') ?? 'unknown'
  const durationAttr = Number(attr(tag, 'duration'))
  const durationMin = Number.isFinite(durationAttr) && durationAttr > 0
    ? durationAttr
    : isoMinutes(startDate, endDate)
  const sample: WorkoutSample = { startDate, endDate, activity, durationMin, source }
  out.workouts.push(sample)
  out.range = widenRange(out.range, startDate)
}

self.onmessage = async (event: MessageEvent<WorkerInbound>) => {
  const msg = event.data
  if (msg.type !== 'parse') return
  try {
    const post = (m: WorkerOutbound) => (self as unknown as Worker).postMessage(m)
    const result = await parse(msg.file, post)
    post({ type: 'done', result })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ;(self as unknown as Worker).postMessage({ type: 'error', message } satisfies WorkerOutbound)
  }
}
