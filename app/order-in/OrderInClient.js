"use client";
// app/order-in/page.js — v6.37 ORDER IN. The delivery answer to "what should
// we eat tonight?", and the home of the Uber Eats partnership.
//
// Why this page exists as its own route (not a curated hookDetail list):
//   • It is a real, shareable URL (the v5.78 tab-deep-link principle).
//   • Its cards carry an outbound "Order on Uber Eats" CTA — a different
//     interaction contract from every in-app list card.
//   • home.js stays untouched except the one-line kind:"delivery" redirect
//     (the perf decomposition owns that file).
//
// Editorial position (the honest pitch, also rendered on-page): Uber Eats
// ranks by who pays for placement; Wayfind ranks by the Score — rating, buzz,
// value, distance. We pick the restaurant, Uber Eats does the driving.
// Deals the owner has verified (lib/coupons) float to the top — "best deal
// first" without inventing discounts we can't substantiate.
//
// Affiliate: links route through Aff.uberEatsUrl — plain deep links today,
// tracked the moment NEXT_PUBLIC_UBEREATS_TEMPLATE is set (see lib/affiliates).
import { useEffect, useMemo, useState } from "react";
import { C } from "../components/kit";
import * as Aff from "../../lib/affiliates";
import { couponForPlaceName, couponIsLive } from "../../lib/coupons";

const DEFAULT_CENTER = { lat: 28.5384, lng: -81.3789, loc: "Orlando, FL" };
const QUERY = "best delivery and takeout restaurants";

function photoSrc(p) {
  try {
    const ref = p.photos && p.photos[0] && p.photos[0].name;
    return ref ? "/api/photo?ref=" + encodeURIComponent(ref) + "&w=240" : null;
  } catch { return null; }
}
function nameOf(p) { return (p.displayName && p.displayName.text) || p.name || ""; }
function ratingOf(p) { return typeof p.rating === "number" ? p.rating : null; }
function reviewsOf(p) { return p.userRatingCount || p.reviews || 0; }
// Deals first (verified coupons only), then a rating×buzz rank — the same
// spirit as the Score: quality places with real review volume outrank
// 5.0-with-3-reviews noise.
function rank(a, b) {
  const da = a._deal ? 1 : 0, db = b._deal ? 1 : 0;
  if (da !== db) return db - da;
  const sa = (ratingOf(a) || 0) * Math.log10(reviewsOf(a) + 1);
  const sb = (ratingOf(b) || 0) * Math.log10(reviewsOf(b) + 1);
  return sb - sa;
}

