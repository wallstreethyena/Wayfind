"use client";
import { Component, useEffect, useMemo, useRef, useState , Fragment} from "react";
import { CATEGORIES, SUBFILTERS, VIBES, DEFAULT_RADIUS_MI, DEFAULT_RADIUS_M, distMeters, getLoader, geocodeCity, reverseGeocode, fetchPlaceDetail, fetchPlaceById, findPlace, searchNearbyPlaces } from "../lib/google";
import { intentRadiusMi, intentScopeLabel } from "../lib/momentIntents";
// v4.86: every place search flows through the multi-source aggregator
// (Google + Foursquare, merged + deduped) — same signature, bigger pool.
import { searchPlaces } from "../lib/sources";
// v4.94: the ONE junk filter — composites and any non-aggregator pool call it too.
import { placeAllowed } from "../lib/placeFilter";
import { COUPONS } from "../lib/coupons";
import { HOOK_BANK, pickHook } from "../lib/hooks";
import * as Meals from "../lib/meals";
import * as Radius from "../lib/radius";
import { isTrueLodging } from "../lib/lodging";
import * as Fam from "../lib/family";
import { supabase } from "../lib/supabase";
import nextDynamic from "next/dynamic";
// v5.39 (July 2026 audit, Phase 7): the map bundle loads when the map
// screen (or sidebar map) first renders, not on first paint.
const MapView = nextDynamic(() => import("./components/MapView"), { ssr: false, loading: () => <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#94A3B8", fontSize: 13 }}>Loading map…</div> });
// G1 (July 2026 decomposition): non-default screens ship in their own chunks.
// `screen` initializes to "suggested" and these render only on user action, so
// ssr:false cannot cause a hydration mismatch. Every chunk is prefetched at
// first idle (see the SCREEN_LOADERS effect in PageInner), so switching
// screens never waits on the network in practice.
const loadSurprise = () => import("./components/screens/Surprise");
const loadCoupons = () => import("./components/screens/Coupons");
const loadSaved = () => import("./components/screens/Saved");
const loadItinerary = () => import("./components/screens/Itinerary");
const loadShared = () => import("./components/screens/Shared");
const loadEventsScreen = () => import("./components/screens/Events");
// G2: the sheets (hookDetail/account/menu/auth) are also user-triggered only
// and never SSR'd — same ssr:false safety as the screens above.
const loadHookDetail = () => import("./components/sheets/HookDetail");
const loadAccount = () => import("./components/sheets/Account");
const loadMenu = () => import("./components/sheets/Menu");
const loadAuth = () => import("./components/sheets/Auth");
// G3: the place-detail sheet — `detail` starts null, so this is the same
// user-triggered-only, never-SSR'd pattern as every other extraction here.
const loadDetail = () => import("./components/sheets/Detail");
// G4: `screen` always initializes to the literal "suggested" (never read
// from the URL synchronously — deep links flip it in a useEffect), and
// `introOpen` starts false, so map/experience/intro get the same safe
// ssr:false treatment as everything above.
const loadMap = () => import("./components/screens/Map");
const loadExperience = () => import("./components/screens/Experience");
const loadIntro = () => import("./components/sheets/Intro");
const SHEET_LOADERS = [loadHookDetail, loadAccount, loadMenu, loadAuth, loadDetail, loadIntro];
const SCREEN_LOADERS = [loadSurprise, loadCoupons, loadSaved, loadItinerary, loadShared, loadEventsScreen, loadMap, loadExperience, ...SHEET_LOADERS];
const SurpriseScreen = nextDynamic(loadSurprise, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const CouponsScreen = nextDynamic(loadCoupons, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const SavedScreen = nextDynamic(loadSaved, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const ItineraryScreen = nextDynamic(loadItinerary, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const SharedScreen = nextDynamic(loadShared, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const EventsScreen = nextDynamic(loadEventsScreen, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const MapScreen = nextDynamic(loadMap, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const ExperienceScreen = nextDynamic(loadExperience, { ssr: false, loading: () => <Loader label="Loading" pad="16px 2px" /> });
const HookDetailSheet = nextDynamic(loadHookDetail, { ssr: false, loading: () => null });
const AccountSheet = nextDynamic(loadAccount, { ssr: false, loading: () => null });
const MenuSheet = nextDynamic(loadMenu, { ssr: false, loading: () => null });
const AuthSheet = nextDynamic(loadAuth, { ssr: false, loading: () => null });
const DetailSheet = nextDynamic(loadDetail, { ssr: false, loading: () => null });
const IntroSheet = nextDynamic(loadIntro, { ssr: false, loading: () => null });
import * as Trips from "../lib/trips";
import * as Ranking from "../lib/ranking";
import * as Tags from "../lib/tags";
import * as Culture from "../lib/culture";
import * as WCC from "../lib/wc";
import * as Gems from "../lib/gems";
import * as Aff from "../lib/affiliates";
import * as Hol from "../lib/holidays";
import * as Cats from "../lib/categories";
import * as Dining from "../lib/dining";
import { CURATED } from "../lib/curated";
// July 2026 decomposition (G0): design tokens and stateless helpers live in the
// eager shared kit so extracted screens/sheets can import them without home.js.
import { C, CAT_COLOR, CAT_LABEL_COLOR, SHEET_EASE, sheetBg, sheet, EMOJIS, GlowPin, Grabber, KB_CLICK, useDialogFocus, directionsUrl, offerLabel, scoreLabel, priceGlyphs, stars, moonPhase, weatherFromCode, hourIcon, Icon, NavIcon, imageDisplayState, BrandedImageFallback, TYPE, SPACE, RADII, MOTION, FOCUS, TARGET } from "./components/kit";

const BUILD = "beta";
const BUILD_ID = "v5.71";
// ─── Affiliate config ────────────────────────────────────────────────────────
// All affiliate ids/params live in lib/affiliates.js (Viator PID via env,
// Ticketmaster param as a const there). Nothing is secret; ids appear in
// public URLs. Fill them in after approval and links go live automatically.
// Pass a ticket/event URL through here so it gains affiliate tracking the moment a
// Ticketmaster param is set. The param itself lives in lib/affiliates.js
// (v5.54) so the server-rendered /events/[city]/[slug] page appends the
// identical value. Fails soft: returns the plain URL when not configured.
function ticketUrl(url) {
  return Aff.ticketOutUrl(url);
}
const LOGO_PIN = { left: "58%", top: -4, size: 11 }; // nudge left/top/size from a screenshot if the dot sits off
function iconForPlace(p) {
  const h = ((((p && p.name) || "") + " " + (((p && p.types) || []).join(" "))).toLowerCase());
  const T = [["burger|white castle|shake shack|five guys|mcdonald|wendy|hamburger", "\uD83C\uDF54"], ["pizza", "\uD83C\uDF55"], ["taco|mexican|burrito", "\uD83C\uDF2E"], ["sushi|japanese|ramen", "\uD83C\uDF63"], ["chinese|noodle|wok", "\uD83E\uDD61"], ["italian|pasta", "\uD83C\uDF5D"], ["coffee|cafe|espresso", "\u2615"], ["bakery|donut|doughnut|pastry", "\uD83E\uDD50"], ["ice cream|gelato", "\uD83C\uDF66"], ["bbq|barbecue|smokehouse", "\uD83C\uDF56"], ["seafood|crab|lobster|oyster", "\uD83E\uDD9E"], ["steak|churrasc|brazilian", "\uD83E\uDD69"], ["breakfast|brunch|pancake|waffle", "\uD83E\uDD5E"], ["night_club|cocktail|lounge|pub|brewery|\\bbar\\b", "\uD83C\uDF78"], ["wine", "\uD83C\uDF77"], ["hotel|resort|lodging|\\binn\\b", "\uD83C\uDFE8"], ["beach", "\uD83C\uDFD6\uFE0F"], ["park|garden|trail", "\uD83C\uDF33"], ["museum|gallery", "\uD83C\uDFDB\uFE0F"], ["theater|theatre|cinema", "\uD83C\uDFAD"], ["mall|boutique|market|shopping|store", "\uD83D\uDECD\uFE0F"], ["aquarium", "\uD83D\uDC20"], ["zoo|wildlife", "\uD83E\uDD81"], ["golf", "\u26F3"]];
  for (const [rx, ic] of T) { try { if (new RegExp(rx).test(h)) return ic; } catch (e) {} }
  try { const c = Ranking.coarseCat(p); if (c === "Food") return "\uD83C\uDF7D\uFE0F"; if (c === "Nightlife") return "\uD83C\uDF78"; } catch (e) {}
  return "\uD83D\uDCCD";
}
// FINAL MENU (founder call, Jul 3). This component is the single source of
// truth for the category menu on home, map, and itinerary; any change here is
// site-wide by construction. Do not fork per-screen variants.
function CategoryMenu({ heading, activeCat, sub, onCat, onSub, trailing }) {
  const subs = activeCat ? (SUBFILTERS[activeCat] || []) : [];
  return (
    <div style={{ marginBottom: 10, background: "transparent", border: "none", borderRadius: 0, padding: heading ? "10px 2px 10px" : "4px 2px 8px" }}>
      {heading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "2px 4px 10px" }}>
          <GlowPin size={22} />
          <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.4px", lineHeight: 1.1, color: C.text }}>{heading}</div>
        </div>
      )}
      <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4, paddingBottom: 2 }}>
        {Cats.CATEGORY_TILES.map((m) => { const on = activeCat === m.id; return (
          <button key={m.id} onClick={() => onCat(m.id, m.label)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "9px 3px 7px", borderRadius: 0, background: "transparent", border: "none", cursor: "pointer", flex: 1, minWidth: 0, transition: "opacity .18s ease" }}>
            <NavIcon name={m.id} color={on ? C.accent : "#A9B4C7"} size={26} />
            <span style={{ fontSize: 11, fontWeight: on ? 800 : 600, color: on ? C.accent : "#A9B4C7", textAlign: "center", lineHeight: 1.15, letterSpacing: "0.1px" }}>{m.label}</span>
          </button>
        ); })}
        {trailing || null}
      </div>
      </div>
      <div style={{ overflow: "hidden", maxHeight: (activeCat && subs.length > 1) ? 96 : 0, opacity: (activeCat && subs.length > 1) ? 1 : 0, transition: "max-height 0.34s cubic-bezier(.4,0,.2,1), opacity 0.26s ease" }}>
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12, display: "flex", gap: 6, flexWrap: "nowrap", overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", paddingBottom: 2 }}>
          {subs.map((sf) => { const son = sub === sf.id; return (
            <button key={sf.id} onClick={() => { onSub(sf.id); }} style={{ flexShrink: 0, padding: "8px 11px 10px", border: "none", background: "transparent", color: son ? C.accent : "#A9B4C7", fontSize: 12.5, fontWeight: son ? 800 : 600, letterSpacing: "0.1px", cursor: "pointer", whiteSpace: "nowrap", position: "relative" }}>
              {sf.label}
              {son ? <span style={{ position: "absolute", left: 11, right: 11, bottom: 4, height: 2.5, borderRadius: 2, background: C.accent }} /> : null}
            </button>
          ); })}
        </div>
      </div>
    </div>
  );
}
function FeaturedTag({ name }) {
  if (!(featuredBoost(name) > 0)) return null;
  return <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10, fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase", color: "#E8B84B", background: "rgba(232,184,75,.12)", border: "1px solid rgba(232,184,75,.45)", borderRadius: 999, padding: "3px 9px" }}>🏅 Featured</span>;
}
function listShareUrl(key, title, n, loc, hk) {
  const q = ["t=" + encodeURIComponent(String(title || "").slice(0, 60))];
  if (hk) q.push("hk=" + encodeURIComponent(hk));
  if (n) q.push("n=" + n);
  if (loc) q.push("loc=" + encodeURIComponent(String(loc).split(",")[0].slice(0, 30)));
  return originUrl("/l/" + encodeURIComponent(key) + "?" + q.join("&"));
}
async function fetchMemberSignals(sb, list) {
  try {
    const ids = (list || []).map((p) => p && p.id).filter(Boolean).slice(0, 50);
    if (!ids.length) return null;
    // v5.05: two community signals in one pass — member takes (comments) and
    // the like aggregate. Likes are counted server-side (/api/signals/likes,
    // service key) because RLS correctly hides other users' like rows from
    // the browser. The COUNT is never rendered anywhere; it only feeds the
    // ranking nudge in Ranking.memberDelta, per product direction.
    const [cRes, lRes] = await Promise.all([
      sb ? sb.from("comments").select("place_id,user_id,type").in("place_id", ids).then((r) => r.data, () => null) : Promise.resolve(null),
      fetch("/api/signals/likes?ids=" + encodeURIComponent(ids.join(","))).then((r) => (r.ok ? r.json() : null), () => null),
    ]);
    const out = {};
    if (Array.isArray(cRes) && cRes.length) {
      const m = {};
      for (const r of cRes) {
        const k = r.place_id; if (!m[k]) m[k] = { seen: {}, warnSeen: {} };
        m[k].seen[r.user_id] = 1; if (r.type === "Warning") m[k].warnSeen[r.user_id] = 1;
      }
      for (const k in m) out[k] = { authors: Object.keys(m[k].seen).length, warnAuthors: Object.keys(m[k].warnSeen).length };
    }
    const lc = lRes && lRes.counts ? lRes.counts : null;
    if (lc) for (const k in lc) { if (!out[k]) out[k] = { authors: 0, warnAuthors: 0 }; out[k].likes = lc[k]; }
    return Object.keys(out).length ? out : null;
  } catch (e) { return null; }
}
function withMemberSignal(list, sig) {
  if (!sig) return list;
  return (list || []).map((p) => { const g = p && sig[p.id]; if (!g) return p; const d = Ranking.memberDelta(g); return { ...p, wfScore: +(((p.wfScore || 0) + d).toFixed(2)), _members: g }; });
}
// v4.95: the old mapsRouteUrl (Google-Maps directions to ALL places at once)
// is gone by product direction — a list's map icon opens Wayfind's own map.
// Per-place turn-by-turn stays on each place's explicit Directions button.

const DEFAULT_CENTER = { lat: 27.5689, lng: -82.4393, name: "Parrish, FL" };
const FEATURED_AREAS = [];

// Intent: Wayfind asks WHY you are going out, then reshapes every pick around it.
const INTENTS = [
  { id: "eat", icon: "🍽️", label: "Hungry", plans: [{ cat: "food", kw: "" }, { cat: "food", kw: "popular restaurants" }, { cat: "food", kw: "local favorite" }] },
  { id: "celebrate", icon: "🎉", label: "Celebrate", plans: [{ cat: "food", kw: "upscale restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "nightlife", kw: "rooftop bar" }] },
  { id: "date", icon: "❤️", label: "Date Night", plans: [{ cat: "food", kw: "romantic restaurant" }, { cat: "nightlife", kw: "cocktail bar" }, { cat: "food", kw: "waterfront" }, { cat: "food", kw: "dessert" }] },
  { id: "family", icon: "👨‍👩‍👧", label: "Family Time", plans: [{ cat: "attractions", kw: "family friendly" }, { cat: "food", kw: "family restaurant" }, { cat: "attractions", kw: "park" }] },
  { id: "kids", icon: "👶", label: "With Kids", plans: [{ cat: "attractions", kw: "things to do with kids" }, { cat: "attractions", kw: "playground park" }, { cat: "food", kw: "ice cream" }] },
  { id: "relax", icon: "🌅", label: "Relax", plans: [{ cat: "beach", kw: "" }, { cat: "attractions", kw: "park" }, { cat: "food", kw: "coffee" }] },
  { id: "night", icon: "🎵", label: "Night Out", plans: [{ cat: "nightlife", kw: "bar" }, { cat: "nightlife", kw: "night club" }, { cat: "nightlife", kw: "live music" }] },
  { id: "work", icon: "💻", label: "Work Friendly", plans: [{ cat: "food", kw: "coffee shop wifi" }, { cat: "food", kw: "cafe" }] },
  { id: "visit", icon: "✈️", label: "Visiting Town", plans: [{ cat: "attractions", kw: "top attractions" }, { cat: "attractions", kw: "things to do" }, { cat: "attractions", kw: "landmark" }] },
];

// One line of live context for the header, shaped by weather, time and the week.
function dynamicSubline(weather) {
  const d = new Date();
  const h = d.getHours();
  const day = d.getDay();
  const weekend = day === 5 || day === 6 || day === 0;
  if (weather && weather.wet) return "Rain around today, leaning toward great indoor spots";
  if (weather && weather.rain != null && weather.rain >= 50) return "Showers likely, here are solid indoor options";
  if (h >= 21) return "Open late and worth the trip tonight";
  if (h >= 17) return "Where to land for dinner and drinks tonight";
  if (weekend && h < 12) return "Weekend favorites to start your day";
  if (weekend) return "Weekend favorites near you";
  if (h < 11) return "A good way to start your morning";
  if (h < 15) return "Lunch and midday picks near you";
  return "Today's top picks near you";
}

// Lowercased description + review text per place id, filled in when we prefetch
// the top results. Lets the badge engine read evidence like "on the waterfront
// with live music" that is not in the structured attribute flags. Only the
// prefetched top results have an entry; everything else falls back to name plus
// Google attributes. Nothing here is invented.
const HINTS = {};
const OFFERS = {};

// Signal engine — captures like/dislike/open/save per place, drives personalised ranking.
// All data stays on-device (localStorage) until the user opts in by signing up.
function loadSignals() {
  try { return JSON.parse(localStorage.getItem("wf_signals") || "[]"); } catch { return []; }
}
function saveSignals(sigs) {
  try { localStorage.setItem("wf_signals", JSON.stringify(sigs.slice(0, 1000))); } catch {}
}
// Per-category and per-badge affinity weights. Half-life = 5 days.
function computeAffinities(sigs) {
  const catW = {}; const badgeW = {};
  const HL = 5 * 24 * 3600 * 1000;
  const now = Date.now();
  const W = { like: 1.5, save: 2.0, open: 0.2, dislike: -1.3 };
  for (const s of sigs) {
    const w = (W[s.action] || 0) * Math.pow(0.5, (now - s.ts) / HL);
    if (s.cat) catW[s.cat] = (catW[s.cat] || 0) + w;
    for (const b of (s.badges || [])) badgeW[b] = (badgeW[b] || 0) + w;
  }
  return { catW, badgeW };
}
// Blend Wayfind Score with personal affinity AND distance to re-rank the feed.
// Nearby places rank above equally-scored distant ones.
function applyAffinity(places, affinities) {
  const { catW, badgeW } = affinities;
  const maxC = Math.max(...Object.values(catW).map(Math.abs), 0.01);
  const maxB = Math.max(...Object.values(badgeW).map(Math.abs), 0.01);
  return places.map((p) => {
    const pc = (primaryCategory(p) || "").toLowerCase();
    let boost = ((catW[pc] || 0) / maxC) * 14;
    for (const b of experienceBadges(p, null, 6).map((x) => x.key)) {
      boost += ((badgeW[b] || 0) / maxB) * 9;
    }
    boost = Math.max(-20, Math.min(boost, 30));
    // v4.24: proximity dominates. First 4 miles free, then ~1.3 pts per mile,
    // capped at 30. Ordering only — displayed wfScore never changes.
    const _d = p.distMi || 0;
    const distPenalty = _d <= 4 ? 0 : Math.min(30, (_d - 4) * 1.3);
    return { ...p, _ps: (p.wfScore || 50) + boost - distPenalty + faveTier(p.name) * 4 + featuredBoost(p.name) + communityBoost(p) + (curatedFor(p) ? 15 : 0) };
  }).sort((a, b) => b._ps - a._ps);
}

// v4.54 PROTECTED (check-canon.mjs): the one true domain. Every share link
// is minted on the canonical domain no matter which host the app is running
// on, so stale *.vercel.app deployment URLs can never propagate through
// shares again.
const CANON_ORIGIN = "https://www.gowayfind.com";
function originUrl(path) {
  if (typeof window === "undefined") return path;
  try { const h = window.location.hostname || ""; if (/\.vercel\.app$/i.test(h) || h === "gowayfind.com" || h === "www.gowayfind.com") return CANON_ORIGIN + path; } catch (e) {}
  return window.location.origin + path;
}

// A stable, anonymous, per-device id (no personal data — just a random string)
// used to attribute pooled engagement events and measure return visits. Created
// once and kept in localStorage. Returns null if storage is unavailable.
function deviceId() {
  try {
    if (typeof window === "undefined") return null;
    let id = localStorage.getItem("wf_device");
    if (!id) { id = "d_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); localStorage.setItem("wf_device", id); }
    return id;
  } catch { return null; }
}

// Module-level event logger (no user attribution — device id only). Used by
// leaf components like PlaceCard that sit outside the main component scope.
function logEventAnon(action, place, extra) {
  try {
    if (!supabase) return;
    supabase.from("events").insert({
      action,
      place_id: (place && place.id) || null,
      place_name: (place && place.name) || null,
      device_id: deviceId(),
      user_id: null,
      meta: extra || null,
    }).then(() => {}, () => {});
  } catch (e) {}
}

// Compact a place down to what a shared list needs to render.
function compactPlace(p) {
  return { id: p.id, n: p.name, r: p.rating, c: p.reviews, pr: p.price, pn: p.priceNum, a: p.address, t: p.type, la: p.lat, lo: p.lng, ph: p.photo || null };
}
function expandPlace(o) {
  return { id: o.id, name: o.n, rating: o.r, reviews: o.c || 0, price: o.pr || null, priceNum: o.pn == null ? null : o.pn, address: o.a || "", type: o.t || "", lat: o.la, lng: o.lo, photo: o.ph || null, photos: o.ph ? [o.ph] : [], labels: [], mapsUrl: `https://www.google.com/maps/search/?api=1&query_place_id=${o.id}` };
}
function encodeList(places) {
  try {
    const json = JSON.stringify(places.slice(0, 25).map(compactPlace));
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.split("+").join("-").split("/").join("_").split("=").join("");
  } catch { return ""; }
}
function decodeList(str) {
  try {
    const b = str.split("-").join("+").split("_").join("/");
    const json = decodeURIComponent(escape(atob(b)));
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.map(expandPlace) : null;
  } catch { return null; }
}
// Share a link via the OS share sheet, falling back to copy. Passing url as a
// distinct field (not buried in text) is what lets iMessage/Facebook unfurl a
// rich preview card instead of showing the raw link as plain text.
// v5.09 — hero-card A/B instrumentation. Impressions fire once per card per
// page load (render is re-entrant; the Set makes this idempotent), taps fire
// from the open handler. Both carry the exact hook variant so PostHog can
// promote winning copy and retire losers.
const _heroSeen = new Set();
function heroImpression(card, variant, text) {
  const k = card + ":" + variant;
  if (_heroSeen.has(k)) return;
  _heroSeen.add(k);
  try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("hero_impression", { card, variant, text }); } catch (e) {}
}
function heroTap(card, variant) {
  try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("hero_tap", { card, variant }); } catch (e) {}
}
function _sharePath(nm) { try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("share_path", { path: nm }); } catch (e) {} }
// v4.80 — reliable external open for partner links (Viator, Stay22). From an
// installed home-screen PWA, plain target="_blank" + rel="noreferrer" anchors
// can open a browser view that never navigates (long-standing iOS standalone
// bug): the browser appears but the product page doesn't. window.open is the
// dependable path there; when it's blocked/nulled we fall back to a direct
// navigation so the tap ALWAYS lands on the destination.
// v5.09 — THE coupon redeemability rule, born from a real trust failure: a
// user drove to Dinosaur World on a Wayfind "Save $2" card and the till had
// nothing to honor. The offers table held transcriptions of PRINTED tourist
// flyers ("coupon must be presented at admission") whose URL was just the
// venue homepage — the app literally could not deliver the discount it
// advertised. Rule: a deal may only show if the app can DELIVER redemption —
// a code to present, or a URL that is itself the claimable deal. A
// flyer-transcribed offer with no code is not redeemable in-app and never
// renders, on the Coupons tab or on place cards.
function offerRedeemable(o) {
  if (!o) return false;
  if (o.code) return true;
  const txt = String((o.description || "") + " " + (o.details || ""));
  const flyer = /print|flyer|present (the )?coupon|must present|presented at/i.test(txt);
  return !!o.url && !flyer;
}
function openExternal(url) {
  if (!url) return;
  try { const w = window.open(url, "_blank", "noopener"); if (w) return; } catch (e) {}
  // v5.01 GLOBAL RULE (user direction): partner/affiliate pages NEVER replace
  // Wayfind. If the popup was blocked, synthesize an anchor click in the same
  // gesture — new tab, tracking intact. Same-tab navigation is banned here:
  // it swapped the app for the partner page, which is exactly the bug fixed.
  try { const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; document.body.appendChild(a); a.click(); a.remove(); } catch (e) {}
}
function shareLink(title, url, onCopied, text, onShared) {
  // v4.07: the native sheet must be the FIRST activation-consuming API in the tap.
  // v4.06 copied to the clipboard first; on iOS the clipboard write consumes the
  // tap's transient user activation, so navigator.share() that followed was
  // rejected (NotAllowedError) on every tap: toast showed, sheet never opened.
  // Order inverted: touch devices get the sheet immediately, copy is the
  // fallback only when the sheet is unsupported or fails (not on user cancel).
  // Desktop keeps the old instant-copy behavior.
  let credited = false;
  const credit = () => { if (credited) return; credited = true; if (onShared) { try { onShared(); } catch (e) {} } };
  const legacyCopy = () => {
    try { const ta = document.createElement("textarea"); ta.value = url; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); } catch (e) {}
    if (onCopied) onCopied(); credit();
  };
  const doCopy = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => { if (onCopied) onCopied(); credit(); _sharePath("copied"); }, () => { legacyCopy(); _sharePath("copied_legacy"); });
      } else { legacyCopy(); _sharePath("copied_legacy"); }
    } catch (e) { legacyCopy(); _sharePath("copied_legacy"); }
  };
  const touchDevice = (() => { try { return (typeof window !== "undefined") && (("ontouchstart" in window) || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches)); } catch (e) { return false; } })();
  if (touchDevice && typeof navigator !== "undefined" && navigator.share) {
    try {
      const payload = text ? { title, text, url } : { title, url };
      const pr = navigator.share(payload);
      _sharePath("native_called");
      if (pr && typeof pr.then === "function") {
        pr.then(function () { _sharePath("native_ok"); credit(); }, function (e) {
          if (e && e.name === "AbortError") { _sharePath("native_cancel"); return; }
          _sharePath("native_reject"); doCopy();
        });
      }
    } catch (e) { _sharePath("native_throw"); doCopy(); }
  } else { _sharePath(touchDevice ? "nonative" : "desktop_copy"); doCopy(); }
}
// Short random code for shareable list links (no ambiguous chars).
function randCode() {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 7; i++) out += a[Math.floor(Math.random() * a.length)];
  return out;
}

const LINE_TTL = 30 * 24 * 3600 * 1000; // 30 days
function allCachedLines() {
  try { return JSON.parse(localStorage.getItem("wf_lines") || "{}"); } catch { return {}; }
}
function getCachedLine(id) {
  try {
    const e = allCachedLines()[id];
    if (e && Date.now() - e.t < LINE_TTL) return e.v;
  } catch {}
  return null;
}
function setCachedLines(map) {
  try {
    const c = allCachedLines();
    const now = Date.now();
    Object.keys(map || {}).forEach((id) => { if (map[id]) c[id] = { v: map[id], t: now }; });
    localStorage.setItem("wf_lines", JSON.stringify(c));
  } catch {}
}
function getCachedInsight(id) {
  try {
    const e = JSON.parse(localStorage.getItem("wf_insights") || "{}")[id];
    if (e && Date.now() - e.t < LINE_TTL) return e.v;
  } catch {}
  return null;
}
function setCachedInsight(id, data) {
  try {
    const c = JSON.parse(localStorage.getItem("wf_insights") || "{}");
    c[id] = { v: data, t: Date.now() };
    localStorage.setItem("wf_insights", JSON.stringify(c));
  } catch {}
}

// Turn the 0 to 100 score into a 9.0 style number plus a plain-language tier.
// Global dedupe: one shared layer every feed runs before rendering, so the same
// place never shows twice and two branches of one brand (e.g. Oak & Stone) never
// sit back to back in a curated feed. Exact place_id duplicates always collapse.
// When collapseBrand is true (general recommendation feeds) same-name brands
// collapse to their single best branch; brand searches pass false and keep all.
function normName(s) {
  let t = String(s || "").toLowerCase();
  const cut = t.search(/\s[-\u2013\u2014|]\s/);
  if (cut > 0) t = t.slice(0, cut);
  return t.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function betterPlace(a, b) {
  if (!a) return b; if (!b) return a;
  const oa = a.openNow === true ? 1 : 0, ob = b.openNow === true ? 1 : 0;
  if (oa !== ob) return oa > ob ? a : b;
  const na = a.reviews || 0, nb = b.reviews || 0;
  if (na !== nb) return na > nb ? a : b;
  const ra = a.rating || 0, rb = b.rating || 0;
  if (ra !== rb) return ra > rb ? a : b;
  const pa = a.photo ? 1 : 0, pb = b.photo ? 1 : 0;
  if (pa !== pb) return pa > pb ? a : b;
  return (a.wfScore || 0) >= (b.wfScore || 0) ? a : b;
}
function dedupePlaces(list, collapseBrand) {
  if (!Array.isArray(list)) return [];
  const out = []; const at = new Map();
  for (const p of list) {
    if (!p) continue;
    const id = p.id || p.placeId || ("n:" + p.name + "|" + (p.address || ""));
    if (at.has(id)) { const i = at.get(id); out[i] = betterPlace(out[i], p); }
    else { at.set(id, out.length); out.push(p); }
  }
  if (!collapseBrand) return out;
  const out2 = []; const nat = new Map();
  for (const p of out) {
    const k = normName(p.name);
    if (!k) { out2.push(p); continue; }
    if (nat.has(k)) { const i = nat.get(k); out2[i] = betterPlace(out2[i], p); }
    else { nat.set(k, out2.length); out2.push(p); }
  }
  return out2;
}

// v5.5: build a share URL whose landing page (/p/[id]) renders a branded Wayfind
// preview card in iMessage and social, then bounces the visitor into the app.
function placeShareUrl(p, loc, hook) {
  if (!p || !p.id) return originUrl("/");
  const q = [];
  const add = (k, v) => { if (v != null && v !== "") q.push(k + "=" + encodeURIComponent(String(v).slice(0, 80))); };
  add("t", p.name || "");
  add("loc", loc ? String(loc).split(",")[0] : "");
  if (p.rating != null) add("r", p.rating);
  if (p.reviews != null) add("rev", p.reviews);
  if (p.distMi != null) add("mi", p.distMi.toFixed(1));
  if (hook) add("hk", hook);
  add("cat", primaryCategory(p) || "");
  const sl = scoreLabel(p.wfScore);
  if (sl && sl.s != null) add("sc", sl.s);
  return originUrl("/p/" + encodeURIComponent(p.id) + (q.length ? "?" + q.join("&") : ""));
}
function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// A recommendation-style header above the cards, shaped by category and time of
// day, so the list reads as picks for right now rather than a directory count.
function picksHeader(cat) {
  const h = new Date().getHours();
  const part = h < 11 ? "this morning" : h < 17 ? "this afternoon" : "tonight";
  if (cat === "nightlife") return "Where to go tonight";
  if (cat === "attractions") return "Best things to do nearby";
  if (cat === "hotels") return "Top places to stay";
  if (cat === "shopping") return "Best shopping nearby";
  return `Top picks ${part}`;
}

// A clean, honest one-liner built only from a place's stats. Used instantly and
// as the fallback when the AI card line is unavailable. Never invents anything.
function templateBlurb(p) {
  const b = experienceBadges(p, null, 1)[0];
  const key = b ? b.key : null;
  const lines = {
    localfav: "A crowd favorite nearby with strong reviews.",
    gem: "A quieter spot that punches above its size.",
    value: "Genuinely good food without the big bill.",
    waterfront: "Worth it for a table near the water.",
    rooftop: "Go for the view from up top.",
    romantic: "An easy pick for date night.",
    livemusic: "Come for the food, stay for the live music.",
    pizza: "Come for the pizza, leave happy.",
    sushi: "Fresh sushi and a steady hand.",
    steak: "For when only a great steak will do.",
    seafood: "Fresh seafood close to the water.",
    burgers: "Go for a proper, messy burger.",
    mexican: "Tacos and everything around them, done right.",
    italian: "Pasta and red sauce worth the carbs.",
    dessert: "Save room. This is the good part.",
    cocktails: "Proper cocktails, made with care.",
    wine: "A good list and a quiet pour.",
    beer: "Cold taps and a relaxed table.",
    coffee: "Where the day starts and the laptops open.",
    breakfast: "The most important meal, done right.",
    outdoor: "Grab a table in the open air.",
    family: "Easy with kids and good for grownups too.",
    groups: "Room for the whole crew.",
    dog: "Bring the dog. Everyone is welcome.",
    sports: "Big screens and the game on.",
  };
  if (key && lines[key]) return lines[key];
  if (p.rating >= 4.6) return "One of the better-reviewed spots near you.";
  if (p.rating >= 4.3) return "A solid, well-reviewed choice nearby.";
  return "Worth a look while you are nearby.";
}

// Curated experiences. Each one is a real search plus an honest filter. Badges
// on cards map straight into these, so a badge means the same thing everywhere.
// v6.22: curated local favorites for the Sarasota-Manatee launch market, drawn from
// regional best-of lists (Sarasota Magazine, SRQ Magazine) and established local dining
// guides. Names only, matched against places Google already returns. Nothing is fabricated:
// if a spot closes, Google stops returning it and it silently drops out. Two tiers —
// BEST_OF = editorially recognized (shown as the "Best of Sarasota" surface); the wider
// LOCAL_FAVE set feeds the existing "Local favorites" experience and a small ranking lift.
const BEST_OF_NAMES = ["Selva Grill","Owens Fish Camp","Indigenous","Michael's On East","Duval's","Cafe Barbosso","Morton's Market","Marina Jack","Mirna's Cuban Cuisine","Mimi's Brasserie","Florence and the Spice Boys","Ringside","Station 400","Mademoiselle Paris","Focaccia Sandwich","Arts & Central","Siesta Key Summer House","C'est La Vie","Columbia Restaurant","99 Bottles","The Ringling","Marie Selby Botanical Gardens","Mote Marine","Myakka River State Park","Sarasota Opera House","The Bay Park","Lido Beach","Siesta Key Beach","St. Armands Circle","St. Regis Longboat Key","Beach House Waterfront","Wicked Cantina","Anna Maria Oyster Bar","Bridge Street Bistro","Pier 22","The Sandbar Restaurant","The Ugly Grouper","The Waterfront Restaurant","Beach Bistro","Calusa Brewing","Big Top Brewing","Motorworks Brewing","JDub's Brewing","Cask & Ale"];
const LOCAL_FAVE_EXTRA = ["Se7en Bites","White Wolf Cafe","Olive Eats","The Breakfast Cottage","Sun Garden Cafe","Toastique","Focaccia","Mouthole Smashburgers","Fin & Tonic","The 1818 Grill","Lefty's Oyster","Rufa","Peruvian Grill","El Ceviche","Aji Ceviche Bar","Big Water Fish Market","Kolucan Mexican","Tsunami Sushi","Euphemia Haye","Fiorelli Winery","Burns Court Cinema","Elysian Fields","Der Dutchman","Smoqehouse","Coquina Beach Cafe","Gulf Drive Cafe","Skinny's Place","The Doctor's Office","Rod n Reel Pier","Poppo's Taqueria","Sign of the Mermaid","Blue Marlin Grill","Island Creperie","The Donut Experiment","Bridge Tender Inn","O'Bricks","Chateau 13","enRich Bistro","Joey D's","Oma'z Pizza","Darwin Brewing","Sarasota Brewing Company","Mandeville Beer Garden","Oak & Stone","3 Keys Brewing","Brew Life","3 Car Garage Brewing","Good Liquid Brewing","3 Bridges Brewing","Off the Wagon","Origin Craft Beer","Cock & Bull","Evie's Tavern","Loaded Cannon Distillery","Vin Cella","Siesta Key Wine Bar","Growler's Pub","Sun King Sarasota"];
const wfNorm = (s) => (s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
const BEST_OF_SET = new Set(BEST_OF_NAMES.map(wfNorm));
const LOCAL_FAVE_SET = new Set([...BEST_OF_NAMES, ...LOCAL_FAVE_EXTRA].map(wfNorm));
const LOCAL_FAVE_KEYS = [...LOCAL_FAVE_SET];
const _faveCache = new Map();
function faveTier(name) {
  const n = wfNorm(name);
  if (!n) return 0;
  if (_faveCache.has(n)) return _faveCache.get(n);
  let tier = 0;
  if (BEST_OF_SET.has(n)) tier = 2;
  else if (LOCAL_FAVE_SET.has(n)) tier = 1;
  else { for (const k of LOCAL_FAVE_KEYS) { if ((k.length >= 6 && n.startsWith(k)) || (n.length >= 8 && k.startsWith(n))) { tier = BEST_OF_SET.has(k) ? 2 : 1; break; } } }
  _faveCache.set(n, tier);
  return tier;
}
const isLocalFave = (name) => faveTier(name) >= 1;
const isBestOf = (name) => faveTier(name) === 2;

// Owner-curated featured boost. Places listed here get a ranking lift so they
// surface prominently for everyone. Keyed by normalized name -> points added to
// the score. Bounded on purpose: this is a lift, not an absolute pin, so a weak
// place cannot leapfrog a clearly better one and break trust in the ranking.
// Raise a number to push harder; add entries to feature more places.
// Owner-curated editorial notes, keyed by place name (same matcher family as
// WAYFIND_FEATURED). Rendered on the detail page under an explicit "Curated by
// Wayfind" label so provenance is honest: this is editorial voice, never
// presented as review-derived data. Keep tips durable; no prices (they rot).
const AMC_DS_NOTE = [
  "Dine-in theater: reserved recliners, with food and drinks ordered to your seat. On busy nights grab tickets and pick seats ahead. Everglazed Donuts & Cold Brew is a couple doors down for before or after.",
  "For what's playing, check showtimes in the AMC app or at the kiosk on the way in.",
];
const K_BOB_NOTE = [
  "Corn dogs: the 'Original' is half hot dog, half cheese. If you want the cheese, order the full cheese one, it's the better bite than the hot dog.",
  "Get the chicken sauced. The strips run a little dry on their own, and the Korean butter sauce is what makes them. Plain is still an option if you'd rather.",
  "Best drink here is the vanilla tea with tapioca and brown sugar.",
  "Easy with kids: high chairs, toys, kid backpacks, and kiosk ordering at the door, and the tenders are the kid-friendly pick. It runs pricier than most counter service, with the corn dogs the cheaper option.",
];
// Owner-shot photos (Gabe's own, licensing clean). Keys are lowercase name
// fragments matched with includes(); photos prepend to the Google gallery.
const WAYFIND_PHOTOS = {
  "parc soleil": ["/wf-parcsoleil-1.jpg", "/wf-parcsoleil-2.jpg", "/wf-parcsoleil-3.jpg"],
};
const WAYFIND_NOTES = {
  "boggy creek airboat": [
    { text: "Family-run airboat tours through native Florida wildlife in Kissimmee, gators, eagles, turtles, herons, the real Everglades-headwaters landscape most tourists never see. It's the honest, unglitzy version of the airboat experience: just good family fun on the water. On-site they also have a gem mine, a butterfly garden, a restaurant, and a gator pond, so it's an easy half-day.", url: "https://www.bcairboats.com", label: "Book a tour" },
    { text: "Reservations recommended. About an hour to 75 minutes from Parrish toward Kissimmee. Their printed materials run a 10% off code; grab one before you go.", },
  ],
  "boggy creek airboat adventures": [
    { text: "Same as Boggy Creek Airboat Adventures in Kissimmee, native-wildlife airboat tours plus a gem mine, butterfly garden, and restaurant on site. Family fun, reservations recommended, about an hour from Parrish.", url: "https://www.bcairboats.com", label: "Book a tour" },
  ],
  "dezerland park": [
    { text: "The best rainy-day or too-hot-day card in Orlando: 12-plus indoor attractions under one roof on International Drive, anchored by the Orlando Auto Museum (one of the largest private car collections anywhere), plus a huge arcade, go-karts, pinball palace, axe throwing, and escape rooms. One stop, endless options, and it's all indoors and air-conditioned.", url: "https://www.dezerlandpark.com/orlando/", label: "Plan your visit" },
  ],
  "chocolate kingdom": [
    { text: "A bean-to-bar chocolate factory tour in Orlando that TripAdvisor voted the #1 food tour in the city, follow the story of chocolate from the cocoa pod through the River of Chocolate to the micro-batch factory, with samples throughout and a customize-your-own chocolate bar at the end. They also do chocolate-and-wine pairings and handmade Dubai bars. Advance purchase recommended; it's a small-group experience.", url: "https://www.chocolatekingdom.com", label: "Book the tour" },
  ],
  "legoland florida": [
    { text: "The one Central Florida theme park built specifically for kids, in Winter Haven about 45 minutes from Parrish, and that focus is the whole point: if your crew skews 2 to 12, this beats the mega-parks on fit and on crowds. Bricktastic rides across LEGO NINJAGO, LEGO Movie, and more immersive lands, plus the all-new indoor Galacticoaster where kids customize a LEGO spacecraft and blast off to save the galaxy.", url: "https://www.legoland.com/florida/", label: "Plan your trip" },
    { text: "It's really a resort, not just a park: the separate LEGOLAND Water Park (14 slides, a wave pool, the Build-A-Raft lazy river), three fully-themed on-site hotels just 130 kid-steps from the gate with daily hot breakfast and nightly kids' entertainment, and year-round events, LEGO NINJAGO Celebration in spring, LEGO Festival and Red White & BOOM fireworks in summer, Brick-or-Treat in fall, and Holidays at LEGOLAND in winter.", },
    { text: "Two neighbors share the campus and pair naturally: SEA LIFE Florida (the aquarium, included with a LEGOLAND theme-park ticket) and the world's first Peppa Pig Theme Park right next door, which is the ideal add for toddlers. Grab Granny's Apple Fries, they're the LEGOLAND signature treat.", },
  ],
  "legoland": [
    { text: "LEGOLAND Florida in Winter Haven, the Central Florida theme park built for kids, about 45 minutes from Parrish. Rides, shows, and immersive LEGO lands plus the new indoor Galacticoaster, a separate water park, on-site themed hotels, and year-round events. SEA LIFE aquarium is included with a park ticket, and the world's first Peppa Pig Theme Park is right next door.", url: "https://www.legoland.com/florida/", label: "Plan your trip" },
  ],
  "peppa pig theme park": [
    { text: "The world's first Peppa Pig Theme Park, purpose-built for the toddler-and-preschool set and right beside LEGOLAND Florida in Winter Haven, so it pairs perfectly with a LEGOLAND day. A full day of gentle rides and play: Daddy Pig's Roller Coaster as a first coaster, Peppa Pig's Balloon Ride, Grampy Rabbit's Dinosaur Adventure, the Muddy Puddles splash pad, and free fun-fair games. If your kids are little, this is the pick over the big parks.", url: "https://www.peppapigthemepark.com/florida/", label: "Plan your visit" },
  ],
  "sea life": [
    { text: "SEA LIFE Florida, the aquarium at LEGOLAND Florida Resort in Winter Haven, walk through the underwater tunnel of Coral Kingdom, meet rays and sharks, and touch the interactive rockpool exhibits. Best value note: admission is included with a LEGOLAND Florida theme-park ticket, so don't pay for it twice.", url: "https://www.visitsealife.com/florida/", label: "Plan your visit" },
  ],
  "gatorland": [
    { text: "The original Florida roadside attraction, family-owned since 1949 and crowned Alligator Capital of the World, 125-plus acres on Orange Blossom Trail with more gators than anywhere else, plus rare white alligators and crocodiles from around the world. It's won Orlando Weekly's Best of Orlando, and locals will tell you it's more authentic old-Florida fun than the mega-parks. Open daily; parking is always free.", url: "https://www.gatorland.com", label: "Visit Gatorland" },
    { text: "The thrill add-ons are the reason to go beyond general admission: the Screamin' Gator Zipline soars 70 feet over live gators across seven towers (voted one of the best ziplines in the U.S.), the Stompin' Gator monster-truck-style off-road adventure, and Croc Rock's rock wall, chain bridge, and zip. Buy ride tickets at Gator Joe's Adventure Outpost inside.", },
    { text: "Great with kids and cheaper than a theme-park day: petting zoo, a splash pad, live shows, the Gator Jumparoo, and a train. About 45 minutes to an hour from Parrish up toward Orlando.", },
  ],
  "dinosaur world": [
    { text: "Florida's largest attraction devoted to dinosaurs, hundreds of life-sized dinosaurs built to scale from the latest paleontological data, towering over you along a wooded outdoor trail in Plant City, right off I-4 at Exit 17 between Tampa and Orlando. Genuinely close to Parrish and an easy half-day; it's exciting, educational, and built for families.", url: "https://www.dinosaurworld.com", label: "Visit Dinosaur World" },
    { text: "Don't miss the animatronics and the hands-on parts kids love: the fossil dig, the Exploration Cave, and the boneyard. Open every day except Thanksgiving and Christmas, 10am to 5pm. Their printed flyer runs a save-$2-per-adult coupon good for up to 4 people; grab one before you go.", },
  ],
  "wild bill's airboat tours": [
    { text: "The airboat ride locals send their out-of-town family on, and it's been earning great reviews since 1980, about 50 minutes north of Orlando in Inverness. You skim the Withlacoochee River past lily-pad channels and cypress forest, gators basking on the banks, herons and turtles and deer along the way. Kids can handle a baby alligator under expert guidance. Reservations preferred, walk-ins welcome, open 7 days year-round.", url: "https://www.wbairboats.com", label: "Book your tour" },
    { text: "Ask about the private tour: a 6-passenger boat for a 1 or 2 hour ride, which is the move for a family or small group who want the guide to themselves. Coast Guard approved, and the operation has been featured on National Geographic, Discovery, and America's Got Talent.", },
  ],
  "wild bills airboat tours": [
    { text: "Same as Wild Bill's Airboat Tours in Inverness \u2014 world-famous airboat rides on the Withlacoochee, great reviews since 1980, about 50 minutes north of Orlando. Gators, herons, cypress, and a baby-gator handling moment for the kids. Reservations preferred.", url: "https://www.wbairboats.com", label: "Book your tour" },
  ],
  "pirates dinner adventure": [
    { text: "The big Orlando dinner show that actually earns the hype: an interactive pirate spectacular on a full-size ship with acrobatics, sword fights, and a story you get pulled into, just off International Drive at 6400 Carrier Drive. Admission includes the meal (the Port of Call Feast, with vegetarian, vegan, and kids' options) and the live show. Fully enclosed and air-conditioned, ADA accessible, casual dress. Reserve ahead, especially in peak season.", url: "https://www.piratesdinneradventure.com", label: "Reservations & showtimes" },
  ],
  "blue man group": [
    { text: "Comedy, theater, and rock concert rolled into one, now at ICON Park on International Drive. No spoken language, so it lands for every age and every visitor, three bald blue men, drums, paint, and surprises the whole way through. As Orlando locals put it: if you haven't seen Blue Man Group, you haven't seen Orlando. Groups of 10 or more get a dedicated sales contact.", url: "https://www.blueman.com", label: "Buy tickets" },
  ],
  "wonderworks": [
    { text: "The upside-down building on International Drive is Professor Wonder's lab: over 100 hands-on exhibits across multiple floors, from an astronaut trainer to a hurricane simulator, genuine family fun for all ages. Don't miss the Outta Control Magic Comedy Dinner Show while you're there. Their printed flyer runs a $2-off-tickets coupon valid for up to 6 people; grab one before you go.", url: "https://www.wonderworksonline.com/orlando/", label: "Visit WonderWorks" },
  ],
  "safari wilderness": [
    { text: "This is the one almost no visitor knows about, and locals guard it: a 260-acre private ranch near Lakeland where you ride out among free-roaming herds \u2014 zebra, cheetah, water buffalo, giant tortoise \u2014 with no crowds and no lines. Fodor's named it a Top 10 safari in the entire U.S. Reserve ahead; tours are deliberately kept small and sell out, which is exactly why the experience stays this good.", url: "https://www.safariwilderness.com", label: "Reserve online (required in advance)" },
    { text: "Pick your ride and it changes the whole day: the custom covered truck for close feeding encounters, a camel-back expedition (the only one outside Africa), kayak safari past lemur island where you hand-feed ring-tailed lemurs, or ATV across the ranch. Each tour runs about 1 to 1.5 hours.", },
    { text: "Worth the drive from Parrish, roughly an hour north. Add the Premium Cheetah Encounter if you want a 30-minute hands-on session; it books by special request only.", },
  ],
  "giraffe ranch": [
    { text: "Feed a giraffe from eye level on a family-run wildlife preserve in Dade City, about 800 animals across 80 species roaming the second-largest wilderness area in Florida after the Everglades. TripAdvisor has given it a Certificate of Excellence every year since 2012, and Fodor's calls it a Top 10 in Tampa Bay. One reviewer's line says it best: Florida's best kept secret.", url: "https://www.girafferanch.com", label: "Book now (advance online only)" },
    { text: "The founder personally guided 30 African safaris, and it shows in how the tours run. Choose custom vehicle, camelback, drive-thru, Segway, or the electric Cybertruck safari; the starred options include giraffe feedings, so pick those if feeding the giraffes is the point.", },
    { text: "Stack on encounters only offered with a full safari: sloth, otter feeding, red river hog, pygmy hippo, monkey. Reserve in advance, it's required, and it's about an hour from Parrish toward Dade City.", },
  ],
  "safari wilderness ranch": [
    { text: "Same place as Safari Wilderness \u2014 the 260-acre exotic-game ranch near Lakeland, Fodor's Top 10 safari in the U.S. Ride among the herds by truck, camel, kayak, or ATV. Small groups, advance reservations required.", url: "https://www.safariwilderness.com", label: "Reserve online" },
  ],
  // Entries are strings, or { text, url, label } when a tip has a working
  // link. Owner-vouched links only; community Tips stay plain text.
  // Umbrella resort pages (where tourists actually land) route to the parks.
  "walt disney world": [
    { text: "Nightly fireworks run inside the individual parks, not resort-wide: Happily Ever After at Magic Kingdom, Luminous at EPCOT, and Fantasmic! at Hollywood Studios on select nights. Open each park's page in Wayfind for its note, and check today's official calendar for exact times \u2014 they change with the season.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park hours & showtimes" },
  ],
  "universal orlando resort": [
    { text: "The nighttime shows live inside each park: CineSational on the Universal Studios lagoon and the Celestial Park finale at Epic Universe. Exact times vary by night \u2014 today's schedule is on the official hours page.", url: "https://www.universalorlando.com/web/en/us/plan-your-visit/hours-information", label: "Hours & showtimes" },
  ],
  "magic kingdom park": [
    { text: "Happily Ever After fireworks light the castle most nights \u2014 start time changes with the season, so check today's official schedule before you plan dinner.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park schedule" },
  ],
  "epcot": [
    { text: "Luminous \u2014 The Symphony of Us runs over World Showcase Lagoon most nights. Times shift by season; the official calendar has today's showtime.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park schedule" },
  ],
  "disney's hollywood studios": [
    { text: "Fantasmic! runs select nights and fills up \u2014 check today's schedule and line up early or book the dining package.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park schedule" },
  ],
  "universal studios florida": [
    { text: "CineSational: A Symphonic Spectacular closes most nights on the lagoon \u2014 showtime varies, check today's hours.", url: "https://www.universalorlando.com/web/en/us/plan-your-visit/hours-information", label: "Hours & showtimes" },
  ],
  "universal epic universe": [
    { text: "Celestial Park hosts the park's nighttime finale \u2014 times vary by night; today's schedule is on the official hours page.", url: "https://www.universalorlando.com/web/en/us/plan-your-visit/hours-information", label: "Hours & showtimes" },
  ],
  "hilton grand vacations club parc soleil": [
    { text: "The pool chair and cabana reservation instructions in the welcome letter are often broken. The system that actually works is the resort's own Recreation Team page on Eventbrite, run by the rec staff, free to book.", url: "https://www.eventbrite.com/o/parc-soleil-recreation-team-34192772609", label: "Open chair & cabana reservations" },
    "Reservation slots drop on a rolling basis, usually the morning of. If the page shows nothing yet, the day's slots have not been posted; check back early or search Eventbrite for Parc Soleil Recreation Team.",
    "Chairs tend to book out about three days ahead, matching the typical three-night owner stay, so reserve the day before your check-in for the dates you want.",
    "Owner tip: for the Disney fireworks, ask for Tower 100 rooms 11423, 11424, or 11425 \u2014 they face Disney directly. Northwest-facing high floors in Tower 200 also carry the fireworks line.",
  ],
  "disney's animal kingdom": [
    { text: "The one Disney park with no fireworks \u2014 the animals come first. Evening entertainment and hours change often, so check today's official calendar before you plan the night.", url: "https://disneyworld.disney.go.com/calendars/", label: "Today's park schedule" },
  ],
  "seaworld orlando": [
    { text: "Ignite fireworks play over the lagoon on summer and select nights \u2014 confirm tonight's time on the official hours page.", url: "https://seaworld.com/orlando/park-info/theme-park-hours/", label: "Park hours & shows" },
    "Sharks Underwater Grill is the meal worth planning around: full service beside the shark tank. Reserve in the SeaWorld app the morning you visit; walk-ins rarely clear on busy days.",
    "Eating two or more meals? The All-Day Dining Deal usually beats paying per meal at the quick-service spots. It does not cover Sharks Underwater Grill, so pair the deal for lunch with Sharks for dinner.",
    "Quick-service pecking order from regulars: Voyager's Smokehouse first, Seafire Grill second.",
    "Ride Mako and Manta in the first hour after opening, then move indoors for shows and aquariums during the mid-afternoon heat.",
    "On many summer and holiday nights the park closes with fireworks over the lagoon; stake out the Bayside lakefront about 20 minutes before close.",
    "Visiting twice within a year? The annual pass usually beats two single-day tickets and adds parking and in-park discounts; run that math before buying a day ticket.",
  ],
  "cityworks": [
    "One of the busiest tables in Disney Springs, packed while nearby spots sat half empty, so expect a wait at peak hours. Put your name in early or grab a reservation before you head over.",
  ],
  "amc disney springs": AMC_DS_NOTE,
  "amc dine-in disney springs": AMC_DS_NOTE,
  "kbob": K_BOB_NOTE,
  "k-bob": K_BOB_NOTE,
  "k bob": K_BOB_NOTE,
  "kbop": K_BOB_NOTE,
  "k-bop": K_BOB_NOTE,
  "everglazed": [
    "Over-the-top glazed donuts and cold brew, an easy sweet stop while you walk Disney Springs, and right by the AMC if you're catching a movie.",
  ],
};
function wayfindNotes(name) {
  const n = String(name || "").toLowerCase().trim();
  if (!n) return null;
  for (const k in WAYFIND_NOTES) { if (n.startsWith(k) || (n.length >= 8 && k.startsWith(n))) return WAYFIND_NOTES[k]; }
  // Family fallback: any Disney/Universal-branded entity (name variants,
  // water parks, Disney Springs, hotels) inherits the resort-level schedule
  // note, so the fireworks answer is never a needle hunt across variants.
  if (n.indexOf("disney") >= 0) return WAYFIND_NOTES["walt disney world"];
  if (n.indexOf("universal") >= 0) return WAYFIND_NOTES["universal orlando resort"];
  return null;
}
const WAYFIND_FEATURED = {
  // Keys MUST be wfNorm-normalized (lowercase, & -> and, no spaces or
  // punctuation) so featuredBoost's lookup actually matches. Earlier spaced
  // keys ("hilton orlando" etc.) never fired.
  "trexcafe": 18,
  "hiltonorlando": 14,
  "seaworldorlando": 6,
  "cityworks": 12,
  "eggsupgrill": 8,
  "amcdisneysprings": 10,
  "amcdineindisneysprings": 10,
  "everglazed": 8,
  "kbob": 12,
  "kbop": 12,
  "safariwilderness": 16,
  "safariwildernessranch": 16,
  "girafferanch": 16,
  "wildbillsairboattours": 15,
  "wildbillsairboat": 15,
  "piratesdinneradventure": 8,
  "wonderworks": 8,
  "gatorland": 12,
  "dinosaurworld": 14,
  "legolandflorida": 10,
  "legoland": 10,
  "peppapigthemepark": 12,
  "sealife": 8,
  "boggycreekairboat": 13,
  "boggycreekairboatadventures": 13,
  "dezerlandpark": 12,
  "chocolatekingdom": 12,
};
// Owner-curation signals from the Supabase place_signals view: just the
// place_ids the owner account has liked. Owner likes boost globally (+4,
// below WAYFIND_FEATURED tiers so deliberate curation still outranks a tap).
// Community likes carry zero rank weight by design. Money never touches rank.
const SIGNALS = { map: {}, loaded: false };
function communityBoost(p) {
  if (!p || !p.id) return 0;
  return SIGNALS.map[p.id] ? 4 : 0;
}
const _wfNorm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const CURATED_BY_NAME = new Map(CURATED.map((c) => [_wfNorm(c.name), c]));
const curatedFor = (p) => CURATED_BY_NAME.get(_wfNorm(p && p.name));
// v4.83: curated picks stay injectable out to 45 mi even though lists open at
// the 17-mi default — the owner's promise is that tagged picks always compete,
// and every card labels its distance so nothing is hidden.
const CURATED_REACH_MI = 45;
// v4.85 — adaptive radius. A fixed 17-mile ring starves sparse markets like
// Parrish, where the good places sit 18-24 miles out: lists went empty and
// sheets showed "Not enough data" while real places existed a few miles past
// the ring. Every surface still STARTS at 17, but auto-widens 30 → 45 → 60
// until at least ADAPT_MIN usable places exist, then stops. Distance is
// always labeled per card; manual radius choices always win over auto.
const RADIUS_LADDER_M = [27359, 48280, 72420, 96560]; // 17 → 30 → 45 → 60 mi
const ADAPT_MIN = 8;
function featuredBoost(name) {
  const n = wfNorm(name);
  if (!n) return 0;
  if (WAYFIND_FEATURED[n] != null) return WAYFIND_FEATURED[n];
  for (const k in WAYFIND_FEATURED) { if ((k.length >= 6 && n.startsWith(k)) || (n.length >= 8 && k.startsWith(n))) return WAYFIND_FEATURED[k]; }
  const _g = Gems.gemFor(name); if (_g) return (_g.boost != null ? _g.boost : 2); // gems nudge, never override earned rank
  return 0;
}
// On-device taste profile: every meaningful interaction with a place bumps its
// type; the map Top 10 reweights toward what this user actually engages with.
// Local-only (per user, per device); capped so taste tailors, never hijacks.
function tasteBump(place) {
  try { const k = String((place && place.type) || "").slice(0, 30); if (!k) return; const t = JSON.parse(localStorage.getItem("wf_taste_v1") || "{}"); t[k] = Math.min(99, (t[k] || 0) + 1); localStorage.setItem("wf_taste_v1", JSON.stringify(t)); } catch (e) {}
}

// v1.8: hard category gate for intent-specific meal searches. A breakfast search
// must not surface generic "Food" places with no breakfast evidence. Evidence is
// read from Google types and the venue name. If gating leaves fewer than 5
// results (sparse area), fall back to the ungated list rather than showing an
// empty screen; the conditions ranking still favors open + meal-time fit.
const MEAL_GATE_RE = {
  breakfast: /breakfast|brunch|cafe|caf\u00e9|coffee|bakery|diner|pancake|waffle|donut|doughnut|biscuit|bagel|crepe|creperie|juice/,
  coffee: /coffee|cafe|caf\u00e9|espresso|roaster|tea ?house|bakery|juice/,
};
function mealGate(list, subId) {
  const re = MEAL_GATE_RE[subId];
  if (!re) return list;
  const g = (list || []).filter((p) => re.test((((Array.isArray(p.types) ? p.types.join(" ") : "") + " " + (p.type || "") + " " + (p.name || ""))).toLowerCase()));
  return g.length >= 5 ? g : list;
}

// v6.25: founder-curated "note from Wayfind" for specific properties. Hand-written insider
// knowledge, not scraped or AI. Keyed by the normalized venue name, with an optional
// coordinate gate so a same-named property elsewhere never picks up the wrong note.
const CURATED_NOTES = {
  hiltonorlando: {
    match: { lat: 28.4270, lng: -81.4693, radiusMi: 2.5 },
    title: "A note from Wayfind",
    intro: "From a recent stay, the things worth knowing before you book.",
    items: [
      { icon: "🅿️", head: "Parking is not included", body: "Plan for it. Self and valet are both extra on top of the room rate." },
      { icon: "💆", head: "Book the eforea Spa and your valet is covered", body: "A spa booking gets your valet validated at the spa. Valet runs about $50 on its own, so the visit effectively pays for your parking that day." },
      { icon: "💳", head: "Bring a Hilton Honors Amex, Gold status pays off", body: "Gold members get the daily food and beverage credit, $15 per guest, plus a complimentary room upgrade when one is available." },
      { icon: "🌇", head: "Pick your side for the view", body: "The north side, away from the pool, faces the theme parks. The pool side looks toward SeaWorld and has the best seat for the fireworks." },
      { icon: "🎆", head: "Fireworks from the pool side", body: "SeaWorld's Ignite fireworks and drone show typically starts around 9:00 PM on select summer nights, mostly Fridays and Saturdays through early September. Times shift, so check the SeaWorld app the day of." },
    ],
  },
};
function curatedNote(p) {
  if (!p || !p.name) return null;
  const note = CURATED_NOTES[wfNorm(p.name)];
  if (!note) return null;
  if (note.match && p.lat != null && p.lng != null) {
    const dLat = p.lat - note.match.lat, dLng = p.lng - note.match.lng;
    const approxMi = Math.sqrt(dLat * dLat + dLng * dLng) * 69;
    if (approxMi > (note.match.radiusMi || 3)) return null;
  }
  return note;
}

// v4.78 — Hidden Gems must be discoveries, never chains. Name-based because
// Google types can't tell an indie diner from a franchise.
const GEM_CHAIN_RX = /mcdonald|burger king|taco bell|wendy'?s|kfc\b|subway\b|dunkin|starbucks|chick.?fil.?a|chipotle|panera|five guys|domino'?s|pizza hut|papa john|little caesar|olive garden|applebee|chili'?s|outback|ihop\b|denny'?s|cracker barrel|red lobster|texas roadhouse|buffalo wild wings|hooters|dairy queen|sonic drive|arby'?s|popeyes|jersey mike|jimmy john|firehouse subs|panda express|walmart|target\b|publix|costco/i;

const EXPERIENCES = {
  // v4.78 — the four intent vibes. Each fires several location-based searches
  // in parallel (multi-query loader below), merges + dedupes, then ranks with
  // the standard engine. Curated places tagged with a vibe always pass its
  // filter (curated-aware filter in the experience-loading effect).
  // v5.25 — Outside is a mood tile and MUST include real beaches: 30-mi start
  // radius (the Gulf beaches sit 15-25 mi from inland towns like Parrish and
  // were dying at the 17-mi edge), a dedicated public-beach query, and a
  // water-venue boost so beaches rank at the top when the weather is genuinely
  // beach weather (and still stay present when it isn't).
  outdoors: { icon: "🌳", label: "Great Outdoors", title: "The Great Outdoors", mood: true, radius: 48280, lead: "Beaches, parks, trails, gardens, farms, food-truck parks, markets, festivals and waterfront near you.", queries: [{ cat: "beach", keyword: "" }, { cat: "beach", keyword: "public beach" }, { cat: "attractions", keyword: "parks" }, { cat: "attractions", keyword: "botanical garden" }, { cat: "attractions", keyword: "nature trails preserve" }, { cat: "attractions", keyword: "farm u-pick orchard" }, { cat: "food", keyword: "food truck park food trucks" }, { cat: "shopping", keyword: "farmers market" }, { cat: "attractions", keyword: "outdoor festival community event" }, { cat: "attractions", keyword: "national monument landmark" }, { cat: "attractions", keyword: "waterfront boardwalk pier" }], boost: (p, w) => { const v = Ranking.venueLean(p); if (!v.water) return 0; const felt = w ? (w.feels != null ? w.feels : w.temp) : null; const good = w && !w.wet && !(w.rain != null && w.rain >= 55) && !/storm|rain|shower/i.test(w.label || "") && felt != null && felt >= 62 && felt <= 98; return good ? 22 : 8; }, filter: (p) => { const v = Ranking.venueLean(p); if (v.water || v.lean === "outdoor") return true; return /food.?truck|farmers.?market|u.?pick|\bfarm\b|festival|fairground|monument|landmark|boardwalk|\bpier\b/i.test((p.name || "") + " " + (p.types || []).join(" ")); } },
  hiddengems: { icon: "💎", label: "Hidden Gems", title: "Hidden Gems Near You", mood: true, lead: "The spots locals keep to themselves — hidden restaurants, secret beaches, speakeasies and one-off finds.", viator: true, viatorMode: "gems", queries: [{ cat: "food", keyword: "hidden gem restaurant" }, { cat: "beach", keyword: "secret hidden" }, { cat: "nightlife", keyword: "speakeasy" }, { cat: "food", keyword: "unique cafe" }, { cat: "attractions", keyword: "off the beaten path" }, { cat: "attractions", keyword: "instagrammable unique spot" }, { cat: "attractions", keyword: "unique experience" }], filter: (p) => p.rating >= 4.6 && (p.reviews || 0) >= 50 && (p.reviews || 0) <= 3000 && !GEM_CHAIN_RX.test(p.name || "") },
  bucketlist: { icon: "✨", label: "Bucket List", title: "Bucket List", lead: "Memory-for-life experiences: theme parks, iconic local traditions, one-of-a-kind adventures and top attractions.", radius: 110000 /* worth-the-drive class: intentionally wider than the 17-mi default */, viator: true, queries: [{ cat: "attractions", keyword: "amusement theme park" }, { cat: "attractions", keyword: "" }, { cat: "attractions", keyword: "iconic landmark tradition" }, { cat: "attractions", keyword: "once in a lifetime adventure" }, { cat: "attractions", keyword: "unique activity tour" }], filter: (p) => p.rating >= 4.5 && (p.reviews || 0) >= 100 },
  familyfun: { icon: "👨‍👩‍👧", label: "Family Fun", title: "Family Fun", mood: true, lead: "Kid-approved and pet-friendly: attractions, splash pads, playgrounds, museums, shows, zoos and aquariums.", queries: [{ cat: "attractions", keyword: "family" }, { cat: "attractions", keyword: "kids activities" }, { cat: "attractions", keyword: "splash pad playground park" }, { cat: "attractions", keyword: "children's museum" }, { cat: "attractions", keyword: "zoo aquarium" }, { cat: "attractions", keyword: "library kids events story time" }, { cat: "attractions", keyword: "kids theater family show movie" }, { cat: "attractions", keyword: "pet friendly dog park" }], filter: (p) => { const t = (p.types || []).join(" "); if (/night_club|casino|liquor_store|\bbar\b/.test(t)) return false; return (p.rating || 0) >= 4.2; } },
  // v4.80 — Fun with Friends. queries is a FUNCTION so the mix follows the
  // time of day: daytime leans beach and active group fun, evenings lean
  // bars, clubs, karaoke and live music. cat/keyword are the single-query
  // fallback used by the moment-builder sheet path.
  friends: { icon: "🎉", label: "Fun with Friends", title: "Fun With Friends", lead: "The group's night (or day) out: beaches, bars, karaoke, clubs, live music and big fun activities.", cat: "attractions", keyword: "fun things to do", viator: true, queries: () => { const h = new Date().getHours(); const night = h >= 17 || h < 4; return night
    ? [{ cat: "nightlife", keyword: "" }, { cat: "nightlife", keyword: "karaoke" }, { cat: "nightlife", keyword: "night club dance" }, { cat: "attractions", keyword: "live music concert venue" }, { cat: "nightlife", keyword: "comedy club" }, { cat: "attractions", keyword: "bowling arcade games group fun" }, { cat: "food", keyword: "brewery beer garden" }]
    : [{ cat: "beach", keyword: "" }, { cat: "attractions", keyword: "fun group activities adventure" }, { cat: "attractions", keyword: "mini golf go-kart bowling arcade" }, { cat: "food", keyword: "food truck park brewery beer garden" }, { cat: "nightlife", keyword: "karaoke bar" }, { cat: "attractions", keyword: "live music venue" }]; },
    filter: (p) => (p.rating || 0) >= 4.2 },
  // v5.22 — "Right place, right moment" mood vibes. mood:true marks them for
  // the Perfect-right-now LLM reasoning layer; filtering stays 100% in the
  // structured engine (junk gate, quality floor, open-now, distance).
  datenight: { icon: "🌹", label: "Date Night", title: "Date Night", mood: true, lead: "Romantic, intimate, made for two: candlelit dinners, wine bars, sunset views and after-dark charm.", viator: true, queries: () => { const h = new Date().getHours(); const eve = h >= 15 || h < 4; return eve
    ? [{ cat: "food", keyword: "romantic dinner intimate" }, { cat: "nightlife", keyword: "wine bar cocktail lounge" }, { cat: "food", keyword: "waterfront dinner sunset views" }, { cat: "food", keyword: "date night restaurant" }, { cat: "attractions", keyword: "scenic sunset spot" }]
    : [{ cat: "food", keyword: "romantic cafe brunch" }, { cat: "attractions", keyword: "botanical garden scenic walk" }, { cat: "food", keyword: "wine tasting winery" }, { cat: "food", keyword: "romantic restaurant" }]; },
    filter: (p) => (p.rating || 0) >= 4.3 && !/fast_food|meal_takeaway|chicken_wings/.test(((p.types || []).join(" "))) },
  nightout: { icon: "🍸", label: "Night Out", title: "Night Out", mood: true, lead: "Bars, live music, dance floors and late kitchens — where tonight actually happens.", queries: [{ cat: "nightlife", keyword: "" }, { cat: "nightlife", keyword: "live music" }, { cat: "nightlife", keyword: "craft cocktail bar" }, { cat: "nightlife", keyword: "dance club" }, { cat: "food", keyword: "late night eats" }], filter: (p) => (p.rating || 0) >= 4.2 },
  eatnow: { icon: "🍽️", label: "Where to Eat", title: "Where to Eat Right Now", mood: true, lead: "The best food for this exact hour, ranked honestly — no ads, no paid placement.", queries: () => { const h = new Date().getHours(); const wknd = [0, 6].includes(new Date().getDay());
    if (h < 11) return wknd ? [{ cat: "food", keyword: "brunch" }, { cat: "food", keyword: "breakfast" }, { cat: "food", keyword: "bakery coffee" }] : [{ cat: "food", keyword: "breakfast" }, { cat: "food", keyword: "bakery coffee" }, { cat: "food", keyword: "brunch" }];
    if (h < 15) return [{ cat: "food", keyword: "lunch" }, { cat: "food", keyword: "" }, { cat: "food", keyword: "quick casual eats" }];
    if (h < 21) return [{ cat: "food", keyword: "dinner" }, { cat: "food", keyword: "" }, { cat: "food", keyword: "seafood steak" }];
    return [{ cat: "food", keyword: "late night food" }, { cat: "nightlife", keyword: "kitchen open late bar food" }, { cat: "food", keyword: "" }]; },
    filter: (p) => (p.rating || 0) >= 4.2 },
  cozyindoor: { icon: "🌧️", label: "Cozy Indoor", title: "Cozy Indoor Day", mood: true, lead: "Rain-proof plans: museums, cafés, aquariums, arcades and indoor fun.", queries: [{ cat: "attractions", keyword: "museum" }, { cat: "food", keyword: "cozy cafe coffee" }, { cat: "attractions", keyword: "aquarium" }, { cat: "attractions", keyword: "bowling arcade indoor fun" }, { cat: "attractions", keyword: "art gallery" }, { cat: "shopping", keyword: "indoor shopping mall" }], filter: (p) => { const t = (p.types || []).join(" "); if (/beach|natural_feature|trail|marina|pier|campground/.test(t) && !/museum|aquarium|gallery|bowling|arcade|mall|cafe|movie/.test(t)) return false; return (p.rating || 0) >= 4.2; } },
  brunch: { icon: "🥞", label: "Brunch", title: "Weekend Brunch", mood: true, lead: "Weekend-morning worthy: brunch plates, pastries and patio coffee.", queries: [{ cat: "food", keyword: "brunch" }, { cat: "food", keyword: "breakfast" }, { cat: "food", keyword: "bakery pastries coffee" }], filter: (p) => (p.rating || 0) >= 4.3 },
  gem:       { icon: "💎", label: "Hidden gem",      title: "Hidden Gems",      cat: "food",      lead: "The quietly excellent places most people walk right past.", filter: (p) => p.rating >= 4.6 && p.reviews >= 40 && p.reviews <= 600 },
  value:     { icon: "💰", label: "Great value",     title: "Great Value",      cat: "food",      keyword: "affordable cheap eats", lead: "Genuinely good food that does not cost a fortune.", filter: (p) => p.rating >= 4.2 && (p.priceNum == null || p.priceNum <= 2) },
  localfav:  { icon: "⭐", label: "Crowd favorite",  title: "Top Rated Near You",  cat: "food",      lead: "Highly rated nearby spots with strong review volume, ranked by fit.", filter: (p) => p.rating >= 4.6 && p.reviews >= 800 },
  featured:  { icon: "🏅", label: "Featured",       title: "Featured picks",   cat: "food",      lead: "Spots we are highlighting near you.", filter: (p) => featuredBoost(p.name) > 0 },
  bestof:    { icon: "🏆", label: "Best of Sarasota", title: "Best of Sarasota", cat: "food", lead: "The local institutions people here name among the best, now in Wayfind.", filter: (p) => isBestOf(p.name) },
  waterfront:{ icon: "🌊", label: "Waterfront",      title: "On the Water",     cat: "food",      keyword: "waterfront", lead: "Tables with the water in view." },
  rooftop:   { icon: "🌆", label: "Rooftop",         title: "Rooftop Spots",    cat: "nightlife", keyword: "rooftop", lead: "Drinks and a view from up top." },
  romantic:  { icon: "💕", label: "Romantic",        title: "Date Night",       cat: "food",      keyword: "romantic restaurant", lead: "Low light, good wine, and a table for two." },
  livemusic: { icon: "🎵", label: "Live music",      title: "Live Music",       cat: "nightlife", keyword: "live music", lead: "Where the night comes with a soundtrack." },
  outdoor:   { icon: "🌳", label: "Outdoor",         title: "Outdoor Dining",   cat: "food",      keyword: "outdoor seating patio", lead: "Patios, courtyards, and tables in the open air." },
  groups:    { icon: "🎉", label: "Great for groups", title: "Great for Groups", cat: "food",     lead: "Room for the whole crew without the side-eye.", filter: (p) => (p.labels || []).includes("Good for groups") },
  dog:       { icon: "🐶", label: "Dog friendly",    title: "Dog Friendly",     cat: "food",      lead: "Bring the dog. Everyone is welcome here.", filter: (p) => (p.labels || []).includes("Dog friendly") },
  family:    { icon: "👨‍👩‍👧", label: "Best for families", title: "Best for Families", cat: "attractions", keyword: "family theme park attractions things to do kids", lead: "Theme parks, animal encounters, and the fun stuff, easy with kids and good for the grownups too." },
  instagram: { icon: "📸", label: "Instagrammable",   title: "Most Photogenic",   cat: "attractions", keyword: "scenic photo spots views", lead: "The spots worth stopping for the picture." },
  cocktails: { icon: "🍸", label: "Cocktails",       title: "Cocktail Bars",    cat: "nightlife", keyword: "cocktails", lead: "Proper drinks, made with care." },
  wine:      { icon: "🍷", label: "Wine",            title: "Wine Spots",       cat: "nightlife", keyword: "wine bar", lead: "A good list and a quiet pour." },
  beer:      { icon: "🍺", label: "Great beer",      title: "Beer & Breweries", cat: "nightlife", keyword: "brewery craft beer", lead: "Cold taps and a proper pour." },
  sports:    { icon: "📺", label: "Sports",          title: "Sports Bars",      cat: "nightlife", keyword: "sports bar", lead: "Big screens, cold beer, game on." },
  coffee:    { icon: "☕", label: "Coffee",          title: "Coffee Shops",     cat: "food",      keyword: "coffee shop", lead: "Where the day starts and the laptops open." },
  breakfast: { icon: "🍳", label: "Breakfast & brunch", title: "Breakfast & Brunch", cat: "food",   keyword: "breakfast brunch", lead: "The most important meal, done right." },
  pizza:     { icon: "🍕", label: "Pizza",           title: "Best Pizza",       cat: "food",      keyword: "pizza", lead: "Slices and pies worth the napkins." },
  sushi:     { icon: "🍣", label: "Sushi",           title: "Best Sushi",       cat: "food",      keyword: "sushi", lead: "Fresh fish and a steady hand." },
  steak:     { icon: "🥩", label: "Steakhouse",      title: "Steakhouses",      cat: "food",      keyword: "steakhouse", lead: "For when only a great steak will do." },
  seafood:   { icon: "🦐", label: "Seafood",         title: "Best Seafood",     cat: "food",      keyword: "seafood", lead: "Straight from the water to the table." },
  burgers:   { icon: "🍔", label: "Burgers",         title: "Best Burgers",     cat: "food",      keyword: "burgers", lead: "The honest, messy, great American burger." },
  mexican:   { icon: "🌮", label: "Mexican",         title: "Mexican",          cat: "food",      keyword: "mexican", lead: "Tacos, salsa, and everything around them." },
  italian:   { icon: "🍝", label: "Italian",         title: "Italian",          cat: "food",      keyword: "italian", lead: "Pasta, red sauce, and a little romance." },
  dessert:   { icon: "🍰", label: "Bakery & sweets", title: "Bakery & Sweets",  cat: "food",      keyword: "bakery dessert", lead: "Warm bread, pastries, cakes, and the good stuff." },
  museum:    { icon: "🏛️", label: "Museum",          title: "Museums & Galleries", cat: "attractions", keyword: "museum gallery", lead: "Indoor culture worth setting time aside for." },
  nature:    { icon: "🌿", label: "Nature & trails",  title: "Nature & Trails",  cat: "attractions", keyword: "nature preserve park trails", lead: "Open air, trails, and room to breathe." },
  entertainment: { icon: "🎢", label: "Attractions & fun", title: "Attractions & Things to Do",  cat: "attractions", keyword: "attractions things to do", lead: "The theme parks, tours, and can't-miss stops for a full day out." },
  stays:     { icon: "🏨", label: "Hotels & stays",  title: "Hotels & Stays",   cat: "attractions", keyword: "hotels resorts lodging", lead: "Places to stay, from resorts to easy overnight picks." },
  shows:     { icon: "🎭", label: "Shows & tickets", title: "Shows & Live Events", cat: "attractions", keyword: "shows theater dinner show live", lead: "Dinner shows, theater, and live entertainment worth booking." },
  budget:    { icon: "🪙", label: "On a budget",     title: "Great on a Budget", cat: "attractions", keyword: "free cheap affordable things to do", lead: "Big fun that goes easy on the wallet." },
};

// ── PROTECTED: revenue hero cards (locked by scripts/check-cards.mjs) ──────
// Rules that must never regress:
//  (1) Copy is location-neutral: the city is passed in, never hardcoded.
//  (2) All five cards open the themed Best-of style sheet, never the legacy
//      experience screen.
//  (3) Their lists fetch their own wide-radius results (attractions/hotels an
//      hour out must appear), independent of the food-heavy local pool.
let CITY_NOW = "you";
function cityFixM(s) { return String(s || "").replace(/Best of Sarasota/g, "Best of " + CITY_NOW); }
// v4.60 PROTECTED (check-ux.mjs): the first-time "moment builder". Each chip
// maps to a REAL engine capability — no promise the ranking cannot keep.
const MOMENT_CHIPS = [
  { id: "family", icon: "\u{1F46A}", label: "I'm with my family" },
  { id: "date", icon: "\u{1F495}", label: "I'm on a date" },
  { id: "friends", icon: "\u{1F389}", label: "I'm with friends" },
  { id: "twohrs", icon: "\u23F1\uFE0F", label: "I only have 2 hours" },
  { id: "outside", icon: "\u2600\uFE0F", label: "I want to be outside" },
  { id: "locals", icon: "\u{1F48E}", label: "I want something locals know" },
  { id: "drive", icon: "\u{1F697}", label: "Up to 1 hour away" },
  { id: "fifty", icon: "\u{1F4B5}", label: "Under $50" },
  { id: "visitors", icon: "\u{1F9F3}", label: "I'm showing visitors around" },
  { id: "rainy", icon: "\u{1F327}\uFE0F", label: "It's raining (or too hot)" },
  { id: "surprise", icon: "\u{1F3B2}", label: "Surprise me" },
];

// v4.75: chips render in priority groups so the eye knows where to start.
// v4.79: "Time & budget" removed from the intro by product direction — the
// popup must not fill a phone screen. The twohrs/fifty/drive chips stay in
// MOMENT_CHIPS: composeMoment and feelingToMoment still use them ("I have
// $50", "I only have 2 hours" typed as searches keep working).
const MOMENT_GROUPS = [
  { label: "Who's going", ids: ["family", "date", "friends", "visitors"] },
  { label: "The vibe", ids: ["outside", "locals", "rainy", "surprise"] },
];
// v4.70 — feelings are queries. "I'm bored" and "somewhere relaxing" must
// work as searches; each maps to Moment chips so the whole filter engine
// (radius, price, open-now, indoor) does the heavy lifting.
function feelingToMoment(q) {
  const x = " " + String(q || "").toLowerCase().trim() + " ";
  if (/(^|\s)(i'?m\s+)?bored|nothing to do/.test(x)) return ["surprise"];
  if (/relax|unwind|chill(?!i)|need a break|peaceful|quiet time/.test(x)) return ["outside"];
  if (/kids? .*(crazy|driving me)|with (my |the )?kids|family (day|time|fun)/.test(x)) return ["family"];
  if (/on a date|date night|romantic (spot|dinner|place|night)/.test(x)) return ["date"];
  if (/i('| ha)?ve?( got)? \$\d{1,3}\b|i('| ha)?ve?( got)? \d{1,3} (bucks|dollars)\b|\$\d{1,3} (budget|to spend)|cheap (date|night|fun)/.test(x)) return ["fifty"];
  if (/i('| ha)?ve?( got| only have)? (\d+ ?(min|minutes|hours?|hrs?)|an hour)|(90|60|120) min/.test(x)) return ["twohrs"];
  if (/rain(y|ing)?|too hot|indoor (day|stuff|ideas)/.test(x)) return ["rainy"];
  if (/unforgettable|blow (my|our) mind|something (amazing|special|memorable)/.test(x)) return ["surprise"];
  if (/never heard of|somewhere new|locals (know|go|only)/.test(x)) return ["locals"];
  if (/showing (someone|visitors|friends) around|visitors? in town|tourist for a day/.test(x)) return ["visitors"];
  return null;
}
function composeMoment(sel, city) {
  const has = (k) => sel.includes(k);
  if (has("surprise")) return { surprise: true };
  const base = has("family") ? "family" : has("date") ? "romantic" : has("friends") ? "friends" : has("visitors") ? "entertainment" : has("locals") ? "gem" : has("outside") ? "nature" : has("fifty") ? "budget" : "entertainment";
  const spec = { base };
  // v4.80: friends = fun, steered by the time of day. Days lean beach/active,
  // evenings lean bars, karaoke, clubs and live music.
  if (base === "friends") { const _h = new Date().getHours(); spec.extraKeyword = _h >= 17 || _h < 4 ? "bars karaoke live music" : "fun group activities"; }
  if (has("twohrs")) { spec.radiusOverride = 24000; spec.openNowOnly = true; }
  if (has("drive")) spec.radiusOverride = 110000;
  if (has("fifty")) spec.priceMax = 2;
  if (has("outside") && base !== "nature") spec.extraKeyword = "outdoor";
  if (has("rainy")) { spec.indoorOnly = true; if (base === "entertainment") spec.extraKeyword = ((spec.extraKeyword || "") + " indoor").trim(); }
  const names = { family: "Family day", romantic: "Date night", friends: "Fun with friends", bestof: "Best of", gem: "Local gems", nature: "Time outside", budget: "Big fun, small budget", entertainment: "Things to do" };
  spec.title = (has("visitors") || base === "bestof") ? ("Best of " + city) : (names[base] + " near " + city);
  spec.body = ["Your curated list is ready \u2014 ranked for right now", has("twohrs") ? "open now, close by" : null, has("drive") ? "worth the drive" : null, has("fifty") ? "easy on the wallet" : null, has("rainy") ? "indoor picks" : null].filter(Boolean).join(" \u00b7 ");
  return spec;
}
const REVENUE_EXP_KEYS = ["family", "entertainment", "stays", "shows", "budget"];
function revenueExpMeta(key, city) {
  const M = {
    family:        { accent: C.green,  hook: "The days out the kids will not stop talking about.", hl: "kids", sub: "Best family picks near " + city, cta: "See family picks \u2192" },
    entertainment: { accent: C.purple, hook: "The can't-miss stops that make the trip.", hl: "can't-miss", sub: "Attractions and things to do near " + city, cta: "See attractions \u2192" },
    stays:         { accent: C.blue,   hook: "Where to stay near everything you came for.", hl: "stay", sub: "Compare rates near " + city + ", book in a tap", cta: "Find a stay \u2192" },
    shows:         { accent: C.pink,   hook: "Live shows worth planning the night around.", hl: "shows", sub: "Live entertainment near " + city, cta: "See shows \u2192" },
    budget:        { accent: C.gold,   hook: "Big fun that goes easy on the wallet.", hl: "wallet", sub: "Free and cheap favorites near " + city, cta: "See budget picks \u2192" },
  };
  return M[key] || null;
}

// Run a place through the FULL badge engine, not just the badge a user tapped.
// Every qualifying badge is found from real Google data (rating, review volume,
// price, the place name, and Google attribute flags), sorted by how defining it
// is, and capped. selectedKey, when set, is always shown first so a curated page
// never hides the reason a place is on it. Nothing is fabricated.
function experienceBadges(p, selectedKey, max, audit) {
  const lim = max || 3;
  const L = p.labels || [];
  const nm = (p.name || "").toLowerCase();
  const q = new Set();
  const hint = (HINTS[p.id] || "").toLowerCase();
  const said = (arr) => arr.some((w) => nm.includes(w) || hint.includes(w));

  // Reputation, computed from rating and review volume and price.
  if (p.rating >= 4.6 && p.reviews >= 800) q.add("localfav");
  if (p.rating >= 4.5 && p.reviews >= 2500) q.add("localfav");
  // v6.22: curated local favorites also earn the badge, matched by name (see faveTier). Editorially recognized ones get "bestof".
  if (isLocalFave(p.name)) q.add("localfav");
  if (isBestOf(p.name)) q.add("bestof");
  if (p.rating >= 4.4 && p.reviews >= 15 && p.reviews < 800) q.add("gem");
  if (p.rating >= 4.2 && p.priceNum != null && p.priceNum <= 2) q.add("value");

  // Setting, read from the place name and (for prefetched places) its
  // description and reviews. Honest text evidence, never invented.
  if (said(["waterfront", "riverfront", "river roo", "riverwalk", "on the river", "bayfront", "beachfront", "lakefront", " pier", "wharf", "dockside", "marina", "boathouse", "fish house", "on the bay", "on the water"])) q.add("waterfront");
  if (said(["rooftop", "roof top", "sky bar", "skybar", "skyline"])) q.add("rooftop");
  if (said(["romantic", "date night", "intimate", "candlelit", "special occasion"])) q.add("romantic");
  if (said(["instagram", "instagrammable", "photo spot", "photogenic", "aesthetic", "scenic", "great views", "amazing views", "beautiful views", "stunning views", "picturesque", "mural"])) q.add("instagram");

  // Attractions: zoos, aquariums, parks and theme parks are honestly family
  // and outdoor places even when Google sets no restaurant-style attribute.
  const ts = (p.types || []).join(" ").toLowerCase();
  const tokens = (p.types || []).map((x) => String(x).toLowerCase());
  if (["zoo", "aquarium", "amusement_park", "water_park", "theme_park"].some((x) => ts.includes(x))) q.add("family");
  if (tokens.some((x) => ["zoo", "national_park", "state_park", "botanical_garden", "campground", "beach", "park", "garden", "rv_park", "hiking_area"].includes(x))) q.add("outdoor");
  // v6.8: type-true tags so museums, preserves, landmarks and scenic spots stop defaulting to "local favorite".
  if (["museum", "art_gallery"].some((x) => ts.includes(x)) || said(["museum", "gallery"])) q.add("museum");
  if (tokens.some((x) => ["national_park", "state_park", "natural_feature", "botanical_garden", "campground", "hiking_area", "park", "garden"].includes(x)) || said(["preserve", "nature trail", "trailhead"])) q.add("nature");
  if (["amusement_park", "theme_park", "water_park", "bowling_alley", "movie_theater", "aquarium", "zoo"].some((x) => ts.includes(x))) q.add("entertainment");
  if (said(["skyway", "overlook", "lookout", "lighthouse", "observation deck"]) || ts.includes("natural_feature")) q.add("instagram");

  // Live music and family: real attribute flags OR the text clearly says so.
  if (L.includes("Live music") || said(["live music", "live band", "live bands"])) q.add("livemusic");
  if (L.includes("Kid friendly") || L.includes("Kids menu") || said(["family friendly", "families", "great for kids", "good for kids", "kid friendly"])) q.add("family");
  if (L.includes("Cocktails")) q.add("cocktails");
  if (L.includes("Wine")) q.add("wine");
  if (L.includes("Beer")) q.add("beer");
  if (L.includes("Good for sports")) q.add("sports");
  if (L.includes("Coffee")) q.add("coffee");
  if (L.includes("Breakfast")) q.add("breakfast");
  if (L.includes("Brunch")) q.add("breakfast");
  if (L.includes("Outdoor seating")) q.add("outdoor");
  if (L.includes("Good for groups")) q.add("groups");
  if (L.includes("Dog friendly")) q.add("dog");

  // Cuisine, read from the place's actual cuisine identity (its *_restaurant
  // Google type via Dining.cuisineLabel) or its literal name. Noisy secondary
  // tokens like "cafe"/"bakery" on a full restaurant no longer mint Coffee or
  // Bakery badges; those require it to BE the identity or be name-evident.
  const cz = (Dining.cuisineLabel(p) || "").toLowerCase();
  const CUIS = [["pizza", "pizza"], ["sushi", "sushi"], ["steak", "steak"], ["seafood", "seafood"], ["hamburger", "burgers"], ["burger", "burgers"], ["mexican", "mexican"], ["taco", "mexican"], ["italian", "italian"]];
  for (const [needle, key] of CUIS) { if (cz.includes(needle) || nm.includes(needle)) q.add(key); }
  if (tokens.includes("bakery") && !cz || cz.includes("bakery") || cz.includes("dessert") || /bakery|dessert|donut|doughnut|ice cream|gelato|patisserie|pastry/.test(nm)) q.add("dessert");
  if (tokens.includes("coffee_shop") || (tokens.includes("cafe") && !cz) || cz.includes("coffee") || cz.includes("cafe") || /coffee|café|cafe\b|espresso|roaster/.test(nm)) q.add("coffee");
  if (tokens.some((x) => x.includes("brew")) || /brewery|brewing|brewpub|brew pub|taproom/.test(nm)) q.add("beer");

  const order = ["bestof", "museum", "nature", "entertainment", "waterfront", "instagram", "rooftop", "romantic", "livemusic", "outdoor", "pizza", "sushi", "steak", "seafood", "burgers", "mexican", "italian", "dessert", "cocktails", "wine", "beer", "sports", "coffee", "breakfast", "family", "groups", "dog", "gem", "value", "localfav"];
  let keys = order.filter((k) => q.has(k) && EXPERIENCES[k]);
  // v2.0 trust gate: category compatibility on top of the evidence gates. A tag
  // must pass BOTH to show. Audit (when passed) records the decision trail.
  const identity = Tags.resolveIdentity(p.types || [], !!p._event);
  const gate = Tags.filterAllowed(identity, keys);
  if (audit) { audit.identity = identity; audit.candidates = keys.slice(); audit.blocked = gate.blocked; audit.shown = gate.shown.slice(); }
  keys = gate.shown;
  if (selectedKey && EXPERIENCES[selectedKey]) {
    keys = keys.filter((k) => k !== selectedKey);
    keys.unshift(selectedKey);
  }
  return keys.slice(0, lim).map((k) => ({ key: k, icon: EXPERIENCES[k].icon, label: EXPERIENCES[k].label }));
}

// The main Wayfind section a place belongs to, read from its Google types.
function catOfType(x) {
  x = (x || "").toLowerCase();
  const any = (arr) => arr.some((k) => x.includes(k));
  if (any(["campground", "rv_park"])) return "Activities";
  if (any(["lodging", "hotel", "motel", "resort", "guest_house", "bed_and_breakfast"])) return "Hotels";
  if (any(["restaurant", "food", "cafe", "coffee", "bakery", "meal_", "ice_cream", "deli"])) return "Food";
  if (any(["night_club", "bar", "pub", "brewery", "liquor"])) return "Nightlife";
  if (any(["tourist", "museum", "park", "art_gallery", "amusement", "aquarium", "zoo", "stadium", "landmark", "historical", "beach", "marina", "natural_feature", "theater", "theatre", "performing_arts", "movie", "cinema", "concert", "bowling", "casino", "attraction"])) return "Activities";
  if (any(["store", "shopping", "mall", "market", "shop", "boutique"])) return "Shopping";
  return null;
}
function primaryCategory(p) {
  const ts = (p.types && p.types.length) ? p.types : (p.type ? [p.type.split(" ").join("_")] : []);
  for (const x of ts) { const c = catOfType(x); if (c) return c; }
  return null;
}


// Top 5 ranking medals: 1 gold, 2 silver, 3 to 5 bronze.
// How much to trust the rating, based purely on how many people rated it.
// No invented numbers: it just reads the real review count.
function confidenceOf(reviews) {
  const n = reviews || 0;
  if (n >= 500) return { label: "High confidence", color: "#22C55E" };
  if (n >= 100) return { label: "Medium confidence", color: "#FBBF24" };
  if (n >= 1) return { label: "Low confidence", color: "#94A3B8" };
  return null;
}

function medal(rank) {
  if (rank === 1) return { color: "#FBBF24", emoji: "🥇" };
  if (rank === 2) return { color: "#CBD5E1", emoji: "🥈" };
  if (rank >= 3 && rank <= 5) return { color: "#CD7F32", emoji: "🥉" };
  return null;
}

// Shows a real photo, or a clean branded placeholder if the photo is missing or
// fails to load. Never a broken image icon. onClick only fires on a real photo.
// Premium redesign, Phase 3: the shared image chain — skeleton while loading,
// the image once it decodes, branded artwork if the src is missing or fails.
// Never a blank rectangle or a broken-image glyph. The state decision lives
// in kit.js imageDisplayState() so it's unit-tested independent of the DOM.
function FallbackImg({ src, alt, style, icon, onClick }) {
  const [bad, setBad] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const state = imageDisplayState({ src, errored: bad, loaded });
  if (state === "fallback") return <BrandedImageFallback style={style} />;
  return (
    <div style={{ ...style, position: "relative", overflow: "hidden" }}>
      {state === "skeleton" && <div className="wf-skeleton" style={{ position: "absolute", inset: 0 }} aria-hidden="true" />}
      <img decoding="async" src={src} alt={alt || ""} loading="lazy" draggable={false} onLoad={() => setLoaded(true)} onError={() => setBad(true)} onClick={onClick} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: state === "image" ? 1 : 0, transition: "opacity 180ms ease" }} />
    </div>
  );
}

// v3.9: a home-grid tile backed by a generated image (public/tiles/*.png). If the image
// is missing or fails to load it falls back to the original icon and label tile, so the
// grid never breaks even before the images are uploaded. `overlay` lets the location and
// weather tiles paint live text (city, current conditions) over an intentionally blank frame.
function ImgTile({ src, onClick, overlay, fallback }) {
  const [err, setErr] = useState(false);
  return (
    <button onClick={onClick} style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", minHeight: 82, borderRadius: 14, overflow: "hidden", border: err ? `1px solid ${C.border}` : "none", background: C.card, cursor: "pointer", padding: 0, display: "block" }}>
      {!err && <img src={src} alt="" draggable={false} onError={() => setErr(true)} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
      {!err && overlay}
      {err && <div style={{ width: "100%", height: "100%", minHeight: 82, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: "12px 6px" }}>{fallback}</div>}
    </button>
  );
}

// v4.0: clean home-grid tile in the Pick-a-category style — a thin colored frame, a faint
// matching wash, and the app font. No images, no glow. `icon` takes an emoji or a node (the
// weather tile passes a small <img>); `labelColor` overrides the label color when needed.
function CleanTile({ onClick, color, icon, label, sub, labelColor }) {
  return (
    <button onClick={onClick} style={{ position: "relative", width: "100%", minHeight: 76, borderRadius: 14, cursor: "pointer", padding: "8px 6px", textAlign: "center", border: `1.5px solid ${color}`, background: `linear-gradient(150deg, ${color}26, ${color}0D 72%), ${C.card}`, boxShadow: "0 2px 10px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
      <span style={{ fontSize: 27, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 29 }}>{icon}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: labelColor || color }}>{label}</span>
      {sub && <span style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", padding: "0 2px" }}>{sub}</span>}
    </button>
  );
}

// v4.0: shared sheet header so every app-tile sheet opens with the same hero treatment —
// a colored icon badge that matches its tile, a large title, and a muted subtitle.
function RadiusSlider({ mi, onChange, where, max = 30 }) {
  const pct = Math.round(((mi - 1) / (max - 1)) * 100);
  return (
    <div style={{ padding: "11px 14px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14 }}>
      <style>{`.wf-radius{-webkit-appearance:none;appearance:none;width:100%;height:26px;background:transparent;outline:none;margin:4px 0 2px;cursor:pointer}
.wf-radius::-webkit-slider-runnable-track{height:7px;border-radius:999px;background:linear-gradient(90deg,#FB923C 0%,#F97316 var(--wfp),#2D3748 var(--wfp))}
.wf-radius::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#FFD9B3,#F97316 68%);border:2.5px solid #fff;box-shadow:0 0 0 5px rgba(249,115,22,.22),0 3px 10px rgba(0,0,0,.5);cursor:pointer;margin-top:-10px}
.wf-radius::-moz-range-track{height:7px;border-radius:999px;background:linear-gradient(90deg,#FB923C 0%,#F97316 var(--wfp),#2D3748 var(--wfp))}
.wf-radius::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 32% 30%,#FFD9B3,#F97316 68%);border:2.5px solid #fff;box-shadow:0 0 0 5px rgba(249,115,22,.22),0 3px 10px rgba(0,0,0,.5);cursor:pointer}`}</style>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Within <span style={{ color: C.accent, fontSize: 17 }}>{mi} mi</span></div>
        <div style={{ fontSize: 11.5, color: C.muted }}>of {where}</div>
      </div>
      <input type="range" min={1} max={max} step={1} value={mi} onChange={(e) => onChange(Number(e.target.value))} className="wf-radius" style={{ "--wfp": pct + "%" }} aria-label="Search distance in miles" />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: C.muted, fontWeight: 700 }}>
        {[1, Math.round(max / 4), Math.round(max / 2), Math.round((3 * max) / 4), max].map((t, i) => <span key={i}>{t} mi</span>)}
      </div>
    </div>
  );
}
// v4.25 — Sort & distance dropdown. Lives next to Back in every category
// browse and on the explore list. One control, discoverable, premium.
// v4.27 — Culture, distributed. A one-line area insight at the top of each
// category browse, expanding to the facts, a local phrase, and the rookie
// mistake for that context. Replaces the standalone culture card.
// v4.78 — grounding for town-note named businesses (the Rack City Ribz fix).
// A researched note once presented a closed food truck 15 miles away in
// another town as a local staple. Any TOWN_NOTES item carrying `place` is now
// resolved against live Google data before it renders: it must be found, the
// name must match, it must be OPERATIONAL, and it must sit within ~10 miles
// (~25 with farOk, for items whose story frames the drive honestly).
// Fail-closed: an unverified named business is hidden, never shown as fact.
// Verdicts cache on-device for 7 days so this costs one findPlace per name.
const CULT_STOP = /^(the|and|for|its|it's)$/i;
function cultNameMatch(placeQuery, resultName) {
  const rn = _wfNorm(resultName);
  if (!rn) return false;
  const words = String(placeQuery || "").toLowerCase().split(/[^a-z0-9']+/).filter((w) => w.length >= 3 && !CULT_STOP.test(w));
  const hit = words.filter((w) => rn.includes(_wfNorm(w))).length;
  return hit >= Math.min(2, words.length);
}
async function verifyCulturePlaces(items, center) {
  const CK = "wf_cultground_v1";
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(CK) || "{}"); } catch (e) {}
  const now = Date.now();
  const out = {};
  let dirty = false;
  for (const it of items) {
    const k = it.place;
    const hit = cache[k];
    if (hit && hit.exp > now) { out[k] = !!hit.ok; continue; }
    let good = false;
    try {
      const pl = await findPlace(it.place, center);
      good = !!(pl && cultNameMatch(it.place, pl.name)
        && (!pl.status || pl.status === "OPERATIONAL")
        && (pl.distMi == null || pl.distMi <= (it.farOk ? 25 : 10)));
    } catch (e) {}
    out[k] = good;
    cache[k] = { ok: good, exp: now + 7 * 864e5 };
    dirty = true;
  }
  if (dirty) { try { localStorage.setItem(CK, JSON.stringify(cache)); } catch (e) {} }
  return out;
}
function AreaInsight({ metro, cat, town, center, onFind }) {
  const [openIt, setOpenIt] = useState(false);
  const [grounded, setGrounded] = useState({});
  // v4.84 — the culture card renders on ALL SIX categories. Root cause of it
  // only showing on Food and Beach day: the category menu passes Google
  // category ids (nightlife, attractions, hotels, shopping) but this map only
  // knew the legacy short keys, so four categories never matched a note.
  const map = { food: "food", nightlife: "night", night: "night", attractions: "todo", todo: "todo", hotels: "stays", stays: "stays", beach: "todo", shopping: "shop", shop: "shop", events: "events" };
  const key = map[cat];
  // v4.30: a town with its own researched notes outranks the metro story.
  // v4.82: town notes come from TOWN_PROFILES via townNotesFor (alias-aware —
  // "Holmes Beach" lands on Anna Maria Island). Beach browses prefer the
  // town's real beach note over its things-to-do note.
  const tn = town && Culture.townNotesFor ? Culture.townNotesFor(town) : null;
  const townNote = tn ? ((cat === "beach" && tn.beach) || (key && tn[key]) || null) : null;
  const notes = townNote || (metro && key && Culture.CAT_NOTES[metro] ? Culture.CAT_NOTES[metro][key] : null);
  const c = metro ? Culture.CULTURE[metro] : null;
  const isTown = !!townNote;
  const named = isTown && notes ? (notes.items || []).filter((x) => x.place) : [];
  const namedKey = named.map((x) => x.place).join("|");
  useEffect(() => {
    if (!namedKey || !center) return;
    let cancelled = false;
    verifyCulturePlaces(named, center).then((v) => { if (!cancelled) setGrounded(v); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namedKey, center && center.lat, center && center.lng]);
  if (!notes || !c) return null;
  return (
    <div style={{ margin: "0 0 12px", borderRadius: 14, border: "1px solid rgba(46,204,163,.28)", background: "linear-gradient(135deg, rgba(6,35,30,.55), rgba(11,58,49,.4))", overflow: "hidden" }}>
      <div onClick={() => { const nv = !openIt; setOpenIt(nv); if (nv) { try { logEvent("area_insight", null, { metro, cat: key }); } catch (e) {} } }} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 13px", cursor: "pointer" }}>
        <span style={{ fontSize: 15, lineHeight: "19px" }}>{"\uD83C\uDF3A"}</span>
        <span style={{ flex: 1, fontSize: 12.5, color: "#B9D6CE", lineHeight: 1.45 }}>
          <span style={{ fontWeight: 800, color: "#FFFFFF" }}>{isTown ? town : "Around " + (town && town.toLowerCase() !== c.title.toLowerCase() ? town + " and the " + c.title + " area" : c.title)}: </span>
          {notes.line}
        </span>
        <span style={{ fontSize: 10, color: "#8ED6C4", transform: openIt ? "rotate(180deg)" : "none", transition: "transform .2s", marginTop: 3 }}>{"\u25BC"}</span>
      </div>
      {openIt && (
        <div style={{ padding: "0 13px 13px 37px" }}>
          {(notes.items || []).filter((x) => !isTown || !x.place || grounded[x.place]).map((x, i) => {
            const book = x.viatorUrl ? Aff.viatorDirectUrl(x.viatorUrl) : null;
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#FFFFFF", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span onClick={(e) => { e.stopPropagation(); try { logEvent("insight_find", null, { metro, q: x.name }); } catch (er) {} onFind && onFind(x.query || x.name); }} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(46,201,166,.4)", textUnderlineOffset: 3 }}>{x.name}</span>
                  {book ? <a href={book} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation(); e.preventDefault(); const _live = (e.currentTarget && e.currentTarget.href) || book; try { logEvent("culture_book", null, { metro, q: x.name }); } catch (er) {} openExternal(_live); }} style={{ fontSize: 10, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: "#2EC9A6", color: "#0D1117", textDecoration: "none" }}>Book ↗</a> : null}
                </div>
                <div style={{ fontSize: 11.5, color: "#B9D6CE", lineHeight: 1.45, marginTop: 1 }}>{x.story}</div>
              </div>
            );
          })}
          {notes.say ? <div style={{ fontSize: 11.5, color: "#B9D6CE", marginTop: 9 }}><span style={{ fontWeight: 800, color: "#8ED6C4" }}>Talk local: </span><span style={{ fontWeight: 800, color: "#FFFFFF" }}>{"\u201C"}{notes.say.phrase}{"\u201D"}</span> {"\u2014"} {notes.say.meaning}</div> : null}
          {notes.mistake ? <div style={{ fontSize: 11.5, color: "#B9D6CE", marginTop: 7 }}><span style={{ fontWeight: 800, color: "#F2C14E" }}>Rookie mistake: </span>{notes.mistake}</div> : null}
          {isTown && tn && tn.one ? <div style={{ fontSize: 11.5, color: "#B9D6CE", marginTop: 7 }}><span style={{ fontWeight: 800, color: "#F2C14E" }}>⭐ The one thing: </span>{tn.one}</div> : null}
        </div>
      )}
    </div>
  );
}

function SortControl({ sortBy, onSort, mi, onMi, where, dealsAvailable, dealsOnly, onDeals }) {
  const [openMenu, setOpenMenu] = useState(false);
  const OPTIONS = [["near", "Closest first"], ["rated", "Top rated"], ["price", "Price: low to high"]]; // v4.83: "Best experiences" removed — it duplicated Top rated in practice; "near" is the default everywhere
  const current = (OPTIONS.find(([k]) => k === sortBy) || OPTIONS[0])[1];
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div onClick={(e) => { e.stopPropagation(); setOpenMenu((o) => !o); }} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.card, border: `1px solid ${openMenu ? C.accent : C.border}`, borderRadius: 999, color: C.light, fontWeight: 800, fontSize: 13, cursor: "pointer", padding: "8px 14px" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M6 12h12M10 18h4" /></svg>
        <span>{sortBy === "near" && mi ? `Within ${mi} mi` : current}</span>
        <span style={{ fontSize: 9, color: C.muted, transform: openMenu ? "rotate(180deg)" : "none", transition: "transform .2s" }}>{"\u25BC"}</span>
      </div>
      {openMenu && (
        <>
          <div onClick={() => setOpenMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 39 }} />
          <div style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 40, width: 292, background: "#161B22", border: `1px solid ${C.border}`, borderRadius: 16, boxShadow: "0 16px 44px rgba(0,0,0,.55)", padding: 10 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: C.muted, textTransform: "uppercase", padding: "4px 8px 6px" }}>Sort by</div>
            {OPTIONS.map(([k, lb]) => (
              <div key={k} onClick={() => { onSort(k); }} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderRadius: 10, cursor: "pointer", background: sortBy === k ? "rgba(249,115,22,.12)" : "transparent" }}>
                <span style={{ width: 17, height: 17, borderRadius: "50%", border: `2px solid ${sortBy === k ? C.accent : C.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sortBy === k ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent }} /> : null}</span>
                <span style={{ fontSize: 13.5, fontWeight: sortBy === k ? 800 : 600, color: sortBy === k ? C.text : C.light }}>{lb}</span>
              </div>
            ))}
            {dealsAvailable ? (
              <div onClick={() => onDeals && onDeals(!dealsOnly)} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderRadius: 10, cursor: "pointer" }}>
                <span style={{ width: 17, height: 17, borderRadius: 5, border: `2px solid ${dealsOnly ? C.accent : C.border}`, background: dealsOnly ? C.accent : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#0D1117", fontSize: 11, fontWeight: 900 }}>{dealsOnly ? "\u2713" : ""}</span>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: C.light }}>Deals only</span>
              </div>
            ) : null}
            <div style={{ height: 1, background: C.border, margin: "8px 2px 10px" }} />
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: C.muted, textTransform: "uppercase", padding: "0 8px 7px" }}>Search distance</div>
            <RadiusSlider mi={mi} max={60} onChange={onMi} where={where} />
            <div style={{ fontSize: 10.5, color: C.muted, padding: "7px 8px 2px", lineHeight: 1.4 }}>Widening past your current area pulls in fresh results automatically.</div>
          </div>
        </>
      )}
    </div>
  );
}

function SheetHero({ icon, title, subtitle, color }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: 16, border: `1.5px solid ${color}`, background: `linear-gradient(150deg, ${color}26, ${color}0D 72%), ${C.card}`, fontSize: 28, lineHeight: 1, marginBottom: 11 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.2px", lineHeight: 1.15 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>{subtitle}</div>}
    </div>
  );
}

// v4.4: flat line nav icons in the Wayfind language — no emoji, no red heart. Each takes
// the active or inactive color so the bar stays on-brand and consistent at any state.
// NavIcon (category + nav line-icon set) now lives in components/kit.js so
// every surface shares one icon language — imported at the top of this file.

// v5.61 (audit P0): the sign-in wall shown when a signed-out visitor lands on
// a personal screen (Favorites / Itinerary). The screen content never renders
// behind it; the auth dialog auto-opens. Reuses the one auth source of truth
// (setAuthOpen) — no second auth system.
const AUTH_SCREENS = new Set(["saved", "itinerary"]);
function AuthWall({ label, onSignIn }) {
  return (
    <div style={{ textAlign: "center", padding: "56px 24px", color: C.muted }}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><NavIcon name="saved" color={C.accent} size={40} /></div>
      <strong style={{ display: "block", color: C.text, fontSize: 17 }}>Sign in to view {label}</strong>
      <p style={{ fontSize: 13.5, color: C.muted, maxWidth: 320, margin: "8px auto 18px", lineHeight: 1.55 }}>Sign in to save places, create lists, and plan trips. Your saves sync across all your devices.</p>
      <button onClick={onSignIn} style={{ minHeight: 44, padding: "11px 22px", borderRadius: 12, background: C.accent, border: "none", color: "#0D1117", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>Sign in</button>
    </div>
  );
}

// Branded loading indicator: the Wayfind pin, gently pulsing.
function Loader({ label, size, pad, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: pad || "10px 2px", color: C.muted, fontSize: 13 }}>
      <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={size || 26} /></div>
      {(label || sub) && (
        <span>
          {label}
          {/* v5.32 (audit #2): intelligence is trustworthy when the user can
              see the inputs — the sub-line states the factors being applied. */}
          {sub && <span style={{ display: "block", fontSize: 11, color: C.muted, opacity: 0.85, marginTop: 2 }}>{sub}</span>}
        </span>
      )}
    </div>
  );
}



function Tag({ label, color, dim }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
      color: dim ? C.light : color,
      background: dim ? "transparent" : `${color}22`,
      border: dim ? `1px solid ${C.border}` : "none",
      textTransform: "capitalize", whiteSpace: "nowrap",
    }}>{label}</span>
  );
}

// City-folder icon for the trip planner. Two-letter state code for now; this is
// the single swap point where an SVG state silhouette drops in later.
function StateBadge({ code, size }) {
  const sz = size || 48;
  const has = code && code.length === 2;
  return (
    <div style={{ width: sz, height: sz, borderRadius: sz > 34 ? 12 : 8, background: C.adim, border: `1px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {has
        ? <span style={{ fontSize: Math.round(sz * 0.36), fontWeight: 800, letterSpacing: "0.5px", color: C.accent }}>{code}</span>
        : <span style={{ fontSize: Math.round(sz * 0.42) }}>📍</span>}
    </div>
  );
}

const PRICE_WORD = { 0: "Free", 1: "Inexpensive", 2: "Moderate", 3: "Pricey", 4: "High-end" };
function PriceMeter({ level, word }) {
  if (level == null) return null;
  if (level === 0) return <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>Free</span>;
  // v5.61 (audit P0): render the ACTUAL number of "$" (level 1-4), not a
  // fixed 4-glyph meter with the tier hidden in color — a black-box reviewer
  // (and a colorblind user) read the old meter as "$$$$" on every card,
  // including ones labeled "Inexpensive"/"Moderate".
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: C.green }} aria-label={PRICE_WORD[level]}>{priceGlyphs(level)}</span>
      {word && <span style={{ fontSize: 12, color: C.light }}>{PRICE_WORD[level]}</span>}
    </span>
  );
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatEventDate(dateStr, timeStr) {
  const out = { mo: "", day: "", wd: "", time: "" };
  if (dateStr) {
    const p = dateStr.split("-");
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (!isNaN(d)) { out.mo = MO[d.getMonth()]; out.day = d.getDate(); out.wd = WD[d.getDay()]; }
  }
  if (timeStr) {
    const t = timeStr.split(":");
    let hr = Number(t[0]); const ap = hr >= 12 ? "PM" : "AM"; hr = hr % 12 || 12;
    out.time = `${hr}:${t[1]} ${ap}`;
  }
  return out;
}

// Compass label from degrees (direction the wind/waves come FROM).
function isBeach(p) {
  if (!p) return false;
  const t = (((p.types || []).join(" ")) + " " + (p.type || "")).toLowerCase();
  const n = (p.name || "").toLowerCase();
  return t.includes("beach") || n.includes("beach");
}
// Keyless wind + marine conditions for a beach point, from Open-Meteo. Fail-soft.
async function loadBeachConditions(p) {
  const out = { wind: null, windDir: null, gust: null, waveHeight: null, waveDir: null, wavePeriod: null };
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lng}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=mph&timezone=auto&forecast_days=1`);
    const d = await r.json();
    const c = d && d.current;
    if (c) {
      out.wind = c.wind_speed_10m != null ? Math.round(c.wind_speed_10m) : null;
      out.windDir = c.wind_direction_10m != null ? c.wind_direction_10m : null;
      out.gust = c.wind_gusts_10m != null ? Math.round(c.wind_gusts_10m) : null;
    }
  } catch {}
  try {
    const r2 = await fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${p.lat}&longitude=${p.lng}&current=wave_height,wave_direction,wave_period&timezone=auto`);
    const d2 = await r2.json();
    const c2 = d2 && d2.current;
    if (c2) {
      out.waveHeight = c2.wave_height != null ? c2.wave_height : null;
      out.waveDir = c2.wave_direction != null ? c2.wave_direction : null;
      out.wavePeriod = c2.wave_period != null ? c2.wave_period : null;
    }
  } catch {}
  return out;
}

// Ticketmaster segment and genre to a chip icon, short label, and accent color.
// iconName (v5.55 redesign) is the line-icon key for chrome (badges/section
// heads); the emoji stays as `icon` for the EventArt tile fallback, which is
// large decorative content, not chrome.
function eventSegmentMeta(seg, genre) {
  const s = (seg || "").toLowerCase();
  const g = (genre || "").toLowerCase();
  if (g.includes("comedy")) return { icon: "😂", iconName: "smile", short: "Comedy", color: "#FBBF24" };
  if (s.includes("music")) return { icon: "🎵", iconName: "music", short: "Concert", color: "#F472B6" };
  if (s.includes("sport")) return { icon: "⚾", iconName: "trophy", short: "Sports", color: "#38BDF8" };
  if (s.includes("arts") || s.includes("theatre") || s.includes("theater")) return { icon: "🎭", iconName: "masks", short: "Theater", color: "#FF8A3D" };
  if (s.includes("film")) return { icon: "🎬", iconName: "film", short: "Film", color: "#FBBF24" };
  if (s.includes("family")) return { icon: "👨‍👩‍👧", iconName: "users", short: "Family", color: "#22C55E" };
  if (!s || s.includes("misc") || s.includes("undefined") || s.includes("other")) return { icon: "🎪", iconName: "ticket", short: "Other", color: "#94A3B8" };
  return { icon: "🎪", iconName: "ticket", short: seg || "Other", color: "#94A3B8" };
}

// v5.4: pick the moon image for the current phase; a clouded moon for overcast nights.
function moonImgName(date, cloudy) {
  if (cloudy) return "moon-cloud";
  const map = { "New moon": "moon-new", "Waxing crescent": "moon-waxing-crescent", "First quarter": "moon-first-quarter", "Waxing gibbous": "moon-waxing-gibbous", "Full moon": "moon-full", "Waning gibbous": "moon-waning-gibbous", "Last quarter": "moon-last-quarter", "Waning crescent": "moon-waning-crescent" };
  return map[moonPhase(date).name] || "moon-full";
}
// An honest heads-up derived only from the real numbers already fetched. Not an
// official alert; just a sensible tip when a condition crosses a threshold.
function uvLabel(uv) {
  if (uv == null) return "";
  if (uv >= 11) return "extreme";
  if (uv >= 8) return "very high";
  if (uv >= 6) return "high";
  if (uv >= 3) return "moderate";
  return "low";
}
function isNightNow(w) {
  if (!w) return false;
  const now = Date.now();
  return !!((w.sunsetMs && now > w.sunsetMs) || (w.sunriseMs && now < w.sunriseMs));
}
// v5.01 — severe-weather class for Florida reality: hurricane-force wind gets
// the cyclone, storm conditions with tropical-storm-force wind get the
// tornado/funnel warning icon. Derived from the live numbers, not guesses.
function severeIcon(w) {
  if (!w || w.wind == null) return null;
  if (w.wind >= 74) return "🌀";
  if (w.wind >= 58 && (w.img === "storm" || (w.rain != null && w.rain >= 60))) return "🌪️";
  return null;
}
// v5.01 — THE one truth rule for the CURRENT weather icon, every surface:
// the icon must match the sky right now. Severe wind overrides everything;
// night + clear/partly shows the real moon phase (never a sun after sunset);
// otherwise the condition icon. Header, hourly "Now" tile, and any future
// surface must call this — rendering weather.icon raw is a bug.
function wxIconNow(w) {
  try {
    if (!w) return "🌡️";
    const sev = severeIcon(w);
    if (sev) return sev;
    if (isNightNow(w)) { const im = w.img || ""; if (im === "sunny" || im === "partly") return moonPhase(new Date()).emoji; }
    return w.icon;
  } catch (e) { return (w && w.icon) || "🌡️"; }
}
function weatherAdvisory(w) {
  if (!w) return null;
  if (isNightNow(w)) {
    if (w.rain != null && w.rain >= 40) return { icon: "🌧️", text: "Storms possible tonight. Check radar before a drive, and lean toward covered spots." };
    if (w.feels != null && w.feels >= 88) return { icon: "🥵", text: "Warm, muggy night. Outdoor patios will feel hotter than the number suggests." };
    if (w.wind != null && w.wind >= 20) return { icon: "💨", text: "Breezy after dark. Rooftops and the water will feel gusty." };
    if (w.lo != null && w.lo <= 45) return { icon: "🧥", text: "Cooling off tonight. Grab a layer if you are heading out." };
    return null;
  }
  if (w.rain != null && w.rain >= 60) return { icon: "🌧️", text: "Showers likely today. Worth keeping an indoor backup in mind." };
  if (w.wind != null && w.wind >= 25) return { icon: "💨", text: "Breezy out there. Patios and the beach may be gusty." };
  if (w.uv != null && w.uv >= 8) return { icon: "🧴", text: "Very high UV today. Sunscreen if you'll be out a while." };
  if (w.hi != null && w.hi >= 95) return { icon: "🥵", text: "Hot one today. Hydrate and lean toward shade." };
  if (w.lo != null && w.lo <= 40) return { icon: "🧥", text: "Cool later on. Bring a layer if you're out tonight." };
  return null;
}
function wayfindWeatherTake(w) {
  if (!w) return null;
  const night = isNightNow(w);
  const stormy = (w.rain != null && w.rain >= 40) || w.wet;
  const muggy = (w.feels != null && w.feels >= 88) || (w.dew != null && w.dew >= 70);
  const windy = w.wind != null && w.wind >= 20;
  const hot = w.temp != null && w.temp >= 90;
  const cold = w.temp != null && w.temp <= 50;
  const good = [], avoid = [];
  if (stormy) { good.push("indoor dining", "covered patios", "short drives"); avoid.push("uncovered seating", "long walks", "the beach"); }
  else if (muggy || hot) { good.push("air-conditioned spots", "indoor dining", night ? "late patios" : "early or shaded seating"); avoid.push(night ? "stuffy rooms" : "midday sun", "long walks"); }
  else if (windy) { good.push("sheltered indoor spots", "covered patios"); avoid.push("rooftops", "the open beach"); }
  else if (cold) { good.push("cozy indoor spots", "heated patios"); avoid.push("long stretches outside"); }
  else { good.push("outdoor patios", night ? "rooftop bars" : "a walk", night ? "evening strolls" : "the beach"); }
  return { good: good.slice(0, 3), avoid: avoid.slice(0, 3), night };
}
// v4.8: one-line plain-language "why this, now" for a hero pick. Soft, honest claims only.
function whyNow(p) {
  if (!p) return "";
  let q = "A solid pick";
  if (p.rating != null && p.rating >= 4.6) q = "A local favorite";
  else if (p.rating != null && p.rating >= 4.3) q = "Highly rated";
  let prox = "";
  if (p.distMi != null) prox = p.distMi <= 1 ? " right by you" : p.distMi <= 6 ? " close to you" : " worth the short drive";
  return q + prox + ".";
}
function whatToWear(p, weather) {
  if (!p) return null;
  const t = ((p.type || "") + " " + (Array.isArray(p.types) ? p.types.join(" ") : "")).toLowerCase();
  const pn = p.priceNum;
  let dress;
  if (/beach|park|trail|outdoor|zoo|garden|hik/.test(t)) dress = "Casual and comfortable, with shoes you can walk in.";
  else if (pn === 4 || pn === 3) dress = "An upscale spot — smart casual to dressy fits the room.";
  else if (/bar|pub|brewery|club|night/.test(t)) dress = "Relaxed and casual fits the vibe.";
  else if (pn === 2) dress = "Smart casual is a safe call.";
  else dress = "Casual is fine here.";
  let wx = null;
  if (weather && weather.temp != null) {
    const temp = weather.temp;
    if (weather.wet) wx = `It's ${temp}° and ${(weather.label || "wet").toLowerCase()} out, so bring a layer or umbrella.`;
    else if (temp >= 88) wx = `It's hot at ${temp}°, so keep it light and breathable and bring water.`;
    else if (temp <= 55) wx = `It's chilly at ${temp}°, so layer up.`;
    else wx = `Comfortable ${temp}° out right now.`;
  }
  return { dress, wx };
}

// Category-aware version of the dress card. Keeps "what to wear" only where weather
// or vibe actually matters (beach, outdoor, nightlife). For food it returns a useful
// data-true line from price and meal type instead, since dress advice reads gimmicky
// for a restaurant. Granular Google attributes (groups, cuisine) are not in our data,
// so this stays honest rather than inventing "good for groups, burgers".
function placeVibe(p, weather) {
  if (!p) return null;
  const cat = primaryCategory(p);
  if (cat === "beach" || cat === "attractions" || cat === "nightlife") {
    const w = whatToWear(p, weather);
    return w ? { icon: "👕", title: "What to wear", body: w.dress + (w.wx ? " " + w.wx : "") } : null;
  }
  if (cat === "food") {
    const t = ((p.type || "") + " " + (Array.isArray(p.types) ? p.types.join(" ") : "")).toLowerCase();
    const pn = p.priceNum;
    let lead = "";
    if (/breakfast|brunch/.test(t)) lead = "Good for breakfast and brunch.";
    else if (/coffee|cafe/.test(t)) lead = "An easy spot for coffee and a casual sit.";
    else if (/bakery/.test(t)) lead = "A bakery, good for a quick grab or a treat.";
    else if (/ice_cream|dessert|gelato|frozen_yogurt/.test(t)) lead = "A dessert stop.";
    else if (/fast_food|meal_takeaway/.test(t)) lead = "Quick and casual.";
    else if (pn === 4) lead = "An upscale spot for a special-occasion meal.";
    else if (pn === 3) lead = "A nicer sit-down meal.";
    else if (pn === 2) lead = "An easy meal out.";
    else if (pn === 1) lead = "Casual and budget-friendly.";
    else if (p.rating != null && p.rating >= 4.5) lead = "A consistently well-loved local spot.";
    let extra = "";
    if (/breakfast|brunch|coffee|cafe|bakery|ice_cream|dessert/.test(t)) {
      if (pn === 4) extra = " On the upscale side.";
      else if (pn === 1) extra = " Easy on the wallet.";
    }
    const body = (lead + extra).trim();
    return body ? { icon: "🍽️", title: "Good to know", body } : null;
  }
  return null;
}

// Straight-line miles between two coords. Used to recompute distance from the
// user's real location when a place is opened from a flow that searched around a
// different point (e.g. an event venue searched near the event, not near you).
function miBetween(aLat, aLng, bLat, bLng) {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Recompute open/closed from the stored hours at render time, so the badge is
// honest about *now* and not the moment we fetched. Falls back to the fetched
// snapshot when periods are unavailable, so it can never be worse than before.
function liveOpen(p) {
  try {
    const oh = p && p.oh; const off = p && p.utcOffset;
    if (oh && oh.periods && oh.periods.length && off != null) {
      const d = new Date(Date.now() + off * 60000);
      const cur = d.getUTCDay() * 1440 + d.getUTCHours() * 60 + d.getUTCMinutes();
      for (const per of oh.periods) {
        const o = per.open; if (!o) continue;
        const c = per.close; if (!c) return true;
        const oMin = o.day * 1440 + (o.hour || 0) * 60 + (o.minute || 0);
        const cMin = c.day * 1440 + (c.hour || 0) * 60 + (c.minute || 0);
        if (oMin === cMin) return true;
        if (oMin < cMin) { if (cur >= oMin && cur < cMin) return true; }
        else { if (cur >= oMin || cur < cMin) return true; }
      }
      return false;
    }
  } catch {}
  return p && p.openNow != null ? p.openNow : null;
}
function todayHours(extra) {
  const hrs = extra && Array.isArray(extra.hours) ? extra.hours : null;
  if (!hrs) return null;
  const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];
  const line = hrs.find((h) => typeof h === "string" && h.indexOf(wd) === 0);
  if (!line) return null;
  const after = line.slice(line.indexOf(":") + 1).trim();
  return after || null;
}

// ─── Event tiles: control the frame ──────────────────────────────────────────
// Scraped event flyers (Google and similar) are blurry, dark, and text-heavy,
// and we cannot judge image quality from a URL. So we trust art only from
// ticketing sources that supply clean images; everything else gets a branded
// category tile instead of a bad flyer.
function eventUseImage(e) {
  if (!e || !e.image) return false;
  const src = (e.source || "").toLowerCase();
  if (src.includes("ticket")) return true;
  return false;
}
// CTA matched to the event, not a blanket "Get tickets" on free community events.
function eventCTA(e) {
  const url = e && e.url ? String(e.url) : "";
  if (!url) return { show: false, label: "" };
  const u = url.toLowerCase();
  const src = (e.source || "").toLowerCase();
  const ticketHost = /ticketmaster|eventbrite|seatgeek|axs\.com|stubhub|ticketweb|etix|dice\.fm|tickets\./.test(u);
  if (e.ticketed === true || ticketHost) return { show: true, label: "Get tickets ↗" };
  if (e.ticketed === false) return { show: true, label: "View details ↗" };
  if (src.includes("google") || u.includes("google.")) return { show: true, label: "View on Google ↗" };
  return { show: true, label: "View details ↗" };
}
// Trim trailing ", City, ST" / ", ST" noise so venues read cleanly on one line.
function cleanVenueName(v) {
  if (!v) return "";
  let s = String(v).trim();
  s = s.replace(/,\s*[A-Za-z .'-]+,\s*[A-Z]{2}(\s+\d{5})?$/, "");
  s = s.replace(/,\s*[A-Z]{2}(\s+\d{5})?$/, "");
  return s.trim();
}
function normEvtKey(e) {
  const n = (e && e.name ? e.name : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const v = (e && e.venue ? e.venue : "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return n + "|" + v;
}
// Collapse recurring events (same title + venue) into one card. When a single
// date is selected we keep them separate; otherwise merge and surface the days.
function dedupeEvents(list, mergeDates) {
  const groups = new Map();
  (list || []).forEach((e) => {
    if (!e) return;
    const k = mergeDates ? normEvtKey(e) : normEvtKey(e) + "|" + (e.date || "");
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  });
  const out = [];
  groups.forEach((arr) => {
    const sorted = arr.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    const rep = { ...sorted[0] };
    rep._dates = [...new Set(sorted.map((x) => x.date).filter(Boolean))];
    rep._days = [...new Set(sorted.map((x) => formatEventDate(x.date, x.time).wd).filter(Boolean))];
    out.push(rep);
  });
  out.sort((a, b) => ((a._dates && a._dates[0]) || a.date || "").localeCompare((b._dates && b._dates[0]) || b.date || ""));
  return out;
}
function recurrenceLabel(e) {
  const dates = (e && e._dates) || (e && e.date ? [e.date] : []);
  const days = (e && e._days) || [];
  if (!dates || dates.length <= 1) return null;
  if (days.length === 1) return days[0] + " · " + dates.length + " dates";
  if (days.length === 2) return days[0] + " & " + days[1];
  if (days.length === 3) return days.join(", ");
  return dates.length + " dates";
}
// Image area: real art only when trusted, otherwise a branded category tile.
// Richer category for the tile + badge. Ticketmaster segments are trusted as-is;
// generic "Event"/"Other" records get a category inferred from the title so the
// branded tile is on-theme (food, outdoors, nightlife) instead of all identical.
function eventCategory(e) {
  const seg = eventSegmentMeta(e && e.segment, e && e.genre);
  if (seg.short && seg.short !== "Other" && seg.short !== "Event") return seg;
  const t = ((e && e.name) || "").toLowerCase();
  const has = (re) => re.test(t);
  if (has(/\b(wine|beer|brewery|cocktail|happy hour|pub|tap ?room|tasting|spirits|nightlife|club|dj|martini)\b/)) return { icon: "🍷", iconName: "glass", short: "Nightlife", color: "#F472B6" };
  if (has(/\b(food|truck|taste|culinary|bbq|brunch|dinner|chef|eats|dining|feast|pizza|seafood)\b/)) return { icon: "🍔", iconName: "utensils", short: "Food", color: "#F97316" };
  if (has(/\b(trail|park|hike|outdoor|cleanup|clean-up|workday|garden|nature|beach|kayak|paddle|fishing)\b/)) return { icon: "🌳", iconName: "leaf", short: "Outdoors", color: "#22C55E" };
  if (has(/\b(market|farmers|craft|vendor|flea|bazaar|artisan|swap)\b/)) return { icon: "🛒", iconName: "cart", short: "Market", color: "#2DD4BF" };
  if (has(/\b(kids|family|children|child|story ?time|teen)\b/)) return { icon: "👪", iconName: "users", short: "Family", color: "#22C55E" };
  if (has(/\b(art|gallery|exhibit|paint|sculpt|museum|pottery)\b/)) return { icon: "🎨", iconName: "palette", short: "Arts", color: "#FF8A3D" };
  if (has(/\b(music|concert|live|band|jazz|acoustic|symphony|karaoke|open mic)\b/)) return { icon: "🎵", iconName: "music", short: "Live", color: "#F472B6" };
  if (has(/\b(run|race|5k|10k|marathon|sport|tournament|yoga|fitness|cycling|golf)\b/)) return { icon: "🏃", iconName: "activity", short: "Active", color: "#38BDF8" };
  return seg;
}
function EventHeroBg({ image, acc, venue, near }) {
  // v2.4: an event with no usable image borrows its venue's own Google photo
  // (one findPlace call per unique venue, cached 7 days on-device). The clean
  // gradient is the last resort, not the default.
  const [bad, setBad] = useState(false);
  const [alt, setAlt] = useState(null); // null = not tried, "" = tried and none, url = venue photo
  const [altBy, setAltBy] = useState("");
  useEffect(() => {
    if (image && !bad) return;
    if (!venue || alt !== null) return;
    let off = false;
    const key = "wf_evimg_" + String(venue).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const o = JSON.parse(raw); if (o && o.ts && Date.now() - o.ts < 7 * 24 * 3600 * 1000) { setAlt(o.url || ""); setAltBy(o.by || ""); return; } }
    } catch (e) {}
    // Budget guardrail: at most 12 venue-photo lookups per device per day. Past
    // the cap we cache "none" and fall back to the gradient instead of spending.
    try {
      const bk = "wf_evimg_budget_" + new Date().toISOString().slice(0, 10);
      const n = parseInt(localStorage.getItem(bk) || "0", 10) || 0;
      if (n >= 12) { try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), url: "", by: "" })); } catch (e) {} setAlt(""); return; }
      localStorage.setItem(bk, String(n + 1));
    } catch (e) {}
    (async () => {
      let url = "", by = "";
      try { const pl = await findPlace(venue, near); url = (pl && pl.photo) || ""; by = (pl && pl.photoAttr) || ""; } catch (e) {}
      try { logEventAnon("venue_photo_lookup", null, { venue: String(venue).slice(0, 60), hit: !!url }); } catch (e) {}
      try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), url, by })); } catch (e) {}
      if (!off) { setAlt(url); setAltBy(by); }
    })();
    return () => { off = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, bad, venue]);
  const usingAlt = !(image && !bad) && !!alt;
  const src = image && !bad ? image : (alt || "");
  if (src) {
    return (<>
      <img src={src} alt="" fetchPriority="high" decoding="async" draggable={false} onError={() => { if (image && !bad) setBad(true); else setAlt(""); }} onLoad={(ev) => { try { if (image && !bad) { const w = ev.target && ev.target.naturalWidth; if (w && w < 640) setBad(true); } } catch (e) {} }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      {usingAlt && <div style={{ position: "absolute", bottom: 6, right: 8, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.5)", padding: "2px 7px", borderRadius: 999, pointerEvents: "none" }}>{altBy ? "Photo: " + altBy + " · Google" : "via Google"}</div>}
    </>);
  }
  return <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${acc}55 0%, #0D1117 100%)` }} />;
}

function Logo({ size = 26 }) {
  return (
    <svg width={size} height={Math.round((size * 124) / 96)} viewBox="0 0 96 124" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <defs>
        <filter id="wfglow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="0" stdDeviation="1.5" floodColor="#F97316" floodOpacity="0.5" />
        </filter>
      </defs>
      <g filter="url(#wfglow)">
        <path d="M48 5 C26 5 9 22 9 44 C9 70 48 118 48 118 C48 118 87 70 87 44 C87 22 70 5 48 5 Z" fill="#0D1117" stroke="#F97316" strokeWidth="2.5" />
        <rect x="31" y="32" width="34" height="18" rx="3" fill="#F97316" />
        <rect x="41" y="26" width="14" height="7" rx="2" fill="#F97316" />
        <rect x="36.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
        <rect x="52.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
        <rect x="34" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
        <rect x="45" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
        <rect x="56" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      </g>
    </svg>
  );
}

function Critter({ size = 26 }) {
  return (
    <svg width={size} height={Math.round((size * 38) / 40)} viewBox="28 22 40 38" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block" }}>
      <rect x="31" y="32" width="34" height="18" rx="3" fill="#F97316" />
      <rect x="41" y="26" width="14" height="7" rx="2" fill="#F97316" />
      <rect x="36.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="52.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="34" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="45" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="56" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
    </svg>
  );
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hit: false, err: "" }; }
  static getDerivedStateFromError(e) { return { hit: true, err: String((e && e.message) || e || "").slice(0, 160) }; }
  componentDidCatch(error) { try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("app_error", { message: String(error && error.message || "").slice(0, 200), stack: String((error && error.stack) || "").split("\n").slice(0, 3).join(" | "), build: BUILD_ID }); } catch (e) {} }
  render() {
    if (this.state.hit) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: C.bg, color: C.text, padding: 24, textAlign: "center" }}>
          <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={48} /></div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>That took a wrong turn</div>
          <div style={{ fontSize: 13.5, color: C.light, maxWidth: 280, lineHeight: 1.5 }}>Something hiccuped. Tap below to get back on track.</div>
          <button onClick={() => { this.setState({ hit: false }); try { window.location.reload(); } catch (e) {} }} style={{ marginTop: 4, padding: "11px 20px", background: C.accent, border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>Reload Wayfind</button>
          {this.state.err ? <div style={{ fontSize: 10, color: C.muted, maxWidth: 300, lineHeight: 1.45, wordBreak: "break-word" }}>{BUILD_ID} · {this.state.err}</div> : null}
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Hook content engine ─────────────────────────────────────────────────────
// Generates provocative, data-driven hook cards from real place data.
// Every hook references an actual place — nothing is invented.
function generateHooks(places, locName) {
  if (!places || places.length < 4) return [];
  const city = (locName || "your area").split(",")[0];
  const h = new Date().getHours();
  const mealLabel = h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "late-night";
  const hooks = [];
  const byScore = [...places].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

  // LOCAL SOURCE — only places ≤15 miles. Used for city-specific hooks so "most
  // talked about in Parrish" can't pull Saint Pete (30 miles away).
  const LOCAL_MILES = 15;
  const local = places.filter((p) => p.distMi == null || p.distMi <= LOCAL_MILES);
  const localByScore = [...local].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

  // #1 — absolute best (local first, fall back to all)
  const best = localByScore[0] || byScore[0];
  if (best) hooks.push({
    id: "best", accent: "#FBBF24", emoji: "⭐", label: "#1 right now", highlightWord: "highest-rated",
    hook: `The highest-rated spot near you right now`,
    detail: `${best.name}${best.rating ? ` · ★${best.rating}` : ""}${best.reviews ? ` · ${best.reviews.toLocaleString()} reviews` : ""}`,
    cta: "See why →", action: { type: "detail", place: best },
  });

  // Hidden gem — high rating, low review count (local only — can't be a gem if it's far)
  const gems = local.filter((p) => p.rating >= 4.6 && p.reviews >= 40 && p.reviews < 350)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (gems[0]) hooks.push({
    id: "gem", accent: "#FF8A3D", emoji: "💎", label: "Hidden gem", highlightWord: "haven't found",
    hook: `The best ${mealLabel} spot in ${city} most people haven't found`,
    detail: `${gems[0].name} · ★${gems[0].rating} · only ${gems[0].reviews} reviews`,
    cta: "Show me →", action: { type: "detail", place: gems[0] },
  });

  // Skip this — low rated with enough reviews to trust. Local only.
  const duds = local.filter((p) => p.rating && p.rating < 3.9 && p.reviews && p.reviews >= 80)
    .sort((a, b) => (a.rating || 5) - (b.rating || 5));
  if (duds.length >= 1) hooks.push({
    id: "skip", accent: "#EF4444", emoji: "🚫", label: "Skip this", highlightWord: "waste",
    hook: `Don't waste your money here in ${city}`,
    detail: duds.slice(0, 2).map((p) => `${p.name} ★${p.rating}`).join("  ·  "),
    cta: "See who →", action: { type: "detail", place: duds[0] },
  });

  // Worth the drive — INTENTIONALLY uses far places (>14 miles). This is the only
  // hook type that should reference distant spots.
  const farBest = places.filter((p) => p.distMi != null && p.distMi > 14 && p.rating >= 4.5)
    .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  if (farBest[0]) hooks.push({
    id: "drive", accent: "#38BDF8", emoji: "🚗", label: "Worth the drive?", highlightWord: "drive",
    hook: `Would you drive ${Math.round(farBest[0].distMi)} miles for this?`,
    detail: `${farBest[0].name} · ★${farBest[0].rating}`,
    cta: "Decide →", action: { type: "detail", place: farBest[0] },
  });

  // Best value — cheap and good. Local only.
  const vals = local.filter((p) => p.rating >= 4.3 && p.priceNum != null && p.priceNum <= 1)
    .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  if (vals[0]) hooks.push({
    id: "value", accent: "#22C55E", emoji: "💰", label: "Best value", highlightWord: "under $$",
    hook: `Top ${mealLabel} spots near you under $$`,
    detail: `${vals[0].name} · ★${vals[0].rating} · ${vals[0].price || "$"}`,
    cta: "Show me →", action: { type: "experience", key: "value" },
  });

  // Open right now — local only (not "open right now 25 miles away")
  const openGreat = local.filter((p) => p.openNow === true && p.rating >= 4.4)
    .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  if (openGreat[0]) hooks.push({
    id: "open", accent: "#22C55E", emoji: "🟢", label: "Open right now", highlightWord: "worth the trip",
    hook: `Open right now and actually worth the trip`,
    detail: `${openGreat[0].name} · ★${openGreat[0].rating}`,
    cta: "Let's go →", action: { type: "detail", place: openGreat[0] },
  });

  // Most talked about — LOCAL ONLY. "Most talked about in Parrish" must be in Parrish.
  const talked = [...local].sort((a, b) => (b.reviews || 0) - (a.reviews || 0));
  if (talked[0] && talked[0].reviews >= 100) hooks.push({
    id: "popular", accent: "#F472B6", emoji: "🔥", label: "Most talked about", highlightWord: "overrated",
    hook: `What's the most overrated spot in ${city}?`,
    detail: `${talked[0].name} · ${talked[0].reviews?.toLocaleString()} people weighed in · ★${talked[0].rating}`,
    cta: "Judge it →", action: { type: "detail", place: talked[0] },
  });

  // Local itinerary — local only for the food + nightlife chain
  const foodTop = localByScore.find((p) => (primaryCategory(p) || "") === "Food");
  const nightTop = localByScore.find((p) => (primaryCategory(p) || "") === "Nightlife");
  if (foodTop && nightTop) hooks.push({
    id: "itinerary", accent: "#F97316", emoji: "🗺️", label: "Tonight's plan", highlightWord: "tonight",
    hook: `Quick local itinerary for tonight`,
    detail: `${foodTop.name} for dinner → ${nightTop.name} for drinks`,
    cta: "See both →", action: { type: "detail", place: foodTop },
  });

  // Wayfind Picks — the flagship branded entry into the curated picks sheet.
  if (byScore.length >= 5) hooks.push({
    id: "top5", accent: "#F97316", emoji: "🧭", label: `Wayfind Picks · ${city}`, highlightWord: "top 10",
    hook: `The top 10 picks near ${city} right now`,
    detail: byScore.slice(0, 3).map((p) => p.name).join("  ·  "),
    theme: "best", placeId: byScore[0].id,
    themeTitle: `Wayfind Picks · Top 10 in ${city}`,
    themeBody: `The ten highest-scoring spots near you, ranked by the Wayfind Score, which weights each rating by how many people stand behind it. No ads, no paid placement, just what consistently earns it. Anything past 10 miles is flagged so you can weigh the drive.`,
    cta: "See the top 10 →", action: { type: "explore" },
  });

  // Late night bonus
  if (h >= 21 || h < 3) {
    const late = places.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
    if (late[0]) hooks.push({
      id: "latenight", accent: "#FF8A3D", emoji: "🌙", label: "Still open",
      hook: `Still open and still worth it tonight`,
      detail: `${late[0].name} · ★${late[0].rating}`,
      cta: "Head there →", action: { type: "detail", place: late[0] },
    });
  }

  // Shuffle so the order varies on each session
  for (let i = hooks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hooks[i], hooks[j]] = [hooks[j], hooks[i]];
  }
  return hooks.slice(0, 8);
}

// ─── HooksBanner component ────────────────────────────────────────────────────
// Horizontal snap-scroll strip of AI-generated provocative hook cards.
// Each card has a like button. Tapping the card opens a themed detail sheet.
// Renders the hook text with one key word highlighted in the tile's accent color.
// This is what makes "What's the most overrated spot?" pop — "overrated" glows.
function renderHookText(text, highlightWord, color) {
  if (!highlightWord || !text) return <span>{text}</span>;
  const lw = highlightWord.toLowerCase();
  const ti = text.toLowerCase().indexOf(lw);
  if (ti === -1) return <span>{text}</span>;
  return (
    <>
      <span>{text.slice(0, ti)}</span>
      <span style={{ color, fontStyle: "italic" }}>{text.slice(ti, ti + highlightWord.length)}</span>
      <span>{text.slice(ti + highlightWord.length)}</span>
    </>
  );
}

// ─── HooksBanner component — magazine photo-card style ────────────────────────
// Each tile is a full photo background with dark overlay + bold editorial
// typography. The hook's accent word glows in the tile's color. Matches the
// visual style of premium discovery apps.
function HooksBanner({ hooks, likedIds, totalLiked, onOpen, onLike, allPlaces, isDesktop }) {
  if (!hooks || hooks.length === 0) return null;
  const shown = hooks.slice(0, 5); // show the spread of hooks, stacked full-width on mobile
  const liked = likedIds || new Set();
  // Build a place lookup so each tile can show its place's real photo
  const placeMap = {};
  (allPlaces || []).forEach((p) => { if (p && p.id) placeMap[p.id] = p; });

  return (
    <div style={{ margin: "0 -12px 14px", paddingLeft: 12 }}>
      {totalLiked > 0 && (
        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
          <span>❤️</span>
          <span>{totalLiked} tip{totalLiked === 1 ? "" : "s"} saved</span>
        </div>
      )}
      <div style={{ margin: isDesktop ? "0 -12px 14px" : "0 0 14px", gap: 12, paddingBottom: 4, WebkitOverflowScrolling: "touch", scrollbarWidth: "none", ...(isDesktop ? { display: "flex", flexWrap: "wrap", overflowX: "visible", paddingLeft: 12, paddingRight: 12 } : { display: "block" }) }}>
        {shown.map((h) => {
          const isLiked = liked.has(h.id);
          const acc = h.accent || C.accent;
          const place = placeMap[h.placeId];
          const photo = place && place.photo;
          return (
            <div
              key={h.id}
              onClick={() => onOpen && onOpen(h)}
              style={{
                flexShrink: 0, width: isDesktop ? 290 : "100%", height: isDesktop ? 185 : 152,
                scrollSnapAlign: "start", borderRadius: 18,
                overflow: "hidden", position: "relative", cursor: "pointer",
                boxShadow: isLiked ? `0 0 0 2.5px ${acc}, 0 8px 28px rgba(0,0,0,.5)` : "0 4px 20px rgba(0,0,0,.4)",
              }}
            >
              {/* Background: place photo or rich gradient fallback */}
              {photo
                ? <img src={photo} alt="" loading="lazy" decoding="async" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
                : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${acc}50 0%, #0D1117 100%)` }} />
              }
              {/* Cinematic dark overlay — lighter at top, very dark at bottom */}
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.18) 0%, rgba(0,0,0,.55) 45%, rgba(0,0,0,.88) 100%)" }} />
              {/* Subtle accent glow in the corner */}
              <div style={{ position: "absolute", bottom: 0, right: 0, width: 120, height: 120, background: `radial-gradient(circle at bottom right, ${acc}30 0%, transparent 65%)`, pointerEvents: "none" }} />

              {/* ── Top row: badge label + like button ── */}
              <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.6)", border: `1px solid ${acc}70`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
                  <span style={{ fontSize: 11 }}>{h.emoji}</span>
                  <span style={{ fontSize: 9, fontWeight: 800, color: acc, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h.label}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onLike && onLike(h.id); }}
                  style={{ width: 30, height: 30, borderRadius: "50%", background: isLiked ? acc : "rgba(0,0,0,.55)", border: `1.5px solid ${isLiked ? acc : "rgba(255,255,255,.35)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", color: "#fff" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill={isLiked ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>
                </button>
              </div>

              {/* ── Bottom: hook text + detail + CTA ── */}
              <div onClick={() => onOpen && onOpen(h)} style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 12px 13px" }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: "#fff", lineHeight: 1.25, marginBottom: 7, textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {renderHookText(h.hook, h.highlightWord, acc)}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.6)", lineHeight: 1.3, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {h.detail}
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: "#fff", background: acc, borderRadius: 999, padding: "5px 12px" }}>
                    {h.cta || "See more →"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div style={{ flexShrink: 0, width: 4 }} />
      </div>
    </div>
  );
}

// Compute the list of real places a hook represents (same logic the detail
// sheet uses), so a card's heart can save the full list to Favorites.
// ─── AI copy hygiene + relevance ─────────────────────────────────────────────
// AI-written hooks and blurbs sometimes return markdown (the prompt asks for
// "bold" sentences). Strip it so no raw **text** ever reaches the UI.
function stripMd(s) {
  if (typeof s !== "string" || !s) return s;
  return s
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function stripMdMap(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const out = {};
  for (const k in obj) out[k] = stripMd(obj[k]);
  return out;
}
// Strip markdown from every text field of an AI hook. (CTA + color systematizing
// is intentionally handled separately.)
function normalizeHook(h) {
  if (!h) return h;
  return { ...h, hook: stripMd(h.hook), detail: stripMd(h.detail), themeTitle: stripMd(h.themeTitle), themeBody: stripMd(h.themeBody), highlightWord: stripMd(h.highlightWord) };
}
// Picks actually related to a debated place: same dessert/food subtype first,
// then same category, then fill. Keeps an ice-cream debate from listing museums.
// v4.9: honest "could be a better fit" — same-category places that beat the one
// being viewed on a concrete axis (open, rating, distance, price, proof). Returns
// [{ p, reasons }]; empty when nothing genuinely beats the current pick.
function betterAlternatives(current, pool, n) {
  if (!current) return [];
  const cat = primaryCategory(current);
  const curR = current.rating != null ? current.rating : 0;
  const curD = current.distMi;
  const curRev = current.reviews != null ? current.reviews : 0;
  const curP = current.priceNum;
  const curOpen = current.openNow;
  const seen = new Set([current.id]);
  const out = [];
  (pool || []).forEach((p) => {
    if (!p || !p.id || seen.has(p.id)) return;
    if (cat && primaryCategory(p) !== cat) return;
    seen.add(p.id);
    const reasons = [];
    let edge = 0;
    if (p.openNow === true && curOpen === false) { reasons.push("open now"); edge += 4; }
    if (p.rating != null && p.rating >= curR + 0.2 && (p.reviews || 0) >= 25) { reasons.push("rated higher at " + p.rating + "★"); edge += 3; }
    if (curD != null && p.distMi != null && p.distMi <= curD - 2) { reasons.push("closer, " + p.distMi.toFixed(1) + " mi vs " + curD.toFixed(1)); edge += 3; }
    if (curP != null && p.priceNum != null && p.priceNum < curP && (p.rating || 0) >= curR - 0.2) { reasons.push("more affordable"); edge += 1; }
    if ((p.reviews || 0) >= curRev * 2 && (p.reviews || 0) >= 300 && (p.rating || 0) >= curR - 0.1) { reasons.push("more reviewed, " + p.reviews.toLocaleString()); edge += 1; }
    if (reasons.length) {
      let kf = "";
      try { const dk = experienceBadges(p, null, 3).map((b) => b.key).filter((k) => !["localfav", "gem", "value", "bestof"].includes(k)); if (dk.length) { const lab = EXPERIENCES[dk[0]] && EXPERIENCES[dk[0]].label ? EXPERIENCES[dk[0]].label.toLowerCase() : ""; if (lab) kf = "known for " + lab; } } catch (e) {}
      out.push({ p, reasons: reasons.slice(0, 2), knownFor: kf, edge: edge + ((p.wfScore || 0) / 1000) });
    }
  });
  out.sort((a, b) => b.edge - a.edge);
  return out.slice(0, n || 3);
}
// v6.25: "More like this" — rank loaded places by how much they share the
// subject's experience: same broad category, overlapping experience tags,
// matching cuisine, similar price and venue feel. A traits-based proxy for
// "same vibe" using data already on hand (no extra API calls). The deep,
// review-reading, search-everywhere version is a separate grounded pipeline.
function similarPlaces(pool, seed, n, badgesOf) {
  if (!seed) return [];
  const sBadges = badgesOf ? badgesOf(seed) : new Set();
  const sCat = primaryCategory(seed);
  const sCuisine = Dining.cuisineLabel(seed);
  const sPrice = seed.priceNum;
  let sLean = null; try { sLean = Ranking.venueLean(seed); } catch (e) {}
  const scored = [];
  // v4.15: tours, parks, and spas never cross-match. primaryCategory buckets
  // all of "Activities" together, which is how a park ended up as "more like"
  // a tiki cruise. Identity is the finer, trustworthy signal.
  const sId = Tags.resolveIdentity(seed.types || []);
  for (const c of (pool || [])) {
    if (!c || c.id === seed.id) continue;
    if (primaryCategory(c) !== sCat) continue;
    const cId = Tags.resolveIdentity(c.types || []);
    if (sId !== cId && (sId === "tour" || cId === "tour" || sId === "park" || cId === "park" || sId === "spa" || cId === "spa")) continue;
    const cBadges = badgesOf ? badgesOf(c) : new Set();
    let shared = 0; sBadges.forEach((k) => { if (cBadges.has(k)) shared++; });
    const cCuisine = Dining.cuisineLabel(c);
    const cuisineMatch = !!(sCuisine && cCuisine === sCuisine);
    if (shared === 0 && !cuisineMatch) continue;
    let score = shared * 3;
    if (cuisineMatch) score += 2.5;
    if (sPrice != null && c.priceNum != null && Math.abs(c.priceNum - sPrice) <= 1) score += 1;
    let cLean = null; try { cLean = Ranking.venueLean(c); } catch (e) {}
    if (sLean && cLean === sLean) score += 1;
    score += Math.min(1.5, (c.wfScore || 0) / 100);
    scored.push({ p: c, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, n).map((x) => x.p);
}

// v4.15 — Culture card: what this destination is known for. Editorial content
// from lib/culture.js; "do" items link out through the affiliate experience
// search when a partner PID exists. Collapsed by default, expands in place.
function relatedPicks(allSrc, subject, n) {
  if (!subject) return [];
  const subCat = primaryCategory(subject) || "";
  const subName = ("" + (subject.name || "")).toLowerCase();
  const subType = ("" + (subject.type || "")).toLowerCase();
  const DESSERT = /ice ?cream|gelato|dessert|frozen yogurt|froyo|creamery|custard|donut|doughnut|bakery|cupcake|candy|chocolate|sweets/;
  const isDessert = DESSERT.test(subName) || DESSERT.test(subType);
  const pool = (allSrc || []).filter((p) => p && p.id && p.id !== subject.id);
  let tier1 = [];
  if (isDessert) tier1 = pool.filter((p) => DESSERT.test(("" + (p.name || "")).toLowerCase()) || DESSERT.test(("" + (p.type || "")).toLowerCase()));
  const t1 = new Set(tier1.map((p) => p.id));
  const sameCat = subCat ? pool.filter((p) => (primaryCategory(p) || "") === subCat && !t1.has(p.id)) : [];
  tier1.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  sameCat.sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  let result = [subject, ...tier1, ...sameCat];
  if (result.length < n) {
    const have = new Set(result.map((p) => p.id));
    const fill = [...pool].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).filter((p) => !have.has(p.id));
    result = [...result, ...fill];
  }
  return result.slice(0, n);
}

function placesForHook(hook, allSrc) {
  const theme = (hook && hook.theme) || "best";
  const primaryId = hook && hook.placeId;
  const byScore = [...allSrc].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
  let out = [];
  if (theme === "top5" || theme === "best") out = (hook && hook._ctx) ? Ranking.rankByConditions(allSrc, hook._ctx).slice(0, 10) : byScore.slice(0, 10);
  else if (theme === "gem") {
    out = allSrc.filter((p) => p.rating >= 4.4 && p.reviews >= 15 && p.reviews < 450).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 5);
    const pri = allSrc.find((x) => x.id === primaryId);
    if (pri && !out.find((p) => p.id === pri.id)) out = [pri, ...out].slice(0, 5);
  } else if (theme === "skip") out = allSrc.filter((p) => p.rating && p.rating < 3.9 && p.reviews >= 50).sort((a, b) => (a.rating || 5) - (b.rating || 5)).slice(0, 4);
  else if (theme === "value") out = allSrc.filter((p) => p.rating >= 4.2 && (p.priceNum === 1 || p.priceNum === 0)).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
  else if (theme === "open") out = allSrc.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
  else if (theme === "popular" || theme === "overrated") { const pri = allSrc.find((x) => x.id === primaryId); out = pri ? relatedPicks(allSrc, pri, 5) : [...allSrc].sort((a, b) => (b.reviews || 0) - (a.reviews || 0)).slice(0, 5); }
  else if (theme === "drive") out = allSrc.filter((p) => p.distMi != null && p.distMi > 12 && p.rating >= 4.4).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 3);
  else if (theme === "itinerary") {
    const food = allSrc.filter((p) => (primaryCategory(p) || "") === "Food").sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 2);
    const night = allSrc.filter((p) => (primaryCategory(p) || "") === "Nightlife").sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 2);
    out = [...food, ...night];
  } else if (theme === "latenight") out = allSrc.filter((p) => p.openNow === true).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 5);
  else if (EXPERIENCES[theme]) {
    const e = EXPERIENCES[theme];
    const m = (p) => { if (e.filter) { try { return !!e.filter(p); } catch (er) { return false; } } try { return experienceBadges(p, null, 99).some((b) => b.key === theme); } catch (er) { return false; } };
    out = allSrc.filter(m).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0)).slice(0, 8);
    const pri = allSrc.find((x) => x.id === primaryId);
    if (pri && !out.find((p) => p.id === pri.id)) out = [pri, ...out].slice(0, 8);
  }
  else {
    const pri = allSrc.find((x) => x.id === primaryId);
    out = pri ? [pri, ...byScore.filter((p) => p.id !== pri.id).slice(0, 4)] : byScore.slice(0, 5);
  }
  // v5.8: strictly nearest first within every hook list, so the closest spots lead.
  // Places with no known distance fall to the end. The theme still chooses the set
  // (Top 5 stays the top 5, gems stay gems); this only changes the order.
  out = out.slice().sort((a, b) => ((a && a.distMi != null) ? a.distMi : Infinity) - ((b && b.distMi != null) ? b.distMi : Infinity));
  // v5.7 trust fix: the card headlines one specific place (hook.placeId). Always keep
  // that exact place at the front of the opened list, so tapping a card never lands on
  // a list that is missing the very spot it was recommending.
  if (primaryId) {
    const pri = allSrc.find((x) => x.id === primaryId);
    if (pri) out = [pri, ...out.filter((p) => p && p.id !== pri.id)];
  }
  return out;
}

// ─── Single full-width editorial hook card, for weaving into the feed ─────────
// v6.5: short, punchy, data-true one-liner for a hook card subtitle. Each signal
// bucket holds several lines, and one is chosen deterministically from the place id
// so the same place always reads the same, but two similar places never repeat.
function wittyLine(p) {
  if (!p) return "";
  const r = p.rating, n = p.reviews || 0, d = p.distMi, pr = p.priceNum;
  let seed = 0; const s = String(p.id || p.name || "");
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  const pick = (arr) => arr[seed % arr.length];
  if (r != null && r >= 4.7 && n >= 500) return pick([
    "A near perfect score, earned the hard way", "Thousands rave, and they are not wrong",
    "The kind of rating that is no accident", "Sets the bar the others chase",
  ]);
  if (r != null && r >= 4.6 && n >= 150) return pick([
    "Quietly excellent, loudly loved", "Punches above its review count",
    "A local secret not staying secret", "Rated like a place twice its size",
  ]);
  if (r != null && r >= 4.4 && n > 0 && n < 150) return pick([
    "A small gem before everyone finds it", "Under the radar, over delivers",
    "Few reviews, all of them glowing", "The kind of find you brag about",
  ]);
  if (pr != null && pr <= 1 && r != null && r >= 4.2) return pick([
    "Great taste, gentle on the wallet", "Cheap to walk in, hard to forget",
    "Proof that good is not pricey",
  ]);
  if (pr != null && pr >= 3 && r != null && r >= 4.4) return pick([
    "Worth the splurge, by the reviews", "A treat yourself kind of night",
    "Pricey, and they still come back",
  ]);
  if (n >= 3000) return pick([
    "The one the whole town has tried", "Everybody has a story about this place",
    "Famous for a reason, clearly",
  ]);
  if (d != null && d <= 2) return pick([
    "Practically around the corner", "Close enough to walk off dinner", "Right in your backyard",
  ]);
  if (d != null && d > 10 && r != null && r >= 4.4) return pick([
    "Far enough to feel like a trip", "The drive is part of the reward", "Worth pointing the car at",
  ]);
  if (r != null && r >= 4.2) return pick([
    "Solid pick, no asterisks", "Consistently gets it right", "A safe bet that still surprises",
  ]);
  return pick([
    "Worth a closer look", "Might be your next regular", "One to keep on the list",
  ]);
}
// v6.6: a calm, specific, COMPLETE one-liner for a place card. No city names (so it
// can never contradict the active search), no hype, always reflects open/closed,
// kept short enough to fit one line without truncation. Lightly varied by place id.
function calmReason(p) {
  if (!p) return "";
  const r = p.rating, n = p.reviews || 0, d = p.distMi, open = liveOpen(p);
  let seed = 0; const s = String(p.id || p.name || "");
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  const pick = (arr) => arr[seed % arr.length];
  let lead;
  if (r != null && r >= 4.6 && n >= 300) lead = pick(["Highly rated, thousands of reviews", "Top rated, loved by thousands"]);
  else if (r != null && r >= 4.5 && n >= 100) lead = pick(["Highly rated with strong reviews", "Consistently rated, well reviewed"]);
  else if (r != null && r >= 4.4 && n > 0 && n < 100) lead = pick(["A quiet, well rated find", "An under the radar favorite"]);
  else if (r != null && r >= 4.2) lead = pick(["A solid, well rated pick", "A dependable nearby pick"]);
  else if (n >= 1500) lead = pick(["A popular local spot", "A well known local spot"]);
  else lead = pick(["Worth a closer look", "One to consider nearby"]);
  if (open === true) return lead + ", open now";
  if (open === false && p.nextOpen && p.nextOpen.today && p.nextOpen.label) return lead + ", " + p.nextOpen.label.replace(/^Opens/i, "opens");
  if (open === false) return lead + ", closed now";
  if (d != null && d > 10) return lead + ", worth the drive";
  return lead;
}
// v6.8: read what KIND of place this is from its Google types and name. Used by the
// reason engine so a museum, a preserve, a bridge and a restaurant each read differently.
function placeKind(p) {
  const ts = ((p.types || []).join(" ") + " " + (p.type || "")).toLowerCase();
  const nm = (p.name || "").toLowerCase();
  const has = (arr) => arr.some((k) => ts.includes(k));
  const named = (arr) => arr.some((k) => nm.includes(k));
  if (has(["museum", "art_gallery"]) || named(["museum", " gallery"])) return "museum";
  if (has(["aquarium", "zoo"]) || named(["aquarium", "zoo"])) return "wildlife";
  if (has(["amusement_park", "theme_park", "water_park", "bowling_alley", "movie_theater"]) || named(["arcade"])) return "entertainment";
  if (named(["skyway", "overlook", "lookout", "lighthouse", "observation"])) return "scenic";
  if (has(["beach"])) return "beach";
  if (has(["national_park", "state_park", "_park", "natural_feature", "botanical_garden", "campground"]) || (p.types || []).includes("park") || named(["preserve", "trailhead"])) return "nature";
  if (has(["historical_landmark", "historical"]) || named(["memorial", "fort ", "historic "])) return "landmark";
  if (named(["waterfront", "riverfront", "river roo", "bayfront", "marina", "riverwalk", "on the river", "on the bay", " pier", " wharf"])) return "waterfront";
  if (has(["night_club", "bar", "pub", "brewery"])) return "bar";
  if (has(["cafe", "coffee_shop", "bakery"]) || named(["coffee", "cafe", "espresso", "roasters"])) return "cafe";
  if (has(["restaurant", "food", "meal_"])) return "restaurant";
  if (has(["lodging", "hotel", "resort"])) return "hotel";
  if (has(["store", "shopping_mall", "market"])) return "shopping";
  return "generic";
}
// The global "why this pick" engine. Specific, varied and honest: it weighs the place
// kind, its standing on the list (rank, and what it edges out the next pick on), and the
// live context (weather, time of day). Deterministic per place so it never flickers.
function pickReason(p, ctx) {
  if (!p) return "";
  ctx = ctx || {};
  const w = ctx.weather, compact = !!ctx.compact;
  const rk = ctx.rank || 0;
  const wet = !!(w && (w.wet || (w.rain != null && w.rain >= 50)));
  const nice = !!(w && !wet && w.temp != null && w.temp >= 60 && w.temp <= 92);
  let kind = placeKind(p);
  const r = p.rating, n = p.reviews || 0;
  let seed = 0; const sid = String(p.id || p.name || "");
  for (let i = 0; i < sid.length; i++) seed = (seed * 31 + sid.charCodeAt(i)) >>> 0;
  const vary = (arr) => arr[(seed + rk) % arr.length];
  // Best-for verdict + a real "skip if", per kind. Repeat-prone kinds carry
  // variants, and the pick is seeded by place + rank, so two same-kind cards
  // on one list never read identically.
  const V = {
    museum:        [["a culture stop when you have an hour or two", "you want quick or outdoorsy"]],
    wildlife:      [["a few hours with kids, rain or shine", "you want nightlife or a fast bite"]],
    entertainment: [["groups or a rainy-day activity", "you want food, drinks, or a quiet local spot"], ["burning real energy with a crew", "you want low-key or cheap"]],
    scenic:        [["a view, a photo, or a sunset", "you need a meal or an indoor plan"], ["the photo stop of the day", "you are racing the clock"]],
    beach:         [["a beach day when the weather holds", "you want indoors or a quick stop"]],
    nature:        [["fresh air and a walk", "the weather is bad or you are short on time"], ["stretching your legs outdoors", "you need shade or AC today"], ["an easy outdoor reset", "you want food or nightlife instead"]],
    landmark:      [["a bit of history on the way", "you want to sit and eat"]],
    waterfront:    [["a relaxed meal with a water view", "you want quick or budget"], ["water-view dining at a slower pace", "you are grabbing and going"]],
    bar:           [["a night of drinks with some energy", "you want daytime or food first"], ["drinks-first plans", "you are hungry more than thirsty"]],
    cafe:          [["coffee and a slow sit", "you want a full meal or a night out"]],
    restaurant:    [["a well-rated sit-down", "you want quiet or upscale"], ["a proper meal worth the stop", "you want fast or cheap"], ["the food-first pick here", "you want a scene more than a kitchen"]],
    hotel:         [["a comfortable base near everything", "you are not staying over"]],
    shopping:      [["a browse when you have time", "you want a quick in and out"]],
    generic:       [["a dependable stop close by", "you came out for something specific"], ["a quick nearby stop locals rate well", "you already have your heart set elsewhere"]],
  };
  // v4.40: a place shown inside a food list (breakfast/lunch/dinner) must never be
  // described with bar/nightlife copy just because Google also tags it "bar".
  // Restaurants with full bars (PIER 22, Sofra) were getting "a night of drinks"
  // on a lunch card, which reads as broken. In a food context, bar -> restaurant.
  if (ctx.foodContext && kind === "bar") kind = "restaurant";
  const _isPark = /theme_park|amusement/.test((((p && p.types) || []).join(" ") + " " + ((p && p.name) || "")).toLowerCase());
  const PK = [["a full-day park plan with the crew", "you only have a couple of hours"], ["the marquee day out around here", "you want cheap, quick, or quiet"], ["thrill rides and full-scale spectacle", "you want a slow, quiet day"], ["the big-ticket day that anchors a trip", "you are watching the budget"]];
  const pair = (kind === "entertainment" && _isPark) ? vary(PK) : vary(V[kind] || V.generic); const good = pair[0], skip = pair[1];
  if (compact) return "Best for " + good + ".";
  const sig = [];
  if (r != null && r >= 4.6 && n >= 500) sig.push(vary([r + "★ across " + n.toLocaleString() + " reviews", n.toLocaleString() + " reviews deep", r + "★ and " + n.toLocaleString() + " people agree"]));
  else if (r != null && r >= 4.5) sig.push(vary([r + "★ rated", "locals rate it " + r + "★", r + "★ and consistent"]));
  else if (r != null) sig.push(r + "★");
  if (p.openNow === true) sig.push("open now");
  if (p.distMi != null && p.distMi <= 6) sig.push(p.distMi.toFixed(1) + " mi away");
  if (kind === "entertainment" || (p.labels || []).includes("Good for groups")) sig.push("group-friendly");
  const sigStr = sig.length ? sig.slice(0, 3).join(", ") : "close by and worth a look";
  const _cap = good.charAt(0).toUpperCase() + good.slice(1);
  const _fmt = (seed + rk * 7) % 3;
  let line = _fmt === 1 ? (_cap + " — " + sigStr + ". Pass if " + skip + ".") : _fmt === 2 ? ("Go for " + good + " (" + sigStr + "). Skip it if " + skip + ".") : ("Best for " + good + ": " + sigStr + ". Skip it if " + skip + ".");
  if (wet && ["nature", "beach", "scenic", "waterfront"].includes(kind)) line = vary(["Weather is iffy for this today. ", "Rain could get in the way today. ", "Check the sky before this one. "]) + line;
  else if (nice && ["nature", "beach", "scenic", "waterfront"].includes(kind)) line = line.replace("Skip it if", "Good weather to go — skip it if");
  return line;
}
function whyFirst(p, list) {
  if (!p || !Array.isArray(list) || list.length < 2) return "";
  const others = list.filter((x) => x && x.id !== p.id);
  const maxR = Math.max(0, ...others.map((x) => x.rating || 0));
  const maxN = Math.max(0, ...others.map((x) => x.reviews || 0));
  const topRated = p.rating && p.rating >= maxR;
  const topReviewed = p.reviews && p.reviews >= maxN;
  let lead;
  if (topRated && topReviewed) lead = "the safest crowd-pleaser here";
  else if (topReviewed) lead = "the most-proven pick here";
  else if (topRated) lead = "the highest rated of the bunch";
  else lead = "the strongest all-round pick here";
  const sig = [];
  if ((p.reviews || 0) >= 500) sig.push("the deepest review base on this list");
  else if (p.rating != null) sig.push(p.rating + "★");
  let out = "Ranked #1 — " + lead;
  if (sig.length) out += ": " + sig.slice(0, 3).join(", ");
  out += ".";
  const kind = placeKind(p);
  const caveat = { entertainment: "food, drinks, or a quiet local spot", restaurant: "quiet or upscale", bar: "daytime or food first", cafe: "a full meal or a night out", waterfront: "quick or budget", nature: "an indoor plan", beach: "an indoor plan", scenic: "a meal or indoor plan", museum: "quick or outdoorsy", shopping: "a fast in and out", hotel: "a day-trip spot", wildlife: "nightlife or a fast bite" }[kind];
  if (caveat) out += " Not the move if you want " + caveat + ".";
  return out;
}
// v6.9: the detail page "decision brief". Returns a one-line judgment verdict (use case)
// and a supporting body (signals + a real tradeoff), so the page reads like a sharp local
// guide instead of a row of database fields. Deterministic and honest.
function decisionReason(p) {
  if (!p) return { verdict: "", body: "" };
  const kind = placeKind(p);
  const r = p.rating, n = p.reviews || 0, d = p.distMi, open = liveOpen(p);
  const verdicts = {
    scenic: "Best as a scenic stop or sunset run, not a quick errand.",
    beach: "Worth a few hours when the weather cooperates, not a quick stop.",
    nature: "Best with the time to walk it, not a quick errand.",
    museum: "A plan-around-it visit. Give it real time.",
    wildlife: "A half day kind of place, especially with kids.",
    entertainment: "A full outing. Come with time and energy.",
    landmark: "Worth a deliberate stop, not a drive by.",
    waterfront: "Best for a relaxed meal with a view, not a rushed bite.",
    bar: "Built for the evening, not the afternoon.",
    cafe: "An easy, low effort stop any time of day.",
    restaurant: "A reliable sit down. Worth booking ahead if it is busy.",
    hotel: "A comfortable base if you are staying over.",
    shopping: "Worth it if you have the time to browse.",
    generic: "Worth a deliberate look when you are nearby.",
  };
  const verdict = verdicts[kind] || verdicts.generic;
  const qual = (r != null && r >= 4.6 && n >= 300) ? `Strong reviews from ${n.toLocaleString()} people`
    : (r != null && r >= 4.5 && n >= 50) ? `A ${r} with ${n.toLocaleString()} reviews behind it`
    : (r != null && r >= 4.2) ? "Well rated nearby"
    : (n >= 1000) ? "A popular local spot" : "Worth a closer look";
  const dist = d == null ? "" : d <= 4 ? ", and it is close by" : d <= 10 ? `, a short ${Math.round(d)} mile drive` : `, and the ${Math.round(d)} mile drive pays off`;
  const tradeoffs = {
    scenic: " — skip it if heights or crowds bother you.",
    beach: ", though it lives and dies by the weather.",
    nature: " — bring water and check the forecast first.",
    museum: ", an indoor and slower pace either way.",
    wildlife: ", and an easy crowd pleaser rain or shine.",
    entertainment: " — best with a half day to spare.",
    landmark: ", and it rewards reading up a little first.",
    waterfront: ", and it shines near sunset.",
    bar: " — a night out, not a daytime stop.",
  };
  const descKeys = (() => { try { return experienceBadges(p, null, 4).map((b) => b.key).filter((k) => !["localfav", "gem", "value", "bestof", "coffee", "breakfast"].includes(k)); } catch (e) { return []; } })();
  const knownFor = descKeys.length ? (", known for " + descKeys.slice(0, 2).map((k) => (EXPERIENCES[k] && EXPERIENCES[k].label ? EXPERIENCES[k].label.toLowerCase() : "")).filter(Boolean).join(" and ")) : "";
  let body = qual + knownFor + dist + (tradeoffs[kind] || ".");
  if (open === false) body = "Closed right now, so save it for later. " + body;
  return { verdict, body: body.charAt(0).toUpperCase() + body.slice(1) };
}
// v6.10: a short, decision-based line for a home card. Frames the call (closest pick,
// worth the drive, best open now) and adds a use case or tradeoff by kind. Two lines max,
// so it never truncates. Lightly varied by place id.
function decisionLine(p, ctx) {
  if (!p) return "";
  ctx = ctx || {};
  const w = ctx.weather;
  const kind = placeKind(p);
  const r = p.rating, n = p.reviews || 0, d = p.distMi, open = liveOpen(p), pr = p.priceNum;
  const cat = (primaryCategory(p) || "spot").toLowerCase();
  let seed = 0; const s = String(p.id || p.name || "");
  for (let i = 0; i < s.length; i++) seed = (seed * 31 + s.charCodeAt(i)) >>> 0;
  const pick = (arr) => arr[seed % arr.length];
  let lead;
  if (open === false) lead = pick(["Closed now, one to save for later", "Worth saving, it is closed right now"]);
  else if (d != null && d <= 5 && r != null && r >= 4.4) lead = pick([`Closest strong ${cat} pick near you`, `A strong ${cat} pick right nearby`]);
  else if (d != null && d > 12 && r != null && r >= 4.5) lead = pick([`Worth the ${Math.round(d)} mile drive`, `A ${Math.round(d)} mile trip that earns it`]);
  else if (open === true && r != null && r >= 4.6 && n >= 300) lead = pick(["One of the highest rated, open now", "Top rated near you, open now"]);
  else if (r != null && r >= 4.5) lead = pick([`A strong ${cat} pick`, `One of the better ${cat} picks near you`]);
  else lead = pick([`A solid ${cat} option nearby`, "Worth a look nearby"]);
  let use = "";
  if (kind === "restaurant") use = (pr != null && pr >= 3) ? ", better for a proper sit-down" : (pr != null && pr <= 1) ? ", good for an easy bite" : pick([", better for a sit-down than takeout", ", easy for a casual meal"]);
  else if (kind === "cafe") use = pick([", easy for coffee or a catch up", ", good for a slow morning"]);
  else if (kind === "bar") use = ", best after dark";
  else if (kind === "waterfront") use = ", and it shines near sunset";
  else if (kind === "scenic") use = ", best for the view, not a quick stop";
  else if (kind === "nature") use = (w && (w.wet || (w.rain != null && w.rain >= 50))) ? ", though the weather is iffy today" : ", good for a walk";
  else if (kind === "beach") use = ", weather permitting";
  else if (kind === "museum") use = ", an indoor, slower pace";
  else if (kind === "wildlife") use = ", easy with kids";
  else if (kind === "entertainment") use = ", a full outing";
  else if (kind === "landmark") use = ", worth a deliberate stop";
  return lead + use + ".";
}
// One distinct, engaging, place-specific headline per experience theme, so no
// two hero cards ever read alike. Claims stay true: the rating is real and the
// angle matches what the theme means. Returns a unique hook, subtitle, CTA, and
// the word to highlight in the theme color.
function themedHook(key, p) {
  const n = (p && p.name) || "This spot";
  const r = (p && p.rating != null) ? p.rating : null;
  const rs = r != null ? r + "★" : "";
  switch (key) {
    case "bestof": return { hook: n + " is one of the local institutions people here name among the best.", sub: "A Best of Sarasota pick", cta: "See the Best of Sarasota →", hl: "the best" };
    case "localfav": return { hook: r != null ? n + " is a " + rs + " local favorite people keep coming back to." : n + " is a local favorite people keep coming back to.", sub: "A spot the neighborhood claims as its own", cta: "See local favorites →", hl: r != null ? rs : "favorite" };
    case "gem": return { hook: r != null ? n + " is the " + rs + " gem most people walk right past." : n + " is the gem most people walk right past.", sub: "Quietly excellent, not yet crowded", cta: "See hidden gems →", hl: "gem" };
    case "value": return { hook: r != null ? n + " is " + rs + " and still won't break the bank." : n + " won't break the bank.", sub: "Genuinely good, genuinely affordable", cta: "See great value →", hl: r != null ? rs : "bank" };
    case "waterfront": return { hook: n + " puts you at a table with the water in view.", sub: "Worth it for the seat by the water", cta: "See waterfront spots →", hl: "water" };
    case "livemusic": return { hook: n + " gives the night a live soundtrack.", sub: "Where the music plays", cta: "See live music →", hl: "live" };
    case "family": return { hook: n + " keeps the kids happy and the grownups too.", sub: "Easy with the whole crew", cta: "See family spots →", hl: "kids" };
    case "romantic": return { hook: n + " sets the table for date night.", sub: "Low light, good wine, a table for two", cta: "See date night spots →", hl: "date night" };
    case "breakfast": return { hook: r != null ? n + " is the " + rs + " reason to wake up early." : n + " is the reason to wake up early.", sub: "Breakfast and brunch done right", cta: "See breakfast spots →", hl: r != null ? rs : "early" };
    case "coffee": return { hook: r != null ? n + " pours a " + rs + " cup worth the stop." : n + " pours a cup worth the stop.", sub: "Where the morning starts", cta: "See cafes →", hl: r != null ? rs : "cup" };
    case "instagram": return { hook: n + " is the shot worth stopping for.", sub: "Bring the camera", cta: "See photo spots →", hl: "shot" };
    case "rooftop": return { hook: n + " takes the night up to the roof.", sub: "Drinks with a view from up top", cta: "See rooftop spots →", hl: "roof" };
    case "outdoor": return { hook: n + " gives you a table in the open air.", sub: "Patios and courtyards worth sitting out for", cta: "See outdoor spots →", hl: "open air" };
    case "beer": return { hook: n + " pours a proper cold one.", sub: "Cold taps and a good pour", cta: "See breweries →", hl: "cold" };
    case "cocktails": return { hook: n + " makes a drink with real care.", sub: "Proper cocktails, made right", cta: "See cocktail bars →", hl: "drink" };
    default: return { hook: r != null ? n + " is a " + rs + " spot worth your time." : n + " is worth your time.", sub: r != null ? rs + " and nearby" : "Worth a look", cta: "See the list →", hl: r != null ? rs : "" };
  }
}

function HookSolo({ h, place, liked, onOpen, onLike, onShare, collage, hideLike, hideShare, extra }) {
  if (!h) return null;
  const acc = h.accent || C.accent;
  const photo = place && ((place.photos && place.photos[0]) || place.photo);
  const tiles = (collage || []).filter(Boolean).slice(0, 4);
  const _gseed = String(h.id || h.label || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const _glow = [{ p: { bottom: 0, right: 0 }, at: "bottom right" }, { p: { top: 0, left: 0 }, at: "top left" }, { p: { top: 0, right: 0 }, at: "top right" }, { p: { bottom: 0, left: 0 }, at: "bottom left" }][_gseed % 4];
  return (
    <div onClick={() => onOpen && onOpen(h)} style={{ position: "relative", height: 163, borderRadius: 18, overflow: "hidden", marginBottom: 14, cursor: "pointer", boxShadow: liked ? `0 0 0 2.5px ${acc}, 0 8px 28px rgba(0,0,0,.5)` : "0 4px 20px rgba(0,0,0,.4)" }}>
      {h.brand
        ? <div style={{ position: "absolute", inset: 0, background: `linear-gradient(140deg, ${acc} 0%, ${acc}A6 34%, #0D1117 100%)` }}><svg width="190" height="190" viewBox="0 0 24 24" fill="#fff" style={{ position: "absolute", right: -26, bottom: -32, opacity: 0.12 }}><path fillRule="evenodd" clipRule="evenodd" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Zm0 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z" /></svg></div>
        : tiles.length >= 2
        ? <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr", gap: 1.5 }}>{tiles.map((src, i) => <img key={i} src={src} alt="" loading="lazy" decoding="async" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />)}</div>
        : photo
        ? <img src={photo} alt="" loading="lazy" decoding="async" draggable={false} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} />
        : <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${acc}50 0%, #0D1117 100%)` }} />}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(180deg, transparent 12%, ${acc}26 100%), linear-gradient(180deg, rgba(13,17,23,.32) 0%, rgba(13,17,23,.7) 38%, rgba(13,17,23,.93) 66%, #0D1117 100%)` }} />
      <div style={{ position: "absolute", ..._glow.p, width: 140, height: 140, background: `radial-gradient(circle at ${_glow.at}, ${acc}26 0%, transparent 65%)`, pointerEvents: "none" }} />
      <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.55)", border: `1px solid ${acc}66`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
            <span style={{ fontSize: 11 }}>{h.emoji}</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: acc, textTransform: "uppercase", letterSpacing: "0.8px" }}>{h.label}</span>
          </div>
          {place && place.distMi != null && (
            <div style={{ display: "inline-flex", alignItems: "center", background: "rgba(0,0,0,.55)", border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, padding: "4px 9px", backdropFilter: "blur(4px)" }}>
              <span style={{ fontSize: 9.5, fontWeight: 800, color: "rgba(255,255,255,.85)" }}>{place.distMi.toFixed(1)} mi</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {!hideShare && (
          <button onClick={(e) => { e.stopPropagation(); onShare && onShare(h, place); }} aria-label="Share" style={{ width: 27, height: 27, borderRadius: "50%", background: "rgba(0,0,0,.32)", border: "1px solid rgba(255,255,255,.22)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", color: "rgba(255,255,255,.85)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
          )}
          {!hideLike && (
          <button onClick={(e) => { e.stopPropagation(); onLike && onLike(h.id); }} aria-label="Save" style={{ width: 27, height: 27, borderRadius: "50%", background: liked ? acc : "rgba(0,0,0,.32)", border: `1px solid ${liked ? acc : "rgba(255,255,255,.22)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", color: "#fff" }}><svg width="14" height="14" viewBox="0 0 24 24" fill={liked ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg></button>
          )}
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "10px 13px 12px" }}>
        <div style={{ fontSize: 17.5, fontWeight: 800, color: "#fff", lineHeight: 1.16, marginBottom: 3, letterSpacing: "-0.3px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{renderHookText(h.hook, h.highlightWord, acc)}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,.9)", lineHeight: 1.3, marginBottom: 9, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{h.subtitle || wittyLine(place) || h.detail}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12.5, fontWeight: 800, color: "#fff", background: acc, borderRadius: 999, padding: "7px 15px" }}>{h.cta || "See more →"}</span>
          {h.metaLine && <span style={{ display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 800, color: "#fff", background: "rgba(0,0,0,.5)", border: "1px solid rgba(255,255,255,.28)", borderRadius: 999, padding: "5px 11px", backdropFilter: "blur(4px)" }}>{h.metaLine}</span>}
        </div>
      </div>
      {extra ? <div style={{ position: "relative", marginTop: 11 }}>{extra}</div> : null}
    </div>
  );
}

// ─── Worth the Drive? widget ─────────────────────────────────────────────────
// Interactive voting widget — shows on detail sheets for far-away places or
// when the user came from a "Worth the drive?" hook. Captures yes/no, then
// reveals the live community tally.

function PageInner() {
  const [screen, setScreen] = useState("suggested");
  const [cat, setCat] = useState("food");
  const [wxOpen, setWxOpen] = useState(false); // header weather forecast wheel
  const GIVEAWAY = { start: new Date(2026, 6, 3), end: new Date(2026, 9, 31, 23, 59, 59) };
  const [gwPop, setGwPop] = useState(false); // v4.28: giveaway is a timed popup, not a feed card
  // v5.37 prompt coordinator (July 2026 audit, Phase 5). One interruptive
  // surface per SESSION, full stop. dialogOpenRef mirrors every overlay's
  // state (kept in sync by an effect further down, after those states are
  // declared); wf_interrupted is the session-wide claim; wf_value_seen is
  // set once the visitor has actually gotten something out of Wayfind
  // (results rendered or a place opened) — the giveaway never fires before
  // it, and never in the same session as onboarding.
  const dialogOpenRef = useRef(false);
  const claimInterrupt = (kind) => {
    try {
      if (dialogOpenRef.current) return false;
      if (sessionStorage.getItem("wf_interrupted")) return false;
      sessionStorage.setItem("wf_interrupted", kind);
      return true;
    } catch (e) { return true; }
  };
  useEffect(() => {
    try {
      if (!(giveawayLive() || giveawaySoon())) return;
      const st = JSON.parse(localStorage.getItem("wf_gw_pop") || "{}");
      const now = Date.now();
      if (st.entered) return;                                  // entered: never again
      if (st.dismissedAt && now - st.dismissedAt < 3 * 864e5) return; // dismissed: 3-day snooze
      if (st.shownAt && now - st.shownAt < 864e5) return;      // at most once a day
      let t;
      const fire = (attempt) => {
        try {
          // Session already used its one interruption: give up quietly.
          if (sessionStorage.getItem("wf_interrupted")) return;
          // No value delivered yet, or another dialog is up: queue a retry.
          if (!sessionStorage.getItem("wf_value_seen") || dialogOpenRef.current) {
            if (attempt < 8) t = setTimeout(() => fire(attempt + 1), 20000);
            return;
          }
          sessionStorage.setItem("wf_interrupted", "giveaway");
        } catch (e) {}
        setGwPop(true);
        try { localStorage.setItem("wf_gw_pop", JSON.stringify({ ...st, shownAt: Date.now() })); logEvent("giveaway_pop"); } catch (e) {}
      };
      t = setTimeout(() => fire(0), 30000);
      return () => clearTimeout(t);
    } catch (e) {}
  }, []);
  const gwPopClose = (why) => {
    setGwPop(false);
    try { const st = JSON.parse(localStorage.getItem("wf_gw_pop") || "{}"); if (why === "entered") st.entered = true; else st.dismissedAt = Date.now(); localStorage.setItem("wf_gw_pop", JSON.stringify(st)); } catch (e) {}
  };
  const giveawayLive = () => { const n = Date.now(); return n >= GIVEAWAY.start.getTime() && n <= GIVEAWAY.end.getTime(); };
  const giveawaySoon = () => { const n = Date.now(); return n < GIVEAWAY.start.getTime() && n >= GIVEAWAY.start.getTime() - 21 * 864e5; };
  const [gwCount, setGwCount] = useState(0);
  const [gwOpen, setGwOpen] = useState(false);
  useEffect(() => { try { const g = JSON.parse(localStorage.getItem("wf_gw26") || "[]"); if (Array.isArray(g)) setGwCount(g.length); } catch (e) {} }, []);
  const giveawayMark = (itemId) => { try { if (!giveawayLive() || !itemId) return; const g = JSON.parse(localStorage.getItem("wf_gw26") || "[]"); if (g.indexOf(itemId) === -1 && g.length < 10) { g.push(itemId); localStorage.setItem("wf_gw26", JSON.stringify(g)); setGwCount(g.length); if (g.length >= 3) { try { const st = JSON.parse(localStorage.getItem("wf_gw_pop") || "{}"); st.entered = true; localStorage.setItem("wf_gw_pop", JSON.stringify(st)); } catch (er) {} } } } catch (e) {} };
  const [mapFocus, setMapFocus] = useState(null); // drawer row -> fly the map to this pin
  const [mapSearchOpen, setMapSearchOpen] = useState(false); // map keeps a magnifier; tap slides the field down
  const [a2hs, setA2hs] = useState(false); // add-to-home-screen nudge (2nd visit, dismissible, never in standalone)
  const [isStandalone, setIsStandalone] = useState(false); // home-screen (PWA) mode: Google OAuth redirect cannot return here, so lead with email
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  useEffect(() => { try {
    const standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone;
    setIsStandalone(!!standalone);
    if (standalone) return;
    const n = (parseInt(localStorage.getItem("wf_visits") || "0", 10) || 0) + 1;
    localStorage.setItem("wf_visits", String(n));
    // v5.37: rate-limited — a non-blocking banner, at most once every 3 days.
    const lastShown = parseInt(localStorage.getItem("wf_a2hs_last") || "0", 10) || 0;
    if (n >= 2 && !localStorage.getItem("wf_a2hs_dismissed") && Date.now() - lastShown > 3 * 864e5) { setA2hs(true); try { localStorage.setItem("wf_a2hs_last", String(Date.now())); logEvent("a2hs_shown"); } catch (e) {} }
  } catch (e) {} }, []);
  useEffect(() => { const h = (e) => { e.preventDefault(); setDeferredPrompt(e); }; window.addEventListener("beforeinstallprompt", h); return () => window.removeEventListener("beforeinstallprompt", h); }, []);
  const _expLinked = useRef(false);
  useEffect(() => { try {
    if (_expLinked.current) return; _expLinked.current = true;
    const sp = new URLSearchParams(window.location.search);
    const k = sp.get("exp");
    if (k) { setTimeout(() => { try { if (k.indexOf("hol-") === 0) { openHoliday(k.slice(4)); } else if (k.indexOf("cur-") === 0) { openCurated(k.slice(4)); } else { openExperience(k); } } catch (e) {} }, 400); sp.delete("exp"); const qs = sp.toString(); window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : "")); }
  } catch (e) {} }, []);
  const [moodPick, setMoodPick] = useState(null);   // last category tapped, drives the orange highlight
  const [browseCat, setBrowseCat] = useState(null); // v6.22: category tapped in the mood menu browses IN PLACE on the home feed. No navigation, the feed updates under the weather and the sub-menu slides down.
  const [sub, setSub] = useState("all");
  const [vibe, setVibe] = useState("all");
  const [sortBy, setSortBy] = useState("rated"); // v4.97: quality-first default — a 0-review shop at 1.5 mi must never outrank a 4.8★ preserve
  const [searchRadius, setSearchRadius] = useState(DEFAULT_RADIUS_M); // meters — v4.83: 17-mile app-wide default
  const autoRadiusRef = useRef(true); // v4.85: true while the radius is app-chosen; a manual slider touch flips it off and auto-widen stands down
  const [visibleCount, setVisibleCount] = useState(5); // explore list shows 5, then "Wayfind 5 more spots"
  const [radiusSheet, setRadiusSheet] = useState(false);
  const [pendingRadius, setPendingRadius] = useState(24140);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [sliderMi, setSliderMi] = useState(DEFAULT_RADIUS_MI); // v4.83: the "Within X mi" control opens at 17
  const [showRadiusWheel, setShowRadiusWheel] = useState(false);
  const [showNearbyExp, setShowNearbyExp] = useState(false); // v3.7 Phase 2: ✨ Nearby experiences dropdown in the sort row
  const [sortOpen, setSortOpen] = useState(false);
  const [heroNonce, setHeroNonce] = useState(0); // taps on "show another angle" cycle the hero pick
  const [pickOpen, setPickOpen] = useState(false); // Pick-for-me panel expanded
  const [menuSheet, setMenuSheet] = useState(null); // which app-tile sheet is open: menu|explore|experiences|weather|null
  const [homeRolling, setHomeRolling] = useState(false); // dice animating in the panel
  const [homeDiceFace, setHomeDiceFace] = useState("🎲");
  const [rollHistory, setRollHistory] = useState([]); // session-only history of dice rolls
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [deviceLoc, setDeviceLoc] = useState(null);
  const [locName, setLocName] = useState("");
  // PROTECTED (check-cards.mjs): every card label follows the user's location.
  const cityNow = locName ? locName.split(",")[0] : "you";
  CITY_NOW = cityNow;
  const cityFix = cityFixM;
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [sugIdx, setSugIdx] = useState(-1); // v5.63 (audit P4): keyboard-highlighted suggestion, -1 = none
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailExtra, setDetailExtra] = useState(null);
  const [offers, setOffers] = useState({});
  const [dealsOnly, setDealsOnly] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [reviewsOpen, setReviewsOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [venueEvents, setVenueEvents] = useState(null);
  const [venueEventsLoading, setVenueEventsLoading] = useState(false);
  const [venueEventsOpen, setVenueEventsOpen] = useState(false);
  const [videos, setVideos] = useState(null);
  const [videosLoading, setVideosLoading] = useState(false);
  const [sharedList, setSharedList] = useState(null);
  // Trip planner: destinations keyed by city+state. Own store, persisted
  // separately from lists. See lib/trips.js for the model.
  const [trips, setTrips] = useState({});
  const [activeTrip, setActiveTrip] = useState(null);   // open trip key, or null for the index
  const [tripNoteEdit, setTripNoteEdit] = useState(null); // place id whose note is being edited
  const [tripMoveFor, setTripMoveFor] = useState(null);   // place id being moved to another trip
  const [events, setEvents] = useState(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsUnavailable, setEventsUnavailable] = useState(false);
  const [eventsError, setEventsError] = useState(false);
  const [eventCat, setEventCat] = useState("all");
  const [eventDate, setEventDate] = useState("all");
  const [eventCounts, setEventCounts] = useState(null);
  const [mapMode, setMapMode] = useState("places");
  const [mapBrowse, setMapBrowse] = useState(false); // false = neutral Top 10 map, true = category browse
  const [mapPool, setMapPool] = useState([]); // neutral map: all-category pool (cached searches)
  const [mapListOverride, setMapListOverride] = useState(null); // v4.95: a list's map icon pins THAT list on the in-app map (never a Google-Maps directions-to-all handoff)
  const [compassOn, setCompassOn] = useState(false);
  const compassNeedleRef = useRef(null);
  const compassHandlerRef = useRef(null);
  const stopCompass = () => { try { if (compassHandlerRef.current) { window.removeEventListener("deviceorientation", compassHandlerRef.current, true); compassHandlerRef.current = null; } } catch (e) {} setCompassOn(false); };
  const toggleCompass = async () => {
    if (compassOn) { stopCompass(); return; }
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== "granted") { showToast("Compass blocked \u2014 allow Motion & Orientation in Safari settings"); return; }
      }
      let got = false;
      const h = (e) => {
        let deg = null;
        if (typeof e.webkitCompassHeading === "number" && !isNaN(e.webkitCompassHeading)) deg = e.webkitCompassHeading;
        else if (e.absolute === true && typeof e.alpha === "number") deg = 360 - e.alpha;
        if (deg == null) return;
        got = true;
        const el = compassNeedleRef.current; if (el) el.style.transform = "rotate(" + (-deg) + "deg)";
      };
      compassHandlerRef.current = h;
      window.addEventListener("deviceorientation", h, true);
      setCompassOn(true);
      setTimeout(() => { if (!got && compassHandlerRef.current === h) { stopCompass(); showToast("Compass not supported on this device"); } }, 2500);
    } catch (e) { showToast("Compass not available"); }
  };
  useEffect(() => { if (screen !== "map" && compassHandlerRef.current) stopCompass(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);
  useEffect(() => {
    if (screen !== "map" || mapBrowse || !center || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY) return;
    let cancelled = false;
    (async () => {
      try {
        const out = []; const seen = new Set();
        const results = await Promise.all(CATEGORIES.map((c) => searchPlaces(c.id, "all", { lat: center.lat, lng: center.lng }, searchRadius, "all").catch(() => [])));
        results.forEach((arr) => (arr || []).forEach((q) => { if (q && q.id && !seen.has(q.id)) { seen.add(q.id); out.push(q); } }));
        if (!cancelled && out.length) setMapPool(out);
      } catch (e) {}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, mapBrowse, center, searchRadius]);
  const [mapDate, setMapDate] = useState("all");
  const [mapPreview, setMapPreview] = useState(null);
  const [mapDrawer, setMapDrawer] = useState(false);
  const [eventPreview, setEventPreview] = useState(null);
  const [weather, setWeather] = useState(null);
  const [suggested, setSuggested] = useState(null);
  const [homeTodo, setHomeTodo] = useState(null);
  const [suggestedLoading, setSuggestedLoading] = useState(false);
  const [intent, setIntent] = useState(null);
  const [foryouEvents, setForyouEvents] = useState(null);
  const [libraryEvents, setLibraryEvents] = useState([]); // curated civic/library events for the local-community hero card
  const [shareCopied, setShareCopied] = useState(false);
  const [beachCond, setBeachCond] = useState(null);
  const [beachCondLoading, setBeachCondLoading] = useState(false);
  const [allExpOpen, setAllExpOpen] = useState(false);
  const recentRef = useRef([]);
  const [blurbs, setBlurbs] = useState({});
  const [quickFilter, setQuickFilter] = useState(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [activeBadge, setActiveBadge] = useState(null);
  const [expPlaces, setExpPlaces] = useState(null);
  const [expLoading, setExpLoading] = useState(false);
  const [expTours, setExpTours] = useState(null); // v4.84: Viator products for viator-flagged vibes (top-rated or hidden gems)
  const [browseTours, setBrowseTours] = useState(null); // v4.84: Viator products on the Things to do browse
  const [expSort, setExpSort] = useState("rated");
  const [expMi, setExpMi] = useState(DEFAULT_RADIUS_MI); // v4.94: opens at the 17-mi app default like every other list; the adaptive effect below bumps it honestly when the vibe pulled from farther
  const [rolling, setRolling] = useState(false);
  const [diceFace, setDiceFace] = useState("🎲");
  const [diceChoose, setDiceChoose] = useState(false);
  const [surprisePick, setSurprisePick] = useState(null);
  const [surprisePool, setSurprisePool] = useState([]);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const diceRouteRef = useRef(false);
  const [toast, setToast] = useState("");
  function showToast(msg) { setToast(msg); setTimeout(() => setToast(""), 1800); }
  const videoCache = useRef({});
  const [insight, setInsight] = useState(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightFull, setInsightFull] = useState(null);
  const [insightFullLoading, setInsightFullLoading] = useState(false);
  const [showMore, setShowMore] = useState(true);
  useEffect(() => { if (detail && !detail._event) { try { loadFullInsight(detail, detailExtra); } catch (e) {} try { loadVideos(detail); } catch (e) {} } }, [detail && detail.id]);
  const [themesOpen, setThemesOpen] = useState(false);
  const [lists, setLists] = useState({ favorites: { id: "favorites", name: "Favorites", emoji: "❤️", places: [] } });
  const [activeList, setActiveList] = useState(null);
  const [saveTarget, setSaveTarget] = useState(null);
  const [newListOpen, setNewListOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmoji, setNewEmoji] = useState("⭐");
  const manualRef = useRef(false);
  // Hook state — declared before hookCards memo to avoid temporal dead zone.
  const [aiHooks, setAiHooks] = useState(null);
  const [hookLikes, setHookLikes] = useState(() => new Set());
  const [cuisineSheet, setCuisineSheet] = useState(null);
  const openHoliday = async (h) => {
    const hol = typeof h === "string" ? (Hol.holidaysFor(new Date().getFullYear()).find((x) => x.key === h) || null) : h;
    if (!hol) return;
    const content = Hol.contentFor(hol.key, hol.name);
    const theme = Hol.themeFor(hol.key);
    try { logEvent("holiday_open", null, { key: hol.key }); } catch (e) {}
    try {
      const lists = await Promise.all(content.queries.map((q) => searchNearbyPlaces(q, center).then((l) => (l || []).filter((p) => placeAllowed(null, null, p))).catch(() => []))); // v4.94: composites route through the shared filter
      let pool = dedupePlaces([].concat(...lists), true).filter((pp) => pp && !content.exclude(pp));
      // Rank by base quality + bounded holiday-fit + editorial pins, not raw score alone.
      const rankScore = (p) => (p.wfScore || 50) + Hol.fitFor(hol.key, p) + Hol.pinFor(hol.key, p) + featuredBoost(p.name);
      pool.sort((a, b) => rankScore(b) - rankScore(a));
      pool = pool.slice(0, 12);
      try { const sig = await fetchMemberSignals(supabase, pool); if (sig) pool = withMemberSignal(pool, sig); } catch (e) {}
      if (!pool.length) { showToast("Nothing found for " + hol.name + " nearby yet"); return; }
      setHookDetail({ id: "hol-" + hol.key, key: "hol-" + hol.key, theme: "hol-" + hol.key, hol: hol.key, title: content.headline(locName), themeTitle: content.headline(locName), label: hol.name + " picks", take: content.sub, themeBody: content.sub, emoji: hol.emoji, accent: theme.accent, places: pool });
    } catch (e) { showToast("Could not load " + hol.name + " picks"); }
  };
  const CURATED = {
    food: { title: "Top 10 Food near you", emoji: "\uD83C\uDF7D\uFE0F", lead: "The 10 best food spots near you right now \u2014 ranked by what actually matters: flavor, local buzz, reviews, distance, atmosphere, value, and whether it fits the moment. No random list. No tourist traps. Just the places most worth your next bite.", presetMi: 15, slots: [{ label: "Top 10", n: 10, q: "best restaurants" }] },
    experiences: { title: "Top 10 Experiences", emoji: "\uD83C\uDFA2", lead: "The strongest experiences around you right now — parks, attractions, and tours — ranked by fit. Attraction pages include bookable tours; live events have their own tab below.", slots: [{ label: "Theme parks", n: 2, q: "theme parks" }, { label: "Movies", n: 1, q: "movie theaters" }, { label: "Top experiences", n: 7, q: "top attractions tours and experiences" }] },
    nightlife: { title: "Top 10 Nightlife", emoji: "\uD83C\uDF78", lead: "Your best moves after dark \u2014 ranked by vibe, crowd, reviews, distance, value, and whether it's actually worth your night. From drinks-first bars to live music, lounges, and late-night bites, Wayfind cuts through the noise so you don't waste the evening.", presetMi: 15, slots: [{ label: "Bars & lounges", n: 5, q: "best bars and lounges" }, { label: "Live music", n: 3, q: "live music venues" }, { label: "Late-night eats", n: 2, q: "late night food" }] },
    shopping: { title: "Top 10 Shopping", emoji: "\uD83D\uDECD\uFE0F", lead: "Where locals and visitors actually spend: the malls, outlets, and boutiques that rate best near you, ranked by the Wayfind Score.", slots: [{ label: "Shopping", n: 10, q: "best shopping malls outlets and boutiques" }] },
  };
  const openCurated = async (kind) => {
    const c = CURATED[kind]; if (!c) return;
    try { logEvent("curated_open", null, { kind }); } catch (e) {}
    try {
      const results = await Promise.all(c.slots.map((sl) => searchNearbyPlaces(sl.q, center).then((l) => (l || []).filter((p) => placeAllowed(null, null, p))).catch(() => []))); // v4.94: Top-10 pools route through the shared filter
      const used = new Set(); const out = []; const sections = [];
      const CHAIN_RX = /papa john|domino'?s|pizza hut|mcdonald|burger king|taco bell|wendy'?s|little caesar|kfc\b|dunkin|subway\b|checkers\b|hungry howie/i;
      // v4.61 PROTECTED (check-meals.mjs): a slot label is a promise. Every
      // candidate must pass meal-period eligibility (hours-proven when hours
      // exist), and short slots backfill from the union of eligible places.
      const unionAll = dedupePlaces([].concat(...results.map((r) => r || [])), true);
      c.slots.forEach((sl, ix) => {
        const pool = dedupePlaces(results[ix] || [], true).filter((pp) => pp && pp.id && !used.has(pp.id) && !(kind === "nightlife" && CHAIN_RX.test(pp.name || "")) && Meals.mealEligible(sl.label, pp));
        pool.sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
        let take = pool.slice(0, sl.n);
        if (take.length < sl.n) {
          const extra = unionAll.filter((pp) => pp && pp.id && !used.has(pp.id) && !take.some((x) => x.id === pp.id) && !(kind === "nightlife" && CHAIN_RX.test(pp.name || "")) && Meals.mealEligible(sl.label, pp)).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
          take = [...take, ...extra.slice(0, sl.n - take.length)];
        }
        take.forEach((pp) => used.add(pp.id));
        if (take.length) sections.push({ label: sl.label, count: take.length });
        out.push(...take);
      });
      if (!out.length) { showToast("Nothing found nearby for that yet"); return; }
      // v4.64: honest small-market handling. If fewer than 10 strong picks
      // sit within 10 miles, this is a "best near {town}" list — group it by
      // real driving distance instead of pretending town limits filled it.
      const town = locName ? locName.split(",")[0].trim() : "";
      const thin = Radius.strongWithin(out, 10) < 10;
      let title2 = c.title, body2 = c.lead, places2 = out, sections2 = sections.length > 1 ? sections : null;
      if (thin && kind !== "experiences") {
        const bk = Radius.bucketize(out, town);
        places2 = bk.places;
        sections2 = bk.sections.length > 1 ? bk.sections : sections2;
        title2 = c.title.replace(" near you", town ? " near " + town : " near you");
        body2 = (town ? town + " is a smaller market, so this ranks the best within honest driving distance \u2014 every pick is labeled by how far it really is. " : "") + c.lead;
      }
      // v4.85: a thin market opens at the SMALLEST radius that actually shows the
      // list (17 → 30 → 45 → 60) instead of jumping straight to 60.
      const _fitMi = (() => { const _t = Math.min(10, places2.length); for (const mi of [DEFAULT_RADIUS_MI, 30, 45, 60]) { if (places2.filter((p) => p.distMi == null || p.distMi <= mi).length >= _t) return mi; } return 60; })();
      setHookDetail({ id: "cur-" + kind, key: "cur-" + kind, theme: "cur-" + kind, title: title2, themeTitle: title2, label: title2, take: body2, themeBody: body2, emoji: c.emoji, places: places2, sections: sections2, presetMi: thin ? _fitMi : c.presetMi });
    } catch (e) { showToast("Could not load that list"); }
  };
  const pickBrowse = (id) => { const nv = browseCat === id ? null : id; setMoodPick(nv); setBrowseCat(nv); if (nv) { setCat(nv); setSub("all"); setVibe("all"); } };
  const openCuisine = (label, fromPlace) => {
    if (!label) return;
    const ctx = { weather, hour: new Date().getHours(), isWeekend: [0, 6].includes(new Date().getDay()) };
    const pool = dedupePlaces([...(displayList || []), ...(places || [])].filter(Boolean), true);
    const list = Ranking.rankByConditions(pool.filter((p) => Dining.cuisineLabel(p) === label), ctx).slice(0, 10);
    setCuisineSheet({ label, list });
  };
  // v2.1: intent entries. Each opens an existing surface or a ranked quick list
  // built from data already loaded. No new fetching, no new card systems.
  const intentCtx = () => ({ weather, hour: new Date().getHours(), isWeekend: [0, 6].includes(new Date().getDay()) });
  const intentPool = () => dedupePlaces([...(suggested || []), ...(places || []), ...(homeTodo || [])].filter(Boolean), true);
  const openRainy = () => { const list = Ranking.rankByConditions(intentPool().filter((pp) => { try { return Ranking.venueLean(pp).lean === "indoor"; } catch { return false; } }), intentCtx()).slice(0, 10); setCuisineSheet({ title: "Rainy-day picks", sub: "Indoor spots that hold up, ranked for right now.", label: "rainy day", list }); };
  const [top10Open, setTop10Open] = useState(false);
  const [food10Open, setFood10Open] = useState(false);
  const [debugOn, setDebugOn] = useState(false);
  const noteRef = useRef(null);
  const [placeComments, setPlaceComments] = useState({});
  const [commentType, setCommentType] = useState("Tip");
  const [placePosts, setPlacePosts] = useState([]);
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => {
    let live = true;
    setPlacePosts([]); setConfirmDel(false);
    if (!supabase || !detail || detail._event || !detail.id) return;
    (async () => { try {
      const { data } = await supabase.from("comments").select("id,place_id,user_id,author,type,body,created_at").eq("place_id", detail.id).order("created_at", { ascending: false }).limit(20);
      if (live && Array.isArray(data)) setPlacePosts(data);
    } catch (e) {} })();
    return () => { live = false; };
  }, [detail && detail.id]);
  const [hookDetail, setHookDetail] = useState(null);
  const [viaTours, setViaTours] = useState({});
  // Sheet-local filter: the browse-style SortControl inside every themed list.
  const [hkSort, setHkSort] = useState("rated");
  const [hkMi, setHkMi] = useState(DEFAULT_RADIUS_MI);
  const [hkDeals, setHkDeals] = useState(false);
  useEffect(() => { setHkSort((hookDetail && hookDetail.presetSort) || "rated"); setHkMi((hookDetail && hookDetail.presetMi) || DEFAULT_RADIUS_MI); setHkDeals(false); }, [hookDetail && hookDetail.id]);
  // v4.85: never show "Not enough data" at 17 mi when the sheet's wide fetch
  // already found real places a few miles farther — bump the sheet radius up
  // the ladder until enough places are visible. Manual slider changes win
  // (this only reacts when the sheet's places arrive, not on user input).
  useEffect(() => {
    const pl = hookDetail && hookDetail.places;
    if (!pl || !pl.length) return;
    const _within = (mi) => pl.filter((p) => p.distMi == null || p.distMi <= mi).length;
    setHkMi((cur) => {
      const _t = Math.min(ADAPT_MIN, pl.length);
      if (cur >= 60 || _within(cur) >= _t) return cur;
      for (const mi of [30, 45, 60]) { if (mi > cur && _within(mi) >= _t) return mi; }
      return 60;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookDetail && hookDetail.id, hookDetail && hookDetail.places && hookDetail.places.length]);
  // Hook cards — computed from real data, refreshes when the place list changes.
  const hookCards = useMemo(() => {
    // AI hooks take priority — they use real place data for truly provocative copy.
    // Fall back to static templates while AI response is loading or if it fails.
    if (aiHooks && aiHooks.length > 0) return aiHooks;
    const src = (suggested && suggested.length > 0 ? suggested : places).filter(Boolean);
    return generateHooks(src, locName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiHooks, suggested && suggested.length, places && places.length, locName]);
  function handleHookAction(h) {
    if (!h || !h.action) return;
    const { type, place, key } = h.action;
    if (type === "detail" && place) openDetail(place);
    else if (type === "experience" && key) openExperience(key);
    else if (type === "explore") setScreen("explore");
  }
  const debounceRef = useRef(null);
  const tokenRef = useRef(null);
  const insightCache = useRef({});
  const scrollRef = useRef(null);
  const sheetDragRef = useRef({});
  const insightFullCache = useRef({});
  const detailCache = useRef({});
  // Engagement signals — stored in localStorage, used to personalise the feed.
  const [signals, setSignals] = useState([]);
  const [liked, setLiked] = useState({});
  useEffect(() => {
    if (!supabase) return;
    const onVis = () => { try { if (document.visibilityState === "visible") supabase.auth.getSession(); } catch (e) {} };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    try {
      if (!detail || detail._wfPhotosAdded || !detail.name) return;
      const _k = String(detail.name).toLowerCase();
      let own = null;
      for (const key in WAYFIND_PHOTOS) { if (_k.includes(key)) { own = WAYFIND_PHOTOS[key]; break; } }
      if (!own || !own.length) return;
      setDetail((d) => (d && d.id === detail.id ? { ...d, _wfPhotosAdded: true, photos: [...own, ...((d.photos || []).filter((x) => own.indexOf(x) === -1))], photoAttrs: [...own.map(() => "Wayfind"), ...(d.photoAttrs || [])] } : d));
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);
  useEffect(() => {
    if (!supabase || SIGNALS.loaded) return;
    supabase.from("place_signals").select("place_id").then(({ data }) => {
      SIGNALS.loaded = true;
      if (data) data.forEach((r) => { if (r && r.place_id) SIGNALS.map[r.place_id] = true; });
    }, () => { SIGNALS.loaded = true; });
  }, []);
  const [disliked, setDisliked] = useState({});
  const [likedItems, setLikedItems] = useState({});
  // v5.07 Coupons: saved coupons live on-device (wf_coupons) AND, when signed
  // in, in the cloud "Coupons" folder (saved_places) so they survive devices.
  // Dashboard-loaded offers rows merge with the code-shipped COUPONS list.
  const [savedCoupons, setSavedCoupons] = useState({});
  const [walletOpen, setWalletOpen] = useState(false); // v5.08: saved coupons stack like Apple Wallet — collapsed pile, tap to fan out
  const [cpnOffers, setCpnOffers] = useState([]);
  const _cpnLoadedRef = useRef(false);
  useEffect(() => {
    if (screen !== "coupons" || !supabase || _cpnLoadedRef.current) return;
    _cpnLoadedRef.current = true;
    supabase.from("offers").select("*").then(({ data }) => {
      if (!Array.isArray(data)) return;
      const rows = data.filter(offerRedeemable).map((o) => { try { if (!o) return null; const title = o.title || o.deal || o.description; if (!title) return null; return { id: "offer:" + (o.id || o.google_place_id || title), business: o.business_name || o.name || "", title: String(title), details: o.title ? (o.description || "") : "", code: o.code || null, url: o.url || null, cta: o.cta || null, expires: o.expires_at || o.expires || null, area: o.area || null }; } catch (e) { return null; } }).filter(Boolean);
      setCpnOffers(rows);
    }, () => {});
  }, [screen]);
  function toggleSaveCoupon(c) {
    if (!requireAuth("Sign in to save coupons")) return;
    if (!c || !c.id) return;
    const next = { ...savedCoupons };
    if (next[c.id]) { delete next[c.id]; svFolderDelete("Coupons", "coupon:" + c.id); }
    else { next[c.id] = { c, ts: Date.now() }; svFolderUpsert("Coupons", { id: "coupon:" + c.id, name: (c.business ? c.business + " — " : "") + c.title, address: c.details || "", types: ["coupon"], rating: null, reviews: 0, lat: null, lng: null, _coupon: c }); try { logEvent("coupon_save", null, { id: c.id }); } catch (e) {} }
    setSavedCoupons(next);
    try { localStorage.setItem("wf_coupons", JSON.stringify(next)); } catch (e) {}
  }
  function copyCouponCode(code) {
    const done = () => showToast("Code copied — show it at checkout");
    try { navigator.clipboard.writeText(code).then(done, () => { try { const ta = document.createElement("textarea"); ta.value = code; ta.style.position = "fixed"; ta.style.left = "-9999px"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); done(); } catch (e) {} }); } catch (e) {}
  }
  const [dislikedItems, setDislikedItems] = useState({});
  const [sharedItems, setSharedItems] = useState({});
  const [sysFolder, setSysFolder] = useState(null);
  const [listMenu, setListMenu] = useState(null);
  const [renamingList, setRenamingList] = useState(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupDone, setSignupDone] = useState(false);
  // Auth state (Supabase). Null user = signed out / no backend configured.
  const [user, setUser] = useState(null);
  // v5.49: true once the initial session check has resolved one way or the
  // other. Session restore is async (a Promise even when a cached session
  // exists), so a returning signed-in user's very first tap on a favorite
  // control could otherwise land in the window before `user` is populated
  // and get wrongly told to sign in. requireAuth() below waits on this.
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authSending, setAuthSending] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authMode, setAuthMode] = useState("signin"); // signin | signup
  // v4.57: Reservations folder. Outbound booking taps auto-log a stub the
  // user can complete with a confirmation number when they return. Affiliate
  // partners never send booking data back, so this is the honest capture.
  const [locApprox, setLocApprox] = useState(false);
  const [feedRetry, setFeedRetry] = useState(0);
  const pendingQRef = useRef(null);
  useEffect(() => { try { const qq = new URLSearchParams(window.location.search).get("q"); if (qq && qq.trim()) pendingQRef.current = qq.trim(); } catch (e) {} }, []);
  useEffect(() => { if (!pendingQRef.current || !center) return; const qq = pendingQRef.current; pendingQRef.current = null; try { window.history.replaceState({}, "", window.location.pathname); } catch (e) {} submitSearch(qq); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center]);
  const [introOpen, setIntroOpen] = useState(false);
  const [introSel, setIntroSel] = useState([]);
  const [locBannerGone, setLocBannerGone] = useState(false);
  // v5.39: the approximate-location notice is a fixed toast (no layout
  // shift) and dismisses itself after 8 seconds.
  useEffect(() => { if (!locApprox || locBannerGone) return; const t = setTimeout(() => setLocBannerGone(true), 8000); return () => clearTimeout(t); }, [locApprox, locBannerGone]);
  const [reservations, setReservations] = useState([]);
  useEffect(() => { try { setReservations(JSON.parse(localStorage.getItem("wf_reservations") || "[]")); } catch (e) {} }, []);
  function persistRes(next) { setReservations(next); try { localStorage.setItem("wf_reservations", JSON.stringify(next)); } catch (e) {} }
  function addReservation(kind, place, partner, url) {
    try {
      const entry = { id: "r" + Date.now() + Math.floor(Math.random() * 999), name: (place && place.name) || "Booking", placeId: place && place.id, kind, partner, at: new Date().toISOString(), url: url || "", conf: "" };
      persistRes([entry, ...reservations].slice(0, 50));
    } catch (e) {}
  }
  function saveResConf(id, conf) { persistRes(reservations.map((r) => r.id === id ? { ...r, conf: String(conf || "").slice(0, 60) } : r)); }
  function removeRes(id) { persistRes(reservations.filter((r) => r.id !== id)); }
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false); // account menu popover

  // Restore session on load and listen for sign-in / sign-out.
  useEffect(() => {
    if (!supabase) { setAuthReady(true); return; }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data && data.session && data.session.user) setUser(data.session.user);
      if (active) setAuthReady(true);
      try { if (typeof window !== "undefined" && (window.location.search.indexOf("code=") >= 0 || window.location.search.indexOf("error") >= 0 || window.location.hash.indexOf("access_token") >= 0)) window.history.replaceState({}, "", window.location.pathname); } catch (e) {}
    }).catch(() => { if (active) setAuthReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // v4.56 PROTECTED (check-auth.mjs): a reset-password email link lands the
      // user here with a recovery session. Open the set-new-password sheet.
      if (_event === "PASSWORD_RECOVERY") { try { setRecoveryOpen(true); setAuthOpen(false); } catch (e) {} }
      setUser(session && session.user ? session.user : null);
      try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("auth_event", { event: _event, hasSession: !!(session && session.user) }); } catch (e) {}
      try { if (session && session.user && typeof window !== "undefined" && window.posthog) window.posthog.identify(session.user.id); } catch (e) {}
      try { const _k = "wf_authlog"; const _a = JSON.parse(localStorage.getItem(_k) || "[]"); _a.push({ t: new Date().toISOString().slice(5, 19), e: _event, s: !!(session && session.user) }); localStorage.setItem(_k, JSON.stringify(_a.slice(-12))); } catch (e) {}
    });
    return () => { active = false; if (sub && sub.subscription) sub.subscription.unsubscribe(); };
  }, []);

  // v5.49: the single sign-in gate for every favorite-like persistence action
  // (save, like, dislike, hook-save, share-to-list, coupon-save, custom
  // lists, itinerary/trip membership). Every write function that can create
  // local, localStorage, or Supabase favorite state calls this FIRST and
  // bails out (before any state mutation) if it returns false — this is the
  // one source of truth for "must be signed in", reusing the existing
  // user/setAuthOpen convention already used by the community-comment flow
  // rather than a second auth mechanism. While the initial session check is
  // still in flight (authReady false), we neither block nor allow — a
  // returning signed-in user's very first tap must not be wrongly told to
  // sign in just because the session hasn't resolved yet.
  function requireAuth(msg) {
    if (user) return true;
    if (!authReady) return false;
    setAuthOpen(true);
    showToast(msg || "Sign in to save");
    return false;
  }

  // v5.61 (audit P0): landing on a personal screen (Favorites/Itinerary) while
  // signed out — via nav tap, deep link (?go=favorites), or restore — pops the
  // sign-in dialog. The screen content is already withheld (AuthWall renders
  // instead); this makes the required next action immediate. Fires once auth
  // has resolved, so a returning signed-in user is never prompted.
  useEffect(() => {
    if (authReady && !user && AUTH_SCREENS.has(screen)) setAuthOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, authReady, user]);

  // One-tap social sign-in. No email, no rate limits. Needs the provider enabled
  // in Supabase. Redirects out to Google/Apple and back to the app.
  async function signInWithProvider(provider) {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: typeof window !== "undefined" ? (/\.vercel\.app$/i.test(window.location.hostname || "") ? CANON_ORIGIN : window.location.origin) : undefined } });
      if (error) showToast(`Sign-in error: ${error.message}`);
    } catch (e) { showToast(e && e.message ? `Sign-in error: ${e.message}` : "Could not sign in"); }
  }
  // Email + password. Works with no email sending at all if "Confirm email" is
  // turned off in Supabase. Sign in for existing accounts, sign up for new ones.
  function fixEmailTypos(raw) {
    let e = String(raw || "").trim().toLowerCase();
    if (!e || e.indexOf("@") < 0) return null;
    const before = e;
    e = e.replace(/\.con$/, ".com").replace(/\.cmo$/, ".com").replace(/\.ocm$/, ".com").replace(/\.comm$/, ".com");
    e = e.replace(/@gmial\./, "@gmail.").replace(/@gamil\./, "@gmail.").replace(/@gnail\./, "@gmail.").replace(/@hotmial\./, "@hotmail.").replace(/@iclod\./, "@icloud.").replace(/@icoud\./, "@icloud.").replace(/@yahooo\./, "@yahoo.");
    return e !== before ? e : null;
  }
  async function passwordAuth() {
    if (!supabase || !authEmail || !authPassword) return;
    const fixed = fixEmailTypos(authEmail);
    if (fixed) { setAuthEmail(fixed); showToast("Fixed a typo in your email \u2014 check it and tap again."); return; }
    setAuthSending(true);
    try {
      const creds = { email: authEmail.trim(), password: authPassword };
      // v5.05: signup goes through OUR server route (admin-created, email
      // pre-confirmed) \u2014 live testing caught Supabase's mailer 500ing on
      // "Error sending confirmation email", which silently blocked ALL
      // signups. Server-side creation removes the email dependency entirely;
      // the user is signed in with their password immediately after. If the
      // route is unavailable (501), fall back to the classic email flow.
      if (authMode === "signup") {
        let viaRoute = false;
        try {
          const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) });
          if (r.status === 409) { setAuthMode("signin"); showToast("This email already has an account \u2014 sign in below."); setAuthSending(false); return; }
          if (r.ok) viaRoute = true;
          else if (r.status !== 501) { const d = await r.json().catch(() => ({})); showToast("Could not create account" + (d && d.error ? ": " + d.error : "")); setAuthSending(false); return; }
        } catch (e) {}
        if (viaRoute) {
          const res = await supabase.auth.signInWithPassword(creds);
          if (res.error) showToast("Account created \u2014 now sign in: " + res.error.message);
          else { showToast("Account created \u2014 you're signed in."); setAuthOpen(false); setAuthEmail(""); setAuthPassword(""); }
          setAuthSending(false); return;
        }
      }
      let res = authMode === "signup"
        ? await supabase.auth.signUp(creds)
        : await supabase.auth.signInWithPassword(creds);
      // v5.05: accounts created while the confirmation mailer was broken sit
      // unconfirmed forever — confirm them server-side and retry once.
      if (res.error && /not confirmed/i.test(res.error.message || "") && authMode !== "signup") {
        try {
          const cr = await fetch("/api/auth/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: creds.email }) });
          if (cr.ok) res = await supabase.auth.signInWithPassword(creds);
        } catch (e) {}
      }
      if (res.error) { showToast(`Sign-in error: ${res.error.message}`); }
      else if (res.data && res.data.session) { showToast("Signed in"); setAuthOpen(false); setAuthEmail(""); setAuthPassword(""); }
      else if (authMode === "signup" && res.data && res.data.user && Array.isArray(res.data.user.identities) && res.data.user.identities.length === 0) { setAuthMode("signin"); showToast("This email already has an account \u2014 sign in below."); }
      else { showToast((isStandalone ? "Account created. Confirm from the email, then come back here and sign in with your password. The email link opens Safari, not this app \u2014 that is normal." : "Account created. Check your email to confirm, then sign in.")); }
    } catch (e) { showToast(e && e.message ? `Sign-in error: ${e.message}` : "Could not sign in"); }
    setAuthSending(false);
  }

  // v4.56 PROTECTED (check-auth.mjs): "Forgot password" sends the Supabase
  // recovery email pointed at the canonical domain.
  async function sendPasswordReset() {
    if (!supabase) return;
    const em = (authEmail || "").trim();
    if (!em || em.indexOf("@") < 0) { showToast("Type your email above first, then tap Forgot password."); return; }
    setResetSending(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo: CANON_ORIGIN });
      if (error) showToast("Could not send reset email: " + error.message);
      else showToast("Reset email sent to " + em + ". Open the link, then set a new password here.");
    } catch (e) { showToast("Could not send reset email"); }
    setResetSending(false);
  }
  async function saveNewPassword() {
    if (!supabase || !newPw) return;
    if (newPw.length < 8) { showToast("Use at least 8 characters."); return; }
    if (newPw !== newPw2) { showToast("Passwords do not match."); return; }
    setPwSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) showToast("Could not update password: " + error.message);
      else { showToast("Password updated. You are signed in."); setRecoveryOpen(false); setNewPw(""); setNewPw2(""); }
    } catch (e) { showToast("Could not update password"); }
    setPwSaving(false);
  }

  async function signOutUser() {
    if (!supabase) return;
    try { await supabase.auth.signOut(); } catch {}
    setUser(null);
    showToast("Signed out");
  }
  async function wfShowDiag() {
    try {
      let msg = "URL params: " + (window.location.search || window.location.hash || "clean");
      try { const { data: _d } = await supabase.auth.getSession(); msg = "Session: " + (_d && _d.session ? "ACTIVE, token until " + new Date(_d.session.expires_at * 1000).toTimeString().slice(0, 8) : "NONE") + "\n" + msg; } catch (e) { msg = "Session: NONE (no client)\n" + msg; }
      msg += "\n\nAuth log (old\u2192new):\n" + (JSON.parse(localStorage.getItem("wf_authlog") || "[]").map((r) => r.t + "  " + r.e + (r.s ? " \u2713" : " \u2717")).join("\n") || "(empty)");
      alert("Wayfind " + BUILD_ID + "\n" + msg);
    } catch (e) {}
  }

  // When a user signs in, push local favorites/likes up and pull theirs down,
  // so saves persist to their account and sync across devices.
  useEffect(() => {
    if (!supabase || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const favPlaces = (lists.favorites && lists.favorites.places) || [];
        if (favPlaces.length) {
          await supabase.from("saved_places").upsert(
            favPlaces.map((p) => ({ user_id: user.id, place_id: p.id, place: p, list_name: "Favorites" })),
            { onConflict: "user_id,place_id,list_name", ignoreDuplicates: true }
          );
        }
      } catch {}
      try {
        const { data: saved } = await supabase.from("saved_places").select("place").eq("user_id", user.id).eq("list_name", "Favorites");
        if (!cancelled && saved) {
          const remote = saved.map((r) => r.place).filter(Boolean);
          setLists((prev) => {
            const fav = prev.favorites || { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
            const byId = {};
            [...fav.places, ...remote].forEach((p) => { if (p && p.id) byId[p.id] = p; });
            return { ...prev, favorites: { ...fav, places: Object.values(byId) } };
          });
        }
        const { data: dbLikes } = await supabase.from("likes").select("place_id").eq("user_id", user.id);
        if (!cancelled && dbLikes) {
          setLiked((prev) => { const next = { ...prev }; dbLikes.forEach((r) => { next[r.place_id] = true; }); return next; });
        }
        const { data: likeRows } = await supabase.from("likes").select("place_id, place").eq("user_id", user.id);
        if (!cancelled && likeRows) { let curL = {}; try { curL = JSON.parse(localStorage.getItem("wf_liked_items") || "{}"); } catch {} likeRows.forEach((r, i) => { if (r.place && r.place_id && !curL[r.place_id]) curL[r.place_id] = { place: r.place, ts: Date.now() - i }; }); try { localStorage.setItem("wf_liked_items", JSON.stringify(curL)); } catch {} setLikedItems(curL); }
        const { data: disRows } = await supabase.from("saved_places").select("place").eq("user_id", user.id).eq("list_name", "Disliked");
        if (!cancelled && disRows) { let curD = {}; try { curD = JSON.parse(localStorage.getItem("wf_disliked_items") || "{}"); } catch {} disRows.forEach((r, i) => { if (r.place && r.place.id && !curD[r.place.id]) curD[r.place.id] = { place: r.place, ts: Date.now() - i }; }); try { localStorage.setItem("wf_disliked_items", JSON.stringify(curD)); } catch {} setDislikedItems(curD); }
        const { data: shrRows } = await supabase.from("saved_places").select("place").eq("user_id", user.id).eq("list_name", "Shared");
        if (!cancelled && shrRows) { let curS = {}; try { curS = JSON.parse(localStorage.getItem("wf_shared_items") || "{}"); } catch {} shrRows.forEach((r, i) => { if (r.place && r.place.id && !curS[r.place.id]) curS[r.place.id] = { place: r.place, ts: Date.now() - i }; }); try { localStorage.setItem("wf_shared_items", JSON.stringify(curS)); } catch {} setSharedItems(curS); }
        try {
          const srvL = new Set((likeRows || []).map((r) => r.place_id));
          const lL = JSON.parse(localStorage.getItem("wf_liked_items") || "{}");
          Object.keys(lL).forEach((id) => { const pl = lL[id] && lL[id].place; if (pl && pl.id && !srvL.has(id)) supabase.from("likes").upsert({ user_id: user.id, place_id: pl.id, place: pl }, { onConflict: "user_id,place_id" }).then(() => {}, () => {}); });
          const srvD = new Set((disRows || []).map((r) => r.place && r.place.id));
          const lD = JSON.parse(localStorage.getItem("wf_disliked_items") || "{}");
          Object.keys(lD).forEach((id) => { const pl = lD[id] && lD[id].place; if (pl && pl.id && !srvD.has(id)) supabase.from("saved_places").upsert({ user_id: user.id, place_id: pl.id, place: pl, list_name: "Disliked" }, { onConflict: "user_id,place_id,list_name" }).then(() => {}, () => {}); });
          const srvS = new Set((shrRows || []).map((r) => r.place && r.place.id));
          const lS = JSON.parse(localStorage.getItem("wf_shared_items") || "{}");
          Object.keys(lS).forEach((id) => { const pl = lS[id] && lS[id].place; if (pl && pl.id && !srvS.has(id)) supabase.from("saved_places").upsert({ user_id: user.id, place_id: pl.id, place: pl, list_name: "Shared" }, { onConflict: "user_id,place_id,list_name" }).then(() => {}, () => {}); });
        } catch {}
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [user]);

  // "Worth the Drive?" feature
  const [detailContext, setDetailContext] = useState(null); // theme that opened the detail ("drive", "gem", etc.)
  const [myVotes, setMyVotes] = useState({});
  // v5.35: the loader's "Friday evening" moment phrase — post-mount only,
  // so the (possibly hour-stale) ISR HTML and the client can't disagree.
  const [bootMoment, setBootMoment] = useState(null);
  useEffect(() => { try { const _d = new Date(); const _wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][_d.getDay()]; const _h = _d.getHours(); const _dp = _h < 6 ? "night" : _h < 12 ? "morning" : _h < 17 ? "afternoon" : "evening"; setBootMoment(`${_wd} ${_dp}`); } catch (e) {} }, []);
  // v5.33 hydration fix: every localStorage-backed state above used to be
  // read in its useState initializer — the server rendered the empty
  // fallback, a returning visitor's first client render produced real data,
  // and React hydration failed (minified errors 418/423/425 → full client
  // re-render of the root). All of them now start at the same deterministic
  // fallback on both sides and load from storage after mount, in one place.
  useEffect(() => {
    try { setHookLikes(new Set(JSON.parse(localStorage.getItem("wf_hook_likes") || "[]"))); } catch {}
    try { if (localStorage.getItem("wf_debug") === "1" || /[?&]debug=1/.test(window.location.search)) setDebugOn(true); } catch {}
    try { const c = JSON.parse(localStorage.getItem("wf_place_comments") || "{}"); const legacy = JSON.parse(localStorage.getItem("wf_place_notes") || "{}"); for (const k in legacy) { if (legacy[k] && !c[k]) c[k] = { type: "Tip", text: legacy[k] }; } for (const k in c) { const t = c[k] && c[k].type; if (t === "Insider tip") c[k].type = "Tip"; else if (t === "Recommendation") c[k].type = "Review"; } setPlaceComments(c); } catch {}
    try { setSignals(loadSignals()); } catch {}
    try { setLiked(JSON.parse(localStorage.getItem("wf_liked") || "{}")); } catch {}
    try { setDisliked(JSON.parse(localStorage.getItem("wf_disliked") || "{}")); } catch {}
    try { setLikedItems(JSON.parse(localStorage.getItem("wf_liked_items") || "{}")); } catch {}
    try { setSavedCoupons(JSON.parse(localStorage.getItem("wf_coupons") || "{}")); } catch {}
    try { setDislikedItems(JSON.parse(localStorage.getItem("wf_disliked_items") || "{}")); } catch {}
    try { setSharedItems(JSON.parse(localStorage.getItem("wf_shared_items") || "{}")); } catch {}
    try { setSignupDone(!!localStorage.getItem("wf_signed_up")); } catch {}
    try { setMyVotes(JSON.parse(localStorage.getItem("wf_drive_votes") || "{}")); } catch {}
  }, []);
  const [communityVotes, setCommunityVotes] = useState({});
  const [searchMode, setSearchMode] = useState(false);
  const [searchLabel, setSearchLabel] = useState("");
  const galleryRef = useRef(null);
  function scrollGallery(dir) {
    const el = galleryRef.current;
    if (el) el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.85), behavior: "smooth" });
  }

  // Detect viewport so desktop gets a wider, side-by-side layout.
  const [vw, setVw] = useState(0);
  useEffect(() => {
    const onR = () => setVw(window.innerWidth);
    onR();
    window.addEventListener("resize", onR);
    return () => window.removeEventListener("resize", onR);
  }, []);
  const isDesktop = vw >= 900;
  const keyMissing = !process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  function openSurprise() {
    setSurprisePick(null);
    setScreen("surprise");
    try { window.scrollTo(0, 0); } catch {}
  }
  function pickSurprise(pool) {
    if (!pool || !pool.length) return null;
    const open = pool.filter((p) => p.openNow === true);
    const src = (open.length >= 3 ? open : pool).slice(0, 8);
    return src[Math.floor(Math.random() * src.length)];
  }
  function rerollSurprise() {
    const pool = (surprisePool || []).filter(Boolean);
    if (!pool.length) { showToast("Nothing to roll here yet"); return; }
    setRolling(true);
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const iv = setInterval(() => setDiceFace(faces[Math.floor(Math.random() * 6)]), 85);
    setTimeout(() => {
      clearInterval(iv);
      setRolling(false);
      setDiceFace("🎲");
      setSurprisePick(pool[Math.floor(Math.random() * pool.length)]);
    }, 800);
  }

  // The pool the dice rolls from depends on where the user is: their favorites,
  // their For You feed, a badge page, or the current list of nearby spots.
  function rollDicePool() {
    if (screen === "saved") {
      if (activeList && lists[activeList]) return lists[activeList].places;
      return Object.values(lists).flatMap((l) => l.places || []);
    }
    if (screen === "suggested") return suggested || [];
    if (screen === "experience") return expPlaces || [];
    return view;
  }
  function animateRollThenPick(rawPool) {
    const pool = (rawPool || []).filter(Boolean);
    if (!pool.length) { showToast("Nothing to roll here yet"); setRolling(false); return; }
    setRolling(true);
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const iv = setInterval(() => setDiceFace(faces[Math.floor(Math.random() * 6)]), 85);
    setTimeout(() => {
      clearInterval(iv);
      setRolling(false);
      setDiceFace("🎲");
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) { diceRouteRef.current = true; setSurprisePool(pool); setSurprisePick(pick); setScreen("surprise"); try { window.scrollTo(0, 0); } catch {} }
    }, 1000);
  }
  function rollDice() { try { logEvent("dice", null); } catch (e) {} setDiceChoose(true); }
  // In-place dice roll for the home Pick-for-me panel. Spins, lands on a random
  // spot from the current feed, and pushes it onto a session roll history the
  // user can scroll back through. Does not navigate away.
  function rollHomePick(pool) {
    const arr = (pool || []).filter(Boolean);
    if (!arr.length) { showToast("Nothing to roll here yet"); return; }
    setHomeRolling(true);
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const iv = setInterval(() => setHomeDiceFace(faces[Math.floor(Math.random() * 6)]), 90);
    setTimeout(() => {
      clearInterval(iv);
      setHomeDiceFace("🎲");
      setHomeRolling(false);
      const pick = arr[Math.floor(Math.random() * arr.length)];
      if (pick) setRollHistory((h) => [pick, ...h.filter((x) => x && x.id !== pick.id)].slice(0, 8));
    }, 900);
  }
  async function rollFor(spec) {
    setDiceChoose(false);
    if (!spec || spec.any || !center) { animateRollThenPick(rollDicePool()); return; }
    setRolling(true);
    const faces = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
    const iv = setInterval(() => setDiceFace(faces[Math.floor(Math.random() * 6)]), 85);
    let res = [];
    try { res = await searchPlaces(spec.cat, "all", { lat: center.lat, lng: center.lng }, 32000, "all", spec.kw || ""); } catch {}
    let pool = (res || []).filter(Boolean).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
    const availToday = pool.filter((p) => p.openNow !== false || (p.nextOpen && p.nextOpen.today));
    res = (availToday.length >= 3 ? availToday : pool).slice(0, 12);
    setTimeout(() => {
      clearInterval(iv);
      setRolling(false);
      setDiceFace("🎲");
      if (res.length) { const pick = res[Math.floor(Math.random() * res.length)]; diceRouteRef.current = true; setSurprisePool(res); setSurprisePick(pick); setScreen("surprise"); try { window.scrollTo(0, 0); } catch {} }
      else showToast("Nothing found nearby, try another");
    }, 900);
  }

  // PROTECTED (check-cards.mjs): revenue keys open the themed Best-of style
  // sheet — never the legacy experience screen.
  function openExpSheet(key) {
    const e = EXPERIENCES[key]; if (!e) return;
    const m = revenueExpMeta(key, cityNow) || {};
    setHookDetail({ id: "exp-" + key, theme: key, fetchKey: key, accent: m.accent || C.accent, emoji: e.icon, label: cityFix(e.label), highlightWord: m.hl || "", hook: m.hook || e.lead || e.title, subtitle: m.sub || "", cta: m.cta || "Explore \u2192", themeTitle: cityFix(e.title), themeBody: e.lead, places: null });
    try { window.scrollTo(0, 0); } catch {}
  }
  function openMoment(sel) {
    try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {}
    setIntroOpen(false);
    try { logEvent("intro_build", null, { chips: sel.join(",") }); } catch (e) {}
    const spec = composeMoment(sel, cityNow);
    if (spec.surprise) { setMenuSheet("pick"); return; }
    const e = EXPERIENCES[spec.base] || EXPERIENCES.entertainment;
    setHookDetail({ id: "moment-" + Date.now(), theme: spec.base, fetchKey: spec.base, radiusOverride: spec.radiusOverride, priceMax: spec.priceMax, openNowOnly: spec.openNowOnly, extraKeyword: spec.extraKeyword, accent: C.accent, emoji: e.icon, label: spec.title, highlightWord: "", hook: spec.title, subtitle: spec.body || "", cta: "", themeTitle: spec.title, themeBody: spec.body || e.lead, places: null });
    try { window.scrollTo(0, 0); } catch (e2) {}
  }
  function openExperience(key) {
    if (!EXPERIENCES[key]) return;
    if (REVENUE_EXP_KEYS.includes(key)) { openExpSheet(key); return; }
    setActiveBadge(key);
    setExpPlaces(null);
    setExpSort("rated");
    // Moment fix (MOMENT_PICKS_DIAGNOSIS.md, Phase 1): open a moment view at
    // the INTENT's real scope, not the app-wide 17mi default that hid the
    // museums/cafés a mood day is made of. The effect still fetches wide; this
    // is the visible-list radius, so the same intent shows the same places
    // whether it's opened from a chip, the mood modal, or a deep link.
    setExpMi(intentRadiusMi(key));
    setScreen("experience");
    try { window.scrollTo(0, 0); } catch {}
  }

  function openSuggested() {
    setIntent(null);
    setCat("food");
    setSub("all");
    setVibe("all");
    setQuery("");
    setEventCat("all");
    setEventDate("all");
    setBrowseCat(null);
    setMoodPick(null);
    setScreen("suggested");
    try { window.scrollTo(0, 0); } catch {}
  }

  // Tapping an event venue opens that venue as a real Wayfind place, so its AI
  // tips (arrival, parking, what to know) come from the venue's own reviews.
  async function openVenue(e) {
    const q = [e.venue, e.city].filter(Boolean).join(" ");
    if (!q) return;
    showToast("Loading venue…");
    const ctr = (e.lat != null && e.lng != null) ? { lat: e.lat, lng: e.lng } : center;
    try {
      const v = await findPlace(q, ctr);
      if (v) {
        if (v.lat != null && v.lng != null && center && center.lat != null) {
          const d = miBetween(center.lat, center.lng, v.lat, v.lng);
          if (d != null) v.distMi = d;
        }
        v._event = { name: e.name || "Event", date: e.date || "", time: e.time || "", url: e.url || "" };
        openDetail(v);
      } else showToast("Could not find this venue");
    } catch { showToast("Could not load venue details"); }
  }

  // Swipe a bottom sheet down (from its top) to close it, shared across every pop-up
  // sheet. Engages only when the sheet is scrolled to the top and the pull is clearly
  // downward, so normal scrolling and any horizontal content keep working; each sheet
  // passes its own close action. Tapping a Close button still works too.
  function sheetDragStart(e, onClose) {
    const el = e.currentTarget;
    const t = e.touches[0];
    sheetDragRef.current = { el, onClose, y0: t.clientY, x0: t.clientX, atTop: el.scrollTop <= 0, active: true, decided: false, dragging: false, dy: 0 };
    el.style.transition = "none";
  }
  function sheetDragMove(e) {
    const d = sheetDragRef.current;
    if (!d || !d.active || !d.el) return;
    const dy = e.touches[0].clientY - d.y0;
    const dx = e.touches[0].clientX - d.x0;
    if (!d.decided) {
      if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return;
      d.decided = true;
      d.dragging = d.atTop && dy > 0 && Math.abs(dy) > Math.abs(dx);
      if (!d.dragging) { d.active = false; return; }
    }
    if (d.dragging && dy > 0) { d.dy = dy; d.el.style.transform = "translateY(" + dy + "px)"; }
  }
  function sheetDragEnd() {
    const d = sheetDragRef.current;
    const el = d && d.el;
    if (!el) { sheetDragRef.current = {}; return; }
    el.style.transition = SHEET_EASE;
    if (d.dragging && d.dy > 90) {
      el.style.transform = "translateY(110%)";
      const oc = d.onClose;
      setTimeout(() => { try { oc && oc(); } catch (er) {} }, 340);
    } else {
      el.style.transform = "translateY(0px)";
    }
    sheetDragRef.current = {};
  }

  const openGemPlace = async (g) => {
    try {
      showToast("Opening " + g.name + "\u2026");
      const pl = await findPlace(g.name + " " + (g.area || "Orlando") + " FL", center);
      if (pl && pl.id) openDetail(pl); else showToast("Couldn't find " + g.name + " right now");
    } catch (e) { showToast("Couldn't open " + g.name + " right now"); }
  };
  // Unique finds: curated gems Google's prominence ranking buries. Renders from
  // static data (zero passive Google calls); tapping a gem runs one cached
  // findPlace and opens the detail sheet.
  // v4.85 — VIATOR LOCATION FIX: every entry in Gems.GEMS is an Orlando-market
  // venue. This rail used to render for EVERY user, so a Parrish user could
  // tap into an Orlando detail sheet whose Viator links were Orlando products
  // ("Explore Orlando"). It now renders only inside the Orlando metro.
  const renderUniqueFinds = () => {
    if (Culture.resolveMetro(locName) !== "orlando") return null;
    return (
    <div style={{ margin: "14px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.light }}>Unique finds near you</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: ".5px", textTransform: "uppercase" }}>curated</div>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
        {Gems.GEMS.map((g) => (
          <div key={g.key} onClick={() => openGemPlace(g)} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ minWidth: 218, maxWidth: 218, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 13px", cursor: "pointer", flexShrink: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: C.light, lineHeight: 1.2 }}>{g.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5, flexWrap: "wrap" }}>
              {g.award ? <span style={{ fontSize: 9.5, fontWeight: 800, color: "#E8B84B", border: "1px solid rgba(232,184,75,.5)", borderRadius: 999, padding: "2px 8px", letterSpacing: ".4px" }}>{g.award.label}</span> : null}
              <span style={{ fontSize: 10.5, fontWeight: 600, color: C.muted }}>{g.area}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, marginTop: 7, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{g.note}</div>
          </div>
        ))}
      </div>
    </div>
    );
  };

  // World Cup hero card. topSlot=true renders only on match days (fixed
  // knockout calendar); topSlot=false renders mid-feed on off days.
  const renderWorldCupCard = (topSlot) => { const _w = Hol.worldCup(new Date()); if (!_w) return null; if (Hol.worldCupDaysToNext(new Date()) > 2) return null; if (!!topSlot !== Hol.worldCupMatchToday(new Date())) return null; const _wc = Hol.themeFor(_w.key); const _wct = Hol.contentFor(_w.key, _w.name); return (
                      <div onClick={() => openHoliday(_w)} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ cursor: "pointer", borderRadius: 18, padding: "18px 16px 16px", marginBottom: 12, background: _wc.grad, border: `1px solid ${_wc.border}`, boxShadow: "0 10px 28px rgba(0,0,0,.42)", position: "relative", overflow: "hidden" }}>
                      <style>{"@keyframes wcJuggle{0%{transform:translateY(0) rotate(0deg);animation-timing-function:cubic-bezier(.17,.84,.44,1)}45%{transform:translateY(-26px) rotate(180deg);animation-timing-function:cubic-bezier(.55,0,.85,.36)}90%{transform:translateY(0) rotate(360deg)}100%{transform:translateY(0) rotate(360deg)}}@keyframes wcBob{0%,86%,100%{transform:translateY(0)}93%{transform:translateY(2px)}}@keyframes wcGlow{0%,100%{opacity:.5}50%{opacity:1}}"}</style>
                      <span style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0px, rgba(255,255,255,.03) 26px, transparent 26px, transparent 52px)", pointerEvents: "none" }} />
                      <span aria-hidden="true" style={{ position: "absolute", right: 12, bottom: 6, width: 64, height: 116, pointerEvents: "none", opacity: .97 }}><span style={{ position: "absolute", left: 35, bottom: 72, fontSize: 15, animation: "wcJuggle 1.5s infinite" }}>⚽</span><img src="/wf-player.png" alt="" draggable={false} style={{ position: "absolute", left: 32, bottom: 0, height: 74, width: "auto", animation: "wcBob 1.5s infinite", filter: "drop-shadow(0 3px 8px rgba(0,0,0,.5))" }} /></span>
                      
                      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: _wc.stripe, animation: "wcGlow 2.8s ease-in-out infinite" }} />
                      <button onClick={(e) => { e.stopPropagation(); const _t = _wct.headline(locName); shareLink(_t, listShareUrl("hol-worldcup", _t, 0, locName, "worldcup"), () => showToast("Link copied"), "Where to watch the World Cup on Wayfind: " + _t, () => { try { logEvent("share", null, { kind: "list", theme: "hol-worldcup" }); } catch (er) {} }); }} aria-label="Share" title="Share" style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: "50%", background: "rgba(0,0,0,.35)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", zIndex: 2 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 24, filter: "drop-shadow(0 0 8px rgba(232,184,75,.6))" }}>{_w.emoji}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: _wc.text, textTransform: "uppercase" }}>{_wct.tag}</span>
                      </div>
                      <div style={{ fontSize: 21, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.15, letterSpacing: "-0.3px" }}>{_wct.headline(locName)}</div>
                      <div style={{ fontSize: 12.5, color: _wc.text, marginTop: 5, lineHeight: 1.4 }}>{_wct.sub}</div>
                      <div style={{ display: "inline-flex", alignItems: "center", marginTop: 12, padding: "8px 16px", borderRadius: 999, background: _wc.accent, color: "#0D1117", fontSize: 12.5, fontWeight: 800 }}>See the watch parties ›</div>
                      <div style={{ display: "flex", gap: 18, marginTop: 12, flexWrap: "wrap", paddingRight: 56 }}>
                      <a href="https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 11.5, fontWeight: 700, color: _wc.text, textDecoration: "underline" }}>Schedule and tickets ↗</a>
                      <a href="https://watchwc.com" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ fontSize: 11.5, fontWeight: 700, color: _wc.text, textDecoration: "underline" }}>Find tonight's game ↗</a>
                      </div>
                      </div>
                      ); };

  function shareApp() {
    const url = CANON_ORIGIN;
    shareLink("Wayfind", url, () => { setShareCopied(true); setTimeout(() => setShareCopied(false), 1800); }, "Find great things to do near you with Wayfind", () => { try { logEvent("share", null, { kind: "app" }); } catch (e) {} });
  }
  function pickCat(id) { setCat(id); setSub("all"); setVibe("all"); setQuickFilter(null); setSearchMode(false); setSearchLabel(""); setScreen("explore"); }
  // Reset the scroll container to the top whenever the list the user is looking
  // at changes — category, sub-filter, vibe, sort, intent, distance, or screen.
  // Without this, changing a filter leaves you stranded mid-list looking at
  // different content.
  useEffect(() => { try { if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 }); } catch (e) {} setMapPreview(null); setEventPreview(null); setMapDrawer(false); }, [cat, sub, vibe, intent, searchRadius, screen, activeBadge]);
  // Reset the explore list back to 5 whenever a new result set loads or search mode flips.
  useEffect(() => { setVisibleCount(5); }, [places, searchMode]);
  function pickSub(id) { setSub(id); setVibe("all"); try { logEvent("filter_changed", null, { cat, sub: id }); } catch (e) {} }

  // Signal functions — record engagement, drive personalised ranking, trigger sign-up.
  function recordSignal(p, action) {
    const pc = (primaryCategory(p) || "").toLowerCase();
    const badges = experienceBadges(p, null, 6).map((b) => b.key);
    const sig = { id: p.id, cat: pc, badges, rating: p.rating || null, action, ts: Date.now() };
    const next = [sig, ...signals.filter((s) => !(s.id === p.id && s.action === action))].slice(0, 1000);
    setSignals(next);
    saveSignals(next);
  }
  // Pooled, anonymous engagement log. One fire-and-forget row per action into a
  // shared Supabase "events" table — this is the proprietary signal Google can't
  // give us (what locals actually like, save, and share). Never throws, never
  // blocks the UI, and only writes when a backend is configured.
  // PostHog init moved to app/components/PostHogProvider.js (v5.50),
  // mounted in the root layout so every route gets it, not just this one.
  // v5.39 field Core Web Vitals -> PostHog (July 2026 audit, Phase 7). The
  // hourly /api/cron/cwv job stores LAB metrics (PageSpeed API); this is the
  // missing FIELD half — real visits, tagged by route, device, location
  // permission outcome, and signed-in state (read from window.__WF_CTX so
  // the values are current at metric time, not frozen in this closure).
  useEffect(() => {
    if (typeof window === "undefined" || window._wfVitals) return;
    window._wfVitals = true;
    import("web-vitals").then(({ onLCP, onCLS, onINP, onTTFB, onFCP }) => {
      const send = (m) => {
        try {
          if (!window.posthog) return;
          const ctx = window.__WF_CTX || {};
          window.posthog.capture("web_vitals", { metric: m.name, value: Math.round(m.name === "CLS" ? m.value * 1000 : m.value), rating: m.rating, route: window.location.pathname, device: window.innerWidth < 768 ? "mobile" : "desktop", loc_permission: ctx.locPermission || "unknown", signed_in: !!ctx.signedIn, build: BUILD_ID });
        } catch (e) {}
      };
      [onLCP, onCLS, onINP, onTTFB, onFCP].forEach((f) => { try { f(send); } catch (e) {} });
    }).catch(() => {});
  }, []);
  useEffect(() => { try { window.__WF_CTX = { signedIn: !!user, locPermission: deviceLoc ? "granted" : locApprox ? "ip-fallback" : "pending" }; } catch (e) {} }, [user, deviceLoc, locApprox]);
  // Screen views: this app switches screens via state, not URLs, so PostHog page autocapture misses them.
  useEffect(() => { try { logEvent("screen_view", null, { screen }); } catch (e) {} }, [screen]);
  function logEvent(action, place, extra) {
    try { if (place && place.type) tasteBump(place); } catch (e) {}
    try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture(action, Object.assign({ place_id: (place && place.id) || (extra && extra.place_id) || null, place_name: (place && place.name) || null }, extra || {})); } catch (e0) {}
    try {
      if (!supabase) return;
      const row = {
        action,
        place_id: (place && place.id) || (extra && extra.place_id) || null,
        place_name: (place && place.name) || null,
        device_id: deviceId(),
        user_id: user ? user.id : null,
        meta: extra || null,
      };
      supabase.from("events").insert(row).then(() => {}, () => {});
    } catch (e) {}
  }
  // Auto folders (Liked / Disliked / Shared). Saved on the server for signed-in users via saved_places reserved names; likes also use the existing likes table.
  function svFolderUpsert(listName, p) {
    if (supabase && user && p && p.id) supabase.from("saved_places").upsert({ user_id: user.id, place_id: p.id, place: p, list_name: listName }, { onConflict: "user_id,place_id,list_name" }).then(() => {}, () => {});
  }
  function svFolderDelete(listName, id) {
    if (supabase && user && id) supabase.from("saved_places").delete().eq("user_id", user.id).eq("place_id", id).eq("list_name", listName).then(() => {}, () => {});
  }
  function addShared(p) {
    if (!requireAuth("Sign in to save shared places")) return;
    if (!p || !p.id) return;
    const next = { ...sharedItems, [p.id]: { place: p, ts: Date.now() } };
    setSharedItems(next);
    try { localStorage.setItem("wf_shared_items", JSON.stringify(next)); } catch {}
    svFolderUpsert("Shared", p);
  }
  function toggleLike(e, p) {
    e.stopPropagation();
    if (!requireAuth("Sign in to like places")) return;
    const wasLiked = !!liked[p.id];
    const nextLiked = { ...liked }; const nextDis = { ...disliked };
    const nextLikedItems = { ...likedItems }; const nextDisItems = { ...dislikedItems };
    if (wasLiked) { delete nextLiked[p.id]; delete nextLikedItems[p.id]; }
    else {
      nextLiked[p.id] = true; delete nextDis[p.id];
      nextLikedItems[p.id] = { place: p, ts: Date.now() }; delete nextDisItems[p.id];
      recordSignal(p, "like");
      logEvent("like", p);
    }
    setLiked(nextLiked); setDisliked(nextDis);
    setLikedItems(nextLikedItems); setDislikedItems(nextDisItems);
    try { localStorage.setItem("wf_liked", JSON.stringify(nextLiked)); localStorage.setItem("wf_disliked", JSON.stringify(nextDis)); localStorage.setItem("wf_liked_items", JSON.stringify(nextLikedItems)); localStorage.setItem("wf_disliked_items", JSON.stringify(nextDisItems)); } catch {}
    if (supabase && user) {
      if (wasLiked) {
        supabase.from("likes").delete().eq("user_id", user.id).eq("place_id", p.id).then(() => {}, () => {});
      } else {
        supabase.from("likes").upsert({ user_id: user.id, place_id: p.id, place: p }, { onConflict: "user_id,place_id" }).then(() => {}, () => {});
        svFolderDelete("Disliked", p.id);
      }
    }
  }
  function toggleDislike(e, p) {
    e.stopPropagation();
    if (!requireAuth("Sign in to save your preferences")) return;
    const wasDis = !!disliked[p.id];
    const nextLiked = { ...liked }; const nextDis = { ...disliked };
    const nextLikedItems = { ...likedItems }; const nextDisItems = { ...dislikedItems };
    if (wasDis) { delete nextDis[p.id]; delete nextDisItems[p.id]; svFolderDelete("Disliked", p.id); }
    else {
      nextDis[p.id] = true; delete nextLiked[p.id];
      nextDisItems[p.id] = { place: p, ts: Date.now() }; delete nextLikedItems[p.id];
      recordSignal(p, "dislike"); logEvent("dislike", p);
      svFolderUpsert("Disliked", p);
      if (supabase && user) supabase.from("likes").delete().eq("user_id", user.id).eq("place_id", p.id).then(() => {}, () => {});
    }
    setLiked(nextLiked); setDisliked(nextDis);
    setLikedItems(nextLikedItems); setDislikedItems(nextDisItems);
    try { localStorage.setItem("wf_liked", JSON.stringify(nextLiked)); localStorage.setItem("wf_disliked", JSON.stringify(nextDis)); localStorage.setItem("wf_liked_items", JSON.stringify(nextLikedItems)); localStorage.setItem("wf_disliked_items", JSON.stringify(nextDisItems)); } catch {}
  }
  function toggleHookLike(hookId) {
    if (!requireAuth("Sign in to save")) return;
    const next = new Set(hookLikes);
    if (next.has(hookId)) next.delete(hookId);
    else next.add(hookId);
    setHookLikes(next);
    try { localStorage.setItem("wf_hook_likes", JSON.stringify([...next])); } catch {}
  }
  function openHook(h) {
    // If no place ID or we have a themed body, open the detail sheet.
    // Otherwise fall through to the existing action handler.
    if (h && (h.placeId || h.themeBody)) { setHookDetail(h); }
    else handleHookAction(h);
  }

  // v5.22 — Insider intel per place: cache-first server content (generated
  // once per place per month). Fetched only when a detail sheet opens; any
  // failure and the card simply doesn't render.
  const [insider, setInsider] = useState({});
  useEffect(() => {
    if (!detail || !detail.id || detail._event || insider[detail.id]) return;
    let cancelled = false;
    const _c = (() => { try { const parts = String(detail.address || "").split(",").map((x) => x.trim()); return parts.length >= 3 ? parts[1] : ""; } catch { return ""; } })();
    fetch("/api/insider?id=" + encodeURIComponent(detail.id) + "&name=" + encodeURIComponent(detail.name || "") + "&city=" + encodeURIComponent(_c) + "&type=" + encodeURIComponent(detail.type || "") + (detail.rating != null ? "&rating=" + detail.rating : "") + "&reviews=" + (detail.reviews || 0) + (detail.price ? "&price=" + encodeURIComponent(detail.price) : ""))
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => { if (!cancelled) setInsider((m) => ({ ...m, [detail.id]: d && (d.tip || d.special) ? d : { none: true } })); })
      .catch(() => { if (!cancelled) setInsider((m) => ({ ...m, [detail.id]: { none: true } })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail && detail.id]);

  // v5.10: Tripadvisor enrichment — a second independent trust signal on the
  // detail sheet (rating + review count + link out). Server route caches 10
  // days per place, so repeat opens cost no API quota. Fail-soft: no key or
  // no match and the strip simply doesn't render.
  const [taInfo, setTaInfo] = useState({});
  useEffect(() => {
    if (!detail || !detail.id || detail._event || taInfo[detail.id]) return;
    let cancelled = false;
    const _ll = detail.lat != null ? "&lat=" + detail.lat.toFixed(4) + "&lng=" + detail.lng.toFixed(4) : "";
    const _city = (() => { try { const parts = String(detail.address || "").split(",").map((x) => x.trim()); return parts.length >= 3 ? parts[1] : ""; } catch { return ""; } })();
    fetch("/api/ta/place?q=" + encodeURIComponent(detail.name || "") + _ll + (_city ? "&city=" + encodeURIComponent(_city) : ""))
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => { if (!cancelled) setTaInfo((m) => ({ ...m, [detail.id]: d && d.rating != null ? d : { none: true } })); })
      .catch(() => { if (!cancelled) setTaInfo((m) => ({ ...m, [detail.id]: { none: true } })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail && detail.id]);

  // v5.22 — "Perfect right now": for mood vibes only, once the structured
  // engine has produced the gated, ranked, open-now candidates, ask the
  // server route (cache-first Haiku) to pick 3-5 for THIS moment with one
  // grounded why-line each. Strictly additive and fail-soft: any error or
  // slowness and the normal list stands alone — the page never waits.
  const [momentPicks, setMomentPicks] = useState(null);
  useEffect(() => {
    const exp = EXPERIENCES[activeBadge];
    if (screen !== "experience" || !exp || !exp.mood || !Array.isArray(expPlaces) || expPlaces.length < 3) { setMomentPicks(null); return; }
    let cancelled = false;
    const _h = new Date().getHours(); const _d = new Date().getDay();
    const tb = ["sun","mon","tue","wed","thu","fri","sat"][_d] + "-" + (_h < 6 ? "latenight" : _h < 11 ? "morning" : _h < 15 ? "midday" : _h < 18 ? "afternoon" : _h < 22 ? "evening" : "night");
    const wx = weather ? ((weather.img || "na") + "-" + (weather.temp != null ? Math.round(weather.temp / 5) * 5 : "na")) : "na";
    const cands = expPlaces.filter((p) => p && p.openNow !== false).slice(0, 12).map((p) => ({ id: p.id, name: p.name, type: p.type || "", rating: p.rating, reviews: p.reviews, distMi: p.distMi, openNow: p.openNow !== false, price: p.price || "" }));
    if (cands.length < 3) { setMomentPicks(null); return; }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    fetch("/api/moment/picks", { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent: activeBadge, tb, wx, city: locName ? locName.split(",")[0] : "", candidates: cands }) })
      .then((r) => {
        // Moment fix (Phase 2): a 400 is a CONTRACT error (id drift / malformed
        // request), not "no results" — log it so the bug is visible, and hide
        // the additive card without dressing an error as an empty. A real
        // no-match comes back 200 with a reason envelope.
        if (r.status === 400) { r.json().then((e) => { try { logEvent("moment_picks_contract_error", null, { intent: activeBadge, error: e && e.error }); } catch (er) {} }).catch(() => {}); return { picks: [], _contractError: true }; }
        return r.ok ? r.json() : { picks: [] };
      })
      .then((d) => { if (!cancelled) setMomentPicks(Array.isArray(d.picks) && d.picks.length ? { badge: activeBadge, picks: d.picks } : null); })
      .catch(() => { if (!cancelled) setMomentPicks(null); })
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeBadge, expPlaces]);

  // v4.51: real Viator tour listings on attraction detail pages. Uses the
  // place's own city (from its address) so an Orlando attraction viewed from
  // Parrish still searches "Gatorland Orlando".
  useEffect(() => {
    if (!detail || !detail.id || detail._event) return;
    const kinds = ["museum", "wildlife", "entertainment", "scenic", "beach", "nature", "landmark", "waterfront"];
    if (!kinds.includes(placeKind(detail))) return;
    if (viaTours[detail.id]) return;
    const placeCity = (() => { try { const parts = String(detail.address || "").split(",").map((x) => x.trim()); return parts.length >= 3 ? parts[1] : ""; } catch { return ""; } })() || (locName ? locName.split(",")[0] : "");
    const q = detail.name + (placeCity ? " " + placeCity : "");
    let cancelled = false;
    setViaTours((m) => ({ ...m, [detail.id]: { loading: true, items: [] } }));
    fetch("/api/viator/tours?q=" + encodeURIComponent(q) + "&name=" + encodeURIComponent(detail.name) + "&kind=" + encodeURIComponent(placeKind(detail) || "") + "&placeId=" + encodeURIComponent(detail.id) + "&count=3&region=" + encodeURIComponent((() => { try { const _m = Culture.resolveMetro(locName); return [placeCity, _m && Culture.CULTURE[_m] ? Culture.CULTURE[_m].title : ""].filter(Boolean).join(","); } catch { return placeCity || ""; } })()))
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setViaTours((m) => ({ ...m, [detail.id]: { loading: false, items: (d && d.items) || [] } })); })
      .catch(() => { if (!cancelled) setViaTours((m) => ({ ...m, [detail.id]: { loading: false, items: [] } })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail && detail.id]);

  // Load community votes for a place when its detail opens (drive widget)
  useEffect(() => {
    if (!detail || !detail.id) return;
    if (detail.distMi == null || detail.distMi < 20) { if (detailContext !== "drive") return; }
    fetch(`/api/vote?placeId=${encodeURIComponent(detail.id)}`)
      .then((r) => r.json())
      .then((data) => setCommunityVotes((prev) => ({ ...prev, [detail.id]: data })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  async function handleVote(place, vote) {
    if (!place || !place.id || myVotes[place.id]) return;
    const next = { ...myVotes, [place.id]: vote };
    setMyVotes(next);
    try { localStorage.setItem("wf_drive_votes", JSON.stringify(next)); } catch {}
    try {
      const res = await fetch("/api/vote", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placeId: place.id, vote, placeName: place.name, distMi: place.distMi }),
      });
      const data = await res.json();
      if (data && !data.error) setCommunityVotes((prev) => ({ ...prev, [place.id]: data }));
    } catch {}
  }

  async function submitSignup() {
    const email = signupEmail.trim();
    if (!email || signupDone) return;
    try { await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, likes: Object.keys(liked).length, signals: signals.length }) }); } catch {}
    setSignupDone(true);
    try { localStorage.setItem("wf_signed_up", "1"); } catch {}
  }

  // Open a place: pull deep data (cached), then run the AI grounded in it.
  async function openDetail(p, context) {
    try { sessionStorage.setItem("wf_value_seen", "1"); } catch (e) {} // v5.37: opening a place = value delivered
    // v4.86: a Foursquare-sourced place upgrades to its Google twin on open
    // when one exists (reviews, hours, photos come along); otherwise it
    // renders honestly from the Foursquare data it arrived with.
    if (p && typeof p.id === "string" && /^(fsq|osm|ridb):/.test(p.id)) {
      try {
        const up = await findPlace(p.name, { lat: p.lat, lng: p.lng });
        if (up && up.id && up.lat != null) {
          const dLat = up.lat - p.lat, dLng = up.lng - p.lng;
          if (Math.sqrt(dLat * dLat + dLng * dLng) * 69 <= 0.25) p = { ...up, distMi: p.distMi != null ? p.distMi : up.distMi, sources: p.sources };
        }
      } catch (e) {}
    }
    try { const _aud = {}; experienceBadges(p, null, 99, _aud); logEvent("detail_open", p, { identity: _aud.identity || null, blocked: (_aud.blocked || []).length, ctx: typeof context === "string" ? context : null }); } catch (e) {}
    setDetail(p);
    setDetailContext(context || null);
    recordSignal(p, "open"); // implicit engagement signal
    try { if (OFFERS[p.id]) logEvent("offer_impression", p, { offer_id: OFFERS[p.id].id }); } catch (e) {}
    try { recentRef.current = [p.id, ...recentRef.current.filter((x) => x !== p.id)].slice(0, 20); } catch {}
    setReviewsOpen(false);
    setHoursOpen(false);
    setVenueEvents(null);
    setVenueEventsOpen(false);
    setVenueEventsLoading(false);
    setWhyOpen(false);
    setShowMore(false);
    setThemesOpen(false);
    setVideos(videoCache.current[p.id] || null);
    setInsightFull(insightFullCache.current[p.id] || getCachedInsight(p.id + "::full") || null);
    setInsightFullLoading(false);
    setDetailExtra(detailCache.current[p.id] || null);
    setInsightLoading(true);
    let extra = detailCache.current[p.id];
    if (extra === undefined) {
      setDetailExtra(null);
      extra = await fetchPlaceDetail(p.id);
      detailCache.current[p.id] = extra;
    }
    setDetailExtra(extra);
    if (extra) { const rt = Array.isArray(extra.reviews) ? extra.reviews.slice(0, 4).map((r) => (r.text || "").slice(0, 300)).filter(Boolean) : []; HINTS[p.id] = ((extra.editorial || "") + " " + rt.join(" ")).toLowerCase(); }
    loadInsight(p, extra);
  }
  // Pull real upcoming ticketed events at or near a place from Ticketmaster.
  // This is the honest way to answer "when is the live music here": actual show
  // dates and times, never an invented weekly schedule. Empty is a valid answer.
  async function loadVenueEvents(p) {
    if (!p || p.lat == null || p.lng == null) { setVenueEvents([]); return; }
    setVenueEventsLoading(true);
    setVenueEvents(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: p.lat, lng: p.lng, radius: 2 }),
      });
      const data = await res.json();
      let list = (data && Array.isArray(data.events) ? data.events : []).filter((e) => e && e.dest);
      const nm = (p.name || "").toLowerCase();
      const matches = list.filter((e) => {
        const v = (e.venue || "").toLowerCase();
        return v && (v.includes(nm) || nm.includes(v));
      });
      // Phase 2 (EVENTS_PIPELINE_DIAGNOSIS.md): the card says "at this
      // venue" -- the old fallback padded it with ALL nearby events when
      // the venue-name match came up empty, which is a wrong claim. No
      // match now means the honest empty state.
      setVenueEvents(matches.slice(0, 8));
    } catch {
      setVenueEvents([]);
    } finally {
      setVenueEventsLoading(false);
    }
  }
  async function loadVideos(p) {
    if (videoCache.current[p.id]) { setVideos(videoCache.current[p.id]); setVideosLoading(false); return; }
    setVideos(null);
    setVideosLoading(true);
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: p.name, city: locName, category: cat }),
      });
      const data = await res.json();
      const vids = data && Array.isArray(data.videos) ? data.videos : [];
      videoCache.current[p.id] = vids;
      setVideos(vids);
    } catch {
      setVideos([]);
    } finally {
      setVideosLoading(false);
    }
  }
  async function loadEvents() {
    if (!center) return;
    setEventsLoading(true);
    setEventsError(false);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: center.lat, lng: center.lng, city: locName, radius: Math.max(Math.round((searchRadius || DEFAULT_RADIUS_M) / 1609.34), 60) }), // v4.87: events get a generous 60-mi floor — people drive for events; a manual wider radius still wins
      });
      const data = await res.json();
      setEventsUnavailable(!!data.unavailable);
      setEventsError(!!data.error);
      setEventCounts(data && data.counts ? data.counts : null);
      try { if (process.env.NODE_ENV !== "production" && data && data.counts) console.log("[wayfind events]", data.counts, "total", (data.events || []).length); } catch (e) {}
      // Phase 1/2 contract (EVENTS_PIPELINE_DIAGNOSIS.md): only events with a
      // resolved destination enter client state, so every count downstream is
      // computed on exactly the list the cards render from.
      const evs = (data && Array.isArray(data.events) ? data.events : []).filter((e) => e && e.dest);
      setEvents(evs);
      if (!data.unavailable && !data.error && evs.length === 0) logEvent("events_none", null, { loc: locName || "", lat: center.lat, lng: center.lng });
    } catch {
      setEventsError(true);
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }
  async function loadOffers(list) {
    try {
      if (!supabase || !Array.isArray(list) || !list.length) return;
      const { data: _rawOffers } = await supabase.from("offers").select("*");
      const data = (_rawOffers || []).filter(offerRedeemable); // v5.09: undeliverable deals never reach a card
      if (!data || !data.length) return;
      const norm = (x) => (x || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      const map = {};
      list.forEach((p) => {
        if (!p) return;
        const off = data.find((o) => (o.google_place_id && o.google_place_id === p.id) || (o.normalized_business_name && o.normalized_business_name === norm(p.name)));
        if (off) { map[p.id] = off; OFFERS[p.id] = off; }
      });
      if (Object.keys(map).length) setOffers((prev) => ({ ...prev, ...map }));
    } catch (e) {}
  }
  async function loadBlurbs(list) {
    loadOffers(list);
    if (!Array.isArray(list) || !list.length) { setBlurbs({}); return; }
    // 1. Seed instantly from the 30-day on-device line cache. These cost nothing:
    //    no Google call, no AI call. Repeat searches of the same area are free.
    const seeded = {};
    list.forEach((p) => { const c = getCachedLine(p.id); if (c) seeded[p.id] = c; });
    setBlurbs(seeded);
    // 2. Only fetch + generate for places NOT already cached, capped to the top few.
    //    A warm area adds nothing; a brand-new area pays once, then caches.
    const need = list.filter((p) => !seeded[p.id]).slice(0, 3);
    if (!need.length) return;
    const enriched = await Promise.all(need.map(async (p) => {
      let extra = detailCache.current[p.id];
      if (extra === undefined) {
        try { extra = await fetchPlaceDetail(p.id); } catch { extra = null; }
        detailCache.current[p.id] = extra;
      }
      const reviewText = extra && Array.isArray(extra.reviews) ? extra.reviews.slice(0, 4).map((r) => (r.text || "").slice(0, 300)).filter(Boolean) : [];
      HINTS[p.id] = (((extra && extra.editorial) || "") + " " + reviewText.join(" ")).toLowerCase();
      return { id: p.id, name: p.name, type: p.type, rating: p.rating, reviews: p.reviews, price: p.price, labels: p.labels, reviewText, editorial: (extra && extra.editorial) || "" };
    }));
    try {
      const res = await fetch("/api/blurbs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ city: locName, places: enriched }),
      });
      const data = await res.json();
      if (data && data.blurbs && typeof data.blurbs === "object") {
        setBlurbs((prev) => ({ ...prev, ...stripMdMap(data.blurbs) }));
        setCachedLines(data.blurbs);
      }
    } catch {}
  }
  async function loadInsight(p, extra) {
    if (insightCache.current[p.id]) { setInsight(insightCache.current[p.id]); setInsightLoading(false); return; }
    const cached = getCachedInsight(p.id);
    if (cached) { insightCache.current[p.id] = cached; setInsight(cached); setInsightLoading(false); return; }
    setInsight(null);
    setInsightLoading(true);
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: p.name, type: p.type, city: locName,
          rating: p.rating, reviewCount: p.reviews, price: p.price, openNow: p.openNow,
          category: cat, sub, mode: "compact", kind: (p._event ? "event" : (["Food", "Nightlife"].includes(primaryCategory(p) || "") ? "dining" : "attraction")),
          editorial: extra ? extra.editorial : null,
          reviews: extra && extra.reviews ? extra.reviews.map((r) => r.text).slice(0, 5) : [],
          attributes: p.labels || [],
        }),
      });
      const data = await res.json();
      insightCache.current[p.id] = data;
      if (data && !data.error && !data.unavailable) setCachedInsight(p.id, data);
      setInsight(data);
    } catch {
      setInsight({ error: true });
    } finally {
      setInsightLoading(false);
    }
  }
  // The heavier insight (themes, more tips, must-try). Only ever runs when the
  // user expands a place, so most opens never pay for it. Cached 30 days.
  async function loadFullInsight(p, extra) {
    if (!p) return;
    if (insightFullCache.current[p.id]) { setInsightFull(insightFullCache.current[p.id]); return; }
    const cached = getCachedInsight(p.id + "::full");
    if (cached) { insightFullCache.current[p.id] = cached; setInsightFull(cached); return; }
    setInsightFullLoading(true);
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: p.name, type: p.type, city: locName,
          rating: p.rating, reviewCount: p.reviews, price: p.price, openNow: p.openNow,
          category: cat, sub, mode: "full", kind: (p._event ? "event" : (["Food", "Nightlife"].includes(primaryCategory(p) || "") ? "dining" : "attraction")),
          editorial: extra ? extra.editorial : null,
          reviews: extra && extra.reviews ? extra.reviews.map((r) => r.text).slice(0, 5) : [],
          attributes: p.labels || [],
        }),
      });
      const data = await res.json();
      insightFullCache.current[p.id] = data;
      if (data && !data.error && !data.unavailable) setCachedInsight(p.id + "::full", data);
      setInsightFull(data);
    } catch {
      setInsightFull({ error: true });
    } finally {
      setInsightFullLoading(false);
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem("wayfind_lists");
      if (raw) { const saved = JSON.parse(raw); const _m = { favorites: { id: "favorites", name: "Favorites", emoji: "❤️", places: [] }, ...saved }; if (_m.custom && !((_m.custom.places || []).length)) delete _m.custom; setLists(_m); }
    } catch {}
  }, []);

  // Handle shared deep links: a single place or a shared list.
  useEffect(() => {
    let params;
    try { params = new URLSearchParams(window.location.search); } catch { return; }
    const listStr = params.get("list");
    const placeId = params.get("place");
    if (placeId) { try { const _sp = new URLSearchParams(window.location.search); _sp.delete("place"); const _qs = _sp.toString(); window.history.replaceState({}, "", window.location.pathname + (_qs ? "?" + _qs : "")); } catch (e) {} }
    if (listStr) {
      const pl = decodeList(listStr);
      if (pl && pl.length) { setSharedList(pl); setScreen("shared"); logEvent("share_open", null, { kind: "list", n: pl.length }); }
    } else if (placeId) {
      logEvent("share_open", null, { kind: "place", place_id: placeId });
      (async () => {
        const p = await fetchPlaceById(placeId);
        if (p) openDetail(p);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const listsHydrated = useRef(false);
  useEffect(() => {
    // Skip the first run so default empty lists never overwrite real saved data
    // before the load effect above has hydrated from localStorage.
    if (!listsHydrated.current) { listsHydrated.current = true; return; }
    try { localStorage.setItem("wayfind_lists", JSON.stringify(lists)); } catch {}
  }, [lists]);

  // Trip planner store: load once on mount, then persist on every change.
  useEffect(() => {
    try { const raw = localStorage.getItem("wayfind_trips"); if (raw) setTrips(JSON.parse(raw) || {}); } catch {}
  }, []);
  const tripsHydrated = useRef(false);
  useEffect(() => {
    if (!tripsHydrated.current) { tripsHydrated.current = true; return; }
    try { localStorage.setItem("wayfind_trips", JSON.stringify(trips)); } catch {}
  }, [trips]);

  useEffect(() => {
    if (keyMissing) return;
    let gotGPS = false;
    // IP fallback (works on desktop with no GPS). Applied only if GPS hasn't
    // already set a location, and never overrides a manual search.
    const ipFallback = async () => {
      try { if (!gotGPS) setLocApprox(true); } catch (e) {}
      try {
        const r = await fetch("/api/geo", { cache: "no-store" });
        const d = await r.json();
        if (d && d.ok && !gotGPS && !manualRef.current) {
          const c = { lat: d.lat, lng: d.lng };
          setDeviceLoc((prev) => prev || c);
          setCenter((prev) => prev || c);
          if (d.name) setLocName((prev) => prev || d.name);
        }
      } catch (e) {}
    };
    // Give GPS a head start; if it hasn't answered in 2.5s, use IP so the page
    // isn't stuck empty. GPS, if it later resolves, still wins via the handler.
    const ipTimer = setTimeout(ipFallback, 2500);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          gotGPS = true;
          clearTimeout(ipTimer);
          try { setLocApprox(false); } catch (e) {}
          const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setDeviceLoc(c);
          if (manualRef.current) return;
          const name = await reverseGeocode(c.lat, c.lng);
          setCenter(c);
          setLocName(name);
        },
        () => { ipFallback(); },
        { timeout: 8000 }
      );
    } else {
      ipFallback();
    }
    return () => clearTimeout(ipTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (keyMissing || !center || searchMode) return;
    let cancelled = false;
    // Debounce: rapid category/filter switching fires searches that still bill even
    // when abandoned. Wait 300ms so only the final selection actually searches.
    const _debTimer = setTimeout(() => {
    (async () => {
      setLoading(true);
      setErr("");
      try {
        // v6.24: widen the local feed. When browsing a whole category (sub "all"), fan out across
        // every subcategory query and merge, so the feed surfaces far more of what actually exists
        // locally instead of a single 20-result page. Costs one Google call per subcategory; results
        // are deduped here and again by name in the view.
        const ctr = { lat: center.lat, lng: center.lng };
        // Cost fix: at most TWO Google searches per screen (was 6+). Browsing a whole
        // category runs the broad search plus ONE context-relevant subfilter (meal by
        // time of day for food, first subfilter otherwise) and merges. Any specific
        // subfilter tap is a single search. ~67% fewer searches per load.
        const _subs = (SUBFILTERS[cat] || []).filter((x) => x && x.id && x.id !== "all");
        const _fetchAt = async (m) => {
          if (sub === "all" && _subs.length) {
            let _second;
            if (cat === "food") { const _h = new Date().getHours(); const _w = _h < 11 ? "breakfast" : _h < 15 ? "lunch" : _h < 21 ? "dinner" : "dessert"; _second = (_subs.find((x) => x.id === _w) || _subs[0]).id; }
            else { _second = _subs[0].id; }
            const _b = await Promise.all([searchPlaces(cat, "all", ctr, m, vibe).catch(() => []), searchPlaces(cat, _second, ctr, m, vibe).catch(() => [])]);
            const _seen = new Set(); const _out = [];
            _b.forEach((arr) => (arr || []).forEach((pp) => { if (pp && pp.id && !_seen.has(pp.id)) { _seen.add(pp.id); _out.push(pp); } }));
            return _out;
          }
          return await searchPlaces(cat, sub, ctr, m, vibe);
        };
        // v4.85 adaptive radius: start at the current radius (17-mi default)
        // and auto-widen 30 → 45 → 60 while the category has fewer than 8
        // places. Auto-widen only moves the STARTING point — once the user
        // touches the slider, their choice is law.
        const _startM = searchRadius || DEFAULT_RADIUS_M;
        let results = await _fetchAt(_startM);
        let _usedM = _startM;
        if (autoRadiusRef.current || _startM <= DEFAULT_RADIUS_M) {
          for (const _m of RADIUS_LADDER_M) {
            if ((results || []).length >= ADAPT_MIN) break;
            if (_m <= _usedM) continue;
            results = await _fetchAt(_m); _usedM = _m;
          }
        }
        if (!cancelled && _usedM > _startM) { autoRadiusRef.current = true; setSliderMi(Math.round(_usedM / 1609.34)); setSearchRadius(_usedM); }
        if (!cancelled) { setPlaces(results); loadBlurbs(results); try { logEvent("result_count_shown", null, { count: (results || []).length, cat, sub }); } catch (e) {} if (!results || results.length === 0) logEvent("places_none", null, { loc: locName || "", cat, lat: center.lat, lng: center.lng }); fetchMemberSignals(supabase, results).then((sig) => { if (!cancelled && sig) setPlaces((cur) => withMemberSignal(cur, sig)); }); }
      } catch (e) {
        if (!cancelled) { setErr("We couldn't load spots right now. Try again in a moment."); setPlaces([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    }, 300);
    return () => { cancelled = true; clearTimeout(_debTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat, sub, vibe, center, searchRadius, searchMode, feedRetry]);

  // Load events when on the Events screen or when the location changes.
  useEffect(() => {
    if (screen !== "events" || !center) return;
    loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, center]);

  // Build a curated experience: wider 30 mile search, real filter, ranked by score.
  const _expRunRef = useRef(null);
  useEffect(() => {
    if (screen !== "experience" || !activeBadge || !center) return;
    const exp = EXPERIENCES[activeBadge];
    if (!exp) return;
    // v4.98: an endless "Curating the best spots" is banned, as a rule.
    // Four guarantees: (1) the FIRST round that returns anything paints
    // immediately and kills the spinner — wider rounds refine the list in
    // place instead of holding the whole page hostage; (2) a 12s watchdog
    // force-clears the spinner no matter what a source does — the honest
    // empty state is allowed, an infinite spinner is not; (3) a short
    // debounce coalesces rapid re-triggers; (4) when the startup location
    // merely REFINES (IP city fix → GPS fix in the same neighborhood,
    // < 3 km apart) the in-flight run is ADOPTED, not thrown away — the
    // cancel-and-refetch on that flip is what doubled every vibe load.
    const _prev = _expRunRef.current;
    if (_prev && !_prev.done && _prev.badge === activeBadge && _prev.center && distMeters(_prev.center, center) < 3000) { _prev.tok.dead = false; return; }
    const _tok = { dead: false };
    const _rec = { badge: activeBadge, center: { lat: center.lat, lng: center.lng }, tok: _tok, done: false };
    _expRunRef.current = _rec;
    setExpLoading(true);
    const _watch = setTimeout(() => { if (!_tok.dead) setExpLoading(false); }, 12000);
    const _deb = setTimeout(() => {
    if (_tok.dead) { _rec.done = true; return; }
    (async () => {
      try {
        // v4.85 adaptive: every vibe STARTS at the 17-mile default (or its
        // purpose-built wider radius, e.g. Bucket List) and auto-widens
        // while fewer than 8 places pass the vibe's filter. Sparse markets
        // like Parrish fill honestly instead of showing "0 curated picks" —
        // every card labels its true distance.
        const _vibePass = (p) => { const c = curatedFor(p); if (c && Array.isArray(c.intents) && c.intents.includes(activeBadge)) return true; return exp.filter ? exp.filter(p) : true; };
        // v4.81: curated picks get the same +15 lift here that applyAffinity
        // gives them, so they rank near the top instead of mid-list.
        // v5.25: vibes can carry their own context boost (exp.boost) — e.g.
        // Outside lifts real water venues, hardest when it's beach weather.
        const _ctxBoost = (p) => { try { return exp.boost ? exp.boost(p, weather) : 0; } catch (e) { return 0; } };
        const sortFit = (arr) => arr.slice().sort((a, b) => ((b.wfScore || 0) + featuredBoost(b.name) + (curatedFor(b) ? 15 : 0) + _ctxBoost(b)) - ((a.wfScore || 0) + featuredBoost(a.name) + (curatedFor(a) ? 15 : 0) + _ctxBoost(a)));
        const _paint = (pool) => { if (_tok.dead || !pool.length) return; const passed = pool.filter(_vibePass); const quick = sortFit(passed.length >= 5 ? passed : pool).slice(0, 40); if (quick.length) { setExpPlaces(quick); setExpLoading(false); } };
        const _startM = exp.radius || DEFAULT_RADIUS_M;
        let radius = _startM;
        let raw = [];
        // v4.97 speed: a multi-query vibe refetching 30→45→60 was up to four
        // sequential rounds (~9s spinners). One jump: default, then max.
        for (const _m of [_startM, ...(_startM < 96560 ? [96560] : [])]) {
          radius = _m;
          const _qs = typeof exp.queries === "function" ? exp.queries() : exp.queries; // v4.80: time-aware query sets
          if (_qs && _qs.length) {
            const _b = await Promise.all(_qs.map((qd) => searchPlaces(qd.cat || "attractions", "all", { lat: center.lat, lng: center.lng }, radius, "all", qd.keyword || "").catch(() => [])));
            raw = dedupePlaces(_b.flat().filter(Boolean), true);
          } else {
            raw = await searchPlaces(exp.cat || "food", "all", { lat: center.lat, lng: center.lng }, radius, "all", exp.keyword || "");
          }
          _paint(raw);
          if (raw.filter(_vibePass).length >= ADAPT_MIN) break;
        }
        // v4.81: guaranteed curated presence. Google's text search centered on a
        // small town (Parrish) routinely skips first-party picks 15–25 mi out,
        // so tagged curated places are resolved by name (findPlace is cached)
        // and injected when the search missed them — kept only if they resolve,
        // are OPERATIONAL, and sit inside this vibe's radius of the user.
        try {
          const _tagged = CURATED.filter((c) => Array.isArray(c.intents) && c.intents.includes(activeBadge));
          if (_tagged.length) {
            const _have = new Set(raw.map((p) => _wfNorm(p.name)));
            const _missing = _tagged.filter((c) => !_have.has(_wfNorm(c.name))).slice(0, 14);
            if (_missing.length) {
              const _res = await Promise.all(_missing.map((c) => findPlace(c.name + " " + (c.area || ""), { lat: center.lat, lng: center.lng }).catch(() => null)));
              const _radMi = Math.max(radius / 1609.34, CURATED_REACH_MI); // first-party picks keep their reach past the 17-mi default; cards show distance honestly
              const _inject = _res.filter(Boolean).filter((p) => (!p.status || p.status === "OPERATIONAL") && (p.distMi == null || p.distMi <= _radMi) && !_have.has(_wfNorm(p.name)));
              if (_inject.length) raw = dedupePlaces([...raw, ..._inject], true);
            }
          }
        } catch (e) {}
        let results;
        if (exp.filter) {
          const passed = raw.filter(_vibePass);
          // Never show an embarrassingly thin curated list. If a hard filter leaves
          // fewer than 5, backfill with the best unfiltered nearby picks so the
          // page always feels full, filtered picks still ranked first.
          if (passed.length >= 5) {
            results = sortFit(passed);
          } else {
            const passedIds = new Set(passed.map((p) => p.id));
            const backfill = sortFit(raw.filter((p) => !passedIds.has(p.id)));
            results = [...sortFit(passed), ...backfill];
          }
        } else {
          results = sortFit(raw);
        }
        results = results.slice(0, 40); // v4.81: more options per vibe
        // TEMP (MOMENT_PICKS_DIAGNOSIS.md, Phase 0): one inert telemetry line
        // per experience open so the exact divergence is measurable on the
        // owner's device — fetched vs kept, the radius actually searched, and
        // the client clamp (expMi) that hides fetched-but-distant results.
        try { logEvent("moment_open_diag", null, { intent: activeBadge, fetched: raw.length, kept: results.length, radiusMi: Math.round(radius / 1609.34), clampMi: expMi, within17: results.filter((p) => p.distMi != null && p.distMi <= 17).length }); } catch (e) {}
        if (!_tok.dead) { setExpPlaces(results); loadBlurbs(results); fetchMemberSignals(supabase, results).then((sig) => { if (!_tok.dead && sig) setExpPlaces((cur) => withMemberSignal(cur, sig)); }); }
        // v4.89: photo fix for the vibe rows — resolve real photos for the
        // top photoless multi-source entries (cached lookups), then repaint.
        try {
          const _missing = results.filter((p) => p && !p.photo && /^(fsq|osm|ridb|nps):/.test(String(p.id || ""))).slice(0, 10);
          if (_missing.length) Promise.all(_missing.map(async (p) => { try { const g = await findPlace(p.name, { lat: p.lat, lng: p.lng }); if (g && g.photo && (_wfNorm(g.name).includes(_wfNorm(p.name)) || _wfNorm(p.name).includes(_wfNorm(g.name)))) { p.photo = g.photo; p.photos = g.photos || []; if (g.oh) { p.oh = g.oh; p.openNow = g.openNow; p.utcOffset = g.utcOffset; } } } catch (e) {} })).then(() => { if (!_tok.dead) setExpPlaces((cur) => (Array.isArray(cur) ? [...cur] : cur)); });
        } catch (e) {}
      } catch {
        if (!_tok.dead) setExpPlaces([]);
      } finally {
        _rec.done = true;
        clearTimeout(_watch);
        if (!_tok.dead) setExpLoading(false);
      }
    })();
    }, 250);
    // Cleanup only marks the token dead — timers stay armed so a follow-up
    // adoption (location refined < 3 km) can revive the very same run.
    return () => { _tok.dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeBadge, center]);

  // v4.84 Viator as a real activity source. The freetext endpoint is queried
  // with the resolved METRO name (small towns like Parrish are not Viator
  // destinations — freetext on them returns keyword noise from other cities),
  // pulling a 20-product pool that gets ranked client-side per vibe:
  //   top  — most popular, rating desc with review-count tiebreak (Bucket List)
  //   gems — high rating (4.7+) but LOW review count (≤300): under-the-radar
  //          experiences locals book but tourists miss (Hidden Gems)
  useEffect(() => {
    if (screen !== "experience" || !(EXPERIENCES[activeBadge] && EXPERIENCES[activeBadge].viator)) { setExpTours(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const _m = Culture.resolveMetro(locName);
        const cityQ = (_m && Culture.CULTURE[_m] && Culture.CULTURE[_m].title) || (locName ? locName.split(",")[0] : "");
        if (!cityQ) return;
        const r = await fetch("/api/viator/tours?q=" + encodeURIComponent(cityQ) + "&count=20");
        const d = await r.json();
        const mode = EXPERIENCES[activeBadge].viatorMode || "top";
        const pool = (d && Array.isArray(d.items) ? d.items : []);
        const items = (mode === "gems"
          ? pool.filter((t) => t.rating != null && t.rating >= 4.7 && (t.reviews || 0) > 0 && (t.reviews || 0) <= 300)
          : pool.filter((t) => t.rating != null && t.rating >= 4.5))
          .sort((a, b) => (b.rating - a.rating) || ((b.reviews || 0) - (a.reviews || 0)))
          .slice(0, 8);
        if (!cancelled) setExpTours(items);
      } catch (e) { if (!cancelled) setExpTours(null); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeBadge, locName]);

  // v4.94: the experience "Within X mi" pill mirrors the sheets — if the vibe
  // pulled from farther than the 17-mi default (adaptive radius), bump the
  // visible cap up the ladder so results aren't hidden behind a stale label.
  useEffect(() => {
    const pl = expPlaces;
    if (!pl || !pl.length) return;
    const _within = (mi) => pl.filter((p) => p.distMi == null || p.distMi <= mi).length;
    setExpMi((cur) => {
      const _t = Math.min(ADAPT_MIN, pl.length);
      if (cur >= 60 || _within(cur) >= _t) return cur;
      for (const mi of [30, 45, 60]) { if (mi > cur && _within(mi) >= _t) return mi; }
      return 60;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBadge, expPlaces && expPlaces.length]);

  // v4.84: bookable activities on the Things to do browse too — Viator is a
  // source, not just a booking-link decorator.
  useEffect(() => {
    if (browseCat !== "attractions" || !center) { setBrowseTours(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const _m = Culture.resolveMetro(locName);
        const cityQ = (_m && Culture.CULTURE[_m] && Culture.CULTURE[_m].title) || (locName ? locName.split(",")[0] : "");
        if (!cityQ) return;
        const r = await fetch("/api/viator/tours?q=" + encodeURIComponent(cityQ) + "&count=20");
        const d = await r.json();
        const items = (d && Array.isArray(d.items) ? d.items : [])
          .filter((t) => t.rating != null && t.rating >= 4.5)
          .sort((a, b) => (b.rating - a.rating) || ((b.reviews || 0) - (a.reviews || 0)))
          .slice(0, 8);
        if (!cancelled) setBrowseTours(items);
      } catch (e) { if (!cancelled) setBrowseTours(null); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [browseCat, locName, center && center.lat]);

  // v4.62: real nearby teasers under the intro CTA — proof before the ask.
  const introTeasers = useMemo(() => {
    if (!introOpen) return [];
    try {
      const pool = dedupePlaces([...(suggested || []), ...(places || []), ...(homeTodo || [])].filter(Boolean), true).filter((p) => p && p.id && p.name);
      if (!pool.length) return [];
      const out = []; const used = new Set();
      const add = (p, line) => { if (p && !used.has(p.id)) { used.add(p.id); out.push({ p, line }); } };
      add(pool.filter((p) => (p.rating || 0) >= 4.6 && (p.reviews || 0) >= 40 && (p.reviews || 0) <= 600).sort((a, b) => (b.rating || 0) - (a.rating || 0))[0], "Locals keep this one quiet");
      add(pool.filter((p) => (p.reviews || 0) >= 200).sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0))[0], "The safest great call near you");
      add(pool.filter((p) => p.openNow === true).sort((a, b) => (a.distMi ?? 1e9) - (b.distMi ?? 1e9))[0], "Open right now, minutes away");
      add(pool.filter((p) => (p.reviews || 0) >= 60).sort((a, b) => (a.distMi ?? 1e9) - (b.distMi ?? 1e9))[0], "Worth knowing this close");
      return out.slice(0, 4);
    } catch (e) { return []; }
  }, [introOpen, suggested, places, homeTodo]);

  // v4.60: first visit gets the moment builder — one screen that explains
  // Wayfind and gets the user to a win without typing. Skippable, remembered.
  // v5.25: once per SESSION (sessionStorage), not once ever — the concierge
  // greets each visit but never nags within one. The ~3.2s delay lets weather,
  // location and the open-now count load so the greeting arrives personal.
  useEffect(() => {
    try {
      const sp0 = new URLSearchParams(window.location.search);
      if (sp0.get("intro") === "1") { try { sessionStorage.setItem("wf_interrupted", "intro"); } catch (e) {} setIntroOpen(true); return; }
      // v5.37: EVERY deep link owns its visit, not just ?q — a visitor who
      // arrived for a specific screen, place, list, or experience gets it
      // without a greeting on top.
      const deepLink = sp0.get("q") || sp0.get("go") || sp0.get("place") || sp0.get("list") || sp0.get("exp");
      if (deepLink) { /* deep link owns this visit */ } else if (!sessionStorage.getItem("wf_intro_seen")) {
        const t = setTimeout(() => { if (claimInterrupt("intro")) setIntroOpen(true); }, 3200);
        return () => clearTimeout(t);
      }
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // v5.37: mirror of "some dialog is open" for the prompt coordinator —
  // while ANY of these is up, no timed prompt may fire.
  useEffect(() => {
    dialogOpenRef.current = !!(introOpen || gwPop || gwOpen || authOpen || accountOpen || recoveryOpen);
  }, [introOpen, gwPop, gwOpen, authOpen, accountOpen, recoveryOpen]);
  // v5.37 dialog semantics: focus management for every modal overlay.
  // G4 fix: introOpen/accountOpen/authOpen/recoveryOpen's dialogs now live in
  // next/dynamic({ssr:false}) sheet components — useDialogFocus's ref would be
  // null on the tick this effect first ran (the chunk hadn't mounted its DOM
  // yet), so those four now own useDialogFocus internally instead. Only the
  // still-inline giveaway dialogs keep their refs/hook calls here.
  const gwPopDlgRef = useRef(null);
  const gwRulesDlgRef = useRef(null);
  // v5.37: Escape closes the topmost user-invoked sheet too (the six main
  // dialogs above trap their own Escape; this chain covers the rest, in
  // z-order: lightbox 1000 > cuisine 95 > the zIndex-900 sheet family).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (lightbox) return setLightbox(null);
      if (cuisineSheet) return setCuisineSheet(null);
      if (allExpOpen) return setAllExpOpen(false);
      if (diceChoose) return setDiceChoose(false);
      if (hookDetail) return setHookDetail(null);
      if (newListOpen) return setNewListOpen(false);
      if (renamingList) return setRenamingList(null);
      if (listMenu) return setListMenu(null);
      if (saveTarget) return setSaveTarget(null);
      if (radiusSheet) return setRadiusSheet(false);
      if (menuSheet) return setMenuSheet(null);
      if (wxOpen) return setWxOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, cuisineSheet, allExpOpen, diceChoose, hookDetail, newListOpen, renamingList, listMenu, saveTarget, radiusSheet, menuSheet, wxOpen]);
  useDialogFocus(gwPop, gwPopDlgRef, () => gwPopClose("esc"));
  useDialogFocus(gwOpen, gwRulesDlgRef, () => setGwOpen(false));
  // v5.37: "value seen" — results actually rendered for this visitor. The
  // giveaway waits for this signal (see the coordinator by gwPop above).
  useEffect(() => {
    if (suggested && suggested.length) { try { sessionStorage.setItem("wf_value_seen", "1"); } catch (e) {} }
  }, [suggested]);

  // v4.58: build number leaves the visible UI (launch polish) but stays
  // machine-readable for deploy verification and diagnostics.
  useEffect(() => { try { window.__WF_BUILD = BUILD_ID; document.documentElement.setAttribute("data-wf-build", BUILD_ID); } catch (e) {} }, []);

  // v4.55: /events, /map, /favorites, /itinerary routes hand off here.
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const go = sp.get("go");
      if (!go) return;
      const valid = { events: "events", map: "map", saved: "saved", favorites: "saved", itinerary: "itinerary", coupons: "coupons" };
      if (valid[go]) setScreen(valid[go]);
      if (go === "events") {
        // v5.54 (events pipeline, Phase 3): restore filter state from the
        // shared URL, then put /events back in the address bar instead of
        // stripping to "/" — the Events view and the URL must agree so the
        // state survives refresh and sharing.
        const d = sp.get("date") || "";
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) setEventDate(d);
        const c = (sp.get("cat") || "").slice(0, 24);
        if (c) setEventCat(c);
        const keep = new URLSearchParams();
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) keep.set("date", d);
        if (c) keep.set("cat", c);
        window.history.replaceState({ wf: "screen" }, "", "/events" + (keep.toString() ? "?" + keep.toString() : ""));
        return;
      }
      const u = new URL(window.location.href); u.searchParams.delete("go");
      window.history.replaceState({}, "", u.pathname + (u.search || "") + (u.hash || ""));
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v5.54 (events pipeline, Phase 3): the Events view and the address bar
  // stay in lockstep — /events (+ date/cat filter params) while the screen
  // is open, back to "/" when it closes — so refresh, Back/Forward, and
  // sharing all restore exactly what was on screen.
  const prevScreenRef = useRef(null);
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const prev = prevScreenRef.current;
      prevScreenRef.current = screen;
      if (screen === "events") {
        const sp = new URLSearchParams();
        if (eventDate !== "all") sp.set("date", eventDate);
        if (eventCat !== "all") sp.set("cat", eventCat);
        const target = "/events" + (sp.toString() ? "?" + sp.toString() : "");
        const cur = window.location.pathname + window.location.search;
        if (cur === target) return;
        if (window.location.pathname !== "/events") window.history.pushState({ wf: "screen" }, "", target);
        else window.history.replaceState({ wf: "screen" }, "", target); // filter change: same view, refined
      } else if (prev === "events" && window.location.pathname === "/events") {
        window.history.pushState({ wf: "screen" }, "", "/");
      }
    } catch (e) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, eventDate, eventCat]);

  // Back/Forward traverse the entries the effect above creates. The detail
  // sheet has its own popstate contract ({wf:"detail"} entries) — this
  // handler only reconciles the SCREEN with the pathname, which is a no-op
  // while a detail entry pops (pathname unchanged).
  useEffect(() => {
    const onPop = () => {
      try {
        const p = window.location.pathname;
        if (p === "/events") {
          const sp = new URLSearchParams(window.location.search);
          const d = sp.get("date") || "";
          setEventDate(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "all");
          setEventCat((sp.get("cat") || "all").slice(0, 24));
          setScreen("events");
        } else if (p === "/" && prevScreenRef.current === "events") {
          setScreen("suggested");
        }
      } catch (e) {}
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PROTECTED (check-cards.mjs): themed-sheet lists for revenue cards fetch
  // their own wide-radius results and never depend on the local food pool.
  useEffect(() => {
    const hd = hookDetail;
    if (!hd || !hd.fetchKey || hd.places || !center) return;
    const exp = EXPERIENCES[hd.fetchKey];
    if (!exp) return;
    let cancelled = false;
    (async () => {
      try {
        const _rad = hd.radiusOverride || 110000;
        const _kw = ((exp.keyword || "") + (hd.extraKeyword ? " " + hd.extraKeyword : "")).trim();
        let raw = await searchPlaces(exp.cat || "attractions", "all", { lat: center.lat, lng: center.lng }, _rad, "all", _kw);
        const sortFit = (arr) => arr.slice().sort((a, b) => ((b.wfScore || 0) + featuredBoost(b.name)) - ((a.wfScore || 0) + featuredBoost(a.name)));
        let results;
        if (exp.filter) {
          const passed = raw.filter(exp.filter);
          if (passed.length >= 5) results = sortFit(passed);
          else { const ids = new Set(passed.map((p) => p.id)); results = [...sortFit(passed), ...sortFit(raw.filter((p) => !ids.has(p.id)))]; }
        } else results = sortFit(raw);
        if (hd.priceMax != null) results = results.filter((p) => { const pl = p.price_level ?? p.priceLevel; return pl == null || pl <= hd.priceMax; });
        if (hd.openNowOnly) results = results.filter((p) => p.openNow !== false);
        if (hd.indoorOnly) results = results.filter((p) => { try { return Ranking.venueLean(p).lean === "indoor"; } catch (e) { return true; } });
        if ((hd.fetchKey || hd.theme) === "stays") results = results.filter(isTrueLodging);
        results = results.slice(0, 20);
        if (!cancelled) { setHookDetail((cur) => (cur && cur.id === hd.id && !cur.places) ? { ...cur, places: results } : cur); loadBlurbs(results); }
      } catch (e) {
        if (!cancelled) setHookDetail((cur) => (cur && cur.id === hd.id && !cur.places) ? { ...cur, places: [] } : cur);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookDetail && hookDetail.id, hookDetail && hookDetail.fetchKey, hookDetail && hookDetail.places ? 1 : 0, center]);

  // Surprise Me: an honest curator. Picks one standout for right now using the
  // signals we actually have: time of day, open status, distance, review quality.
  useEffect(() => {
    if (screen !== "surprise" || !center) return;
    if (diceRouteRef.current) { diceRouteRef.current = false; setSurpriseLoading(false); return; }
    let cancelled = false;
    (async () => {
      setSurpriseLoading(true);
      const h = new Date().getHours();
      let scat = "food";
      let skeyword = "";
      if (h < 11) skeyword = "breakfast";
      else if (h >= 21) scat = "nightlife";
      else if (h >= 17) skeyword = "dinner";
      try {
        const results = await searchPlaces(scat, "all", { lat: center.lat, lng: center.lng }, DEFAULT_RADIUS_M, "all", skeyword);
        if (!cancelled) {
          setSurprisePool(results);
          setSurprisePick(pickSurprise(results));
          loadBlurbs(results.slice(0, 6));
        }
      } catch {
        if (!cancelled) { setSurprisePool([]); setSurprisePick(null); }
      } finally {
        if (!cancelled) setSurpriseLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, center]);

  // Live local weather from the free, keyless Open-Meteo API. Drives the
  // greeting chip and nudges the Suggested feed. Fails soft to no weather.
  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/weather?lat=${center.lat}&lng=${center.lng}`);
        const d = await r.json();
        let cur = d && d.current ? d.current : null;
        if (!cur && d && d.hourly && d.hourly.time && d.hourly.time.length) { const _h = d.hourly; cur = { temperature_2m: _h.temperature_2m && _h.temperature_2m[0], apparent_temperature: _h.apparent_temperature && _h.apparent_temperature[0], weather_code: _h.weather_code && _h.weather_code[0], relative_humidity_2m: null, wind_speed_10m: null, dew_point_2m: null }; }
        const day = d && d.daily ? d.daily : null;
        if (cur && !cancelled) {
          const w = weatherFromCode(cur.weather_code);
          let sunset = null, sunsetMs = null, sunriseMs = null, updated = null;
          try { if (day && day.sunset && day.sunset[0]) { const sd = new Date(day.sunset[0]); sunset = sd.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); sunsetMs = sd.getTime(); } } catch {}
          try { if (day && day.sunrise && day.sunrise[0]) sunriseMs = new Date(day.sunrise[0]).getTime(); } catch {}
          try { updated = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch {}
          setWeather({
            temp: Math.round(cur.temperature_2m),
            feels: cur.apparent_temperature != null ? Math.round(cur.apparent_temperature) : null,
            humidity: cur.relative_humidity_2m != null ? Math.round(cur.relative_humidity_2m) : null,
            wind: cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : null,
            dew: cur.dew_point_2m != null ? Math.round(cur.dew_point_2m) : null,
            hi: day && day.temperature_2m_max ? Math.round(day.temperature_2m_max[0]) : null,
            lo: day && day.temperature_2m_min ? Math.round(day.temperature_2m_min[0]) : null,
            rain: day && day.precipitation_probability_max ? day.precipitation_probability_max[0] : null,
            uv: day && day.uv_index_max ? Math.round(day.uv_index_max[0]) : null,
            sunset, sunsetMs, sunriseMs, updated,
            icon: w.icon, img: w.img, label: w.label, warm: w.warm, wet: w.wet,
            hourly: (() => {
              try {
                const h = d.hourly; if (!h || !h.time) return [];
                const now = Date.now(); const out = [];
                for (let i = 0; i < h.time.length; i++) {
                  const t = new Date(h.time[i]).getTime();
                  if (t < now - 3600000) continue;
                  out.push({ ms: t, feels: h.apparent_temperature != null ? Math.round(h.apparent_temperature[i]) : Math.round(h.temperature_2m[i]), code: h.weather_code[i], day: h.is_day ? !!h.is_day[i] : true });
                }
                return out.filter((_, i) => i % 3 === 0).slice(0, 7);
              } catch (e) { return []; }
            })(),
          });
        }
      } catch { if (!cancelled) setWeather(null); }
    })();
    return () => { cancelled = true; };
  }, [center]);

  // Suggested for Me: one intelligent feed that blends categories using the
  // signals we honestly have now: time of day, today's weather, and what you
  // have saved. It gets smarter as more signals come online.
  useEffect(() => {
    if (screen !== "suggested" || !center) return;
    let cancelled = false;
    (async () => {
      setSuggestedLoading(true);
      try {
        const h = new Date().getHours();
        const wet = !!(weather && weather.wet);
        // Serve a recent cached feed for this area + time so we do not re-bill
        // Google every time the user returns to Home or nudges a filter.
        const bucket = h < 11 ? "m" : h < 16 ? "l" : h < 21 ? "d" : "n";
        const ckey = `wf_sug_${center.lat.toFixed(3)}_${center.lng.toFixed(3)}_${bucket}_${intent || "none"}_${wet ? "wet" : "dry"}`;
        try {
          const raw = localStorage.getItem(ckey);
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj && obj.ts && Date.now() - obj.ts < 45 * 60 * 1000 && Array.isArray(obj.places) && obj.places.length) {
              if (!cancelled) { setSuggested(obj.places); loadBlurbs(obj.places.slice(0, 8)); }
              return;
            }
          }
        } catch {}
        let plans;
        const intentDef = intent ? INTENTS.find((x) => x.id === intent) : null;
        if (intentDef) plans = intentDef.plans.slice();
        else if (h < 11) plans = [
          { cat: "food", kw: "breakfast" },
          { cat: "food", kw: "coffee" },
          { cat: "attractions", kw: "park" },
          { cat: "attractions", kw: "things to do" },
        ];
        else if (h < 16) plans = [
          { cat: "food", kw: "lunch" },
          { cat: "food", kw: "" },
          { cat: "attractions", kw: "things to do" },
          { cat: "attractions", kw: "park" },
          { cat: "nightlife", kw: "brewery" },
          { cat: "shopping", kw: "" },
        ];
        else if (h < 21) plans = [
          { cat: "food", kw: "dinner" },
          { cat: "food", kw: "" },
          { cat: "nightlife", kw: "cocktail bar" },
          { cat: "nightlife", kw: "rooftop bar" },
          { cat: "attractions", kw: "live music" },
          { cat: "attractions", kw: "things to do" },
        ];
        else plans = [
          { cat: "food", kw: "late night" },
          { cat: "nightlife", kw: "night club" },
          { cat: "nightlife", kw: "bar" },
          { cat: "nightlife", kw: "rooftop bar" },
          { cat: "food", kw: "" },
        ];
        if (wet) plans = plans.filter((p) => { const k = p.kw || ""; return !(k.includes("park") || k.includes("rooftop") || k.includes("outdoor")); });
        plans = plans.slice(0, 3); // cap parallel Google searches per load to control cost
        const results = await Promise.all(plans.map((pl) =>
          searchPlaces(pl.cat, "all", { lat: center.lat, lng: center.lng }, 32000, "all", pl.kw).catch(() => [])
        ));
        const seen = new Set();
        const buckets = [];
        results.forEach((res) => {
          const arr = (res || []).slice().sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
          const picked = [];
          for (const rr of arr) { if (rr && rr.id && !seen.has(rr.id)) { seen.add(rr.id); picked.push(rr); if (picked.length >= 6) break; } }
          if (picked.length) buckets.push(picked);
        });
        let merged = [];
        let ri = 0;
        while (merged.length < 30) {
          let added = false;
          for (const b of buckets) { if (b[ri]) { merged.push(b[ri]); added = true; } }
          if (!added) break;
          ri++;
        }
        merged = merged.slice(0, 24);
        try { localStorage.setItem(ckey, JSON.stringify({ ts: Date.now(), places: merged })); } catch {}
        if (!cancelled) { setSuggested(merged); loadBlurbs(merged.slice(0, 8)); }
      } catch {
        if (!cancelled) setSuggested([]);
      } finally {
        if (!cancelled) setSuggestedLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, center, weather, intent]);

  // v1.1: fetch a small "things to do" set for the home area so the Top 10 things
  // to do card shows real attractions, not the food feed. Cached ~24h per area,
  // so it costs roughly one Google search per area per day.
  useEffect(() => {
    if (screen !== "suggested" || !center) return;
    let cancelled = false;
    (async () => {
      try {
        const ckey = `wf_todo_${center.lat.toFixed(3)}_${center.lng.toFixed(3)}`;
        try {
          const raw = localStorage.getItem(ckey);
          if (raw) {
            const obj = JSON.parse(raw);
            if (obj && obj.ts && Date.now() - obj.ts < 24 * 60 * 60 * 1000 && Array.isArray(obj.places)) {
              if (!cancelled) setHomeTodo(obj.places);
              return;
            }
          }
        } catch {}
        let res = [];
        try { res = await searchPlaces("attractions", "all", { lat: center.lat, lng: center.lng }, 32000, "all"); } catch {}
        const arr = Array.isArray(res) ? res : [];
        try { localStorage.setItem(ckey, JSON.stringify({ ts: Date.now(), places: arr })); } catch {}
        if (!cancelled) setHomeTodo(arr);
      } catch {
        if (!cancelled) setHomeTodo([]);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, center]);

  // v1.3: make the browser/Safari back button (and swipe-back) close the detail
  // sheet instead of leaving the app. Push one history entry when it opens; all
  // close paths call history.back(), which fires popstate and closes it cleanly.
  useEffect(() => {
    if (!detail) return;
    window.history.pushState({ wf: "detail" }, "");
    const onPop = () => setDetail(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!detail]);

  // v1.3: load the grounded dish/tip insight as soon as a place opens (once its
  // reviews are in), so "What to order" shows up top, not only after expanding.
  useEffect(() => {
    if (detail && !detail._event && detailExtra) { try { loadFullInsight(detail, detailExtra); } catch (e) {} }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail && detail.id, detailExtra]);

  // When the searched location changes, drop the AI hooks built for the previous
  // place so the home cards never keep recommending where you used to be. They
  // fall back to fresh generateHooks() until new AI hooks load for the new spot.
  useEffect(() => {
    setAiHooks(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center && center.lat, center && center.lng]);

  // Signature of the place set the hooks are grounded on. Changes whenever the
  // actual places change (a new location search), even if the count is the same,
  // so the AI hook fetch re-runs for the new spot instead of keeping stale cards.
  const hookSrcSig = ((suggested && suggested.length > 0 ? suggested : places) || []).filter(Boolean).slice(0, 20).map((p) => p && p.id).join("|");

  // Fetch AI-generated hooks once we have real place data to ground them on.
  // Falls back to the static generateHooks() output if the API call fails.
  useEffect(() => {
    const src = (suggested && suggested.length > 0 ? suggested : places).filter(Boolean);
    if (src.length < 3) return;
    const _hr = new Date().getHours(); const _tb = _hr < 11 ? "m" : _hr < 15 ? "a" : _hr < 21 ? "e" : "n";
    const _hkey = "wf_hooks_v1_" + _tb + "_" + hookSrcSig;
    try { const raw = localStorage.getItem(_hkey); if (raw) { const o = JSON.parse(raw); if (o && o.t && Date.now() - o.t < 3 * 3600 * 1000 && Array.isArray(o.v) && o.v.length) { setAiHooks(o.v); return; } } } catch (e) {}
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/hooks", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            places: src.slice(0, 20).map((p) => ({ id: p.id, name: p.name, rating: p.rating, reviews: p.reviews, distMi: p.distMi, openNow: p.openNow, price: p.price, type: p.type })),
            locName, hour: new Date().getHours(),
            weather: weather ? { temp: weather.temp, label: weather.label } : null,
            signals: signals.slice(0, 50),
          }),
        });
        const data = await res.json();
        if (!cancelled && data.hooks && data.hooks.length > 0) { const _nh = data.hooks.map(normalizeHook); setAiHooks(_nh); try { localStorage.setItem(_hkey, JSON.stringify({ t: Date.now(), v: _nh })); } catch (e) {} }
      } catch { /* fall back to static hooks silently */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hookSrcSig]);

  // Lightweight events strip for the For You screen. Fail-soft: any error just
  // hides the strip and never blocks the picks.
  useEffect(() => {
    if (screen !== "suggested" || !center) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat: center.lat, lng: center.lng, radius: 25, city: locName }) });
        if (!r.ok) { if (!cancelled) setForyouEvents([]); return; }
        const data = await r.json();
        const evs = ((data && data.events) || []).filter((e) => e && e.dest);
        if (!cancelled) {
          setForyouEvents(evs.slice(0, 8));
          setLibraryEvents(evs.filter((e) => e.civic).slice(0, 6));
        }
      } catch { if (!cancelled) { setForyouEvents([]); setLibraryEvents([]); } }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, center]);

  // When the opened place is a beach, pull live wind + wave conditions.
  useEffect(() => {
    if (!detail || !isBeach(detail) || detail.lat == null || detail.lng == null) { setBeachCond(null); setBeachCondLoading(false); return; }
    let cancelled = false;
    setBeachCond(null);
    setBeachCondLoading(true);
    (async () => {
      const c = await loadBeachConditions(detail);
      if (!cancelled) { setBeachCond(c); setBeachCondLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  function onQueryChange(v) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!v || v.trim().length < 3) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => fetchSuggestions(v.trim()), 250);
  }

  async function fetchSuggestions(q) {
    try {
      const { AutocompleteSuggestion, AutocompleteSessionToken } = await getLoader().importLibrary("places");
      if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
      // Geographic types — anything else is treated as an establishment/place.
      const AREA_TYPES = new Set([
        "locality", "administrative_area_level_1", "administrative_area_level_2",
        "administrative_area_level_3", "administrative_area_level_4",
        "postal_code", "country", "colloquial_area", "neighborhood",
        "sublocality", "sublocality_level_1", "route", "geocode",
      ]);
      let res;
      try {
        // No type filter — let Google surface both places and areas.
        // Location bias keeps establishment results close to the current center.
        res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: tokenRef.current,
          ...(center ? { locationBias: { center: { lat: center.lat, lng: center.lng }, radius: 50000 } } : {}),
        });
      } catch {
        res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: tokenRef.current,
        });
      }
      const list = (res?.suggestions || [])
        .map((s) => s.placePrediction)
        .filter(Boolean)
        .map((pp) => {
          const text = (pp.text && (pp.text.text || pp.text)) || "";
          const types = pp.types || [];
          const kind = types.some((t) => AREA_TYPES.has(t)) ? "area" : "place";
          return { text, pp, kind };
        })
        .filter((x) => x.text)
        .slice(0, 6);
      setSuggestions(list);
    } catch {
      setSuggestions([]);
    }
  }

  async function pickSuggestion(item) {
    setSuggestions([]);
    setQuery("");
    tokenRef.current = null;

    if (item.kind === "place") {
      // Route straight to the place's detail sheet.
      setLoading(true);
      try {
        const place = item.pp.toPlace();
        await place.fetchFields({
          fields: [
            "id", "location", "displayName", "formattedAddress", "types",
            "rating", "userRatingCount", "photos", "priceLevel",
            "regularOpeningHours", "businessStatus",
          ],
        });
        const photoUrl = (place.photos || [])[0]?.getURI?.({ maxWidth: 640 }) || null;
        const allPhotos = (place.photos || []).slice(0, 6).map((ph) => ph.getURI?.({ maxWidth: 640 })).filter(Boolean);
        const PRICE_LEVELS = ["FREE", "INEXPENSIVE", "MODERATE", "EXPENSIVE", "VERY_EXPENSIVE"];
        const priceNum = place.priceLevel != null
          ? (typeof place.priceLevel === "number" ? place.priceLevel : PRICE_LEVELS.indexOf(String(place.priceLevel)))
          : null;
        const placeObj = {
          id: place.id,
          name: (place.displayName?.text || place.displayName || item.text).split(",")[0].trim(),
          lat: place.location?.lat(),
          lng: place.location?.lng(),
          address: place.formattedAddress || "",
          type: (place.types || [])[0] || "",
          types: place.types || [],
          rating: place.rating || null,
          reviews: place.userRatingCount || 0,
          priceNum: priceNum >= 0 ? priceNum : null,
          price: priceNum > 0 ? "$".repeat(priceNum) : null,
          photo: photoUrl,
          photos: allPhotos,
          openNow: place.regularOpeningHours?.isOpen?.() ?? null,
          mapsUrl: `https://www.google.com/maps/search/?api=1&query_place_id=${place.id}`,
          labels: [],
          wfScore: null,
        };
        // Recenter explore list to this place's area for the "similar spots" context.
        if (place.location) {
          setCenter({ lat: place.location.lat(), lng: place.location.lng() });
          manualRef.current = true;
        }
        openDetail(placeObj);
      } catch {
        showToast("Could not load this place");
      } finally {
        setLoading(false);
      }
      return;
    }

    // Area / city — recenter and reload the explore feed.
    setLoading(true);
    manualRef.current = true;
    try {
      const place = item.pp.toPlace();
      await place.fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
      const loc = place.location;
      if (loc) {
        setCenter({ lat: loc.lat(), lng: loc.lng() });
        const fa = place.formattedAddress || (place.displayName && (place.displayName.text || place.displayName)) || item.text;
        setLocName(String(fa).split(",").slice(0, 2).join(",").trim());
      }
    } catch {
      try {
        const c = await geocodeCity(item.text);
        if (c) { setCenter(c); setLocName(c.name.split(",").slice(0, 2).join(",").trim()); }
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  function jumpToArea(a) {
    manualRef.current = true;
    setSearchMode(false);
    setCenter({ lat: a.lat, lng: a.lng, name: a.name });
    setLocName(a.name);
    setSearchRadius(a.radius || 24140);
    setQuery("");
    setSuggestions([]);
    try { if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 }); } catch (e) {}
  }

  async function submitSearch(qOverride, opts) {
    try { logEvent("search", null, { q: String(query || "").slice(0, 80) }); } catch (e) {}
    const q = (typeof qOverride === "string" ? qOverride : query).trim();
    if (!q) { openSurprise(); return; }
    setSuggestions([]);
    // Check if it's a Wayfind experience keyword first (burgers, rooftop, live music…).
    const ql = q.toLowerCase();
    const feel = feelingToMoment(ql);
    if (feel) { setQuery(""); try { logEvent("feeling_search", null, { q: ql.slice(0, 40) }); } catch (e) {} openMoment(feel); return; }
    if (ql.length >= 3) {
      const expHit = Object.keys(EXPERIENCES).find((k) => {
        const e = EXPERIENCES[k];
        const lab = (e.label || "").toLowerCase();
        return k === ql || lab === ql || lab.includes(ql) || (e.keyword && e.keyword.toLowerCase().includes(ql));
      });
      if (expHit) { setQuery(""); openExperience(expHit); return; }
    }
    setLoading(true);
    manualRef.current = true;
    // Use the device GPS if available (more accurate than geocoded center)
    const searchCenter = deviceLoc
      ? { lat: deviceLoc.lat, lng: deviceLoc.lng }
      : center ? { lat: center.lat, lng: center.lng } : null;
    try {
      // Try nearby place / chain search within 20 miles first.
      // This handles McDonald's, Burger King, any specific restaurant or business.
      if (searchCenter) {
        const nearby = await searchNearbyPlaces(q, searchCenter, (opts && opts.miles) || 20);
        if (nearby && nearby.length > 0) {
          setQuery("");
          if (nearby.length === 1) {
            // Single match — open detail directly
            setSearchMode(true);
            setLoading(false);
            openDetail(nearby[0]);
          } else {
            // v4.63: multiple matches open in the modern themed sheet — the
            // legacy explore screen is retired as a search destination.
            const sorted = nearby.slice().sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12));
            setLoading(false);
            setHookDetail({ id: "search-" + Date.now(), theme: "search", title: `Results for "${q}"`, themeTitle: `Results for "${q}"`, label: q, themeBody: "The closest matches near " + (locName ? locName.split(",")[0] : "you") + ", ranked for right now.", emoji: "\uD83D\uDD0E", accent: C.accent, places: sorted, sections: null });
            try { window.scrollTo(0, 0); } catch (e) {}
          }
          return;
        }
      }
      // Fall back to area / city geocode search.
      // v4.62: "best of {city}" opens the Best-of sheet for that city, and
      // repeated-letter typos ("paaarrish") collapse before we give up. A
      // user asking for a city must never hit a dead end over a prefix or a
      // held-down key.
      const collapse = (x) => [x, x.replace(/(.)\1{2,}/g, "$1$1"), x.replace(/(.)\1{1,}/g, "$1")];
      const geoTry = async (name) => { for (const v of collapse(name)) { try { const g = await geocodeCity(v); if (g) return g; } catch (e) {} } return null; };
      const bo = q.match(/^\s*(?:the\s+)?best\s+of\s+(.{2,40})$/i);
      if (bo) {
        const g = await geoTry(bo[1].trim());
        if (g) {
          setCenter(g); const nm = g.name.split(",").slice(0, 2).join(",").trim(); setLocName(nm);
          setSearchMode(false); setSearchLabel(""); setQuery(""); setLoading(false);
          setTimeout(() => { try { openExpSheet("bestof"); } catch (e) {} }, 60);
          return;
        }
      }
      const c = (await geocodeCity(q)) || (await geoTry(q));
      if (c) {
        setCenter(c);
        setLocName(c.name.split(",").slice(0, 2).join(",").trim());
        setSearchMode(false);
        setSearchLabel("");
        setQuery("");
      } else {
        setErr("Nothing found. Try a restaurant name, chain, or city.");
      }
    } catch {
      setErr("Search failed. Try again.");
    } finally { setLoading(false); }
  }

  function saveToList(listId) {
    if (!requireAuth("Sign in to save")) return;
    if (!saveTarget) return;
    const target = saveTarget;
    const existing = lists[listId];
    const wasAdd = existing && !existing.places.some((p) => p.id === target.id);
    setLists((prev) => {
      const l = prev[listId];
      if (!l) return prev;
      const has = l.places.some((p) => p.id === target.id);
      return { ...prev, [listId]: { ...l, places: has ? l.places.filter((p) => p.id !== target.id) : [...l.places, target] } };
    });
    if (wasAdd) setTrips((prev) => Trips.addPlaceToTrips(prev, target, Date.now()));
    setSaveTarget(null);
  }
  // One-tap save straight to Favorites from a card heart.
  function quickSaveFavorite(p) {
    if (!requireAuth("Sign in to save favorites")) return;
    if (!p) return;
    const fav = lists.favorites || { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
    const has = fav.places.some((x) => x.id === p.id);
    setLists((prev) => {
      const f = prev.favorites || { id: "favorites", name: "Favorites", emoji: "❤️", places: [] };
      const h = f.places.some((x) => x.id === p.id);
      return { ...prev, favorites: { ...f, places: h ? f.places.filter((x) => x.id !== p.id) : [...f.places, p] } };
    });
    showToast(has ? "Removed from Favorites" : "❤️ Saved to Favorites");
    if (!has) logEvent("save", p);
    // Auto-file into the city trip on save only. Unsaving from Favorites must
    // not remove it from a trip: the trip is an independent, curated plan.
    if (!has) setTrips((prev) => Trips.addPlaceToTrips(prev, p, Date.now()));
    if (supabase && user) {
      if (has) {
        supabase.from("saved_places").delete().eq("user_id", user.id).eq("place_id", p.id).eq("list_name", "Favorites").then(() => {}, () => {});
      } else {
        supabase.from("saved_places").upsert({ user_id: user.id, place_id: p.id, place: p, list_name: "Favorites" }, { onConflict: "user_id,place_id,list_name" }).then(() => {}, () => {});
      }
    }
  }
  // Save a whole curated hook list as its own list under Favorites.
  function saveHookList(hook, places) {
    if (!requireAuth("Sign in to save lists")) return;
    if (!hook || !places || !places.length) return;
    const key = "hook_" + hook.id;
    const existed = !!lists[key];
    setLists((prev) => {
      if (prev[key]) { const next = { ...prev }; delete next[key]; return next; }
      return { ...prev, [key]: { id: key, name: hook.themeTitle || hook.hook || "Saved list", emoji: hook.emoji || "✨", places: places.map((x) => x) } };
    });
    showToast(existed ? "Removed from your lists" : "❤️ Saved to your lists");
  }
  // Heart on a recommendation card: like it AND save the full list to Favorites.
  function onHookHeart(hookId) {
    if (!requireAuth("Sign in to save")) return;
    toggleHookLike(hookId);
    const h = (hookCards || []).find((x) => x.id === hookId);
    if (!h) return;
    const allSrc = [...(suggested || []), ...places].filter(Boolean);
    const pls = placesForHook(h, allSrc);
    if (pls.length) saveHookList(h, pls);
  }
  const isSaved = (id) => Object.values(lists).some((l) => l.places.some((p) => p.id === id));

  function createList() {
    if (!requireAuth("Sign in to create lists")) return;
    const name = newName.trim();
    if (!name) return;
    const id = "list_" + Date.now();
    setLists((prev) => ({ ...prev, [id]: { id, name, emoji: newEmoji, places: [] } }));
    setNewName(""); setNewEmoji("⭐"); setNewListOpen(false);
  }
  function deleteList(id) {
    if (!requireAuth("Sign in to manage lists")) return;
    if (id === "favorites") return;
    setLists((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setActiveList(null);
  }
  function renameList() {
    if (!requireAuth("Sign in to manage lists")) return;
    const name = newName.trim();
    if (!name || !renamingList) return;
    setLists((prev) => prev[renamingList] ? { ...prev, [renamingList]: { ...prev[renamingList], name } } : prev);
    setNewName(""); setRenamingList(null);
  }
  function openRename(id) {
    setListMenu(null); setRenamingList(id); setNewName((lists[id] && lists[id].name) || "");
  }
  // v4.7: share the current conditions as a clean text summary plus a link home.
  // A weather-specific preview card is the next step; the text already carries the read.
  function shareWeather() {
    if (!weather) return;
    const place = locName ? locName.split(",")[0] : "your area";
    const when = isNightNow(weather) ? "Tonight" : "Right now";
    const t = wayfindWeatherTake(weather);
    const cond = (weather.label || "").toLowerCase();
    let txt = `${when} in ${place}: ${weather.temp}°`;
    if (cond) txt += `, ${cond}`;
    if (weather.feels != null) txt += `, feels ${weather.feels}°`;
    txt += ".";
    if (t && t.good && t.good.length) txt += ` Good for ${t.good.join(", ")}.`;
    txt += " via Wayfind";
    const takeStr = (t && t.good && t.good.length) ? ("Good for " + t.good.join(", ")) : "";
    let wurl = "/w?loc=" + encodeURIComponent(place);
    if (weather.temp != null) wurl += "&temp=" + encodeURIComponent(weather.temp);
    if (weather.label) wurl += "&cond=" + encodeURIComponent(weather.label);
    if (takeStr) wurl += "&take=" + encodeURIComponent(takeStr.slice(0, 110));
    shareLink(`${when} in ${place}`, originUrl(wurl), () => showToast("Copied"), txt);
  }
  // Build a shareable link. With Supabase we store the list and share a short
  // code, so the URL is clean and unfurls into a rich preview. Without it we
  // fall back to the long self-contained link.
  async function buildListShareUrl(places, title) {
    const payload = encodeList(places);
    const n = (places || []).length;
    const names = (places || []).map((p) => p && p.name).filter(Boolean);
    const sub = names.slice(0, 2).join(", ") + (names.length > 2 ? " and " + (names.length - 2) + " more" : "");
    const q = `t=${encodeURIComponent(title || "")}&loc=${encodeURIComponent(locName || "")}&n=${n}&sub=${encodeURIComponent(sub)}`;
    if (supabase && payload) {
      try {
        const code = randCode();
        const { error } = await supabase.from("shared_lists").insert({ code, payload, title: title || "", loc: locName || "", n });
        if (!error) return originUrl(`/s/${code}?${q}`);
      } catch {}
    }
    if (payload) return originUrl(`/s/${payload}?${q}`);
    return originUrl("/");
  }
  async function shareList(places, title) {
    if (!places || !places.length) return;
    const url = await buildListShareUrl(places, title);
    shareLink(`Wayfind list: ${title}`, url, () => showToast("Link copied"), `${title}. Help me wayfind it`, () => { try { logEvent("share", null, { kind: "list", n: places.length, title: title || "" }); } catch (e) {} giveawayMark("list:" + (title || "list")); });
  }

  if (keyMissing) {
    return (
      <div style={shell}>
        <div style={{ ...wrap, alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔑</div>
            <h2 style={{ color: C.text, margin: "0 0 8px" }}>Almost there</h2>
            <p style={{ color: C.light, maxWidth: 360, lineHeight: 1.6 }}>
              Add your Google Maps API key as an environment variable named{" "}
              <code style={{ color: C.accent }}>NEXT_PUBLIC_GOOGLE_MAPS_KEY</code> in Vercel, then redeploy.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const subs = SUBFILTERS[cat] || [];
  const vibes = VIBES[cat] || [];
  // One source of truth: the experience nav is generated from the badge
  // registry itself, so every badge that can appear on a card is also tappable
  // here. A lead order surfaces the most useful first; the rest follow.
  // A short, curated row of the most useful experiences. Every other badge stays
  // reachable through the "See all" chip, so the registry is still one source of
  // truth without flooding the home row.
  const HOME_CHIPS = ["gem", "family", "entertainment", "stays", "shows", "value", "budget", "instagram", "outdoor", "bestof"].filter((k) => EXPERIENCES[k]);
  const _viewCtx = { weather, hour: new Date().getHours(), isWeekend: [0, 6].includes(new Date().getDay()) };
  const _mealPool = cat === "food" ? mealGate(places, sub) : places;
  // v4.25: every sort mode is real on the browse feed, the distance limit
  // applies to all of them, and the near-first rule survives ranking.
  const _distFiltered = [..._mealPool].filter((p) => sliderMi >= 60 || p.distMi == null || p.distMi <= sliderMi);
  let viewBase;
  if (sortBy === "near") {
    viewBase = _distFiltered.sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12));
  } else if (sortBy === "rated") {
    viewBase = _distFiltered.sort((a, b) => (((b.wfScore || 0) - ((b.distMi || 0) <= 4 ? 0 : Math.min(30, ((b.distMi || 0) - 4) * 1.3)) + (b.openNow === false ? -8 : 0)) - ((a.wfScore || 0) - ((a.distMi || 0) <= 4 ? 0 : Math.min(30, ((a.distMi || 0) - 4) * 1.3)) + (a.openNow === false ? -8 : 0))) || ((b.reviews || 0) - (a.reviews || 0))); // v4.97 "Top rated" = Bayesian quality − distance + open-now, never raw stars
  } else if (sortBy === "price") {
    viewBase = _distFiltered.sort((a, b) => (((a.price_level ?? a.priceLevel ?? 9)) - ((b.price_level ?? b.priceLevel ?? 9))) || ((b.rating || 0) - (a.rating || 0)));
  } else {
    viewBase = Ranking.rankByConditions(_distFiltered, _viewCtx, (p) => (p.wfScore || 0) + faveTier(p.name) * 4 + featuredBoost(p.name) + communityBoost(p));
    // Near-first rule: with 5+ options inside 12 miles, nothing past 20 may outrank them.
    const _nc = viewBase.filter((p) => p && p.distMi != null && p.distMi <= 12).length;
    if (_nc >= 5) viewBase = [...viewBase.filter((p) => !(p.distMi != null && p.distMi > 20)), ...viewBase.filter((p) => p.distMi != null && p.distMi > 20)];
  }
  const view = dedupePlaces(dealsOnly ? viewBase.filter((p) => offers[p.id]) : viewBase, !searchMode);
  // Explore now opens on a single standout, just like the home screen. Prefer a
  // place you can actually go to now; the rest of the ranked list follows below.
  const exHero = (!loading && view.length > 0) ? (view.find((p) => liveOpen(p) === true) || view[0]) : null;
  const exHeroSl = exHero ? scoreLabel(exHero.wfScore) : null;
  const restView = exHero ? view.filter((p) => p && p.id !== exHero.id) : view;


  const exploreList = (
    <>
      {/* v3.7 Phase 2: "Good evening" header (greeting, weather, Pick for me, Experiences button, experience pills) hidden per request. The ranked list below is computed from the same place data, unaffected. Experiences moved to the ✨ Nearby control in the sort row. */}
      <div style={{ padding: "10px 2px 6px" }}>
        {loading ? <Loader label="Finding the best spots" pad="0" /> : (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.3px" }}>{searchLabel || picksHeader(cat)}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 2 }}>
              <div style={{ fontSize: 12.5, color: C.muted }}>
                {view.length} result{view.length === 1 ? "" : "s"} ·{" "}
                <span style={{ color: C.accent, fontWeight: 700 }}>
                  {sortBy === "near" ? "nearest first" : "ranked by fit"}
                </span>
              </div>
              {searchLabel && (
                <button onClick={() => { setSearchMode(false); setSearchLabel(""); setSortBy("near"); }} style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}>Clear ×</button>
              )}
            </div>
          </>
        )}
      </div>
      {!loading && (
        <div style={{ padding: "0 2px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 4 }}>
            <SortControl sortBy={sortBy} onSort={(k) => setSortBy(k)} mi={sliderMi} onMi={(m) => { autoRadiusRef.current = false; setSliderMi(m); const mm = Math.round(m * 1609.34); if (mm > (searchRadius || 0)) setSearchRadius(mm); }} where={locName ? locName.split(",")[0] : "you"} dealsAvailable={Object.keys(offers).length > 0} dealsOnly={dealsOnly} onDeals={setDealsOnly} />
          </div>
        </div>
      )}
      {exHero && (
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, margin: "2px 2px 8px" }}>Best move right now</div>
      )}
      {exHero && (() => {
        const open = liveOpen(exHero);
        const badgeIcon = open === true ? "✨" : "📍";
        const badgeText = open === true ? "Open now · top pick" : "Top pick nearby";
        return (
          <div style={{ marginBottom: 16, border: `1.5px solid ${C.accent}`, borderRadius: 18, overflow: "hidden", background: `linear-gradient(160deg, rgba(255,150,70,.10) 0%, ${C.card} 60%)`, boxShadow: "0 6px 24px rgba(0,0,0,.35)" }}>
            <div onClick={() => openDetail(exHero)} style={{ cursor: "pointer" }}>
              <div style={{ position: "relative" }}>
                <FallbackImg src={exHero.photo} icon="📍" style={{ width: "100%", height: 185, objectFit: "cover", display: "block" }} />
                <div style={{ position: "absolute", top: 12, left: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,.62)", border: `1px solid ${C.accent}80`, borderRadius: 999, padding: "5px 11px", backdropFilter: "blur(4px)" }}>
                  <span style={{ fontSize: 12 }}>{badgeIcon}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.7px" }}>{badgeText}</span>
                </div>
              </div>
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{exHero.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  {exHeroSl && <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{exHeroSl.word}</span>}
                  {exHeroSl && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{exHeroSl.s}/10</span>}
                  {exHero.rating && <span style={{ color: "#F59E0B", fontSize: 13 }}>★ {exHero.rating}</span>}
                  {exHero.reviews != null && <span style={{ fontSize: 12, color: C.muted }}>· {exHero.reviews.toLocaleString()} reviews</span>}
                  {open === true && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>· Open now</span>}
                  {open === false && <span style={{ fontSize: 12, fontWeight: 700, color: exHero.nextOpen && exHero.nextOpen.today ? C.gold : C.red }}>· {exHero.nextOpen && exHero.nextOpen.today ? exHero.nextOpen.label : "Closed"}</span>}
                  {exHero.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {exHero.distMi.toFixed(1)} mi</span>}
                </div>
                {blurbs[exHero.id] && <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.5, marginTop: 10 }}><span style={{ color: C.accent, fontWeight: 800 }}>Why: </span>{blurbs[exHero.id]}</div>}
              </div>
            </div>
          </div>
        );
      })()}
      {err && <div style={{ color: C.red, fontSize: 13, padding: "4px 2px 12px" }}>{err} <span onClick={() => setFeedRetry((t) => t + 1)} style={{ color: C.accent, fontWeight: 800, cursor: "pointer", marginLeft: 6 }}>Retry ↻</span></div>}
      {!loading && !err && view.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><NavIcon name={cat} color={C.muted} size={38} /></div>
          <strong style={{ display: "block", color: C.light }}>Nothing here yet</strong>
          <span style={{ fontSize: 13 }}>We're still adding spots in your area. Try another category nearby.</span>
        </div>
      )}
      {restView.slice(0, 3).map((p, i) => (
        <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} />
      ))}
      {restView.length > 3 && hookCards.length > 0 && (
        <HooksBanner hooks={hookCards} likedIds={hookLikes} totalLiked={hookLikes.size} onOpen={openHook} onLike={onHookHeart} allPlaces={[...(suggested || []), ...places].filter(Boolean)} isDesktop={isDesktop} />
      )}
      {renderWorldCupCard(false)}
      {renderUniqueFinds()}
      {homeRolling && (
        <>
          <style>{"@keyframes wfDiceSpin{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.14)}100%{transform:rotate(360deg) scale(1)}}"}</style>
          <div style={{ position: "fixed", bottom: "calc(84px + env(safe-area-inset-bottom))", right: 16, zIndex: 60, pointerEvents: "none", width: 62, height: 62, borderRadius: 16, background: "linear-gradient(135deg, #7C3AED, #4C1D95)", boxShadow: "0 10px 30px rgba(124,58,237,.55)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, animation: "wfDiceSpin .7s linear infinite" }}>{homeDiceFace}</div>
        </>
      )}
      {restView.slice(3, visibleCount).map((p, i) => (
        <PlaceCard key={p.id} p={p} rank={i + 4} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} />
      ))}
      {!loading && restView.length > visibleCount && (
        <div style={{ padding: "2px 2px 10px" }}>
          <div style={{ height: 1, background: C.border, margin: "0 0 12px" }} />
          <button onClick={() => setVisibleCount((c) => c + 5)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, height: 50, borderRadius: 14, border: "none", background: "linear-gradient(180deg, #FB923C 0%, #F97316 52%, #EA580C 100%)", color: "#fff", fontSize: 14.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(249,115,22,.4)" }}>
            Wayfind 5 more spots
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block" }}><path d="M5 12h13M13 6l6 6-6 6" /></svg>
          </button>
          <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted, marginTop: 9 }}>More spots worth your time nearby</div>
        </div>
      )}
    </>
  );

  // G1: fetch every extracted screen chunk at first idle, so the first tap on
  // the dice, Saved, Itinerary, Coupons, or Events never waits on the network.
  useEffect(() => {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 2500));
    const h = idle(() => SCREEN_LOADERS.forEach((load) => { try { load().catch(() => {}); } catch (e) {} }));
    return () => { try { (window.cancelIdleCallback || clearTimeout)(h); } catch (e) {} };
  }, []);

  // G1: the one ctx bag handed to the extracted screens. Every hook stays in
  // PageInner — screens are render-only and read state/callbacks/module
  // helpers from here. Add members as later phases extract more surfaces.
  const ctx = {
    // shared navigation + card actions
    setScreen, openDetail, openExperience, openCuisine, openVenue, quickSaveFavorite, isSaved, liked, disliked, toggleLike, toggleDislike, addShared, giveawayMark, blurbs, logEvent, requireAuth,
    // module-scope components + helpers the screens render with
    PlaceCard, CategoryMenu, StateBadge, Loader, FallbackImg, AreaInsight, experienceBadges, cityFixM, liveOpen, iconForPlace, openExternal,
    // surprise
    surprisePick, surprisePool, surpriseLoading, setSurprisePick, rerollSurprise,
    // coupons
    cpnOffers, savedCoupons, toggleSaveCoupon, copyCouponCode, walletOpen, setWalletOpen,
    // saved
    activeList, setActiveList, sysFolder, setSysFolder, setNewListOpen, user, setAuthOpen, signOutUser, lists, setListMenu, likedItems, dislikedItems, sharedItems, shareList, deleteList, rollDice,
    // itinerary
    activeTrip, setActiveTrip, trips, setTrips, tripNoteEdit, setTripNoteEdit, tripMoveFor, setTripMoveFor, sub, pickBrowse, reservations, removeRes, saveResConf,
    // shared list
    sharedList, setSharedList,
    // events
    events, eventCat, setEventCat, eventDate, setEventDate, locName, center, submitSearch, eventsLoading, eventsUnavailable, eventsError, loadEvents, eventSegmentMeta, dedupeEvents, formatEventDate, eventCategory, recurrenceLabel, cleanVenueName, eventCTA, ticketUrl, eventUseImage,
    // sheets (G2): drag-to-dismiss handlers shared by every sheet
    sheetDragStart, sheetDragMove, sheetDragEnd,
    // hookDetail sheet
    hookDetail, setHookDetail, hookLikes, suggested, places, offers, isDesktop, hkSort, setHkSort, hkMi, setHkMi, hkDeals, setHkDeals, weather, cityNow, dedupePlaces, placesForHook, pickReason, isNightNow, toggleHookLike, saveHookList, setMapListOverride, listShareUrl, shareLink, showToast, buildListShareUrl, whyFirst, Critter, SortControl,
    // account sheet
    accountOpen, setAccountOpen, wfShowDiag, BUILD_ID,
    // menu sheet (6 sub-states incl. weather)
    menuSheet, setMenuSheet, pickCat, openSurprise, SheetHero, libraryEvents, primaryCategory, foryouEvents, whyNow, searchRadius, setPendingRadius, setRadiusSheet, rollHomePick, homeRolling, homeDiceFace, rollHistory, INTENTS, intent, setIntent, moonImgName, weatherAdvisory, wayfindWeatherTake, uvLabel, shareWeather,
    // auth + password-recovery sheets
    authOpen, authMode, setAuthMode, isStandalone, signInWithProvider, authEmail, setAuthEmail, authPassword, setAuthPassword, passwordAuth, authSending, resetSending, sendPasswordReset, recoveryOpen, setRecoveryOpen, newPw, setNewPw, newPw2, setNewPw2, pwSaving, saveNewPassword,
    // detail sheet (G3)
    detail, setDetail, detailExtra, setLightbox, reviewsOpen, setReviewsOpen, hoursOpen, setHoursOpen, venueEvents, venueEventsLoading, venueEventsOpen, setVenueEventsOpen, videos, videosLoading, beachCond, beachCondLoading, insight, insightLoading, insightFull, insightFullLoading, showMore, viaTours, debugOn, placeComments, setPlaceComments, commentType, setCommentType, placePosts, setPlacePosts, confirmDel, setConfirmDel, taInfo, insider, detailContext, myVotes, communityVotes, galleryRef, noteRef, scrollGallery, loadFullInsight, addReservation, handleVote, loadVenueEvents, placeShareUrl, FeaturedTag, curatedNote, wayfindNotes, betterAlternatives, similarPlaces, relatedPicks, placeKind, isBeach,
    // map screen (G4)
    mapMode, setMapMode, mapBrowse, setMapBrowse, mapPool, mapListOverride, compassOn, compassNeedleRef, toggleCompass, cat, setCat, setSub, setVibe, sortBy, deviceLoc, mapFocus, setMapFocus, setMapSearchOpen, mapDate, setMapDate, mapPreview, setMapPreview, mapDrawer, setMapDrawer, eventPreview, setEventPreview, view, featuredBoost, communityBoost, MapView, Hol,
    // experience badge screen (G4)
    activeBadge, setActiveBadge, EXPERIENCES, expPlaces, expMi, setExpMi, expSort, setExpSort, expTours, expLoading, momentPicks, setBrowseCat, ViatorRail, intentScopeLabel,
    // intro overlay (G4) — the 3.2s auto-show timer stays in PageInner, flips introOpen
    introOpen, setIntroOpen, introSel, setIntroSel,
  };

  return (
    <div style={shell}>
    <div style={{ ...wrap, maxWidth: isDesktop ? 1280 : 480 }}>
      <style>{`@keyframes wfpulse{0%,100%{transform:scale(.8);opacity:.45}50%{transform:scale(1.08);opacity:1}}@keyframes wfdot{0%,80%,100%{opacity:.25}40%{opacity:1}}@keyframes wfbob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.06)}}`}</style>
      {/* Header */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: screen === "map" ? "8px 12px" : "12px 14px", paddingTop: screen === "map" ? "max(8px, env(safe-area-inset-top))" : "max(12px, env(safe-area-inset-top))", flexShrink: 0, position: "relative", zIndex: 20 }}>
        {screen !== "map" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span onClick={openSuggested} style={{ position: "relative", display: "inline-block", cursor: "pointer" }}>
              <img src="/wordmark.png?v=3" alt="wayfind" style={{ height: 34, width: "auto", display: "block" }} />
              <span style={{ position: "absolute", left: LOGO_PIN.left, top: LOGO_PIN.top, pointerEvents: "none" }}><GlowPin size={LOGO_PIN.size} /></span>
            </span>
            {locName && <span style={{ fontSize: 13, fontWeight: 400, color: C.muted, marginLeft: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {locName}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {weather && (weather.feels != null || weather.temp != null) && (
              <button onClick={() => setWxOpen((v) => !v)} aria-label="Weather forecast" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: C.text, cursor: "pointer", padding: "2px 4px" }}>
                <span style={{ fontSize: 18 }}>{wxIconNow(weather)}</span>
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.05 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{weather.feels != null ? weather.feels : weather.temp}°</span>
                  {weather.label ? <span style={{ fontSize: 8.5, fontWeight: 600, color: C.muted }}>{weather.label}</span> : null}
                </span>
                <span style={{ fontSize: 9, color: C.muted, transform: wxOpen ? "rotate(180deg)" : "none", transition: "transform .25s ease", marginLeft: 1 }}>▼</span>
              </button>
            )}
            <button onClick={() => { setIntroSel([]); setIntroOpen(true); try { logEvent("intro_reopen", null, { src: "header" }); } catch (e) {} }} aria-label="Find my vibe" title="Find my vibe" style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 999, border: `1px solid ${C.border}`, background: C.card, color: C.accent, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", marginRight: 7 }}><Icon name="sparkles" size={17} color={C.accent} /></button>
            {supabase && (user ? (
              <button onClick={() => setAccountOpen(true)} aria-label="Account" title={user.email || "Signed in"} style={{ flexShrink: 0, width: 40, height: 40, borderRadius: "50%", border: `1px solid ${C.border}`, background: C.card, color: C.accent, fontSize: 14, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" }}>{(user.email || "?").slice(0, 1)}</button>
            ) : (
              <button onClick={() => setAuthOpen(true)} aria-label="Sign in" title="Sign in" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.card, color: C.light, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.2" /><path d="M5.5 19.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" /></svg>Sign in</button>
            ))}
          </div>
        </div>
        )}
        {wxOpen && weather && Array.isArray(weather.hourly) && weather.hourly.length > 0 && (
          <div style={{ marginTop: -6, marginBottom: 12, background: `linear-gradient(160deg, ${C.adim} 0%, ${C.panel} 62%)`, border: "none", borderRadius: "0 0 18px 18px", padding: "12px 8px 14px", boxShadow: "0 12px 26px rgba(0,0,0,.4)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px 10px" }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.accent, letterSpacing: "0.5px", textTransform: "uppercase" }}>Next 18 hours</span>
              <span style={{ fontSize: 11, color: C.muted }}>Feels-like · every 3h</span>
            </div>
            <div style={{ display: "flex", gap: 4, overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", padding: "0 6px" }}>
              {weather.hourly.map((h, idx) => {
                // v5.01: the "Now" tile must reflect the sky RIGHT NOW — the
                // hourly block's is_day flag describes when the block STARTED
                // (a sun was showing at 9:45pm because the block began at 8pm).
                const hi = idx === 0 ? { icon: wxIconNow({ ...weather, icon: weatherFromCode(h.code).icon, img: weatherFromCode(h.code).img }), label: weatherFromCode(h.code).label } : hourIcon(h.code, h.day, h.ms);
                const dt = new Date(h.ms);
                const tl = idx === 0 ? "Now" : dt.toLocaleTimeString([], { hour: "numeric" }).replace(" ", "");
                return (
                  <div key={h.ms} style={{ scrollSnapAlign: "center", flexShrink: 0, width: 64, textAlign: "center", padding: "8px 4px", borderRadius: 12, background: idx === 0 ? C.adim : "transparent", border: `1px solid ${idx === 0 ? C.accent : "transparent"}` }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: idx === 0 ? C.accent : C.muted, marginBottom: 5 }}>{tl}</div>
                    <div style={{ fontSize: 23, lineHeight: 1, marginBottom: 5 }}>{hi.icon}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{h.feels}°</div>
                    <div style={{ fontSize: 8.5, fontWeight: 600, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{weatherFromCode(h.code).label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {/* map search moved onto the map as a floating control (see map overlay) */}
        {(screen !== "map" || mapSearchOpen) && (
        <div style={{ display: "flex", gap: 0, position: "relative" }}>
          <div style={{ flex: 1, position: "relative" }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", fontSize: 15, pointerEvents: "none", opacity: 0.85 }}>🔍</span>
            {/* v5.63 (audit P4): a real combobox — the input owns the listbox
                (aria-controls), announces its expanded state and the active
                option (aria-activedescendant), and supports full keyboard
                navigation (Down/Up move the highlight, Enter selects it,
                Escape closes without selecting). */}
            <input
              value={query}
              onChange={(e) => { onQueryChange(e.target.value); setSugIdx(-1); }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" && suggestions.length) { e.preventDefault(); setSugIdx((i) => (i + 1) % suggestions.length); }
                else if (e.key === "ArrowUp" && suggestions.length) { e.preventDefault(); setSugIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
                else if (e.key === "Escape") { if (suggestions.length) { e.preventDefault(); setSuggestions([]); setSugIdx(-1); } }
                else if (e.key === "Enter") { if (suggestions.length > 0) pickSuggestion(suggestions[sugIdx >= 0 ? sugIdx : 0]); else submitSearch(); }
              }}
              onBlur={() => { setTimeout(() => { setSuggestions([]); setSugIdx(-1); }, 150); if (screen === "map") setTimeout(() => setMapSearchOpen(false), 220); }}
              role="combobox" aria-expanded={suggestions.length > 0} aria-controls="wf-suggestions" aria-autocomplete="list"
              aria-activedescendant={sugIdx >= 0 ? `wf-sug-${sugIdx}` : undefined}
              aria-label="Search a place or city" placeholder="Search a place or city"
              style={{ width: "100%", boxSizing: "border-box", height: 48, padding: "0 14px 0 38px", background: C.card, border: `1.5px solid ${C.border}`, borderRight: "none", borderRadius: "14px 0 0 14px", color: C.text, fontSize: 15, outline: "none" }}
            />
            {suggestions.length > 0 && (
              <ul id="wf-suggestions" role="listbox" aria-label="Search suggestions" style={{ listStyle: "none", margin: 0, padding: 0, position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.5)", zIndex: 50 }}>
                {suggestions.map((s, i) => (
                  <li
                    key={i}
                    id={`wf-sug-${i}`}
                    role="option"
                    aria-selected={i === sugIdx}
                    onMouseEnter={() => setSugIdx(i)}
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                    style={{ padding: "11px 14px", fontSize: 14, color: C.text, background: i === sugIdx ? C.adim : "transparent", borderBottom: i < suggestions.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ color: s.kind === "place" ? C.accent : C.muted, fontSize: 16 }}>{s.kind === "place" ? iconForPlace({ name: s.text, types: s.types || [] }) : "📍"}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</div>
                      {s.kind === "place" && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Go to this place</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {/* Live region: announce the highlighted suggestion to screen readers. */}
            <div aria-live="polite" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{sugIdx >= 0 && suggestions[sugIdx] ? `${suggestions[sugIdx].text}, ${sugIdx + 1} of ${suggestions.length}` : ""}</div>
          </div>
          <button onClick={submitSearch} aria-label="Search" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 54, height: 48, background: C.accent, border: "none", borderRadius: "0 14px 14px 0", color: "#0D1117", fontSize: 22, fontWeight: 800, cursor: "pointer" }}>→</button>
        </div>
        )}
        {screen === "suggested" && FEATURED_AREAS.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, flexShrink: 0 }}>Explore other areas:</span>
          {FEATURED_AREAS.map((a) => (
            <button key={a.name} onClick={() => jumpToArea(a)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 999, border: `1px solid ${C.border}`, background: C.card, color: C.light, fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
              <span>📍</span>{a.short}
            </button>
          ))}
        </div>
        )}
      </div>

      {/* v5.08 GLOBAL RULE (user direction): the old chip-bubble category
          strip is gone FOREVER, everywhere. Every category surface uses the
          one modern menu — CategoryMenu (icon-on-top tiles, iOS style), with
          the sub-row sliding down only after a primary category is chosen.
          Surprise Me rides as a trailing tile. Coupons is its own tab and
          carries no category menu at all. */}
      {screen === "explore" && (
        <div style={{ padding: "2px 12px 0", background: C.panel, flexShrink: 0 }}>
          <CategoryMenu activeCat={cat} sub={sub} onCat={(id) => { pickCat(id); }} onSub={(v) => pickSub(v)} trailing={
            <button onClick={openSurprise} aria-label="Surprise Me" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "9px 3px 7px", borderRadius: 0, background: "transparent", border: "none", cursor: "pointer", flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 24, lineHeight: "26px" }}>🎁</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.purple, textAlign: "center", lineHeight: 1.15 }}>Surprise</span>
            </button>
          } />
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: screen === "map" ? "hidden" : "auto", padding: screen === "map" ? 0 : "12px 12px calc(48px + env(safe-area-inset-bottom))" }}>
        <>
            {screen === "explore" && <div style={{ maxWidth: isDesktop ? 760 : undefined, margin: isDesktop ? "0 auto" : undefined }}>{exploreList}</div>}
            {screen === "map" && <MapScreen ctx={ctx} />}
          </>

        {screen === "suggested" && (() => {
          const list = suggested || [];
          const affinities = computeAffinities(signals);
          const activeSignals = signals.filter((s) => s.action === "like" || s.action === "dislike");
          const hasAffinity = activeSignals.length >= 2;
          const displayList = dedupePlaces(hasAffinity ? applyAffinity(list, affinities) : list, true);
          const likeCount = Object.keys(liked).length;
          const h = new Date().getHours();
          const part = h < 11 ? "this morning" : h < 15 ? "for lunch" : h < 17 ? "this afternoon" : h < 22 ? "tonight" : "right now";
          const moment = h < 11 ? "Breakfast" : h < 15 ? "Lunch" : h < 17 ? "Afternoon" : h < 22 ? "Dinner" : "Late-night";
          const intentDef = intent ? INTENTS.find((x) => x.id === intent) : null;
          const reasons = [];
          reasons.push("the time of day");
          if (weather) reasons.push("today's weather");
          if (Object.values(lists).some((l) => (l.places || []).length)) reasons.push("places you have saved");
          // ── HERO PICK ──────────────────────────────────────────────────────
          // One standout to greet you. The feed is already tuned to time of day
          // and today's weather upstream, so the hero draws from that tuned list
          // and respects the active intent chip. Which angle greets you
          // alternates by time bucket — the top-ranked pick in some buckets, a
          // strong but less-obvious gem in others — so morning and afternoon
          // never open on the same card. It is deterministic within a bucket, so
          // it does not reshuffle on you; tapping "another angle" cycles between
          // the two without refetching anything.
          const heroBucket = h < 11 ? 0 : h < 15 ? 1 : h < 17 ? 2 : h < 22 ? 3 : 4;
          // Trust fix (v4.2): the hero must be somewhere you can actually go right now.
          // Prefer places confirmed open; if none are confirmed open, fall back to
          // unknown-status places; only if neither exists do we surface a closed place,
          // and the badge below drops the "start here" promise in that case.
          const heroOpenNow = displayList.filter((p) => p && p.openNow === true);
          const heroUnknown = displayList.filter((p) => p && p.openNow == null);
          const heroBase = heroOpenNow.length ? heroOpenNow : (heroUnknown.length ? heroUnknown : displayList.filter(Boolean));
          const heroTop = heroBase.length ? heroBase[0] : null;
          // A true hidden gem is high quality but LOW review volume. A place with
          // thousands of reviews is not a gem, so bound by review count before labeling.
          const heroGemTrue = heroBase.length >= 3
            ? heroBase.slice(2, 8).filter((p) => p && (p.rating || 0) >= 4.5 && (p.reviews || 0) > 0 && (p.reviews || 0) < 800).reduce((b, p) => (!b || (p.rating || 0) > (b.rating || 0) ? p : b), null)
            : null;
          // Fallback alternative for the rotation when there is no true gem: next strongest pick (not labeled a gem).
          const heroGem = heroGemTrue || (heroBase.length >= 3 ? heroBase[2] : null);
          let heroOrder = (heroBucket % 2 === 0) ? [heroTop, heroGem] : [heroGem, heroTop];
          heroOrder = heroOrder.filter((p, i, a) => p && a.findIndex((x) => x && x.id === p.id) === i);
          const heroPick = heroOrder.length ? heroOrder[heroNonce % heroOrder.length] : null;
          const heroSl = heroPick ? scoreLabel(heroPick.wfScore) : null;
          const heroHook = heroPick ? hookCards.find((hk) => hk && hk.placeId === heroPick.id) : null;
          const sectionHooks = hookCards.filter((hk) => hk && hk.id !== "top5" && (!heroHook || hk.id !== heroHook.id)).slice(0, 5);
          const sectionHookIds = new Set(sectionHooks.map((hk) => hk.id));
          // Wayfind Picks hero hook — the single entry into the curated top 10 sheet.
          // Built from the live feed so it works whether or not AI hooks are present.
          const picksHook = (() => {
            const bs = [...displayList].filter(Boolean).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
            if (bs.length < 5) return null;
            const cityN = locName ? locName.split(",")[0] : "you";
            return {
              id: "top5", accent: C.accent, emoji: "🧭", label: "Wayfind Picks",
              theme: "best", placeId: bs[0].id, highlightWord: "top 10",
              hook: `The top 10 near ${cityN} right now`,
              subtitle: "Ten spots worth your time, ranked",
              cta: "See the top 10 →",
              themeTitle: `Wayfind Picks · Top 10 in ${cityN}`,
              themeBody: `The ten highest-scoring spots near you, ranked by the Wayfind Score, which weights each rating by how many people stand behind it. No ads, no paid placement, just what consistently earns it. Anything past 10 miles is flagged so you can weigh the drive.`,
            };
          })();
          const heroReason = heroPick ? ((heroHook && heroHook.hook) ? heroHook.hook : (blurbs[heroPick.id] || "")) : "";
          const heroIsGem = !!(heroPick && heroGemTrue && heroPick.id === heroGemTrue.id && (!heroTop || heroGemTrue.id !== heroTop.id));
          // Honest hero badge: only say "start here" when the place is genuinely open now.
          // If it opens later today, set that expectation instead of implying it is ready.
          // If status is unknown or it is closed, fall back to a neutral "top pick" label.
          const heroOpenConfirmed = !!(heroPick && heroPick.openNow === true);
          const heroOpensLater = !!(heroPick && heroPick.openNow === false && heroPick.nextOpen && heroPick.nextOpen.today);
          let heroBadgeIcon = heroIsGem ? "💎" : "📍";
          let heroBadgeText = heroIsGem ? "Hidden gem nearby" : "Top pick nearby";
          if (heroOpenConfirmed) { heroBadgeIcon = heroIsGem ? "💎" : "✨"; heroBadgeText = heroIsGem ? "Hidden gem · open now" : "Open now"; }
          else if (heroOpensLater) { heroBadgeIcon = "⏳"; heroBadgeText = "Worth the wait · " + heroPick.nextOpen.label; }
          // v4.6: tighter, more confident reason line. Drops the rating parenthetical and the
          // distance (both already shown above) and sharpens the weather and time fragments.
          const whyPick = h < 11 ? "morning" : h < 15 ? "lunch" : h < 17 ? "afternoon" : h < 22 ? "evening" : "late-night";
          const heroWhy = [];
          if (heroPick) {
            if (heroOpenConfirmed) heroWhy.push("open now");
            if (heroPick.rating != null && heroPick.rating >= 4.5) heroWhy.push("loved locally");
            else if (heroSl && heroSl.word) heroWhy.push(heroSl.word.toLowerCase() + " rated");
            if (weather && weather.temp != null && weather.temp >= 58 && weather.temp <= 92 && !(weather.label && /rain|storm|snow|sleet/i.test(weather.label))) heroWhy.push("great weather match");
            heroWhy.push("strong " + whyPick + " pick");
          }
          const feedList0 = heroPick ? displayList.filter((p) => p && p.id !== heroPick.id) : displayList;
          // v4.24 near-first rule: with 5+ options inside 12 miles, nothing past
          // 20 miles may outrank them. Sparse areas (fewer than 5 close) exempt.
          const _nearCount = feedList0.filter((p) => p && p.distMi != null && p.distMi <= 12).length;
          const feedList0P = _nearCount >= 5 ? feedList0.slice().sort((a, b) => (((a.distMi != null && a.distMi > 20) ? 1 : 0) - ((b.distMi != null && b.distMi > 20) ? 1 : 0))) : feedList0;
          const feedListS = sortBy === "rated" ? feedList0P.slice().sort((a, b) => (((b.wfScore || 0) - ((b.distMi || 0) <= 4 ? 0 : Math.min(30, ((b.distMi || 0) - 4) * 1.3)) + (b.openNow === false ? -8 : 0)) - ((a.wfScore || 0) - ((a.distMi || 0) <= 4 ? 0 : Math.min(30, ((a.distMi || 0) - 4) * 1.3)) + (a.openNow === false ? -8 : 0))) || ((b.reviews || 0) - (a.reviews || 0))) : sortBy === "price" ? feedList0P.slice().sort((a, b) => (((a.price_level ?? a.priceLevel ?? 9)) - ((b.price_level ?? b.priceLevel ?? 9))) || ((b.rating || 0) - (a.rating || 0))) : feedList0P;
          const feedListN = sortBy === "near" ? feedListS.filter((p) => p && (sliderMi >= 60 || p.distMi == null || p.distMi <= sliderMi)) : feedListS;
          const feedList = dealsOnly ? feedListN.filter((p) => offers[p.id]) : feedListN;
          // Trust fix (v4.3): closed places no longer hold the top slots. Sort by the
          // chosen order first (score for Best, distance for Closest), then stably push
          // open-now to the top, unknown-status next, opens-later below that, and closed
          // last. Closed spots still appear, just never in the most valuable positions.
          const homeOpenRank = (p) => !p ? 4 : p.openNow === true ? 0 : p.openNow == null ? 1 : (p.nextOpen && p.nextOpen.today) ? 2 : 3;
          const homeBaseSorted = sortBy === "near" ? [...feedList].sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12)) : [...feedList];
          const homeFeed = homeBaseSorted.sort((a, b) => homeOpenRank(a) - homeOpenRank(b));
          return (
            <div style={isDesktop ? { display: "flex", gap: 32, alignItems: "flex-start", width: "100%", maxWidth: 1240, margin: "0 auto" } : {}}>
              {/* LEFT column on desktop: intent chips + hooks + feed */}
              <div style={{ flex: 1, minWidth: 0, maxWidth: isDesktop ? 780 : undefined }}>
              {/* v3.21: shared CategoryMenu; home, map, and itinerary render the same system. */}
              <CategoryMenu activeCat={browseCat} sub={sub} onCat={(id, label) => { try { logEvent("intent_chip", null, { intent: label, layer: 1, src: "home" }); } catch (e) {} pickBrowse(id); }} onSub={(v) => setSub(v)} />
              {a2hs && (
                <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "10px 12px" }}>
                  <img src="/icon-192.png" alt="" width={34} height={34} style={{ borderRadius: 8 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>Put Wayfind on your home screen</div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{deferredPrompt ? "One tap. Opens like an app." : "Tap Share, then Add to Home Screen."}</div>
                  </div>
                  {deferredPrompt && <button onClick={() => { try { deferredPrompt.prompt(); logEvent("a2hs_install"); } catch (e) {} setA2hs(false); }} style={{ flexShrink: 0, padding: "8px 14px", background: C.accent, border: "none", borderRadius: 10, color: "#0D1117", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>Install</button>}
                  <button onClick={() => { setA2hs(false); try { localStorage.setItem("wf_a2hs_dismissed", "1"); logEvent("a2hs_dismiss"); } catch (e) {} }} aria-label="Dismiss" style={{ flexShrink: 0, width: 30, height: 30, background: "transparent", border: "none", color: C.muted, fontSize: 16, cursor: "pointer" }}>✕</button>
                </div>
              )}
              {/* v6.22: when a category is being browsed from the mood menu, the feed under the weather becomes that category's ranked places. No navigation, the same PlaceCard used everywhere else. */}
              {browseCat && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <div onClick={() => { setBrowseCat(null); setMoodPick(null); setSub("all"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, color: C.accent, fontWeight: 800, fontSize: 14, cursor: "pointer", padding: "8px 15px" }}>‹ Back</div>
                    <SortControl sortBy={sortBy} onSort={(k) => setSortBy(k)} mi={sliderMi} onMi={(m) => { autoRadiusRef.current = false; setSliderMi(m); const mm = Math.round(m * 1609.34); if (mm > (searchRadius || 0)) setSearchRadius(mm); }} where={locName ? locName.split(",")[0] : "you"} dealsAvailable={Object.keys(offers).length > 0} dealsOnly={dealsOnly} onDeals={setDealsOnly} />
                  </div>
                  {(() => { const _cm = Culture.resolveMetro(locName); return _cm ? <AreaInsight metro={_cm} cat={browseCat} town={locName ? locName.split(",")[0] : null} center={center} onFind={(q) => submitSearch(q, { miles: 45 })} /> : null; })()}
                  {browseCat === "attractions" && <ViatorRail title="Bookable tours & activities" items={browseTours} theme="attractions-browse" />}
                  {loading ? <Loader label="Finding the best spots" pad="14px 2px" /> : view.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "40px 24px", color: C.muted }}>
                      <div style={{ display: "inline-flex", animation: "wfbob 1.4s ease-in-out infinite", marginBottom: 10 }}><Critter size={46} /></div>
                      <strong style={{ display: "block", color: C.light }}>Nothing here right now</strong>
                      <span style={{ fontSize: 13 }}>Try another category or widen your area.</span>
                    </div>
                  ) : view.map((p, i) => (
                    <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} />
                  ))}
                </div>
              )}
              {/* v6.21: the single hero is now the experience hero below (random themed curated list, the shareable anchor). The old place hero was removed to keep one hero. */}
              {/* Wayfind Picks now renders as the first hook card inside the "Worth a look" section below, matching the editorial cards. */}
              {/* "Worth a look near you": Wayfind Picks first, editorial hooks in the middle, Roll the Dice last. Same hook-card shape, different accent colors, so they blend. */}
              {!browseCat && (suggested && suggested.length > 0) && (() => {
                const shareHook = (hk, pl) => { if (!pl) return; shareLink(pl.name, placeShareUrl(pl, locName, blurbs[pl.id]), () => showToast("Link copied"), "Check out " + pl.name + " on Wayfind", () => { try { logEvent("share", pl, { kind: "hook" }); } catch (e) {} giveawayMark(pl.id); addShared(pl); }); };
                // v5.11: the dice card rotates the TAKE A CHANCE bank; the
                // classic line "I want to take a chance." stays as variant zero
                // and the fallback (PROTECTED copy, check-ux).
                const _bkChance = pickHook("chance", null);
                if (_bkChance) heroImpression("chance", _bkChance.variant, _bkChance.text);
                const diceHook = { id: "dice-roll", accent: C.purple, emoji: "🎲", label: "Take a chance", hook: _bkChance ? _bkChance.text : "I want to take a chance.", _hookVar: _bkChance ? _bkChance.variant : null, highlightWord: _bkChance ? "" : "chance", subtitle: "Roll it — Wayfind lands you somewhere great nearby", cta: "🎲 Roll the dice →" };
                // One experience hero anchors the feed. The curated list it opens is the shareable anchor.
                const THEME_ORDER = ["gem", "family", "bestof", "entertainment", "stays", "shows", "budget"];
                const THEME_COLOR = { gem: C.teal, family: C.green, bestof: C.gold, entertainment: C.purple, stays: C.blue, shows: C.pink, budget: C.gold };
                const expPool = [];
                const seenPool = new Set();
                for (const p of [...(displayList || []), ...(suggested || []), ...(places || [])]) { if (p && p.id && !seenPool.has(p.id)) { seenPool.add(p.id); expPool.push(p); } }
                const poolKeys = new Map();
                expPool.forEach((p) => { try { poolKeys.set(p.id, new Set(experienceBadges(p, null, 99).map((b) => b.key))); } catch (er) { poolKeys.set(p.id, new Set()); } });
                const matchesExp = (p, key) => { const e = EXPERIENCES[key]; if (!e) return false; if (e.filter) { try { return !!e.filter(p); } catch (er) { return false; } } const ks = poolKeys.get(p.id); return ks ? ks.has(key) : false; };
                const avail = [];
                const usedHeroIds = new Set();
                for (const key of THEME_ORDER) { const e = EXPERIENCES[key]; if (!e) continue; const match = expPool.filter((p) => p && p.photo && matchesExp(p, key) && !usedHeroIds.has(p.id)).sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0))[0]; if (match) { avail.push({ key, place: match, e }); usedHeroIds.add(match.id); } }
                // v4.46: the revenue themes always render as hero cards. When the local
                // pool has no matching place (it is food-heavy), a place-less hero card
                // still shows — HookSolo falls back to the accent gradient — and tapping
                // it opens the wide-radius experience search (Orlando attractions,
                // hotels, shows). These are the surfaces that carry affiliate links.
                const GUARANTEED = ["family", "entertainment", "stays", "shows", "budget"];
                for (const key of GUARANTEED) { if (!avail.some((a) => a.key === key) && EXPERIENCES[key]) avail.push({ key, place: null, e: EXPERIENCES[key] }); }
                { const _ord = new Map(THEME_ORDER.map((k, i) => [k, i])); avail.sort((a, b) => (_ord.get(a.key) ?? 99) - (_ord.get(b.key) ?? 99)); }
                // v6.25: the hero is now the single best move for right now, ranked by
                // quality + distance + today's weather + the time of day (see lib/ranking.js),
                // so a stormy afternoon stops opening on an outdoor pick. The themed
                // experiences (gems, value, waterfront...) all move into the stack below.
                const condCtx = { weather, hour: h, isWeekend: [0, 6].includes(new Date().getDay()) };
                const heroPhotoPool = expPool.filter((p) => p && p.photo);
                const heroCandidates = heroPhotoPool.filter((p) => p.openNow !== false);
                const condRanked = Ranking.rankByConditions(heroCandidates.length ? heroCandidates : heroPhotoPool, condCtx);
                const heroPlace = condRanked[0] || null;
                const cityHero = locName ? locName.split(",")[0] : "you";
                const heroHook = heroPlace ? {
                  id: "top10now", accent: C.accent, emoji: "🧭", label: "Your Next Move",
                  theme: "best", placeId: heroPlace.id, highlightWord: "top 10", _ctx: condCtx,
                  hook: Ranking.heroReason(heroPlace, condCtx),
                  subtitle: "The best move near " + cityHero + " right now, ranked",
                  cta: "See the top 10 →",
                  metaLine: Tags.requiresParkAdmission(heroPlace.types) ? "May require park admission" : null,
                  themeTitle: "Wayfind Picks · Top 10 near " + cityHero,
                  themeBody: "The ten best spots near you for right now, ranked by quality, distance, today's weather, and the time of day. Rain pushes indoor picks up, clear skies favor the outdoors, and anything closed drops down. No ads, no paid placement.",
                } : null;
                const restExp = avail.filter((a) => !heroPlace || !a.place || a.place.id !== heroPlace.id);
                const themeEng = {};
                try { hookLikes.forEach((id) => { if (typeof id === "string" && id.indexOf("exp-") === 0) { const t = id.slice(4); themeEng[t] = (themeEng[t] || 0) + 1; } }); } catch (e) {}
                restExp.sort((a, b) => ((themeEng[b.key] || 0) - (themeEng[a.key] || 0)) || (THEME_ORDER.indexOf(a.key) - THEME_ORDER.indexOf(b.key)));
                const mkHook = (a) => {
                  if (!a.place) {
                    const m = revenueExpMeta(a.key, cityHero) || { hook: a.e.lead || a.e.title, hl: "", sub: a.e.lead || "", cta: "Explore \u2192" };
                    // v5.09 persuasion engine: rotate the hook bank (random,
                    // never the same line twice in a row) with live tokens;
                    // fall back to the static meta hook when no bank exists.
                    // Live context for data-gated lines: a "4.9★" claim needs a
                    // real 4.9★ place in the pool; "[mins] minutes away" uses the
                    // actual nearest top-rated spot (~2 min/mile local driving).
                    const _hh = new Date().getHours();
                    const _nearTop = expPool.filter((p) => p && p.rating >= 4.5 && (p.reviews || 0) >= 100 && p.distMi != null).sort((x, y) => x.distMi - y.distMi)[0];
                    const bk = pickHook(a.key, {
                      temp: weather && weather.temp,
                      time: _hh < 12 ? "morning" : _hh < 17 ? "afternoon" : _hh < 21 ? "golden hour" : "late",
                      night: _hh >= 16 || _hh < 4, day: _hh >= 8 && _hh < 16,
                      top49: expPool.some((p) => p && p.rating >= 4.9 && (p.reviews || 0) >= 15),
                      mins: _nearTop && _nearTop.distMi <= 15 ? Math.max(4, Math.round(_nearTop.distMi * 2)) : null,
                    });
                    if (bk) heroImpression(a.key, bk.variant, bk.text);
                    return { id: "exp-" + a.key, accent: THEME_COLOR[a.key] || m.accent || C.accent, emoji: a.e.icon, label: cityFix(a.e.label), theme: a.key, fetchKey: a.key, highlightWord: bk ? "" : m.hl, hook: bk ? bk.text : m.hook, _hookVar: bk ? bk.variant : null, subtitle: m.sub, cta: m.cta, metaLine: null, themeTitle: cityFix(a.e.title), themeBody: a.e.lead, places: null };
                  }
                  const t = themedHook(a.key, a.place);
                  const members = placesForHook({ theme: a.key, placeId: a.place.id }, expPool);
                  const cnt = members.length;
                  const avg = Dining.avgCostForTwo(members);
                  const meta = [cnt > 1 ? cnt + " spots" : null, avg ? avg.text : null].filter(Boolean).join("  ·  ");
                  return { id: "exp-" + a.key, accent: THEME_COLOR[a.key] || C.accent, emoji: a.e.icon, label: cityFix(a.e.label), theme: a.key, placeId: a.place.id, highlightWord: t.hl, hook: cityFix(t.hook), subtitle: cityFix(t.sub), cta: cnt > 1 ? ("See all " + cnt + " →") : cityFix(t.cta), metaLine: meta || null, themeTitle: cityFix(a.e.title), themeBody: a.e.lead };
                };
                const dicePhotos = expPool.filter((p) => p && p.photo).slice(0, 4).map((p) => p.photo);
                // v4.67: revenue hero cards show real nearby photos, not flat
                // gradients. Each theme pulls its own kind of place; thin
                // matches fall back to the best-rated photos around.
                const EXP_COLLAGE_RX = { family: /amusement|aquarium|zoo|bowling|mini_golf|water_park|playground|park/, entertainment: /amusement|tourist|museum|bowling|theater|theatre|aquarium|zoo|attraction/, shows: /performing|theater|theatre|concert|stadium|night_club|movie/, budget: /park|beach|museum|tourist|amusement|trail/, bestof: null, gem: null };
                const expCollage = (key) => {
                  try {
                    const rx = EXP_COLLAGE_RX[key];
                    const byScore = (a, b) => (b.wfScore || 0) - (a.wfScore || 0);
                    let pool2 = expPool.filter((p) => p && p.photo);
                    if (key === "stays") pool2 = pool2.filter((p) => isTrueLodging(p));
                    else if (rx) pool2 = pool2.filter((p) => rx.test(((p.types || []).join(" ") + " " + (p.name || "")).toLowerCase()));
                    let out2 = pool2.sort(byScore).slice(0, 4).map((p) => p.photo);
                    if (out2.length < 2) return []; // no themed photos nearby: gradient beats a lie
                    return out2;
                  } catch (e) { return []; }
                };
                return (
                  <div style={{ marginBottom: 16 }}>
                    {locApprox && !locBannerGone && (
                      <div role="status" style={{ position: "fixed", left: 12, right: 12, bottom: "calc(64px + env(safe-area-inset-bottom))", zIndex: 60, display: "flex", alignItems: "center", gap: 9, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 12px", boxShadow: "0 8px 30px rgba(0,0,0,.45)" }}>
                        <span style={{ fontSize: 15 }}>📍</span>
                        <div style={{ flex: 1, fontSize: 12, color: C.light, lineHeight: 1.4 }}>Location is approximate{locName ? " — showing " + locName.split(",")[0] : ""}. <span onClick={() => { try { const el = document.querySelector('input[placeholder="Search a place or city"]'); if (el) { el.focus(); el.scrollIntoView({ block: "center" }); } } catch (e) {} }} style={{ color: C.accent, fontWeight: 800, cursor: "pointer" }}>Search your city</span></div>
                        <button onClick={() => setLocBannerGone(true)} aria-label="Dismiss" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", padding: 2 }}>✕</button>
                      </div>
                    )}
                    {heroPlace && (<>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, margin: "2px 2px 8px" }}>Best move right now</div>
                                            {gwPop && (giveawayLive() || giveawaySoon()) && (
                        <div onClick={() => gwPopClose("x")} style={{ position: "fixed", inset: 0, zIndex: 88, background: "rgba(0,0,0,.62)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
                          <div ref={gwPopDlgRef} role="dialog" aria-modal="true" aria-label="Wayfind giveaway" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ outline: "none", width: "100%", maxWidth: 400, borderRadius: 20, padding: "18px 17px 16px", background: "linear-gradient(135deg, #1B1405 0%, #2A1F08 60%, #1B1405 100%)", border: "1px solid rgba(232,184,75,.55)", boxShadow: "0 24px 60px rgba(0,0,0,.6)", position: "relative", overflow: "hidden" }}>
                            <style>{"@keyframes wfGold{0%,100%{opacity:.5}50%{opacity:1}}"}</style>
                            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "#E8B84B", animation: "wfGold 2.8s ease-in-out infinite" }} />
                            <button onClick={() => gwPopClose("x")} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: "50%", background: "rgba(0,0,0,.4)", border: "1px solid rgba(232,184,75,.4)", color: "#F2D48A", fontSize: 15, fontWeight: 700, cursor: "pointer", lineHeight: 1 }}>×</button>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, paddingRight: 34 }}>
                              <span style={{ fontSize: 22, filter: "drop-shadow(0 0 8px rgba(232,184,75,.6))" }}>🏆</span>
                              <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: "#F2D48A", textTransform: "uppercase" }}>Wayfind giveaway · Annual</span>
                            </div>
                            <div style={{ fontSize: 21, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.15, letterSpacing: "-0.3px" }}>Win a 3-night stay at Hilton Orlando</div>
                            <div style={{ fontSize: 12.5, color: "#E8D5A4", marginTop: 6, lineHeight: 1.5 }}>Share any 3 places or lists from Wayfind. One winner, drawn Nov 1. That is the whole entry.</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
                              {!giveawayLive() ? (
                                <span style={{ display: "inline-flex", alignItems: "center", padding: "8px 14px", borderRadius: 999, background: "rgba(232,184,75,.14)", border: "1px solid rgba(232,184,75,.55)", color: "#F2D48A", fontSize: 12.5, fontWeight: 800 }}>Opens July 4</span>
                              ) : user ? (
                                <span style={{ display: "inline-flex", alignItems: "center", padding: "8px 14px", borderRadius: 999, background: gwCount >= 3 ? "#E8B84B" : "rgba(232,184,75,.14)", border: "1px solid rgba(232,184,75,.55)", color: gwCount >= 3 ? "#1B1405" : "#F2D48A", fontSize: 12.5, fontWeight: 800 }}>{gwCount >= 3 ? "You're entered ✓" : Math.min(gwCount, 3) + " of 3 shared"}</span>
                              ) : (
                                <button onClick={() => { gwPopClose("cta"); setAuthOpen(true); }} style={{ padding: "8px 14px", borderRadius: 999, background: "#E8B84B", border: "none", color: "#1B1405", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>{gwCount > 0 ? "Sign in to lock your entry" : "Sign in to enter"}</button>
                              )}
                              <button onClick={() => { gwPopClose("browse"); pickBrowse("food"); try { logEvent("giveaway_pop_browse"); } catch (e) {} }} style={{ padding: "8px 14px", borderRadius: 999, background: "transparent", border: "1px solid rgba(232,184,75,.45)", color: "#F2D48A", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Find a place to share ›</button>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
                              <button onClick={() => setGwOpen(true)} style={{ padding: 0, background: "transparent", border: "none", color: "#B99B4E", fontSize: 11.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}>How it works</button>
                              <button onClick={() => gwPopClose("later")} style={{ padding: 0, background: "transparent", border: "none", color: "#B99B4E", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Keep exploring</button>
                            </div>
                          </div>
                        </div>
                      )}
                      {gwOpen && (
                        <div onClick={() => setGwOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "flex-end" }}>
                          <div ref={gwRulesDlgRef} role="dialog" aria-modal="true" aria-label="Giveaway official rules" tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ outline: "none", background: C.panel, borderRadius: "18px 18px 0 0", width: "100%", maxHeight: "82vh", overflowY: "auto", padding: "18px 18px calc(20px + env(safe-area-inset-bottom))" }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 10 }}>Wayfind Annual Giveaway · Official Rules (2026)</div>
                            {["No purchase necessary. Free to enter.", "How to enter: create a free Wayfind account, then share any 3 different places or lists from the app between July 3 and October 31, 2026 (11:59 pm ET). Entries are counted on our server per account.", "Winner: one entrant selected at random on or about November 1, 2026, and notified via account email. Odds depend on the number of eligible entries.", "Prize: a 3-night stay at Hilton Orlando, provided by the sponsor. Approximate retail value $600 to $900. Dates subject to availability; no cash substitute. Taxes are the winner's responsibility.", "Eligibility: legal US residents 18 or older. Void where prohibited.", "Sponsor: Wayfind. This promotion is not sponsored, endorsed, or administered by Hilton or by Apple.", "Share progress shown on this device may differ from the server count if you share from multiple devices; the server count decides."].map((t, i) => (
                              <div key={i} style={{ fontSize: 12.5, color: C.light, lineHeight: 1.6, marginBottom: 9 }}>{t}</div>
                            ))}
                            <button onClick={() => setGwOpen(false)} style={{ marginTop: 6, padding: "10px 18px", borderRadius: 12, background: C.accent, border: "none", color: "#0D1117", fontSize: 13.5, fontWeight: 800, cursor: "pointer" }}>Got it</button>
                          </div>
                        </div>
                      )}
                      {renderWorldCupCard(true)}
                      {(() => { const _h = Hol.activeHoliday(new Date()); if (!_h) return null; const _c = Hol.themeFor(_h.key); const _ct = Hol.contentFor(_h.key, _h.name); return (
                        <div onClick={() => openHoliday(_h)} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ cursor: "pointer", borderRadius: 18, padding: "18px 16px 16px", marginBottom: 12, background: _c.grad, border: `1px solid ${_c.border}`, boxShadow: "0 10px 28px rgba(0,0,0,.42)", position: "relative", overflow: "hidden" }}>
                          <style>{"@keyframes wfBurst{0%{transform:scale(.15);opacity:.95}70%{opacity:.4}100%{transform:scale(1);opacity:0}}@keyframes wfGlow{0%,100%{opacity:.55}50%{opacity:1}}@keyframes wfTwinkle{0%,100%{opacity:.15;transform:scale(.7)}50%{opacity:1;transform:scale(1.2)}}@keyframes wfSweep{0%{transform:translateX(-140%) skewX(-18deg)}100%{transform:translateX(240%) skewX(-18deg)}}"}</style>
                          <span style={{ position: "absolute", top: -18, right: 26, width: 120, height: 120, borderRadius: "50%", border: "2px solid #FFD166", opacity: 0, animation: "wfBurst 2.4s ease-out infinite", pointerEvents: "none" }} />
                          <span style={{ position: "absolute", top: 14, right: 96, width: 76, height: 76, borderRadius: "50%", border: "2px solid #FF6B6B", opacity: 0, animation: "wfBurst 2.4s ease-out .8s infinite", pointerEvents: "none" }} />
                          <span style={{ position: "absolute", top: -6, right: 150, width: 54, height: 54, borderRadius: "50%", border: "1.5px solid #7EA6FF", opacity: 0, animation: "wfBurst 2.4s ease-out 1.5s infinite", pointerEvents: "none" }} />
                          {[[18, 52, 4, "#FFD166", "2s", "0s"], [8, 122, 3, "#FFFFFF", "2.6s", ".5s"], [34, 88, 3, "#FF9EA0", "2.2s", "1s"], [5, 188, 4, "#FFD166", "2.4s", "1.4s"], [27, 152, 3, "#FFFFFF", "1.9s", ".8s"]].map(([t, r, sz, c, d, dl], _i) => (
                            <span key={_i} style={{ position: "absolute", top: t, right: r, width: sz, height: sz, borderRadius: "50%", background: c, boxShadow: `0 0 6px ${c}`, animation: `wfTwinkle ${d} ease-in-out ${dl} infinite`, pointerEvents: "none" }} />
                          ))}
                          <span style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: "46%", background: "linear-gradient(105deg, transparent 0%, rgba(255,255,255,.09) 44%, rgba(255,255,255,.16) 50%, rgba(255,255,255,.09) 56%, transparent 100%)", animation: "wfSweep 5.6s ease-in-out infinite", pointerEvents: "none" }} />
                          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: _c.stripe, animation: "wfGlow 2.6s ease-in-out infinite" }} />
                          <button onClick={(e) => { e.stopPropagation(); const _t = _ct.headline(locName); shareLink(_t, listShareUrl("hol-" + _h.key, _t, 0, locName, _h.key), () => showToast("Link copied"), "Check this out on Wayfind: " + _t, () => { try { logEvent("share", null, { kind: "list", theme: "hol-" + _h.key }); } catch (er) {} giveawayMark("list:hol-" + _h.key); }); }} aria-label="Share" title="Share" style={{ position: "absolute", top: 10, right: 10, width: 34, height: 34, borderRadius: "50%", background: "rgba(0,0,0,.35)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)", zIndex: 2 }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ fontSize: 24, filter: "drop-shadow(0 0 8px rgba(255,209,102,.6))" }}>{_h.emoji}</span>
                            <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "1px", color: _c.text, textTransform: "uppercase" }}>Holiday special · {_ct.tag}</span>
                          </div>
                          <div style={{ fontSize: 21, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.15, letterSpacing: "-0.3px" }}>{_ct.headline(locName)}</div>
                          <div style={{ fontSize: 12.5, color: _c.text, marginTop: 5, lineHeight: 1.4 }}>{_ct.sub}</div>
                          <div style={{ display: "inline-flex", alignItems: "center", marginTop: 12, padding: "8px 16px", borderRadius: 999, background: _c.accent, color: "#0D1117", fontSize: 12.5, fontWeight: 800 }}>See the picks ›</div>
                        </div>
                      ); })()}
                      
                      {/* "Your Next Move" hidden per request — change false to true to bring it back */}
                      {false && <HookSolo h={heroHook} place={heroPlace} hideLike onOpen={openHook} onShare={() => shareHook(heroHook, heroPlace)} />}
                    </>)}
                      {(() => {
                        const _bestCity = (locName && locName.split(",")[0]) || "your area";
                        // v5.66: the "More ways to explore" image cards + Top 10 rows + Take-a-chance
                        // folded into ONE iOS-style list menu (no photos: they failed to load and ate
                        // vertical space). Every row keeps the exact destination + analytics its card had.
                        const _items = [
                          ["food", "\uD83C\uDF7D\uFE0F", "Top 10 Food", "The best places to eat near you, ranked.", C.accent, () => openCurated("food")],
                          ["nightlife", "\uD83C\uDF78", "Top 10 Nightlife", "Bars, live music, and late-night eats.", C.pink, () => openCurated("nightlife")],
                          ["experiences", "\uD83C\uDFA2", "Top 10 Experiences", "Theme parks, attractions, and bookable tours.", C.purple, () => openCurated("experiences")],
                          ["shopping", "\uD83D\uDECD\uFE0F", "Top 10 Shopping", "Malls, outlets, and the boutiques that rate best.", C.green, () => openCurated("shopping")],
                          ["events", "\uD83C\uDF9F\uFE0F", "Events tonight", "What is happening near you tonight.", C.blue, () => setScreen("events")],
                          ["bestof", "\uD83C\uDFC6", "Best of " + _bestCity, "The local institutions people here swear by.", C.gold, () => { try { logEvent("intent_chip", null, { intent: "bestof", src: "home_menu" }); } catch (e) {} openExpSheet("bestof"); }],
                          ["gem", "\uD83D\uDC8E", "Hidden gems", "The under-the-radar spots locals keep quiet.", C.teal, () => { try { logEvent("intent_chip", null, { intent: "gem", src: "home_menu" }); } catch (e) {} openExpSheet("gem"); }],
                          ["entertainment", "\uD83C\uDFA1", "Attractions & fun", "Theme parks, tours, and the can't-miss stops.", C.purple, () => { try { logEvent("intent_chip", null, { intent: "entertainment", src: "home_menu" }); } catch (e) {} openExpSheet("entertainment"); }],
                          ["family", "\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67", "Best for families", "Easy with kids, good for the grown-ups too.", C.green, () => { try { logEvent("intent_chip", null, { intent: "family", src: "home_menu" }); } catch (e) {} openExpSheet("family"); }],
                          ["shows", "\uD83C\uDFAD", "Shows & tickets", "Dinner shows, theater, and live entertainment.", C.pink, () => { try { logEvent("intent_chip", null, { intent: "shows", src: "home_menu" }); } catch (e) {} openExpSheet("shows"); }],
                          ["budget", "\uD83E\uDE99", "On a budget", "Big fun that goes easy on the wallet.", C.gold, () => { try { logEvent("intent_chip", null, { intent: "budget", src: "home_menu" }); } catch (e) {} openExpSheet("budget"); }],
                          ["stays", "\uD83C\uDFE8", "Hotels & stays", "Places to stay, from resorts to easy overnights.", C.blue, () => { try { logEvent("intent_chip", null, { intent: "stays", src: "home_menu" }); } catch (e) {} openExpSheet("stays"); }],
                          ["dice", "\uD83C\uDFB2", "Take a chance", "Let Wayfind surprise you with one pick.", C.pink, () => { try { logEvent("dice_card", null, { to: "pick", src: "home_menu" }); } catch (e) {} setMenuSheet("pick"); }],
                        ];
                        return (
                          <div style={{ marginBottom: 16, background: C.card, border: "1px solid " + C.border, borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.32)" }}>
                            <div style={{ padding: "14px 15px 10px" }}>
                              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 5 }}>Explore near you</div>
                              <div onClick={() => { setIntroSel([]); setIntroOpen(true); try { logEvent("intro_reopen", null, { src: "curated" }); } catch (e) {} }} role="button" tabIndex={0} onKeyDown={KB_CLICK} style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, cursor: "pointer", marginBottom: 7 }}>✨ Or tell us your mood and we'll design your list →</div>
                              <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45 }}>Pick where you want to go. Every list is ranked for you, with no ads and no paid placement.</div>
                            </div>
                            <style>{".wf-mrow{transition:background .12s ease}.wf-mrow:active{background:rgba(255,255,255,.06)}@media(hover:hover){.wf-mrow:hover{background:rgba(255,255,255,.035)}}"}</style>
                            {_items.map(([k, ic, lb, desc, col, act]) => (
                              <button key={k} className="wf-mrow" onClick={(e) => { e.stopPropagation(); try { act(); } catch (er) {} }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: "1px solid " + C.border, padding: "13px 15px", cursor: "pointer", WebkitTapHighlightColor: "transparent", minHeight: 56 }}>
                                <span aria-hidden="true" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 12, fontSize: 19, background: "linear-gradient(145deg, " + col + "33, " + col + "12)", border: "1px solid " + col + "4D" }}>{ic}</span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{lb}</span>
                                  <span style={{ display: "block", fontSize: 12, color: C.muted, lineHeight: 1.35, marginTop: 2 }}>{desc}</span>
                                </span>
                                <span aria-hidden="true" style={{ flexShrink: 0, color: col, fontSize: 20, fontWeight: 700 }}>{"\u203A"}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    {/* v5.66: the "More ways to explore" image cards + the Take-a-chance card are now folded into the single iOS-style list menu above — destinations + analytics preserved, no photos. */}
                  </div>
                );
              })()}
              {/* v3.7: mobile inline "You are exploring" card removed — it duplicated the 📍 This area tile sheet. Data is unchanged; it now loads only when the tile is opened. */}
              {/* v4.1: standalone "Happening at the library" card removed from home — this content now lives in the Community tile sheet (menuSheet === "community"). libraryEvents state and fetch are unchanged. */}
              {/* v6.25: Top 10 cards — the ranked best of the area and the best food, right at the top. Data-driven off the current location, so a searched city gets its own top 10 automatically. */}
              {!browseCat && (suggested && suggested.length > 0) && (() => {
                const condCtx = { weather, hour: new Date().getHours(), isWeekend: [0, 6].includes(new Date().getDay()) };
                const areaPool = dedupePlaces([...(displayList || []), ...(places || [])].filter(Boolean), true);
                const cityN = locName ? locName.split(",")[0] : "you";
                const boostBase = (p) => (p._ps != null ? p._ps : (p.wfScore != null ? p.wfScore : 50)) + featuredBoost(p.name) + communityBoost(p);
                const food10 = Ranking.rankByConditions(areaPool.filter((p) => (Ranking.coarseCat(p) || primaryCategory(p)) === "Food"), condCtx, boostBase).slice(0, 10);
                const todoPool = dedupePlaces((homeTodo || []).filter((p) => { const c = Ranking.coarseCat(p) || primaryCategory(p); return c !== "Food" && c !== "Nightlife" && c !== "Hotels"; }), true);
                const todo10 = Ranking.rankByConditions(todoPool, condCtx, boostBase).slice(0, 10);
                const row = (p, i, n) => (
                  <div key={p.id} onClick={() => openDetail(p)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: i < n - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                    <div style={{ width: 22, textAlign: "center", fontSize: 13.5, fontWeight: 800, color: i < 3 ? C.accent : C.muted, flexShrink: 0 }}>{i + 1}</div>
                    <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: 46, height: 46, borderRadius: 10, objectFit: "cover", flexShrink: 0, display: "block" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2, fontSize: 11.5 }}>
                        {(() => { const cz = Dining.cuisineLabel(p); return cz ? <span style={{ color: C.light, fontWeight: 600 }}>{cz}</span> : null; })()}
                        {p.rating && <span style={{ color: "#F59E0B", fontWeight: 700 }}>★ {p.rating}</span>}
                        {(() => { const dining = ["Food", "Nightlife"].includes(Ranking.coarseCat(p) || ""); const c = Dining.costForTwo(p); return dining && c.listed ? <span style={{ color: C.green, fontWeight: 700 }}>{c.tier || "$$"}</span> : (p.price ? <span style={{ color: C.green, fontWeight: 700 }}>{p.price}</span> : null); })()}
                        {p.openNow === true && <span style={{ color: C.green, fontWeight: 700 }}>Open</span>}
                        {p.openNow === false && <span style={{ color: C.red, fontWeight: 700 }}>Closed</span>}
                        {p.distMi != null && <span style={{ color: C.muted }}>{p.distMi.toFixed(1)} mi</span>}
                      {(p.price_level ?? p.priceLevel) != null && <span style={{ color: C.muted }}>{"$".repeat(Math.max(1, Math.min(4, (p.price_level ?? p.priceLevel) || 1)))}</span>}
                      </div>
                    </div>
                    <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>›</span>
                  </div>
                );
                const card = (title, sub, list, open, onToggle) => (list.length >= 3 ? (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "13px 14px", marginBottom: 16 }}>
                    <div onClick={onToggle} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, cursor: "pointer" }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 800, color: C.text }}>{title}</div>
                        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, lineHeight: 1.3 }}>{sub}{(() => { const avg = Dining.avgCostForTwo(list); return avg ? <span style={{ color: C.green, fontWeight: 700 }}>{"  ·  " + avg.text}</span> : null; })()}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: C.muted, fontWeight: 700, whiteSpace: "nowrap" }}>Top {list.length}</span>
                        <span style={{ fontSize: 15, color: C.muted, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
                      </div>
                    </div>
                    {open && <div style={{ marginTop: 8 }}>{list.map((p, i) => row(p, i, list.length))}</div>}
                  </div>
                ) : null);
                return (<>
                  {card("Best places to eat right now", "Ranked by what is worth your time: open status, ratings, distance, weather and time of day.", food10, food10Open, () => setFood10Open((v) => !v))}
                  {card("Best things to do today", "Ranked by what is worth your time: quality, distance, weather and time of day.", todo10, top10Open, () => setTop10Open((v) => !v))}
                </>);
              })()}
              {!browseCat && !isDesktop && suggested !== null && Array.isArray(foryouEvents) && foryouEvents.length === 0 && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 15px", marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 4 }}>Happening near you</div>
                  <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>Nothing strong tonight nearby. Try one of these instead.</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button onClick={() => { try { logEvent("intent_chip", null, { intent: "Date night", src: "events_empty" }); } catch (e) {} openExperience("romantic"); }} style={{ padding: "8px 14px", borderRadius: 999, background: C.adim, border: `1px solid ${C.accent}`, color: C.accent, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Date night</button>
                    <button onClick={() => { try { logEvent("intent_chip", null, { intent: "Rainy day", src: "events_empty" }); } catch (e) {} openRainy(); }} style={{ padding: "8px 14px", borderRadius: 999, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Rainy day</button>
                    <button onClick={() => { try { logEvent("intent_chip", null, { intent: "Hidden gems", src: "events_empty" }); } catch (e) {} openExperience("gem"); }} style={{ padding: "8px 14px", borderRadius: 999, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Hidden gems</button>
                  </div>
                </div>
              )}
              {!browseCat && !isDesktop && suggested !== null && foryouEvents && foryouEvents.length > 0 && (() => {
                const evs = dedupeEvents(foryouEvents, true);
                const relLabel = (e) => { if (!e || !e.date) return null; const ed = new Date(e.date + "T00:00:00"); const t0 = new Date(); t0.setHours(0, 0, 0, 0); const diff = Math.round((ed - t0) / 86400000); if (diff <= 0) return "Tonight"; if (diff === 1) return "Tomorrow"; if (diff >= 0 && diff <= 6 && (ed.getDay() === 6 || ed.getDay() === 0)) return "This weekend"; return null; };
                const usable = evs.filter((e) => e && e.dest);
                const withImg = usable.filter((e) => e.image);
                const featured = (withImg.length ? withImg : usable).slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))[0];
                const rest = evs.filter((e) => e && (!featured || e.id !== featured.id)).slice(0, 24);
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="ticket" size={17} color={C.accent} />Happening near you</div>
                      <span onClick={() => setScreen("events")} style={{ fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }}>See all ↗</span>
                    </div>
                    {featured && featured.dest && (() => {
                      const f = formatEventDate(featured.date, featured.time);
                      const seg = eventSegmentMeta(featured.segment, featured.genre);
                      const rel = relLabel(featured);
                      const acc = C.purple;
                      const internal = featured.destKind === "internal";
                      const href = internal ? featured.dest : ticketUrl(featured.dest);
                      const tix = internal && featured.url ? ticketUrl(featured.url) : null;
                      // Phase 2 card semantics: the hero is ONE semantic link to
                      // the event's resolved destination; the tickets action is a
                      // separate sibling control layered on top, never nested.
                      return (
                        <div style={{ position: "relative", marginBottom: 10 }}>
                          <a href={href} {...(internal ? {} : { target: "_blank", rel: "noreferrer" })} onClick={() => { try { logEvent("event_open", null, { id: featured.id, kind: featured.destKind, src: "foryou_hero" }); } catch (e2) {} }} style={{ display: "block", position: "relative", height: 176, borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.4)", textDecoration: "none" }}>
                            <EventHeroBg image={featured.image} acc={acc} venue={cleanVenueName(featured.venue) || featured.venue} near={center} />
                            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.12) 0%, rgba(0,0,0,.5) 45%, rgba(0,0,0,.9) 100%)" }} />
                            <div style={{ position: "absolute", bottom: 0, right: 0, width: 140, height: 140, background: `radial-gradient(circle at bottom right, ${acc}30 0%, transparent 65%)`, pointerEvents: "none" }} />
                            <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <div style={{ display: "inline-flex", alignItems: "center", background: rel ? acc : "rgba(0,0,0,.6)", border: `1px solid ${rel ? acc : "rgba(255,255,255,.25)"}`, borderRadius: 999, padding: "4px 11px", backdropFilter: "blur(4px)" }}>
                                <span style={{ fontSize: 10.5, fontWeight: 800, color: rel ? "#0D1117" : "#fff", letterSpacing: "0.4px", textTransform: "uppercase" }}>{rel || (f.wd + " " + f.mo + " " + f.day)}{f.time ? " · " + f.time : ""}</span>
                              </div>
                              {(featured.segment || featured.genre) && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.6)", border: `1px solid ${seg.color}77`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}><Icon name={seg.iconName || "ticket"} size={11} color={seg.color} /><span style={{ fontSize: 9, fontWeight: 800, color: seg.color, textTransform: "uppercase", letterSpacing: "0.8px" }}>{seg.short}</span></div>}
                            </div>
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 14px 52px" }}>
                              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.18, marginBottom: 4, textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.3px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{featured.name}</div>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.92)", textShadow: "0 1px 4px rgba(0,0,0,.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {cleanVenueName(featured.venue) || featured.city || "Nearby"}{featured.price ? " · " + featured.price : ""}</div>
                            </div>
                          </a>
                          <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", gap: 8 }}>
                            {tix
                              ? <a href={tix} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("ticket", null, { src: "cta" }); } catch (e2) {} }} style={{ display: "inline-flex", alignItems: "center", fontSize: 12.5, fontWeight: 800, color: "#0D1117", background: acc, borderRadius: 999, padding: "7px 16px", textDecoration: "none" }}>Get tickets →</a>
                              : <span style={{ display: "inline-flex", alignItems: "center", fontSize: 12.5, fontWeight: 800, color: "#0D1117", background: acc, borderRadius: 999, padding: "7px 16px", pointerEvents: "none" }}>See event →</span>}
                          </div>
                        </div>
                      );
                    })()}
                    {rest.length > 0 && (
                      <div tabIndex={0} role="region" aria-label="Events near you" style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                        {rest.filter((e) => e && e.dest).map((e) => {
                          const f = formatEventDate(e.date, e.time);
                          const evRel = relLabel(e);
                          const internal = e.destKind === "internal";
                          return (
                            <a key={e.id} href={internal ? e.dest : ticketUrl(e.dest)} {...(internal ? {} : { target: "_blank", rel: "noreferrer" })} onClick={() => { try { logEvent("event_open", null, { id: e.id, kind: e.destKind, src: "foryou_rail" }); } catch (e2) {} }} style={{ display: "block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 9, width: 150, flexShrink: 0, scrollSnapAlign: "start", textDecoration: "none" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: evRel ? C.accent : C.purple, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{evRel ? evRel.toUpperCase() : (f.mo + " " + f.day)}{f.time ? " · " + f.time : ""}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.25, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 30 }}>{e.name}</div>
                              <div style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {e.venue || e.city || "Nearby"}</div>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
              {/* v5.35 hydration: the moment phrase ("Friday evening") comes
                  from post-mount state — the SSR'd shell can be up to an hour
                  old (ISR), so computing it at render made server and client
                  disagree (this was the live React 418/423). Both sides render
                  the generic line first; the moment arrives one paint later. */}
              {!browseCat && suggested === null && <div style={{ minHeight: "62vh" }}><Loader label={bootMoment ? `Finding the best options for ${bootMoment} near ${locName ? locName.split(",")[0] : "you"}…` : "Finding the best options near you…"} sub={`open now first · within ${DEFAULT_RADIUS_MI} miles · ranked by real reviews, not ads`} pad="8px 2px" /></div>}
              {!browseCat && !suggestedLoading && suggested !== null && list.length === 0 && (
                <div style={{ padding: "16px 2px 8px" }}>{/* v4.70 discovery grid: a first visit is never a dead end */}
                  <div style={{ textAlign: "center", marginBottom: 12 }}>
                    <div style={{ display: "inline-flex", animation: "wfbob 1.4s ease-in-out infinite", marginBottom: 8 }}><Critter size={44} /></div>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: C.text }}>Start with one of these</div>
                    <div style={{ fontSize: 13, color: C.muted, marginTop: 3 }}>Wayfind is reading what's around you — these always work.</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 9 }}>
                    {[
                      ["sparkles", "Best of " + (locName ? locName.split(",")[0] : "your area"), () => openExpSheet("bestof")],
                      ["gem", "Hidden gems", () => openExpSheet("gem")],
                      ["users", "Family favorites", () => openExpSheet("family")],
                      ["heart", "Date night ideas", () => openExpSheet("romantic")],
                      ["ticket", "Perfect for tonight", () => setScreen("events")],
                      ["car", "Worth the drive", () => openExpSheet("entertainment")],
                      ["wallet", "Big fun, small budget", () => openExpSheet("budget")],
                      ["dice", "Surprise me", () => setMenuSheet("pick")],
                    ].map(([ic, lbl, go]) => (
                      <button key={lbl} onClick={() => { try { logEvent("discovery_tile", null, { tile: lbl }); } catch (e) {} go(); }} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "13px 12px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontWeight: 700, cursor: "pointer", lineHeight: 1.25, minHeight: TARGET }}>
                        <Icon name={ic} size={19} color={C.accent} /><span>{lbl}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {/* Wayfind Picks list removed from home: the ranked list now lives behind the Wayfind Picks hero card above, which opens the curated top 10 sheet. */}
              {/* Roll the Dice now renders as the last hook card inside the "Worth a look" section above, matching the editorial cards. */}
              {/* Inline ranked feed removed from home: browsing the full ranked list now happens inside the Wayfind Picks sheet, the Nearby tile, search, and categories. */}
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}`, textAlign: "center" }}>
              <div style={{ height: 24 }} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 7 }}>
                  <a href="/privacy" style={{ fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: "none" }}>Privacy</a>
                  <span style={{ color: C.border }}>·</span>
                  <a href="/terms" style={{ fontSize: 12, fontWeight: 700, color: C.muted, textDecoration: "none" }}>Terms</a>
                </div>
                <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.8, lineHeight: 1.5, maxWidth: 320, margin: "0 auto" }}>Some links, including tickets and tours, are affiliate links. Wayfind may earn a commission at no extra cost to you.</div>
                <div onClick={() => { try { window.__wfv = (window.__wfv || 0) + 1; clearTimeout(window.__wfvT); window.__wfvT = setTimeout(() => { window.__wfv = 0; }, 2200); if (window.__wfv >= 5) { window.__wfv = 0; wfShowDiag(); } } catch (e) {} }} style={{ fontSize: 10, color: C.muted, opacity: 0.6, marginTop: 10, textAlign: "center", cursor: "pointer" }}>Wayfind · {BUILD_ID}</div>
              </div>
              <div style={{ height: 20 }} />
              </div>
              {isDesktop && (
                <div style={{ width: 400, flexShrink: 0, position: "sticky", top: 12 }}>
                  {/* v5.01 (user direction): the orange weather card is gone from
                      the desktop sidebar — weather lives in the header, period.
                      In its place: the in-app map, pinned with what's on screen
                      around the current location. Tap a pin → place detail;
                      Full map → the map tab. */}
                  {(() => { const _pins = (list || []).filter((p) => p && p.lat != null).slice(0, 20); return (
                  <div style={{ border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", marginBottom: 14, position: "relative", height: 320, background: C.card }}>
                    <MapView places={_pins} center={center} deviceLoc={deviceLoc} fit={_pins.length > 0} onSelect={(p) => { try { logEvent("map_pin_selected", p, { src: "sidebar" }); } catch (e) {} openDetail(p); }} />
                    <button onClick={() => { setMapListOverride(null); setScreen("map"); }} style={{ position: "absolute", right: 10, bottom: 10, zIndex: 5, padding: "7px 13px", borderRadius: 999, border: "none", background: C.accent, color: "#0D1117", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(0,0,0,.4)" }}>Full map ↗</button>
                    {locName ? <div style={{ position: "absolute", left: 10, top: 10, zIndex: 5, padding: "6px 11px", borderRadius: 999, background: "rgba(13,17,23,.82)", backdropFilter: "blur(6px)", color: C.text, fontSize: 12, fontWeight: 700, maxWidth: 220, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {locName.split(",")[0]}{_pins.length ? ` · ${_pins.length} spots` : ""}</div> : null}
                  </div>
                  ); })()}
                  {foryouEvents && foryouEvents.length > 0 && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.text, display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="ticket" size={16} color={C.accent} />Events nearby</div>
                        <span onClick={() => setScreen("events")} style={{ fontSize: 12, fontWeight: 700, color: C.accent, cursor: "pointer" }}>See all ↗</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
                        {dedupeEvents(foryouEvents, true).filter((e) => e && e.dest).slice(0, 6).map((e) => {
                          const f = formatEventDate(e.date, e.time);
                          const internal = e.destKind === "internal";
                          return (
                            <a key={e.id} href={internal ? e.dest : ticketUrl(e.dest)} {...(internal ? {} : { target: "_blank", rel: "noreferrer" })} onClick={() => { try { logEvent("event_open", null, { id: e.id, kind: e.destKind, src: "community_grid" }); } catch (e2) {} }} style={{ display: "block", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, textDecoration: "none" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: C.purple, marginBottom: 3 }}>{f.wd} {f.mo} {f.day}{f.time ? " · " + f.time : ""}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                              <div style={{ fontSize: 10.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {e.venue || e.city || "Nearby"}</div>
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {screen === "surprise" && <SurpriseScreen ctx={ctx} />}

        {screen === "experience" && activeBadge && EXPERIENCES[activeBadge] && <ExperienceScreen ctx={ctx} />}

        {screen === "coupons" && <CouponsScreen ctx={ctx} />}
        {/* v5.61 (audit P0): the personal screens never RENDER for a signed-out
            visitor — the write-action gate (v5.49) wasn't enough; the screen
            itself is now gated. authReady prevents a flash before auth
            resolves; while signed out an AuthWall prompts sign-in and the
            dialog auto-opens (effect below). Coupons stays public (deal
            browse); only its save action is gated, already, per v5.49. */}
        {screen === "saved" && (authReady && !user ? <AuthWall label="your Favorites" onSignIn={() => setAuthOpen(true)} /> : <SavedScreen ctx={ctx} />)}
        {screen === "itinerary" && (authReady && !user ? <AuthWall label="your Itinerary" onSignIn={() => setAuthOpen(true)} /> : <ItineraryScreen ctx={ctx} />)}

        {screen === "shared" && sharedList && <SharedScreen ctx={ctx} />}
        {screen === "events" && <EventsScreen ctx={ctx} />}
      </div>

      {/* Roll the dice */}
      <style>{"@keyframes wfroll{0%{transform:rotate(0deg) scale(1)}50%{transform:rotate(180deg) scale(1.25)}100%{transform:rotate(360deg) scale(1)}}"}</style>
      {rolling && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(13,17,23,.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <div style={{ fontSize: 92, lineHeight: 1, animation: "wfroll 0.5s linear infinite" }}>{diceFace}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Finding your spot…</div>
          <div style={{ fontSize: 12.5, color: C.light }}>Letting the dice decide</div>
        </div>
      )}
      {radiusSheet && (
        <div style={sheetBg} onClick={() => setRadiusSheet(false)}>
          <div style={{ ...sheet, padding: "6px 16px calc(20px + env(safe-area-inset-bottom))", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setRadiusSheet(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ textAlign: "center", marginTop: 4 }}>
              <div style={{ fontSize: 30 }}>📍</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.text, marginTop: 4 }}>How far should we look?</div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>Search distance from {locName || center.name || "you"}.</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 18 }}>
              {[{ mi: 3, v: 4828 }, { mi: 5, v: 8047 }, { mi: 10, v: 16093 }, { mi: 15, v: 24140 }, { mi: 25, v: 40234 }, { mi: 30, v: 48280 }].map((r) => {
                const on = pendingRadius === r.v;
                return (
                  <button key={r.v} onClick={() => setPendingRadius(r.v)} style={{ padding: "16px 8px", borderRadius: 14, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? C.adim : C.card, color: on ? C.accent : C.light, fontSize: 18, fontWeight: 800, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span>{r.mi}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: on ? C.accent : C.muted }}>miles</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => { setSearchRadius(pendingRadius); setRadiusSheet(false); }} style={{ width: "100%", marginTop: 18, height: 52, borderRadius: 14, border: "none", background: "linear-gradient(180deg, #FB923C 0%, #F97316 52%, #EA580C 100%)", color: "#fff", fontSize: 15.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 14px rgba(249,115,22,.4)" }}>Search this area</button>
            <div style={{ textAlign: "center", fontSize: 11.5, color: C.muted, marginTop: 10 }}>We only search again when you tap the button, to save data.</div>
          </div>
        </div>
      )}
      {diceChoose && !rolling && (
        <div onClick={() => setDiceChoose(false)} style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(13,17,23,.85)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setDiceChoose(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd} style={{ width: "100%", maxWidth: 480, maxHeight: "82vh", overflowY: "auto", overscrollBehaviorY: "contain", transition: SHEET_EASE, background: C.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20, border: `1px solid ${C.border}`, padding: "6px 16px calc(22px + env(safe-area-inset-bottom))" }}>
            <Grabber />
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 3 }}>🎲 Pick for me</div>
            <div style={{ fontSize: 13, color: C.light, marginBottom: 14, lineHeight: 1.5 }}>Pick what you are in the mood for and the dice lands you on a top rated spot near you that is open now.</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 9 }}>
              {[
                { label: "🍽️ Food", cat: "food", kw: "" },
                { label: "☕ Coffee", cat: "food", kw: "coffee" },
                { label: "🍰 Dessert", cat: "food", kw: "dessert" },
                { label: "🍸 Bars & drinks", cat: "nightlife", kw: "bar" },
                { label: "🍺 Breweries", cat: "nightlife", kw: "brewery" },
                { label: "🌃 Nightlife", cat: "nightlife", kw: "night club" },
                { label: "🎵 Live music", cat: "nightlife", kw: "live music" },
                { label: "🌊 Waterfront", cat: "food", kw: "waterfront" },
                { label: "💕 Date night", cat: "food", kw: "romantic restaurant" },
                { label: "🎯 Activities", cat: "attractions", kw: "things to do" },
                { label: "🌳 Parks & outdoors", cat: "attractions", kw: "park" },
                { label: "👨‍👩‍👧 Family", cat: "attractions", kw: "family friendly" },
                { label: "🛍️ Shopping", cat: "shopping", kw: "" },
                { label: "🎲 Anything", any: true },
              ].map((d) => (
                <button key={d.label} onClick={() => rollFor(d)} style={{ flex: d.any ? "1 1 100%" : "1 1 calc(50% - 5px)", padding: "13px 10px", borderRadius: 14, border: `1px solid ${d.any ? C.accent : C.border}`, background: d.any ? C.adim : C.card, color: d.any ? C.accent : C.text, fontSize: 14, fontWeight: d.any ? 800 : 700, cursor: "pointer" }}>{d.label}</button>
              ))}
            </div>
            <button onClick={() => setDiceChoose(false)} style={{ width: "100%", marginTop: 12, padding: "11px 0", borderRadius: 12, border: "none", background: "transparent", color: C.muted, fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div style={{ background: C.panel, borderTop: `1px solid ${C.border}`, display: "flex", flexShrink: 0, paddingBottom: "env(safe-area-inset-bottom)" }}>
        {[{ id: "home", icon: "home", label: "Home" }, { id: "events", icon: "events", label: "Events" }, { id: "coupons", icon: "coupons", label: "Coupons" }, { id: "map", icon: "map", label: "Map" }, { id: "saved", icon: "saved", label: "Favorites" }, { id: "itinerary", icon: "itinerary", label: "Itinerary" }].map((s) => {
          const active = (s.id === "home" && (screen === "suggested" || screen === "explore" || screen === "experience" || screen === "surprise")) || s.id === screen;
          return (
          <a key={s.id} href={{ home: "/", events: "/events", coupons: "/coupons", map: "/map", saved: "/favorites", itinerary: "/itinerary" }[s.id] || "/"} aria-label={s.label} aria-current={active ? "page" : undefined} onClick={(e) => { e.preventDefault(); if (s.id === "home" && active) { setBrowseCat(null); setMoodPick(null); setSub("all"); } setActiveList(null); setSysFolder(null); setListMenu(null); setRenamingList(null); setActiveTrip(null); setTripNoteEdit(null); setTripMoveFor(null); setMapListOverride(null); if (s.id === "home") { openSuggested(); } else { setScreen(s.id); } try { if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 }); window.scrollTo(0, 0); } catch (e) {} }} style={{ flex: 1, padding: "7px 6px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "transparent", border: "none", cursor: "pointer", textDecoration: "none" }}>
            <NavIcon name={s.icon} color={active ? C.accent : C.muted} size={22} />
            <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 600, color: active ? C.accent : C.muted }}>{s.label}</span>
          </a>
          );
        })}
      </div>

      {/* Detail sheet */}
      {detail && <DetailSheet ctx={ctx} />}

      {allExpOpen && (
        <div onClick={() => setAllExpOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAllExpOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd} style={{ background: C.panel, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "82dvh", overflowY: "auto", overscrollBehaviorY: "contain", transition: SHEET_EASE, padding: "6px 16px calc(18px + env(safe-area-inset-bottom))" }}>
            <Grabber />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>All experiences</div>
              <button onClick={() => setAllExpOpen(false)} aria-label="Close" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 999, width: 34, height: 34, fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              {Object.keys(EXPERIENCES).map((k) => {
                const e = EXPERIENCES[k];
                return (
                  <button key={k} onClick={() => { setAllExpOpen(false); openExperience(k); }} style={{ display: "flex", alignItems: "center", gap: 9, textAlign: "left", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 12px", cursor: "pointer" }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{e.icon}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{e.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Hook editorial page — full-screen themed experience, not a sheet */}
      {cuisineSheet && (() => {
        const cs = cuisineSheet; const list = cs.list || [];
        return (
          <div onClick={() => setCuisineSheet(null)} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,.62)", backdropFilter: "blur(3px)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: "#0D1117", width: "100%", maxWidth: 640, maxHeight: "82vh", overflowY: "auto", borderRadius: "20px 20px 0 0", border: `1px solid ${C.border}`, padding: "16px 16px 28px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 10 }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{cs.title || ("Top " + cs.label + " near you")}</div>
                <button onClick={() => setCuisineSheet(null)} aria-label="Close" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 24, cursor: "pointer", lineHeight: 1, flexShrink: 0 }}>×</button>
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>{list.length > 0 ? (cs.sub || ("The best " + cs.label.toLowerCase() + " spots loaded nearby, ranked by quality, distance and time.")) : (cs.title ? "Nothing loaded for this yet. Give the area a moment to finish loading, then try again." : "No " + cs.label.toLowerCase() + " spots loaded nearby yet. Try searching this cuisine.")}</div>
              {list.map((p, i) => (
                <div key={p.id} onClick={() => { setCuisineSheet(null); openDetail(p); }} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 0", borderBottom: i < list.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                  <div style={{ width: 22, textAlign: "center", fontSize: 13.5, fontWeight: 800, color: i < 3 ? C.accent : C.muted, flexShrink: 0 }}>{i + 1}</div>
                  <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: 46, height: 46, borderRadius: 10, objectFit: "cover", flexShrink: 0, display: "block" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2, fontSize: 11.5 }}>
                      {p.rating && <span style={{ color: "#F59E0B", fontWeight: 700 }}>★ {p.rating}</span>}
                      {(() => { const c = Dining.costForTwo(p); return c.listed ? <span style={{ color: C.green, fontWeight: 700 }}>{c.tier || "$$"}</span> : (p.price ? <span style={{ color: C.green, fontWeight: 700 }}>{p.price}</span> : null); })()}
                      {p.openNow === true && <span style={{ color: C.green, fontWeight: 700 }}>Open</span>}
                      {p.openNow === false && <span style={{ color: C.red, fontWeight: 700 }}>Closed</span>}
                      {p.distMi != null && <span style={{ color: C.muted }}>{p.distMi.toFixed(1)} mi</span>}
                    </div>
                  </div>
                  <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>›</span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      {hookDetail && <HookDetailSheet ctx={ctx} />}

      {/* Copied toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", zIndex: 1100, background: C.text, color: C.bg, fontSize: 13, fontWeight: 700, padding: "10px 18px", borderRadius: 999, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>{toast}</div>
      )}

      {/* Full-screen photo viewer */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <img src={lightbox} alt={detail && detail.name ? "Photo of " + detail.name : "Full-size photo"} onClick={() => setLightbox(null)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
          <button onClick={() => setLightbox(null)} aria-label="Close" style={{ position: "absolute", top: "max(16px, calc(env(safe-area-inset-top) + 10px))", right: 16, width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,.3)", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 20, cursor: "pointer", zIndex: 2 }}>✕</button>
          <div style={{ position: "absolute", bottom: "max(20px, calc(env(safe-area-inset-bottom) + 12px))", left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
            {(() => { const i = detail && Array.isArray(detail.photos) ? detail.photos.indexOf(lightbox) : -1; const by = i >= 0 && detail && Array.isArray(detail.photoAttrs) ? (detail.photoAttrs[i] || "") : ""; return <div style={{ color: "rgba(255,255,255,.85)", fontSize: 11.5, fontWeight: 600, marginBottom: 3 }}>{by === "Wayfind" ? "Photo: Wayfind" : by ? "Photo: " + by + " · via Google" : "Photo via Google"}</div>; })()}
            <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12 }}>Tap anywhere to close</div>
          </div>
        </div>
      )}

      {/* Account menu — opens from the header avatar so a tap no longer signs you out by accident */}
      {accountOpen && user && <AccountSheet ctx={ctx} />}

      {/* App-tile sheets: opened from the home navigation grid */}
      {menuSheet && <MenuSheet ctx={ctx} />}

      {/* Save-to-list sheet */}
      {authOpen && <AuthSheet ctx={ctx} />}
      {introOpen && <IntroSheet ctx={ctx} />}
      {recoveryOpen && <AuthSheet ctx={ctx} />}
      {saveTarget && (
        <div style={sheetBg} onClick={() => setSaveTarget(null)}>
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setSaveTarget(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Add to favorites</div>
              <button onClick={() => { setSaveTarget(null); setNewListOpen(true); }} style={{ background: "none", border: `1px solid ${C.accent}`, color: C.accent, fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 18, cursor: "pointer" }}>+ New list</button>
            </div>
            {Object.values(lists).map((l) => (
              <div key={l.id} onClick={() => saveToList(l.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, marginBottom: 8, cursor: "pointer" }}>
                <span style={{ fontSize: 26 }}>{l.emoji}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{l.name}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{l.places.length} places{l.places.some((p) => p.id === saveTarget.id) ? " · Added ✓" : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create-list sheet */}
      {listMenu && lists[listMenu] && (
        <div style={sheetBg} onClick={() => setListMenu(null)}>
          <div style={{ ...sheet, padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setListMenu(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 22 }}>{lists[listMenu].emoji}</span>
              <span style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{lists[listMenu].name}</span>
            </div>
            {[{ label: "Open", run: () => { const id = listMenu; setListMenu(null); setActiveList(id); } }, { label: "Share", run: () => { const l = lists[listMenu]; setListMenu(null); shareList(l.places, l.name); } }, { label: "Rename", run: () => { if (!requireAuth("Sign in to manage lists")) return; openRename(listMenu); } }].map((a) => (
              <button key={a.label} onClick={a.run} style={{ width: "100%", textAlign: "left", padding: "14px 14px", marginBottom: 8, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>{a.label}</button>
            ))}
            {listMenu !== "favorites" && (
              <button onClick={() => { const id = listMenu; setListMenu(null); deleteList(id); }} style={{ width: "100%", textAlign: "left", padding: "14px 14px", background: C.card, border: `1px solid ${C.red}55`, borderRadius: 12, color: C.red, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Delete list</button>
            )}
          </div>
        </div>
      )}
      {renamingList && (
        <div style={sheetBg} onClick={() => { setRenamingList(null); setNewName(""); }}>
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => { setRenamingList(null); setNewName(""); })} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: C.text }}>Rename list</div>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && renameList()} placeholder="List name" style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, outline: "none", marginBottom: 16 }} />
            <button onClick={renameList} disabled={!newName.trim()} style={{ width: "100%", padding: 14, background: newName.trim() ? C.accent : C.card, border: "none", borderRadius: 12, color: newName.trim() ? "#fff" : C.muted, fontSize: 15, fontWeight: 700, cursor: newName.trim() ? "pointer" : "default" }}>Save</button>
          </div>
        </div>
      )}
      {newListOpen && (
        <div style={sheetBg} onClick={() => setNewListOpen(false)}>
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setNewListOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 14, color: C.text }}>New list</div>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createList()}
              placeholder="List name (e.g. Date Night)"
              style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", background: C.card, border: `1.5px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, outline: "none", marginBottom: 16 }}
            />
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 10 }}>Pick an icon</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8, marginBottom: 20 }}>
              {EMOJIS.map((e) => (
                <button key={e} onClick={() => setNewEmoji(e)} style={{ fontSize: 22, padding: "8px 0", borderRadius: 10, cursor: "pointer", background: newEmoji === e ? C.adim : C.card, border: `1.5px solid ${newEmoji === e ? C.accent : C.border}` }}>{e}</button>
              ))}
            </div>
            <button onClick={createList} disabled={!newName.trim()} style={{ width: "100%", padding: 14, background: newName.trim() ? C.accent : C.card, border: "none", borderRadius: 12, color: newName.trim() ? "#fff" : C.muted, fontSize: 15, fontWeight: 700, cursor: newName.trim() ? "pointer" : "default" }}>Create list</button>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

function SwipeRow({ children, onDelete }) {
  const REVEAL = 84;
  const [dx, setDx] = useState(0);
  const [drag, setDrag] = useState(false);
  const sx = useRef(0); const sy = useRef(0); const base = useRef(0); const horiz = useRef(false);
  function start(e) { const t = e.touches[0]; sx.current = t.clientX; sy.current = t.clientY; horiz.current = false; setDrag(true); }
  function move(e) {
    const t = e.touches[0]; const mx = t.clientX - sx.current; const my = t.clientY - sy.current;
    if (!horiz.current) { if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) horiz.current = true; else return; }
    let nd = base.current + mx; if (nd > 0) nd = 0; if (nd < -(REVEAL + 40)) nd = -(REVEAL + 40); setDx(nd);
  }
  function end() { setDrag(false); const open = dx < -REVEAL / 2; const nd = open ? -REVEAL : 0; base.current = nd; setDx(nd); }
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", justifyContent: "flex-end" }}>
        <div onClick={(e) => { e.stopPropagation(); onDelete(); }} style={{ width: REVEAL, background: C.red, color: "#fff", fontWeight: 800, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>Delete</div>
      </div>
      <div onTouchStart={start} onTouchMove={move} onTouchEnd={end} style={{ transform: `translateX(${dx}px)`, transition: drag ? "none" : "transform .2s ease", background: C.bg, position: "relative", touchAction: "pan-y" }}>
        {children}
      </div>
    </div>
  );
}
// v4.84 — the shared bookable-activities rail (Viator products). Used on the
// viator-flagged vibes and the Things to do browse. Links carry partner
// attribution from the API; taps go through openExternal (PWA-safe).
function ViatorRail({ title, items, theme }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div style={{ margin: "4px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>{title}</span>
        <span style={{ fontSize: 9.5, color: C.muted }}>via Viator</span>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {items.map((t) => (
          <a key={t.code || t.url} href={t.url} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); const _live = (e.currentTarget && e.currentTarget.href) || t.url; try { logEvent("tickets_out", null, { kind: "vibe_tour", theme, code: t.code }); } catch (er) {} openExternal(_live); }} style={{ flex: "0 0 200px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", textDecoration: "none" }}>
            {t.image ? <img src={t.image} alt="" style={{ width: "100%", height: 86, objectFit: "cover", display: "block" }} /> : null}
            <div style={{ padding: "8px 10px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
              <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>★ {t.rating}{t.reviews ? ` (${t.reviews.toLocaleString()})` : ""}{t.fromPrice ? ` · from $${t.fromPrice}` : ""}{t.duration ? ` · ${t.duration}` : ""}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function PlaceCard({ p, rank, saved, liked, disliked, onDetail, onSave, onLike, onDislike, onShareCard, line, onBadge, selectedBadge, onCuisineTap }) {
  // v4.89 — photo fix. Non-Google (Foursquare) entries often arrive without a
  // photo reference, so cards fell back to the logo. When a card renders
  // photoless, resolve its Google twin once (findPlace is cached ~8 days) and
  // attach the real photo. The logo is now the last resort, not the norm.
  const [, _photoBump] = useState(0);
  useEffect(() => {
    if (!p || p.photo || !/^(fsq|osm|ridb|nps):/.test(String(p.id || "")) || p._noPhoto) return;
    let c = false;
    findPlace(p.name, { lat: p.lat, lng: p.lng }).then((g) => {
      const ok = g && g.photo && (_wfNorm(g.name).includes(_wfNorm(p.name)) || _wfNorm(p.name).includes(_wfNorm(g.name)));
      if (c) return;
      if (ok) { p.photo = g.photo; p.photos = g.photos || []; p.photoAttr = g.photoAttr || ""; if (g.oh) { p.oh = g.oh; p.openNow = g.openNow; p.utcOffset = g.utcOffset; } _photoBump((x) => x + 1); }
      else p._noPhoto = true; // remember the miss so we never refetch
    }).catch(() => {});
    return () => { c = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p && p.id]);
  const badges = [...(featuredBoost(p.name) > 0 ? [{ key: "featured", icon: "🏅", label: "Featured" }] : []), ...experienceBadges(p, selectedBadge, 3)];
  const pcat = primaryCategory(p);
  const m = rank ? medal(rank) : null;
  const take = line || templateBlurb(p);
  const offer = OFFERS[p.id];
  return (
    <div onClick={onDetail} style={{ background: C.card, border: `1px solid ${liked ? "rgba(34,197,94,.45)" : disliked ? "rgba(239,68,68,.3)" : C.border}`, borderRadius: 14, marginBottom: 12, overflow: "hidden", cursor: "pointer" }}>
      <div style={{ display: "flex" }}>
        <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: 96, height: "auto", minHeight: 96, objectFit: "cover", flexShrink: 0 }} />
        <div style={{ padding: "12px 12px", flex: 1, minWidth: 0, position: "relative" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            {rank && (m
              ? <div style={{ width: 24, height: 24, borderRadius: "50%", background: m.color, color: "#0D1117", fontSize: 12.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{rank}</div>
              : <div style={{ width: 28, textAlign: "center", color: C.muted, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>#{rank}</div>
            )}
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3, paddingRight: 4 }}>{p.name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "7px 0 6px" }}>
            {offer && <span style={{ fontSize: 11, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 999, padding: "2px 8px" }}>{offerLabel(offer)}</span>}
            {curatedFor(p) && <span style={{ fontSize: 11, fontWeight: 700, color: "#F97316", background: "rgba(249,115,22,.15)", padding: "2px 8px", borderRadius: 8 }}>★ Wayfind pick</span>}
            {(() => {
              const cz = Dining.cuisineLabel(p);
              const isFood = pcat === "Food" || pcat === "Nightlife";
              const showCuisine = isFood && cz;
              const primary = showCuisine ? cz : pcat;
              if (!primary) return null;
              const canTap = !!(showCuisine && onCuisineTap);
              return <span onClick={canTap ? (e) => { e.stopPropagation(); onCuisineTap(cz, p); } : undefined} style={{ fontSize: 12, fontWeight: 800, color: canTap ? C.accent : (CAT_LABEL_COLOR[pcat] || C.light), cursor: canTap ? "pointer" : "inherit", textDecoration: canTap ? "underline" : "none", textUnderlineOffset: 3, textDecorationThickness: canTap ? "1.5px" : undefined }}>{primary}{canTap ? " ›" : ""}</span>;
            })()}
            {p.rating && <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: p.rating >= 4.5 ? C.green : p.rating >= 4.0 ? "#3F8F4E" : C.card, color: p.rating >= 4.0 ? "#0D1117" : C.light, fontWeight: 800, fontSize: 14, padding: "2px 8px", borderRadius: 8 }}>★ {p.rating}</span>}
            {p.reviews > 0 && (() => { const cf = confidenceOf(p.reviews); return (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: C.muted }}>
                {cf && <span style={{ width: 7, height: 7, borderRadius: "50%", background: cf.color, flexShrink: 0 }} />}
                {p.reviews.toLocaleString()} reviews
              </span>
            ); })()}
            {p.priceNum != null ? <PriceMeter level={p.priceNum} word /> : (p.price && <span style={{ fontSize: 13, color: C.green, fontWeight: 700 }}>{p.price}</span>)}
            {(() => { const lo = liveOpen(p); /* v4.67: hours-computed, never stale cache */ return lo != null ? <span style={{ fontSize: 11, fontWeight: 600, color: lo ? C.green : C.red }}>{lo ? "Open" : "Closed"}</span> : null; })()}
            {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 7 }}>
            {badges.map((b) => (
              <button key={b.key} onClick={(e) => { e.stopPropagation(); if (onBadge) onBadge(b.key); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>{b.icon} {cityFixM(b.label)} ›</button>
            ))}
          </div>
          <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45 }}>{take}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
            <button onClick={(e) => { e.stopPropagation(); onSave(); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: saved ? C.accent : "transparent", border: `1.5px solid ${saved ? C.accent : C.border}`, borderRadius: 999, color: saved ? "#0D1117" : C.light, fontSize: 12, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>{saved ? "♥ Saved" : "♡ Save"}</button>
            {onLike && (
              <button onClick={onLike} title={liked ? "Unlike" : "Like this"} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: liked ? "rgba(34,197,94,.15)" : "transparent", border: `1.5px solid ${liked ? C.green : C.border}`, borderRadius: 999, color: liked ? C.green : C.muted, fontSize: 13, fontWeight: 700, padding: "5px 11px", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 0, verticalAlign: "-2px" }}><path d="M7 10v11" /><path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 20H7" /></svg>{liked ? " Liked" : ""}</button>
            )}
            {onDislike && (
              <button onClick={onDislike} title={disliked ? "Undo" : "Not for me"} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: disliked ? "rgba(239,68,68,.12)" : "transparent", border: `1.5px solid ${disliked ? C.red : C.border}`, borderRadius: 999, color: disliked ? C.red : C.muted, fontSize: 13, fontWeight: 700, padding: "5px 11px", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 0, marginRight: 0, verticalAlign: "-2px", transform: "rotate(180deg)" }}><path d="M7 10v11" /><path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 20H7" /></svg>{disliked ? " Nope" : ""}</button>
            )}
            <button onClick={(e) => { e.stopPropagation(); logEventAnon("share", p, { kind: "place_card" }); try { onShareCard && onShareCard(p); } catch (er) {} shareLink(p.name, placeShareUrl(p, "", ""), () => { try { if (typeof window !== "undefined") { const _t = document.createElement("div"); _t.textContent = "Link copied"; _t.style.cssText = "position:fixed;left:50%;bottom:88px;transform:translateX(-50%);background:#161B22;color:#fff;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:700;z-index:99999;border:1px solid #30363D;box-shadow:0 6px 24px rgba(0,0,0,.5)"; document.body.appendChild(_t); setTimeout(() => { try { document.body.removeChild(_t); } catch(e){} }, 1600); } } catch (e) {} }, "Check out " + p.name + " on Wayfind"); }} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 999, color: C.light, fontSize: 12, fontWeight: 700, padding: "5px 12px", cursor: "pointer" }}>↗ Share</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const wstat = { flexShrink: 0, whiteSpace: "nowrap", fontSize: 12, fontWeight: 700, color: C.light, background: "rgba(13,17,23,.5)", border: "1px solid rgba(249,115,22,.3)", borderRadius: 999, padding: "5px 11px" };
const shell = { background: C.bg, height: "100dvh", minHeight: "100dvh", display: "flex", justifyContent: "center" };
const wrap = { background: C.bg, color: C.text, height: "100dvh", width: "100%", maxWidth: 480, fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", touchAction: "pan-y", overscrollBehavior: "none" };

export default function Page() {
  return (
    <ErrorBoundary>
      <PageInner />
    </ErrorBoundary>
  );
}
