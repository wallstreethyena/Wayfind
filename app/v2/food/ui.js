"use client";
// Food (§5) — named dinner collections, never a flat restaurant list.
//
// EACH LABEL IS A CLAIM WITH A REAL PREDICATE BEHIND IT:
//   "Date Night Done Right"                    rating >=4.6 AND Google priceLevel >=3
//   "Locals Can't Stop Talking About These"    rating >=4.6 AND >=500 Google reviews
//   "Places Worth The Drive"                   12–45mi away AND rating >=4.6
//   "Restaurants You'd Probably Miss"          rating >=4.5 AND <300 reviews
//   "Tonight's Best Dinner Picks"              rating >=4.4 (catch-all)
//
// "Locals can't stop talking" rides on GOOGLE review volume — hundreds of real
// reviewers — not on Wayfind's own likes/saves, which were 73+42 from SEVEN
// devices on 2026-07-21. Same call as §1's popularity tag and §4's locals row:
// the first-party signal is real but far too thin to make a public claim, so the
// engagement boost stays unwired and contributes 0.
import { useEffect, useMemo, useState } from "react";
import { buildFoodCollections } from "../../../lib/foodCollections.js";

const C = { bg: "#0D1117", card: "#161B22", border: "#1F2937", text: "#F1F5F9", muted: "#8B949E", accent: "#F97316" };

// What actually qualified each collection — stated, not implied.
const WHY = {
  "date-night": "Upscale, top-rated, made for the occasion.",
  "locals-love": "Hundreds of nearby reviewers agree.",
  "worth-the-drive": "A little farther, worth the trip.",
  "youd-miss": "Excellent, and still flying under the radar.",
  "dinner-tonight": "Solid, well-reviewed, close enough for tonight.",
};

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
    priceLevel: p.priceLevel ?? p.price_level ?? null,
    lat: p.lat ?? (p.location && p.location.latitude) ?? null,
    lng: p.lng ?? (p.location && p.location.longitude) ?? null,
    types: Array.isArray(p.types) ? p.types : [],
    openNow: p.openNow ?? null,
    photo: p.photo || null,
  })).filter((p) => p.place_id && p.name);
}

function FoodCard({ p }) {
  const facts = [];
  if (typeof p.rating === "number") facts.push(`${p.rating.toFixed(1)}★`);
  if (typeof p.reviewCount === "number" && p.reviewCount > 0) facts.push(`${p.reviewCount.toLocaleString()} reviews`);
  if (p.distanceMi != null) facts.push(`${Math.round(p.distanceMi * 10) / 10} mi`);
  return (
    <article style={{ flex: "0 0 172px", scrollSnapAlign: "start", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ position: "relative", height: 108, background: p.photo ? "#0B0F14" : "linear-gradient(140deg,#241D18,#0D1117 76%)" }}>
        {p.photo ? <img src={p.photo} alt="" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
        {/* priceLevel renders as real $ glyphs ONLY when Google supplied it */}
        {p.priceLevel != null ? <span style={{ position: "absolute", top: 8, right: 8, padding: "2px 7px", borderRadius: 999, background: "rgba(0,0,0,.65)", color: "#E8EAF2", fontSize: 10.5, fontWeight: 800 }}>{"$".repeat(Math.max(1, Math.min(4, p.priceLevel)))}</span> : null}
      </div>
      <div style={{ padding: "9px 10px" }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, lineHeight: 1.3, color: C.text }}>{p.name}</h4>
        {facts.length ? <div style={{ marginTop: 3, fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>{facts.join(" · ")}</div> : null}
        {p.openNow === true ? <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: "#4ADE80" }}>Open now</div> : null}
      </div>
    </article>
  );
}

export default function FoodScreen() {
  const { center, label, state } = useCenter();
  const [places, setPlaces] = useState(null);

  useEffect(() => {
    if (!center) return;
    let off = false;
    (async () => {
      try {
        const r = await fetch("/api/places/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: "restaurants dinner", lat: center.lat, lng: center.lng, radius: 50000, n: 20 }) });
        const d = r.ok ? await r.json() : null;
        if (!off) setPlaces(normalize(d && (d.places || d.results) ? (d.places || d.results) : []));
      } catch (e) { if (!off) setPlaces([]); }
    })();
    return () => { off = true; };
  }, [center]);

  // engagementMap intentionally omitted — see header note. Boost = 0.
  const collections = useMemo(() => (places ? buildFoodCollections(places, { center }) : null), [places, center]);

  const wrap = { maxWidth: 480, margin: "0 auto", padding: "18px 14px 28px", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", minHeight: "100vh" };
  const where = label ? label.split(",")[0] : "you";

  if (state === "denied" && !center) return <main style={wrap}><p style={{ fontSize: 13.5, color: C.muted }}>Wayfind needs a location to find where to eat near you.</p></main>;
  if (!collections) return <main style={wrap}><p style={{ fontSize: 13, color: C.muted }}>Sorting through what’s good near you…</p></main>;

  if (!collections.length) {
    return (
      <main style={wrap}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px" }}>Where to eat near {where}</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.55}}>
          Wayfind couldn’t find enough well-reviewed restaurants near {where} to build a collection worth showing. Try a wider search.
        </p>
      </main>
    );
  }

  const considered = (places || []).length;
  return (
    <main style={wrap}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.5)", color: C.accent, fontSize: 11.5, fontWeight: 800 }}>Curated by Wayfind AI</span>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(255,255,255,.06)", border: `1px solid ${C.border}`, color: C.muted, fontSize: 11.5, fontWeight: 800 }}>Chosen from {considered} spots near {where}</span>
      </div>
      <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 14px", lineHeight: 1.22 }}>Where to eat near {where}</h2>

      {collections.map((col) => (
        <section key={col.id} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: "0 0 2px" }}>{col.label}</h3>
          {WHY[col.id] ? <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>{WHY[col.id]}</p> : null}
          <div tabIndex={0} role="region" aria-label={col.label}
            style={{ display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 6, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {col.places.map((p) => <FoodCard key={p.place_id} p={p} />)}
          </div>
        </section>
      ))}

      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 6, opacity: .85 }}>
        Built from Google ratings, review counts, price level, distance and whether a place is open — each restaurant
        appears in one collection only. Wayfind has no reservation, wait-time or crowd data, so none is implied.
      </p>
    </main>
  );
}
