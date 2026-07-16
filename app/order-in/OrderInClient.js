"use client";
// app/order-in/OrderInClient.js — v6.38 ORDER IN v2: same engine, same cards,
// same Score as everywhere else in the app (owner directive).
//
// v1 shipped with a bespoke fetch + rating×buzz sort. v2 uses the ONE
// mechanism: lib/sources.searchPlaces (Google+Foursquare twin-merge, junk
// gate, quality floor, real wfScore) and the app's card anatomy with
// PlaceScoreChip — so a restaurant scores identically here, on Eat Well, and
// on its detail sheet. Verified deals (lib/coupons) still float first within
// the ranked order. The CTA routes through /api/eats/go, which 302s into the
// restaurant's ACTUAL Uber Eats store page (Viator-go pattern) and falls back
// to a tracked search only when resolution fails.
import { useEffect, useMemo, useState } from "react";
import { C, PlaceScoreChip, stars } from "../components/kit";
import { searchPlaces } from "../../lib/sources";
import { couponForPlaceName, couponIsLive } from "../../lib/coupons";

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

  // The app's real pipeline: scored, gated, deduped — then deals float first
  // WITHIN that order (stable partition, never re-ranking quality).
  useEffect(() => {
    if (!center) return;
    let dead = false;
    (async () => {
      try {
        const list = await searchPlaces("food", "all", { lat: center.lat, lng: center.lng }, 24000, "all", "delivery takeout");
        if (dead) return;
        const rows = (list || []).map((p) => {
          const cpn = couponForPlaceName(p.name);
          return cpn && couponIsLive(cpn) ? { ...p, _deal: cpn } : p;
        });
        const deals = rows.filter((p) => p._deal), rest = rows.filter((p) => !p._deal);
        setPlaces([...deals, ...rest]);
      } catch (e) { if (!dead) { setPlaces([]); setErr(true); } }
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

        {/* List — the app's card anatomy: photo · rank+name · ScoreChip · stars · distance */}
        <div style={{ marginTop: 18 }}>
          {places === null && (
            <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>Finding delivery-worthy spots…</div>
          )}
          {places !== null && !top.length && (
            <div style={{ textAlign: "center", color: C.muted, padding: "40px 0", fontSize: 14 }}>
              {err ? "The kitchen is briefly slammed — try again in a moment." : "No delivery picks here yet — try the Food tab for dine-in."}
            </div>
          )}
          {top.map((p, i) => (
            <div key={p.id || i} style={{ display: "flex", gap: 12, alignItems: "center", background: C.card, border: `1px solid ${p._deal ? C.accent : C.border}`, borderRadius: 16, padding: 12, marginBottom: 10 }}>
              {p.photo
                ? <img src={p.photo} alt={p.name} loading="lazy" style={{ width: 64, height: 64, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />
                : <div aria-hidden="true" style={{ width: 64, height: 64, borderRadius: 12, background: C.adim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, flexShrink: 0 }}>🍽️</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i + 1}. {p.name}</span>
                  <PlaceScoreChip p={p} size={11} />
                </div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                  {p.rating != null && <span style={{ color: C.gold, fontWeight: 800 }}>{stars(p.rating)} {Number(p.rating).toFixed(1)}</span>}
                  {p.reviews ? <span> ({Number(p.reviews).toLocaleString()})</span> : null}
                  {p.distMi != null && <span> · {p.distMi.toFixed(1)} mi</span>}
                </div>
                {p._deal && <div style={{ marginTop: 5, display: "inline-block", fontSize: 10.5, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 7, padding: "3px 7px" }}>🏷️ {p._deal.title}</div>}
              </div>
              <a
                href={eatsGoHref(p, city)} target="_blank" rel="noreferrer" aria-label={"Order " + p.name + " on Uber Eats"}
                style={{ flexShrink: 0, background: "#06C167", color: "#0D1117", borderRadius: 12, padding: "11px 13px", fontSize: 12.5, fontWeight: 900, textDecoration: "none", textAlign: "center", lineHeight: 1.2 }}
              >Order on<br />Uber Eats ↗</a>
            </div>
          ))}
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
