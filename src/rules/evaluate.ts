import type { ParsedExport } from '../lib/types'
import thresholds from './thresholds.json'
import {
  dailyHrv,
  dailyRhr,
  dailySleepHours,
  dailyWorkoutMinutes,
  latestDay,
  windowMean,
  windowSum,
  type DailyMetric,
} from './aggregate'

export type Severity = 'standard' | 'caution' | 'deload'

const SEVERITY_ORDER: Record<Severity, number> = {
  standard: 0,
  caution: 1,
  deload: 2,
}

export type FiredRule = {
  id: string
  name: string
  severity: Severity
  why: string
  /** Numeric trace of what the rule actually saw. */
  evidence: Record<string, number>
}

export type Recommendation = {
  /** ISO calendar day this assessment is anchored to. */
  asOfDay: string
  /** Highest-severity verdict across fired rules; standard if none fire. */
  verdict: Severity
  fired: FiredRule[]
  series: {
    hrv: DailyMetric[]
    rhr: DailyMetric[]
    sleepHours: DailyMetric[]
    workoutMin: DailyMetric[]
  }
}

export function evaluate(parsed: ParsedExport): Recommendation | null {
  const asOfDay = latestDay(parsed)
  if (!asOfDay) return null

  const hrv = dailyHrv(parsed.hrv)
  const rhr = dailyRhr(parsed.rhr)
  const sleepHours = dailySleepHours(parsed.sleep)
  const workoutMin = dailyWorkoutMinutes(parsed.workouts)

  const fired: FiredRule[] = []

  // --- HRV vs baseline ---
  const hrvShort = windowMean(hrv, asOfDay, thresholds.hrv.shortWindowDays)
  const hrvBase = windowMean(hrv, asOfDay, thresholds.hrv.baselineWindowDays)
  if (hrvShort.count >= 3 && hrvBase.count >= 7 && hrvBase.mean > 0) {
    const ratio = hrvShort.mean / hrvBase.mean
    if (ratio < thresholds.hrv.deloadRatio) {
      fired.push({
        id: 'hrv_deload',
        name: 'HRV well below baseline',
        severity: 'deload',
        why: `7-day HRV is ${(ratio * 100).toFixed(0)}% of your 28-day baseline (below ${(thresholds.hrv.deloadRatio * 100).toFixed(0)}%).`,
        evidence: { shortMean: round1(hrvShort.mean), baselineMean: round1(hrvBase.mean), ratio: round2(ratio) },
      })
    } else if (ratio < thresholds.hrv.cautionRatio) {
      fired.push({
        id: 'hrv_caution',
        name: 'HRV trending below baseline',
        severity: 'caution',
        why: `7-day HRV is ${(ratio * 100).toFixed(0)}% of your 28-day baseline.`,
        evidence: { shortMean: round1(hrvShort.mean), baselineMean: round1(hrvBase.mean), ratio: round2(ratio) },
      })
    }
  }

  // --- RHR vs baseline ---
  const rhrShort = windowMean(rhr, asOfDay, thresholds.rhr.shortWindowDays)
  const rhrBase = windowMean(rhr, asOfDay, thresholds.rhr.baselineWindowDays)
  if (rhrShort.count >= 3 && rhrBase.count >= 7 && rhrBase.mean > 0) {
    const ratio = rhrShort.mean / rhrBase.mean
    if (ratio > thresholds.rhr.deloadRatio) {
      fired.push({
        id: 'rhr_deload',
        name: 'Resting HR elevated',
        severity: 'deload',
        why: `7-day RHR is ${(ratio * 100).toFixed(0)}% of your 28-day baseline (above ${(thresholds.rhr.deloadRatio * 100).toFixed(0)}%).`,
        evidence: { shortMean: round1(rhrShort.mean), baselineMean: round1(rhrBase.mean), ratio: round2(ratio) },
      })
    } else if (ratio > thresholds.rhr.cautionRatio) {
      fired.push({
        id: 'rhr_caution',
        name: 'Resting HR trending up',
        severity: 'caution',
        why: `7-day RHR is ${(ratio * 100).toFixed(0)}% of your 28-day baseline.`,
        evidence: { shortMean: round1(rhrShort.mean), baselineMean: round1(rhrBase.mean), ratio: round2(ratio) },
      })
    }
  }

  // --- Sleep ---
  const sleepWin = windowMean(sleepHours, asOfDay, thresholds.sleep.windowDays)
  if (sleepWin.count >= 3) {
    if (sleepWin.mean < thresholds.sleep.deloadMinHours) {
      fired.push({
        id: 'sleep_deload',
        name: 'Sleep debt',
        severity: 'deload',
        why: `Averaging ${sleepWin.mean.toFixed(1)}h sleep over the past ${thresholds.sleep.windowDays} days.`,
        evidence: { mean: round1(sleepWin.mean), nights: sleepWin.count },
      })
    } else if (sleepWin.mean < thresholds.sleep.cautionMinHours) {
      fired.push({
        id: 'sleep_caution',
        name: 'Sleep below target',
        severity: 'caution',
        why: `Averaging ${sleepWin.mean.toFixed(1)}h sleep over the past ${thresholds.sleep.windowDays} days.`,
        evidence: { mean: round1(sleepWin.mean), nights: sleepWin.count },
      })
    }
  }
  const lowNights = sleepHours.filter(
    (m) => m.value < thresholds.sleep.lowNightHours && withinDays(m.day, asOfDay, thresholds.sleep.windowDays),
  ).length
  if (lowNights >= thresholds.sleep.minLowNights) {
    fired.push({
      id: 'sleep_low_nights',
      name: 'Multiple short nights',
      severity: 'caution',
      why: `${lowNights} nights under ${thresholds.sleep.lowNightHours}h in the past ${thresholds.sleep.windowDays} days.`,
      evidence: { lowNights, threshold: thresholds.sleep.lowNightHours },
    })
  }

  // --- ACWR (acute:chronic workload ratio) ---
  const acute = windowSum(workoutMin, asOfDay, thresholds.workout.acuteDays)
  const chronic = windowSum(workoutMin, asOfDay, thresholds.workout.chronicDays)
  if (chronic.count >= 14 && chronic.sum > 0) {
    const acuteDaily = acute.sum / thresholds.workout.acuteDays
    const chronicDaily = chronic.sum / thresholds.workout.chronicDays
    const acwr = chronicDaily === 0 ? 0 : acuteDaily / chronicDaily
    if (acwr > thresholds.workout.veryHighAcwr) {
      fired.push({
        id: 'acwr_very_high',
        name: 'Acute load spike',
        severity: 'deload',
        why: `Acute:chronic workload ratio is ${acwr.toFixed(2)} (above ${thresholds.workout.veryHighAcwr}). Injury risk territory.`,
        evidence: { acwr: round2(acwr), acuteMin: Math.round(acute.sum), chronicMin: Math.round(chronic.sum) },
      })
    } else if (acwr > thresholds.workout.highAcwr) {
      fired.push({
        id: 'acwr_high',
        name: 'Load ramping fast',
        severity: 'caution',
        why: `Acute:chronic workload ratio is ${acwr.toFixed(2)} (above ${thresholds.workout.highAcwr}).`,
        evidence: { acwr: round2(acwr), acuteMin: Math.round(acute.sum), chronicMin: Math.round(chronic.sum) },
      })
    }
  }

  const verdict = fired.reduce<Severity>(
    (acc, r) => (SEVERITY_ORDER[r.severity] > SEVERITY_ORDER[acc] ? r.severity : acc),
    'standard',
  )

  return {
    asOfDay,
    verdict,
    fired,
    series: { hrv, rhr, sleepHours, workoutMin },
  }
}

function withinDays(day: string, end: string, windowDays: number): boolean {
  const a = new Date(end + 'T00:00:00').getTime()
  const b = new Date(day + 'T00:00:00').getTime()
  const gap = Math.round((a - b) / 86_400_000)
  return gap >= 0 && gap < windowDays
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
