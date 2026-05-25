import type { ParserProgress } from '../lib/types'

type Props = {
  progress: ParserProgress | null
  fileName: string
}

export function ParseProgress({ progress, fileName }: Props) {
  const pct =
    progress && progress.totalBytes > 0
      ? Math.min(100, (progress.bytesRead / progress.totalBytes) * 100)
      : 0
  const mb = progress ? (progress.bytesRead / 1_048_576).toFixed(1) : '0.0'
  const totalMb = progress ? (progress.totalBytes / 1_048_576).toFixed(1) : '?'

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
      <div className="text-sm text-zinc-400">Parsing {fileName}</div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full bg-emerald-500 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 text-xs tabular-nums text-zinc-500">
        {mb} / {totalMb} MB · {progress?.recordsSeen.toLocaleString() ?? 0} records
      </div>
    </div>
  )
}