export default function OrderInClient() {
  const [center, setCenter] = useState(null);
  const [places, setPlaces] = useState(null); // null = loading, [] = empty
  const [err, setErr] = useState(null);

  // Location: URL params (handed off by the home tile) → geolocation → default.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const lat = parseFloat(u.searchParams.get("lat")), lng = parseFloat(u.searchParams.get("lng"));
      const loc = u.searchParams.get("loc") || "";
      if (isFinite(lat) && isFinite(lng)) { setCenter({ lat, lng, loc }); return; }
    } catch {}
    let done = false;
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => { if (!done) { done = true; setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude, loc: "" }); } },
        () => { if (!done) { done = true; setCenter(DEFAULT_CENTER); } },
        { timeout: 6000, maximumAge: 300000 }
      );
      setTimeout(() => { if (!done) { done = true; setCenter(DEFAULT_CENTER); } }, 7000);
    } catch { setCenter(DEFAULT_CENTER); }
  }, []);

  useEffect(() => {
    if (!center) return;
    let dead = false;
    (async () => {
      try {
        const r = await fetch(`/api/places/search?q=${encodeURIComponent(QUERY)}&lat=${center.lat.toFixed(4)}&lng=${center.lng.toFixed(4)}&radius=24000&n=20&cat=food`);
        const j = await r.json();
        if (dead) return;
        const raw = Array.isArray(j.places) ? j.places : [];
        const rows = raw.map((p) => {
          const cpn = couponForPlaceName(nameOf(p));
          return { ...p, _deal: cpn && couponIsLive(cpn) ? cpn : null };
        }).sort(rank);
        setPlaces(rows);
        if (!raw.length && j.error) setErr(String(j.error));
      } catch (e) { if (!dead) { setPlaces([]); setErr("network"); } }
    })();
    return () => { dead = true; };
  }, [center]);

  const city = center && center.loc ? center.loc.split(",")[0] : "";
  const top = useMemo(() => (places || []).slice(0, 15), [places]);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "18px 16px 60px" }}>
        <a href="/" style={{ color: C.muted, textDecoration: "none", fontSize: 13, fontWeight: 700 }}>← Wayfind</a>

        {/* Hero */}
        <div style={{ marginTop: 14, background: `linear-gradient(135deg, ${C.card}, rgba(255,140,50,.12))`, border: `1px solid ${C.border}`, borderRadius: 18, padding: "22px 18px" }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: "-0.5px" }}>Order In 🥡</h1>
          <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.5, color: C.muted }}>
            Tonight's best food{city ? " in " + city : " near you"}, delivered.
            Ranked by the <b style={{ color: C.text }}>Wayfind Score</b> — not by who paid for placement.
            Verified deals float to the top.
          </p>
        </div>

        {/* Why order through Wayfind */}
        <div style={{ marginTop: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 15px" }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase", marginBottom: 5 }}>Why start here, not in the app?</div>
          <div style={{ fontSize: 13, lineHeight: 1.55, color: C.muted }}>
            Delivery apps rank by ad spend. The Wayfind Score ranks by what matters — rating, local buzz,
            value, and distance — so you pick the restaurant on merit, then Uber Eats handles the driving.
          </div>
        </div>

        {/* List */}
        <div style={{ marginTop: 18 }}>
          {places === null && (
            <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>Finding delivery-worthy spots…</div>
          )}
          {places !== null && !top.length && (
            <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>
              {err ? "The kitchen is briefly slammed — pull to refresh in a moment." : "No delivery picks here yet — try the Food tab for dine-in."}
            </div>
          )}
          {top.map((p, i) => {
            const nm = nameOf(p);
            const img = photoSrc(p);
            const rt = ratingOf(p), rv = reviewsOf(p);
            const ue = Aff.uberEatsUrl(nm, city);
            return (
              <div key={p.id || i} style={{ display: "flex", gap: 12, alignItems: "center", background: C.card, border: `1px solid ${p._deal ? C.accent : C.border}`, borderRadius: 16, padding: 12, marginBottom: 10 }}>
                {img
                  ? <img src={img} alt={nm} style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
                  : <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 12, background: C.adim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🍽️</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i + 1}. {nm}</div>
                  <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                    {rt != null && <span style={{ color: C.gold, fontWeight: 800 }}>★ {rt.toFixed(1)}</span>}
                    {rv ? <span> ({Number(rv).toLocaleString()})</span> : null}
                  </div>
                  {p._deal && <div style={{ marginTop: 5, display: "inline-block", fontSize: 10.5, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 7, padding: "3px 7px" }}>🏷️ {p._deal.title}</div>}
                </div>
                {ue && (
                  <a
                    href={ue} target="_blank" rel="noreferrer" aria-label={"Order " + nm + " on Uber Eats"}
                    style={{ flexShrink: 0, background: "#06C167", color: "#0D1117", borderRadius: 12, padding: "11px 13px", fontSize: 12.5, fontWeight: 900, textDecoration: "none", textAlign: "center", lineHeight: 1.2 }}
                  >Order on<br />Uber Eats ↗</a>
                )}
              </div>
            );
          })}
        </div>

        {/* Get the app */}
        <div style={{ marginTop: 20, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "15px" }}>
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

        <div style={{ fontSize: 10.5, color: C.muted, margin: "14px 2px 0", textAlign: "center" }}>Wayfind may earn a commission from partner links</div>
      </div>
    </div>
  );
}
