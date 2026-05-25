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
        message: 'No HRV, RHR, sleep, or workout records found in this file.',
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

  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-baseline justify-between">
          <h1 className="text-xl font-medium tracking-tight text-zinc-100">
            recovery-trail
          </h1>
          <p className="text-xs text-zinc-500">Data never leaves your browser.</p>
        </div>
      </header>
      <main className="flex-1 px-6 py-10">
        <div className="max-w-5xl mx-auto">
          {phase.kind === 'idle' && (
            <div className="space-y-8">
              <div>
                <h2 className="text-2xl font-medium tracking-tight text-zinc-100">
                  See your last two weeks of recovery — explained.
                </h2>
                <p className="mt-2 max-w-2xl text-zinc-400">
                  Drop in your Apple Health export. recovery-trail aggregates
                  HRV, resting heart rate, sleep, and workout load, runs them
                  against ACSM-aligned rules, and shows you the exact reasoning
                  behind a training verdict.
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
      <footer className="border-t border-zinc-800 px-6 py-4 text-center text-xs text-zinc-500">
        Local-first · No backend · MIT
      </footer>
    </div>
  )
}

export default App
