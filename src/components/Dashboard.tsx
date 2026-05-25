import type { Recommendation } from '../rules/evaluate'
import { MetricCard } from './MetricCard'
import { RuleTrace } from './RuleTrace'
import { VerdictCard } from './VerdictCard'

type Props = {
  recommendation: Recommendation
  onReset: () => void
}

function last(values: number[]): number | null {
  return values.length === 0 ? null : values[values.length - 1]
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function Dashboard({ recommendation, onReset }: Props) {
  const hrv = recommendation.series.hrv.slice(-14).map((m) => m.value)
  const rhr = recommendation.series.rhr.slice(-14).map((m) => m.value)
  const sleep = recommendation.series.sleepHours.slice(-14).map((m) => m.value)
  const work = recommendation.series.workoutMin.slice(-14).map((m) => m.value)

  const hrvBaseline = mean(recommendation.series.hrv.slice(-28).map((m) => m.value))
  const rhrBaseline = mean(recommendation.series.rhr.slice(-28).map((m) => m.value))
  const sleepBaseline = mean(recommendation.series.sleepHours.slice(-28).map((m) => m.value))
  const workBaseline = mean(recommendation.series.workoutMin.slice(-28).map((m) => m.value))

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-medium text-zinc-200">Recovery picture</h2>
        <button
          type="button"
          onClick={onReset}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← import a different file
        </button>
      </div>

      <VerdictCard
        verdict={recommendation.verdict}
        asOfDay={recommendation.asOfDay}
        firedCount={recommendation.fired.length}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="HRV (SDNN)"
          unit="ms"
          current={last(hrv)}
          baseline={hrvBaseline}
          series={hrv}
          higherIsBetter
          precision={0}
        />
        <MetricCard
          label="Resting HR"
          unit="bpm"
          current={last(rhr)}
          baseline={rhrBaseline}
          series={rhr}
          higherIsBetter={false}
          precision={0}
        />
        <MetricCard
          label="Sleep"
          unit="hours"
          current={last(sleep)}
          baseline={sleepBaseline}
          series={sleep}
          higherIsBetter
          precision={1}
        />
        <MetricCard
          label="Workout load"
          unit="min/day"
          current={last(work)}
          baseline={workBaseline}
          series={work}
          higherIsBetter
          precision={0}
        />
      </div>

      <div>
        <h2 className="mb-3 text-lg font-medium text-zinc-200">Why this verdict</h2>
        <RuleTrace fired={recommendation.fired} />
      </div>
    </div>
  )
}
