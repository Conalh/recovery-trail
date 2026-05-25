import type { Recommendation } from '../rules/evaluate'
import { HeatmapBriefing } from './HeatmapBriefing'

type Props = {
  recommendation: Recommendation
  onReset: () => void
}

export function Dashboard({ recommendation, onReset }: Props) {
  return <HeatmapBriefing recommendation={recommendation} onReset={onReset} />
}
