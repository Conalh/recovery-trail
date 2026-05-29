import type { Instant } from './appleHealthDate'

export type HrvSample = {
  /** Normalized start instant (parsed from the export at ingest). */
  start: Instant
  /** SDNN in milliseconds. */
  valueMs: number
  source: string
}

export type RhrSample = {
  start: Instant
  /** Beats per minute. */
  valueBpm: number
  source: string
}

export type SleepSample = {
  start: Instant
  end: Instant
  /** Asleep / inBed / awake / deep / core / rem. */
  stage: SleepStage
  source: string
}

export type SleepStage =
  | 'inBed'
  | 'asleepUnspecified'
  | 'asleepCore'
  | 'asleepDeep'
  | 'asleepREM'
  | 'awake'

export type WorkoutSample = {
  start: Instant
  end: Instant
  /** Workout activity type, normalized to a lowercase string. */
  activity: string
  durationMin: number
  source: string
}

export type ParsedExport = {
  hrv: HrvSample[]
  rhr: RhrSample[]
  sleep: SleepSample[]
  workouts: WorkoutSample[]
  /** Inclusive [min, max] epoch ms across every start/end instant seen. */
  range: { startMs: number; endMs: number } | null
}

export type ParserProgress = {
  bytesRead: number
  totalBytes: number
  recordsSeen: number
}

export type WorkerInbound =
  | { type: 'parse'; file: File }

export type WorkerOutbound =
  | { type: 'progress'; progress: ParserProgress }
  | { type: 'done'; result: ParsedExport }
  | { type: 'error'; message: string }
