import { useState } from 'react'
import type { FiredRule, Recommendation, Severity } from '../rules/evaluate'
import {
  cellTier,
  metaRule,
  narrative,
  type CellTier,
  type MetricKey,
  type MetricSpec,
} from '../rules/briefing'
import { DayInspector } from './DayInspector'
import { MetricChart } from './MetricChart'

type Props = {
  recommendation: Recommendation
  onReset: () => void
}

const VERDICT_BADGE: Record<Severity, { border: string; text: string; dot: string }> = {
  standard: { border: 'border-teal', text: 'text-teal', dot: 'bg-teal' },
  caution: { border: 'border-amber', text: 'text-amber', dot: 'bg-amber' },
  deload: { border: 'border-rust', text: 'text-rust', dot: 'bg-rust' },
}

const VERDICT_LABEL: Record<Severity, string> = {
  standard: 'STANDARD',
  caution: 'CAUTION',
  deload: 'DELOAD',
}

const CELL_COLOR_HEX: Record<CellTier, string> = {
  goodStrong: '#2a8aa3',
  goodMild: '#1f5b6e',
  flat: '#1c252e',
  badMild: '#c46a55',
  badStrong: '#e85d4a',
  empty: 'rgba(28, 37, 46, 0.5)',
}

const METRIC_ROW_LABEL: Record<MetricKey, string> = {
  hrv: 'HRV',
  rhr: 'RHR',
  sleep: 'SLEEP',
  load: 'LOAD',
}

