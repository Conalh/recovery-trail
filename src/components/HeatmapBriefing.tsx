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

const VERDICT_BADGE: Record<Severity, { border: string; text: string; dot: string; glow: string }> = {
  standard: { border: 'border-teal', text: 'text-teal', dot: 'bg-teal', glow: 'glow-teal' },
  caution: { border: 'border-amber', text: 'text-amber', dot: 'bg-amber', glow: 'glow-amber' },
  deload: { border: 'border-rust', text: 'text-rust', dot: 'bg-rust', glow: 'glow-rust' },
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

/** RGB triplet form of each tier color, fed to .cell-selected via --cell-rgb. */
const CELL_COLOR_RGB: Record<CellTier, string> = {
  goodStrong: '42, 138, 163',
  goodMild: '31, 91, 110',
  flat: '110, 130, 150',
  badMild: '196, 106, 85',
  badStrong: '232, 93, 74',
  empty: '110, 130, 150',
}

const METRIC_ROW_LABEL: Record<MetricKey, string> = {
  hrv: 'HRV',
  rhr: 'RHR',
  respRate: 'RESP',
  sleep: 'SLEEP',
  sri: 'SRI',
  load: 'LOAD',
}

type HoveredCell = {
  day: string
  metric: MetricKey
  value: number | null
  spec: MetricSpec
}

const INSPECTOR_EXIT_MS = 220
const ROW_STAGGER_CLASSES = [
  'stagger-6',
  'stagger-7',
  'stagger-8',
  'stagger-9',
  'stagger-10',
  'stagger-11',
]
type WindowSize = 14 | 28
const WINDOW_OPTIONS: WindowSize[] = [14, 28]

export function HeatmapBriefing({ recommendation, onReset }: Props) {
  const { series, fired, verdict, asOfDay, baselines, insufficientData } = recommendation
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | null>(null)
  const [hoveredMetric, setHoveredMetric] = useState<MetricKey | null>(null)
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null)
  const [inspectorClosing, setInspectorClosing] = useState(false)
  const [focusedRuleId, setFocusedRuleId] = useState<string | null>(null)
  const [windowSize, setWindowSize] = useState<WindowSize>(14)

  const specs: MetricSpec[] = [
    { key: 'hrv', label: 'HRV (SDNN)', unit: 'ms', series: series.hrv, higherIsBetter: true, precision: 0 },
    { key: 'rhr', label: 'Resting HR', unit: 'bpm', series: series.rhr, higherIsBetter: false, precision: 0 },
    { key: 'respRate', label: 'Resp rate', unit: 'brpm', series: series.respRate, higherIsBetter: false, precision: 1 },
    { key: 'sleep', label: 'Sleep', unit: 'hrs', series: series.sleepHours, higherIsBetter: true, precision: 1 },
    { key: 'sri', label: 'Sleep regularity', unit: 'SRI', series: series.sri, higherIsBetter: true, precision: 0 },
    { key: 'load', label: 'Load', unit: 'min', series: series.workoutMin, higherIsBetter: false, precision: 0 },
  ]

  const days = collectLastNDays(specs, asOfDay, windowSize)
  const todayIso = days[days.length - 1] ?? asOfDay
  const summary = narrative(specs, asOfDay, baselines)
  const insufficientMetrics = [
    insufficientData.hrv ? 'HRV' : null,
    insufficientData.rhr ? 'resting HR' : null,
  ].filter((x): x is string => x !== null)
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

      if (e.key >= '1' && e.key <= '6') {
        const idx = Number(e.key) - 1
        const metric: MetricKey | undefined = (
          ['hrv', 'rhr', 'respRate', 'sleep', 'sri', 'load'] as MetricKey[]
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
    <div className="space-y-5" data-testid="briefing">
      <div className="stagger-in stagger-1 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10.5px] font-medium uppercase tracking-[0.15em] text-faint">
            <span>recovery-trail</span>
            <span className="text-fainter">·</span>
            <div
              className="inline-flex overflow-hidden rounded border border-fainter"
              role="tablist"
              aria-label="window size"
            >
              {WINDOW_OPTIONS.map((w) => (
                <button
                  key={w}
                  type="button"
                  role="tab"
                  aria-selected={windowSize === w}
                  onClick={() => setWindowSize(w)}
                  className={`px-1.5 py-[1px] font-mono text-[10px] tracking-[0.05em] transition-colors ${
                    windowSize === w
                      ? 'bg-white/[0.07] text-ink'
                      : 'text-muted hover:bg-white/[0.03] hover:text-ink'
                  }`}
                >
                  {w}d
                </button>
              ))}
            </div>
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
              className={`size-1.5 rounded-full ${badge.dot} ${badge.glow} ${verdict === 'deload' ? 'animate-pulse-attention' : ''}`}
            />
            {VERDICT_LABEL[verdict]}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="stagger-in stagger-2 text-[11px] text-faint transition-colors hover:text-ink"
      >
        ← new file
      </button>

      <div
        className="stagger-in stagger-3 rounded-xl border border-panelLine bg-panel p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_30px_-12px_rgba(0,0,0,0.6)]"
        data-testid="briefing-heatmap"
      >
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
          {specs.map((spec, rowIdx) => {
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
            let isRowDimmed = false
            let isRowHighlighted = false
            if (focusedRule) {
              if (focusedMetric) {
                isRowDimmed = focusedMetric !== spec.key
                isRowHighlighted = focusedMetric === spec.key
              }
            } else if (hoveredMetric) {
              isRowDimmed = hoveredMetric !== spec.key
              isRowHighlighted = hoveredMetric === spec.key
            }

            const rowState = isRowDimmed
              ? 'opacity-50 saturate-[0.55]'
              : 'opacity-100 saturate-100'

            return (
              <div
                key={spec.key}
                onMouseEnter={() => setHoveredMetric(spec.key)}
                onMouseLeave={() => setHoveredMetric(null)}
                className={`stagger-in ${ROW_STAGGER_CLASSES[rowIdx]} grid grid-cols-[56px_1fr_56px] items-center gap-3 rounded-md transition-[opacity,filter,background-color] duration-300 ${
                  isExpanded ? 'bg-white/[0.025]' : ''
                } ${rowState}`}
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
                    className="animate-fade-in grid grid-flow-col gap-[2px]"
                    style={{
                      gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                    }}
                    onMouseLeave={() => setHoveredCell(null)}
                  >
                    {days.map((day) => {
                      const v = valueByDay.get(day) ?? null
                      const tier = cellTier(v, baseline, spec.higherIsBetter)
                      const isSelected = selectedDay === day
                      const isTodayCell = day === todayIso
                      const stateClass = isSelected
                        ? 'cell-selected'
                        : isTodayCell && selectedDay === null
                          ? 'cell-today'
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
                          className={`aspect-square rounded-[3px] transition duration-150 hover:scale-110 hover:brightness-125 hover:shadow-[0_0_8px_rgba(255,255,255,0.25)] active:scale-90 ${stateClass}`}
                          style={
                            {
                              background: CELL_COLOR_HEX[tier],
                              '--cell-rgb': CELL_COLOR_RGB[tier],
                            } as React.CSSProperties
                          }
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
        <p className="stagger-in stagger-4 text-[14px] leading-relaxed text-ink">
          {summary}
        </p>
      )}

      {insufficientMetrics.length > 0 && (
        <p className="rounded-md border border-panelLine bg-white/[0.02] px-3 py-2 text-[11.5px] leading-relaxed text-faint">
          Insufficient recent {insufficientMetrics.join(' & ')} data (fewer than 3
          readings in the last 7 days) —{' '}
          {insufficientMetrics.length > 1 ? 'those level checks were' : 'that level check was'}{' '}
          skipped rather than read as a drop.
        </p>
      )}

      <div className="stagger-in stagger-5" data-testid="briefing-rules">
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

      <p className="border-t border-panelLine pt-3 text-[10.5px] leading-relaxed text-faint">
        Exploratory training signal, not medical advice. Talk to a clinician for
        anything that matters.
      </p>
    </div>
  )
}

type RuleRowProps = {
  rule: FiredRule
  focused: boolean
  onClick: () => void
}

const WINDOW_BADGE_LABEL: Record<NonNullable<FiredRule['windowsFired']>, string> = {
  acute: '7d',
  chronic: '28d',
  both: '7d + 28d',
}

function RuleRow({ rule, focused, onClick }: RuleRowProps) {
  const isMeta = rule.id === 'meta_recovery_stack'
  const sev = rule.severity === 'deload' ? 'text-rust border-rust' : 'text-amber border-amber'
  const focusBorder = rule.severity === 'deload' ? 'border-l-rust' : 'border-l-amber'
  const hoverBorder = rule.severity === 'deload' ? 'hover:border-l-rust' : 'hover:border-l-amber'
  const focusBg = rule.severity === 'deload' ? 'bg-rust/[0.07]' : 'bg-amber/[0.06]'
  const focusGlow =
    rule.severity === 'deload'
      ? 'shadow-[inset_3px_0_14px_-4px_rgba(232,93,74,0.45)]'
      : 'shadow-[inset_3px_0_14px_-4px_rgba(224,164,88,0.45)]'
  const evidenceLine = isMeta ? null : formatEvidenceLine(rule)

  const borderClass = focused
    ? `border-l-2 ${focusBorder}`
    : `border-l-2 border-l-transparent ${hoverBorder}`
  const bgClass = focused ? `${focusBg} ${focusGlow}` : 'hover:bg-white/[0.02]'

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
      className={`cursor-pointer px-2 py-3 transition-all duration-200 ${borderClass} ${bgClass}`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex border px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] ${sev}`}
        >
          {rule.severity}
        </span>
        <span className="text-[13px] font-medium text-ink">{rule.name}</span>
        {rule.windowsFired && (
          <span
            className="ml-auto inline-flex rounded-sm border border-fainter bg-white/[0.03] px-1.5 py-[1px] font-mono text-[9.5px] font-medium tracking-[0.05em] text-muted"
            title="Which dual-window detector(s) fired before the combiner"
          >
            {WINDOW_BADGE_LABEL[rule.windowsFired]}
          </span>
        )}
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
  // Trend rules: surface the dual-window slope numbers in SD/day.
  if (rule.slopes) {
    const parts: string[] = []
    if (rule.slopes.acute !== undefined) {
      parts.push(`7d ${formatSignedSd(rule.slopes.acute)} SD/d`)
    }
    if (rule.slopes.chronic !== undefined) {
      parts.push(`28d ${formatSignedSd(rule.slopes.chronic)} SD/d`)
    }
    return parts.join('   ')
  }
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
  if ('rampPct' in e && 'thisWeekMin' in e && 'priorWeeklyAvgMin' in e) {
    return `+${e.rampPct}% vs prior   7d ${e.thisWeekMin}min   prior ${e.priorWeeklyAvgMin}min/wk`
  }
  if ('riseBrpm' in e && 'shortMean' in e && 'baselineMean' in e) {
    return `7d ${e.shortMean}  base ${e.baselineMean}  +${e.riseBrpm}brpm`
  }
  return Object.entries(e)
    .map(([k, v]) => `${k} ${v}`)
    .join('  ')
}

function formatSignedSd(n: number): string {
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}`
}

function collectLastNDays(specs: MetricSpec[], asOfDay: string, n: number): string[] {
  const set = new Set<string>()
  for (const s of specs) for (const m of s.series.slice(-n)) set.add(m.day)
  return Array.from(set)
    .filter((d) => d <= asOfDay)
    .sort()
    .slice(-n)
}

function shortDay(iso: string): string {
  if (!iso) return ''
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}
