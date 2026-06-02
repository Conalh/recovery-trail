/// <reference lib="webworker" />
import type { ParsedExport, WorkerInbound, WorkerOutbound } from './types'
import { findTagOrElementEnd, flushTagInto, nextOpening } from './parseAppleHealth'

/**
 * Stream-parse an Apple Health export.xml. Apple Health writes Records and
 * Workouts as either self-closing tags or tags with metadata children — we
 * scan for opening "<Record" / "<Workout" markers and read forward to the
 * matching close, keeping a sliding buffer so cross-chunk tags survive.
 *
 * Per-tag parsing lives in parseAppleHealth.ts (shared with the unit tests);
 * this worker only owns the streaming/progress plumbing.
 */
async function parse(file: File, post: (m: WorkerOutbound) => void): Promise<ParsedExport> {
  const result: ParsedExport = {
    hrv: [],
    rhr: [],
    respRate: [],
    sleep: [],
    workouts: [],
    range: null,
  }

  // Read raw bytes and decode manually so progress is measured in BYTES (matching
  // file.size), not decoded UTF-16 code units — those diverge on any non-ASCII.
  const reader = file.stream().getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let bytesRead = 0
  let recordsSeen = 0
  let lastReport = 0

  const flushTag = (tag: string) => {
    if (flushTagInto(tag, result)) recordsSeen++
  }

  const scanBuffer = () => {
    let cursor = 0
    while (cursor < buffer.length) {
      const next = nextOpening(buffer, cursor)
      if (next === -1) {
        // No opening in the remainder; drop everything before cursor.
        buffer = buffer.slice(cursor)
        return
      }
      const closeEnd = findTagOrElementEnd(buffer, next)
      if (closeEnd === -1) {
        // Incomplete tag at end of buffer; keep from `next` onward for the next chunk.
        buffer = buffer.slice(next)
        return
      }
      flushTag(buffer.slice(next, closeEnd))
      cursor = closeEnd
    }
    buffer = ''
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    bytesRead += value.byteLength
    buffer += decoder.decode(value, { stream: true })
    scanBuffer()

    const now = performance.now()
    if (now - lastReport > 200) {
      lastReport = now
      post({
        type: 'progress',
        progress: { bytesRead, totalBytes: file.size, recordsSeen },
      })
    }
  }

  // Flush any decoder remainder, then drain the buffer.
  buffer += decoder.decode()
  scanBuffer()

  post({
    type: 'progress',
    progress: { bytesRead: file.size, totalBytes: file.size, recordsSeen },
  })

  return result
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
