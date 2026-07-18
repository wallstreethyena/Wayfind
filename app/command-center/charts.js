"use client";
// app/command-center/charts.js — the Command Center chart kit. Hand-rolled SVG
// (ZERO new dependencies — the app's first-load budget and dependency surface
// stay untouched), consuming the shared design tokens (app/components/kit.js).
//
// Built to the dataviz method, validated for this dark surface (#161B22):
//   • categorical order is FIXED [blue, orange, teal, gold] (+pink, green only
//     with direct labels) — validated: adjacent-pair CVD ΔE ≥ 15 (protan),
//     normal ΔE ≥ 23, contrast ≥ 3:1 on the panel surface;
//   • marks: bars ≤ 24px w/ 4px rounded data-end + square baseline, 2px
//     surface gaps; 2px lines w/ round joins; ≥ 8px markers w/ 2px surface
//     ring; hairline solid gridlines; area fills at 10% opacity;
//   • every multi-series chart keeps a legend; text NEVER wears series color;
//   • every chart ships a hover/focus layer (crosshair on lines; per-mark on
//     bars) whose values are ALSO reachable via the table toggle — tooltips
//     enhance, never gate;
//   • status colors are reserved and always paired with a glyph + word (never
//     color alone).

import { useId, useMemo, useRef, useState } from "react";
import { C, TYPE, SPACE, RADII, MOTION } from "../components/kit";

// ── palette (validated) ─────────────────────────────────────────────────────
export const CAT = [C.blue, C.accent, "#2DD4BF", C.gold, C.pink, C.green];
export const STATUS = { good: C.green, warn: C.gold, serious: "#FF8A3D", critical: C.red };
export const SURFACE = C.panel, CARD = C.card, GRID = "#232B3A";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ── formatters ──────────────────────────────────────────────────────────────
export function fmtNum(v) {
  if (v == null || !isFinite(Number(v))) return "–";
  const n = Number(v);
  const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(0) + "K";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  if (a > 0 && a < 1) return String(Math.round(n * 1000) / 1000);
  return String(Math.round(n).toLocaleString ? Math.round(n).toLocaleString("en-US") : Math.round(n));
}
export function fmtPct(v, digits = 0) {
  if (v == null || !isFinite(Number(v))) return "–";
  return (Number(v) * 100).toFixed(digits) + "%";
}
export function fmtMs(v) {
  if (v == null || !isFinite(Number(v))) return "–";
  const n = Number(v);
  return n >= 1000 ? (n / 1000).toFixed(1) + "s" : Math.round(n) + "ms";
}
export function fmtUsd(v) {
  if (v == null || !isFinite(Number(v))) return "–";
  return "$" + Number(v).toFixed(2);
}
const dayLabel = (d) => {
  const s = String(d || "").slice(5); // MM-DD
  return s.replace(/^0/, "").replace("-0", "/").replace("-", "/");
};

// clean y ticks: 0..max → ~4 rounded steps
function ticksFor(max) {
  if (!(max > 0)) return [0, 1];
  const raw = max / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 4) || pow * 10;
  const out = [];
  for (let v = 0; v <= max * 1.0001; v += step) out.push(Math.round(v * 100) / 100);
  if (out[out.length - 1] < max) out.push(Math.round((out[out.length - 1] + step) * 100) / 100);
  return out;
}

// ── shared chrome ───────────────────────────────────────────────────────────
export function Delta({ delta, label, goodWhenUp = true }) {
  // Direction is carried by GLYPH + signed number + label — never color alone.
  if (!delta || delta.pct == null) {
    const isNew = delta && delta.dir === "up" && delta.abs > 0;
    return <span style={{ fontSize: 11, color: C.muted }} title={label}>{isNew ? "new · " : "– "}{label}</span>;
  }
  const up = delta.dir === "up", flat = delta.dir === "flat";
  const good = flat ? null : up === goodWhenUp;
  const col = flat ? C.muted : good ? C.green : C.red;
  const glyph = flat ? "→" : up ? "▲" : "▼";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: col, whiteSpace: "nowrap" }}>
      <span aria-hidden="true">{glyph} </span>
      {(delta.pct > 0 ? "+" : "") + delta.pct.toFixed(Math.abs(delta.pct) < 10 ? 1 : 0)}%
      <span style={{ color: C.muted, fontWeight: 600 }}> {label}</span>
    </span>
  );
}

