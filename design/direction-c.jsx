// Direction C — Interactive prototype
// Three meaningful interactions on top of the dense heatmap:
//   1. Tap any day cell  →  that column highlights across all 4 metric rows;
//                           an inspector card slides in showing the day's
//                           numbers vs. baseline.
//   2. Tap a rule         →  the relevant metric row stays bright; cells in
//                           other rows dim. For multi-metric rules, all rows
//                           stay bright but the 7-day window gets a marker.
//   3. Tap a metric label →  that row expands inline into a real line chart
//                           with baseline + 7-day window overlay.
//
// Mutually exclusive: opening one closes the others.

const { useState, useEffect, useRef } = React;

const C_COLORS = {
  bg:        '#0b1015',
  panel:     '#0f161d',
  panelLine: 'rgba(255,255,255,0.05)',
  panelDeep: '#070b0f',
  text:      '#d8e4ed',
  muted:     'rgba(216,228,237,0.55)',
  faint:     'rgba(216,228,237,0.32)',
  fainter:   'rgba(216,228,237,0.18)',
  bad2:      '#e85d4a',
  bad1:      '#c46a55',
  flat:      '#1c252e',
  ok1:       '#1f5b6e',
  ok2:       '#2a8aa3',
  accent:    '#e85d4a',
  accent2:   '#2a8aa3',
};

function cellColor(b) {
  if (b <= -10) return C_COLORS.ok2;
  if (b <=  -3) return C_COLORS.ok1;
  if (b <=   3) return C_COLORS.flat;
  if (b <=  10) return C_COLORS.bad1;
  return C_COLORS.bad2;
}

function dayBadness(metric, i) {
  const v = SERIES[metric][i];
  const b = BASELINE[metric];
  return -POLARITY[metric] * ((v - b) / b) * 100;
}

const METRIC_LABEL = { hrv: 'HRV', rhr: 'RHR', sleep: 'SLEEP', load: 'LOAD' };
const METRIC_ORDER = ['hrv', 'rhr', 'sleep', 'load'];

// ── Inline CSS for transitions & hover (inline styles can't do these) ──
const cInlineStyles = `
  .c-cell {
    transition: opacity .22s ease, outline-color .22s ease, transform .18s ease;
    cursor: pointer;
  }
  .c-cell:active { transform: scale(0.92); }
  .c-row-label {
    transition: color .2s ease, background .2s ease;
    cursor: pointer;
    border-radius: 4px;
    user-select: none;
  }
  .c-row-label:hover { background: rgba(255,255,255,0.04); }
  .c-rule {
    transition: background .2s ease, border-color .2s ease;
    cursor: pointer;
  }
  .c-rule:hover { background: rgba(255,255,255,0.025); }
  .c-inspector {
    animation: c-slide-in .26s cubic-bezier(.2,.7,.3,1);
    transform-origin: top;
  }
  @keyframes c-slide-in {
    from { opacity: 0; transform: translateY(-6px); max-height: 0; }
    to   { opacity: 1; transform: translateY(0);   max-height: 400px; }
  }
  .c-chart-enter {
    animation: c-chart-in .3s cubic-bezier(.2,.7,.3,1);
  }
  @keyframes c-chart-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  .c-close-x {
    transition: background .15s ease;
    cursor: pointer;
    border-radius: 6px;
  }
  .c-close-x:hover { background: rgba(255,255,255,0.06); }
`;

