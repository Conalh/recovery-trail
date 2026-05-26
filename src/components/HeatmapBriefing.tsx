import { useEffect, useState } from 'react'
import type { FiredRule, Recommendation, Severity } from '../rules/evaluate'
import {
  cellTier,
  metaRule,
  metricOfRule,
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

type HoveredCell = {
  day: string
  metric: MetricKey
  value: number | null
  spec: MetricSpec
}

const INSPECTOR_EXIT_MS = 220

export function HeatmapBriefing({ recommendation, onReset }: Props) {
  const { series, fired, verdict, asOfDay } = recommendation
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | null>(null)
  const [hoveredMetric, setHoveredMetric] = useState<MetricKey | null>(null)
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null)
  const [inspectorClosing, setInspectorClosing] = useState(false)
  const [focusedRuleId, setFocusedRuleId] = useState<string | null>(null)

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

  const focusedRule = focusedRuleId
    ? allRules.find((r) => r.id === focusedRuleId) ?? null
    : null
  const focusedMetric = focusedRule ? metricOfRule(focusedRule.id) : null

  const closeInspector = () => {
    if (selectedDay === null) return
    setInspectorClosing(true)
    setTimeout(() => {
      setSelectedDay(null)
      setInspectorClosing(false)
    }, INSPECTOR_EXIT_MS)
  }

  const toggleDay = (day: string) => {
    if (focusedRuleId) setFocusedRuleId(null)
    if (selectedDay === day) {
      closeInspector()
    } else {
      setSelectedDay(day)
      setInspectorClosing(false)
    }
  }

  const toggleMetric = (m: MetricKey) => {
    if (focusedRuleId) setFocusedRuleId(null)
    setExpandedMetric((cur) => (cur === m ? null : m))
  }

  const handleFocusRule = (id: string) => {
    const becoming = focusedRuleId === id ? null : id
    setFocusedRuleId(becoming)
    if (becoming !== null) {
      if (selectedDay) closeInspector()
      setExpandedMetric(null)
    }
  }

  // Keyboard navigation: arrows step days, Esc closes top-of-stack,
  // digits 1-4 toggle metric rows.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
      }

      if (e.key === 'Escape') {
        if (selectedDay) {
          closeInspector()
          e.preventDefault()
        } else if (expandedMetric) {
          setExpandedMetric(null)
          e.preventDefault()
        } else if (focusedRuleId) {
          setFocusedRuleId(null)
          e.preventDefault()
        }
        return
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (days.length === 0) return
        const dir = e.key === 'ArrowRight' ? 1 : -1
        const baseIdx = selectedDay ? days.indexOf(selectedDay) : days.length - 1
        const nextIdx = Math.max(0, Math.min(days.length - 1, baseIdx + dir))
        const nextDay = days[nextIdx]
        if (nextDay) {
          if (focusedRuleId) setFocusedRuleId(null)
          setSelectedDay(nextDay)
          setInspectorClosing(false)
        }
        e.preventDefault()
        return
      }

      if (e.key >= '1' && e.key <= '4') {
        const idx = Number(e.key) - 1
        const metric: MetricKey | undefined = (
          ['hrv', 'rhr', 'sleep', 'load'] as MetricKey[]
        )[idx]
        if (metric) {
          toggleMetric(metric)
          e.preventDefault()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay, expandedMetric, focusedRuleId, days.join('|')])

  const hintLabel = (() => {
    if (hoveredCell) {
      const { day, metric, value, spec } = hoveredCell
      const baseline = baselines[metric]
      const dev =
        value !== null && baseline !== null && baseline !== 0
          ? ((value - baseline) / baseline) * 100
          : null
      const valStr = value !== null ? value.toFixed(spec.precision) : '—'
      const devStr = dev !== null ? ` ${dev >= 0 ? '+' : ''}${dev.toFixed(0)}%` : ''
      return `${shortDay(day)} · ${METRIC_ROW_LABEL[metric]} ${valStr}${spec.unit}${devStr}`
    }
    if (focusedRule) return 'rule focused · tap again to clear'
    if (expandedMetric !== null) return 'metric expanded'
    if (selectedDay !== null) return 'day selected'
    return 'tap a cell, row, or rule'
  })()

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
            <span
              className={`size-1.5 rounded-full ${badge.dot} ${verdict === 'deload' ? 'animate-pulse-attention' : ''}`}
            />
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
            const isExpanded = expandedMetric === spec.key
            // Rule focus drives base dim state; hover overrides only when
            // no rule is focused, matching the prototype's interaction
            // hierarchy.
            let isRowDimmed = false
            let isRowHighlighted = false
            if (focusedRule) {
              if (focusedMetric) {
                isRowDimmed = focusedMetric !== spec.key
                isRowHighlighted = focusedMetric === spec.key
              }
              // meta-rule (focusedMetric === null) leaves all rows bright
            } else if (hoveredMetric) {
              isRowDimmed = hoveredMetric !== spec.key
              isRowHighlighted = hoveredMetric === spec.key
            }

            return (
              <div
                key={spec.key}
                onMouseEnter={() => setHoveredMetric(spec.key)}
                onMouseLeave={() => setHoveredMetric(null)}
                className={`grid grid-cols-[56px_1fr_56px] items-center gap-3 rounded-md transition-opacity duration-200 ${
                  isExpanded ? 'bg-white/[0.025]' : ''
                } ${isRowDimmed ? 'opacity-40' : 'opacity-100'}`}
              >
                <button
                  type="button"
                  onClick={() => toggleMetric(spec.key)}
                  className={`text-left text-[10.5px] font-semibold uppercase tracking-[0.1em] rounded transition-colors px-1 py-1 hover:bg-white/5 ${
                    isExpanded || isRowHighlighted ? 'text-ink' : 'text-muted'
                  }`}
                >
                  {METRIC_ROW_LABEL[spec.key]}
                </button>
                {isExpanded ? (
                  <div className="animate-fade-in">
                    <MetricChart
                      spec={spec}
                      days={days}
                      baseline={baseline}
                      selectedDay={selectedDay}
                      hoveredDay={
                        hoveredCell && hoveredCell.metric === spec.key
                          ? hoveredCell.day
                          : null
                      }
                      badToday={isBad}
                      onSelectDay={toggleDay}
                      onHoverDay={(day) => {
                        if (day === null) {
                          setHoveredCell(null)
                        } else {
                          const v = valueByDay.get(day) ?? null
                          setHoveredCell({ day, metric: spec.key, value: v, spec })
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div
                    className="animate-fade-in grid grid-flow-col grid-cols-[repeat(14,minmax(0,1fr))] gap-[2px]"
                    onMouseLeave={() => setHoveredCell(null)}
                  >
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
                          onMouseEnter={() =>
                            setHoveredCell({ day, metric: spec.key, value: v, spec })
                          }
                          aria-label={`${day} ${METRIC_ROW_LABEL[spec.key]} ${
                            v === null ? 'no data' : v.toFixed(spec.precision) + ' ' + spec.unit
                          }`}
                          className={`aspect-square rounded-[3px] transition duration-150 hover:scale-110 hover:brightness-125 active:scale-90 ${outline}`}
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
          <span className="transition-colors">{hintLabel}</span>
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
          isClosing={inspectorClosing}
          onClose={closeInspector}
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
            <RuleRow
              key={rule.id}
              rule={rule}
              focused={focusedRuleId === rule.id}
              onClick={() => handleFocusRule(rule.id)}
            />
          ))}
        </ul>
      </div>
    </div>
  )
}

type RuleRowProps = {
  rule: FiredRule
  focused: boolean
  onClick: () => void
}

function RuleRow({ rule, focused, onClick }: RuleRowProps) {
  const isMeta = rule.id === 'meta_recovery_stack'
  const sev = rule.severity === 'deload' ? 'text-rust border-rust' : 'text-amber border-amber'
  const focusBorder = rule.severity === 'deload' ? 'border-l-rust' : 'border-l-amber'
  const hoverBorder = rule.severity === 'deload' ? 'hover:border-l-rust' : 'hover:border-l-amber'
  const focusBg = rule.severity === 'deload' ? 'bg-rust/[0.07]' : 'bg-amber/[0.06]'
  const evidenceLine = isMeta ? null : formatEvidenceLine(rule)

  const borderClass = focused
    ? `border-l-2 ${focusBorder}`
    : `border-l-2 border-l-transparent ${hoverBorder}`
  const bgClass = focused ? focusBg : 'hover:bg-white/[0.02]'

  return (
    <li
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={focused}
      className={`cursor-pointer px-2 py-3 transition-colors ${borderClass} ${bgClass}`}
    >
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
