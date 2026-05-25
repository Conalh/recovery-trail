// Shared mock data + chart helpers for the three recovery-trail directions.
//
// Numbers chosen to make the screenshots' verdict (Deload, -3% HRV, +7% RHR,
// -15% sleep, +33% workload) reproduce when averaged.

const DAYS = [
  '5/12','5/13','5/14','5/15','5/16','5/17','5/18',
  '5/19','5/20','5/21','5/22','5/23','5/24','5/25',
];

const SERIES = {
  hrv:   [52, 59, 59, 51, 55, 54, 49, 46, 45, 44, 48, 47, 46, 51],
  rhr:   [55, 56, 56, 55, 56, 57, 56, 62, 60, 62, 61, 62, 60, 61],
  sleep: [7.2, 7.5, 7.0, 7.1, 6.8, 7.0, 6.5, 5.8, 6.2, 5.5, 6.0, 5.8, 6.2, 6.0],
  load:  [50, 30, 80, 20, 60, 30, 0, 40, 90, 30, 60, 40, 0, 75],
};
const BASELINE = { hrv: 53, rhr: 57, sleep: 7.1, load: 56 };
const UNITS    = { hrv: 'ms', rhr: 'bpm', sleep: 'hrs', load: 'min' };

// For each metric, is "above baseline" GOOD (HRV, sleep) or BAD (RHR, load
// being too high above baseline = overreaching)?
const POLARITY = { hrv: +1, rhr: -1, sleep: +1, load: -1 };

const RULES = [
  {
    id: 'deload_combo',
    severity: 'deload',
    metric: null,
    name: 'Recovery stack is down across the board',
    why:  'HRV is below baseline, resting HR is up, and sleep is short — all at once.',
    evidence: {},
  },
  {
    id: 'hrv_caution',
    severity: 'caution',
    metric: 'hrv',
    name: 'HRV trending below baseline',
    why:  '7-day HRV is 90% of your 28-day baseline.',
    evidence: { shortMean: 47.2, baselineMean: 52.7, ratio: 0.90 },
  },
  {
    id: 'rhr_caution',
    severity: 'caution',
    metric: 'rhr',
    name: 'Resting HR trending up',
    why:  '7-day resting HR is 106% of baseline — heart hasn\u2019t fully come down.',
    evidence: { shortMean: 60.6, baselineMean: 57.1, ratio: 1.06 },
  },
  {
    id: 'sleep_low',
    severity: 'caution',
    metric: 'sleep',
    name: 'Sleep is short',
    why:  '7-day sleep is 6.0h vs. 7.1h baseline — about 15% under.',
    evidence: { shortMean: 6.0, baselineMean: 7.1, ratio: 0.85 },
  },
];

const TODAY = {
  hrv:   { value: 51,  delta: -3,  trend: 'down' },
  rhr:   { value: 61,  delta: +7,  trend: 'up'   },
  sleep: { value: 6.0, delta: -15, trend: 'down' },
  load:  { value: 75,  delta: +33, trend: 'up'   },
};

const VERDICT = {
  level: 'deload',         // standard | caution | deload
  headline: 'Pull back this week.',
  blurb: 'Your recovery is down on three fronts at once. Skip the hard sessions; keep it easy.',
  date: 'Sun, May 25',
  rulesFired: 4,
};

// ── Spark / chart helpers ───────────────────────────────────────────────
//
// Build an SVG path string for a series. Pad inside the box so the line and
// any baseline marker don't kiss the edges. Returns { path, points, min,
// max, scaleY } so callers can drop their own dots / baselines on top.
function buildSpark(data, w, h, { pad = 3, ymin, ymax } = {}) {
  const lo = ymin !== undefined ? ymin : Math.min(...data);
  const hi = ymax !== undefined ? ymax : Math.max(...data);
  const range = hi - lo || 1;
  const sx = (i) => (i / (data.length - 1)) * (w - pad * 2) + pad;
  const sy = (v) => h - pad - ((v - lo) / range) * (h - pad * 2);
  const pts = data.map((v, i) => [sx(i), sy(v)]);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return { path, pts, lo, hi, scaleY: sy };
}

// Format helpers
const fmt = {
  metric: (k, v) => k === 'sleep' ? v.toFixed(1) : Math.round(v),
  delta: (d) => (d > 0 ? '+' : '') + d + '%',
  // Is the delta good or bad given metric polarity? Returns +1 good, -1 bad, 0 neutral.
  rating: (k, d) => {
    if (Math.abs(d) < 3) return 0;
    return Math.sign(d) * POLARITY[k];
  },
};

Object.assign(window, {
  DAYS, SERIES, BASELINE, UNITS, POLARITY, RULES, TODAY, VERDICT,
  buildSpark, fmt,
});
