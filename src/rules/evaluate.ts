import type { ParsedExport } from '../lib/types'
import thresholds from './thresholds.json'
import {
  dailyHrv,
  dailyRhr,
  dailySleepHours,
  dailyWorkoutMinutes,
  diffDays,
  latestDay,
  windowMean,
  windowSum,
  windowValues,
  type DailyMetric,
} from './aggregate'
import {
  compositeRecoveryScore,
  demoteOneBand,
  detectTrend,
  LEVEL_DOMINATES_RECOVERY_FLOOR,
  populationStdDev,
  type TrendDetectionResult,
  type TrendSeverity,
} from './trend'

export type Severity = 'standard' | 'caution' | 'deload'

const SEVERITY_ORDER: Record<Severity, number> = {
  standard: 0,
  caution: 1,
  deload: 2,
}

/** Map engine v2's mild/moderate/severe to recovery-trail's 3-tier ladder. */
function trendSeverityToVerdictSeverity(t: TrendSeverity): Severity {
  return t === 'severe' ? 'deload' : 'caution'
}

export type FiredRule = {
  id: string
  name: string
  severity: Severity
  why: string
  /** Numeric trace of what the rule actually saw. */
  evidence: Record<string, number>
  /** Engine v2 trend metadata: which window(s) fired before combination. */
  windowsFired?: 'acute' | 'chronic' | 'both'
  /** Raw slope magnitudes in SD/day, signed in the BAD direction. */
  slopes?: { acute?: number; chronic?: number }
}

export type Recommendation = {
  asOfDay: string
  verdict: Severity
  fired: FiredRule[]
  series: {
    hrv: DailyMetric[]
    rhr: DailyMetric[]
    sleepHours: DailyMetric[]
    workoutMin: DailyMetric[]
  }
  /** Composite recovery score (0–100); null when not enough data. */
  recoveryScore: number | null
  /** Whether the level-dominates safety rule demoted trend signals. */
  levelDominates: boolean
  /**
   * True when the 7-day window held fewer than the minimum recent readings, so
   * the HRV/RHR level checks were skipped and that marker was omitted from the
   * composite score. The UI surfaces an "insufficient recent data" note rather
   * than treating the gap as a catastrophic drop.
   */
  insufficientData: { hrv: boolean; rhr: boolean }
  /**
   * Display baselines per metric, computed over the same 28-day calendar window
   * the rule engine uses (NOT last-N-samples), so the heatmap/narrative agree
   * with the rule cards. null when the window holds no readings.
   */
  baselines: { hrv: number | null; rhr: number | null; sleep: number | null; load: number | null }
}

const TREND_RULE_IDS = new Set(['hrv_trend', 'rhr_trend', 'sleep_trend'])

