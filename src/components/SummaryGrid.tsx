import type { DailyMetric } from '../rules/aggregate'
import { Sparkline } from './Sparkline'

type CardSpec = {
  label: string
  unit: string
  series: DailyMetric[]
  higherIsBetter: boolean
  precision?: number
}

type Props = {
  cards: CardSpec[]
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function SummaryGrid({ cards }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <SummaryCard key={c.label} {...c} />
      ))}
    </div>
  )
}

function SummaryCard({ label, unit, series, higherIsBetter, precision = 0 }: CardSpec) {
  const recent = series.slice(-14).map((m) => m.value)
  const baseline = mean(series.slice(-28).map((m) => m.value))
  const current = recent.length > 0 ? recent[recent.length - 1] : null
  const delta =
    current !== null && baseline !== null && baseline !== 0
      ? ((current - baseline) / baseline) * 100
      : null
  const directionGood =
    delta === null ? null : higherIsBetter ? delta >= -2 : delta <= 2
  const stroke = directionGood === null ? '#a1a1aa' : directionGood ? '#86efac' : '#fda4af'

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-400">
          {label}
        </h3>
        <span className="text-[10px] text-zinc-600">{unit}</span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-xl font-semibold tabular-nums text-zinc-100">
          {current !== null ? current.toFixed(precision) : '—'}
        </span>
        {delta !== null && (
          <span
            className={`text-[11px] tabular-nums ${
              directionGood ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {delta >= 0 ? '+' : ''}
            {delta.toFixed(0)}%
          </span>
        )}
      </div>
      <div className="mt-2">
        <Sparkline
          values={recent}
          stroke={stroke}
          baseline={baseline ?? undefined}
          width={220}
          height={40}
        />
      </div>
    </div>
  )
}
