import { describe, it, expect } from 'vitest'
import { parseRecordsFromXmlString } from './parseAppleHealth'

describe('parseRecordsFromXmlString', () => {
  it('parses a self-closing HRV record', () => {
    const xml =
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Apple Watch" unit="ms" startDate="2026-01-15 07:42:00 -0800" endDate="2026-01-15 07:42:00 -0800" value="62"/>'
    const out = parseRecordsFromXmlString(xml)
    expect(out.hrv).toHaveLength(1)
    expect(out.hrv[0].valueMs).toBe(62)
    expect(out.hrv[0].source).toBe('Apple Watch')
    expect(out.hrv[0].start.sourceDay).toBe('2026-01-15')
  })

  it('parses an RHR record', () => {
    const xml =
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Apple Watch" startDate="2026-01-15 06:00:00 -0800" endDate="2026-01-15 06:00:00 -0800" value="48"/>'
    expect(parseRecordsFromXmlString(xml).rhr[0].valueBpm).toBe(48)
  })

  it('maps sleep stages and ignores unmapped values', () => {
    const core =
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-01-14 23:10:00 -0800" endDate="2026-01-15 06:40:00 -0800" value="HKCategoryValueSleepAnalysisAsleepCore"/>'
    const inbed =
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Apple Watch" startDate="2026-01-14 22:00:00 -0800" endDate="2026-01-14 23:00:00 -0800" value="HKCategoryValueSleepAnalysisInBed"/>'
    const garbage =
      '<Record type="HKCategoryTypeIdentifierSleepAnalysis" startDate="2026-01-14 22:00:00 -0800" endDate="2026-01-14 23:00:00 -0800" value="HKCategoryValueSleepAnalysisGarbage"/>'
    const out = parseRecordsFromXmlString(core + inbed + garbage)
    expect(out.sleep.map((s) => s.stage)).toEqual(['asleepCore', 'inBed'])
    expect(out.sleep[0].end.sourceDay).toBe('2026-01-15')
  })

  it('ignores unknown record types', () => {
    const xml =
      '<Record type="HKQuantityTypeIdentifierStepCount" startDate="2026-01-15 06:00:00 -0800" endDate="2026-01-15 06:00:00 -0800" value="1000"/>'
    const out = parseRecordsFromXmlString(xml)
    expect(out.hrv).toHaveLength(0)
    expect(out.rhr).toHaveLength(0)
    expect(out.sleep).toHaveLength(0)
  })

  it('parses workouts in self-closing and child-element shapes', () => {
    const selfClosing =
      '<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="45" durationUnit="min" sourceName="Strava" startDate="2026-01-15 17:00:00 -0800" endDate="2026-01-15 17:45:00 -0800"/>'
    const withChild =
      '<Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="60" durationUnit="min" sourceName="Apple Watch" startDate="2026-01-15 06:00:00 -0800" endDate="2026-01-15 07:00:00 -0800"><MetadataEntry key="HKIndoorWorkout" value="0"/></Workout>'
    const out = parseRecordsFromXmlString(selfClosing + withChild)
    expect(out.workouts.map((w) => w.activity)).toEqual(['running', 'cycling'])
    expect(out.workouts.map((w) => w.durationMin)).toEqual([45, 60])
  })

  it('converts a workout duration via durationUnit', () => {
    const seconds =
      '<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="2700" durationUnit="s" sourceName="x" startDate="2026-01-15 17:00:00 -0800" endDate="2026-01-15 17:45:00 -0800"/>'
    expect(parseRecordsFromXmlString(seconds).workouts[0].durationMin).toBe(45)
  })

  it('falls back to the start/end span when duration is absent', () => {
    const w =
      '<Workout workoutActivityType="HKWorkoutActivityTypeWalking" sourceName="x" startDate="2026-01-15 17:00:00 -0800" endDate="2026-01-15 17:45:00 -0800"/>'
    expect(parseRecordsFromXmlString(w).workouts[0].durationMin).toBe(45)
  })

  it('widens range across every start and end instant', () => {
    const hrv =
      '<Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" startDate="2026-01-10 07:00:00 -0800" endDate="2026-01-10 07:00:00 -0800" value="55"/>'
    const w =
      '<Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="60" durationUnit="min" startDate="2026-01-20 17:00:00 -0800" endDate="2026-01-20 18:00:00 -0800"/>'
    const out = parseRecordsFromXmlString(hrv + w)
    expect(out.range).not.toBeNull()
    expect(out.range!.startMs).toBe(Date.UTC(2026, 0, 10, 15, 0)) // 07:00 -0800
    expect(out.range!.endMs).toBe(Date.UTC(2026, 0, 21, 2, 0)) // 18:00 -0800 == 02:00Z next day
  })

  it('drops a truncated trailing tag without throwing', () => {
    const xml =
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate="2026-01-15 06:00:00 -0800" endDate="2026-01-15 06:00:00 -0800" value="50"/>' +
      '<Record type="HKQuantityTypeIdentifierRestingHeartRate" startDate='
    const out = parseRecordsFromXmlString(xml)
    expect(out.rhr).toHaveLength(1)
  })
})
