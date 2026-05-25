import type { FiredRule, Recommendation, Severity } from '../rules/evaluate'
import {
  cellTier,
  metaRule,
  narrative,
  type CellTier,
  type MetricKey,
  type MetricSpec,
} from '../rules/briefing'

type Props = {
  recommendation: Recommendation
  onReset: () => void
}

const VERDICT_BADGE: Record<Severity, string> = {
  standard: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  caution: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  deload: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
}

const VERDICT_LABEL: Record<Severity, string> = {
  standard: 'STANDARD',
  caution: 'CAUTION',
  deload: 'DELOAD',
}

const CELL_CLASS: Record<CellTier, string> = {
  good: 'bg-sky-500/70',
  warn: 'bg-orange-500/80',
  bad: 'bg-rose-500/85',
  empty: 'bg-zinc-800/60',
}

const METRIC_ROW_LABEL: Record<MetricKey, string> = {
  hrv: 'HRV',
  rhr: 'RHR',
  sleep: 'SLEEP',
  workout: 'LOAD',
}

export function HeatmapBriefing({ recommendation, onReset }: Props) {
  const { series, fired, verdict, asOfDay } = recommendation

  const specs: MetricSpec[] = [
    { key: 'hrv', label: 'HRV (SDNN)', unit: 'ms', series: series.hrv, higherIsBetter: true, precision: 0 },
    { key: 'rhr', label: 'Resting HR', unit: 'bpm', series: series.rhr, higherIsBetter: false, precision: 0 },
    { key: 'sleep', label: 'Sleep', unit: 'hours', series: series.sleepHours, higherIsBetter: true, precision: 1 },
    { key: 'workout', label: 'Load', unit: 'min/day', series: series.workoutMin, higherIsBetter: false, precision: 0 },
  ]

  const days = collectLast14Days(specs, asOfDay)
  const baselines = computeBaselines(specs)
  const summary = narrative(specs, asOfDay)
  const meta = metaRule(fired)
  const allRules = meta ? [meta, ...fired] : fired

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-zinc-500">
        <div>recovery-trail · 14d</div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-600">verdict</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${VERDICT_BADGE[verdict]}`}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {VERDICT_LABEL[verdict]}
          </span>
        </div>
      </div>

      <div className="flex items-baseline justify-between">
        <h2 className="text-3xl font-semibold tracking-tight text-zinc-50">Briefing</h2>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← new file
        </button>
      </div>

      <HeatmapCard
        specs={specs}
        days={days}
        baselines={baselines}
      />

      <p className="text-zinc-300">{summary}</p>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-zinc-500">
          {allRules.length === 0
            ? 'no rules fired'
            : `${allRules.length} rule${allRules.length === 1 ? '' : 's'} fired`}
        </h3>
        <ul className="mt-3 space-y-3">
          {allRules.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </ul>
      </div>
    </div>
  )
}

type HeatmapCardProps = {
  specs: MetricSpec[]
  days: string[]
  baselines: Record<MetricKey, number | null>
}

