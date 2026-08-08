"use client";
// app/components/ExploreBridge.js — the content-to-product handoff, under test.
//
// WHAT IT IS TESTING
// ------------------
// ~228 sessions/month arrive free from Google onto static guide and culture
// pages. Measured dwell there is 0-25s. Those pages already offer "Open
// Wayfind" — a floating pill at the BOTTOM, with a generic ask. At that dwell
// nobody scrolls to it, and the ask gives no reason to tap.
//
// Bounce alone is NOT the failure signal: someone can read a guide, get their
// answer, and leave satisfied. So the primary outcome is narrower and honest —
//
//     detail_open attributable to this entry page, within the same session
//
// This renders ONLY for the treatment arm. Control renders nothing at all, so
// the page stays exactly as it is today and the comparison is clean.
//
// HYDRATION / CLS
// ---------------
// The variant lives in localStorage, which the server cannot read, so this must
// render null on the server AND on the first client render or hydration
// mismatches (the 3d95dd7 failure class). The isomorphic layout effect below
// resolves the variant BEFORE the browser paints, which keeps the insertion
// from registering as a visible layout shift for most visitors. CLS is a listed
// guardrail on this experiment — measure it, don't assume it.
//
// EVENT DISCIPLINE
// ----------------
// Fires only EXISTING product event names through lib/track (one PostHog
// capture + one Google forward each). The experiment rides along as properties
// (experiment / variant / entry_page / page_type / city), so historical funnels
// stay comparable and no event is renamed or duplicated.
import { useEffect, useLayoutEffect, useState } from "react";
import { track } from "../../lib/track";
import { captureAttribution, decorateHref } from "../../lib/attribution";
import { recordExposure } from "../../lib/experiment";

// useLayoutEffect warns during SSR; useEffect never runs before paint. Pick per
// environment — the choice is stable for the lifetime of the process, so this
// does not violate the rules of hooks.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

