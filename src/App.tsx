import { useState } from 'react'
import { Dashboard } from './components/Dashboard'
import { ImportZone } from './components/ImportZone'
import { ParseProgress } from './components/ParseProgress'
import { parseAppleHealthExport } from './lib/appleHealth'
import { sampleParsedExport } from './lib/sample'
import type { ParsedExport, ParserProgress } from './lib/types'
import { evaluate, type Recommendation } from './rules/evaluate'

type Phase =
  | { kind: 'idle' }
  | { kind: 'parsing'; fileName: string; progress: ParserProgress | null }
  | { kind: 'ready'; recommendation: Recommendation }
  | { kind: 'error'; message: string }

function App() {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const handleParsed = (parsed: ParsedExport) => {
    const rec = evaluate(parsed)
    if (!rec) {
      setPhase({
        kind: 'error',
        message: 'No supported HRV, RHR, respiratory-rate, sleep, or workout records found in this file.',
      })
      return
    }
    setPhase({ kind: 'ready', recommendation: rec })
  }

  const handleFile = async (file: File) => {
    setPhase({ kind: 'parsing', fileName: file.name, progress: null })
    try {
      const parsed = await parseAppleHealthExport(file, {
        onProgress: (progress) =>
          setPhase((cur) =>
            cur.kind === 'parsing' ? { ...cur, progress } : cur,
          ),
      })
      handleParsed(parsed)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setPhase({ kind: 'error', message })
    }
  }

  const handleSample = () => {
    handleParsed(sampleParsedExport())
  }

  const reset = () => setPhase({ kind: 'idle' })

  const isReady = phase.kind === 'ready'

  return (
    <div className="min-h-full flex flex-col">
      {!isReady && (
        <header className="border-b border-zinc-800 px-6 py-4">
          <div className="max-w-2xl mx-auto flex items-baseline justify-between">
            <h1 className="text-xl font-medium tracking-tight text-zinc-100">
              recovery-trail
            </h1>
            <p className="text-xs text-zinc-500">Data never leaves your browser.</p>
          </div>
        </header>
      )}
      <main className="flex-1 px-6 py-10">
        <div className="max-w-2xl mx-auto">
          {phase.kind === 'idle' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-medium tracking-tight text-zinc-100">
                  See your last two weeks of recovery — explained.
                </h2>
                <p className="mt-2 text-zinc-400">
                  Drop in your Apple Health export. recovery-trail reads HRV,
                  resting heart rate, overnight respiratory rate, sleep, sleep
                  regularity, and training load, runs them against published
                  recovery-monitoring methodology, and shows you the exact
                  reasoning behind a training verdict.
                </p>
              </div>
              <ImportZone onFile={handleFile} onSample={handleSample} />
            </div>
          )}

          {phase.kind === 'parsing' && (
            <ParseProgress fileName={phase.fileName} progress={phase.progress} />
          )}

          {phase.kind === 'ready' && (
            <Dashboard recommendation={phase.recommendation} onReset={reset} />
          )}

          {phase.kind === 'error' && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-5 text-rose-200">
              <div className="font-medium">Couldn't read this file</div>
              <div className="mt-1 text-sm opacity-90">{phase.message}</div>
              <button
                type="button"
                onClick={reset}
                className="mt-4 rounded-md border border-rose-400/40 px-3 py-1.5 text-xs hover:bg-rose-500/20"
              >
                Try another file
              </button>
            </div>
          )}
        </div>
      </main>
      <footer className="border-t border-panelLine px-6 py-4 text-[11px] tracking-wider text-faint font-mono">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <span>local · no backend</span>
          <span>recovery-trail</span>
        </div>
      </footer>
    </div>
  )
}

export default App