// ── Inline line chart shown when a metric row is expanded ──────────────
function CMetricChart({ metric, selectedDay, onSelectDay }) {
  const data = SERIES[metric];
  const baseline = BASELINE[metric];
  const w = 268, h = 86;
  const pad = { l: 4, r: 4, t: 8, b: 10 };
  const ymin = Math.min(...data, baseline) - (metric === 'sleep' ? 0.4 : 2);
  const ymax = Math.max(...data, baseline) + (metric === 'sleep' ? 0.4 : 2);
  const range = ymax - ymin;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const sx = (i) => pad.l + (i / (data.length - 1)) * innerW;
  const sy = (v) => pad.t + (1 - (v - ymin) / range) * innerH;

  const pts = data.map((v, i) => [sx(i), sy(v)]);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const baseY = sy(baseline);

  // 7-day window shading (last 7 days)
  const winX0 = sx(7), winX1 = sx(13);

  const lastIdx = data.length - 1;
  const isBad = fmt.rating(metric, TODAY[metric].delta) < 0;
  const lineColor = isBad ? C_COLORS.accent : C_COLORS.accent2;

  return (
    <div className="c-chart-enter" style={{
      padding: '6px 12px 10px 60px',
    }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>
        {/* 7-day window */}
        <rect x={winX0} y={pad.t - 2} width={winX1 - winX0} height={innerH + 4}
          fill="rgba(255,255,255,0.04)" />
        {/* baseline */}
        <line x1={pad.l} y1={baseY} x2={w - pad.r} y2={baseY}
          stroke={C_COLORS.muted} strokeWidth="1" strokeDasharray="3 3" opacity="0.5" />
        {/* baseline label */}
        <text x={w - pad.r} y={baseY - 4} fontSize="9" textAnchor="end"
          fill={C_COLORS.muted}
          style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace' }}>
          base {fmt.metric(metric, baseline)}
        </text>
        {/* line */}
        <path d={path} fill="none" stroke={lineColor} strokeWidth="1.5"
          strokeLinecap="round" strokeLinejoin="round" />
        {/* dots */}
        {pts.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r={i === lastIdx ? 3 : 1.7}
            fill={i === lastIdx ? lineColor : C_COLORS.text}
            opacity={i === lastIdx ? 1 : 0.55}
            onClick={() => onSelectDay(i)}
            style={{ cursor: 'pointer' }} />
        ))}
        {/* selected day vertical */}
        {selectedDay !== null && (
          <line x1={sx(selectedDay)} y1={pad.t} x2={sx(selectedDay)} y2={h - pad.b}
            stroke={C_COLORS.text} strokeWidth="1" opacity="0.6" />
        )}
      </svg>
    </div>
  );
}

// ── A row of the heatmap (grid mode) ──────────────────────────────────
function CHeatRowGrid({ metric, label, selectedDay, focusedRule, dimmed,
                       onSelectDay, onToggleExpand }) {
  const t = TODAY[metric];
  const isBad = fmt.rating(metric, t.delta) < 0;
  const labelHighlight = focusedRule && focusedRule.metric === metric;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      opacity: dimmed ? 0.32 : 1,
      transition: 'opacity .22s ease',
    }}>
      {/* label gutter */}
      <div
        className="c-row-label"
        onClick={() => onToggleExpand(metric)}
        style={{
          width: 60, flexShrink: 0,
          padding: '4px 8px 4px 4px',
          fontSize: 10.5, color: labelHighlight ? C_COLORS.accent : C_COLORS.muted,
          letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600,
        }}
      >
        {label}
      </div>
      {/* 14 cells */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)',
        gap: 2, flex: 1, minWidth: 0,
      }}>
        {DAYS.map((d, i) => {
          const b = dayBadness(metric, i);
          const isSelected = selectedDay === i;
          const isToday = i === 13;
          return (
            <div
              key={d}
              className="c-cell"
              onClick={(e) => { e.stopPropagation(); onSelectDay(i); }}
              style={{
                aspectRatio: '1 / 1',
                background: cellColor(b),
                borderRadius: 3,
                outline: isSelected
                  ? `1.5px solid ${C_COLORS.text}`
                  : isToday && selectedDay === null
                    ? `1px solid rgba(255,255,255,0.35)`
                    : '1px solid transparent',
                outlineOffset: 0,
              }}
            />
          );
        })}
      </div>
      {/* today number */}
      <div style={{
        width: 56, flexShrink: 0, paddingLeft: 10, textAlign: 'right',
        fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <div style={{ fontSize: 14, color: C_COLORS.text, fontWeight: 500 }}>
          {fmt.metric(metric, t.value)}
        </div>
        <div style={{
          fontSize: 10.5, color: isBad ? C_COLORS.accent : C_COLORS.accent2,
          marginTop: 1,
        }}>{fmt.delta(t.delta)}</div>
      </div>
    </div>
  );
}

