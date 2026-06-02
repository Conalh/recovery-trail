# Changelog

All notable changes to recovery-trail are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Workout-load rule: dropped the acute:chronic workload ratio (ACWR).**
  The coupled ratio (acute window sits inside the chronic denominator) is the
  central target of the ACWR critique (Impellizzeri et al. 2020). Replaced it
  with an *uncoupled* week-over-week load ramp — this week's load vs the average
  of the prior 3 weeks (excluded from the baseline), flagged by percentage
  increase. Rule ids `acwr_high`/`acwr_very_high` became
  `load_ramp`/`load_spike`; `thresholds.workout` swaps the ACWR bands for
  `rampPctCaution`/`rampPctDeload` plus a prior-baseline floor.
- **Methodology references corrected and refreshed.** The dual-window
  rationale no longer misattributes a "~4-week window" recommendation to
  Plews et al. (2013); it now reflects the actual
  7-day-rolling-average-against-baseline method. Added post-2016 evidence
  that the HRV-guided premise holds (Vesterinen et al. 2016 RCT;
  Granero-Gallegos et al. 2020 meta-analysis), a modern sleep-consensus
  reference (Walsh et al. 2021), and a note that the ACWR load rule is
  methodologically contested (Impellizzeri et al. 2020). Clarified that
  ACSM is a general umbrella, not the source of the specific HRV/RHR
  cutoffs.

## [0.1.0] - 2026-05-29

Initial public release.

### Added

- **Local-first Apple Health parser.** A streaming web worker parses
  `export.xml` entirely in the browser (no backend, no upload), handling
  multi-hundred-MB files. Timestamps are parsed explicitly into normalized
  `{ instantMs, sourceDay }` pairs, so day bucketing follows the export's own
  UTC offset rather than the viewer's locale.
- **Engine v2 trend rules.** Dual-window (acute 7-day OLS / chronic 28-day
  EWMA-then-OLS) trend detection for HRV, RHR, and sleep, combined with
  level-based rules (HRV/RHR vs baseline, sleep deficit, ACWR) into a
  standard / caution / deload verdict with the reasoning shown.
- **Briefing UI.** Recovery heatmap, per-metric charts, day inspector, narrative
  summary, and a rules-fired list, with keyboard navigation and focus/hover
  states.
- **Golden fixture coverage.** End-to-end tests over real-shaped Apple Health XML
  for explicit timezone offsets, midnight-crossing and DST-transition sleep,
  overlapping and duplicate-source sleep intervals, workout `durationUnit`
  variants, sparse HRV/RHR windows, and ACWR calendar coverage.

### Changed

- **Self-hosted fonts.** Geist and JetBrains Mono are bundled via `@fontsource`
  instead of loaded from Google Fonts, so there are zero third-party requests at
  runtime — matching the stated privacy posture.

### Fixed

- Missing recent HRV/RHR data no longer reads as a catastrophic drop: the level
  checks require a minimum count of recent readings and surface an
  "insufficient data" note instead of firing a false rule or polluting the
  composite recovery score.
- Sleep aggregation merges overlapping/duplicate intervals before summing, so
  total sleep can't be double-counted.
- ACWR eligibility is gated on calendar coverage plus a minimum workout-day
  floor (timezone-consistent), instead of a raw workout-day count that excluded
  realistic 3–4×/week athletes.
- Display baselines are computed once in the rule engine and shared with the UI,
  so the heatmap, narrative, and rule cards agree on sparse data.
- Workout duration respects `durationUnit`; parse progress is measured in bytes.

### Infrastructure

- **Strict TypeScript** (`"strict": true`) across the app sources.
- **CI gates:** the GitHub Pages workflow runs `lint` and `test` before building
  and deploying on every push to `main`.