const S = {
  wrap: { margin: "17px 0 24px", padding: "16px 19px", background: "#F6EFE5", borderTop: "3px solid #D66320", borderRadius: 4, boxShadow: "0 16px 42px rgba(0,0,0,.15)" },
  q: { fontFamily: "var(--wf-display)", fontSize: 22, fontWeight: 500, color: "#111B29", margin: 0, letterSpacing: "-0.35px" },
  chips: { display: "flex", gap: 7, overflowX: "auto", padding: "0 0 3px", WebkitOverflowScrolling: "touch" },
  chip: { flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", borderBottom: "1px solid #CFC4B6", padding: "7px 5px", color: "#263448", textDecoration: "none", fontSize: 12.5, fontWeight: 800, minHeight: 36 },
  pickHead: { fontSize: 10.5, fontWeight: 900, letterSpacing: "1.3px", textTransform: "uppercase", color: "#C85E1D", margin: "14px 0 7px" },
  card: { display: "flex", gap: 10, alignItems: "stretch", background: "rgba(255,255,255,.5)", border: "1px solid #DDD4C9", borderRadius: 13, overflow: "hidden", textDecoration: "none", color: "#111B29", marginBottom: 7 },
  body: { padding: "8px 10px 8px 0", flex: 1, minWidth: 0 },
  name: { fontSize: 14.5, fontWeight: 800, lineHeight: 1.25, marginBottom: 2, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" },
  meta: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", fontSize: 12, color: "#627086" },
  reason: { fontSize: 11.5, color: "#657287", marginTop: 3, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  all: { display: "inline-flex", alignItems: "center", justifyContent: "center", marginTop: 9, background: "#F67822", color: "#101720", fontWeight: 900, fontSize: 12.5, padding: "9px 15px", borderRadius: 999, textDecoration: "none", minHeight: 38 },
};

export default function ExploreBridge({ city, picks, entryPage, pageType }) {
  const [variant, setVariant] = useState(null);
  const [attr, setAttr] = useState(null);
  const list = Array.isArray(picks) ? picks.slice(0, 3) : [];
  const where = (city && city.name) || "";

  // Exposure is recorded BEFORE any interaction, and before paint.
  useIsoLayoutEffect(() => {
    let v = null;
    try {
      v = recordExposure({ entry_page: entryPage, page_type: pageType, city: where || null });
    } catch (e) { v = null; }
    setVariant(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let a = {};
    try { a = captureAttribution(window.location.search) || {}; } catch (e) { a = {}; }
    setAttr(a);
  }, []);

  // Bare href until attribution is read post-mount — see PaidLanding for why.
  const dh = (href) => { if (!attr) return href; try { return decorateHref(href, attr); } catch (e) { return href; } };

  // Carry the article's city into the app so the visitor does not land in a
  // generic feed centred somewhere else — losing city context was one of the
  // candidate explanations for the drop-off.
  function seedCity() {
    try {
      if (!city || !isFinite(city.lat) || !isFinite(city.lng)) return;
      localStorage.setItem("wf_center", JSON.stringify({ lat: city.lat, lng: city.lng, loc: city.name + (city.state ? ", " + city.state : "") }));
    } catch (e) {}
  }
  function go(event, params) {
    seedCity();
    try { track(event, Object.assign({ surface: "explore_bridge" }, params || {})); } catch (e) {}
  }

  if (variant !== "treatment") return null; // control + SSR render nothing

  const intents = [
    { k: "tonight", icon: "🌙", label: "Tonight", href: "/?go=events" },
    { k: "free", icon: "🎟️", label: "Free", href: "/?q=" + encodeURIComponent("free things to do" + (where ? " in " + where : "")) },
    { k: "family", icon: "👨‍👩‍👧", label: "Family", href: "/?q=" + encodeURIComponent("family friendly things to do" + (where ? " in " + where : "")) },
    { k: "near", icon: "📍", label: "Near me", href: "/" },
  ];

  return (
    <aside style={S.wrap} aria-label={"Find something to do" + (where ? " in " + where : "")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#C85E1D", fontSize: 9.5, fontWeight: 900, letterSpacing: "1.7px", textTransform: "uppercase", marginBottom: 4 }}>Choose your lens</div>
          <p style={S.q}>What are you looking for{where ? " in " + where : ""}?</p>
        </div>
        <div style={S.chips}>
          {intents.map((i) => (
            <a key={i.k} href={dh(i.href)} onClick={() => go("intent_chip", { kind: i.k, city: where || null })} style={S.chip}>
              <span aria-hidden="true">{i.icon}</span>{i.label}
            </a>
          ))}
        </div>
      </div>

      {list.length ? (
        <>
          <p style={S.pickHead}>Open now, top rated nearby</p>
          {list.map((p, i) => (
            <a
              key={p.id || i}
              href={dh("/?place=" + encodeURIComponent(p.id))}
              onClick={() => go("detail_open", { place_id: p.id, place_name: p.name, position: i + 1, city: where || null, category: p.category || null })}
              style={S.card}
            >
              {p.photoRef ? (
                <img src={"/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=240"} alt="" loading="lazy" width="82" height="82" style={{ width: 82, minHeight: 82, objectFit: "cover", display: "block", flex: "0 0 82px", background: "#161B22" }} />
              ) : (
                <div aria-hidden="true" style={{ width: 82, flex: "0 0 82px", background: "linear-gradient(135deg,#1b2735,#2c3e50)" }} />
              )}
              <div style={S.body}>
                <div style={S.name}>{p.name}</div>
                <div style={S.meta}>
                  {p.rating != null ? <span style={{ fontWeight: 800, color: "#FBBF24" }}>{p.rating}★{p.reviews ? <span style={{ color: "#94A3B8", fontWeight: 600 }}> ({p.reviews.toLocaleString()})</span> : null}</span> : null}
                  {p.openNow === true ? <span style={{ color: "#22C55E", fontWeight: 700 }}>Open now</span> : null}
                  {p.openNow === false ? <span style={{ color: "#94A3B8", fontWeight: 700 }}>Closed</span> : null}
                  {p.distMi != null ? <span style={{ color: "#94A3B8" }}>{p.distMi.toFixed(1)} mi from {where || "centre"}</span> : null}
                </div>
                {p.reason ? <div style={S.reason}>{p.reason}</div> : null}
              </div>
            </a>
          ))}
        </>
      ) : null}

      <a href={dh("/")} onClick={() => go("cta_open_app", { kind: "bridge_primary", city: where || null })} style={S.all}>
        {where ? "See everything open in " + where : "See everything open near you"} →
      </a>
    </aside>
  );
}
