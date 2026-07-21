"use client";
// Morning Picks (§3) — one premium café card, shown ONLY before 11:00 in the
// LOCATION'S local time, not the site's.
//
// WHY LOCATION-LOCAL MATTERS: a user in Florida searching Los Angeles at 1pm ET
// is looking at a place where it is 10am. Gating on site time would hide the
// section exactly when it is most relevant. The timezone is REAL, not guessed:
// /api/weather already calls Open-Meteo with `timezone=auto` and passes the raw
// body through, so the response carries an IANA `timezone` (verified live:
// 27.34,-82.53 -> "America/New_York"). If that lookup fails we fall back to the
// site timezone rather than invent one.
//
// Selection is honest: real Google rating + proximity + open-now. The headline
// is a story line chosen deterministically — never "Best Coffee" / "Top Cafe",
// which would be an unearned superlative.
import { useEffect, useMemo, useState } from "react";
import { getMorningPick } from "../../../lib/morningPicks.js";

const C = { bg: "#0D1117", card: "#161B22", border: "#1F2937", text: "#F1F5F9", muted: "#8B949E", accent: "#F97316", warm: "#FFC28A" };

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

// Google Places rows -> the shape lib/morningPicks.js expects. Defensive about
// both the raw Google field names and the app's normalised ones.
function normalize(rows) {
  return (rows || []).map((p) => ({
    place_id: p.place_id || p.id || null,
    name: (p.displayName && p.displayName.text) || p.name || "",
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: p.userRatingCount ?? p.reviews ?? null,
    lat: p.lat ?? (p.location && p.location.latitude) ?? null,
    lng: p.lng ?? (p.location && p.location.longitude) ?? null,
    types: Array.isArray(p.types) ? p.types : [],
    openNow: p.openNow ?? null,
    photo: p.photo || null,
  })).filter((p) => p.place_id && p.name);
}

export default function MorningPicksScreen() {
  const { center, label, state } = useCenter();
  const [tz, setTz] = useState(null);
  const [tzState, setTzState] = useState("pending");
  const [places, setPlaces] = useState(null);
  // Preview aid: ?now=2026-07-21T13:00:00Z lets the owner verify BOTH gate
  // states without waiting for the clock. Ignored unless explicitly supplied.
  const [nowOverride] = useState(() => {
    try { const v = new URLSearchParams(window.location.search).get("now"); const d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; } catch (e) { return null; }
  });

  useEffect(() => {
    if (!center) return;
    let off = false;
    (async () => {
      try {
        const r = await fetch(`/api/weather?lat=${center.lat}&lng=${center.lng}`);
        const d = r.ok ? await r.json() : null;
        if (!off) { setTz(d && typeof d.timezone === "string" ? d.timezone : null); setTzState(d && d.timezone ? "resolved" : "fallback"); }
      } catch (e) { if (!off) setTzState("fallback"); }
    })();
    (async () => {
      try {
        const r = await fetch("/api/places/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: "coffee shop cafe", lat: center.lat, lng: center.lng, radius: 24000, n: 20 }) });
        const d = r.ok ? await r.json() : null;
        if (!off) setPlaces(normalize(d && (d.places || d.results) ? (d.places || d.results) : []));
      } catch (e) { if (!off) setPlaces([]); }
    })();
    return () => { off = true; };
  }, [center]);

  const pick = useMemo(() => {
    if (!places || tzState === "pending") return null;
    return getMorningPick(places, { now: nowOverride || new Date(), tz: tz || undefined, center, maxRadiusMi: 15 });
  }, [places, tz, tzState, center, nowOverride]);

  const wrap = { maxWidth: 480, margin: "0 auto", padding: "18px 14px 28px", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", minHeight: "100vh" };
  const where = label ? label.split(",")[0] : "you";

  if (state === "denied" && !center) {
    return <main style={wrap}><p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>Wayfind needs a location to find your morning coffee.</p></main>;
  }
  if (!pick) return <main style={wrap}><p style={{ fontSize: 13, color: C.muted }}>Checking the morning near you…</p></main>;

  // THE GATE. After 11:00 local, or with no café nearby, the section renders
  // NOTHING — it is not a "come back later" placeholder, it simply isn't part
  // of the page. The note below only appears when previewing with ?now=.
  if (!pick.show) {
    return nowOverride ? (
      <main style={wrap}>
        <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5 }}>
          Morning Picks is hidden — <strong style={{ color: C.text }}>{pick.reason}</strong>
          {tz ? ` (${tz})` : ""}. In the real homepage this section renders nothing at all.
        </p>
      </main>
    ) : null;
  }

  const p = pick.place;
  const facts = [];
  if (typeof p.rating === "number") facts.push(`${p.rating.toFixed(1)}★`);
  if (p.distanceMi != null) facts.push(`${p.distanceMi.toFixed ? p.distanceMi.toFixed(1) : p.distanceMi} mi away`);
  if (p.openNow === true) facts.push("Open now");

  return (
    <main style={wrap}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.5)", color: C.accent, fontSize: 11.5, fontWeight: 800 }}>Curated by Wayfind AI</span>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(255,255,255,.06)", border: `1px solid ${C.border}`, color: C.muted, fontSize: 11.5, fontWeight: 800 }}>Based on the time of day &amp; what’s near you</span>
      </div>

      {/* Story headline — never a superlative we cannot back. */}
      <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 4px", lineHeight: 1.22 }}>{pick.headline}</h2>
      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "0 0 13px" }}>
        It’s morning where you are — here’s a top-rated café close to {where}{p.openNow === true ? ", open now" : ""}.
      </p>

      <article style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.4)" }}>
        <div style={{ position: "relative", height: 190, background: p.photo ? "#0B0F14" : `linear-gradient(140deg, ${C.warm}2E, ${C.bg} 72%)` }}>
          {p.photo ? <img src={p.photo} alt="" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.10) 0%, rgba(0,0,0,.55) 58%, rgba(0,0,0,.9) 100%)" }} />
          <div style={{ position: "absolute", left: 13, right: 13, bottom: 11 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.25 }}>{p.name}</h3>
            {facts.length ? <div style={{ marginTop: 4, fontSize: 12.5, color: "#C9D1D9" }}>{facts.join(" · ")}</div> : null}
          </div>
        </div>
        <div style={{ padding: "12px 13px" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.accent }}>{pick.cta}</span>
        </div>
      </article>

      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 16, opacity: .85 }}>
        Chosen on Google rating, distance and whether it’s open — in {tz || "your local"} time. Wayfind doesn’t have
        crowd or wait-time data, so none is implied here.
      </p>
    </main>
  );
}