export function HeatmapBriefing({ recommendation, onReset }: Props) {
  const { series, fired, verdict, asOfDay } = recommendation
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | null>(null)

  const specs: MetricSpec[] = [
    { key: 'hrv', label: 'HRV (SDNN)', unit: 'ms', series: series.hrv, higherIsBetter: true, precision: 0 },
    { key: 'rhr', label: 'Resting HR', unit: 'bpm', series: series.rhr, higherIsBetter: false, precision: 0 },
    { key: 'sleep', label: 'Sleep', unit: 'hrs', series: series.sleepHours, higherIsBetter: true, precision: 1 },
    { key: 'load', label: 'Load', unit: 'min', series: series.workoutMin, higherIsBetter: false, precision: 0 },
  ]

  const days = collectLast14Days(specs, asOfDay)
  const baselines = computeBaselines(specs)
  const todayIso = days[days.length - 1] ?? asOfDay
  const summary = narrative(specs, asOfDay)
  const meta = metaRule(fired)
  const allRules = meta ? [meta, ...fired] : fired
  const badge = VERDICT_BADGE[verdict]

  const toggleDay = (day: string) =>
    setSelectedDay((cur) => (cur === day ? null : day))

  const toggleMetric = (m: MetricKey) =>
    setExpandedMetric((cur) => (cur === m ? null : m))

  const hintLabel =
    expandedMetric !== null
      ? 'metric expanded'
      : selectedDay !== null
        ? 'day selected'
        : 'tap a cell or row'

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.15em] text-faint">
            recovery-trail · 14d
          </div>
          <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
            Briefing
          </h2>
        </div>
        <div className="text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-faint">
            Verdict
          </div>
          <span
            className={`mt-1 inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.15em] ${badge.border} ${badge.text}`}
          >
            <span className={`size-1.5 rounded-full ${badge.dot}`} />
            {VERDICT_LABEL[verdict]}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="text-[11px] text-faint transition-colors hover:text-ink"
      >
        ← new file
      </button>

      <div className="rounded-xl border border-panelLine bg-panel p-4">
        <div className="grid grid-cols-[56px_1fr_56px] items-center gap-3 px-1 font-mono text-[9.5px] text-faint">
          <div />
          <div className="flex justify-between">
            <span>{shortDay(days[0])}</span>
            <span>{shortDay(days[Math.floor(days.length / 2)])}</span>
            <span className="text-ink">{shortDay(todayIso)}</span>
          </div>
          <div />
        </div>

        <div className="mt-2 space-y-1.5">
          {specs.map((spec) => {
            const baseline = baselines[spec.key]
            const valueByDay = new Map(spec.series.map((m) => [m.day, m.value]))
            const today = valueByDay.get(todayIso) ?? null
            const dev =
              today !== null && baseline !== null && baseline !== 0
                ? ((today - baseline) / baseline) * 100
                : null
            const polaritySigned = spec.higherIsBetter ? -1 : 1
            const isBad = dev !== null && polaritySigned * dev > 3
            const isGood = dev !== null && polaritySigned * dev < -3

            return (
              <div
                key={spec.key}
                className={`grid grid-cols-[56px_1fr_56px] items-center gap-3 rounded-md ${
                  expandedMetric === spec.key ? 'bg-white/[0.025]' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleMetric(spec.key)}
                  className={`text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] rounded transition-colors px-1 py-1 hover:bg-white/5 ${
                    expandedMetric === spec.key ? 'text-ink' : 'text-muted'
                  }`}
                >
                  {METRIC_ROW_LABEL[spec.key]}
                </button>
                {expandedMetric === spec.key ? (
                  <MetricChart
                    spec={spec}
                    days={days}
                    baseline={baseline}
                    selectedDay={selectedDay}
                    badToday={isBad}
                    onSelectDay={toggleDay}
                  />
                ) : (
                  <div className="grid grid-flow-col grid-cols-[repeat(14,minmax(0,1fr))] gap-[2px]">
                    {days.map((day) => {
                      const v = valueByDay.get(day) ?? null
                      const tier = cellTier(v, baseline, spec.higherIsBetter)
                      const isSelected = selectedDay === day
                      const isTodayCell = day === todayIso
                      const outline =
                        isSelected
                          ? 'outline outline-[1.5px] outline-ink'
                          : isTodayCell && selectedDay === null
                            ? 'outline outline-1 outline-white/35'
                            : ''
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          title={`${day} · ${v === null ? '—' : v.toFixed(spec.precision)} ${spec.unit}`}
                          className={`aspect-square rounded-[3px] transition-[transform,opacity] active:scale-90 ${outline}`}
                          style={{ background: CELL_COLOR_HEX[tier] }}
                        />
                      )
                    })}
                  </div>
                )}
                <div className="text-right font-mono tabular-nums">
                  <div className="text-sm font-medium text-ink">
                    {today !== null ? today.toFixed(spec.precision) : '—'}
                  </div>
                  <div
                    className={`text-[10.5px] ${
                      isBad ? 'text-rust' : isGood ? 'text-teal' : 'text-faint'
                    }`}
                  >
                    {dev !== null ? `${dev >= 0 ? '+' : ''}${dev.toFixed(0)}%` : '—'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-3.5 flex items-center gap-2 border-t border-panelLine pt-2.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
          <span>{hintLabel}</span>
          <div className="ml-auto flex gap-[2px]">
            {(['goodStrong', 'goodMild', 'flat', 'badMild', 'badStrong'] as CellTier[]).map((t) => (
              <div
                key={t}
                className="h-2 w-3.5 rounded-[2px]"
                style={{ background: CELL_COLOR_HEX[t] }}
              />
            ))}
          </div>
          <span>worse</span>
        </div>
      </div>

      {selectedDay && (
        <DayInspector
          day={selectedDay}
          isToday={selectedDay === todayIso}
          specs={specs}
          baselines={baselines}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {!selectedDay && (
        <p className="text-[14px] leading-relaxed text-ink">{summary}</p>
      )}

      <div>
        <h3 className="px-1 text-[10.5px] font-medium uppercase tracking-[0.15em] text-faint">
          {allRules.length === 0
            ? 'no rules fired'
            : `${allRules.length} rule${allRules.length === 1 ? '' : 's'} fired`}
        </h3>
        <ul className="mt-1 divide-y divide-panelLine">
          {allRules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} />
          ))}
        </ul>
      </div>
    </div>
  )
}

function RuleRow({ rule }: { rule: FiredRule }) {
  const isMeta = rule.id === 'meta_recovery_stack'
  const sev = rule.severity === 'deload' ? 'text-rust border-rust' : 'text-amber border-amber'
  const evidenceLine = isMeta ? null : formatEvidenceLine(rule)
  return (
    <li className="px-2 py-3">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] ${sev}`}
        >
          {rule.severity}
        </span>
        <span className="text-[13px] font-medium text-ink">{rule.name}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{rule.why}</p>
      {evidenceLine && (
        <p className="mt-1.5 font-mono text-[10.5px] tabular-nums text-faint">
          {evidenceLine}
        </p>
      )}
    </li>
  )
}

function formatEvidenceLine(rule: FiredRule): string {
  const e = rule.evidence
  if ('shortMean' in e && 'baselineMean' in e && 'ratio' in e) {
    return `7d ${e.shortMean}  base ${e.baselineMean}  ×${(e.ratio as number).toFixed(2)}`
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
  return Array.from(set)
    .filter((d) => d <= asOfDay)
    .sort()
    .slice(-14)
}

function computeBaselines(specs: MetricSpec[]): Record<MetricKey, number | null> {
  const out = {} as Record<MetricKey, number | null>
  for (const s of specs) {
    const tail = s.series.slice(-28)
    out[s.key] = tail.length === 0 ? null : tail.reduce((a, b) => a + b.value, 0) / tail.length
  }
  return out
}

function shortDay(iso: string): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}
