export type HrvSample = {
  /** ISO date of the start of the measurement (UTC). */
  startDate: string
  /** SDNN in milliseconds. */
  valueMs: number
  source: string
}

export type RhrSample = {
  startDate: string
  /** Beats per minute. */
  valueBpm: number
  source: string
}

export type SleepSample = {
  /** ISO timestamp. */
  startDate: string
  endDate: string
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
  startDate: string
  endDate: string
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
  /** Inclusive [min, max] of all timestamps seen, ISO strings. */
  range: { start: string; end: string } | null
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
