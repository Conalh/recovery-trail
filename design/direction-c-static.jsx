// Direction C — "The Heatmap"
// 14-day × 4-metric grid. Each cell is colored by how far that day was
// from the baseline (good = blue, neutral = dark, bad = warm). The TREND
// is the visual — the story of "first week fine, second week falling
// apart" emerges from the gradient. Numbers live in mono. Rule list
// stacks below as inline citations.
//
// Aesthetic: cool dark teal (#0a1015), JetBrains Mono for numbers, hairline
// dividers, slight clinical bias. Designed for the athlete who wants to
// SEE the pattern, not be told about it.

const C_COLORS = {
  bg:        '#0b1015',
  panel:     '#0f161d',
  panelLine: 'rgba(255,255,255,0.05)',
  text:      '#d8e4ed',
  muted:     'rgba(216,228,237,0.55)',
  faint:     'rgba(216,228,237,0.32)',
  // Heat scale: bad → warm, good → cool teal
  bad2:      '#e85d4a',   // ratio < 0.85 / > 1.15 etc.
  bad1:      '#c46a55',
  flat:      '#1c252e',
  ok1:       '#1f5b6e',
  ok2:       '#2a8aa3',
  accent:    '#e85d4a',
  accent2:   '#2a8aa3',
};

// Map a deviation-from-baseline (signed % where + = bad for this metric)
// to a cell color. Caller pre-applies polarity so + always = worse.
function cellColor(badnessPct) {
  if (badnessPct <= -10) return C_COLORS.ok2;
  if (badnessPct <= -3)  return C_COLORS.ok1;
  if (badnessPct <=  3)  return C_COLORS.flat;
  if (badnessPct <= 10)  return C_COLORS.bad1;
  return C_COLORS.bad2;
}

// Per-day "badness" for each metric (signed % so +ve = worse than baseline).
function dayBadness(metric, i) {
  const v = SERIES[metric][i];
  const b = BASELINE[metric];
  const dev = ((v - b) / b) * 100;
  return -POLARITY[metric] * dev;     // positive = bad
}

function CHeatRow({ metric, label }) {
  const t = TODAY[metric];
  const r0 = fmt.rating(metric, t.delta);
  const isBad = r0 < 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {/* label gutter */}
      <div style={{
        width: 60, flexShrink: 0, paddingRight: 8,
        fontSize: 10, color: C_COLORS.muted,
        letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 500,
      }}>{label}</div>
      {/* 14 cells */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(14, 1fr)',
        gap: 2, flex: 1, minWidth: 0,
      }}>
        {DAYS.map((d, i) => {
          const b = dayBadness(metric, i);
          const isToday = i === 13;
          return (
            <div key={d} style={{
              aspectRatio: '1 / 1',
              background: cellColor(b),
              borderRadius: 3,
              outline: isToday ? `1.5px solid ${C_COLORS.text}` : 'none',
              outlineOffset: 0,
            }} />
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

function CRule({ rule }) {
  const sevColor = rule.severity === 'deload' ? C_COLORS.accent : '#e0a458';
  const ev = rule.evidence || {};
  const evParts = [
    ev.shortMean !== undefined && ['7d',    ev.shortMean],
    ev.baselineMean !== undefined && ['base', ev.baselineMean],
    ev.ratio !== undefined && ['×',    ev.ratio.toFixed(2)],
  ].filter(Boolean);

  return (
    <div style={{
      padding: '12px 0',
      borderTop: `1px solid ${C_COLORS.panelLine}`,
    }}>
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
      </div>
      <div style={{
        fontSize: 12.5, color: C_COLORS.muted, lineHeight: 1.4,
        paddingLeft: 0, marginBottom: evParts.length ? 6 : 0,
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

function DirectionC() {
  return (
    <div style={{
      width: '100%', minHeight: '100%',
      background: C_COLORS.bg,
      color: C_COLORS.text,
      fontFamily: '"Geist", -apple-system, system-ui, sans-serif',
      paddingTop: 56, paddingBottom: 40,
      WebkitFontSmoothing: 'antialiased',
    }}>
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
          <CHeatRow metric="hrv"   label="HRV" />
          <CHeatRow metric="rhr"   label="RHR" />
          <CHeatRow metric="sleep" label="SLEEP" />
          <CHeatRow metric="load"  label="LOAD" />
        </div>

        {/* legend */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginTop: 14, paddingTop: 10,
          borderTop: `1px solid ${C_COLORS.panelLine}`,
          fontSize: 9.5, color: C_COLORS.faint, letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          <span>vs. baseline</span>
          <div style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
            {[C_COLORS.ok2, C_COLORS.ok1, C_COLORS.flat, C_COLORS.bad1, C_COLORS.bad2].map((c) => (
              <div key={c} style={{ width: 14, height: 8, background: c, borderRadius: 2 }} />
            ))}
          </div>
          <span>worse</span>
        </div>
      </div>

      {/* Summary line - what changed */}
      <div style={{
        padding: '20px 22px 4px',
        fontSize: 14, color: C_COLORS.text, lineHeight: 1.5, textWrap: 'pretty',
      }}>
        Through <span style={{ fontFamily: '"JetBrains Mono", monospace', color: C_COLORS.accent2 }}>5/18</span> everything was at baseline.
        Then all four metrics rolled over at once — and stayed there.
      </div>

      {/* Rules list */}
      <div style={{ padding: '16px 22px 0' }}>
        <div style={{
          fontSize: 10.5, color: C_COLORS.faint, letterSpacing: 1.5,
          textTransform: 'uppercase', fontWeight: 500, marginBottom: 0,
          padding: '0 0 4px',
        }}>4 rules fired</div>
        {RULES.map((r) => <CRule key={r.id} rule={r} />)}
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
