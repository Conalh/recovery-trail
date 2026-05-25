import type { FiredRule, Severity } from '../rules/evaluate'

const SEVERITY_BADGE: Record<Severity, string> = {
  standard: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  caution: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  deload: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
}

type Props = {
  fired: FiredRule[]
}

export function RuleTrace({ fired }: Props) {
  if (fired.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
        No rules fired. Every metric is within its expected window.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {fired.map((rule) => (
        <details
          key={rule.id}
          className="group rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
        >
          <summary className="flex cursor-pointer items-center gap-3 list-none">
            <span
              className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] uppercase tracking-wider ${SEVERITY_BADGE[rule.severity]}`}
            >
              {rule.severity}
            </span>
            <span className="text-sm font-medium text-zinc-100">{rule.name}</span>
            <span className="ml-auto text-xs text-zinc-500 group-open:hidden">why?</span>
          </summary>
          <div className="mt-3 text-sm text-zinc-300">{rule.why}</div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {Object.entries(rule.evidence).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-zinc-500">{k}</dt>
                <dd className="text-zinc-300 tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 text-[11px] text-zinc-600">rule id: {rule.id}</div>
        </details>
      ))}
    </div>
  )
}
