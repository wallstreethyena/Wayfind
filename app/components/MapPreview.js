"use client";
// app/components/MapPreview.js — v6.41 THE MAP BILL FIX.
// The desktop sidebar used to mount the real Google Map on EVERY home visit,
// billing one Dynamic Maps load per visitor whether they ever touched it
// (the "charges are coming from the map API" bill). This is a ZERO-COST
// stand-in: the same dark panel, the same 5/10/15/20-mile rings, the same
// pins from already-loaded rows, the same tap-a-pin -> detail behavior —
// drawn with plain DOM. No Google SDK, no billed load. The "Full map"
// button still opens the REAL map screen, so paid loads now track genuine
// map usage instead of page views.
import { C } from "./kit";

const MI_PER_DEG_LAT = 69.05;

export default function MapPreview({ places = [], center, deviceLoc, onSelect, maxMi = 20 }) {
  const c = center && center.lat != null ? center : (deviceLoc || null);
  const H = 320; // panel height (px) — matches the old sidebar map
  const pad = 10;
  const scale = (H / 2 - pad) / maxMi; // px per mile, uniform on both axes
  const toXY = (p) => {
    const dLatMi = (p.lat - c.lat) * MI_PER_DEG_LAT;
    const dLngMi = (p.lng - c.lng) * MI_PER_DEG_LAT * Math.cos((c.lat * Math.PI) / 180);
    return { x: dLngMi * scale, y: -dLatMi * scale, mi: Math.sqrt(dLatMi * dLatMi + dLngMi * dLngMi) };
  };
  const pins = c ? (places || []).filter((p) => p && p.lat != null && p.lng != null).map((p) => ({ p, ...toXY(p) })).filter((q) => q.mi <= maxMi * 1.05).slice(0, 20) : [];
  const rings = [5, 10, 15, 20].filter((mi) => mi <= maxMi);
  return (
    <div role="img" aria-label={`Map preview: ${pins.length} places within ${maxMi} miles`} style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 50%, #131A26 0%, #0D1117 78%)", overflow: "hidden" }}>
      {/* distance rings — same 5/10/15/20mi frame the real map draws */}
      {c && rings.map((mi) => (
        <div key={mi} style={{ position: "absolute", left: "50%", top: "50%", width: mi * scale * 2, height: mi * scale * 2, marginLeft: -mi * scale, marginTop: -mi * scale, borderRadius: "50%", border: "1px solid rgba(148,163,184,.16)", pointerEvents: "none" }}>
          <span style={{ position: "absolute", top: -7, left: "50%", transform: "translateX(-50%)", fontSize: 9, color: "rgba(148,163,184,.45)", background: "#0D1117", padding: "0 4px", borderRadius: 4 }}>{mi} mi</span>
        </div>
      ))}
      {/* you-are-here */}
      {c && (
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: "50%", background: "#38BDF8", boxShadow: "0 0 0 4px rgba(56,189,248,.22), 0 0 12px rgba(56,189,248,.6)", pointerEvents: "none" }} />
      )}
      {/* pins — already-loaded rows, tap -> place detail (same as the old map) */}
      {pins.map(({ p, x, y }, i) => (
        <button key={p.id || i} onClick={() => onSelect && onSelect(p)} title={p.name} aria-label={p.name}
          style={{ position: "absolute", left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, width: 14, height: 14, marginLeft: -7, marginTop: -7, borderRadius: "50%", border: "2px solid #0D1117", background: C.accent, boxShadow: "0 0 8px rgba(249,115,22,.75)", cursor: "pointer", padding: 0, transition: "transform .12s ease", zIndex: 3 }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.45)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        />
      ))}
      {!c && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 12.5 }}>Locating…</div>}
    </div>
  );
}