// Definition tooltip: a real button (keyboard + touch), popover on toggle.
export function DefTip({ text }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!text) return null;
  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button" aria-expanded={open} aria-describedby={open ? id : undefined}
        onClick={() => setOpen((v) => !v)} onBlur={() => setOpen(false)}
        title="What is this?"
        style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11, padding: "2px 4px", lineHeight: 1 }}
      >ⓘ<span style={{ position: "absolute", left: -9999 }}>definition</span></button>
      {open && (
        <span role="tooltip" id={id} style={{
          position: "absolute", zIndex: 60, top: "100%", left: "50%", transform: "translateX(-50%)",
          width: 240, background: "#0A0E14", border: `1px solid ${C.border}`, borderRadius: 10,
          padding: "8px 10px", fontSize: 11.5, lineHeight: 1.45, color: C.light, boxShadow: "0 10px 34px rgba(0,0,0,.5)",
        }}>{text}</span>
      )}
    </span>
  );
}

// Source freshness badge — connected / not connected / error, with fetch time.
export function SourceBadge({ source }) {
  if (!source) return null;
  const ok = source.connected;
  const col = ok ? C.green : source.reason === "error" ? STATUS.serious : C.muted;
  const label = ok ? source.name : `${source.name}: ${source.reason === "error" ? "error" : "not connected"}`;
  const t = source.fetchedAt ? new Date(source.fetchedAt) : null;
  const time = t ? t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <span title={source.nextStep || source.note || ""} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, color: C.muted, whiteSpace: "nowrap" }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: col, display: "inline-block" }} />
      {label}{time ? ` · ${time}` : ""}{source.confidence && source.confidence !== "measured" ? ` · ${source.confidence}` : ""}
    </span>
  );
}

// "Not connected" block — states what's missing and the exact next step.
export function NotConnected({ source, compact }) {
  return (
    <div style={{ border: `1px dashed ${C.border}`, borderRadius: RADII.control, padding: compact ? "10px 12px" : "14px 16px", background: "rgba(148,163,184,.04)" }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: C.light, marginBottom: 4 }}>
        <span aria-hidden="true" style={{ marginRight: 6 }}>◌</span>{source && source.name} — {source && source.reason === "error" ? "temporarily unavailable" : "not connected"}
      </div>
      <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5 }}>
        {source && source.reason === "error" ? (source.note || "The provider call failed; data withheld rather than guessed.") : (source && source.nextStep) || "No credentials configured."}
      </div>
      {source && source.link ? <a href={source.link} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, color: C.accent, fontWeight: 700 }}>Open provider dashboard ↗</a> : null}
    </div>
  );
}

// Chart/table wrapper: every chart is also a table (accessibility floor).
export function Frame({ title, def, source, columns, rows, children, right }) {
  const [mode, setMode] = useState("chart");
  const btn = (m, label) => (
    <button type="button" onClick={() => setMode(m)} aria-pressed={mode === m}
      style={{
        background: mode === m ? C.adim : "none", color: mode === m ? C.accent : C.muted,
        border: `1px solid ${mode === m ? C.accent : C.border}`, borderRadius: 8, fontSize: 10.5, fontWeight: 800,
        padding: "3px 8px", cursor: "pointer", transition: `all ${MOTION.fast} ${MOTION.ease}`,
      }}>{label}</button>
  );
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <span style={{ ...TYPE.eyebrow, color: C.muted }}>{title}</span>
        <DefTip text={def} />
        <span style={{ flex: 1 }} />
        {right}
        {columns && rows ? <span style={{ display: "inline-flex", gap: 4 }}>{btn("chart", "Chart")}{btn("table", "Table")}</span> : null}
      </div>
      {mode === "table" && columns && rows ? <DataTable columns={columns} rows={rows} caption={title} /> : children}
      {source ? <div style={{ marginTop: 6 }}><SourceBadge source={source} /></div> : null}
    </div>
  );
}

