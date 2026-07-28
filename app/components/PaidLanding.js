"use client";
// app/components/PaidLanding.js — the paid-traffic landing experience.
//
// THE PROBLEM THIS SOLVES
// ----------------------
// 30 days of Google Ads traffic: 74 paid visitors landed, 37 saw results, 2
// searched, 1 opened a place, 0 saved, 0 signed up, 0 clicked an affiliate.
// Paid sessions averaged 74.8s against 577s for organic on the same content —
// so the content works, the ENTRY does not. The organic /things-to-do/orlando
// page opens with ~15 passive, unclickable ranked rows and puts its only call
// to action below all of them. A mobile visitor (83 of 89 clicks were mobile)
// sees a wall of text and leaves.
//
// So: one obvious action above the fold, four intents they can tap instead of
// typing, the map one tap away, and every card clickable into the real app.
// The SEO body still exists — it just lives BELOW the interactive part now, on
// the organic route, which this page does not touch.
//
// Every outbound tap preserves gclid / gbraid / wbraid / utm_* via
// decorateHref, so attribution survives the hop into the app.
import { useEffect, useState } from "react";
import { C } from "./kit";
import { track } from "../../lib/track";
import { captureAttribution, decorateHref } from "../../lib/attribution";

const CAT_OF = (types) => {
  const t = Array.isArray(types) ? types : [];
  if (t.some((x) => /museum|art_gallery/.test(x))) return "Museum";
  if (t.some((x) => /amusement_park|water_park/.test(x))) return "Theme park";
  if (t.some((x) => /zoo|aquarium/.test(x))) return "Zoo & aquarium";
  if (t.some((x) => /park|natural_feature/.test(x))) return "Outdoors";
  if (t.some((x) => /restaurant|cafe|bar/.test(x))) return "Food & drink";
  if (t.some((x) => /shopping_mall|store/.test(x))) return "Shopping";
  return "Attraction";
};

// The four intents a paid visitor actually arrives with. Each maps to a deep
// link the app genuinely supports today (?q=, ?go=) — no dead ends.
const FILTERS = [
  { key: "tonight", label: "Tonight", icon: "🌙", href: "/?go=events", why: "events_tonight" },
  { key: "free", label: "Free", icon: "🎟️", href: "/?q=" + encodeURIComponent("free things to do in Orlando"), why: "free" },
  { key: "family", label: "Family", icon: "👨‍👩‍👧", href: "/?q=" + encodeURIComponent("family friendly things to do in Orlando"), why: "family" },
  { key: "near", label: "Near me", icon: "📍", href: "/", why: "near_me" },
];