// ── Expanded line-chart row ───────────────────────────────────────────
function CHeatRowExpanded({ metric, label, selectedDay, onSelectDay, onToggleExpand }) {
  const t = TODAY[metric];
  const isBad = fmt.rating(metric, t.delta) < 0;
  return (
    <div style={{
      borderRadius: 6, background: 'rgba(255,255,255,0.025)',
      paddingBottom: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '4px 0 0' }}>
        <div
          className="c-row-label"
          onClick={() => onToggleExpand(metric)}
          style={{
            width: 60, flexShrink: 0,
            padding: '4px 8px 4px 4px',
            fontSize: 10.5, color: C_COLORS.text,
            letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600,
          }}
        >
          {label}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{
          width: 56, paddingLeft: 10, textAlign: 'right',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontVariantNumeric: 'tabular-nums',
        }}>
          <div style={{ fontSize: 14, color: C_COLORS.text, fontWeight: 500 }}>
            {fmt.metric(metric, t.value)}
          </div>
          <div style={{
            fontSize: 10.5, color: isBad ? C_COLORS.accent : C_COLORS.accent2,
            marginTop: 1,
          }}>{fmt.delta(t.delta)}</div>
        </div>
      </div>
      <CMetricChart metric={metric} selectedDay={selectedDay} onSelectDay={onSelectDay} />
    </div>
  );
}

