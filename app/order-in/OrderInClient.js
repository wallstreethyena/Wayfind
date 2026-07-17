"use client";
// app/order-in/OrderInClient.js — v6.42 ORDER IN v3: cuisine rails + the
// owner's guaranteed inventory + Wayfind Featured locals + per-card Uber Eats
// verification. Same engine (lib/sources.searchPlaces), same Score, same card
// anatomy as the rest of the app.
//
// Owner directives implemented here (locked by scripts/test-orderin-rails.mjs):
//  • 11 fixed cuisine rails, in the owner's exact order (lib/orderInRails).
//  • Every owner-curated "most popular on Uber Eats" brand is GUARANTEED a
//    card in its metro: any brand missing from the organic pool is resolved
//    via findPlace (cached) so the card always exists.
//  • Curated LOCALS carry the "★ Wayfind Featured" badge and rank first;
//    national chains get plain utility cards, ranked last, never badged.
//  • CTA honesty: cards verified against Uber Eats (POST /api/eats/check,
//    30-day cache) say "Order on Uber Eats"; unverified say "Find on Uber
//    Eats". EVERY click routes /api/eats/go (exact store 302, tracked search
//    fallback) — the click is attributed either way.
import { useEffect, useMemo, useState } from "react";
import { C, PlaceScoreChip, stars } from "../components/kit";
import { searchPlaces } from "../../lib/sources";
import { findPlace, wayfindScore } from "../../lib/google";
import { couponForPlaceName, couponIsLive } from "../../lib/coupons";
import { buildCuisineRails } from "../../lib/orderInRails";
import { nearestMetro, METROS, missingGuaranteed, tagFeatured } from "../../lib/orderInFeatured";

const DEFAULT_CENTER = { lat: 28.5384, lng: -81.3789, loc: "Orlando, FL" };

function eatsGoHref(p, city) {
  const q = new URLSearchParams({ name: p.name || "", city: city || "" });
  if (p.lat != null) q.set("lat", String(p.lat));
  if (p.lng != null) q.set("lng", String(p.lng));
  return "/api/eats/go?" + q.toString();
}

