import type { MetricSpec } from '../rules/briefing'

type Props = {
  spec: MetricSpec
  days: string[]
  baseline: number | null
  /** Currently selected day, or null. Renders a vertical line if set. */
  selectedDay: string | null
  /** Color the line rust if bad-today, teal otherwise. */
  badToday: boolean
  onSelectDay: (day: string) => void
}

const WIDTH = 268
const HEIGHT = 88
const PAD = { left: 6, right: 6, top: 10, bottom: 12 }

/**
 * In-row line chart shown when a metric label is tapped. Replaces the
 * heatmap cells for that row. Dots are clickable to select a day.
 */
export function MetricChart({
  spec,
  days,
  baseline,
  selectedDay,
  badToday,
  onSelectDay,
}: Props) {
  const valueByDay = new Map(spec.series.map((m) => [m.day, m.value]))
  const points = days.map((day) => ({ day, value: valueByDay.get(day) ?? null }))
  const known = points.filter((p): p is { day: string; value: number } => p.value !== null)

  if (known.length === 0 || baseline === null) {
    return (
      <div className="px-2 py-3 text-xs text-faint italic">no data for {spec.label}</div>
    )
  }

  const values = known.map((p) => p.value)
  const all = [...values, baseline]
  const dataMin = Math.min(...all)
  const dataMax = Math.max(...all)
  const yPad = spec.precision === 1 ? 0.4 : 2
  const yMin = dataMin - yPad
  const yMax = dataMax + yPad
  const yRange = yMax - yMin || 1

  const innerW = WIDTH - PAD.left - PAD.right
  const innerH = HEIGHT - PAD.top - PAD.bottom
  const xStep = days.length > 1 ? innerW / (days.length - 1) : 0

  const sx = (i: number) => PAD.left + i * xStep
  const sy = (v: number) => PAD.top + (1 - (v - yMin) / yRange) * innerH

  const path = points
    .map((p, i) => {
      if (p.value === null) return null
      const cmd = i === 0 || points[i - 1]?.value === null ? 'M' : 'L'
      return `${cmd}${sx(i).toFixed(1)} ${sy(p.value).toFixed(1)}`
    })
    .filter(Boolean)
    .join(' ')

  const baselineY = sy(baseline)
  const lastIdx = points.length - 1

  // 7-day window shading: highlight the rightmost 7 days.
  const windowStart = Math.max(0, days.length - 7)
  const winX0 = sx(windowStart)
  const winX1 = sx(lastIdx)

  const lineColor = badToday ? '#e85d4a' : '#2a8aa3'
  const selectedIdx =
    selectedDay !== null ? days.indexOf(selectedDay) : -1

  return (
    <svg
      className="block w-full animate-fade-in"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${spec.label} over the last ${days.length} days`}
    >
      <rect
        x={winX0}
        y={PAD.top - 2}
        width={winX1 - winX0}
        height={innerH + 4}
        fill="rgba(255,255,255,0.04)"
      />
      <line
        x1={PAD.left}
        x2={WIDTH - PAD.right}
        y1={baselineY}
        y2={baselineY}
        stroke="rgba(216,228,237,0.55)"
        strokeWidth={1}
        strokeDasharray="3 3"
        opacity={0.5}
      />
      <text
        x={WIDTH - PAD.right}
        y={baselineY - 4}
        textAnchor="end"
        fontSize={9}
        fill="rgba(216,228,237,0.55)"
        fontFamily='"JetBrains Mono", ui-monospace, monospace'
      >
        base {baseline.toFixed(spec.precision)}
      </text>
      <path
        d={path}
        fill="none"
        stroke={lineColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => {
        if (p.value === null) return null
        const isLast = i === lastIdx
        return (
          <circle
            key={p.day}
            cx={sx(i)}
            cy={sy(p.value)}
            r={isLast ? 3 : 1.7}
            fill={isLast ? lineColor : '#d8e4ed'}
            opacity={isLast ? 1 : 0.55}
            onClick={() => onSelectDay(p.day)}
            className="cursor-pointer"
          />
        )
      })}
      {selectedIdx >= 0 && (
        <line
          x1={sx(selectedIdx)}
          x2={sx(selectedIdx)}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
          stroke="#d8e4ed"
          strokeWidth={1}
          opacity={0.6}
        />
      )}
    </svg>
  )
}
