import type { DailyMetric } from '../rules/aggregate'

type Props = {
  label: string
  unit: string
  /** Day-stamped metric series, oldest-first. Last 14 are shown. */
  series: DailyMetric[]
  baseline: number | null
  /** True if higher values are better (HRV, sleep). False for RHR. */
  higherIsBetter: boolean
  /** Y-axis decimal precision. */
  precision?: number
}

const HEIGHT = 260
const PAD_LEFT = 48
const PAD_RIGHT = 16
const PAD_TOP = 24
const PAD_BOTTOM = 32

/**
 * Hero chart: 14-day line with axis labels, baseline reference, and a
 * directional color hint (good vs concerning based on `higherIsBetter`).
 * Renders responsive width via viewBox + preserveAspectRatio.
 */
export function HeroChart({
  label,
  unit,
  series,
  baseline,
  higherIsBetter,
  precision = 0,
}: Props) {
  const recent = series.slice(-14)
  if (recent.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-500">
        Not enough data yet for {label}.
      </div>
    )
  }

  const WIDTH = 880
  const innerW = WIDTH - PAD_LEFT - PAD_RIGHT
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM

  const values = recent.map((m) => m.value)
  const refs = baseline !== null ? [...values, baseline] : values
  const dataMin = Math.min(...refs)
  const dataMax = Math.max(...refs)
  const pad = (dataMax - dataMin) * 0.15 || 1
  const yMin = dataMin - pad
  const yMax = dataMax + pad
  const yRange = yMax - yMin || 1

  const xStep = recent.length > 1 ? innerW / (recent.length - 1) : 0
  const xy = (i: number, v: number): [number, number] => [
    PAD_LEFT + i * xStep,
    PAD_TOP + innerH - ((v - yMin) / yRange) * innerH,
  ]

  const points = recent.map((m, i) => xy(i, m.value))
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const areaPath =
    `${linePath} L${points[points.length - 1][0].toFixed(1)},${(PAD_TOP + innerH).toFixed(1)} ` +
    `L${points[0][0].toFixed(1)},${(PAD_TOP + innerH).toFixed(1)} Z`

  const baselineY =
    baseline !== null ? PAD_TOP + innerH - ((baseline - yMin) / yRange) * innerH : null

  const current = values[values.length - 1]
  const delta =
    baseline !== null && baseline !== 0 ? ((current - baseline) / baseline) * 100 : null
  const directionGood =
    delta === null ? null : higherIsBetter ? delta >= -2 : delta <= 2
  const stroke = directionGood === null ? '#a1a1aa' : directionGood ? '#86efac' : '#fda4af'
  const fill = directionGood === null ? '#a1a1aa' : directionGood ? '#86efac' : '#fda4af'

  // Y-axis ticks: 3 evenly spaced.
  const yTicks = [yMin + yRange * 0.1, yMin + yRange * 0.5, yMin + yRange * 0.9]

  // X-axis labels: first, middle, last day (shortened to M-DD).
  const xLabels: { x: number; label: string }[] = []
  for (const i of [0, Math.floor(recent.length / 2), recent.length - 1]) {
    const [x] = xy(i, recent[i].value)
    xLabels.push({ x, label: shortDay(recent[i].day) })
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">
            14-day {label.toLowerCase()}
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <span className="text-3xl font-semibold tabular-nums text-zinc-100">
              {current.toFixed(precision)}
            </span>
            <span className="text-sm text-zinc-500">{unit}</span>
            {delta !== null && (
              <span
                className={`text-xs tabular-nums ${
                  directionGood ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {delta >= 0 ? '+' : ''}
                {delta.toFixed(0)}% vs 28-day baseline
              </span>
            )}
          </div>
        </div>
        {baseline !== null && (
          <div className="text-right text-xs text-zinc-500">
            baseline {baseline.toFixed(precision)} {unit}
          </div>
        )}
      </div>

      <svg
        className="mt-4 w-full"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label} over the last ${recent.length} days`}
      >
        <defs>
          <linearGradient id="area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={fill} stopOpacity={0.25} />
            <stop offset="100%" stopColor={fill} stopOpacity={0} />
          </linearGradient>
        </defs>

        {yTicks.map((v) => {
          const y = PAD_TOP + innerH - ((v - yMin) / yRange) * innerH
          return (
            <g key={v}>
              <line
                x1={PAD_LEFT}
                x2={WIDTH - PAD_RIGHT}
                y1={y}
                y2={y}
                stroke="#27272a"
                strokeWidth={1}
              />
              <text
                x={PAD_LEFT - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-zinc-500"
                fontSize={11}
              >
                {v.toFixed(precision)}
              </text>
            </g>
          )
        })}

        {baselineY !== null && (
          <line
            x1={PAD_LEFT}
            x2={WIDTH - PAD_RIGHT}
            y1={baselineY}
            y2={baselineY}
            stroke="#71717a"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        )}

        <path d={areaPath} fill="url(#area-grad)" />
        <path d={linePath} fill="none" stroke={stroke} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />

        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2.5} fill={stroke} />
        ))}

        {xLabels.map(({ x, label: l }) => (
          <text
            key={l + x}
            x={x}
            y={HEIGHT - 10}
            textAnchor="middle"
            className="fill-zinc-500"
            fontSize={11}
          >
            {l}
          </text>
        ))}
      </svg>
    </div>
  )
}

function shortDay(iso: string): string {
  // iso is YYYY-MM-DD; render as M/D for compactness.
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}