export function DataTable({ columns, rows, caption }) {
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${C.border}`, borderRadius: RADII.control }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
        <caption style={{ position: "absolute", left: -9999 }}>{caption}</caption>
        <thead>
          <tr>{columns.map((c) => <th key={c} scope="col" style={{ textAlign: "left", padding: "7px 10px", color: C.muted, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: `1px solid ${C.border}` }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? `1px solid ${GRID}` : "none" }}>
              {r.map((cell, j) => <td key={j} style={{ padding: "7px 10px", color: j === 0 ? C.text : C.light }}>{cell == null ? "–" : String(cell)}</td>)}
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={columns.length} style={{ padding: 12, color: C.muted, fontSize: 12 }}>No rows in this window.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyNote({ children }) {
  return <div style={{ padding: "18px 12px", textAlign: "center", color: C.muted, fontSize: 12, lineHeight: 1.5, border: `1px dashed ${GRID}`, borderRadius: RADII.control }}>{children}</div>;
}

// ── stat tile ───────────────────────────────────────────────────────────────
export function StatTile({ label, value, sub, deltas, def, source, spark, goodWhenUp = true, hero }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${C.border}`, borderRadius: RADII.card, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: "0.2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
        <DefTip text={def} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "4px 0 2px" }}>
        <span style={{ fontSize: hero ? 34 : 24, fontWeight: 800, color: C.text, letterSpacing: "-0.5px", lineHeight: 1.05 }}>{value}</span>
        {sub ? <span style={{ fontSize: 11.5, color: C.muted }}>{sub}</span> : null}
      </div>
      {spark && spark.length > 1 ? <Sparkline data={spark} /> : null}
      {deltas && deltas.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 6 }}>
          {deltas.map((d, i) => <Delta key={i} delta={d.delta} label={d.label} goodWhenUp={goodWhenUp} />)}
        </div>
      ) : null}
      {source ? <div style={{ marginTop: 6 }}><SourceBadge source={source} /></div> : null}
    </div>
  );
}

export function Sparkline({ data, color = C.blue, height = 26 }) {
  const w = 120, h = height, pad = 3;
  const vals = data.map((d) => Number(d) || 0);
  const max = Math.max(...vals, 1);
  const pts = vals.map((v, i) => [pad + (i * (w - pad * 2)) / Math.max(1, vals.length - 1), h - pad - ((v / max) * (h - pad * 2))]);
  const dPath = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true" style={{ display: "block" }}>
      <path d={dPath} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.55" />
      <circle cx={last[0]} cy={last[1]} r="4" fill={color} stroke={SURFACE} strokeWidth="2" />
    </svg>
  );
}

