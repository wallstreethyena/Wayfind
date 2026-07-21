"use client";
// Shopping (§6) — one hero card, or nothing.
//
// This is the smallest section in V2 and the easiest to get wrong: a single
// card carries its whole claim, so if the pick is weak the section is worse
// than absent. pickShoppingHero requires a real shopping place type AND a
// rating >= 4.0 within the radius; when nothing clears that bar the section
// renders NOTHING rather than padding the page with the least-bad option.
//
// The headline comes from a curiosity set ("Retail Therapy Starts Here", "Worth
// Browsing Today", ...) — never the bare word "Shopping", which is the raw
// category name the doctrine bans.
//
// No crowd levels, no "trending", no sale/deal claims: Wayfind has no source
// for any of them and inventing one on a single hero card would be the most
// visible possible dishonesty.
import { useEffect, useMemo, useState } from "react";
import { pickShoppingHero } from "../../../lib/shopping.js";

const C = { bg: "#0D1117", card: "#161B22", border: "#1F2937", text: "#F1F5F9", muted: "#8B949E", accent: "#F97316" };

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

function normalize(rows) {
  return (rows || []).map((p) => ({
    place_id: p.place_id || p.id || null,
    name: (p.displayName && p.displayName.text) || p.name || "",
    rating: typeof p.rating === "number" ? p.rating : null,
    reviewCount: p.reviewCount ?? p.userRatingCount ?? p.reviews ?? null,
    lat: p.lat ?? (p.location && p.location.latitude) ?? null,
    lng: p.lng ?? (p.location && p.location.longitude) ?? null,
    types: Array.isArray(p.types) ? p.types : [],
    openNow: p.openNow ?? null,
    photo: p.photo || null,
  })).filter((p) => p.place_id && p.name);
}

export default function ShoppingScreen() {
  const { center, label, state } = useCenter();
  const [places, setPlaces] = useState(null);

  useEffect(() => {
    if (!center) return;
    let off = false;
    (async () => {
      try {
        const r = await fetch("/api/places/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: "shopping mall boutiques stores", lat: center.lat, lng: center.lng, radius: 32000, n: 20 }) });
        const d = r.ok ? await r.json() : null;
        if (!off) setPlaces(normalize(d && (d.places || d.results) ? (d.places || d.results) : []));
      } catch (e) { if (!off) setPlaces([]); }
    })();
    return () => { off = true; };
  }, [center]);

  // engagementMap intentionally omitted (7 devices — see §4/§5). Boost = 0.
  const hero = useMemo(() => (places ? pickShoppingHero(places, { center }) : null), [places, center]);

  const wrap = { maxWidth: 480, margin: "0 auto", padding: "18px 14px 28px", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", minHeight: "100vh" };
  const where = label ? label.split(",")[0] : "you";

  if (state === "denied" && !center) return <main style={wrap}><p style={{ fontSize: 13.5, color: C.muted }}>Wayfind needs a location to find somewhere worth browsing.</p></main>;
  if (!hero) return <main style={wrap}><p style={{ fontSize: 13, color: C.muted }}>Looking for somewhere worth browsing…</p></main>;

  // HIDDEN: nothing cleared the bar. The section is absent, not apologetic —
  // in the real homepage this renders nothing at all.
  if (!hero.show) return null;

  const p = hero.place;
  const facts = [];
  if (typeof p.rating === "number") facts.push(`${p.rating.toFixed(1)}★`);
  if (typeof p.reviewCount === "number" && p.reviewCount > 0) facts.push(`${p.reviewCount.toLocaleString()} reviews`);
  if (p.distanceMi != null) facts.push(`${Math.round(p.distanceMi * 10) / 10} mi away`);

  return (
    <main style={wrap}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.5)", color: C.accent, fontSize: 11.5, fontWeight: 800 }}>Curated by Wayfind AI</span>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(255,255,255,.06)", border: `1px solid ${C.border}`, color: C.muted, fontSize: 11.5, fontWeight: 800 }}>Based on your location</span>
      </div>

      {/* curiosity headline — never the bare category word */}
      <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 4px", lineHeight: 1.22 }}>{hero.headline}</h2>
      <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "0 0 13px" }}>
        A top-rated place to browse close to {where}{p.openNow === true ? ", open now" : ""}.
      </p>

      <article style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.4)" }}>
        <div style={{ position: "relative", height: 190, background: p.photo ? "#0B0F14" : "linear-gradient(140deg,#26202B,#0D1117 74%)" }}>
          {p.photo ? <img src={p.photo} alt="" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.10) 0%, rgba(0,0,0,.55) 58%, rgba(0,0,0,.9) 100%)" }} />
          <div style={{ position: "absolute", left: 13, right: 13, bottom: 11 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.25 }}>{p.name}</h3>
            {facts.length ? <div style={{ marginTop: 4, fontSize: 12.5, color: "#C9D1D9" }}>{facts.join(" · ")}</div> : null}
          </div>
        </div>
        <div style={{ padding: "12px 13px" }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.accent }}>{hero.cta}</span>
        </div>
      </article>

      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 16, opacity: .85 }}>
        Chosen on Google rating, review count, distance and whether it’s open. Wayfind has no sale, stock or crowd data
        for stores, so none is shown.
      </p>
    </main>
  );
}
