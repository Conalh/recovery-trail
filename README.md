# recovery-trail

**A two-week briefing on whether to push or pull back, with the math
shown.** Drop an Apple Health `export.xml` in your browser, get an
ACSM-aligned training verdict driven by dual-window trend detection.
No backend, no upload, no account — parsing and reasoning both happen
client-side.

🔗 **Live:** [conalh.github.io/recovery-trail](https://conalh.github.io/recovery-trail/) — there's a "Try with sample data" button on the import screen.

<p align="center">
  <img src="./docs/media/recovery-trail-hero.png" alt="recovery-trail briefing dashboard showing a deload verdict, recovery heatmap, and metric deviations" width="100%">
</p>

---

## What you see

The briefing view is a single page, mobile-first:

- **Top strip** — app name, a `[14d] [28d]` window toggle, and the
  verdict pill (`standard` / `caution` / `deload`). The verdict dot
  glows in its severity color and pulses three times on first load
  when you're in deload territory.
- **Heatmap card** — four rows (HRV, RHR, Sleep, Load) × N daily
  cells. Each cell is colored on a 5-tier scale by how far that day
  deviates from the metric's 28-day baseline (teal = better than
  baseline, rust = worse). The today cell carries an ambient breath
  pulse.
- **Narrative line** — auto-generated from the data: *"Through 5/18
  everything was at baseline. Then three metrics rolled over at once
  — and stayed there."* The cleanest day-in-window is detected from
  the rule firings.
- **Rules fired** — flat list of every rule that triggered, with an
  inline `7d` / `28d` / `7d + 28d` badge on trend rules so you can
  see which detector(s) fired before the engine v2 combiner resolved
  the severity. Evidence line shows the raw slope numbers in SD/day.

When ≥3 rules fire across ≥3 metrics, a synthesized **meta-rule**
("Recovery stack is down across the board") gets prepended to frame
the situation rather than recite numbers.

<p align="center">
  <img src="./docs/media/recovery-trail-metric-expanded.png" alt="Expanded metric view showing the 28-day HRV trend chart and recovery deviations" width="48%">
  <img src="./docs/media/recovery-trail-rules.png" alt="Rules fired view showing deload and caution recommendations with supporting trend evidence" width="48%">
</p>

## How the reasoning works — engine v2