// ── line chart (multi-series, crosshair + tooltip, legend, end labels) ─────
export function LineChart({ series, xLabels, height = 180, yFmt = fmtNum, area = true }) {
  // series: [{name, color, values:[...]}] — same length as xLabels.
  const ref = useRef(null);
  const [hover, setHover] = useState(null); // index
  const W = 720, H = height, padL = 40, padR = 14, padT = 12, padB = 22;
  const n = xLabels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => Number(v) || 0)));
  const ticks = ticksFor(max);
  const yMax = ticks[ticks.length - 1];
  const x = (i) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const y = (v) => padT + (H - padT - padB) * (1 - (Number(v) || 0) / yMax);

  const move = (e) => {
    const el = ref.current; if (!el || n < 1) return;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - padL) / Math.max(1, W - padL - padR)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const key = (e) => {
    if (e.key === "ArrowRight") { setHover((h) => Math.min(n - 1, (h == null ? 0 : h + 1))); e.preventDefault(); }
    else if (e.key === "ArrowLeft") { setHover((h) => Math.max(0, (h == null ? n - 1 : h - 1))); e.preventDefault(); }
    else if (e.key === "Escape") setHover(null);
  };
  const showEndLabels = series.length >= 2 && series.length <= 4;

  return (
    <div style={{ position: "relative" }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="line chart (table view available)" tabIndex={0}
        onPointerMove={move} onPointerLeave={() => setHover(null)} onKeyDown={key} onBlur={() => setHover(null)}
        style={{ width: "100%", height: "auto", display: "block", touchAction: "pan-y", outlineOffset: 2 }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={C.muted} fontFamily={FONT}>{yFmt(t)}</text>
          </g>
        ))}
        {xLabels.map((lb, i) => (n <= 10 || i % Math.ceil(n / 8) === 0) ? (
          <text key={i} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9.5" fill={C.muted} fontFamily={FONT}>{dayLabel(lb)}</text>
        ) : null)}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => [x(i), y(v)]);
          const dLine = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
          const dArea = `${dLine}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`;
          return (
            <g key={s.name}>
              {area && series.length === 1 ? <path d={dArea} fill={s.color} opacity="0.1" /> : null}
              <path d={dLine} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {hover != null && <circle cx={x(hover)} cy={y(s.values[hover])} r="4.5" fill={s.color} stroke={SURFACE} strokeWidth="2" />}
              {showEndLabels && n > 0 && (
                <text x={W - padR + 2} y={y(s.values[n - 1]) + 3.5 + (si === 1 && Math.abs(y(series[0].values[n - 1]) - y(s.values[n - 1])) < 10 ? 11 : 0)}
                  textAnchor="start" fontSize="9.5" fontWeight="700" fill={C.light} fontFamily={FONT}>{s.name.slice(0, 10)}</text>
              )}
            </g>
          );
        })}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke={C.muted} strokeWidth="1" opacity="0.6" />}
      </svg>
      {series.length >= 2 && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
          {series.map((s) => (
            <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: C.light }}>
              <span aria-hidden="true" style={{ width: 14, height: 2, background: s.color, display: "inline-block", borderRadius: 2 }} />{s.name}
            </span>
          ))}
        </div>
      )}
      {hover != null && (
        <div role="status" style={{
          position: "absolute", top: 4, left: "50%", transform: "translateX(-50%)",
          background: "#0A0E14", border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 10px",
          pointerEvents: "none", boxShadow: "0 10px 34px rgba(0,0,0,.5)", minWidth: 120, zIndex: 5,
        }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{xLabels[hover]}</div>
          {series.map((s) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span aria-hidden="true" style={{ width: 10, height: 2, background: s.color, borderRadius: 2 }} />
              <span style={{ fontWeight: 800, color: C.text }}>{yFmt(s.values[hover])}</span>
              <span style={{ color: C.muted, fontSize: 10.5 }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── column chart (daily bars, per-mark tooltip) ─────────────────────────────
export function Columns({ labels, values, color = CAT[0], height = 150, yFmt = fmtNum }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = height, padL = 40, padR = 10, padT = 10, padB = 22;
  const n = Math.max(1, labels.length);
  const max = Math.max(1, ...values.map((v) => Number(v) || 0));
  const ticks = ticksFor(max);
  const yMax = ticks[ticks.length - 1];
  const slot = (W - padL - padR) / n;
  const bw = Math.min(24, Math.max(3, slot - 2)); // ≤24px, 2px surface gap
  const y = (v) => padT + (H - padT - padB) * (1 - (Number(v) || 0) / yMax);
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="column chart (table view available)" style={{ width: "100%", height: "auto", display: "block" }} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={C.muted} fontFamily={FONT}>{yFmt(t)}</text>
          </g>
        ))}
        {values.map((v, i) => {
          const cx = padL + i * slot + slot / 2;
          const top = y(v), bh = Math.max(0, y(0) - top);
          const r = Math.min(4, bw / 2, bh); // 4px rounded data-end, square baseline
          return (
            <g key={i} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onPointerEnter={() => setHover(i)} aria-label={`${labels[i]}: ${yFmt(v)}`}>
              <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              <path d={`M${(cx - bw / 2).toFixed(1)},${y(0)} L${(cx - bw / 2).toFixed(1)},${(top + r).toFixed(1)} Q${(cx - bw / 2).toFixed(1)},${top.toFixed(1)} ${(cx - bw / 2 + r).toFixed(1)},${top.toFixed(1)} L${(cx + bw / 2 - r).toFixed(1)},${top.toFixed(1)} Q${(cx + bw / 2).toFixed(1)},${top.toFixed(1)} ${(cx + bw / 2).toFixed(1)},${(top + r).toFixed(1)} L${(cx + bw / 2).toFixed(1)},${y(0)} Z`}
                fill={color} opacity={hover == null || hover === i ? 1 : 0.45} style={{ transition: `opacity ${MOTION.fast} ${MOTION.ease}` }} />
            </g>
          );
        })}
        {labels.map((lb, i) => (n <= 10 || i % Math.ceil(n / 8) === 0) ? (
          <text key={i} x={padL + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fill={C.muted} fontFamily={FONT}>{dayLabel(lb)}</text>
        ) : null)}
      </svg>
      {hover != null && (
        <div role="status" style={{ position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)", background: "#0A0E14", border: `1px solid ${C.border}`, borderRadius: 10, padding: "6px 10px", pointerEvents: "none", zIndex: 5 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{yFmt(values[hover])}</span>
          <span style={{ fontSize: 10.5, color: C.muted }}> · {labels[hover]}</span>
        </div>
      )}
    </div>
  );
}

// ── stacked columns (2 series, e.g. new vs returning) ───────────────────────
export function StackedColumns({ labels, seriesA, seriesB, height = 150 }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = height, padL = 40, padR = 10, padT = 10, padB = 22;
  const n = Math.max(1, labels.length);
  const totals = labels.map((_, i) => (Number(seriesA.values[i]) || 0) + (Number(seriesB.values[i]) || 0));
  const max = Math.max(1, ...totals);
  const ticks = ticksFor(max);
  const yMax = ticks[ticks.length - 1];
  const slot = (W - padL - padR) / n;
  const bw = Math.min(24, Math.max(3, slot - 2));
  const hFor = (v) => ((Number(v) || 0) / yMax) * (H - padT - padB);
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="stacked column chart (table view available)" style={{ width: "100%", height: "auto", display: "block" }} onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={padT + (H - padT - padB) * (1 - t / yMax)} y2={padT + (H - padT - padB) * (1 - t / yMax)} stroke={GRID} strokeWidth="1" />
            <text x={padL - 6} y={padT + (H - padT - padB) * (1 - t / yMax) + 3.5} textAnchor="end" fontSize="10" fill={C.muted} fontFamily={FONT}>{fmtNum(t)}</text>
          </g>
        ))}
        {labels.map((lb, i) => {
          const x0 = padL + i * slot + (slot - bw) / 2;
          const base = H - padB;
          const hA = hFor(seriesA.values[i]);
          const hB = hFor(seriesB.values[i]);
          return (
            <g key={i} tabIndex={0} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onPointerEnter={() => setHover(i)} aria-label={`${lb}: ${seriesA.name} ${seriesA.values[i] || 0}, ${seriesB.name} ${seriesB.values[i] || 0}`}>
              <rect x={padL + i * slot} y={padT} width={slot} height={H - padT - padB} fill="transparent" />
              {hA > 0 && <rect x={x0} y={base - hA} width={bw} height={hA} fill={seriesA.color} opacity={hover == null || hover === i ? 1 : 0.45} />}
              {hB > 0 && <rect x={x0} y={base - hA - 2 - hB} width={bw} height={hB} rx={Math.min(4, bw / 2, hB)} fill={seriesB.color} opacity={hover == null || hover === i ? 1 : 0.45} />}
            </g>
          );
        })}
        {labels.map((lb, i) => (n <= 10 || i % Math.ceil(n / 8) === 0) ? (
          <text key={i} x={padL + i * slot + slot / 2} y={H - 6} textAnchor="middle" fontSize="9.5" fill={C.muted} fontFamily={FONT}>{dayLabel(lb)}</text>
        ) : null)}
      </svg>
      <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
        {[seriesA, seriesB].map((s) => (
          <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: C.light }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, background: s.color, display: "inline-block", borderRadius: 2 }} />{s.name}
          </span>
        ))}
      </div>
      {hover != null && (
        <div role="status" style={{ position: "absolute", top: 2, left: "50%", transform: "translateX(-50%)", background: "#0A0E14", border: `1px solid ${C.border}`, borderRadius: 10, padding: "7px 10px", pointerEvents: "none", zIndex: 5 }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{labels[hover]}</div>
          {[seriesB, seriesA].map((s) => (
            <div key={s.name} style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, background: s.color, borderRadius: 2 }} />
              <span style={{ fontWeight: 800, color: C.text }}>{fmtNum(s.values[hover])}</span>
              <span style={{ color: C.muted, fontSize: 10.5 }}>{s.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ranked horizontal bars (top pages / places / breakdowns) ────────────────
export function HBarList({ items, color = CAT[0], valueFmt = fmtNum, maxRows = 10, secondary }) {
  // items: [{label, value, secondary?, href?}] — ONE series → ONE color (no value-ramp).
  const rows = (items || []).slice(0, maxRows);
  const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0));
  if (!rows.length) return <EmptyNote>No data in this window yet.</EmptyNote>;
  return (
    <div role="list">
      {rows.map((r, i) => (
        <div role="listitem" key={i} title={`${r.label}: ${valueFmt(r.value)}`}
          style={{ display: "grid", gridTemplateColumns: "minmax(90px, 1.4fr) 2fr auto", gap: 8, alignItems: "center", padding: "4px 0", minHeight: 24 }}>
          <span style={{ fontSize: 12, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.label}</span>
          <span aria-hidden="true" style={{ height: 10, background: GRID, borderRadius: 5, overflow: "hidden", position: "relative" }}>
            <span style={{ position: "absolute", inset: 0, width: `${Math.max(2, ((Number(r.value) || 0) / max) * 100)}%`, background: color, borderRadius: "0 5px 5px 0", transition: `width ${MOTION.slow} ${MOTION.ease}` }} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 800, color: C.light, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {valueFmt(r.value)}{r.secondary != null ? <span style={{ color: C.muted, fontWeight: 600 }}> · {r.secondary}</span> : null}
          </span>
        </div>
      ))}
      {secondary ? <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>{secondary}</div> : null}
    </div>
  );
}

// ── funnel ──────────────────────────────────────────────────────────────────
export function Funnel({ steps }) {
  // steps: [{step, devices}] ordered. Ordered categories → single hue.
  const rows = steps || [];
  if (!rows.length) return <EmptyNote>No funnel data in this window.</EmptyNote>;
  const max = Math.max(1, Number(rows[0].devices) || 1);
  return (
    <div>
      {rows.map((s, i) => {
        const v = Number(s.devices) || 0;
        const prev = i > 0 ? Number(rows[i - 1].devices) || 0 : null;
        const conv = prev != null && prev > 0 ? v / prev : null;
        const overall = max > 0 ? v / max : null;
        return (
          <div key={s.step} style={{ marginBottom: i < rows.length - 1 ? 10 : 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: C.text, fontWeight: 700 }}>{i + 1}. {s.step}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.light, fontVariantNumeric: "tabular-nums" }}>
                {fmtNum(v)}<span style={{ color: C.muted, fontWeight: 600, fontSize: 10.5 }}> devices{overall != null && i > 0 ? ` · ${fmtPct(overall)} of top` : ""}</span>
              </span>
            </div>
            <div aria-hidden="true" style={{ height: 14, background: GRID, borderRadius: 7, overflow: "hidden", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, width: `${Math.max(1.5, (v / max) * 100)}%`, background: C.accent, opacity: 1 - i * 0.13, borderRadius: "0 7px 7px 0", transition: `width ${MOTION.slow} ${MOTION.ease}` }} />
            </div>
            {conv != null && (
              <div style={{ fontSize: 10.5, color: conv < 0.1 ? STATUS.serious : C.muted, marginTop: 2 }}>
                {fmtPct(conv)} continue · {fmtPct(1 - conv)} drop off here
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── cohort grid (weekly) ────────────────────────────────────────────────────
export function CohortGrid({ rows }) {
  // rows: [{week_start, new_users, cells: [{offset, active}]}]
  if (!rows || !rows.length) return <EmptyNote>No signup cohorts yet — the table fills as accounts age week over week.</EmptyNote>;
  const maxOffset = Math.max(...rows.map((r) => Math.max(0, ...r.cells.map((c) => c.offset))), 0);
  const shade = (rate) => rate == null ? "transparent" : `rgba(249,115,22,${0.12 + Math.min(0.75, rate * 0.75)})`; // single-hue sequential
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 2, fontSize: 11.5, fontVariantNumeric: "tabular-nums" }}>
        <caption style={{ position: "absolute", left: -9999 }}>Weekly signup cohorts — share of each cohort active by weeks since signup</caption>
        <thead>
          <tr>
            <th scope="col" style={{ textAlign: "left", color: C.muted, fontSize: 10.5, padding: "4px 8px" }}>Signup week</th>
            <th scope="col" style={{ color: C.muted, fontSize: 10.5, padding: "4px 8px" }}>Size</th>
            {Array.from({ length: maxOffset + 1 }, (_, i) => <th key={i} scope="col" style={{ color: C.muted, fontSize: 10.5, padding: "4px 6px" }}>W{i}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.week_start}>
              <th scope="row" style={{ textAlign: "left", color: C.text, fontWeight: 700, padding: "4px 8px", whiteSpace: "nowrap" }}>{r.week_start}</th>
              <td style={{ color: C.light, textAlign: "center", padding: "4px 8px" }}>{r.new_users}</td>
              {Array.from({ length: maxOffset + 1 }, (_, o) => {
                const cell = r.cells.find((c) => c.offset === o);
                const rate = cell && r.new_users > 0 ? cell.active / r.new_users : null;
                return (
                  <td key={o} title={cell ? `${cell.active}/${r.new_users} active in week ${o}` : "no data"}
                    style={{ background: shade(rate), color: rate != null && rate > 0.55 ? "#0D1117" : C.light, textAlign: "center", minWidth: 34, padding: "4px 6px", borderRadius: 4 }}>
                    {rate == null ? "–" : fmtPct(rate)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 4 }}>Cell = share of that signup week's accounts with signed-in activity in week N after signup. Darker = higher.</div>
    </div>
  );
}

// ── status pill (never color alone) ─────────────────────────────────────────
export function StatusPill({ ok, label, detail }) {
  const state = ok === true ? "good" : ok === false ? "critical" : "warn";
  const col = STATUS[state];
  const glyph = ok === true ? "✓" : ok === false ? "✕" : "…";
  const word = ok === true ? "OK" : ok === false ? "FAIL" : "n/a";
  return (
    <span title={detail || ""} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: CARD, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 10px", fontSize: 11.5 }}>
      <span aria-hidden="true" style={{ color: col, fontWeight: 800 }}>{glyph}</span>
      <span style={{ color: C.text, fontWeight: 700 }}>{label}</span>
      <span style={{ color: C.muted }}>{word}{detail ? ` · ${detail}` : ""}</span>
    </span>
  );
}
