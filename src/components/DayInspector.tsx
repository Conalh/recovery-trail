import { cellTier, type MetricKey, type MetricSpec } from '../rules/briefing'

const METRIC_LABEL: Record<MetricKey, string> = {
  hrv: 'HRV',
  rhr: 'RHR',
  respRate: 'RESP',
  sleep: 'SLEEP',
  sri: 'SRI',
  load: 'LOAD',
}

const CELL_COLOR_HEX: Record<string, string> = {
  goodStrong: '#2a8aa3',
  goodMild: '#1f5b6e',
  flat: '#1c252e',
  badMild: '#c46a55',
  badStrong: '#e85d4a',
  empty: 'rgba(28, 37, 46, 0.5)',
}

const ROW_STAGGER = [
  'stagger-6',
  'stagger-7',
  'stagger-8',
  'stagger-9',
  'stagger-10',
  'stagger-11',
]

type Props = {
  day: string
  isToday: boolean
  specs: MetricSpec[]
  baselines: Record<MetricKey, number | null>
  /** When true, run the slide-out animation. Parent unmounts after it finishes. */
  isClosing: boolean
  onClose: () => void
}

function shortDayLabel(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${Number(m)}/${Number(d)}`
}

export function DayInspector({ day, isToday, specs, baselines, isClosing, onClose }: Props) {
  return (
    <div
      className={`mt-3 rounded-xl border border-panelLine bg-panelDeep p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_12px_36px_-16px_rgba(0,0,0,0.7)] ${
        isClosing ? 'animate-slide-out-top' : 'animate-slide-in-top'
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] uppercase tracking-[0.15em] text-faint font-semibold">
            Day
          </span>
          <span
            key={day}
            className="animate-value-swap font-mono text-base font-medium text-ink tabular-nums"
          >
            {shortDayLabel(day)}
          </span>
          {isToday && (
            <span className="text-[11px] text-rust">· today</span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-white/5 hover:text-ink"
          aria-label="Close inspector"
        >
          <span className="text-base leading-none">×</span>
        </button>
      </div>

      <div className="space-y-2">
        {specs.map((spec, rowIdx) => {
          const baseline = baselines[spec.key]
          const sample = spec.series.find((m) => m.day === day)
          const value = sample?.value ?? null
          const tier = cellTier(value, baseline, spec.higherIsBetter)
          const dev =
            value !== null && baseline !== null && baseline !== 0
              ? ((value - baseline) / baseline) * 100
              : null
          const polaritySigned = spec.higherIsBetter ? -1 : 1
          const isBad = dev !== null && polaritySigned * dev > 3
          const isGood = dev !== null && polaritySigned * dev < -3
          const deltaColor = isBad ? 'text-rust' : isGood ? 'text-teal' : 'text-muted'

          return (
            <div
              key={spec.key}
              className={`stagger-in ${ROW_STAGGER[rowIdx]} flex items-center gap-3 font-mono text-[12.5px] tabular-nums`}
            >
              <div
                key={`${day}-${spec.key}-swatch`}
                className="size-3 shrink-0 rounded-[3px] transition-colors"
                style={{ background: CELL_COLOR_HEX[tier] }}
              />
              <div className="w-11 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                {METRIC_LABEL[spec.key]}
              </div>
              <div className="w-14 text-sm font-medium text-ink">
                <span key={`${day}-${spec.key}-val`} className="animate-value-swap">
                  {value !== null ? value.toFixed(spec.precision) : '—'}
                </span>
                <span className="ml-1 text-[10px] text-faint">{spec.unit}</span>
              </div>
              <div className="flex-1 text-[11px] text-faint">
                base{' '}
                <span className="text-muted">
                  {baseline !== null ? baseline.toFixed(spec.precision) : '—'}
                </span>
              </div>
              <div className={`text-xs font-semibold ${deltaColor}`}>
                <span key={`${day}-${spec.key}-dev`} className="animate-value-swap">
                  {dev !== null ? `${dev >= 0 ? '+' : ''}${dev.toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
