"use client";
// Beach Intelligence (§0) — the surface for lib/marine.js.
//
// THE SAFETY GATE IS THE PRODUCT. This section does not "show the beach with a
// warning" when the water is dangerous — it HIDES the recommendation and says
// why. Proven live 2026-07-21: Siesta Key and Santa Monica were both blocked by
// real active NWS alerts while Miami Beach showed as a great day. A section that
// cheerfully recommends a swim during a rip-current warning is worse than no
// section at all.
//
// Every number here is measured, keyless and attributed:
//   water temp / waves   Open-Meteo Marine
//   UV / air / rain      Open-Meteo Forecast (same provider /api/weather uses)
//   safety alerts        NWS api.weather.gov active alerts
//   tides                NOAA CO-OPS
// Crowd levels and parking are NOT sourced, so they are absent — not estimated.
import { useEffect, useState } from "react";

const C = { bg: "#0D1117", card: "#161B22", border: "#1F2937", text: "#F1F5F9", muted: "#8B949E", accent: "#F97316", sea: "#38BDF8", warn: "#F87171" };

function useCenter() {
  const [center, setCenter] = useState(null);
  const [label, setLabel] = useState("");
  const [state, setState] = useState("resolving");
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const qLat = parseFloat(sp.get("lat")), qLng = parseFloat(sp.get("lng"));
      if (isFinite(qLat) && isFinite(qLng)) { setCenter({ lat: qLat, lng: qLng }); setLabel(sp.get("loc") || ""); setState("url"); return; }
      const raw = localStorage.getItem("wf_center");
      if (raw) { const o = JSON.parse(raw); if (o && isFinite(o.lat) && isFinite(o.lng)) { setCenter({ lat: o.lat, lng: o.lng }); setLabel(o.loc || ""); setState("stored"); return; } }
    } catch (e) {}
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => { setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); setState("geo"); },
        () => setState("denied"), { timeout: 8000, maximumAge: 600000 });
    } else setState("denied");
  }, []);
  return { center, label, state };
}

function Stat({ label, value, tone }) {
  if (value == null || value === "") return null; // render only what exists
  return (
    <div style={{ flex: "1 1 72px", minWidth: 72, background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 10px" }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.muted }}>{label}</div>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: tone === "warn" ? C.warn : C.text, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function BeachScreen() {
  const { center, label, state } = useCenter();
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!center) return;
    let off = false;
    (async () => {
      try {
        // dist: miles to the nearest beach. Supplied by the caller in the real
        // homepage (OSM natural=beach layer); here it comes from ?dist= so the
        // too-far gate is verifiable. Absent => the engine skips the distance gate.
        const sp = new URLSearchParams(window.location.search);
        const dist = sp.get("dist");
        const r = await fetch(`/api/beach/conditions?lat=${center.lat}&lng=${center.lng}${dist ? `&dist=${encodeURIComponent(dist)}` : ""}`);
        const d = r.ok ? await r.json() : { show: false };
        if (!off) setData(d);
      } catch (e) { if (!off) setData({ show: false }); }
    })();
    return () => { off = true; };
  }, [center]);

  const wrap = { maxWidth: 480, margin: "0 auto", padding: "18px 14px 28px", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", minHeight: "100vh" };
  const where = label ? label.split(",")[0] : "you";

  if (state === "denied" && !center) return <main style={wrap}><p style={{ fontSize: 13.5, color: C.muted }}>Wayfind needs a location to check today's beach conditions.</p></main>;
  if (!data) return <main style={wrap}><p style={{ fontSize: 13, color: C.muted }}>Checking today's water, surf, UV and safety alerts…</p></main>;

  const c = data.conditions || {};
  const alerts = (c.alerts || []).filter((a) => a && a.unsafe);

  // HIDDEN STATES. The recommendation is withheld, and the reason is stated —
  // an unsafe beach day is a real answer, not an error.
  if (!data.show) {
    const why = data.status === "unsafe" ? "an active water-safety alert" : data.status === "too_far" ? "no beach close enough" : "today's conditions";
    return (
      <main style={wrap}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px" }}>No beach pick today</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.55, margin: "0 0 12px" }}>
          Wayfind checked the water, surf, UV, tides and safety alerts near {where} and isn’t recommending a beach today — {why}.
        </p>
        {alerts.length ? (
          <div style={{ background: "rgba(248,113,113,.08)", border: `1px solid rgba(248,113,113,.45)`, borderRadius: 14, padding: "11px 13px" }}>
            {alerts.slice(0, 2).map((a, i) => (
              <div key={i} style={{ marginBottom: i ? 0 : 7 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: C.warn }}>{a.event}</div>
                {a.headline ? <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, marginTop: 2 }}>{a.headline}</div> : null}
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: C.muted, marginTop: 8, opacity: .9 }}>Source: National Weather Service active alerts</div>
          </div>
        ) : (data.reasons || []).length ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: C.muted, lineHeight: 1.6 }}>{data.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        ) : null}
      </main>
    );
  }

  const uvCaution = data.status === "great_uv_caution";
  return (
    <main style={wrap}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.5)", color: C.accent, fontSize: 11.5, fontWeight: 800 }}>Curated by Wayfind AI</span>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(56,189,248,.12)", border: "1px solid rgba(56,189,248,.45)", color: C.sea, fontSize: 11.5, fontWeight: 800 }}>Based on today’s conditions</span>
      </div>
      <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 4px", lineHeight: 1.22 }}>Today’s beach pick near {where}</h2>
      {/* The reasoning names every signal actually checked — the vision's requirement. */}
      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "0 0 13px" }}>
        Wayfind checked today’s water, surf, UV, tides and safety alerts{c.distanceMi != null ? ` within ${c.distanceMi} miles` : ""} — it’s a good one.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Stat label="Water" value={c.waterTempF != null ? `${c.waterTempF}°F` : null} />
        <Stat label="Air" value={c.airTempMaxF != null ? `${Math.round(c.airTempMaxF)}°F` : null} />
        <Stat label="Waves" value={c.waveHeightFt != null ? `${c.waveHeightFt} ft` : null} />
        <Stat label="UV" value={c.uvIndexMax != null ? String(c.uvIndexMax) : null} tone={uvCaution ? "warn" : undefined} />
        <Stat label="Rain" value={c.precipProbMaxPct != null ? `${c.precipProbMaxPct}%` : null} />
      </div>

      {uvCaution ? <p style={{ fontSize: 12, color: C.warn, fontWeight: 700, marginTop: 10 }}>High UV today — bring sunscreen.</p> : null}

      {(c.tides || []).length ? (
        <div style={{ marginTop: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "11px 13px" }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .4, textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>Today’s tides</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {c.tides.slice(0, 4).map((t, i) => (
              <div key={i} style={{ fontSize: 12.5, color: C.text }}>
                <span style={{ color: t.type === "High" ? C.sea : C.muted, fontWeight: 800 }}>{t.type}</span>{" "}
                {String(t.time || "").slice(-5)}{t.ft != null ? ` · ${t.ft} ft` : ""}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: C.muted, marginTop: 7, opacity: .9 }}>Source: NOAA CO-OPS{c.tideStationMi != null ? ` · nearest station ${c.tideStationMi} mi` : ""}</div>
        </div>
      ) : null}

      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 16, opacity: .85 }}>
        Water and surf from Open-Meteo Marine, UV and rain from Open-Meteo, safety alerts from the National Weather
        Service, tides from NOAA. Wayfind has no crowd or parking data for beaches, so none is shown.
      </p>
    </main>
  );
}