export function evaluate(parsed: ParsedExport): Recommendation | null {
  const asOfDay = latestDay(parsed)
  if (!asOfDay) return null

  const hrv = dailyHrv(parsed.hrv)
  const rhr = dailyRhr(parsed.rhr)
  const sleepHours = dailySleepHours(parsed.sleep)
  const workoutMin = dailyWorkoutMinutes(parsed.workouts)

  // 28-day baselines: mean for context, SD for slope normalization. SD is
  // taken over the same date window as the mean (not the last N readings),
  // so gaps don't change the denominator the slope is normalized by.
  const hrvBase = windowMean(hrv, asOfDay, thresholds.hrv.baselineWindowDays)
  const hrvBaseSd = populationStdDev(windowValues(hrv, asOfDay, thresholds.hrv.baselineWindowDays))
  const rhrBase = windowMean(rhr, asOfDay, thresholds.rhr.baselineWindowDays)
  const rhrBaseSd = populationStdDev(windowValues(rhr, asOfDay, thresholds.rhr.baselineWindowDays))
  const sleepWindow = thresholds.sleep.windowDays * 4
  const sleepBase = windowMean(sleepHours, asOfDay, sleepWindow)
  const sleepBaseSd = populationStdDev(windowValues(sleepHours, asOfDay, sleepWindow))
  const loadBase = windowMean(workoutMin, asOfDay, thresholds.workout.chronicDays)

  // Engine v2 dual-window detectors for HRV / RHR / sleep.
  const hrvTrend = detectTrend(hrv, asOfDay, hrvBaseSd, true)
  const rhrTrend = detectTrend(rhr, asOfDay, rhrBaseSd, false)
  const sleepTrend = detectTrend(sleepHours, asOfDay, sleepBaseSd, true)

  // Composite recovery score for the level-dominates safety rule.
  const hrvShort = windowMean(hrv, asOfDay, thresholds.hrv.shortWindowDays)
  const rhrShort = windowMean(rhr, asOfDay, thresholds.rhr.shortWindowDays)
  const sleepShort = windowMean(sleepHours, asOfDay, thresholds.sleep.windowDays)

  // Require a minimum number of RECENT readings before trusting a short-window
  // mean. windowMean returns {mean:0,count:0} for an empty window; for HRV/RHR a
  // real 0 is impossible, so an unguarded mean of 0 would read as a catastrophic
  // drop and both fire a false rule AND poison the composite score. Gate on count.
  const hrvShortEnough = hrvShort.count >= thresholds.hrv.minShortSamples
  const rhrShortEnough = rhrShort.count >= thresholds.rhr.minShortSamples
  const hrvDropSd =
    hrvShortEnough && hrvBase.mean > 0 && hrvBaseSd
      ? (hrvBase.mean - hrvShort.mean) / hrvBaseSd
      : null
  const rhrRiseBpm = rhrShortEnough && rhrBase.mean > 0 ? rhrShort.mean - rhrBase.mean : null
  const recoveryScore = compositeRecoveryScore({
    hrvDropSd,
    rhrRiseBpm,
    sleepHoursAcute: sleepShort.count > 0 ? sleepShort.mean : null,
  })

  const levelDominates =
    recoveryScore !== null && recoveryScore >= LEVEL_DOMINATES_RECOVERY_FLOOR

  const insufficientData = { hrv: !hrvShortEnough, rhr: !rhrShortEnough }

  const fired: FiredRule[] = []

  pushTrendRule(fired, 'hrv_trend', 'HRV trending down', 'HRV', hrvTrend, levelDominates)
  pushTrendRule(fired, 'rhr_trend', 'Resting HR trending up', 'RHR', rhrTrend, levelDominates)
  pushTrendRule(fired, 'sleep_trend', 'Sleep trending down', 'sleep', sleepTrend, levelDominates)

  // Level signals run alongside trend signals (engine v2 keeps both —
  // levels see WHERE the metric is, trends see WHERE IT'S GOING).
  // SD-normalized thresholds match the engine v2 constants.
  if (hrvDropSd !== null && hrvDropSd >= thresholds.hrv.dropSdCaution) {
    const sev: Severity = hrvDropSd >= thresholds.hrv.dropSdDeload ? 'deload' : 'caution'
    fired.push({
      id: 'hrv_below_baseline',
      name: 'HRV below baseline',
      severity: sev,
      why: `7-day HRV averaging ${hrvShort.mean.toFixed(0)} ms vs a 28-day baseline of ${hrvBase.mean.toFixed(0)} ms (${hrvDropSd.toFixed(1)} SD below).`,
      evidence: {
        shortMean: round1(hrvShort.mean),
        baselineMean: round1(hrvBase.mean),
        dropSd: round2(hrvDropSd),
      },
    })
  }
  if (rhrRiseBpm !== null && rhrRiseBpm >= thresholds.rhr.riseBpmCaution) {
    const sev: Severity = rhrRiseBpm >= thresholds.rhr.riseBpmDeload ? 'deload' : 'caution'
    fired.push({
      id: 'rhr_above_baseline',
      name: 'Resting HR elevated',
      severity: sev,
      why: `7-day resting HR averaging ${rhrShort.mean.toFixed(0)} bpm vs a 28-day baseline of ${rhrBase.mean.toFixed(0)} bpm (+${rhrRiseBpm.toFixed(0)} bpm).`,
      evidence: {
        shortMean: round1(rhrShort.mean),
        baselineMean: round1(rhrBase.mean),
        riseBpm: round1(rhrRiseBpm),
      },
    })
  }
  if (sleepShort.count >= thresholds.sleep.minRecentNights && sleepShort.mean < thresholds.sleep.cautionMinHours) {
    const sev: Severity = sleepShort.mean < thresholds.sleep.deloadMinHours ? 'deload' : 'caution'
    const floor = sev === 'deload' ? thresholds.sleep.deloadMinHours : thresholds.sleep.cautionMinHours
    fired.push({
      id: 'sleep_deficit',
      name: sev === 'deload' ? 'Severe sleep deficit' : 'Sleep below target',
      severity: sev,
      why: `Averaging ${sleepShort.mean.toFixed(1)}h sleep over the past 7 days — below the ${floor.toFixed(1)}h floor.`,
      evidence: {
        mean: round1(sleepShort.mean),
        nights: sleepShort.count,
      },
    })
  }

  // Sleep low-nights count (level-based, not affected by level-dominates).
  const lowNights = sleepHours.filter(
    (m) =>
      m.value < thresholds.sleep.lowNightHours &&
      withinDays(m.day, asOfDay, thresholds.sleep.windowDays),
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

  // Load ramp — uncoupled week-over-week change. The acute week's load is
  // compared to the average weekly load of the PRIOR 3 weeks, which is excluded
  // from the comparison (priorSum = chronic − acute). That removes the
  // mathematical coupling between the figure and its reference — the central
  // objection to the acute:chronic workload ratio (Impellizzeri et al. 2020),
  // where the acute week sits inside the chronic denominator so the ratio partly
  // tracks itself. We flag a rapid rise vs the recent norm instead, which is
  // what the load-management literature favors ("minimize week-to-week
  // changes"). Still a soft heuristic — load does not reliably predict injury.
  const acute = windowSum(workoutMin, asOfDay, thresholds.workout.acuteDays)
  const chronic = windowSum(workoutMin, asOfDay, thresholds.workout.chronicDays)
  const priorWeeks =
    (thresholds.workout.chronicDays - thresholds.workout.acuteDays) / thresholds.workout.acuteDays
  const priorSum = chronic.sum - acute.sum
  const priorWorkoutDays = chronic.count - acute.count
  const priorWeeklyAvg = priorWeeks > 0 ? priorSum / priorWeeks : 0
  const thisWeekLoad = acute.sum
  // Coverage = whole days spanned by the data, measured from the instants
  // themselves. Deriving a calendar day from range.startMs would re-introduce a
  // timezone dependency (an evening sample rolls to the next UTC day), so the
  // verdict must not hinge on it — compare instants directly.
  const chronicCoverageDays = parsed.range
    ? Math.min(
        thresholds.workout.chronicDays,
        Math.floor((parsed.range.endMs - parsed.range.startMs) / 86_400_000) + 1,
      )
    : 0
  // Gate on full calendar coverage PLUS a substantive prior baseline (enough
  // prior workout days and a minimum weekly average), so a near-rest baseline
  // can't manufacture a huge percentage from one normal week — the
  // low-denominator instability the ratio is criticized for.
  if (
    chronicCoverageDays >= thresholds.workout.minChronicCoverageDays &&
    priorWorkoutDays >= thresholds.workout.minPriorWorkoutDays &&
    priorWeeklyAvg >= thresholds.workout.minPriorWeeklyMin
  ) {
    const rampPct = ((thisWeekLoad - priorWeeklyAvg) / priorWeeklyAvg) * 100
    const evidence = {
      rampPct: Math.round(rampPct),
      thisWeekMin: Math.round(thisWeekLoad),
      priorWeeklyAvgMin: Math.round(priorWeeklyAvg),
    }
    if (rampPct >= thresholds.workout.rampPctDeload) {
      fired.push({
        id: 'load_spike',
        name: 'Load spike',
        severity: 'deload',
        why: `This week's training is ${Math.round(thisWeekLoad)} min — ${Math.round(rampPct)}% above your prior 3-week average of ${Math.round(priorWeeklyAvg)} min/week. Sharp jump.`,
        evidence,
      })
    } else if (rampPct >= thresholds.workout.rampPctCaution) {
      fired.push({
        id: 'load_ramp',
        name: 'Load ramping fast',
        severity: 'caution',
        why: `This week's training is ${Math.round(rampPct)}% above your prior 3-week average (${Math.round(thisWeekLoad)} vs ${Math.round(priorWeeklyAvg)} min/week).`,
        evidence,
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
    recoveryScore: recoveryScore === null ? null : round1(recoveryScore),
    levelDominates,
    insufficientData,
    baselines: {
      hrv: baselineOrNull(hrvBase),
      rhr: baselineOrNull(rhrBase),
      sleep: baselineOrNull(sleepBase),
      load: baselineOrNull(loadBase),
    },
  }
}

/** Map a windowMean result to a baseline value, or null when the window was empty. */
function baselineOrNull(r: { mean: number; count: number }): number | null {
  return r.count === 0 ? null : r.mean
}

/**
 * Combine a TrendDetectionResult into a FiredRule, applying the
 * level-dominates demotion if it's active. Drops the rule entirely
 * when demotion would push it below mild.
 */
function pushTrendRule(
  fired: FiredRule[],
  id: string,
  name: string,
  label: string,
  result: TrendDetectionResult,
  levelDominates: boolean,
): void {
  if (!result.combined) return
  let finalSeverity: TrendSeverity | null = result.combined
  if (levelDominates && TREND_RULE_IDS.has(id)) {
    finalSeverity = demoteOneBand(finalSeverity)
    if (!finalSeverity) return
  }

  const verdictSeverity = trendSeverityToVerdictSeverity(finalSeverity)
  const why = buildTrendWhy(label, result, finalSeverity, levelDominates)
  const evidence: Record<string, number> = {}
  if (result.acuteSdPerDay !== null) evidence['7dSdPerDay'] = round3(result.acuteSdPerDay)
  if (result.chronicSdPerDay !== null) evidence['28dSdPerDay'] = round3(result.chronicSdPerDay)

  const rule: FiredRule = {
    id,
    name,
    severity: verdictSeverity,
    why,
    evidence,
  }
  if (result.windowsFired) rule.windowsFired = result.windowsFired
  if (result.acuteSdPerDay !== null || result.chronicSdPerDay !== null) {
    rule.slopes = {}
    if (result.acuteSdPerDay !== null) rule.slopes.acute = round3(result.acuteSdPerDay)
    if (result.chronicSdPerDay !== null) rule.slopes.chronic = round3(result.chronicSdPerDay)
  }
  fired.push(rule)
}

function buildTrendWhy(
  label: string,
  result: TrendDetectionResult,
  finalSeverity: TrendSeverity,
  levelDominates: boolean,
): string {
  const acute = result.acuteSdPerDay
  const chronic = result.chronicSdPerDay
  const sevWord =
    finalSeverity === 'severe' ? 'sharply' : finalSeverity === 'moderate' ? 'steadily' : 'mildly'
  let core: string
  if (result.windowsFired === 'both') {
    core = `${label} is ${sevWord} off baseline across both the 7-day (${formatSd(acute)}) and 28-day smoothed (${formatSd(chronic)}) windows.`
  } else if (result.windowsFired === 'acute') {
    core = `${label} 7-day slope is ${formatSd(acute)} — sustained drift hasn't yet shown in the 28-day window.`
  } else {
    core = `${label} 28-day smoothed slope is ${formatSd(chronic)} — sustained drift even though the last 7 days look stable.`
  }
  if (levelDominates) {
    core += ' Demoted one band: composite recovery still strong overall.'
  }
  return core
}

function formatSd(n: number | null): string {
  if (n === null) return '—'
  const sign = n >= 0 ? '+' : ''
  return `${sign}${n.toFixed(2)} SD/d`
}

function withinDays(day: string, end: string, windowDays: number): boolean {
  const gap = diffDays(end, day)
  return gap >= 0 && gap < windowDays
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