export default function OrderInClient() {
  const [center, setCenter] = useState(null);
  const [places, setPlaces] = useState(null); // null = loading
  const [err, setErr] = useState(false);
  const [eatsOk, setEatsOk] = useState({}); // id -> true|false (verified on Uber Eats)

  // Location: URL params (handed off by the home tile) → geolocation → default.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const lat = parseFloat(u.searchParams.get("lat")), lng = parseFloat(u.searchParams.get("lng"));
      const loc = u.searchParams.get("loc") || "";
      if (isFinite(lat) && isFinite(lng)) { setCenter({ lat, lng, loc }); return; }
    } catch (e) {}
    let done = false;
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => { if (!done) { done = true; setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude, loc: "" }); } },
        () => { if (!done) { done = true; setCenter(DEFAULT_CENTER); } },
        { timeout: 6000, maximumAge: 300000 }
      );
      setTimeout(() => { if (!done) { done = true; setCenter(DEFAULT_CENTER); } }, 7000);
    } catch (e) { setCenter(DEFAULT_CENTER); }
  }, []);

  const metroKey = center ? nearestMetro(center.lat, center.lng) : null;
  const metroCity = metroKey ? METROS[metroKey].label : (center && center.loc ? center.loc.split(",")[0] : "");

  // The pool: the app's real pipeline (scored, gated, deduped) + the owner's
  // guaranteed brands resolved in (cached ~8 days by findPlace), then tagged
  // (featured/chain) and deal-flagged.
  useEffect(() => {
    if (!center) return;
    let dead = false;
    (async () => {
      try {
        const list = (await searchPlaces("food", "all", { lat: center.lat, lng: center.lng }, 24000, "all", "delivery takeout")) || [];
        let merged = list.slice();
        if (metroKey) {
          const missing = missingGuaranteed(merged, metroKey).slice(0, 20);
          const resolved = await Promise.all(missing.map(async (g) => {
            try {
              const f = await findPlace(g.name + " " + METROS[metroKey].label, { lat: center.lat, lng: center.lng });
              if (!f || !f.name) return null;
              return {
                id: f.id || "gp:" + g.name, name: f.name, lat: f.lat, lng: f.lng,
                photo: f.photo || null, rating: f.rating != null ? f.rating : null,
                reviews: f.reviews || f.userRatingCount || 0, types: f.types || [],
                wfScore: f.wfScore != null ? f.wfScore : (f.rating != null ? wayfindScore(Number(f.rating), Number(f.reviews || f.userRatingCount || 0)) : null),
                _wfGuaranteed: true,
              };
            } catch (e) { return null; }
          }));
          const seen = new Set(merged.map((p) => p && p.id));
          for (const r of resolved) if (r && r.name && !seen.has(r.id)) { seen.add(r.id); merged.push(r); }
        }
        if (dead) return;
        const rows = merged.filter((p) => p && p.id && p.name).map((p) => {
          const cpn = couponForPlaceName(p.name);
          const row = cpn && couponIsLive(cpn) ? { ...p, _deal: cpn } : { ...p };
          return tagFeatured(row, metroKey);
        });
        setPlaces(rows);
      } catch (e) { if (!dead) { setPlaces([]); setErr(true); } }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, metroKey]);

  const rails = useMemo(() => buildCuisineRails(places || []), [places]);
  const featuredStrip = useMemo(() => (places || []).filter((p) => p._wfFeatured).sort((a, b) => ((b._wfHeroFirst ? 1 : 0) - (a._wfHeroFirst ? 1 : 0)) || ((b.wfScore || 0) - (a.wfScore || 0))).slice(0, 12), [places]);

  // Verify the cards that promise Uber Eats (guaranteed + rail leads; ≤24).
  useEffect(() => {
    if (!places || !places.length) return;
    let dead = false;
    const heads = [];
    const seen = new Set();
    const push = (p) => { if (p && p.id && !seen.has(p.id) && heads.length < 24) { seen.add(p.id); heads.push(p); } };
    featuredStrip.forEach(push);
    (places || []).filter((p) => p._wfGuaranteed).forEach(push);
    rails.forEach((r) => r.places.slice(0, 2).forEach(push));
    if (!heads.length) return;
    (async () => {
      try {
        const r = await fetch("/api/eats/check", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ places: heads.map((p) => ({ id: p.id, name: p.name, city: metroCity, lat: p.lat, lng: p.lng })) }),
        });
        const d = await r.json();
        if (!dead && d && d.results) {
          const m = {};
          for (const k of Object.keys(d.results)) m[k] = !!d.results[k].ok;
          setEatsOk((prev) => ({ ...prev, ...m }));
        }
      } catch (e) {}
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places]);

  const city = metroCity;

  const Card = ({ p }) => (
    <div style={{ flex: "0 0 172px", background: C.card, border: `1px solid ${p._wfFeatured ? C.accent : p._deal ? C.accent : C.border}`, borderRadius: 14, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ position: "relative" }}>
        {p.photo
          ? <img src={p.photo} alt={p.name} loading="lazy" style={{ width: "100%", height: 88, objectFit: "cover", display: "block" }} />
          : <div aria-hidden="true" style={{ width: "100%", height: 88, background: C.adim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🍽️</div>}
        {p._wfFeatured && <div style={{ position: "absolute", top: 6, left: 6, fontSize: 9, fontWeight: 900, letterSpacing: ".5px", color: "#0D1117", background: C.accent, borderRadius: 6, padding: "3px 6px", textTransform: "uppercase" }}>★ Wayfind Featured</div>}
      </div>
      <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 31, flex: 1 }}>{p.name}</span>
          <PlaceScoreChip p={p} size={10} />
        </div>
        <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3 }}>
          {p.rating != null && <span style={{ color: C.gold, fontWeight: 800 }}>{stars(p.rating)} {Number(p.rating).toFixed(1)}</span>}
          {p.reviews ? <span> ({Number(p.reviews).toLocaleString()})</span> : null}
        </div>
        {p._deal && <div style={{ marginTop: 4, fontSize: 9.5, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 6, padding: "2px 6px", alignSelf: "flex-start" }}>🏷️ {p._deal.title}</div>}
        <a
          href={eatsGoHref(p, city)} target="_blank" rel="noreferrer" aria-label={"Order " + p.name + " on Uber Eats"}
          style={{ marginTop: "auto", paddingTop: 8 }}
        >
          <span style={{ display: "block", background: eatsOk[p.id] === false ? "transparent" : "#06C167", border: eatsOk[p.id] === false ? `1.5px solid ${C.border}` : "1.5px solid #06C167", color: eatsOk[p.id] === false ? C.light : "#0D1117", borderRadius: 10, padding: "8px 0", fontSize: 11, fontWeight: 900, textAlign: "center" }}>
            {eatsOk[p.id] === false ? "Find on Uber Eats ↗" : "Order on Uber Eats ↗"}
          </span>
        </a>
      </div>
    </div>
  );

  const Rail = ({ title, emoji, items }) => (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: "-0.2px" }}>{emoji} {title}</span>
        <span style={{ fontSize: 9.5, color: C.muted }}>Powered by Uber Eats</span>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        {items.map((p) => <Card key={p.id} p={p} />)}
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 16px 60px" }}>
        <a href="/" style={{ color: C.muted, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>← Wayfind</a>

        {/* Hero */}
        <div style={{ marginTop: 14, background: `linear-gradient(135deg, ${C.card}, rgba(255,140,50,.12))`, border: `1px solid ${C.border}`, borderRadius: 18, padding: "22px 18px" }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px" }}>Order In 🥡</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.5, color: C.muted }}>
            Tonight's best food{city ? " in " + city : " near you"}, delivered — browse by craving.
            Ranked by the <b style={{ color: C.text }}>Wayfind Score</b> — not by who paid for placement.
          </p>
          <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(6,193,103,.12)", border: "1px solid rgba(6,193,103,.45)", borderRadius: 999, padding: "5px 12px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#06C167", display: "inline-block" }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: "#06C167", letterSpacing: ".3px" }}>Powered by Uber Eats</span>
          </div>
        </div>

        {/* Why order through Wayfind */}
        <div style={{ marginTop: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 15px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 5 }}>Why start here, not in the app?</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: C.muted }}>
            Delivery apps rank by ad spend. The Wayfind Score ranks by what matters — rating, local buzz,
            value, and distance — so you pick the restaurant on merit, then Uber Eats handles the driving.
          </div>
        </div>

        {places === null && (
          <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>Finding delivery-worthy spots…</div>
        )}
        {places !== null && !rails.length && (
          <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>
            {err ? "The kitchen is briefly slammed — try again in a moment." : "No delivery picks here yet — try the Food tab for dine-in."}
          </div>
        )}

        {/* Wayfind Featured — the owner's local heroes, first */}
        {featuredStrip.length > 0 && <Rail title="Wayfind Featured" emoji="⭐" items={featuredStrip} />}

        {/* The 11 cuisine rails, fixed owner order, then More restaurants */}
        {rails.map((r) => <Rail key={r.key} title={r.label} emoji={r.emoji} items={r.places} />)}

        {/* Get the app */}
        <div style={{ marginTop: 22, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px" }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>New to Uber Eats?</div>
          <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "5px 0 10px" }}>
            It's the delivery app that brings these kitchens to your door — download it once, then order any
            Wayfind pick in two taps.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href="https://apps.apple.com/us/app/uber-eats-food-delivery/id1058959277" target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 0", color: C.text, fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}> App Store</a>
            <a href="https://play.google.com/store/apps/details?id=com.ubercab.eats" target="_blank" rel="noreferrer" style={{ flex: 1, textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 0", color: C.text, fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>▶ Google Play</a>
          </div>
        </div>

        <div style={{ fontSize: 10.5, color: C.muted, margin: "14px 2px 0", textAlign: "center" }}>Wayfind may earn a commission from partner links. Featured picks are Wayfind's own editorial choices — never paid placement.</div>
      </div>
    </div>
  );
}