function HeatmapCard({ specs, days, baselines }: HeatmapCardProps) {
  const dateLabels = pickDateLabels(days)

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="grid grid-cols-[56px_1fr_64px] items-center gap-3 px-1 text-[10px] uppercase tracking-wider text-zinc-500">
        <div />
        <div className="relative h-3">
          {dateLabels.map(({ idx, label }) => (
            <span
              key={label}
              className="absolute -translate-x-1/2"
              style={{ left: `${(idx / Math.max(days.length - 1, 1)) * 100}%` }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="text-right text-zinc-600">now</div>
      </div>

      <div className="mt-3 space-y-2">
        {specs.map((spec) => {
          const baseline = baselines[spec.key]
          const valueByDay = new Map(spec.series.map((m) => [m.day, m.value]))
          const today = valueByDay.get(days[days.length - 1])
          const delta =
            today !== undefined && baseline !== null && baseline !== 0
              ? ((today - baseline) / baseline) * 100
              : null
          const directionGood =
            delta === null
              ? null
              : spec.higherIsBetter
                ? delta >= -2
                : delta <= 2

          return (
            <div
              key={spec.key}
              className="grid grid-cols-[56px_1fr_64px] items-center gap-3"
            >
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                {METRIC_ROW_LABEL[spec.key]}
              </div>
              <div className="flex gap-1">
                {days.map((day) => {
                  const v = valueByDay.get(day) ?? null
                  const tier = cellTier(v, baseline, spec.higherIsBetter)
                  return (
                    <div
                      key={day}
                      className={`h-5 flex-1 rounded-[3px] ${CELL_CLASS[tier]}`}
                      title={`${day} · ${v === null ? '—' : v.toFixed(spec.precision)} ${spec.unit}`}
                    />
                  )
                })}
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums text-zinc-100">
                  {today !== undefined ? today.toFixed(spec.precision) : '—'}
                </div>
                {delta !== null && (
                  <div
                    className={`text-[10px] tabular-nums ${
                      directionGood ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {delta >= 0 ? '+' : ''}
                    {delta.toFixed(0)}%
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-[56px_1fr_64px] items-center gap-3 text-[10px] uppercase tracking-wider text-zinc-500">
        <div>vs. baseline</div>
        <div className="flex h-2 overflow-hidden rounded-full">
          <div className="flex-[2] bg-sky-500/70" />
          <div className="flex-1 bg-orange-500/80" />
          <div className="flex-1 bg-rose-500/85" />
        </div>
        <div className="text-right text-zinc-600">worse</div>
      </div>
    </div>
  )
}

function RuleCard({ rule }: { rule: FiredRule }) {
  const badge = VERDICT_BADGE[rule.severity]
  const isMeta = rule.id === 'meta_recovery_stack'
  const evidenceLine = isMeta ? null : formatEvidenceLine(rule)

  return (
    <li
      className={`rounded-lg border p-3 ${
        isMeta ? 'border-zinc-700 bg-zinc-900/70' : 'border-zinc-800 bg-zinc-900/40'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex rounded-md border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${badge}`}
        >
          {rule.severity}
        </span>
        <span
          className={`text-sm font-medium ${isMeta ? 'text-zinc-50' : 'text-zinc-100'}`}
        >
          {rule.name}
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-300">{rule.why}</p>
      {evidenceLine && (
        <p className="mt-1 text-[11px] tabular-nums text-zinc-500">{evidenceLine}</p>
      )}
    </li>
  )
}

function formatEvidenceLine(rule: FiredRule): string {
  const e = rule.evidence
  // Standard ratio-style rules: prefer "7d X  base Y  ratio".
  if ('shortMean' in e && 'baselineMean' in e && 'ratio' in e) {
    return `7d ${e.shortMean}  base ${e.baselineMean}  ${e.ratio}`
  }
  if ('mean' in e && 'nights' in e) {
    return `7d ${e.mean}  nights ${e.nights}`
  }
  if ('lowNights' in e && 'threshold' in e) {
    return `nights<${e.threshold}h: ${e.lowNights}`
  }
  if ('acwr' in e && 'acuteMin' in e && 'chronicMin' in e) {
    return `acwr ${e.acwr}  7d ${e.acuteMin}min  28d ${e.chronicMin}min`
  }
  return Object.entries(e)
    .map(([k, v]) => `${k} ${v}`)
    .join('  ')
}

function collectLast14Days(specs: MetricSpec[], asOfDay: string): string[] {
  const set = new Set<string>()
  for (const s of specs) for (const m of s.series.slice(-14)) set.add(m.day)
  const sorted = Array.from(set)
    .filter((d) => d <= asOfDay)
    .sort()
  return sorted.slice(-14)
}

function computeBaselines(specs: MetricSpec[]): Record<MetricKey, number | null> {
  const out = {} as Record<MetricKey, number | null>
  for (const s of specs) {
    const tail = s.series.slice(-28)
    out[s.key] = tail.length === 0 ? null : tail.reduce((a, b) => a + b.value, 0) / tail.length
  }
  return out
}

function pickDateLabels(days: string[]): { idx: number; label: string }[] {
  if (days.length === 0) return []
  const mid = Math.floor(days.length / 2)
  const last = days.length - 1
  return [
    { idx: 0, label: shortDay(days[0]) },
    { idx: mid, label: shortDay(days[mid]) },
    { idx: last, label: shortDay(days[last]) },
  ]
}

function shortDay(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}
