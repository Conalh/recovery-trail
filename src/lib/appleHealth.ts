import type { ParsedExport, ParserProgress, WorkerOutbound } from './types'

export type ParseHandlers = {
  onProgress?: (p: ParserProgress) => void
}

/**
 * Parse an Apple Health export.xml file off the main thread.
 * The worker streams the file — works on multi-hundred-MB exports without
 * blocking the UI.
 */
export function parseAppleHealthExport(
  file: File,
  handlers: ParseHandlers = {},
): Promise<ParsedExport> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('./appleHealth.worker.ts', import.meta.url),
      { type: 'module' },
    )

    worker.onmessage = (event: MessageEvent<WorkerOutbound>) => {
      const msg = event.data
      if (msg.type === 'progress') {
        handlers.onProgress?.(msg.progress)
      } else if (msg.type === 'done') {
        worker.terminate()
        resolve(msg.result)
      } else if (msg.type === 'error') {
        worker.terminate()
        reject(new Error(msg.message))
      }
    }

    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'worker crashed'))
    }

    worker.postMessage({ type: 'parse', file })
  })
}
