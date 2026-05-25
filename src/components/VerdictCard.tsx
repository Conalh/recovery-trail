import type { Severity } from '../rules/evaluate'

const VERDICT_COPY: Record<Severity, { label: string; tagline: string; classes: string }> = {
  standard: {
    label: 'Standard',
    tagline: 'Recovery looks normal. Train as planned.',
    classes: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  },
  caution: {
    label: 'Caution',
    tagline: 'Some recovery markers are off. Hold intensity, monitor.',
    classes: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  },
  deload: {
    label: 'Deload',
    tagline: 'Recovery is compromised. Pull back this week.',
    classes: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  },
}

type Props = {
  verdict: Severity
  asOfDay: string
  firedCount: number
}

export function VerdictCard({ verdict, asOfDay, firedCount }: Props) {
  const copy = VERDICT_COPY[verdict]
  return (
    <div className={`rounded-lg border p-5 ${copy.classes}`}>
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-70">
            Recommendation · as of {asOfDay}
          </div>
          <div className="mt-1 text-2xl font-semibold">{copy.label}</div>
          <div className="mt-1 text-sm opacity-90">{copy.tagline}</div>
        </div>
        <div className="text-right text-xs opacity-70">
          {firedCount === 0
            ? 'no rules fired'
            : `${firedCount} rule${firedCount === 1 ? '' : 's'} fired`}
        </div>
      </div>
    </div>
  )
}
