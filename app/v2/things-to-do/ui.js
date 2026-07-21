"use client";
// Things To Do (§4) — 3–5 curated collections, curiosity labels only.
//
// EVERY COLLECTION LABEL IS A CLAIM, AND EACH ONE IS BACKED:
//   "Hidden Gems You'll Love"           high Google rating + LOW review count
//   "Places Locals Actually Recommend"  high rating + >=500 Google reviews
//   "Worth The Drive"                   12–45mi away + high rating
//   "Perfect For Today"                 open right now + good rating
//   "Worth Leaving The House For"       high rating (the catch-all)
// Those are real Google fields, so the per-collection reasoning line can say
// exactly what qualified a place instead of gesturing at "curation".
//
// NOTE ON "LOCALS": that label is backed by GOOGLE review volume (hundreds of
// reviewers), NOT by Wayfind's own likes/saves — measured 2026-07-21 those are
// 73 likes + 42 saves from SEVEN devices across 66 places, which cannot support
// a claim about what locals think. The engagement boost is left unwired; it
// degrades to 0 and the ranking is unaffected.
import { useEffect, useMemo, useState } from "react";
import { buildCollections } from "../../../lib/thingsToDo.js";

const C = { bg: "#0D1117", card: "#161B22", border: "#1F2937", text: "#F1F5F9", muted: "#8B949E", accent: "#F97316" };

// What actually qualified each collection — named, not implied.
const WHY = {
  "hidden-gems": "High ratings, still under the radar.",
  "locals-recommend": "Loved by hundreds of nearby reviewers.",
  "worth-the-drive": "A little farther, worth every mile.",
  "perfect-today": "Open right now, and rated for it.",
  "worth-leaving": "Rated high enough to be worth the trip out.",
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
    lat: p.lat ?? (p.location && p.location.latitude) ?? null,
    lng: p.lng ?? (p.location && p.location.longitude) ?? null,
    types: Array.isArray(p.types) ? p.types : [],
    openNow: p.openNow ?? null,
    photo: p.photo || null,
  })).filter((p) => p.place_id && p.name);
}

function PlaceCard({ p }) {
  const facts = [];
  if (typeof p.rating === "number") facts.push(`${p.rating.toFixed(1)}★`);
  if (typeof p.reviewCount === "number" && p.reviewCount > 0) facts.push(`${p.reviewCount.toLocaleString()} reviews`);
  if (p.distanceMi != null) facts.push(`${Math.round(p.distanceMi * 10) / 10} mi`);
  return (
    <article style={{ flex: "0 0 168px", scrollSnapAlign: "start", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ position: "relative", height: 104, background: p.photo ? "#0B0F14" : "linear-gradient(140deg,#1D2430,#0D1117 75%)" }}>
        {p.photo ? <img src={p.photo} alt="" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      </div>
      <div style={{ padding: "9px 10px" }}>
        <h4 style={{ margin: 0, fontSize: 13, fontWeight: 800, lineHeight: 1.3, color: C.text }}>{p.name}</h4>
        {/* only what exists — a place with no reviewCount simply shows fewer facts */}
        {facts.length ? <div style={{ marginTop: 3, fontSize: 11.5, color: C.muted, lineHeight: 1.4 }}>{facts.join(" · ")}</div> : null}
        {p.openNow === true ? <div style={{ marginTop: 3, fontSize: 11, fontWeight: 800, color: "#4ADE80" }}>Open now</div> : null}
      </div>
    </article>
  );
}

export default function ThingsToDoScreen() {
  const { center, label, state } = useCenter();
  const [places, setPlaces] = useState(null);

  useEffect(() => {
    if (!center) return;
    let off = false;
    (async () => {
      try {
        const r = await fetch("/api/places/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: "things to do attractions", lat: center.lat, lng: center.lng, radius: 50000, n: 20 }) });
        const d = r.ok ? await r.json() : null;
        if (!off) setPlaces(normalize(d && (d.places || d.results) ? (d.places || d.results) : []));
      } catch (e) { if (!off) setPlaces([]); }
    })();
    return () => { off = true; };
  }, [center]);

  // engagementMap intentionally omitted — see the header note. Boost = 0.
  const collections = useMemo(() => (places ? buildCollections(places, { center }) : null), [places, center]);

  const wrap = { maxWidth: 480, margin: "0 auto", padding: "18px 14px 28px", background: C.bg, color: C.text, fontFamily: "system-ui, sans-serif", minHeight: "100vh" };
  const where = label ? label.split(",")[0] : "you";

  if (state === "denied" && !center) return <main style={wrap}><p style={{ fontSize: 13.5, color: C.muted }}>Wayfind needs a location to find things to do near you.</p></main>;
  if (!collections) return <main style={wrap}><p style={{ fontSize: 13, color: C.muted }}>Sorting through what’s near you…</p></main>;

  // Honest empty state: too few rated places to form a real collection.
  if (!collections.length) {
    return (
      <main style={wrap}>
        <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 6px" }}>Things to do near {where}</h2>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.55 }}>
          Wayfind couldn’t find enough well-reviewed places near {where} to build a collection worth showing. Try a wider search.
        </p>
      </main>
    );
  }

  const considered = (places || []).length;
  return (
    <main style={wrap}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(249,115,22,.12)", border: "1px solid rgba(249,115,22,.5)", color: C.accent, fontSize: 11.5, fontWeight: 800 }}>Curated by Wayfind AI</span>
        <span style={{ display: "inline-flex", padding: "5px 11px", borderRadius: 999, background: "rgba(255,255,255,.06)", border: `1px solid ${C.border}`, color: C.muted, fontSize: 11.5, fontWeight: 800 }}>Chosen from {considered} places near {where}</span>
      </div>
      <h2 style={{ fontSize: 21, fontWeight: 800, margin: "0 0 14px", lineHeight: 1.22 }}>Worth your time near {where}</h2>

      {collections.map((col) => (
        <section key={col.id} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: "0 0 2px" }}>{col.label}</h3>
          {/* the reasoning names the REAL signal that qualified this collection */}
          {WHY[col.id] ? <p style={{ fontSize: 12, color: C.muted, margin: "0 0 8px" }}>{WHY[col.id]}</p> : null}
          <div tabIndex={0} role="region" aria-label={col.label}
            style={{ display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: 6, WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
            {col.places.map((p) => <PlaceCard key={p.place_id} p={p} />)}
          </div>
        </section>
      ))}

      <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.5, marginTop: 6, opacity: .85 }}>
        Collections are built from Google ratings, review counts, distance and whether a place is open — each place appears
        in one collection only. Wayfind has no trending or crowd data, so none is implied here.
      </p>
    </main>
  );
}
