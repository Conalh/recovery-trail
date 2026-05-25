type Props = {
  values: number[]
  width?: number
  height?: number
  stroke?: string
  /** Optional reference line value (e.g. baseline mean). */
  baseline?: number
}

/**
 * Tiny dependency-free SVG sparkline. Renders a polyline over the most-recent
 * N values, with an optional horizontal baseline reference.
 */
export function Sparkline({
  values,
  width = 240,
  height = 56,
  stroke = '#86efac',
  baseline,
}: Props) {
  if (values.length === 0) {
    return <div className="text-zinc-600 text-xs">no data</div>
  }
  const refs = baseline !== undefined ? [...values, baseline] : values
  const min = Math.min(...refs)
  const max = Math.max(...refs)
  const range = max - min || 1
  const padY = 4
  const innerH = height - padY * 2

  const xStep = values.length > 1 ? width / (values.length - 1) : 0
  const points = values
    .map((v, i) => {
      const x = i * xStep
      const y = padY + innerH - ((v - min) / range) * innerH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const baselineY =
    baseline !== undefined ? padY + innerH - ((baseline - min) / range) * innerH : null

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="sparkline"
    >
      {baselineY !== null && (
        <line
          x1={0}
          x2={width}
          y1={baselineY}
          y2={baselineY}
          stroke="#3f3f46"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  )
}