Each recovery signal (HRV / RHR / sleep) runs two slope estimators
side by side, ported from
[fit-ontology](https://github.com/Conalh/fit-ontology):

- **Acute**: 7-day ordinary least-squares slope of the raw daily
  series, normalized by the 28-day baseline SD so thresholds live in
  SD/day. Responsive but noisy.
- **Chronic**: 28-day EWMA (halflife 10 days, pandas-style adjusted)
  followed by OLS on the smoothed series. Damps short-window noise
  so the slope reflects sustained drift.

A combiner resolves the pair per the engine v2 decision table:

- **Acute-only fires** → demote one band (noise suppression — in the
  spirit of the Plews/Buchheit HRV-monitoring method, which acts on a
  7-day rolling average read against the individual's ~4-week normal
  range rather than reacting to a single short-window move the longer
  window hasn't confirmed).
- **Chronic stronger than acute** → promote one band (chronic is
  seeing what the acute window hasn't caught yet).
- **Chronic confirms acute at same or lower tier** → trust the
  acute band.

A second safety rule fires when the composite recovery score is ≥
90: trend signals get demoted one more band, on the basis that
excellent levels shouldn't be overridden by borderline trend math.
Level signals (HRV-below-baseline, RHR-above-baseline,
sleep-deficit, ACWR) run alongside the trend signals — levels see
*where* the metric is, trends see *where it's going*.

Thresholds and math live in [`src/rules/trend.ts`](src/rules/trend.ts).

## Interactions

- **Tap a cell** → day inspector slides in below the heatmap, all
  four metrics' value/baseline/delta for that day.
- **Tap a metric label** (HRV/RHR/SLEEP/LOAD) → that row's cells
  swap for a real line chart with baseline overlay, 7-day window
  shading, and clickable dots.
- **Tap a rule** → focus mode. The relevant metric row stays bright,
  others dim + desaturate. Meta-rule keeps all rows bright (it's a
  stack-wide rule, not metric-bound).
- **Tap `28d`** → heatmap and chart expand to engine v2's full
  baseline window. The acute 7-day strip stays highlighted inside
  the chronic 28-day window.
- **Keyboard**
  - `← →` step the selected day through the window (opens the
    inspector implicitly)
  - `Esc` closes whatever's open in priority order: inspector →
    expanded metric → focused rule
  - `1` `2` `3` `4` toggle HRV/RHR/SLEEP/LOAD expansion
- **Hover** anywhere on the heatmap or chart → hint line under the
  legend reads `5/18 · HRV 51ms -3%` while you scrub.

## Try it

### Live (no install)

[conalh.github.io/recovery-trail](https://conalh.github.io/recovery-trail/) → click **Try with sample data**.

### With your own export

1. iPhone → Health app → tap your profile photo (top right) →
   "Export All Health Data" → AirDrop or email the zip to your
   computer.
2. Unzip — find `export.xml` (the file is typically 50–500 MB).
3. Drop it on the page. A web worker streams the parse without
   blocking the UI; an HRV/RHR/sleep dataset usually comes back in
   a few seconds.

The file never leaves your browser. Parsing is purely client-side.

## Stack

- Vite + React 19 + TypeScript
- Tailwind v3 (with custom `@layer utilities` for glow / pulse /
  stagger animations to compose against Tailwind's box-shadow
  CSS-variable system)
- Geist (sans) + JetBrains Mono, self-hosted via `@fontsource` (no
  third-party font requests at runtime)
- Single web worker for streaming Apple Health XML — handles
  multi-hundred-MB exports without blocking the UI
- Zero charting deps — sparklines and the in-row metric chart are
  hand-rolled SVG
- Zero analytics, zero tracking, zero third-party runtime requests

## Develop

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # outputs ./dist with /recovery-trail/ base for Pages
npm run preview        # serve the built bundle
```

The GitHub Pages deploy is fully automated via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) —
every push to `main` lints, tests, builds, and ships on Node 22
(`checkout@v6`, `setup-node@v6`, `configure-pages@v6`,
`upload-pages-artifact@v5`, `deploy-pages@v5`).

## Project layout

```text
src/
  lib/                              Apple Health XML parser + worker
    appleHealth.ts                  main-thread wrapper
    appleHealth.worker.ts           streaming XML parser
    sample.ts                       synthetic export for the demo
    types.ts                        parsed-export schema

  rules/                            reasoning layer
    trend.ts                        engine v2 — OLS, EWMA, slope severity,
                                    combineAcuteChronic, demoteOneBand,
                                    compositeRecoveryScore, detectTrend
    evaluate.ts                     wires trend detectors + level signals
                                    + ACWR + meta-rule into a Recommendation
    aggregate.ts                    daily aggregation helpers
    briefing.ts                     cell-tier, narrative, metaRule
    thresholds.json                 tunable ACSM/engine-v2 constants

  components/                       briefing UI
    Dashboard.tsx                   thin wrapper over HeatmapBriefing
    HeatmapBriefing.tsx             top strip, heatmap, rules list,
                                    keyboard nav, focus / hover state
    MetricChart.tsx                 in-row SVG line chart
    DayInspector.tsx                slide-in card showing one day's
                                    metrics
    ImportZone.tsx                  drag-drop file picker
    ParseProgress.tsx               progress UI for big exports
    Sparkline.tsx                   tiny SVG sparkline

  App.tsx                           import-flow state machine
                                    (idle / parsing / ready / error)
  index.css                         Tailwind + animation keyframes

design/                             Claude Design exports + screenshots
.github/workflows/deploy.yml        GitHub Pages deploy
```

## Disclaimer

recovery-trail is an exploratory tool for fit, generally-healthy
adults already training. It is **not** medical advice. ACSM
thresholds, slope-severity bands, and the engine v2 combiner are
general guidance derived from published methodology, not personal
prescription. The workout-load rule uses the acute:chronic workload
ratio, which is widely used but methodologically contested (Impellizzeri
et al. 2020) — treat it as a soft heuristic, not a verdict. Talk to a
clinician for anything that matters.

## Credits

Trend-detection methodology and reasoning layer ported from
[fit-ontology](https://github.com/Conalh/fit-ontology) — the
trainer-facing companion. Methodology references:

**HRV / heart-rate monitoring** — the dual-window trend core:

- Plews, Laursen, Stanley, Kilding, Buchheit (2013), *Sports Med*
  43(9):773–781 — [*Training adaptation and heart rate variability in
  elite endurance athletes: opening the door to effective
  monitoring*](https://doi.org/10.1007/s40279-013-0071-8). The
  7-day-rolling-average-against-baseline method this engine builds on.
- Buchheit (2014), *Front Physiol* 5:73 — [*Monitoring training status
  with HR measures: do all roads lead to
  Rome?*](https://doi.org/10.3389/fphys.2014.00073)

**Evidence the HRV-guided premise holds** — post-2016, since the
founding papers above are now a decade old:

- Vesterinen et al. (2016), *Med Sci Sports Exerc* 48(7):1347–1354 —
  [RCT](https://doi.org/10.1249/MSS.0000000000000910): HRV-guided
  training beat predetermined training for VO₂max.
- Granero-Gallegos, González-Quílez, Plews, Carrasco-Poyatos (2020),
  *IJERPH* 17(21):7999 — [systematic review +
  meta-analysis](https://doi.org/10.3390/ijerph17217999), same
  direction.

**Workout load (ACWR):**

- Gabbett (2016), *Br J Sports Med* 50(5):273–280 — the
  [acute:chronic workload
  ratio](https://pubmed.ncbi.nlm.nih.gov/26758673/) the load rule
  implements.
- Impellizzeri, Tenan et al. (2020), *Int J Sports Physiol Perform*
  15(6):907–913 — [*Acute:chronic workload ratio: conceptual issues
  and fundamental pitfalls*](https://pubmed.ncbi.nlm.nih.gov/32502973/).
  The ACWR is contested; the load rule is a soft heuristic (see
  Disclaimer).

**Sleep & general thresholds:**

- Walsh, Halson et al. (2021), *Br J Sports Med* 55(7):356–368 —
  [*Sleep and the athlete: 2021 expert consensus
  recommendations*](https://doi.org/10.1136/bjsports-2020-102025).
- ACSM's *Guidelines for Exercise Testing and Prescription*, 11e (2021)
  — general umbrella for the level-rule defaults. (Not the source of
  the specific HRV/RHR cutoffs — those follow the monitoring literature
  above.)

## License

MIT.
