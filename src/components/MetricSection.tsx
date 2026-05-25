import type { FiredRule, Severity } from '../rules/evaluate'
import type { DailyMetric } from '../rules/aggregate'
import { Sparkline } from './Sparkline'

const SEVERITY_BADGE: Record<Severity, string> = {
  standard: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  caution: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  deload: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
}

type Props = {
  label: string
  unit: string
  /** Day-stamped metric series, oldest-first. */
  series: DailyMetric[]
  higherIsBetter: boolean
  precision?: number
  /** Fired rules whose evidence ties back to this metric. */
  rules: FiredRule[]
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function MetricSection({
  label,
  unit,
  series,
  higherIsBetter,
  precision = 0,
  rules,
}: Props) {
  const last14 = series.slice(-14)
  const last28 = series.slice(-28)
  const recentValues = last14.map((m) => m.value)
  const current = recentValues.length > 0 ? recentValues[recentValues.length - 1] : null
  const shortMean = mean(last14.slice(-7).map((m) => m.value))
  const baseline = mean(last28.map((m) => m.value))

  const delta =
    current !== null && baseline !== null && baseline !== 0
      ? ((current - baseline) / baseline) * 100
      : null
  const directionGood =
    delta === null ? null : higherIsBetter ? delta >= -2 : delta <= 2

  const stroke = directionGood === null ? '#a1a1aa' : directionGood ? '#86efac' : '#fda4af'

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <header className="flex items-baseline justify-between">
        <h3 className="text-base font-medium text-zinc-100">{label}</h3>
        <span className="text-xs text-zinc-500">{unit}</span>
      </header>

      <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-[1fr_220px]">
        <div>
          <Sparkline
            values={recentValues}
            stroke={stroke}
            baseline={baseline ?? undefined}
            width={520}
            height={120}
          />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Stat
            label="Today"
            value={current !== null ? current.toFixed(precision) : '—'}
            tone={directionGood === null ? 'neutral' : directionGood ? 'good' : 'bad'}
          />
          <Stat
            label="Δ vs baseline"
            value={delta !== null ? `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%` : '—'}
            tone={directionGood === null ? 'neutral' : directionGood ? 'good' : 'bad'}
          />
          <Stat
            label="7-day mean"
            value={shortMean !== null ? shortMean.toFixed(precision) : '—'}
          />
          <Stat
            label="28-day baseline"
            value={baseline !== null ? baseline.toFixed(precision) : '—'}
          />
        </dl>
      </div>

      <div className="mt-5 border-t border-zinc-800 pt-4">
        {rules.length === 0 ? (
          <p className="text-sm text-zinc-500">
            In range. No rules fired for {label.toLowerCase()}.
          </p>
        ) : (
          <ul className="space-y-3">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wider ${SEVERITY_BADGE[rule.severity]}`}
                  >
                    {rule.severity}
                  </span>
                  <span className="text-sm font-medium text-zinc-100">{rule.name}</span>
                  <span className="ml-auto text-[11px] text-zinc-600">{rule.id}</span>
                </div>
                <div className="mt-2 text-sm text-zinc-300">{rule.why}</div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {Object.entries(rule.evidence).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-zinc-500">{k}</dt>
                      <dd className="text-zinc-300 tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'bad'
}) {
  const valueClass =
    tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : 'text-zinc-100'
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>{value}</dd>
    </div>
  )
}