// ── Day inspector card ───────────────────────────────────────────────
function CDayInspector({ day, onClose }) {
  return (
    <div className="c-inspector" style={{
      margin: '10px 16px 0',
      background: C_COLORS.panelDeep,
      border: `1px solid ${C_COLORS.panelLine}`,
      borderRadius: 12,
      padding: '12px 14px 14px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{
            fontSize: 10, color: C_COLORS.faint, letterSpacing: 1.5,
            textTransform: 'uppercase', fontWeight: 600,
          }}>Day</div>
          <div style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 16, color: C_COLORS.text, fontWeight: 500,
          }}>
            {DAYS[day]}
            {day === 13 && (
              <span style={{ color: C_COLORS.accent, marginLeft: 8, fontSize: 11 }}>
                · today
              </span>
            )}
          </div>
        </div>
        <div
          className="c-close-x"
          onClick={onClose}
          style={{
            width: 24, height: 24,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: C_COLORS.faint, fontSize: 16, lineHeight: 1,
          }}
        >×</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {METRIC_ORDER.map((m) => {
          const v = SERIES[m][day];
          const base = BASELINE[m];
          const dev = ((v - base) / base) * 100;
          const isBad = -POLARITY[m] * dev > 3;
          const isGood = -POLARITY[m] * dev < -3;
          const color = isBad ? C_COLORS.accent : isGood ? C_COLORS.accent2 : C_COLORS.muted;
          const badness = dayBadness(m, day);
          return (
            <div key={m} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontSize: 12.5,
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: 3,
                background: cellColor(badness), flexShrink: 0,
              }} />
              <div style={{
                width: 44, fontSize: 10.5, color: C_COLORS.muted,
                letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600,
              }}>{METRIC_LABEL[m]}</div>
              <div style={{
                color: C_COLORS.text, fontWeight: 500, fontSize: 14,
                fontVariantNumeric: 'tabular-nums', width: 50,
              }}>
                {fmt.metric(m, v)}
                <span style={{ fontSize: 10, color: C_COLORS.faint, marginLeft: 3 }}>
                  {UNITS[m]}
                </span>
              </div>
              <div style={{
                flex: 1, fontSize: 11, color: C_COLORS.faint,
                fontVariantNumeric: 'tabular-nums',
              }}>
                base <span style={{ color: C_COLORS.muted }}>{fmt.metric(m, base)}</span>
              </div>
              <div style={{
                color, fontSize: 12, fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {dev > 0 ? '+' : ''}{dev.toFixed(0)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Rule chip ─────────────────────────────────────────────────────────
function CRule({ rule, focused, onClick }) {
  const sevColor = rule.severity === 'deload' ? C_COLORS.accent : '#e0a458';
  const ev = rule.evidence || {};
  const evParts = [
    ev.shortMean    !== undefined && ['7d',   ev.shortMean],
    ev.baselineMean !== undefined && ['base', ev.baselineMean],
    ev.ratio        !== undefined && ['×',    ev.ratio.toFixed(2)],
  ].filter(Boolean);

  return (
    <div
      className="c-rule"
      onClick={() => onClick(rule.id)}
      style={{
        padding: '12px 14px',
        borderTop: `1px solid ${C_COLORS.panelLine}`,
        background: focused ? 'rgba(232,93,74,0.07)' : 'transparent',
        borderLeft: focused ? `2px solid ${sevColor}` : '2px solid transparent',
        marginLeft: focused ? -2 : 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 9.5, color: sevColor,
          padding: '2px 6px',
          border: `1px solid ${sevColor}`,
          borderRadius: 3, letterSpacing: 1,
          textTransform: 'uppercase', fontWeight: 600,
        }}>{rule.severity}</div>
        <div style={{
          fontSize: 13, color: C_COLORS.text, fontWeight: 500, flex: 1, minWidth: 0,
        }}>{rule.name}</div>
        {rule.metric && (
          <div style={{
            fontSize: 9.5, color: focused ? sevColor : C_COLORS.faint,
            letterSpacing: 1, fontWeight: 600,
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          }}>{METRIC_LABEL[rule.metric]}</div>
        )}
      </div>
      <div style={{
        fontSize: 12.5, color: C_COLORS.muted, lineHeight: 1.4,
        marginBottom: evParts.length ? 6 : 0,
      }}>{rule.why}</div>
      {evParts.length > 0 && (
        <div style={{
          display: 'flex', gap: 14,
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          fontSize: 10.5, color: C_COLORS.faint,
        }}>
          {evParts.map(([k, v]) => (
            <span key={k}>
              <span style={{ color: C_COLORS.faint }}>{k}</span>
              <span style={{ color: C_COLORS.text, marginLeft: 4 }}>{v}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────
function DirectionC() {
  const [selectedDay, setSelectedDay]       = useState(null);
  const [focusedRuleId, setFocusedRuleId]   = useState(null);
  const [expandedMetric, setExpandedMetric] = useState(null);

  const focusedRule = focusedRuleId
    ? RULES.find((r) => r.id === focusedRuleId)
    : null;

  const handleSelectDay = (i) => {
    setSelectedDay((prev) => (prev === i ? null : i));
    setFocusedRuleId(null);
  };
  const handleFocusRule = (id) => {
    setFocusedRuleId((prev) => (prev === id ? null : id));
    setSelectedDay(null);
    setExpandedMetric(null);
  };
  const handleToggleMetric = (m) => {
    setExpandedMetric((prev) => (prev === m ? null : m));
    setFocusedRuleId(null);
  };

  // Compute per-row dim state when a rule is focused.
  const rowDimmed = (metric) => {
    if (!focusedRule) return false;
    if (!focusedRule.metric) return false;       // combo: don't dim any row
    return focusedRule.metric !== metric;
  };

  return (
    <div style={{
      width: '100%', minHeight: '100%',
      background: C_COLORS.bg,
      color: C_COLORS.text,
      fontFamily: '"Geist", -apple-system, system-ui, sans-serif',
      paddingTop: 56, paddingBottom: 40,
      WebkitFontSmoothing: 'antialiased',
    }}>
      <style>{cInlineStyles}</style>

      {/* Header */}
      <div style={{
        padding: '0 18px 18px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{
            fontSize: 10.5, color: C_COLORS.faint, letterSpacing: 1.5,
            textTransform: 'uppercase', fontWeight: 500, marginBottom: 4,
          }}>recovery-trail · 14d</div>
          <div style={{
            fontSize: 22, fontWeight: 600, color: C_COLORS.text, letterSpacing: -0.4,
          }}>Briefing</div>
        </div>
        <div style={{
          textAlign: 'right',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
        }}>
          <div style={{
            fontSize: 10, color: C_COLORS.faint, letterSpacing: 1, marginBottom: 4,
            textTransform: 'uppercase',
          }}>Verdict</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            border: `1px solid ${C_COLORS.accent}`,
            color: C_COLORS.accent,
            fontSize: 11.5, letterSpacing: 1.5, fontWeight: 600,
            textTransform: 'uppercase',
          }}>
            <div style={{ width: 6, height: 6, borderRadius: 3, background: C_COLORS.accent }} />
            DELOAD
          </div>
        </div>
      </div>

      {/* Heatmap card */}
      <div style={{
        margin: '0 16px',
        background: C_COLORS.panel,
        border: `1px solid ${C_COLORS.panelLine}`,
        borderRadius: 12,
        padding: '14px 14px 12px',
      }}>
        {/* date axis */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ width: 60, flexShrink: 0 }} />
          <div style={{
            flex: 1, display: 'flex', justifyContent: 'space-between',
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 9.5, color: C_COLORS.faint,
          }}>
            <span>5/12</span>
            <span>5/18</span>
            <span style={{ color: C_COLORS.text }}>5/25</span>
          </div>
          <div style={{ width: 56, flexShrink: 0 }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {METRIC_ORDER.map((m) => (
            expandedMetric === m
              ? <CHeatRowExpanded
                  key={m}
                  metric={m}
                  label={METRIC_LABEL[m]}
                  selectedDay={selectedDay}
                  onSelectDay={handleSelectDay}
                  onToggleExpand={handleToggleMetric}
                />
              : <CHeatRowGrid
                  key={m}
                  metric={m}
                  label={METRIC_LABEL[m]}
                  selectedDay={selectedDay}
                  focusedRule={focusedRule}
                  dimmed={rowDimmed(m)}
                  onSelectDay={handleSelectDay}
                  onToggleExpand={handleToggleMetric}
                />
          ))}
        </div>

        {/* legend / hint */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 14, paddingTop: 10,
          borderTop: `1px solid ${C_COLORS.panelLine}`,
          fontSize: 9.5, color: C_COLORS.faint, letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          <span>
            {selectedDay !== null  ? 'day selected'
            : focusedRule          ? 'rule focused'
            : expandedMetric       ? 'metric expanded'
            : 'tap a cell, row or rule'}
          </span>
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            {[C_COLORS.ok2, C_COLORS.ok1, C_COLORS.flat, C_COLORS.bad1, C_COLORS.bad2].map((c) => (
              <div key={c} style={{ width: 14, height: 8, background: c, borderRadius: 2 }} />
            ))}
          </div>
          <span>worse</span>
        </div>
      </div>

      {/* Day inspector — slides in when a day is selected */}
      {selectedDay !== null && (
        <CDayInspector
          day={selectedDay}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Summary line */}
      {!focusedRule && selectedDay === null && (
        <div style={{
          padding: '20px 22px 4px',
          fontSize: 14, color: C_COLORS.text, lineHeight: 1.5, textWrap: 'pretty',
        }}>
          Through <span style={{ fontFamily: '"JetBrains Mono", monospace', color: C_COLORS.accent2 }}>5/18</span> everything was at baseline.
          Then all four metrics rolled over at once — and stayed there.
        </div>
      )}

      {/* Rules list */}
      <div style={{ padding: '16px 8px 0' }}>
        <div style={{
          fontSize: 10.5, color: C_COLORS.faint, letterSpacing: 1.5,
          textTransform: 'uppercase', fontWeight: 500,
          padding: '0 14px 4px',
        }}>
          {RULES.length} rules fired
          {focusedRule && (
            <span style={{ color: C_COLORS.accent, marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>
              · tap again to clear
            </span>
          )}
        </div>
        {RULES.map((r) => (
          <CRule
            key={r.id}
            rule={r}
            focused={focusedRuleId === r.id}
            onClick={handleFocusRule}
          />
        ))}
      </div>

      {/* footer */}
      <div style={{
        margin: '24px 22px 0',
        paddingTop: 12,
        borderTop: `1px solid ${C_COLORS.panelLine}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: 11, color: C_COLORS.faint, letterSpacing: 0.5,
        fontFamily: '"JetBrains Mono", monospace',
      }}>
        <span>local · no backend</span>
        <span>recovery-trail</span>
      </div>
    </div>
  );
}

window.DirectionC = DirectionC;