export default function PaidLanding({ city, places }) {
  // HYDRATION SAFETY — do not "simplify" this into a direct decorateHref call.
  //
  // decorateHref reads stored attribution from localStorage. The server has no
  // localStorage, so it always renders a BARE href. If the client decorated
  // during its first render, a RETURNING paid visitor (who already has stored
  // attribution) would produce different markup than the server did — a
  // hydration mismatch. React responds by tearing down and re-rendering, and
  // this codebase has already lost site-wide interactivity to exactly that
  // failure once (the 2026-07-25 style-tag quote trap, commit 3d95dd7).
  //
  // So attribution starts as null — server and first client render agree on a
  // bare href — and decoration only begins after the mount effect sets it.
  const [attr, setAttr] = useState(null);
  const list = Array.isArray(places) ? places : [];

  // Capture attribution before the visitor taps anything. GoogleTags does this
  // too; both are idempotent (first touch wins) and this one guarantees it has
  // happened even if the tag script is blocked by an ad blocker.
  useEffect(() => {
    let a = {};
    try { a = captureAttribution(window.location.search) || {}; } catch (e) { a = {}; }
    setAttr(a);
  }, []);

  // Post-mount only. Before mount this is the identity function, which is what
  // keeps the server and client markup identical.
  const dh = (href) => {
    if (!attr) return href;
    try { return decorateHref(href, attr); } catch (e) { return href; }
  };
  const ready = attr !== null;

  // Seed the app's persisted center so "Explore Orlando" opens ON Orlando.
  // The app resolves location as wf_center -> URL -> geolocation -> default
  // (see CLAUDE.md); writing wf_center is the supported way to hand it a city.
  function seedCity() {
    try {
      if (!city || !isFinite(city.lat) || !isFinite(city.lng)) return;
      localStorage.setItem("wf_center", JSON.stringify({ lat: city.lat, lng: city.lng, loc: city.name + ", " + city.state }));
    } catch (e) {}
  }

  // One handler for every internal navigation out of this page: seed the city,
  // fire exactly one tracked event, then let the browser follow the (already
  // attribution-decorated) href. No preventDefault — a tracking call must never
  // be the thing standing between a user and the page they asked for.
  function go(event, params) {
    seedCity();
    try { track(event, params); } catch (e) {}
  }

  const cityLabel = city ? city.name : "Orlando";

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100dvh", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "18px 16px 40px" }}>

        {/* ── above the fold ─────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: "-0.4px", color: C.text }}>wayfind</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 999, padding: "2px 8px" }}>{cityLabel}</span>
        </div>

        <h1 style={{ fontSize: 29, lineHeight: 1.15, fontWeight: 900, margin: "0 0 10px", letterSpacing: "-0.6px" }}>
          Find something worth doing in {cityLabel} — right now.
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.5, color: C.light, margin: "0 0 16px" }}>
          Real guest reviews, ranked on merit. No ads, no paid placement, no sponsored spots —
          just what&apos;s actually good near you today.
        </p>

        <a
          href={dh("/")}
          onClick={() => go("cta_open_app", { surface: "paid_landing", city: cityLabel })}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: C.accent, color: "#0D1117", fontWeight: 900, fontSize: 17,
            padding: "16px 20px", borderRadius: 14, textDecoration: "none",
            boxShadow: "0 8px 24px rgba(249,115,22,.28)", minHeight: 54,
          }}
        >
          Explore {cityLabel} →
        </a>

        {/* Quick intents — tapping beats typing on a phone. */}
        <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "14px 0 2px", WebkitOverflowScrolling: "touch" }}>
          {FILTERS.map((f) => (
            <a
              key={f.key}
              href={dh(f.href)}
              onClick={() => go("intent_chip", { surface: "paid_landing", kind: f.why, city: cityLabel })}
              style={{
                flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6,
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 999,
                padding: "10px 15px", color: C.text, textDecoration: "none",
                fontSize: 14, fontWeight: 700, minHeight: 44,
              }}
            >
              <span aria-hidden="true">{f.icon}</span>{f.label}
            </a>
          ))}
          <a
            href={dh("/?go=map")}
            onClick={() => go("maps_list", { surface: "paid_landing", city: cityLabel })}
            style={{
              flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 6,
              background: C.adim, border: `1px solid ${C.blue}`, borderRadius: 999,
              padding: "10px 15px", color: C.blue, textDecoration: "none",
              fontSize: 14, fontWeight: 800, minHeight: 44,
            }}
          >
            <span aria-hidden="true">🗺️</span>Map
          </a>
        </div>

        {/* ── the picks: clickable, with enough to decide on ──────────── */}
        {list.length > 0 ? (
          <>
            <h2 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".6px", color: C.muted, margin: "22px 0 10px" }}>
              Top rated in {cityLabel} right now
            </h2>
            <div style={{ display: "grid", gap: 10 }}>
              {list.map((p, i) => (
                <a
                  key={p.id || i}
                  href={dh("/?place=" + encodeURIComponent(p.id))}
                  onClick={() => go("detail_open", {
                    place_id: p.id, place_name: p.name, surface: "paid_landing",
                    position: i + 1, city: cityLabel, category: CAT_OF(p.types),
                  })}
                  style={{
                    display: "flex", gap: 12, alignItems: "stretch",
                    background: C.card, border: `1px solid ${C.border}`, borderRadius: 14,
                    overflow: "hidden", textDecoration: "none", color: C.text,
                  }}
                >
                  {p.photoRef ? (
                    <img
                      src={"/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=320"}
                      alt=""
                      loading={i < 2 ? "eager" : "lazy"}
                      style={{ width: 104, minHeight: 104, objectFit: "cover", display: "block", flex: "0 0 104px", background: C.panel }}
                    />
                  ) : (
                    <div aria-hidden="true" style={{ width: 104, flex: "0 0 104px", background: "linear-gradient(135deg,#1b2735,#2c3e50)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>🎡</div>
                  )}
                  <div style={{ padding: "10px 12px 10px 0", flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.25, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {p.name}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: C.light }}>
                      {p.rating != null ? (
                        <span style={{ fontWeight: 800, color: C.gold }}>
                          {p.rating}★{p.reviews ? <span style={{ color: C.muted, fontWeight: 600 }}> ({p.reviews.toLocaleString()})</span> : null}
                        </span>
                      ) : null}
                      {p.openNow === true ? <span style={{ color: C.green, fontWeight: 700 }}>Open now</span> : null}
                      {p.openNow === false ? <span style={{ color: C.muted, fontWeight: 700 }}>Closed</span> : null}
                      {p.distMi != null ? <span style={{ color: C.muted }}>{p.distMi.toFixed(1)} mi</span> : null}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>{CAT_OF(p.types)}</div>
                  </div>
                  <div aria-hidden="true" style={{ alignSelf: "center", padding: "0 12px", color: C.muted, fontSize: 18 }}>›</div>
                </a>
              ))}
            </div>

            <a
              href={dh("/")}
              onClick={() => go("cta_open_app", { surface: "paid_landing_bottom", city: cityLabel })}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                marginTop: 16, background: "transparent", border: `1px solid ${C.accent}`,
                color: C.accent, fontWeight: 800, fontSize: 15.5, padding: "14px 20px",
                borderRadius: 14, textDecoration: "none", minHeight: 50,
              }}
            >
              See everything near you in {cityLabel} →
            </a>
          </>
        ) : (
          <p style={{ fontSize: 15, color: C.light, marginTop: 22 }}>
            Live picks are loading — <a href={dh("/")} onClick={() => go("cta_open_app", { surface: "paid_landing_empty" })} style={{ color: C.accent, fontWeight: 700 }}>open Wayfind</a> for the current list near you.
          </p>
        )}

        {/* Trust, stated plainly and only once. */}
        <div style={{ marginTop: 22, padding: "12px 14px", background: C.panel, borderRadius: 12, fontSize: 12.5, color: C.muted, lineHeight: 1.55 }}>
          Rankings come from real guest ratings and review volume, recomputed daily.
          Wayfind never sells placement — nobody can pay to rank higher on this list.
        </div>

        <noscript>
          <p style={{ fontSize: 14, color: C.light, marginTop: 16 }}>
            <a href="/" style={{ color: C.accent }}>Open Wayfind</a> to browse {cityLabel}.
          </p>
        </noscript>
        {/* `ready` only gates nothing visual — it exists so the attribution
            effect is observable in tests without exposing internals. */}
        <span data-wf-paid-ready={ready ? "1" : "0"} style={{ display: "none" }} />
      </div>
    </div>
  );
}
