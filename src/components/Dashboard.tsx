import type { FiredRule, Recommendation } from '../rules/evaluate'
import { HeroChart } from './HeroChart'
import { MetricSection } from './MetricSection'
import { VerdictCard } from './VerdictCard'

type Props = {
  recommendation: Recommendation
  onReset: () => void
}

/** Map a rule id to the metric section it belongs under. */
function metricOf(ruleId: string): 'hrv' | 'rhr' | 'sleep' | 'workout' | null {
  if (ruleId.startsWith('hrv_')) return 'hrv'
  if (ruleId.startsWith('rhr_')) return 'rhr'
  if (ruleId.startsWith('sleep_')) return 'sleep'
  if (ruleId.startsWith('acwr_')) return 'workout'
  return null
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

export function Dashboard({ recommendation, onReset }: Props) {
  const { series, fired } = recommendation

  const grouped: Record<'hrv' | 'rhr' | 'sleep' | 'workout', FiredRule[]> = {
    hrv: [],
    rhr: [],
    sleep: [],
    workout: [],
  }
  for (const rule of fired) {
    const m = metricOf(rule.id)
    if (m) grouped[m].push(rule)
  }

  const hrvBaseline = mean(series.hrv.slice(-28).map((m) => m.value))

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

      <HeroChart
        label="HRV (SDNN)"
        unit="ms"
        series={series.hrv}
        baseline={hrvBaseline}
        higherIsBetter
        precision={0}
      />

      <VerdictCard
        verdict={recommendation.verdict}
        asOfDay={recommendation.asOfDay}
        firedCount={fired.length}
      />

      <div className="space-y-4">
        <MetricSection
          label="HRV (SDNN)"
          unit="ms"
          series={series.hrv}
          higherIsBetter
          precision={0}
          rules={grouped.hrv}
        />
        <MetricSection
          label="Resting heart rate"
          unit="bpm"
          series={series.rhr}
          higherIsBetter={false}
          precision={0}
          rules={grouped.rhr}
        />
        <MetricSection
          label="Sleep"
          unit="hours"
          series={series.sleepHours}
          higherIsBetter
          precision={1}
          rules={grouped.sleep}
        />
        <MetricSection
          label="Workout load"
          unit="min/day"
          series={series.workoutMin}
          higherIsBetter
          precision={0}
          rules={grouped.workout}
        />
      </div>
    </div>
  )
}
