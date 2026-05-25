import { Sparkline } from './Sparkline'

type Props = {
  label: string
  unit: string
  /** Most-recent value to display large. */
  current: number | null
  /** Baseline / reference value to display as the dotted line. */
  baseline: number | null
  /** Series values, oldest-first. */
  series: number[]
  /** If true, "higher than baseline" is good (HRV). If false, lower is good (RHR). */
  higherIsBetter: boolean
  /** Decimals when formatting current/baseline. */
  precision?: number
}

export function MetricCard({
  label,
  unit,
  current,
  baseline,
  series,
  higherIsBetter,
  precision = 0,
}: Props) {
  const delta =
    current !== null && baseline !== null && baseline !== 0
      ? ((current - baseline) / baseline) * 100
      : null

  const directionGood =
    delta === null
      ? null
      : higherIsBetter
        ? delta >= -2
        : delta <= 2

  const stroke = directionGood === null ? '#a1a1aa' : directionGood ? '#86efac' : '#fda4af'

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-zinc-300">{label}</h3>
        <span className="text-xs text-zinc-500">{unit}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="text-2xl font-semibold tabular-nums text-zinc-100">
          {current !== null ? current.toFixed(precision) : '—'}
        </span>
        {delta !== null && (
          <span
            className={`text-xs tabular-nums ${
              directionGood ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(0)}% vs baseline
          </span>
        )}
      </div>
      <div className="mt-3">
        <Sparkline values={series} stroke={stroke} baseline={baseline ?? undefined} />
      </div>
      <div className="mt-1 text-[11px] text-zinc-600">
        baseline {baseline !== null ? baseline.toFixed(precision) : '—'} {unit}
      </div>
    </div>
  )
}
