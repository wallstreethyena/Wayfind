"use client";
import { Component, useEffect, useMemo, useRef, useState , Fragment} from "react";
import { CATEGORIES, SUBFILTERS, VIBES, getLoader, geocodeCity, reverseGeocode, searchPlaces, fetchPlaceDetail, fetchPlaceById, findPlace, searchNearbyPlaces } from "../lib/google";
import * as Meals from "../lib/meals";
import * as Radius from "../lib/radius";
import { isTrueLodging } from "../lib/lodging";
import { supabase } from "../lib/supabase";
import MapView from "./components/MapView";
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

const BUILD = "beta";
const BUILD_ID = "v4.71";
const C = {
  bg: "#0D1117", panel: "#161B22", card: "#1C2230", border: "#2D3748",
  accent: "#F97316", adim: "rgba(249,115,22,.15)", blue: "#38BDF8", green: "#22C55E",
  red: "#EF4444", purple: "#FF8A3D", pink: "#F472B6", gold: "#FBBF24",
  text: "#F1F5F9", muted: "#94A3B8", light: "#CBD5E1",
};
// ─── Affiliate config ────────────────────────────────────────────────────────
// Fill these in AFTER you are approved, then redeploy and the links go live
// automatically. Nothing here is secret; affiliate ids appear in public URLs.
//  • Viator: your Partner ID from partners.viator.com (format P12345678).
//  • Ticketmaster: leave blank until you join their Impact program, then set the
//    tracking param they give you. Until then "Get tickets" links work normally,
//    just untracked.
const AFFIL = {
  viatorPid: (process.env.NEXT_PUBLIC_VIATOR_PID || "").trim(), // one env var lights all Viator surfaces
  viatorCampaign: "wayfind",
  ticketmasterParam: "",         // e.g. "irgwc=1&clickid=..." once approved, else blank
};
// Build a Viator search link for a place or area, tracked when a Partner ID is set.
// Pass a ticket/event URL through here so it gains affiliate tracking the moment a
// Ticketmaster param is set. Fails soft: returns the plain URL when not configured.
function ticketUrl(url) {
  if (!url || !AFFIL.ticketmasterParam) return url;
  try { return url + (url.indexOf("?") >= 0 ? "&" : "?") + AFFIL.ticketmasterParam; } catch { return url; }
}
const CAT_ICONS = { food: "🍽️", nightlife: "🍸", attractions: "🎡", beach: "🏖️", hotels: "🏨", shopping: "🛍️" };
// Each category gets its own accent color, used on the selected category tab.
const CAT_COLOR = {
  food: { c: "#F97316", dim: "rgba(249,115,22,.15)" },
  nightlife: { c: "#F472B6", dim: "rgba(244,114,182,.15)" },
  attractions: { c: "#FF8A3D", dim: "rgba(167,139,250,.15)" },
  beach: { c: "#2DD4BF", dim: "rgba(45,212,191,.15)" },
  hotels: { c: "#38BDF8", dim: "rgba(56,189,248,.15)" },
  shopping: { c: "#22C55E", dim: "rgba(34,197,94,.15)" },
};
const SHEET_EASE = "transform .34s cubic-bezier(.22,.61,.36,1)";
// A small grab handle at the top of every bottom sheet, so it reads as "pull down to close".
const LOGO_PIN = { left: "58%", top: -4, size: 11 }; // nudge left/top/size from a screenshot if the dot sits off
function GlowPin({ size = 26 }) {
  const s = size;
  return (
    <span style={{ position: "relative", width: s + 10, height: s + 10, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(249,115,22,.35)" }} />
      <span style={{ position: "absolute", inset: -7, borderRadius: "50%", border: "1px solid rgba(249,115,22,.18)" }} />
      <span style={{ position: "absolute", inset: -3, borderRadius: "50%", background: "radial-gradient(circle, rgba(249,115,22,.4) 0%, transparent 70%)" }} />
      <svg width={s} height={s} viewBox="0 0 24 24" style={{ position: "relative", filter: "drop-shadow(0 2px 6px rgba(249,115,22,.5))" }}><path fill="#F97316" d="M12 2C7.58 2 4 5.58 4 10c0 5.25 6.94 11.4 7.24 11.66a1.15 1.15 0 0 0 1.52 0C13.06 21.4 20 15.25 20 10c0-4.42-3.58-8-8-8Z" /><circle cx="12" cy="10" r="3" fill="#fff" /></svg>
    </span>
  );
}
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
    if (!sb || !ids.length) return null;
    const { data } = await sb.from("comments").select("place_id,user_id,type").in("place_id", ids);
    if (!Array.isArray(data) || !data.length) return null;
    const m = {};
    for (const r of data) {
      const k = r.place_id; if (!m[k]) m[k] = { seen: {}, warnSeen: {} };
      m[k].seen[r.user_id] = 1; if (r.type === "Warning") m[k].warnSeen[r.user_id] = 1;
    }
    const out = {};
    for (const k in m) out[k] = { authors: Object.keys(m[k].seen).length, warnAuthors: Object.keys(m[k].warnSeen).length };
    return out;
  } catch (e) { return null; }
}
function withMemberSignal(list, sig) {
  if (!sig) return list;
  return (list || []).map((p) => { const g = p && sig[p.id]; if (!g) return p; const d = Ranking.memberDelta(g); return { ...p, wfScore: +(((p.wfScore || 0) + d).toFixed(2)), _members: g }; });
}
function mapsRouteUrl(list) {
  const pts = (list || []).filter((pp) => pp && pp.lat != null && pp.lng != null).slice(0, 9);
  if (pts.length < 2) return null;
  const dest = pts[pts.length - 1];
  const wps = pts.slice(0, -1).map((pp) => pp.lat + "," + pp.lng).join("|");
  return "https://www.google.com/maps/dir/?api=1&destination=" + dest.lat + "," + dest.lng + "&waypoints=" + encodeURIComponent(wps) + "&travelmode=driving";
}

// v4.32 — Robust single-destination directions link. detail.mapsUrl is keyed by
// query_place_id, which only resolves for genuine Google Place IDs. Places from
// town notes, events, staples, and culture cards carry synthetic ids, so their
// place_id URL opens a broken Google Maps search. This picks the resolvable form:
// a real Google Place ID uses the place_id search; otherwise route by name and,
// when present, coordinates, which Google always resolves. Coordinates alone are
// the final fallback.
function directionsUrl(p) {
  if (!p) return null;
  const looksLikePlaceId = typeof p.id === "string" && /^ChIJ|^GhIJ|^Eh|^0x/.test(p.id) && p.id.length >= 20;
  if (looksLikePlaceId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name || "")}&query_place_id=${encodeURIComponent(p.id)}`;
  const hasCoords = p.lat != null && p.lng != null;
  if (p.name) {
    const q = encodeURIComponent(p.name + (p.address ? " " + p.address : ""));
    return hasCoords
      ? `https://www.google.com/maps/search/?api=1&query=${q}&center=${p.lat},${p.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${q}`;
  }
  if (hasCoords) return `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
  return p.mapsUrl || null;
}
function Grabber() {
  return (
    <div style={{ flexShrink: 0, display: "flex", justifyContent: "center", padding: "9px 0 5px" }}>
      <div style={{ width: 38, height: 5, borderRadius: 99, background: "#3A4453" }} />
    </div>
  );
}
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
const CAT_LABEL_COLOR = { Food: "#F97316", Nightlife: "#F472B6", Activities: "#FF8A3D", Beach: "#2DD4BF", Hotels: "#38BDF8", Shopping: "#22C55E" };

// Lowercased description + review text per place id, filled in when we prefetch
// the top results. Lets the badge engine read evidence like "on the waterfront
// with live music" that is not in the structured attribute flags. Only the
// prefetched top results have an entry; everything else falls back to name plus
// Google attributes. Nothing here is invented.
const HINTS = {};
const OFFERS = {};
function offerLabel(o) {
  if (!o) return "Offer";
  const t = (o.offer_type || "").toLowerCase();
  if (t.indexOf("happy") >= 0) return "Happy hour";
  if (t.indexOf("kids") >= 0) return "Kids eat free";
  if (t.indexOf("bogo") >= 0) return "2 for 1";
  if (t.indexOf("percent") >= 0 || t.indexOf("%") >= 0) return "Save today";
  if (t === "partner" || o.source === "partner") return "Partner offer";
  return "Offer";
}
const EMOJIS = ["❤️","⭐","🍴","🍸","🏖️","✈️","🎉","☕","🏨","🛍️","🎯","🌮","🍜","🎸","🏞️","📍"];

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
    return { ...p, _ps: (p.wfScore || 50) + boost - distPenalty + faveTier(p.name) * 4 + featuredBoost(p.name) + communityBoost(p) };
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
function _sharePath(nm) { try { if (typeof window !== "undefined" && window.posthog) window.posthog.capture("share_path", { path: nm }); } catch (e) {} }
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

function galleryBtn(side) {
  return {
    position: "absolute", top: "50%", transform: "translateY(-50%)", [side]: 8,
    width: 34, height: 34, borderRadius: "50%", border: "1px solid rgba(255,255,255,.25)",
    background: "rgba(13,17,23,.55)", color: "#fff", fontSize: 20, lineHeight: 1,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  };
}

function stars(r) {
  if (!r) return "";
  return "★".repeat(Math.floor(r)) + (r % 1 >= 0.5 ? "½" : "");
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
function scoreLabel(wf) {
  if (wf == null) return null;
  const s = (wf / 10).toFixed(1);
  let word = "Fair";
  if (wf >= 95) word = "Exceptional";
  else if (wf >= 90) word = "Excellent";
  else if (wf >= 85) word = "Great";
  else if (wf >= 80) word = "Very good";
  else if (wf >= 70) word = "Good";
  return { s, word };
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

// WMO weather code to a small icon and word. Used with the free, keyless
// Open-Meteo API so Wayfind can show local weather and reason about it.
function hourIcon(code, isDay, ms) {
  // At night, clear/partly conditions show the actual moon phase; precip keeps its icon.
  const w = weatherFromCode(code);
  if (!isDay && (code === 0 || code === 1 || code === 2)) { const m = moonPhase(new Date(ms)); return { icon: m.emoji, label: m.name }; }
  return { icon: w.icon, label: w.label };
}
function weatherFromCode(code) {
  const c = Number(code);
  if (c === 0) return { icon: "☀️", img: "sunny", label: "Clear", warm: true };
  if (c === 1 || c === 2) return { icon: "🌤️", img: "partly", label: "Partly cloudy", warm: true };
  if (c === 3) return { icon: "☁️", img: "cloudy", label: "Overcast" };
  if (c === 45 || c === 48) return { icon: "🌫️", img: "cloudy", label: "Fog" };
  if (c >= 51 && c <= 57) return { icon: "🌦️", img: "rain", label: "Drizzle", wet: true };
  if (c >= 61 && c <= 67) return { icon: "🌧️", img: "rain", label: "Rain", wet: true };
  if (c >= 71 && c <= 77) return { icon: "❄️", img: "snow", label: "Snow", wet: true };
  if (c >= 80 && c <= 82) return { icon: "🌦️", img: "rain", label: "Showers", wet: true };
  if (c >= 85 && c <= 86) return { icon: "🌨️", img: "snow", label: "Snow", wet: true };
  if (c >= 95) return { icon: "⛈️", img: "storm", label: "Storms", wet: true };
  return { icon: "🌡️", img: "cloudy", label: "" };
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
function tasteBoost(place) {
  try { const k = String((place && place.type) || ""); if (!k) return 0; const t = JSON.parse(localStorage.getItem("wf_taste_v1") || "{}"); return Math.min(3, (t[k] || 0) * 0.5); } catch (e) { return 0; }
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

const EXPERIENCES = {
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
  { id: "twohrs", icon: "\u23F1\uFE0F", label: "I only have 2 hours" },
  { id: "outside", icon: "\u2600\uFE0F", label: "I want to be outside" },
  { id: "locals", icon: "\u{1F48E}", label: "I want something locals know" },
  { id: "drive", icon: "\u{1F697}", label: "I'm willing to drive" },
  { id: "fifty", icon: "\u{1F4B5}", label: "I have $50" },
  { id: "visitors", icon: "\u{1F9F3}", label: "I'm showing visitors around" },
  { id: "rainy", icon: "\u{1F327}\uFE0F", label: "It's raining (or too hot)" },
  { id: "surprise", icon: "\u{1F3B2}", label: "Surprise me" },
];
const INTRO_PATHS = {
  family: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19c0-2.8 2.5-4.6 5.5-4.6s5.5 1.8 5.5 4.6M14.8 15c2.4.2 4.7 1.7 4.7 4",
  date: "M12 20s-7-4.4-9.2-8.6C1.2 8.3 3.2 5 6.4 5c2 0 3.4 1.1 4.1 2.4l1.5 2.4 1.5-2.4C14.2 6.1 15.6 5 17.6 5c3.2 0 5.2 3.3 3.6 6.4C19 15.6 12 20 12 20Z",
  twohrs: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3.2 2",
  outside: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-14v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4",
  locals: "M6 3h12l3 5-9 13L3 8l3-5Zm-3 5h18M9.5 3 8 8l4 13m2.5-18L16 8l-4 13",
  drive: "M5 12l1.6-4.2A2 2 0 0 1 8.5 6.5h7a2 2 0 0 1 1.9 1.3L19 12M5 12h14M5 12a2 2 0 0 0-2 2v3.5h2M19 12a2 2 0 0 1 2 2v3.5h-2m-14 0V19a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.5m8 0V19a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.5m-11 0h8M7.5 14.8h.01m9 0h.01",
  fifty: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm2.6-11.6c-.4-.9-1.4-1.5-2.6-1.5-1.6 0-2.8.9-2.8 2.1s1 1.7 2.8 2c1.9.3 3 .9 3 2.2 0 1.3-1.3 2.2-3 2.2-1.4 0-2.5-.7-2.9-1.7M12 6.5v11",
  surprise: "M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4L12 3Zm6.5 9 .9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3ZM5 14.5l.7 1.9 1.9.7-1.9.7L5 19.7l-.7-1.9-1.9-.7 1.9-.7.7-1.9Z",
  visitors: "M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7m-9.5 0h11A1.5 1.5 0 0 1 19 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-9A1.5 1.5 0 0 1 6.5 7ZM9 11v4m6-4v4",
  rainy: "M7 15a4.5 4.5 0 0 1-.9-8.9A5.5 5.5 0 0 1 16.7 7 4 4 0 0 1 17 15H7Zm1.5 3-.8 2.2m4.3-2.2-.8 2.2m4.3-2.2-.8 2.2",
  wand: "M6 21 17.5 9.5M15 4l.8 2.2L18 7l-2.2.8L15 10l-.8-2.2L12 7l2.2-.8L15 4Zm5.5 5 .5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5.5-1.4ZM8 3.5l.5 1.3 1.3.5-1.3.5L8 7.1l-.5-1.3-1.3-.5 1.3-.5.5-1.3Z",
  pin: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  spark: "M12 2l2 5.5L19.5 9 14 11l-2 5.5L10 11 4.5 9 10 7.5 12 2Zm7 11 .9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z",
  shield: "M12 3l7 2.8v5.4c0 4.5-3 8.1-7 9.8-4-1.7-7-5.3-7-9.8V5.8L12 3Zm-2.5 8.6 1.8 1.9 3.4-3.7",
};
function IntroIcon({ k, size = 22, color = "#FF8A3D" }) {
  const d = INTRO_PATHS[k]; if (!d) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={d} /></svg>;
}
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
  const base = has("family") ? "family" : has("date") ? "romantic" : has("visitors") ? "entertainment" : has("locals") ? "gem" : has("outside") ? "nature" : has("fifty") ? "budget" : "entertainment";
  const spec = { base };
  if (has("twohrs")) { spec.radiusOverride = 24000; spec.openNowOnly = true; }
  if (has("drive")) spec.radiusOverride = 110000;
  if (has("fifty")) spec.priceMax = 2;
  if (has("outside") && base !== "nature") spec.extraKeyword = "outdoor";
  if (has("rainy")) { spec.indoorOnly = true; if (base === "entertainment") spec.extraKeyword = ((spec.extraKeyword || "") + " indoor").trim(); }
  const names = { family: "Family day", romantic: "Date night", bestof: "Best of", gem: "Local gems", nature: "Time outside", budget: "Big fun, small budget", entertainment: "Things to do" };
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

// v4.52: AI insight text guard. The insight model occasionally returns meta
// commentary about categorization ("this is a performing arts theater, not a
// food establishment...") instead of a real verdict. That must never reach a
// user. Applied at render time so poisoned cache entries are neutralized too.
function insightSane(t) {
  const x = String(t || "").trim();
  if (!x) return "";
  if (/not a (food|restaurant|dining)|food establishment|does not belong|browsing category|miscategor|wrong category|as an ai|i cannot|i can't|unable to (assess|evaluate)/i.test(x)) return "";
  return x;
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
function FallbackImg({ src, alt, style, icon, onClick }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) {
    return (
      <div style={{ ...style, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #161B22 0%, #1C2230 55%, #232B3A 100%)", cursor: "default" }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="1.5" style={{ opacity: 0.5 }}>
          <path d="M12 2.5C8.13 2.5 5 5.63 5 9.5c0 4.7 5.95 10.2 6.5 10.7a.74.74 0 0 0 1 0c.55-.5 6.5-6 6.5-10.7 0-3.87-3.13-7-7-7Z" />
          <circle cx="12" cy="9.4" r="2.4" />
        </svg>
      </div>
    );
  }
  return <img decoding="async" src={src} alt={alt || ""} loading="lazy" draggable={false} onError={() => setBad(true)} onClick={onClick} style={style} />;
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
function AreaInsight({ metro, cat, town, onFind }) {
  const [openIt, setOpenIt] = useState(false);
  const map = { food: "food", night: "night", todo: "todo", stays: "stays", beach: "todo", events: "events" };
  const key = map[cat];
  // v4.30: a town with its own researched notes outranks the metro story.
  const tn = town && Culture.TOWN_NOTES && Culture.TOWN_NOTES[String(town).toLowerCase()];
  const notes = (tn && key && tn[key]) || (metro && key && Culture.CAT_NOTES[metro] ? Culture.CAT_NOTES[metro][key] : null);
  const c = metro ? Culture.CULTURE[metro] : null;
  if (!notes || !c) return null;
  const isTown = !!(tn && key && tn[key]);
  return (
    <div style={{ margin: "0 0 12px", borderRadius: 14, border: "1px solid rgba(46,204,163,.28)", background: "linear-gradient(135deg, rgba(6,35,30,.55), rgba(11,58,49,.4))", overflow: "hidden" }}>
      <div onClick={() => { const nv = !openIt; setOpenIt(nv); if (nv) { try { logEvent("area_insight", null, { metro, cat: key }); } catch (e) {} } }} role="button" style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "11px 13px", cursor: "pointer" }}>
        <span style={{ fontSize: 15, lineHeight: "19px" }}>{"\uD83C\uDF3A"}</span>
        <span style={{ flex: 1, fontSize: 12.5, color: "#B9D6CE", lineHeight: 1.45 }}>
          <span style={{ fontWeight: 800, color: "#FFFFFF" }}>{isTown ? town : "Around " + (town && town.toLowerCase() !== c.title.toLowerCase() ? town + " and the " + c.title + " area" : c.title)}: </span>
          {notes.line}
        </span>
        <span style={{ fontSize: 10, color: "#8ED6C4", transform: openIt ? "rotate(180deg)" : "none", transition: "transform .2s", marginTop: 3 }}>{"\u25BC"}</span>
      </div>
      {openIt && (
        <div style={{ padding: "0 13px 13px 37px" }}>
          {(notes.items || []).map((x, i) => {
            const book = x.viatorUrl ? Aff.viatorDirectUrl(x.viatorUrl) : null;
            return (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: "#FFFFFF", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span onClick={(e) => { e.stopPropagation(); try { logEvent("insight_find", null, { metro, q: x.name }); } catch (er) {} onFind && onFind(x.query || x.name); }} role="button" style={{ cursor: "pointer", textDecoration: "underline", textDecorationColor: "rgba(46,201,166,.4)", textUnderlineOffset: 3 }}>{x.name}</span>
                  {book ? <a href={book} target="_blank" rel="noreferrer" onClick={(e) => { e.stopPropagation(); try { logEvent("culture_book", null, { metro, q: x.name }); } catch (er) {} }} style={{ fontSize: 10, fontWeight: 800, padding: "2px 9px", borderRadius: 999, background: "#2EC9A6", color: "#0D1117", textDecoration: "none" }}>Book ↗</a> : null}
                </div>
                <div style={{ fontSize: 11.5, color: "#B9D6CE", lineHeight: 1.45, marginTop: 1 }}>{x.story}</div>
              </div>
            );
          })}
          {notes.say ? <div style={{ fontSize: 11.5, color: "#B9D6CE", marginTop: 9 }}><span style={{ fontWeight: 800, color: "#8ED6C4" }}>Talk local: </span><span style={{ fontWeight: 800, color: "#FFFFFF" }}>{"\u201C"}{notes.say.phrase}{"\u201D"}</span> {"\u2014"} {notes.say.meaning}</div> : null}
          {notes.mistake ? <div style={{ fontSize: 11.5, color: "#B9D6CE", marginTop: 7 }}><span style={{ fontWeight: 800, color: "#F2C14E" }}>Rookie mistake: </span>{notes.mistake}</div> : null}
        </div>
      )}
    </div>
  );
}

function SortControl({ sortBy, onSort, mi, onMi, where, dealsAvailable, dealsOnly, onDeals }) {
  const [openMenu, setOpenMenu] = useState(false);
  const OPTIONS = [["best", "Best experiences"], ["near", "Closest first"], ["rated", "Top rated"], ["price", "Price: low to high"]];
  const current = (OPTIONS.find(([k]) => k === sortBy) || OPTIONS[0])[1];
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <div onClick={(e) => { e.stopPropagation(); setOpenMenu((o) => !o); }} role="button" style={{ display: "inline-flex", alignItems: "center", gap: 7, background: C.card, border: `1px solid ${openMenu ? C.accent : C.border}`, borderRadius: 999, color: C.light, fontWeight: 800, fontSize: 13, cursor: "pointer", padding: "8px 14px" }}>
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
              <div key={k} onClick={() => { onSort(k); }} role="button" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderRadius: 10, cursor: "pointer", background: sortBy === k ? "rgba(249,115,22,.12)" : "transparent" }}>
                <span style={{ width: 17, height: 17, borderRadius: "50%", border: `2px solid ${sortBy === k ? C.accent : C.border}`, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{sortBy === k ? <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.accent }} /> : null}</span>
                <span style={{ fontSize: 13.5, fontWeight: sortBy === k ? 800 : 600, color: sortBy === k ? C.text : C.light }}>{lb}</span>
              </div>
            ))}
            {dealsAvailable ? (
              <div onClick={() => onDeals && onDeals(!dealsOnly)} role="button" style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 8px", borderRadius: 10, cursor: "pointer" }}>
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
function NavIcon({ name, color, size }) {
  const sz = size || 23;
  const p = { width: sz, height: sz, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "home") return (<svg {...p}><path d="M4 12 L12 4.5 L20 12" /><path d="M6 10.5 V19.5 H18 V10.5" /><path d="M10 19.5 V14 H14 V19.5" /></svg>);
  if (name === "events") return (<svg {...p}><rect x="4" y="5.4" width="16" height="15" rx="2.4" /><path d="M8 3.4v3.4" /><path d="M16 3.4v3.4" /><path d="M4 10.4h16" /><circle cx="12" cy="15" r="1.7" /></svg>);
  if (name === "map") return (<svg {...p}><path d="M9 4.5 L3 7 V19.5 L9 17 L15 19.5 L21 17 V4.5 L15 7 L9 4.5 Z" /><path d="M9 4.5 V17" /><path d="M15 7 V19.5" /></svg>);
  if (name === "saved") return (<svg {...p}><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>);
  if (name === "food") return (<svg {...p}><path d="M7 3v6" /><path d="M5 3v4" /><path d="M9 3v4" /><path d="M7 9v12" /><path d="M16.5 3c-1.6 1-2.3 3-2.3 5.2 0 1.7 1 2.5 2.3 2.7V21" /></svg>);
  if (name === "nightlife") return (<svg {...p}><path d="M5 5h14l-7 8-7-8Z" /><path d="M12 13v6" /><path d="M8.5 19.5h7" /></svg>);
  if (name === "attractions") return (<svg {...p}><circle cx="12" cy="9.5" r="5.8" /><circle cx="12" cy="9.5" r="1.2" /><path d="M12 4.9v3.4" /><path d="M12 10.7v3.4" /><path d="M7.4 9.5h3.4" /><path d="M13.2 9.5h3.4" /><path d="M8.8 6.3l2.3 2.3" /><path d="M12.9 10.4l2.3 2.3" /><path d="M15.2 6.3l-2.3 2.3" /><path d="M11.1 10.4l-2.3 2.3" /><path d="M12 15.3 8.6 21" /><path d="M12 15.3 15.4 21" /><path d="M6.8 21h10.4" /></svg>);
  if (name === "beach") return (<svg {...p}><circle cx="12" cy="12" r="4.3" /><path d="M12 2.7v2.4" /><path d="M12 18.9v2.4" /><path d="M2.7 12h2.4" /><path d="M18.9 12h2.4" /><path d="M5.6 5.6l1.7 1.7" /><path d="M16.7 16.7l1.7 1.7" /><path d="M18.4 5.6l-1.7 1.7" /><path d="M7.3 16.7l-1.7 1.7" /></svg>);
  if (name === "hotels") return (<svg {...p}><rect x="5" y="3.8" width="14" height="17.2" rx="1.6" /><path d="M10.2 21v-4.2h3.6V21" /><path d="M8.4 7.4h1.7" /><path d="M13.9 7.4h1.7" /><path d="M8.4 11.4h1.7" /><path d="M13.9 11.4h1.7" /></svg>);
  if (name === "shopping") return (<svg {...p}><path d="M6 8h12l1 12H5L6 8Z" /><path d="M9 8V6.4a3 3 0 0 1 6 0V8" /></svg>);
  if (name === "itinerary") return (<svg {...p}><circle cx="5.5" cy="18.3" r="1.7" /><path d="M5.5 16.6 C5.5 12 17 13.6 17 9" strokeDasharray="1.5 2" /><path d="M17 3 C14.9 3 13.2 4.7 13.2 6.8 C13.2 9.5 17 12.2 17 12.2 C17 12.2 20.8 9.5 20.8 6.8 C20.8 4.7 19.1 3 17 3 Z" /><circle cx="17" cy="6.7" r="1.3" /></svg>);
  return null;
}

// Branded loading indicator: the Wayfind pin, gently pulsing.
function Loader({ label, size, pad }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: pad || "10px 2px", color: C.muted, fontSize: 13 }}>
      <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={size || 26} /></div>
      {label && <span>{label}</span>}
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

function InfoChip({ label, value }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{value}</div>
    </div>
  );
}

const PRICE_WORD = { 0: "Free", 1: "Inexpensive", 2: "Moderate", 3: "Pricey", 4: "High-end" };
function PriceMeter({ level, word }) {
  if (level == null) return null;
  if (level === 0) return <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>Free</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1 }}>
        {[1, 2, 3, 4].map((n) => (
          <span key={n} style={{ color: n <= level ? C.green : C.muted }}>$</span>
        ))}
      </span>
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
function compass(deg) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
}
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
function eventSegmentMeta(seg, genre) {
  const s = (seg || "").toLowerCase();
  const g = (genre || "").toLowerCase();
  if (g.includes("comedy")) return { icon: "😂", short: "Comedy", color: "#FBBF24" };
  if (s.includes("music")) return { icon: "🎵", short: "Concert", color: "#F472B6" };
  if (s.includes("sport")) return { icon: "⚾", short: "Sports", color: "#38BDF8" };
  if (s.includes("arts") || s.includes("theatre") || s.includes("theater")) return { icon: "🎭", short: "Theater", color: "#FF8A3D" };
  if (s.includes("film")) return { icon: "🎬", short: "Film", color: "#FBBF24" };
  if (s.includes("family")) return { icon: "👨‍👩‍👧", short: "Family", color: "#22C55E" };
  if (!s || s.includes("misc") || s.includes("undefined") || s.includes("other")) return { icon: "🎪", short: "Other", color: "#94A3B8" };
  return { icon: "🎪", short: seg || "Other", color: "#94A3B8" };
}

// Deterministic lunar phase from a known new-moon epoch. Pure math, no API, no
// fabrication: same date always yields the same phase.
function moonPhase(date) {
  const synodic = 29.530588853;
  const epochDays = Date.UTC(2000, 0, 6, 18, 14, 0) / 86400000;
  const nowDays = date.getTime() / 86400000;
  const age = (((nowDays - epochDays) % synodic) + synodic) % synodic;
  const illum = Math.round(((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2) * 100);
  let name, emoji;
  if (age < 1.85) { name = "New moon"; emoji = "🌑"; }
  else if (age < 5.54) { name = "Waxing crescent"; emoji = "🌒"; }
  else if (age < 9.23) { name = "First quarter"; emoji = "🌓"; }
  else if (age < 12.92) { name = "Waxing gibbous"; emoji = "🌔"; }
  else if (age < 16.61) { name = "Full moon"; emoji = "🌕"; }
  else if (age < 20.30) { name = "Waning gibbous"; emoji = "🌖"; }
  else if (age < 23.99) { name = "Last quarter"; emoji = "🌗"; }
  else if (age < 27.68) { name = "Waning crescent"; emoji = "🌘"; }
  else { name = "New moon"; emoji = "🌑"; }
  return { name, emoji, illum };
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
  if (has(/\b(wine|beer|brewery|cocktail|happy hour|pub|tap ?room|tasting|spirits|nightlife|club|dj|martini)\b/)) return { icon: "🍷", short: "Nightlife", color: "#F472B6" };
  if (has(/\b(food|truck|taste|culinary|bbq|brunch|dinner|chef|eats|dining|feast|pizza|seafood)\b/)) return { icon: "🍔", short: "Food", color: "#F97316" };
  if (has(/\b(trail|park|hike|outdoor|cleanup|clean-up|workday|garden|nature|beach|kayak|paddle|fishing)\b/)) return { icon: "🌳", short: "Outdoors", color: "#22C55E" };
  if (has(/\b(market|farmers|craft|vendor|flea|bazaar|artisan|swap)\b/)) return { icon: "🛒", short: "Market", color: "#2DD4BF" };
  if (has(/\b(kids|family|children|child|story ?time|teen)\b/)) return { icon: "👪", short: "Family", color: "#22C55E" };
  if (has(/\b(art|gallery|exhibit|paint|sculpt|museum|pottery)\b/)) return { icon: "🎨", short: "Arts", color: "#FF8A3D" };
  if (has(/\b(music|concert|live|band|jazz|acoustic|symphony|karaoke|open mic)\b/)) return { icon: "🎵", short: "Live", color: "#F472B6" };
  if (has(/\b(run|race|5k|10k|marathon|sport|tournament|yoga|fitness|cycling|golf)\b/)) return { icon: "🏃", short: "Active", color: "#38BDF8" };
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
      <img src={src} alt="" draggable={false} onError={() => { if (image && !bad) setBad(true); else setAlt(""); }} onLoad={(ev) => { try { if (image && !bad) { const w = ev.target && ev.target.naturalWidth; if (w && w < 640) setBad(true); } } catch (e) {} }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      {usingAlt && <div style={{ position: "absolute", bottom: 6, right: 8, fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,.85)", background: "rgba(0,0,0,.5)", padding: "2px 7px", borderRadius: 999, pointerEvents: "none" }}>{altBy ? "Photo: " + altBy + " · Google" : "via Google"}</div>}
    </>);
  }
  return <div style={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${acc}55 0%, #0D1117 100%)` }} />;
}
function EventArt({ e, seg, height }) {
  const [bad, setBad] = useState(false);
  const acc = (seg && seg.color) || C.accent;
  if (eventUseImage(e) && !bad) {
    return <img src={e.image} alt="" loading="lazy" draggable={false} onError={() => setBad(true)} onLoad={(ev) => { try { if (ev.target && ev.target.naturalWidth && ev.target.naturalWidth < 320) setBad(true); } catch {} }} style={{ width: "100%", height, objectFit: "cover", display: "block" }} />;
  }
  return (
    <div style={{ width: "100%", height, position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${acc}30 0%, #131A24 56%, #0D1117 100%)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", top: -24, right: -24, width: 110, height: 110, borderRadius: "50%", background: `radial-gradient(circle, ${acc}33 0%, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ fontSize: 42, lineHeight: 1, opacity: 0.95 }}>{seg ? seg.icon : null}</div>
      <div style={{ position: "absolute", bottom: 7, left: 10, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.7px", textTransform: "uppercase", color: acc, opacity: 0.92 }}>{seg ? seg.short : "Event"}</div>
    </div>
  );
}
function EventCard({ e, onVenue }) {
  const f = formatEventDate(e.date, e.time);
  const seg = eventCategory(e);
  const rec = recurrenceLabel(e);
  const venue = cleanVenueName(e.venue);
  const cta = eventCTA(e);
  return (
    <div style={{ display: "flex", flexDirection: "column", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden" }}>
      <div style={{ position: "relative" }}>
        <EventArt e={e} seg={seg} height={120} />
        <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(13,17,23,.85)", borderRadius: 8, padding: "3px 7px", textAlign: "center", minWidth: 36, backdropFilter: "blur(3px)" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.mo}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{f.day}</div>
        </div>
        {(e.segment || e.genre) && <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(13,17,23,.85)", color: seg.color, borderRadius: 999, padding: "3px 8px", fontSize: 10, fontWeight: 800, backdropFilter: "blur(3px)" }}>{seg.icon} {seg.short}</div>}
      </div>
      <div style={{ padding: "9px 10px 11px", display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
        {venue && (
          <button onClick={() => onVenue && onVenue()} style={{ textAlign: "left", background: "transparent", border: "none", padding: 0, marginTop: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>📍 {venue} ›</button>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5, alignItems: "center" }}>
          {rec
            ? <span style={{ fontSize: 10, fontWeight: 800, color: C.accent, background: C.adim, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>↻ {rec}</span>
            : (f.wd && <span style={{ fontSize: 11, color: C.muted }}>{f.wd}</span>)}
          {f.time && <span style={{ fontSize: 11, color: C.muted }}>{rec ? "" : "· "}{f.time}</span>}
        </div>
        {e.price && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.green, marginTop: 4 }}>{e.price}</div>}
        <div style={{ marginTop: "auto", paddingTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          {cta.show
            ? <a href={ticketUrl(e.url)} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, textDecoration: "none" }}>{cta.label}</a>
            : <span />}
          {e.source && <span style={{ fontSize: 9, color: C.muted, fontWeight: 600, opacity: 0.75 }}>{e.source}</span>}
        </div>
      </div>
    </div>
  );
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
function WorthTheDriveWidget({ place, myVote, votes, onVote }) {
  const hasVoted = !!myVote;
  const total = votes ? (votes.yes || 0) + (votes.no || 0) : 0;
  const yesPct = total > 0 ? Math.round(((votes.yes || 0) / total) * 100) : 0;
  return (
    <div style={{ background: "rgba(56,189,248,.08)", border: "1.5px solid rgba(56,189,248,.35)", borderRadius: 16, padding: "16px 16px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 22 }}>🚗</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#E2E8F0" }}>Worth the drive?</div>
          {place.distMi != null && <div style={{ fontSize: 12, color: "#64748B" }}>{place.distMi.toFixed(1)} miles from you — weigh in</div>}
        </div>
      </div>
      {!hasVoted ? (
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => onVote("yes")}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1.5px solid #22C55E", background: "rgba(34,197,94,.12)", color: "#22C55E", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
          >
            🚗 Yes, worth it
          </button>
          <button
            onClick={() => onVote("no")}
            style={{ flex: 1, padding: "13px 0", borderRadius: 12, border: "1.5px solid #64748B", background: "transparent", color: "#94A3B8", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            🤷 Not really
          </button>
        </div>
      ) : (
        <div>
          {total > 0 ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: yesPct >= 50 ? "#22C55E" : "#EF4444" }}>{yesPct}%</span>
                <span style={{ fontSize: 12, color: "#64748B" }}>say yes · {total} vote{total === 1 ? "" : "s"} total</span>
              </div>
              <div style={{ height: 9, background: "#2D3748", borderRadius: 999, overflow: "hidden", marginBottom: 10 }}>
                <div style={{ height: "100%", width: `${yesPct}%`, background: yesPct >= 50 ? "#22C55E" : "#EF4444", borderRadius: 999, transition: "width 0.6s ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span style={{ color: "#22C55E", fontWeight: 700 }}>🚗 {votes.yes || 0} say worth it</span>
                <span style={{ color: "#64748B" }}>{votes.no || 0} say not really</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 12, color: "#64748B", borderTop: "1px solid #2D3748", paddingTop: 8 }}>
                You voted: <span style={{ fontWeight: 700, color: myVote === "yes" ? "#22C55E" : "#EF4444" }}>{myVote === "yes" ? "✓ Worth the drive" : "✗ Not really"}</span>
              </div>
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "6px 0" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: myVote === "yes" ? "#22C55E" : "#94A3B8", marginBottom: 4 }}>
                {myVote === "yes" ? "🚗 You said it's worth the drive!" : "You said not really. Fair enough."}
              </div>
              <div style={{ fontSize: 12, color: "#64748B" }}>Results will show as others weigh in.</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PageInner() {
  const [screen, setScreen] = useState("suggested");
  const [cat, setCat] = useState("food");
  const [wxOpen, setWxOpen] = useState(false); // header weather forecast wheel
  const GIVEAWAY = { start: new Date(2026, 6, 3), end: new Date(2026, 9, 31, 23, 59, 59) };
  const [gwPop, setGwPop] = useState(false); // v4.28: giveaway is a timed popup, not a feed card
  useEffect(() => {
    try {
      if (!(giveawayLive() || giveawaySoon())) return;
      const st = JSON.parse(localStorage.getItem("wf_gw_pop") || "{}");
      const now = Date.now();
      if (st.entered) return;                                  // entered: never again
      if (st.dismissedAt && now - st.dismissedAt < 3 * 864e5) return; // dismissed: 3-day snooze
      if (st.shownAt && now - st.shownAt < 864e5) return;      // at most once a day
      const t = setTimeout(() => {
        setGwPop(true);
        try { localStorage.setItem("wf_gw_pop", JSON.stringify({ ...st, shownAt: Date.now() })); logEvent("giveaway_pop"); } catch (e) {}
      }, 30000);
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
    if (n >= 2 && !localStorage.getItem("wf_a2hs_dismissed")) { setA2hs(true); try { logEvent("a2hs_shown"); } catch (e) {} }
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
  const [sortBy, setSortBy] = useState("near");
  const [searchRadius, setSearchRadius] = useState(48280); // meters, ~30 miles default
  const [visibleCount, setVisibleCount] = useState(5); // explore list shows 5, then "Wayfind 5 more spots"
  const [radiusSheet, setRadiusSheet] = useState(false);
  const [pendingRadius, setPendingRadius] = useState(24140);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [sliderMi, setSliderMi] = useState(30);
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
  const [expOpenOnly, setExpOpenOnly] = useState(false);
  const [expSort, setExpSort] = useState("near");
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
  const [hookLikes, setHookLikes] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("wf_hook_likes") || "[]")); } catch { return new Set(); } });
  const [cuisineSheet, setCuisineSheet] = useState(null);
  const openHoliday = async (h) => {
    const hol = typeof h === "string" ? (Hol.holidaysFor(new Date().getFullYear()).find((x) => x.key === h) || null) : h;
    if (!hol) return;
    const content = Hol.contentFor(hol.key, hol.name);
    const theme = Hol.themeFor(hol.key);
    try { logEvent("holiday_open", null, { key: hol.key }); } catch (e) {}
    try {
      const lists = await Promise.all(content.queries.map((q) => searchNearbyPlaces(q, center).catch(() => [])));
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
      const results = await Promise.all(c.slots.map((sl) => searchNearbyPlaces(sl.q, center).catch(() => [])));
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
      setHookDetail({ id: "cur-" + kind, key: "cur-" + kind, theme: "cur-" + kind, title: title2, themeTitle: title2, label: title2, take: body2, themeBody: body2, emoji: c.emoji, places: places2, sections: sections2, presetMi: thin ? 60 : c.presetMi });
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
  const [debugOn] = useState(() => { try { return typeof window !== "undefined" && (localStorage.getItem("wf_debug") === "1" || /[?&]debug=1/.test(window.location.search)); } catch { return false; } });
  const noteRef = useRef(null);
  const [placeComments, setPlaceComments] = useState(() => { try { const c = JSON.parse(localStorage.getItem("wf_place_comments") || "{}"); const legacy = JSON.parse(localStorage.getItem("wf_place_notes") || "{}"); for (const k in legacy) { if (legacy[k] && !c[k]) c[k] = { type: "Tip", text: legacy[k] }; } for (const k in c) { const t = c[k] && c[k].type; if (t === "Insider tip") c[k].type = "Tip"; else if (t === "Recommendation") c[k].type = "Review"; } return c; } catch { return {}; } });
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
  const [hkSort, setHkSort] = useState("near");
  const [hkMi, setHkMi] = useState(60);
  const [hkDeals, setHkDeals] = useState(false);
  useEffect(() => { setHkSort((hookDetail && hookDetail.presetSort) || "near"); setHkMi((hookDetail && hookDetail.presetMi) || 60); setHkDeals(false); }, [hookDetail && hookDetail.id]);
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
  const [signals, setSignals] = useState(() => { try { if (typeof window === "undefined") return []; return loadSignals(); } catch { return []; } });
  const [liked, setLiked] = useState(() => { try { return JSON.parse(localStorage.getItem("wf_liked") || "{}"); } catch { return {}; } });
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
  const [disliked, setDisliked] = useState(() => { try { return JSON.parse(localStorage.getItem("wf_disliked") || "{}"); } catch { return {}; } });
  const [likedItems, setLikedItems] = useState(() => { try { return JSON.parse(localStorage.getItem("wf_liked_items") || "{}"); } catch { return {}; } });
  const [dislikedItems, setDislikedItems] = useState(() => { try { return JSON.parse(localStorage.getItem("wf_disliked_items") || "{}"); } catch { return {}; } });
  const [sharedItems, setSharedItems] = useState(() => { try { return JSON.parse(localStorage.getItem("wf_shared_items") || "{}"); } catch { return {}; } });
  const [sysFolder, setSysFolder] = useState(null);
  const [listMenu, setListMenu] = useState(null);
  const [renamingList, setRenamingList] = useState(null);
  const [signupOpen, setSignupOpen] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupDone, setSignupDone] = useState(() => { try { return !!localStorage.getItem("wf_signed_up"); } catch { return false; } });
  // Auth state (Supabase). Null user = signed out / no backend configured.
  const [user, setUser] = useState(null);
  const [mapMenuHidden, setMapMenuHidden] = useState(false); // map top menu collapse
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
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active && data && data.session && data.session.user) setUser(data.session.user);
      try { if (typeof window !== "undefined" && (window.location.search.indexOf("code=") >= 0 || window.location.search.indexOf("error") >= 0 || window.location.hash.indexOf("access_token") >= 0)) window.history.replaceState({}, "", window.location.pathname); } catch (e) {}
    }).catch(() => {});
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
      const res = authMode === "signup"
        ? await supabase.auth.signUp(creds)
        : await supabase.auth.signInWithPassword(creds);
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
  const [myVotes, setMyVotes] = useState(() => { try { return JSON.parse(localStorage.getItem("wf_drive_votes") || "{}"); } catch { return {}; } });
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
    try { localStorage.setItem("wf_intro_seen", "1"); } catch (e) {}
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
    setExpOpenOnly(false);
    setExpSort("near");
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
  const renderUniqueFinds = () => (
    <div style={{ margin: "14px 0 4px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: C.light }}>Unique finds near you</div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: ".5px", textTransform: "uppercase" }}>curated</div>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
        {Gems.GEMS.map((g) => (
          <div key={g.key} onClick={() => openGemPlace(g)} role="button" style={{ minWidth: 218, maxWidth: 218, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 13px", cursor: "pointer", flexShrink: 0 }}>
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

  // World Cup hero card. topSlot=true renders only on match days (fixed
  // knockout calendar); topSlot=false renders mid-feed on off days.
  const renderWorldCupCard = (topSlot) => { const _w = Hol.worldCup(new Date()); if (!_w) return null; if (Hol.worldCupDaysToNext(new Date()) > 2) return null; if (!!topSlot !== Hol.worldCupMatchToday(new Date())) return null; const _wc = Hol.themeFor(_w.key); const _wct = Hol.contentFor(_w.key, _w.name); return (
                      <div onClick={() => openHoliday(_w)} role="button" style={{ cursor: "pointer", borderRadius: 18, padding: "18px 16px 16px", marginBottom: 12, background: _wc.grad, border: `1px solid ${_wc.border}`, boxShadow: "0 10px 28px rgba(0,0,0,.42)", position: "relative", overflow: "hidden" }}>
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
  // PostHog: product analytics + session replay. No-ops until NEXT_PUBLIC_POSTHOG_KEY is set.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!key || typeof window === "undefined" || window._phInit) return;
    window._phInit = true;
    import("posthog-js").then(({ default: ph }) => { try { ph.init(key, { api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com", capture_pageview: true, capture_pageleave: true, autocapture: true }); window.posthog = ph; } catch (e) {} }).catch(() => {});
  }, []);
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
    if (!p || !p.id) return;
    const next = { ...sharedItems, [p.id]: { place: p, ts: Date.now() } };
    setSharedItems(next);
    try { localStorage.setItem("wf_shared_items", JSON.stringify(next)); } catch {}
    svFolderUpsert("Shared", p);
  }
  function toggleLike(e, p) {
    e.stopPropagation();
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
    fetch("/api/viator/tours?q=" + encodeURIComponent(q) + "&count=3")
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
      let list = data && Array.isArray(data.events) ? data.events : [];
      const nm = (p.name || "").toLowerCase();
      const matches = list.filter((e) => {
        const v = (e.venue || "").toLowerCase();
        return v && (v.includes(nm) || nm.includes(v));
      });
      setVenueEvents((matches.length ? matches : list).slice(0, 8));
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
        body: JSON.stringify({ lat: center.lat, lng: center.lng, city: locName, radius: Math.round((searchRadius || 24140) / 1609.34) }),
      });
      const data = await res.json();
      setEventsUnavailable(!!data.unavailable);
      setEventsError(!!data.error);
      setEventCounts(data && data.counts ? data.counts : null);
      try { if (process.env.NODE_ENV !== "production" && data && data.counts) console.log("[wayfind events]", data.counts, "total", (data.events || []).length); } catch (e) {}
      const evs = data && Array.isArray(data.events) ? data.events : [];
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
      const { data } = await supabase.from("offers").select("*");
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
        let results;
        if (sub === "all" && _subs.length) {
          let _second;
          if (cat === "food") { const _h = new Date().getHours(); const _w = _h < 11 ? "breakfast" : _h < 15 ? "lunch" : _h < 21 ? "dinner" : "dessert"; _second = (_subs.find((x) => x.id === _w) || _subs[0]).id; }
          else { _second = _subs[0].id; }
          const _b = await Promise.all([searchPlaces(cat, "all", ctr, searchRadius, vibe).catch(() => []), searchPlaces(cat, _second, ctr, searchRadius, vibe).catch(() => [])]);
          const _seen = new Set(); results = [];
          _b.forEach((arr) => (arr || []).forEach((pp) => { if (pp && pp.id && !_seen.has(pp.id)) { _seen.add(pp.id); results.push(pp); } }));
        } else {
          results = await searchPlaces(cat, sub, ctr, searchRadius, vibe);
        }
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
  useEffect(() => {
    if (screen !== "experience" || !activeBadge || !center) return;
    const exp = EXPERIENCES[activeBadge];
    if (!exp) return;
    let cancelled = false;
    (async () => {
      setExpLoading(true);
      try {
        // v4.41: attraction/stay/show experiences pull from a wider radius so the
        // Orlando-area gems (an hour north of the launch market) actually appear,
        // instead of an empty or two-item list. Food stays local.
        const ATTRACTION_KEYS = ["family", "entertainment", "stays", "shows", "budget", "instagram", "nature", "museum"];
        const radius = ATTRACTION_KEYS.includes(activeBadge) ? 110000 : 48000;
        let raw = await searchPlaces(exp.cat || "food", "all", { lat: center.lat, lng: center.lng }, radius, "all", exp.keyword || "");
        const sortFit = (arr) => arr.slice().sort((a, b) => ((b.wfScore || 0) + featuredBoost(b.name)) - ((a.wfScore || 0) + featuredBoost(a.name)));
        let results;
        if (exp.filter) {
          const passed = raw.filter(exp.filter);
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
        results = results.slice(0, 30);
        if (!cancelled) { setExpPlaces(results); loadBlurbs(results); fetchMemberSignals(supabase, results).then((sig) => { if (!cancelled && sig) setExpPlaces((cur) => withMemberSignal(cur, sig)); }); }
      } catch {
        if (!cancelled) setExpPlaces([]);
      } finally {
        if (!cancelled) setExpLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeBadge, center]);

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
  useEffect(() => {
    try {
      const sp0 = new URLSearchParams(window.location.search);
      if (sp0.get("intro") === "1") { setIntroOpen(true); return; }
      if (sp0.get("q")) { /* deep link owns this visit */ } else if (!localStorage.getItem("wf_intro_seen")) {
        const t = setTimeout(() => setIntroOpen(true), 120);
        return () => clearTimeout(t);
      }
    } catch (e) {}
  }, []);

  // v4.58: build number leaves the visible UI (launch polish) but stays
  // machine-readable for deploy verification and diagnostics.
  useEffect(() => { try { window.__WF_BUILD = BUILD_ID; document.documentElement.setAttribute("data-wf-build", BUILD_ID); } catch (e) {} }, []);

  // v4.55: /events, /map, /favorites, /itinerary routes hand off here.
  useEffect(() => {
    try {
      const go = new URLSearchParams(window.location.search).get("go");
      if (!go) return;
      const valid = { events: "events", map: "map", saved: "saved", itinerary: "itinerary" };
      if (valid[go]) setScreen(valid[go]);
      const u = new URL(window.location.href); u.searchParams.delete("go");
      window.history.replaceState({}, "", u.pathname + (u.search || "") + (u.hash || ""));
    } catch (e) {}
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
        const results = await searchPlaces(scat, "all", { lat: center.lat, lng: center.lng }, 48000, "all", skeyword);
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
        const evs = (data && data.events) || [];
        if (!cancelled) {
          setForyouEvents(evs.slice(0, 8));
          setLibraryEvents(evs.filter((e) => e && e.civic).slice(0, 6));
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
    toggleHookLike(hookId);
    const h = (hookCards || []).find((x) => x.id === hookId);
    if (!h) return;
    const allSrc = [...(suggested || []), ...places].filter(Boolean);
    const pls = placesForHook(h, allSrc);
    if (pls.length) saveHookList(h, pls);
  }
  const isSaved = (id) => Object.values(lists).some((l) => l.places.some((p) => p.id === id));

  function createList() {
    const name = newName.trim();
    if (!name) return;
    const id = "list_" + Date.now();
    setLists((prev) => ({ ...prev, [id]: { id, name, emoji: newEmoji, places: [] } }));
    setNewName(""); setNewEmoji("⭐"); setNewListOpen(false);
  }
  function deleteList(id) {
    if (id === "favorites") return;
    setLists((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setActiveList(null);
  }
  function renameList() {
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
    viewBase = _distFiltered.sort((a, b) => ((b.rating || 0) - (a.rating || 0)) || ((b.reviews || 0) - (a.reviews || 0)));
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
            <SortControl sortBy={sortBy} onSort={(k) => setSortBy(k)} mi={sliderMi} onMi={(m) => { setSliderMi(m); const mm = Math.round(m * 1609.34); if (mm > (searchRadius || 0)) setSearchRadius(mm); }} where={locName ? locName.split(",")[0] : "you"} dealsAvailable={Object.keys(offers).length > 0} dealsOnly={dealsOnly} onDeals={setDealsOnly} />
          </div>
          <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingTop: 10, paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
            {HOME_CHIPS.map((k) => { const e = EXPERIENCES[k]; if (!e) return null; return (
              <button key={k} onClick={() => openExperience(k)} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 13px", borderRadius: 999, border: `1.5px solid ${C.border}`, background: "transparent", color: C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                <span>{e.icon}</span><span>{cityFix(e.label)}</span>
              </button>
            ); })}
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
          <div style={{ fontSize: 40, marginBottom: 12 }}>{CAT_ICONS[cat]}</div>
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

  return (
    <div style={shell}>
    <div style={{ ...wrap, maxWidth: isDesktop ? 1040 : 480 }}>
      <style>{`@keyframes wfpulse{0%,100%{transform:scale(.8);opacity:.45}50%{transform:scale(1.08);opacity:1}}@keyframes wfdot{0%,80%,100%{opacity:.25}40%{opacity:1}}@keyframes wfbob{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-3px) scale(1.06)}}`}</style>
      {/* Header */}
      <div style={{ background: C.panel, borderBottom: `1px solid ${C.border}`, padding: screen === "map" ? "8px 12px" : "12px 14px", paddingTop: screen === "map" ? "max(8px, env(safe-area-inset-top))" : "max(12px, env(safe-area-inset-top))", flexShrink: 0, position: "relative", zIndex: 20 }}>
        {screen !== "map" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span onClick={openSuggested} style={{ position: "relative", display: "inline-block", cursor: "pointer" }}>
              <img src="/wordmark.png?v=2" alt="wayfind" style={{ height: 34, width: "auto", display: "block" }} />
              <span style={{ position: "absolute", left: LOGO_PIN.left, top: LOGO_PIN.top, pointerEvents: "none" }}><GlowPin size={LOGO_PIN.size} /></span>
            </span>
            {locName && <span style={{ fontSize: 13, fontWeight: 400, color: C.muted, marginLeft: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {locName}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {weather && (weather.feels != null || weather.temp != null) && (
              <button onClick={() => setWxOpen((v) => !v)} aria-label="Weather forecast" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: C.text, cursor: "pointer", padding: "2px 4px" }}>
                <span style={{ fontSize: 18 }}>{(() => { try { if (isNightNow(weather)) { const im = weather.img || ""; if (im === "sunny" || im === "partly") return moonPhase(new Date()).emoji; } } catch (e) {} return weather.icon; })()}</span>
                <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", lineHeight: 1.05 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{weather.feels != null ? weather.feels : weather.temp}°</span>
                  {weather.label ? <span style={{ fontSize: 8.5, fontWeight: 600, color: C.muted }}>{weather.label}</span> : null}
                </span>
                <span style={{ fontSize: 9, color: C.muted, transform: wxOpen ? "rotate(180deg)" : "none", transition: "transform .25s ease", marginLeft: 1 }}>▼</span>
              </button>
            )}
            <button onClick={() => { setIntroSel([]); setIntroOpen(true); try { logEvent("intro_reopen", null, { src: "header" }); } catch (e) {} }} aria-label="Find my vibe" title="Find my vibe" style={{ flexShrink: 0, width: 33, height: 33, borderRadius: 999, border: `1px solid ${C.accent}`, background: C.adim, color: C.accent, fontSize: 15, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", marginRight: 7 }}>✨</button>
            {supabase && (user ? (
              <button onClick={() => setAccountOpen(true)} aria-label="Account" title={user.email || "Signed in"} style={{ flexShrink: 0, width: 34, height: 34, borderRadius: "50%", border: `1px solid ${C.border}`, background: C.card, color: C.accent, fontSize: 14, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" }}>{(user.email || "?").slice(0, 1)}</button>
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
                const hi = hourIcon(h.code, h.day, h.ms);
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
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitSearch()}
              onBlur={() => { setTimeout(() => setSuggestions([]), 150); if (screen === "map") setTimeout(() => setMapSearchOpen(false), 220); }}
              placeholder="Search a place or city"
              style={{ width: "100%", boxSizing: "border-box", height: 48, padding: "0 14px 0 38px", background: C.card, border: `1.5px solid ${C.border}`, borderRight: "none", borderRadius: "14px 0 0 14px", color: C.text, fontSize: 15, outline: "none" }}
            />
            {suggestions.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 10px 30px rgba(0,0,0,.5)", zIndex: 50 }}>
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                    style={{ padding: "11px 14px", fontSize: 14, color: C.text, borderBottom: i < suggestions.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                  >
                    <span style={{ color: s.kind === "place" ? C.accent : C.muted, fontSize: 16 }}>{s.kind === "place" ? iconForPlace({ name: s.text, types: s.types || [] }) : "📍"}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</div>
                      {s.kind === "place" && <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>Go to this place</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={submitSearch} aria-label="Wayfind it" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 54, height: 48, background: "linear-gradient(180deg, #FB923C 0%, #F97316 52%, #EA580C 100%)", border: "none", borderRadius: "0 14px 14px 0", color: "#fff", fontSize: 22, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 10px rgba(249,115,22,.4)" }}>→</button>
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

      {/* Category tabs (Explore + Map). Hidden on home, where the app-tile grid replaces it. */}
      {screen !== "saved" && screen !== "shared" && screen !== "events" && screen !== "experience" && screen !== "surprise" && screen !== "suggested" && screen !== "itinerary" && (
        screen === "map" ? null : (
          <div style={{ display: "flex", gap: 7, padding: "10px 14px", background: C.panel, flexShrink: 0, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <button key="surprise" onClick={openSurprise} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 22, border: `1.5px solid ${C.purple}`, background: screen === "surprise" ? C.purple : "transparent", color: screen === "surprise" ? "#0D1117" : C.purple, fontSize: 13.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>🎁 Surprise Me</button>
            {CATEGORIES.map((c) => {
              const cc = CAT_COLOR[c.id] || { c: C.accent, dim: C.adim };
              const on = cat === c.id && screen !== "surprise" && screen !== "suggested";
              return (
                <button key={c.id} onClick={() => { pickCat(c.id); }} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 22, border: `1.5px solid ${on ? cc.c : C.border}`, background: on ? cc.dim : "transparent", color: on ? cc.c : C.light, fontSize: 13.5, fontWeight: on ? 700 : 600, cursor: "pointer", whiteSpace: "nowrap" }}>{c.label}</button>
              );
            })}
          </div>
        )
      )}

      {/* Sub-filter row. v3.8: Explore shows it as 4-across tiles; on the Map it is moved onto the map as a bottom overlay (see map render below). */}
      {screen === "explore" && subs.length > 0 && (
        <div style={{ display: "flex", gap: 7, padding: "2px 14px 10px", background: C.panel, flexShrink: 0, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          {subs.map((s) => (
            <button key={s.id} onClick={() => pickSub(s.id)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 999, border: `1.5px solid ${sub === s.id ? C.accent : C.border}`, background: sub === s.id ? C.accent : C.card, color: sub === s.id ? "#fff" : C.light, fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{s.label}</button>
          ))}
        </div>
      )}

      {/* Body */}
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: screen === "map" ? "hidden" : "auto", padding: screen === "map" ? 0 : "12px 12px calc(48px + env(safe-area-inset-bottom))" }}>
        <>
            {screen === "explore" && <div style={{ maxWidth: isDesktop ? 760 : undefined, margin: isDesktop ? "0 auto" : undefined }}>{exploreList}</div>}
            {screen === "map" && (() => {
              const dateChips = [];
              const now = new Date();
              for (let i = 0; i < 14; i++) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
                const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                dateChips.push({ value, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], day: d.getDate() });
              }
              let mapEvents = [];
              if (mapMode === "events") {
                const src = (events || []).filter((e) => e.lat != null && e.lng != null && (mapDate === "all" || e.date === mapDate));
                const seen = new Set();
                for (const e of src) { const k = `${e.lat.toFixed(3)},${e.lng.toFixed(3)}`; if (!seen.has(k)) { seen.add(k); mapEvents.push(e); } }
              }
              const tchip = (on) => ({ flexShrink: 0, minWidth: 44, padding: "5px 9px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "center", background: on ? C.accent : "transparent", color: on ? "#fff" : C.light, fontWeight: 700 });
              return (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 30, padding: "8px 10px 0" }}>
                    <div style={{ borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,.45)", background: "rgba(16,20,27,.94)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
                      {mapMenuHidden ? (
                        <button onClick={() => { setMapMenuHidden(false); try { logEvent("map_menu", null, { hidden: false }); } catch (e) {} }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "9px 0", borderRadius: 14, border: `1px solid ${C.border}`, background: "rgba(22,27,34,.9)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", color: C.light, fontSize: 12.5, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(0,0,0,.4)" }}>
                          <span>{(() => { const c = CATEGORIES.find((x) => x.id === cat); return mapBrowse && c ? c.label : "Browse categories"; })()}</span>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                        </button>
                      ) : (<>
                      <CategoryMenu activeCat={mapBrowse ? cat : null} sub={sub} onCat={(id, label) => { setMapBrowse(true); try { logEvent("intent_chip", null, { intent: label, layer: 1, src: "map" }); } catch (e) {} if (cat !== id || !mapBrowse) { setCat(id); setSub("all"); setVibe("all"); } }} onSub={(v) => setSub(v)} trailing={<button onClick={() => setMapSearchOpen(true)} aria-label="Search" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "8px 3px", borderRadius: 12, background: "transparent", border: "1px solid transparent", cursor: "pointer", flex: 1, minWidth: 0 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.2" /><path d="M20 20l-4.4-4.4" /></svg><span style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, textAlign: "center", lineHeight: 1.12 }}>Search</span></button>} />
                      <button onClick={() => { setMapMenuHidden(true); try { logEvent("map_menu", null, { hidden: true }); } catch (e) {} }} aria-label="Hide menu" style={{ display: "block", margin: "2px auto 0", padding: "3px 30px", background: "transparent", border: "none", color: C.muted, cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 15l6-6 6 6" /></svg>
                      </button>
                      </>)}
                    </div>
                  </div>
                  <MapView places={mapMode === "events" ? [] : (mapMode === "fifa" ? (() => { const seen = new Set(); const pool = [...(mapPool || []), ...(suggested || []), ...(places || [])].filter((q) => q && q.id && !seen.has(q.id) && seen.add(q.id)); return pool.map((q) => [q, Hol.fitFor("worldcup", q)]).filter((x) => x[1] >= 8).map((x) => [x[0], x[1] + featuredBoost(x[0].name) + (x[0].wfScore || 50)]).sort((a, b) => b[1] - a[1]).slice(0, 12).map((x) => x[0]); })() : (mapBrowse ? view : (() => { const seen = new Set(); const pool = [...(mapPool || []), ...(suggested || []), ...(places || [])].filter((q) => q && q.id && !seen.has(q.id) && seen.add(q.id)); return pool.map((q) => [q, (q.wfScore || 50) + featuredBoost(q.name) + tasteBoost(q) + communityBoost(q) - (liked && liked[q.id] ? 8 : 0)]).sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]); })()))} events={mapEvents} center={center} category={cat} deviceLoc={deviceLoc} focus={mapFocus} onSelect={(p) => { setMapPreview(p); setMapDrawer(false); try { logEvent("map_pin_selected", p, {}); } catch (e) {} }} onSelectEvent={(e) => { setMapPreview(null); setEventPreview(e); }} />
                  <div style={{ position: "absolute", top: 212, left: 12, zIndex: 5, display: "flex", flexDirection: "column", background: "rgba(22,27,34,.82)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
                    {Hol.worldCup(new Date()) ? <button onClick={() => setMapMode(mapMode === "fifa" ? "places" : "fifa")} style={{ padding: "7px 13px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "fifa" ? C.accent : "transparent", color: mapMode === "fifa" ? "#fff" : C.light }}>⚽ FIFA</button> : null}
                    <button onClick={() => { if (mapMode === "events") { setMapMode("places"); } else { setMapMode("events"); if (!events) loadEvents(); } }} style={{ padding: "7px 15px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "events" ? C.accent : "transparent", color: mapMode === "events" ? "#fff" : C.light }}>🎟️ Events</button>
                  </div>
                  {mapMode === "places" && (
                    <button onClick={toggleCompass} aria-label="Compass" title="Compass" style={{ position: "absolute", top: 292, left: 12, zIndex: 5, width: 42, height: 42, borderRadius: "50%", background: compassOn ? C.accent : "rgba(22,27,34,.82)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: `1px solid ${C.border}`, boxShadow: "0 4px 16px rgba(0,0,0,.45)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <span ref={compassNeedleRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1, transition: "transform .15s linear", willChange: "transform" }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: compassOn ? "#fff" : C.accent }}>N</span>
                        <svg width="12" height="16" viewBox="0 0 12 16"><path d="M6 0 L11 9 L6 6.5 L1 9 Z" fill={compassOn ? "#fff" : "#F97316"} /><path d="M6 16 L11 9 L6 11.5 L1 9 Z" fill="rgba(255,255,255,.35)" /></svg>
                      </span>
                    </button>
                  )}
                  {mapMode === "places" && (
                    <div style={{ position: "absolute", bottom: 118, right: 12, zIndex: 5, background: "rgba(22,27,34,.82)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", border: `1px solid ${C.border}`, borderRadius: 12, padding: "8px 10px", boxShadow: "0 4px 16px rgba(0,0,0,.45)", display: "flex", flexDirection: "column", gap: 5 }}>
                      {[["#FBBF24", "Top pick"], ["#4C8DFF", "Open"], ["#5B6675", "Closed"]].map((row) => (
                        <div key={row[1]} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ width: 9, height: 9, borderRadius: "50%", background: row[0], flexShrink: 0, boxShadow: "0 0 0 1px rgba(0,0,0,.3)" }} />
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: C.light, whiteSpace: "nowrap" }}>{row[1]}</span>
                        </div>
                      ))}
                      <div style={{ marginTop: 3, paddingTop: 5, borderTop: `1px solid ${C.border}`, fontSize: 9.5, fontWeight: 700, color: C.muted, whiteSpace: "nowrap" }}>Numbered by rank</div>
                    </div>
                  )}
                  {mapMode === "events" && (
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, zIndex: 5, padding: "0 12px" }}>
                      {!eventsLoading && !eventsUnavailable && (
                        <div style={{ fontSize: 11.5, color: "#fff", fontWeight: 700, textAlign: "center", marginBottom: 6, textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>{mapEvents.length} venue{mapEvents.length === 1 ? "" : "s"}{mapDate === "all" ? " coming up" : " that day"}</div>
                      )}
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", background: "rgba(13,17,23,.9)", border: `1px solid ${C.border}`, borderRadius: 14, padding: 8, WebkitOverflowScrolling: "touch" }}>
                        <button onClick={() => setMapDate("all")} style={tchip(mapDate === "all")}><div style={{ fontSize: 10, opacity: 0.85 }}>Any</div><div style={{ fontSize: 13 }}>All</div></button>
                        {dateChips.map((d) => (
                          <button key={d.value} onClick={() => setMapDate(d.value)} style={tchip(mapDate === d.value)}><div style={{ fontSize: 10, opacity: 0.85 }}>{d.top}</div><div style={{ fontSize: 13 }}>{d.day}</div></button>
                        ))}
                      </div>
                      {eventsUnavailable && <div style={{ fontSize: 11.5, color: "#fff", textAlign: "center", marginTop: 6, textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>Add a Ticketmaster key in Vercel to switch events on.</div>}
                    </div>
                  )}
                  {mapMode !== "events" && mapPreview && (() => {
                    const mp = mapPreview;
                    const sl = scoreLabel(mp.wfScore);
                    const opensLater = liveOpen(mp) === false && mp.nextOpen && mp.nextOpen.today;
                    const openList = (view || []).filter((x) => x && x.openNow === true && x.distMi != null);
                    const closestOpen = openList.length ? openList.reduce((a, b) => (b.distMi < a.distMi ? b : a)) : null;
                    let tag = null;
                    if (closestOpen && closestOpen.id === mp.id) tag = { t: "Closest open spot", c: C.green };
                    else if (mp.distMi != null && mp.distMi >= 25 && (mp.rating || 0) >= 4.5) tag = { t: "Worth the drive", c: C.gold };
                    return (
                      <div style={{ position: "absolute", left: 12, right: 12, bottom: 22, zIndex: 6 }}>
                        <div style={{ position: "relative", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 34px rgba(0,0,0,.6)" }}>
                          <div onClick={() => openDetail(mp)} style={{ display: "flex", cursor: "pointer", minWidth: 0 }}>
                            <FallbackImg src={mp.photo} icon="📍" style={{ width: 96, height: 96, objectFit: "cover", flexShrink: 0, display: "block" }} />
                            <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 22 }}>{mp.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
                                {sl && <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{sl.word}</span>}
                                {mp.rating && <span style={{ color: "#F59E0B", fontSize: 12 }}>★ {mp.rating}</span>}
                                {liveOpen(mp) === true && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>Open</span>}
                                {liveOpen(mp) === false && <span style={{ fontSize: 11.5, fontWeight: 700, color: opensLater ? C.gold : C.red }}>{opensLater ? mp.nextOpen.label : "Closed"}</span>}
                                {mp.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {mp.distMi.toFixed(1)} mi</span>}
                                {mp.distMi != null && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.light }}>· ≈ {Math.max(4, Math.round((mp.distMi * 1.3 / 28) * 60) + 3)} min drive</span>}
                              </div>
                              {tag && <div style={{ fontSize: 11, fontWeight: 800, color: tag.c, marginTop: 5 }}>{tag.t}</div>}
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, marginTop: tag ? 4 : 5 }}>See details →</div>
                            </div>
                          </div>
                          <button onClick={(ev) => { ev.stopPropagation(); setMapPreview(null); }} aria-label="Dismiss" style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      </div>
                    );
                  })()}
                  {mapMode === "events" && eventPreview && (() => {
                    const ev = eventPreview;
                    const dl = ev.date ? (() => { try { return new Date(ev.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch { return ev.date; } })() : "";
                    return (
                      <div style={{ position: "absolute", left: 12, right: 12, bottom: 22, zIndex: 6 }}>
                        <div style={{ position: "relative", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 34px rgba(0,0,0,.6)" }}>
                          <div onClick={() => openVenue(ev)} style={{ display: "flex", cursor: "pointer", minWidth: 0 }}>
                            <FallbackImg src={ev.image} icon="🎫" style={{ width: 96, height: 96, objectFit: "cover", flexShrink: 0, display: "block" }} />
                            <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 22 }}>{ev.name}</div>
                              {(dl || ev.time) && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, marginTop: 4 }}>{dl}{ev.time ? " · " + ev.time : ""}</div>}
                              {ev.venue && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {ev.venue}</div>}
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.accent, marginTop: 5 }}>View venue →</div>
                            </div>
                          </div>
                          <button onClick={(ev2) => { ev2.stopPropagation(); setEventPreview(null); }} aria-label="Dismiss" style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      </div>
                    );
                  })()}
                  {mapMode === "places" && !mapPreview && view.length > 0 && (
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 7, background: C.panel, borderTop: `1px solid ${C.border}`, borderRadius: "16px 16px 0 0", boxShadow: "0 -8px 30px rgba(0,0,0,.5)", maxHeight: mapDrawer ? "60%" : 48, transition: "max-height .26s cubic-bezier(.4,0,.2,1)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <button onClick={() => setMapDrawer((o) => !o)} aria-label={mapDrawer ? "Collapse list" : "Expand list"} style={{ flexShrink: 0, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "7px auto 5px" }} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, paddingBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{view.length} place{view.length === 1 ? "" : "s"} {sortBy === "near" ? "nearest first" : "ranked by fit"}</span>
                          <span style={{ fontSize: 12, color: C.accent, fontWeight: 800 }}>{mapDrawer ? "▾" : "▴"}</span>
                        </div>
                      </button>
                      {mapDrawer && (
                        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 12px 16px" }}>
                          {view.map((p, i) => (
                            <div key={p.id} onClick={() => { setMapPreview(p); setMapFocus({ lat: p.lat, lng: p.lng, ts: Date.now() }); setMapDrawer(false); }} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderBottom: i < view.length - 1 ? `1px solid ${C.border}` : "none", cursor: "pointer" }}>
                              <div style={{ flexShrink: 0, width: 24, textAlign: "center", fontSize: 13, fontWeight: 800, color: C.accent }}>{i + 1}</div>
                              <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0, display: "block" }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                                  {p.rating && <span style={{ color: "#F59E0B", fontSize: 11.5 }}>★ {p.rating}</span>}
                                  {liveOpen(p) === true && <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>Open</span>}
                                  {liveOpen(p) === false && <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>Closed</span>}
                                  {p.distMi != null && <span style={{ fontSize: 11, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                                </div>
                              </div>
                              <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
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
          const feedListS = sortBy === "rated" ? feedList0P.slice().sort((a, b) => ((b.rating || 0) - (a.rating || 0)) || ((b.reviews || 0) - (a.reviews || 0))) : sortBy === "price" ? feedList0P.slice().sort((a, b) => (((a.price_level ?? a.priceLevel ?? 9)) - ((b.price_level ?? b.priceLevel ?? 9))) || ((b.rating || 0) - (a.rating || 0))) : feedList0P;
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
            <div style={isDesktop ? { display: "flex", gap: 28, alignItems: "flex-start", maxWidth: 1000, margin: "0 auto" } : {}}>
              {/* LEFT column on desktop: intent chips + hooks + feed */}
              <div style={{ flex: 1, minWidth: 0, maxWidth: isDesktop ? 600 : undefined }}>
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
                    <SortControl sortBy={sortBy} onSort={(k) => setSortBy(k)} mi={sliderMi} onMi={(m) => { setSliderMi(m); const mm = Math.round(m * 1609.34); if (mm > (searchRadius || 0)) setSearchRadius(mm); }} where={locName ? locName.split(",")[0] : "you"} dealsAvailable={Object.keys(offers).length > 0} dealsOnly={dealsOnly} onDeals={setDealsOnly} />
                  </div>
                  {(() => { const _cm = Culture.resolveMetro(locName); return _cm ? <AreaInsight metro={_cm} cat={browseCat} town={locName ? locName.split(",")[0] : null} onFind={(q) => submitSearch(q, { miles: 45 })} /> : null; })()}
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
                const diceHook = { id: "dice-roll", accent: C.purple, emoji: "🎲", label: "Take a chance", hook: "I want to take a chance.", highlightWord: "chance", subtitle: "Roll it — Wayfind lands you somewhere great nearby", cta: "🎲 Roll the dice →" };
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
                    return { id: "exp-" + a.key, accent: THEME_COLOR[a.key] || m.accent || C.accent, emoji: a.e.icon, label: cityFix(a.e.label), theme: a.key, fetchKey: a.key, highlightWord: m.hl, hook: m.hook, subtitle: m.sub, cta: m.cta, metaLine: null, themeTitle: cityFix(a.e.title), themeBody: a.e.lead, places: null };
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
                      <div style={{ display: "flex", alignItems: "center", gap: 9, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 12px", marginBottom: 12 }}>
                        <span style={{ fontSize: 15 }}>📍</span>
                        <div style={{ flex: 1, fontSize: 12, color: C.light, lineHeight: 1.4 }}>Location is approximate{locName ? " — showing " + locName.split(",")[0] : ""}. <span onClick={() => { try { const el = document.querySelector('input[placeholder="Search a place or city"]'); if (el) { el.focus(); el.scrollIntoView({ block: "center" }); } } catch (e) {} }} style={{ color: C.accent, fontWeight: 800, cursor: "pointer" }}>Search your city</span></div>
                        <button onClick={() => setLocBannerGone(true)} aria-label="Dismiss" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 14, cursor: "pointer", padding: 2 }}>✕</button>
                      </div>
                    )}
                    {heroPlace && (<>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, margin: "2px 2px 8px" }}>Best move right now</div>
                                            {gwPop && (giveawayLive() || giveawaySoon()) && (
                        <div onClick={() => gwPopClose("x")} style={{ position: "fixed", inset: 0, zIndex: 88, background: "rgba(0,0,0,.62)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
                          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 400, borderRadius: 20, padding: "18px 17px 16px", background: "linear-gradient(135deg, #1B1405 0%, #2A1F08 60%, #1B1405 100%)", border: "1px solid rgba(232,184,75,.55)", boxShadow: "0 24px 60px rgba(0,0,0,.6)", position: "relative", overflow: "hidden" }}>
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
                          <div onClick={(e) => e.stopPropagation()} style={{ background: C.panel, borderRadius: "18px 18px 0 0", width: "100%", maxHeight: "82vh", overflowY: "auto", padding: "18px 18px calc(20px + env(safe-area-inset-bottom))" }}>
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
                        <div onClick={() => openHoliday(_h)} role="button" style={{ cursor: "pointer", borderRadius: 18, padding: "18px 16px 16px", marginBottom: 12, background: _c.grad, border: `1px solid ${_c.border}`, boxShadow: "0 10px 28px rgba(0,0,0,.42)", position: "relative", overflow: "hidden" }}>
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
                      {(() => {
                        const _hr = new Date().getHours(); const _eve = _hr >= 14 || _hr < 5;
                        const _items = _eve
                          ? [["food", "\uD83C\uDF7D\uFE0F", "Top 10 Food", "Breakfast, lunch, dinner, and a quick bite, ranked.", C.accent], ["nightlife", "\uD83C\uDF78", "Top 10 Nightlife", "Bars and lounges, live music, and late-night eats.", C.pink], ["events", "\uD83C\uDF9F\uFE0F", "Events tonight", "What is actually happening near you tonight.", C.blue]]
                          : [["food", "\uD83C\uDF7D\uFE0F", "Top 10 Food", "Breakfast, lunch, dinner, and a quick bite, ranked.", C.accent], ["experiences", "\uD83C\uDFA2", "Top 10 Experiences", "Theme parks, top attractions, and bookable tours.", C.purple], ["shopping", "\uD83D\uDECD\uFE0F", "Top 10 Shopping", "The malls, outlets, and boutiques that rate best.", C.green]];
                        return (
                          <div style={{ marginBottom: 16, background: C.card, border: "1px solid " + C.border, borderRadius: 18, overflow: "hidden", boxShadow: "0 4px 20px rgba(0,0,0,.32)" }}>
                            <div style={{ padding: "14px 15px 10px" }}>
                              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 5 }}>Top 10s near you</div>
                              <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.45 }}>Pick by where you want to go. Each one opens the ranked Top 10 for that category near you, with no ads and no paid placement.</div>
                            </div>
                            {_items.map(([k, ic, lb, desc, col]) => (
                              <button key={k} onClick={(e) => { e.stopPropagation(); if (k === "events") { setScreen("events"); } else { openCurated(k); } }} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: "1px solid " + C.border, padding: "12px 15px", cursor: "pointer" }}>
                                <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 38, height: 38, borderRadius: 11, fontSize: 19, background: col + "1F", border: "1px solid " + col + "59" }}>{ic}</span>
                                <span style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ display: "block", fontSize: 14.5, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{lb}</span>
                                  <span style={{ display: "block", fontSize: 12, color: C.muted, lineHeight: 1.35, marginTop: 2 }}>{desc}</span>
                                </span>
                                <span style={{ flexShrink: 0, color: col, fontSize: 20, fontWeight: 700 }}>{"\u203A"}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </>)}
                    {restExp.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.7, textTransform: "uppercase", color: C.muted, margin: "6px 2px 8px" }}>More ways to explore</div>}
                    {restExp.map((a) => { const hk = mkHook(a); return <HookSolo key={a.key} h={hk} place={a.place} collage={!a.place ? expCollage(a.key) : undefined} hideLike hideShare={!a.place} onOpen={(h) => { if (h && h.fetchKey) { try { logEvent("intent_chip", null, { intent: h.label, src: "home_revenue_hero" }); } catch (e) {} } openHook(h); }} onShare={() => a.place && shareHook(hk, a.place)} />; })}

                    <HookSolo h={diceHook} place={null} collage={dicePhotos} liked={false} onOpen={() => { try { logEvent("dice_card", null, { to: "pick" }); } catch (e) {} setMenuSheet("pick"); }} />
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
              {!browseCat && !isDesktop && Array.isArray(foryouEvents) && foryouEvents.length === 0 && (
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
              {!browseCat && !isDesktop && foryouEvents && foryouEvents.length > 0 && (() => {
                const evs = dedupeEvents(foryouEvents, true);
                const relLabel = (e) => { if (!e || !e.date) return null; const ed = new Date(e.date + "T00:00:00"); const t0 = new Date(); t0.setHours(0, 0, 0, 0); const diff = Math.round((ed - t0) / 86400000); if (diff <= 0) return "Tonight"; if (diff === 1) return "Tomorrow"; if (diff >= 0 && diff <= 6 && (ed.getDay() === 6 || ed.getDay() === 0)) return "This weekend"; return null; };
                const withImg = evs.filter((e) => e && e.image);
                const featured = (withImg.length ? withImg : evs).slice().sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))[0];
                const rest = evs.filter((e) => e && (!featured || e.id !== featured.id)).slice(0, 24);
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>🎟️ Happening near you</div>
                      <span onClick={() => setScreen("events")} style={{ fontSize: 12.5, fontWeight: 700, color: C.accent, cursor: "pointer" }}>See all ↗</span>
                    </div>
                    {featured && (() => {
                      const f = formatEventDate(featured.date, featured.time);
                      const seg = eventSegmentMeta(featured.segment, featured.genre);
                      const rel = relLabel(featured);
                      const acc = C.purple;
                      return (
                        <div onClick={() => openVenue(featured)} style={{ position: "relative", height: 176, borderRadius: 18, overflow: "hidden", marginBottom: 10, cursor: "pointer", boxShadow: "0 4px 20px rgba(0,0,0,.4)" }}>
                          <EventHeroBg image={featured.image} acc={acc} venue={cleanVenueName(featured.venue) || featured.venue} near={center} />
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,.12) 0%, rgba(0,0,0,.5) 45%, rgba(0,0,0,.9) 100%)" }} />
                          <div style={{ position: "absolute", bottom: 0, right: 0, width: 140, height: 140, background: `radial-gradient(circle at bottom right, ${acc}30 0%, transparent 65%)`, pointerEvents: "none" }} />
                          <div style={{ position: "absolute", top: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                            <div style={{ display: "inline-flex", alignItems: "center", background: rel ? acc : "rgba(0,0,0,.6)", border: `1px solid ${rel ? acc : "rgba(255,255,255,.25)"}`, borderRadius: 999, padding: "4px 11px", backdropFilter: "blur(4px)" }}>
                              <span style={{ fontSize: 10.5, fontWeight: 800, color: "#fff", letterSpacing: "0.4px", textTransform: "uppercase" }}>{rel || (f.wd + " " + f.mo + " " + f.day)}{f.time ? " · " + f.time : ""}</span>
                            </div>
                            {(featured.segment || featured.genre) && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,.6)", border: `1px solid ${seg.color}77`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}><span style={{ fontSize: 11 }}>{seg.icon}</span><span style={{ fontSize: 9, fontWeight: 800, color: seg.color, textTransform: "uppercase", letterSpacing: "0.8px" }}>{seg.short}</span></div>}
                          </div>
                          <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 14px 14px" }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1.18, marginBottom: 4, textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.3px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{featured.name}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,.92)", marginBottom: 11, textShadow: "0 1px 4px rgba(0,0,0,.7)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {cleanVenueName(featured.venue) || featured.city || "Nearby"}{featured.price ? " · " + featured.price : ""}</div>
                            <div onClick={(e2) => { e2.stopPropagation(); if (featured.url) (logEvent("ticket", null, { src: "cta" }), window.open(ticketUrl(featured.url), "_blank", "noopener")); else openVenue(featured); }} style={{ display: "inline-flex", alignItems: "center", fontSize: 12.5, fontWeight: 800, color: "#fff", background: acc, borderRadius: 999, padding: "7px 16px", cursor: "pointer" }}>{featured.url ? "Get tickets →" : "See event →"}</div>
                          </div>
                        </div>
                      );
                    })()}
                    {rest.length > 0 && (
                      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
                        {rest.map((e) => {
                          const f = formatEventDate(e.date, e.time);
                          const evRel = relLabel(e);
                          return (
                            <div key={e.id} onClick={() => openVenue(e)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 9, cursor: "pointer", width: 150, flexShrink: 0, scrollSnapAlign: "start" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: evRel ? C.accent : C.purple, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{evRel ? evRel.toUpperCase() : (f.mo + " " + f.day)}{f.time ? " · " + f.time : ""}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.25, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", minHeight: 30 }}>{e.name}</div>
                              <div style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {e.venue || e.city || "Nearby"}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
              {!browseCat && suggested === null && <Loader label="Reading the moment" pad="8px 2px" />}
              {!browseCat && !suggestedLoading && suggested !== null && list.length === 0 && (
                <div style={{ padding: "16px 2px 8px" }}>{/* v4.70 discovery grid: a first visit is never a dead end */}
                  <div style={{ textAlign: "center", marginBottom: 12 }}>
                    <div style={{ display: "inline-flex", animation: "wfbob 1.4s ease-in-out infinite", marginBottom: 8 }}><Critter size={44} /></div>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: C.text }}>Start with one of these</div>
                    <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>Wayfind is reading what's around you \u2014 these always work.</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                    {[
                      ["\u2728", "Best of " + (locName ? locName.split(",")[0] : "your area"), () => openExpSheet("bestof")],
                      ["\uD83D\uDC8E", "Hidden gems", () => openExpSheet("gem")],
                      ["\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67", "Family favorites", () => openExpSheet("family")],
                      ["\uD83D\uDC95", "Date night ideas", () => openExpSheet("romantic")],
                      ["\uD83C\uDF9F\uFE0F", "Perfect for tonight", () => setScreen("events")],
                      ["\uD83D\uDE97", "Worth the drive", () => openExpSheet("entertainment")],
                      ["\uD83D\uDCB5", "Big fun, small budget", () => openExpSheet("budget")],
                      ["\uD83C\uDFB2", "Surprise me", () => setMenuSheet("pick")],
                    ].map(([ic, lbl, go]) => (
                      <button key={lbl} onClick={() => { try { logEvent("discovery_tile", null, { tile: lbl }); } catch (e) {} go(); }} style={{ display: "flex", alignItems: "center", gap: 9, textAlign: "left", padding: "13px 12px", borderRadius: 14, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 13.5, fontWeight: 700, cursor: "pointer", lineHeight: 1.25 }}>
                        <span style={{ fontSize: 18 }}>{ic}</span><span>{lbl}</span>
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
                <div style={{ width: 340, flexShrink: 0, position: "sticky", top: 12 }}>
                  <div style={{ border: `1px solid ${C.accent}`, borderRadius: 16, padding: 16, marginBottom: 14, background: `linear-gradient(160deg, rgba(255,150,70,.10) 0%, ${C.adim} 55%)` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: weather ? 10 : 6 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>You are exploring</div>
                        {locName ? <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {locName}</div> : null}
                      </div>
                      {weather && <div style={{ flexShrink: 0 }}><span style={{ fontSize: 22, fontWeight: 800, color: C.text }}>{weather.icon} {weather.temp}°</span></div>}
                    </div>
                    {weather && (
                      <div style={{ display: "flex", gap: 5, marginBottom: 11, flexWrap: "wrap" }}>
                        {weather.label && <span style={wstat}>{weather.label}</span>}
                        {weather.feels != null && <span style={wstat}>Feels {weather.feels}°</span>}
                        {weather.wind != null && <span style={wstat}>💨 {weather.wind} mph</span>}
                        {weather.sunset && <span style={wstat}>🌅 Sunset {weather.sunset}</span>}
                      </div>
                    )}
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{intentDef ? intentDef.icon + " " + intentDef.label + " near you" : "✨ " + moment + " picks"}</div>
                    {list.length > 0 && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 5, fontWeight: 600 }}>⭐ {list.length} spots, ranked best first</div>}
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={rollDice} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>🎲 Pick for me</button>
                      <button onClick={() => setScreen("explore")} style={{ flex: 1, padding: "10px 0", borderRadius: 12, border: `1.5px solid ${C.accent}`, background: "transparent", color: C.accent, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Browse all ↗</button>
                    </div>
                  </div>
                  {foryouEvents && foryouEvents.length > 0 && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>🎟️ Events nearby</div>
                        <span onClick={() => setScreen("events")} style={{ fontSize: 12, fontWeight: 700, color: C.accent, cursor: "pointer" }}>See all ↗</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {dedupeEvents(foryouEvents, true).slice(0, 6).map((e) => {
                          const f = formatEventDate(e.date, e.time);
                          return (
                            <div key={e.id} onClick={() => openVenue(e)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 10, cursor: "pointer" }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: C.purple, marginBottom: 3 }}>{f.wd} {f.mo} {f.day}{f.time ? " · " + f.time : ""}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                              <div style={{ fontSize: 10.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {e.venue || e.city || "Nearby"}</div>
                            </div>
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

        {screen === "surprise" && (() => {
          const p = surprisePick;
          const sl = p ? scoreLabel(p.wfScore) : null;
          const badges = p ? experienceBadges(p).slice(0, 2) : [];
          const cuisineLabel = p ? (() => { const t = (p.types || []).find((x) => /_(restaurant|store|bar)$/.test(x)); return t ? t.replace(/_(restaurant|store|bar)$/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null; })() : null;
          // v4.6: capitalized identity + state-aware subtitle so a closed pick is never framed as "right now".
          const period = (() => { const hr = new Date().getHours(); return hr < 12 ? "Morning" : hr < 17 ? "Afternoon" : "Evening"; })();
          const sOpen = !!(p && p.openNow === true);
          const sOpensLater = !!(p && p.openNow === false && p.nextOpen && p.nextOpen.today);
          const sSub = sOpen ? "Open now, nearby, and worth your time."
            : sOpensLater ? (p.nextOpen.label + " · a strong pick for a little later.")
            : "A top pick nearby, chosen for rating, distance, and fit.";
          // v5.0: state-aware primary action. Never tell someone to drive to a closed place.
          const openAlt = surprisePool.find((o) => o && o.openNow === true && (!p || o.id !== p.id)) || null;
          const goMaps = () => { if (p && p.mapsUrl) window.open(p.mapsUrl, "_blank", "noopener"); else if (p) openDetail(p); };
          let primaryLabel = "Take me there →";
          let primaryAction = goMaps;
          if (p && !sOpen) {
            if (sOpensLater) { primaryLabel = "Plan for " + p.nextOpen.label.replace(/^opens\s+/i, "") + " →"; primaryAction = goMaps; }
            else { primaryLabel = isSaved(p.id) ? "Saved ✓" : "Save for later →"; primaryAction = () => quickSaveFavorite(p); }
          }
          const sWhy = [];
          if (p) {
            if (sOpen) sWhy.push("open now");
            else if (sOpensLater) sWhy.push("opens " + p.nextOpen.label.replace(/^opens\s+/i, "").trim());
            if (p.rating != null && p.rating >= 4.5) sWhy.push("local favorite");
            else if (sl && sl.word) sWhy.push(sl.word.toLowerCase() + " rated");
            if (p.distMi != null && p.distMi <= 20) sWhy.push("close enough");
            sWhy.push("strong " + period.toLowerCase() + " option");
          }
          return (
            <div>
              <div onClick={() => setScreen("suggested")} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, color: C.accent, fontWeight: 800, fontSize: 14, cursor: "pointer", padding: "8px 15px", marginBottom: 10 }}>‹ Back</div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>🎲 Your {period} Pick</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>{sSub}</div>
              </div>
              {surpriseLoading && <Loader label="Finding something good" pad="16px 2px" />}
              {!surpriseLoading && !p && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✨</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing to suggest right now</strong>
                  <span style={{ fontSize: 13 }}>Try a different area.</span>
                </div>
              )}
              {!surpriseLoading && p && (
                <div>
                  <div onClick={() => openDetail(p)} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer" }}>
                    <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: "100%", height: 168, objectFit: "cover", display: "block" }} />
                    <div style={{ padding: 13 }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{p.name}</div>
                      {p.address && <div style={{ fontSize: 12, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>📍 {p.address}</div>}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                        {sl && <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{sl.word}</span>}
                        {sl && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.muted }}>{sl.s}/10</span>}
                        {p.rating && <span style={{ color: "#F59E0B", fontSize: 13 }}>★ {p.rating}{p.reviews ? ` (${p.reviews.toLocaleString()})` : ""}</span>}
                        {liveOpen(p) === true && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>Open now</span>}
                        {liveOpen(p) === false && <span style={{ fontSize: 12, fontWeight: 700, color: p.nextOpen && p.nextOpen.today ? C.gold : C.red }}>{p.nextOpen && p.nextOpen.today ? p.nextOpen.label : "Closed today"}</span>}
                        {p.price && <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>· {p.price}</span>}
                        {cuisineLabel && <span style={{ fontSize: 12, color: C.muted }}>· {cuisineLabel}</span>}
                        {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                      </div>
                      {sWhy.length > 0 && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginTop: 9 }}><span style={{ color: C.accent, fontWeight: 800 }}>Why: </span>{sWhy.slice(0, 4).join(" · ")}</div>}
                      {badges.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                          {badges.map((b) => (
                            <button key={b.key} onClick={(e) => { e.stopPropagation(); openExperience(b.key); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, fontWeight: 700, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "3px 9px", cursor: "pointer" }}>{b.icon} {cityFixM(b.label)} ›</button>
                          ))}
                        </div>
                      )}
                      {blurbs[p.id] && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.45, marginTop: 10 }}>{blurbs[p.id]}</div>}
                    </div>
                  </div>
                  <button onClick={primaryAction} style={{ width: "100%", marginTop: 10, background: C.accent, color: "#0D1117", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 800, padding: "13px 0", cursor: "pointer" }}>{primaryLabel}</button>
                  <div style={{ display: "flex", gap: 10, marginTop: 9 }}>
                    
                    <button onClick={() => quickSaveFavorite(p)} style={{ flex: 1, background: isSaved(p.id) ? C.adim : "transparent", color: isSaved(p.id) ? C.accent : C.light, border: `1px solid ${isSaved(p.id) ? C.accent : C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "11px 0", cursor: "pointer" }}>{isSaved(p.id) ? "♥ Saved" : "♡ Save"}</button>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 9 }}>
                    {!sOpen && openAlt ? (
                      <button onClick={() => setSurprisePick(openAlt)} style={{ flex: 1, background: "transparent", color: C.green, border: `1.5px solid ${C.green}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "12px 0", cursor: "pointer" }}>Find open now</button>
                    ) : (
                      <button onClick={() => openDetail(p)} style={{ flex: 1, background: "transparent", color: C.light, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 700, padding: "12px 0", cursor: "pointer" }}>See details</button>
                    )}
                    <button onClick={rerollSurprise} style={{ flex: 1, background: "transparent", color: C.light, border: `1px solid ${C.border}`, borderRadius: 12, fontSize: 13.5, fontWeight: 800, padding: "12px 0", cursor: "pointer" }}>🎲 Roll again</button>
                  </div>
                  {/* v4.6: backup picks split into Open now and For later so closed spots are labeled, not hidden in prime slots. */}
                  {(() => {
                    const others = surprisePool.filter((o) => o && o.id !== p.id);
                    const openG = others.filter((o) => o.openNow === true).slice(0, 3);
                    const laterG = others.filter((o) => o.openNow === false).slice(0, 3);
                    if (!openG.length && !laterG.length) return null;
                    return (
                      <div style={{ marginTop: 22, paddingBottom: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: "0.3px", textTransform: "uppercase", marginBottom: 10 }}>Backup picks</div>
                        {openG.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: C.green, textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 7 }}>Open now</div>}
                        {openG.map((other) => (
                          <div key={other.id} onClick={() => setSurprisePick(other)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8, cursor: "pointer" }}>
                            <FallbackImg src={other.photo} icon="🍽️" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{other.name}</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                                {other.rating && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {other.rating}</span>}
                                {other.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {other.distMi.toFixed(1)} mi</span>}
                              </div>
                            </div>
                            <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
                          </div>
                        ))}
                        {laterG.length > 0 && <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.4px", margin: "12px 0 7px" }}>For later</div>}
                        {laterG.map((other) => (
                          <div key={other.id} onClick={() => setSurprisePick(other)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 8, cursor: "pointer", opacity: 0.82 }}>
                            <FallbackImg src={other.photo} icon="🍽️" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{other.name}</div>
                              <div style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                                {other.rating && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {other.rating}</span>}
                                {other.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {other.distMi.toFixed(1)} mi</span>}
                                <span style={{ fontSize: 11, fontWeight: 600, color: C.gold }}>{other.nextOpen && other.nextOpen.today ? other.nextOpen.label : "Opens later"}</span>
                              </div>
                            </div>
                            <span style={{ color: C.muted, fontSize: 18, flexShrink: 0 }}>›</span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}

        {screen === "experience" && activeBadge && EXPERIENCES[activeBadge] && (() => {
          const exp = EXPERIENCES[activeBadge];
          let list = expPlaces || [];
          if (expOpenOnly) list = list.filter((p) => p.openNow !== false);
          if (expSort === "near") list = [...list].sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12));
          else list = [...list].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div onClick={() => { setActiveBadge(null); setIntent(null); setBrowseCat(null); setScreen("suggested"); try { window.scrollTo(0, 0); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, color: C.accent, fontWeight: 800, fontSize: 14, cursor: "pointer", padding: "8px 15px" }}>‹ Back</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => { shareLink(cityFix(exp.title), listShareUrl(activeBadge, cityFix(exp.title), list.length, locName), () => showToast("Link copied"), "Check this Wayfind list: " + cityFix(exp.title), () => { try { logEvent("share", null, { kind: "list", theme: activeBadge }); } catch (e) {} giveawayMark("list:" + activeBadge); }); }} aria-label="Share list" title="Share list" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
                  {(() => { const u = mapsRouteUrl(list); return u ? (<a href={u} target="_blank" rel="noreferrer" aria-label="Open this list in Google Maps" title="Open in Maps" onClick={() => { try { logEvent("maps_list", null, { theme: activeBadge, n: Math.min(list.length, 9) }); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, textDecoration: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3 3.6 5.4A1 1 0 0 0 3 6.3V20l6-2.5 6 2.5 5.4-2.4a1 1 0 0 0 .6-.9V3l-6 2.5Z" /><path d="M9 3v14.5" /><path d="M15 5.5V20" /></svg></a>) : null; })()}
                  {(() => { const lk = hookLikes.has("badge-" + activeBadge); return (<button onClick={() => { toggleHookLike("badge-" + activeBadge); saveHookList({ id: "badge-" + activeBadge, key: activeBadge, title: cityFix(exp.title), label: cityFix(exp.title) }, list); }} aria-label={lk ? "Saved to lists" : "Save to lists"} title={lk ? "Saved to lists" : "Save to lists"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: lk ? C.adim : "transparent", border: `1.5px solid ${lk ? C.accent : C.border}`, color: lk ? C.accent : C.muted, cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill={lk ? C.accent : "none"} stroke={lk ? C.accent : C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg></button>); })()}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 16 }}>{exp.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.2px", color: C.accent, textTransform: "uppercase" }}>Wayfind picks</span>
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: C.text, lineHeight: 1.08, letterSpacing: "-0.6px", marginBottom: 10 }}>{cityFix(exp.title)}</div>
              <div style={{ fontSize: 14.5, color: C.light, lineHeight: 1.55, marginBottom: 8 }}>{exp.lead}</div>
              <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.45, marginBottom: 6 }}>Based on rating, review volume, distance, relevance, and real experience signals, plus member takes once a place has enough of them. No ads, no paid placement.</div>
              {!expLoading && <div style={{ fontSize: 12.5, color: C.muted, fontWeight: 600, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}` }}>{list.length} curated pick{list.length === 1 ? "" : "s"} · Tap any to see full details</div>}
              {expLoading && <Loader label="Curating the best spots" pad="8px 2px" />}
              {!expLoading && (expPlaces || []).length > 0 && (
                <div style={{ display: "flex", gap: 7, marginBottom: 12, overflowX: "auto", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
                  <button onClick={() => setExpOpenOnly((o) => !o)} style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${expOpenOnly ? C.green : C.border}`, background: expOpenOnly ? "rgba(34,197,94,.15)" : "transparent", color: expOpenOnly ? C.green : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>{expOpenOnly ? "✓ Open now" : "Open now"}</button>
                  <button onClick={() => setExpSort("best")} style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${expSort === "best" ? C.accent : C.border}`, background: expSort === "best" ? C.adim : "transparent", color: expSort === "best" ? C.accent : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Best</button>
                  <button onClick={() => setExpSort("near")} style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 999, border: `1.5px solid ${expSort === "near" ? C.accent : C.border}`, background: expSort === "near" ? C.adim : "transparent", color: expSort === "near" ? C.accent : C.light, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Closest</button>
                  <button onClick={rollDice} style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 12px", borderRadius: 999, border: "none", background: C.accent, color: "#0D1117", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}>🎲 Pick for me</button>
                </div>
              )}
              {!expLoading && activeBadge === "instagram" && (expPlaces || []).length > 0 && (() => {
                const h = new Date().getHours();
                let light;
                if (h < 8) light = "Early light is soft and golden. Keep the sun to one side of your subject and shoot toward the open sky, not into the sun.";
                else if (h < 11) light = "Morning sun sits in the east. Stand with the sun behind you or to your left so faces are evenly lit and shadows stay short.";
                else if (h < 15) light = "Midday sun is high and harsh. Find open shade or a covered spot, keep the sun behind you, and avoid overhead noon shadows on faces.";
                else if (h < 18) light = "Afternoon sun moves to the west and softens. Side light works well; angle your subject so light skims across them.";
                else if (h < 20) light = "Golden hour. Put the sun behind your subject for a warm rim glow, then tap to focus and raise exposure so faces do not go dark.";
                else light = "After sunset, light is low. Use railings or a ledge to steady the shot, and frame against city lights or the sky.";
                return (
                  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.pink, marginBottom: 8 }}>📸 Photo tips for right now</div>
                    <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, marginBottom: 8 }}>{light}</div>
                    <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.55 }}>
                      <div style={{ marginBottom: 4 }}>🎯 Framing: put the subject on a third, not dead center, and use a doorway, archway, or branches in front as a natural frame.</div>
                      <div style={{ marginBottom: 4 }}>🧍 Poses: shoot a candid walking or looking-away shot rather than a straight-on stare, turn shoulders slightly off camera, and keep hands busy.</div>
                      <div>📐 Lines: line up paths, railings, or shorelines so they lead toward the subject, and get low for a taller, more dramatic look.</div>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>General photography guidance based on the current time, not specific to each spot.</div>
                  </div>
                );
              })()}
              {!expLoading && list.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>{exp.icon}</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing matched within 30 miles</strong>
                  <span style={{ fontSize: 13 }}>Try a different experience or area.</span>
                </div>
              )}
              {!expLoading && list.map((p, i) => (
                <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} selectedBadge={activeBadge} />
              ))}
            </div>
          );
        })()}

        {screen === "saved" && !activeList && !sysFolder && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, paddingTop: 4 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Saved</div>
              <button onClick={() => setNewListOpen(true)} style={{ background: C.adim, border: `1px solid ${C.accent}`, color: C.accent, fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 20, cursor: "pointer" }}>+ New list</button>
            </div>
            {supabase && !user && (
              <div onClick={() => setAuthOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 13px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, marginBottom: 16, cursor: "pointer" }}>
                <span style={{ fontSize: 17 }}>☁️</span>
                <div style={{ flex: 1, fontSize: 12.5, color: C.light, lineHeight: 1.35 }}>Sign in to save your lists across devices.</div>
                <span style={{ fontSize: 12.5, fontWeight: 800, color: C.accent, whiteSpace: "nowrap" }}>Sign in ›</span>
              </div>
            )}
            {supabase && user && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: C.muted, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Signed in as {user.email}</div>
                <span onClick={signOutUser} style={{ fontSize: 13, fontWeight: 700, color: C.accent, cursor: "pointer" }}>Sign out</span>
              </div>
            )}
            <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.4px", color: C.muted, textTransform: "uppercase", marginBottom: 2 }}>Your lists</div>
            {Object.values(lists).map((l) => {
              const row = (
                <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                  <div onClick={() => setActiveList(l.id)} style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0, cursor: "pointer" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.card, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, border: `1px solid ${C.border}`, flexShrink: 0 }}>{l.emoji}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
                      <div style={{ fontSize: 13, color: C.muted }}>{l.places.length} place{l.places.length !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setListMenu(l.id); }} aria-label="List options" style={{ flexShrink: 0, width: 36, height: 36, borderRadius: "50%", border: "none", background: "transparent", color: C.muted, fontSize: 22, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⋯</button>
                </div>
              );
              // v4.6: render every list as a plain tap-to-open row, like Favorites (which always opened).
              // The swipe-to-delete wrapper put touch handlers and a transform around the row, which
              // swallowed taps on iOS so the list would not open. Delete is unaffected: it still lives in
              // the row "..." menu (Open / Share / Rename / Delete) and the trash button inside the open list.
              return <div key={l.id}>{row}</div>;
            })}
            {(
              <>
                <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: "0.4px", color: C.muted, textTransform: "uppercase", marginTop: 18, marginBottom: 2 }}>From your activity</div>
                {[{ k: "liked", name: "Liked", emoji: "\uD83D\uDC4D", items: likedItems }, { k: "disliked", name: "Disliked", emoji: "\uD83D\uDC4E", items: dislikedItems }, { k: "shared", name: "Shared", emoji: "\uD83D\uDCE4", items: sharedItems }].map((f) => {
                  const cnt = Object.keys(f.items || {}).length;
                  return (
                    <div key={f.k} onClick={() => setSysFolder(f.k)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.adim, border: `1px solid ${C.accent}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{f.emoji}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{f.name}</div>
                        <div style={{ fontSize: 13, color: C.muted }}>{cnt} place{cnt !== 1 ? "s" : ""} · automatic</div>
                      </div>
                      <span style={{ color: C.muted, fontSize: 20 }}>›</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {screen === "saved" && sysFolder && (() => {
          const cfg = { liked: { name: "Liked", emoji: "\uD83D\uDC4D", items: likedItems, empty: "Tap the thumbs up on any place and it lands here, newest first." }, disliked: { name: "Disliked", emoji: "\uD83D\uDC4E", items: dislikedItems, empty: "Places you thumbs down collect here, so you can revisit them or change your mind." }, shared: { name: "Shared", emoji: "\uD83D\uDCE4", items: sharedItems, empty: "Anything you share gets gathered here automatically." } }[sysFolder];
          if (!cfg) return null;
          const arr = Object.values(cfg.items || {}).filter((x) => x && x.place && x.place.id).sort((a, b) => (b.ts || 0) - (a.ts || 0));
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
                <button onClick={() => setSysFolder(null)} style={{ background: "none", border: "none", color: C.accent, fontSize: 22, cursor: "pointer" }}>‹</button>
                <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text }}>{cfg.emoji} {cfg.name}</div>
                <span style={{ fontSize: 13, color: C.muted }}>{arr.length} place{arr.length !== 1 ? "s" : ""}</span>
              </div>
              {supabase && !user && arr.length > 0 && (
                <div onClick={() => setAuthOpen(true)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", borderRadius: 12, border: `1px solid ${C.accent}`, background: C.adim, marginBottom: 14, cursor: "pointer" }}>
                  <span style={{ fontSize: 18 }}>☁️</span>
                  <div style={{ flex: 1, fontSize: 12.5, color: C.light, lineHeight: 1.4 }}>These live only on this phone. Sign in to save them.</div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: C.accent, whiteSpace: "nowrap" }}>Sign in ›</span>
                </div>
              )}
              {arr.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: C.muted, fontSize: 14, lineHeight: 1.5 }}>{cfg.empty}</div>
              ) : (
                arr.map(({ place: p }) => (
                  <PlaceCard key={p.id} p={p} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
                ))
              )}
            </div>
          );
        })()}

        {screen === "saved" && activeList && lists[activeList] && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
              <button onClick={() => setActiveList(null)} style={{ background: "none", border: "none", color: C.accent, fontSize: 22, cursor: "pointer" }}>‹</button>
              <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: C.text }}>{lists[activeList].emoji} {lists[activeList].name}</div>
              {lists[activeList].places.length > 0 && (
                <button onClick={() => shareList(lists[activeList].places, lists[activeList].name)} style={{ background: C.adim, border: `1px solid ${C.accent}`, color: C.accent, fontSize: 13, fontWeight: 700, padding: "7px 12px", borderRadius: 20, cursor: "pointer" }}>Share ↗</button>
              )}
              {activeList !== "favorites" && (
                <button onClick={() => deleteList(activeList)} style={{ background: "none", border: `1px solid ${C.border}`, color: C.red, fontSize: 16, width: 34, height: 34, borderRadius: 10, cursor: "pointer" }}>🗑</button>
              )}
            </div>
            {lists[activeList].places.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: C.muted }}>Tap the bookmark on any place to save it here.</div>
            ) : (
              <>
                {lists[activeList].places.length > 1 && (
                  <button onClick={rollDice} style={{ width: "100%", marginBottom: 14, padding: "12px 0", borderRadius: 12, border: `1.5px solid ${C.accent}`, background: C.adim, color: C.accent, fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>🎲 Pick for me</button>
                )}
                {lists[activeList].places.map((p) => (
                  <PlaceCard key={p.id} p={p} saved liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
                ))}
              </>
            )}
          </div>
        )}
        {screen === "itinerary" && !activeTrip && (() => {
          const list = Trips.tripList(trips);
          return (
            <div>
              <CategoryMenu activeCat={null} sub={sub} onCat={(id, label) => { try { logEvent("intent_chip", null, { intent: label, layer: 1, src: "itinerary" }); } catch (e) {} setScreen("home"); setTimeout(() => pickBrowse(id), 60); }} onSub={() => {}} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingTop: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Your trips</div>
                {list.length > 0 && <span style={{ fontSize: 13, color: C.muted }}>{list.length} destination{list.length !== 1 ? "s" : ""}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.4, marginBottom: 16 }}>Save a place and it lands here under its city. Reorder your stops, mark what you have hit, and route the whole trip in Google Maps.</div>
              {reservations.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>🧾 Reservations</div>
                    <span style={{ fontSize: 12, color: C.muted }}>{reservations.length}</span>
                  </div>
                  {reservations.map((r) => (
                    <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "11px 13px", marginBottom: 9 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ fontSize: 18 }}>{r.kind === "hotel" ? "🏨" : "🎟️"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Booked via {r.partner} · {new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                        </div>
                        {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, textDecoration: "none", flexShrink: 0 }}>View ↗</a> : null}
                        <button onClick={() => removeRes(r.id)} aria-label="Remove reservation" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 15, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>✕</button>
                      </div>
                      <input defaultValue={r.conf} onBlur={(e) => saveResConf(r.id, e.target.value)} placeholder="Add confirmation # or note"
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 9, padding: "8px 11px", borderRadius: 10, border: `1px dashed ${r.conf ? C.border : C.accent + "66"}`, background: "transparent", color: C.text, fontSize: 12.5, outline: "none" }} />
                    </div>
                  ))}
                  <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.45 }}>Wayfind logs when you head out to book. Your confirmation details stay on this device.</div>
                </div>
              )}
              {list.length === 0 ? (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted, fontSize: 14, lineHeight: 1.5 }}>No trips yet. Save any place from Home or the Map and a city trip is created for you automatically.</div>
              ) : (
                list.map((t) => {
                  const st = Trips.tripStats(t);
                  return (
                    <div key={t.key} onClick={() => { setActiveTrip(t.key); try { window.scrollTo(0, 0); } catch {} }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <StateBadge code={t.state} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.city}{t.state ? ", " + t.state : ""}</div>
                        <div style={{ fontSize: 13, color: C.muted }}>{st.total} place{st.total !== 1 ? "s" : ""}{st.visited > 0 ? " · " + st.visited + " visited" : ""}</div>
                      </div>
                      <span style={{ color: C.muted, fontSize: 20 }}>›</span>
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}

        {screen === "itinerary" && activeTrip && trips[activeTrip] && (() => {
          const t = trips[activeTrip];
          const items = Trips.sortedItems(t);
          const st = Trips.tripStats(t);
          const others = Trips.tripList(trips).filter((x) => x.key !== t.key);
          const tripCtl = { width: 34, height: 30, borderRadius: 8, border: "1px solid " + C.border, background: C.card, color: C.text, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
          const tripChip = { border: "1px solid " + C.border, background: C.card, color: C.muted, fontSize: 12, fontWeight: 700, padding: "7px 11px", borderRadius: 18, cursor: "pointer" };
          const doRoute = () => { const u = Trips.routeUrl(t); if (u) { try { window.open(u, "_blank"); } catch {} try { logEvent("trip_route", null, { key: t.key, n: items.length }); } catch {} } };
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid " + C.border, marginBottom: 14, paddingTop: 4 }}>
                <button onClick={() => { setActiveTrip(null); setTripNoteEdit(null); setTripMoveFor(null); }} style={{ background: "none", border: "none", color: C.accent, fontSize: 22, cursor: "pointer" }}>‹</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.city}{t.state ? ", " + t.state : ""}</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>{st.total} place{st.total !== 1 ? "s" : ""}{st.visited > 0 ? " · " + st.visited + " visited" : ""}</div>
                </div>
                {items.length > 0 && <button onClick={doRoute} style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 13, fontWeight: 800, padding: "8px 14px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}>Route it ↗</button>}
              </div>
              {items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: C.muted }}>This trip is empty.</div>
              ) : items.map((it, i) => {
                const p = it.place;
                const editing = tripNoteEdit === p.id;
                const moving = tripMoveFor === p.id;
                return (
                  <div key={p.id} style={{ marginBottom: 12 }}>
                    <div style={{ position: "relative", opacity: it.visited ? 0.62 : 1 }}>
                      <PlaceCard p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} />
                      {it.visited && <div style={{ position: "absolute", top: 8, left: 8, background: C.accent, color: "#0D1117", fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 20, zIndex: 2 }}>✓ Visited</div>}
                    </div>
                    {it.note && !editing && <div style={{ fontSize: 12.5, color: C.light, background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: "8px 10px", marginTop: 6 }}>📝 {it.note}</div>}
                    {editing && (
                      <div style={{ marginTop: 6 }}>
                        <textarea autoFocus defaultValue={it.note} id={"note_" + p.id} placeholder="Reservation time, what to order, who to ask for…" style={{ width: "100%", boxSizing: "border-box", minHeight: 60, background: C.card, border: "1px solid " + C.accent, borderRadius: 10, padding: "8px 10px", color: C.text, fontSize: 13, resize: "vertical" }} />
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          <button onClick={() => { const el = document.getElementById("note_" + p.id); const v = el ? el.value : ""; setTrips((prev) => Trips.setNote(prev, t.key, p.id, (v || "").trim())); setTripNoteEdit(null); }} style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 12.5, fontWeight: 800, padding: "7px 14px", borderRadius: 18, cursor: "pointer" }}>Save note</button>
                          <button onClick={() => setTripNoteEdit(null)} style={{ background: "transparent", border: "1px solid " + C.border, color: C.muted, fontSize: 12.5, fontWeight: 700, padding: "7px 14px", borderRadius: 18, cursor: "pointer" }}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {moving && (
                      <div style={{ marginTop: 6, background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 8 }}>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, padding: "0 2px" }}>Move to…</div>
                        {others.length === 0 ? (
                          <div style={{ fontSize: 12.5, color: C.muted, padding: "4px 2px" }}>No other trips yet.</div>
                        ) : others.map((o) => (
                          <div key={o.key} onClick={() => { setTrips((prev) => Trips.movePlaceToTrip(prev, t.key, o.key, p.id)); setTripMoveFor(null); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderRadius: 8, cursor: "pointer" }}>
                            <StateBadge code={o.state} size={28} />
                            <span style={{ fontSize: 13.5, color: C.text }}>{o.city}{o.state ? ", " + o.state : ""}</span>
                          </div>
                        ))}
                        <button onClick={() => setTripMoveFor(null)} style={{ marginTop: 4, background: "transparent", border: "none", color: C.muted, fontSize: 12.5, fontWeight: 700, padding: "4px 2px", cursor: "pointer" }}>Cancel</button>
                      </div>
                    )}
                    {!editing && !moving && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <button onClick={() => setTrips((prev) => Trips.moveItem(prev, t.key, p.id, -1))} disabled={i === 0} style={{ ...tripCtl, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                        <button onClick={() => setTrips((prev) => Trips.moveItem(prev, t.key, p.id, 1))} disabled={i === items.length - 1} style={{ ...tripCtl, opacity: i === items.length - 1 ? 0.35 : 1 }}>↓</button>
                        <button onClick={() => setTrips((prev) => Trips.toggleVisited(prev, t.key, p.id))} style={{ ...tripChip, ...(it.visited ? { background: C.adim, borderColor: C.accent, color: C.accent } : {}) }}>{it.visited ? "✓ Visited" : "Mark visited"}</button>
                        <button onClick={() => { setTripNoteEdit(p.id); setTripMoveFor(null); }} style={tripChip}>{it.note ? "Edit note" : "Add note"}</button>
                        <button onClick={() => { setTripMoveFor(p.id); setTripNoteEdit(null); }} style={tripChip}>Move</button>
                        <button onClick={() => { if (typeof window !== "undefined" && window.confirm("Remove this place from the trip? It stays in your Favorites.")) setTrips((prev) => Trips.removePlaceFromTrip(prev, t.key, p.id)); }} style={{ ...tripChip, color: C.red }}>Remove</button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {screen === "shared" && sharedList && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>📩 Shared with you</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sharedList.length} place{sharedList.length !== 1 ? "s" : ""} someone wanted you to see</div>
              </div>
              <button onClick={() => { setSharedList(null); setScreen("explore"); }} style={{ background: C.accent, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 20, cursor: "pointer" }}>Explore ›</button>
            </div>
            {sharedList.map((p) => (
              <PlaceCard key={p.id} p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
            ))}
          </div>
        )}
        {screen === "events" && (() => {
          const all = events || [];
          const segs = [];
          all.forEach((e) => { const m = eventSegmentMeta(e.segment, e.genre); if ((e.segment || e.genre) && !segs.find((s) => s.short === m.short)) segs.push(m); });
          let shown = all;
          if (eventCat !== "all") shown = shown.filter((e) => eventSegmentMeta(e.segment, e.genre).short === eventCat);
          if (eventDate !== "all") shown = shown.filter((e) => e.date === eventDate);
          shown = dedupeEvents(shown, eventDate === "all");
          const eventDateChips = [];
          const enow = new Date();
          for (let i = 0; i < 28; i++) {
            const d = new Date(enow.getFullYear(), enow.getMonth(), enow.getDate() + i);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
            eventDateChips.push({ value, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], day: d.getDate() });
          }
          const dchip = (on) => ({ flexShrink: 0, minWidth: 46, padding: "6px 9px", borderRadius: 12, border: `1px solid ${on ? C.accent : C.border}`, cursor: "pointer", textAlign: "center", background: on ? C.accent : C.panel, color: on ? "#fff" : C.light, fontWeight: 700 });
          return (
            <div>
              <div style={{ paddingTop: 4, marginBottom: 12 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>Events near you</div>
                {(() => { const _cm = Culture.resolveMetro(locName); return _cm ? <div style={{ marginTop: 10 }}><AreaInsight metro={_cm} cat={"events"} town={locName ? locName.split(",")[0] : null} onFind={(q) => submitSearch(q, { miles: 45 })} /></div> : null; })()}
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Concerts, sports, and shows worth building a night around</div>
              </div>
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  {(eventCat !== "all" || eventDate !== "all") && (
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 6 }}>
                      <button onClick={() => { setEventCat("all"); setEventDate("all"); }} style={{ fontSize: 11, fontWeight: 800, color: C.accent, background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 999, padding: "3px 10px", cursor: "pointer" }}>Show all ✕</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
                    <button onClick={() => setEventDate("all")} style={dchip(eventDate === "all")}><div style={{ fontSize: 10, opacity: 0.85 }}>Any</div><div style={{ fontSize: 14 }}>All</div><div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{all.length}</div></button>
                    {eventDateChips.map((d) => {
                      const count = all.filter((e) => e.date === d.value).length;
                      return (
                        <button key={d.value} onClick={() => setEventDate(d.value)} style={dchip(eventDate === d.value)}>
                          <div style={{ fontSize: 10, opacity: 0.85 }}>{d.top}</div>
                          <div style={{ fontSize: 14 }}>{d.day}</div>
                          <div style={{ fontSize: 9, opacity: 0.75, height: 11 }}>{count > 0 ? count : ""}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && segs.length > 1 && (
                <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12, WebkitOverflowScrolling: "touch" }}>
                  <button onClick={() => setEventCat("all")} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: "6px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: eventCat === "all" ? C.adim : C.panel, color: eventCat === "all" ? C.accent : C.light, border: `1px solid ${eventCat === "all" ? C.accent : C.border}` }}>All</button>
                  {segs.map((m) => (
                    <button key={m.short} onClick={() => setEventCat(m.short)} style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: "6px 13px", borderRadius: 999, cursor: "pointer", whiteSpace: "nowrap", background: eventCat === m.short ? C.adim : C.panel, color: eventCat === m.short ? C.accent : C.light, border: `1px solid ${eventCat === m.short ? C.accent : C.border}` }}>{m.icon} {m.short}</button>
                  ))}
                </div>
              )}
              {eventsLoading && <Loader label="Finding plans" pad="8px 2px" />}
              {!eventsLoading && eventsUnavailable && <div style={{ color: C.muted, fontSize: 13, padding: "8px 2px" }}>Events are not turned on yet. Add a Ticketmaster key in Vercel to switch them on.</div>}
              {!eventsLoading && !eventsUnavailable && eventsError && (
                <div style={{ textAlign: "center", padding: "40px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
                  <strong style={{ display: "block", color: C.light }}>No events to show right now</strong>
                  <span style={{ fontSize: 13 }}>Check back in a little while.</span>
                  <div onClick={loadEvents} style={{ marginTop: 12, color: C.muted, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Refresh ↻</div>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🎟️</div>
                  <strong style={{ display: "block", color: C.light }}>No events in your area yet</strong>
                  <span style={{ fontSize: 13 }}>We're still expanding Wayfind events to your area. Check back soon.</span>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && all.length > 0 && shown.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 24px", color: C.muted }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                  <strong style={{ display: "block", color: C.light }}>Nothing on this day</strong>
                  <span style={{ fontSize: 13 }}>Try another date or tap All.</span>
                </div>
              )}
              {!eventsLoading && !eventsUnavailable && !eventsError && shown.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
                  {shown.map((e) => <EventCard key={e.id} e={e} onVenue={() => openVenue(e)} />)}
                </div>
              )}
            </div>
          );
        })()}
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
        {[{ id: "home", icon: "home", label: "Home" }, { id: "events", icon: "events", label: "Events" }, { id: "map", icon: "map", label: "Map" }, { id: "saved", icon: "saved", label: "Favorites" }, { id: "itinerary", icon: "itinerary", label: "Itinerary" }].map((s) => {
          const active = (s.id === "home" && (screen === "suggested" || screen === "explore" || screen === "experience" || screen === "surprise")) || s.id === screen;
          return (
          <a key={s.id} href={{ home: "/", events: "/events", map: "/map", saved: "/favorites", itinerary: "/itinerary" }[s.id] || "/"} aria-label={s.label} aria-current={active ? "page" : undefined} onClick={(e) => { e.preventDefault(); if (s.id === "home" && active) { setBrowseCat(null); setMoodPick(null); setSub("all"); } setActiveList(null); setSysFolder(null); setListMenu(null); setRenamingList(null); setActiveTrip(null); setTripNoteEdit(null); setTripMoveFor(null); if (s.id === "home") { openSuggested(); } else { setScreen(s.id); } try { if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 }); window.scrollTo(0, 0); } catch (e) {} }} style={{ flex: 1, padding: "7px 6px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, background: "transparent", border: "none", cursor: "pointer", textDecoration: "none" }}>
            <NavIcon name={s.icon} color={active ? C.accent : C.muted} size={22} />
            <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 600, color: active ? C.accent : C.muted }}>{s.label}</span>
          </a>
          );
        })}
      </div>

      {/* Detail sheet */}
      {detail && (
        <div style={sheetBg} onClick={() => window.history.back()}>
          <div style={{ ...sheet, overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => window.history.back())} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ position: "relative" }}>
              <button onClick={() => window.history.back()} aria-label="Back" style={{ position: "absolute", top: "max(8px, env(safe-area-inset-top))", left: 12, zIndex: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,.28)", background: "rgba(13,17,23,.55)", backdropFilter: "blur(6px)", color: "#fff", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg></button>
              {detail.photos && detail.photos.length > 0 ? (
                <div style={{ position: "relative" }}>
                  <div ref={galleryRef} style={{ display: "flex", gap: 6, overflowX: "auto", scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
                    {detail.photos.map((src, i) => (
                      <FallbackImg key={i} src={src} icon={detail._event ? "🎟️" : "🍽️"} onClick={() => setLightbox(src)} style={{ width: "100%", flexShrink: 0, height: 250, objectFit: "cover", scrollSnapAlign: "start", cursor: "zoom-in" }} />
                    ))}
                  </div>
                  {detail.photos.length > 1 && (
                    <>
                      <button onClick={() => scrollGallery(-1)} aria-label="Previous photo" style={galleryBtn("left")}>‹</button>
                      <button onClick={() => scrollGallery(1)} aria-label="Next photo" style={galleryBtn("right")}>›</button>
                    </>
                  )}
                </div>
              ) : detail._event && !detail.photo ? (
                <div style={{ width: "100%", height: 250, background: `linear-gradient(150deg, ${C.adim} 0%, #0D1117 78%)`, display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 54, opacity: 0.5 }}>🎟️</span></div>
              ) : (
                <FallbackImg src={detail.photo} icon={detail._event ? "🎟️" : "🍽️"} onClick={() => detail.photo && setLightbox(detail.photo)} style={{ width: "100%", height: 250, objectFit: "cover", cursor: detail.photo ? "zoom-in" : "default" }} />
              )}
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "48px 18px 15px", background: "linear-gradient(180deg, transparent 0%, rgba(0,0,0,.45) 45%, rgba(0,0,0,.88) 100%)", pointerEvents: "none" }}>
                {(() => { const pc = primaryCategory(detail); return pc ? <div style={{ fontSize: 11, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.9px", marginBottom: 5, textShadow: "0 1px 5px rgba(0,0,0,.9)" }}>{pc}</div> : null; })()}
                <div style={{ fontSize: 27, fontWeight: 800, color: "#fff", lineHeight: 1.13, letterSpacing: "-0.5px", textShadow: "0 2px 12px rgba(0,0,0,.8)" }}>{detail.name}</div>
              </div>
            </div>
            <div style={{ padding: "16px 16px calc(30px + env(safe-area-inset-bottom))" }}>
              {/* 1. Basics */}

              {detail.address && (
                <a href={detail.mapsUrl} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 12.5, color: C.muted, textDecoration: "none", marginBottom: 14, lineHeight: 1.4 }}>{detail.address}</a>
              )}
              {/* Verdict: one consistent row of the things that decide whether to go */}
              <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 14, fontSize: 13, fontWeight: 700 }}>
                {(() => { const sl = scoreLabel(detail.wfScore); return sl ? <span style={{ color: C.accent, fontWeight: 800 }}>{sl.s}<span style={{ color: C.muted, fontWeight: 700, fontSize: 11.5 }}> / 10</span></span> : null; })()}
                {(() => { const a = new Set((placePosts || []).map((x) => x.user_id)).size; if (!a) return null; return (<><span style={{ color: C.border }}>·</span><span style={{ color: C.muted, fontWeight: 700, fontSize: 11 }}>{a} member take{a === 1 ? "" : "s"}{a >= 3 ? " · in score" : ""}</span></>); })()}
                {detail.rating != null && (<>
                  <span style={{ color: C.border }}>·</span>
                  <span onClick={() => { if (!(detail.reviews > 0)) return; const n = !reviewsOpen; setReviewsOpen(n); if (n) loadFullInsight(detail, detailExtra); }} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.text, cursor: detail.reviews > 0 ? "pointer" : "default" }}><span style={{ color: "#F59E0B" }}>★</span>{detail.rating}{detail.reviews > 0 && <a href={detail.mapsUrl} target="_blank" rel="noreferrer" style={{ color: C.muted, textDecoration: "none" }}><span style={{ color: C.muted, fontWeight: 600 }}>({detail.reviews.toLocaleString()}) ↗</span></a>}</span>
                </>)}
                {detail._event ? (() => {
                  const ef = formatEventDate(detail._event.date, detail._event.time);
                  const d = detail._event.date ? new Date(detail._event.date + "T00:00:00") : null;
                  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
                  const diff = d && !isNaN(d) ? Math.round((d - t0) / 86400000) : null;
                  const when = ef.wd ? (ef.wd + ", " + ef.mo + " " + ef.day + (ef.time ? " · " + ef.time : "")) : (detail._event.time || "");
                  const label = diff == null ? (when || "Event") : diff < 0 ? "Ended" : diff === 0 ? ("Tonight" + (ef.time ? " · " + ef.time : "")) : diff === 1 ? ("Tomorrow" + (ef.time ? " · " + ef.time : "")) : when;
                  return (<>
                    <span style={{ color: C.border }}>·</span>
                    <span style={{ fontWeight: 800, color: diff != null && diff < 0 ? C.muted : C.accent }}>{label}</span>
                    {detail.openNow != null && (<span onClick={() => setHoursOpen((o) => !o)} style={{ cursor: "pointer", fontWeight: 600, fontSize: 11.5, color: C.muted }}>Venue hours</span>)}
                  </>);
                })() : (detail.openNow != null && (<>
                  <span style={{ color: C.border }}>·</span>
                  <span onClick={() => setHoursOpen((o) => !o)} style={{ cursor: "pointer", fontWeight: 800, color: detail.openNow ? C.green : C.red }}>{detail.openNow ? "Open now" : "Closed"}<span style={{ fontSize: 8.5, marginLeft: 3, display: "inline-block", transform: hoursOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span></span>
                </>))}
                {detail.distMi != null && (<><span style={{ color: C.border }}>·</span><a href={directionsUrl(detail) || detail.mapsUrl} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("directions", detail, { src: "meta" }); } catch (e) {} }} style={{ color: C.accent, fontWeight: 700, textDecoration: "none" }}>{detail.distMi.toFixed(1)} mi ▸</a></>)}
                {(() => { const cz = Dining.cuisineLabel(detail) || primaryCategory(detail); return cz ? (<><span style={{ color: C.border }}>·</span><button onClick={() => { try { logEvent("cuisine_link", detail, { cz }); } catch (e) {} openCuisine(cz, detail); }} style={{ background: "transparent", border: "none", padding: 0, color: C.accent, fontWeight: 700, fontSize: "inherit", cursor: "pointer" }}>{cz} ›</button></>) : null; })()}
                {(() => { if (detail._event) return null; const isD = ["Food", "Nightlife"].includes(Ranking.coarseCat(detail) || ""); const cost = isD ? Dining.costForTwo(detail) : null; if (cost && cost.listed) return (<><span style={{ color: C.border }}>·</span><span style={{ color: C.green, fontWeight: 800 }}>{cost.text}</span></>); if (detail.price) return (<><span style={{ color: C.border }}>·</span><span style={{ color: C.green, fontWeight: 800 }}>{detail.price}</span></>); return null; })()}
              </div>
              {!detail._event && Tags.requiresParkAdmission(detail.types) && (
                <div style={{ fontSize: 11.5, fontWeight: 600, color: C.muted, marginTop: -4, marginBottom: 12 }}>May require park admission.</div>
              )}
              {hoursOpen && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", marginBottom: 14 }}>
                  {detailExtra && detailExtra.hours && detailExtra.hours.length > 0 ? (
                    detailExtra.hours.map((line, i) => {
                      const parts = line.split(": ");
                      return (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, color: C.light, padding: "2px 0" }}>
                          <span style={{ fontWeight: 600, color: C.text }}>{parts[0]}</span>
                          <span style={{ textAlign: "right" }}>{parts.slice(1).join(": ")}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: 12.5, color: C.muted }}>{detailExtra ? "Hours not listed for this place." : "Loading hours…"}</div>
                  )}
                  <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.7, marginTop: 8 }}>Hours from Google.</div>
                </div>
              )}

              {/* Action dock: one row. Directions (or Get tickets for events) is the single primary; everything else is a quiet icon. */}
              <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "stretch" }}>
                {detail._event && detail._event.url ? (
                  <a href={ticketUrl(detail._event.url)} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("ticket", null, { src: "detail_primary" }); } catch (e) {} }} style={{ flex: 1, padding: "13px 0", background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none", textAlign: "center" }}>Get tickets ↗</a>
                ) : (
                  <><a href={directionsUrl(detail) || detail.mapsUrl} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("directions", detail); } catch (e) {} }} style={{ flex: 1, padding: "13px 0", background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none", textAlign: "center" }}>Directions ↗</a>{(() => { const _vt = viaTours[detail.id]; const _hasTours = !!(_vt && !_vt.loading && Array.isArray(_vt.items) && _vt.items.length > 0); const _tk = (_hasTours && Aff.ticketsUrl(detail)) ? ("/api/viator/go?q=" + encodeURIComponent(detail.name || "") + "&city=" + encodeURIComponent((() => { try { const parts = String(detail.address || "").split(",").map((x) => x.trim()); return parts.length >= 3 ? parts[1] : ""; } catch { return ""; } })())) : null; const _tu = _tk || Aff.hotelUrl(detail); return _tu ? <a href={_tu} target="_blank" rel="noreferrer" onClick={() => { try { logEvent(_tk ? "tickets_out" : "hotel_out", detail); } catch (e) {} try { addReservation(_tk ? "tickets" : "hotel", detail, _tk ? "Viator" : "Stay22", _tu); } catch (e) {} }} style={{ flex: 1, padding: "13px 0", background: "transparent", border: `1.5px solid ${C.accent}`, borderRadius: 12, color: C.accent, fontSize: 13.5, fontWeight: 800, textDecoration: "none", textAlign: "center", lineHeight: 1.15 }}>{_tk ? "Tickets & tours ↗" : "Check rates ↗"}</a> : null; })()}</>
                )}
                {detail._event && detail._event.url && (
                  <a href={directionsUrl(detail) || detail.mapsUrl} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("directions", detail); } catch (e) {} }} aria-label="Directions" style={{ flexShrink: 0, width: 46, display: "flex", alignItems: "center", justifyContent: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, textDecoration: "none" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7" /><path d="M9 7h8v8" /></svg></a>
                )}
                {!detail._event && (<>
                  <button onClick={() => quickSaveFavorite(detail)} aria-label="Save" style={{ flexShrink: 0, width: 46, background: C.card, border: `1px solid ${isSaved(detail.id) ? C.accent : C.border}`, borderRadius: 12, color: isSaved(detail.id) ? C.accent : C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill={isSaved(detail.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg></button>
                  <button onClick={(e) => toggleLike(e, detail)} aria-label="Like" style={{ flexShrink: 0, width: 46, background: liked[detail.id] ? C.adim : C.card, border: `1px solid ${liked[detail.id] ? C.accent : C.border}`, borderRadius: 12, color: liked[detail.id] ? C.accent : C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v11" /><path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 20H7" /></svg></button>
                  <button onClick={(e) => toggleDislike(e, detail)} aria-label="Not for me" style={{ flexShrink: 0, width: 46, background: C.card, border: `1px solid ${disliked[detail.id] ? C.red : C.border}`, borderRadius: 12, color: disliked[detail.id] ? C.red : C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: "rotate(180deg)" }}><path d="M7 10v11" /><path d="M7 10l4-7c1.5 0 2.5 1 2.5 2.5V10h4.6a2 2 0 0 1 2 2.4l-1.2 6A2 2 0 0 1 17 20H7" /></svg></button>
                </>)}
                <button onClick={() => { shareLink(detail.name, placeShareUrl(detail, locName, blurbs[detail.id]), () => showToast("Link copied"), `Want to go to ${detail.name} together? Found it on Wayfind`, () => { try { logEvent("share", detail, { kind: "place" }); } catch (e) {} giveawayMark(detail.id); addShared(detail); }); }} aria-label="Share" style={{ flexShrink: 0, width: 46, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
              </div>
              {(((viaTours[detail.id] && !viaTours[detail.id].loading && Array.isArray(viaTours[detail.id].items) && viaTours[detail.id].items.length > 0) && Aff.ticketsUrl(detail)) || Aff.hotelUrl(detail)) ? <div style={{ fontSize: 10.5, color: C.muted, margin: "7px 2px 0", textAlign: "center" }}>Wayfind may earn a commission from partner links</div> : null}
              {/* Why Wayfind picked this: the soul of the page. One grounded paragraph merging verdict, tip, timing, fit and caveats. Falls back to composing from the existing grounded fields until a fresh insight carries `why`. */}
              <div style={{ marginBottom: 16, background: `linear-gradient(160deg, ${C.adim} 0%, ${C.card} 62%)`, border: `1px solid ${C.accent}55`, borderRadius: 14, padding: "13px 14px" }}>
                <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>{detail._event ? "Why this venue" : "Why Wayfind picked this"}</div>
                {insightLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginTop: 8 }}>
                    <div style={{ animation: "wfbob 1.1s ease-in-out infinite", display: "flex" }}><Critter size={22} /></div>
                    Reading the reviews
                  </div>
                )}
                {!insightLoading && (() => {
                  const ins = insight && !insight.error && !insight.unavailable ? insight : null;
                  const S = (v) => insightSane(v);
                  const dot = (t) => t && !/[.!?]$/.test(t) ? t + "." : t;
                  let why = ins ? S(ins.why) : "";
                  if (!why && ins) {
                    const goWhen = S(ins.goWhen) || S(ins.bestTime);
                    const skipIf = S(ins.skipIf);
                    why = [dot(S(ins.verdict)), dot(S(ins.whyPicked)), dot(S(ins.tip)), goWhen ? "Go " + dot(goWhen.charAt(0).toLowerCase() + goWhen.slice(1)) : "", skipIf ? "Skip it if " + dot(skipIf.charAt(0).toLowerCase() + skipIf.slice(1)) : ""].filter(Boolean).join(" ");
                  }
                  if (!why) why = detail.rating != null && detail.rating >= 4.3 ? "A highly reviewed nearby option with a strong rating." : "Worth a look while you are nearby.";
                  return <div style={{ fontSize: 14.5, color: C.text, lineHeight: 1.6, marginTop: 8, fontWeight: 500 }}>{why}</div>;
                })()}
              </div>
              {!detail._event && insightFull && Array.isArray(insightFull.mustTry) && insightFull.mustTry.filter((x) => x && String(x).trim()).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 8 }}>{Tags.sectionLabel(Tags.resolveIdentity(detail.types || []))}</div>
                  {insightFull.mustTry.filter((x) => x && String(x).trim()).slice(0, 3).map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 9, marginBottom: 5 }}>
                      <span style={{ color: C.accent, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{i + 1}</span>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>{d}</span>
                    </div>
                  ))}
                  {insightFull.pairing && String(insightFull.pairing).trim() && <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, lineHeight: 1.4 }}><span style={{ color: C.light, fontWeight: 700 }}>Pairs well: </span>{insightFull.pairing}</div>}
                  <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.7, marginTop: 7 }}>From what reviewers mention most.</div>
                </div>
              )}
              {(() => { const _wn = !detail._event ? wayfindNotes(detail.name) : null; if (!_wn) return null; return (
                <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>Insider notes</span>
                    <span style={{ fontSize: 9.5, color: C.muted }}>Curated by Wayfind</span>
                  </div>
                  {_wn.map((n, i) => { const o = typeof n === "string" ? { text: n } : n; return (
                    <div key={i} style={{ marginTop: i ? 8 : 0 }}>
                      <div style={{ fontSize: 13, color: C.text, lineHeight: 1.55 }}>{o.text}</div>
                      {o.url && (
                        <a href={o.url} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("note_link", detail, { label: o.label || "" }); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 7, padding: "9px 15px", borderRadius: 999, background: C.adim, border: `1.5px solid ${C.accent}`, color: C.accent, fontSize: 12.5, fontWeight: 800, textDecoration: "none" }}>🎟 {o.label || "Open link"} ↗</a>
                      )}
                    </div>
                  ); })}
                </div>
              ); })()}
              {/* 3. Insider tip */}
              <div style={{ marginBottom: 16 }}>
              {!detail._event && ["museum", "wildlife", "entertainment", "scenic", "beach", "nature", "landmark", "waterfront"].includes(placeKind(detail)) && (() => {
                const _hasNoteUrl = (() => { const _n = wayfindNotes(detail.name); return !!(_n && _n.some((x) => x && typeof x === "object" && x.url)); })();
                const _vt = viaTours[detail.id];
                const _items = (_vt && _vt.items) || [];
                if (_items.length > 0) {
                  return (
                    <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>🎟️ Book tours & experiences</span>
                        <span style={{ fontSize: 9.5, color: C.muted }}>via Viator</span>
                      </div>
                      {_items.map((t, i) => (
                        <a key={t.code || i} href={t.url} target="_blank" rel="noreferrer" onClick={() => { try { logEvent("tour_card_out", detail, { code: t.code || "" }); } catch (e) {} try { addReservation("tour", detail, "Viator", t.url); } catch (e) {} }} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", padding: "9px 0", borderTop: i ? `1px solid ${C.border}` : "none" }}>
                          {t.image ? <img src={t.image} alt="" style={{ width: 58, height: 58, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} /> : <span style={{ width: 58, height: 58, borderRadius: 10, background: C.adim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>🎟️</span>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
                            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>
                              {t.rating != null && <span style={{ color: C.gold, fontWeight: 700 }}>★ {t.rating}</span>}{t.reviews != null && <span> ({t.reviews.toLocaleString()})</span>}{t.duration && <span> · {t.duration}</span>}{t.fromPrice != null && <span style={{ color: C.green, fontWeight: 700 }}> · from ${t.fromPrice}</span>}
                            </div>
                          </div>
                          <span style={{ color: C.accent, fontSize: 15, fontWeight: 800 }}>↗</span>
                        </a>
                      ))}
                    </div>
                  );
                }
                if (_hasNoteUrl) return null;
                return (
                  <a onClick={() => { try { logEvent("tour", detail); } catch (e) {} }} href={Aff.experienceGoUrl(detail.name, locName ? locName.split(",")[0] : "")} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>🎟️</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Find tours & experiences</div>
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1 }}>Tickets and guided tours nearby, via Viator</div>
                  </div>
                  <span style={{ color: C.accent, fontSize: 16, fontWeight: 800 }}>↗</span>
                </a>
                );
              })()}

              {!detail._event && (
                <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>Community takes</span>
                    {placePosts.length > 0 && <span style={{ fontSize: 10, color: C.muted }}>{placePosts.length}</span>}
                  </div>
                  <div style={{ marginBottom: placePosts.length ? 12 : 0, paddingBottom: placePosts.length ? 12 : 0, borderBottom: placePosts.length ? `1px solid ${C.border}` : "none" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 2 }}>Add yours</div>
                    <div style={{ fontSize: 10.5, color: C.muted, marginBottom: 8 }}>Posts to this page for everyone when you are signed in; saved privately on this device when you are not.</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {["Tip", "Best dish", "Warning", "Review"].map((t) => (
                        <button key={t} onClick={() => setCommentType(t)} style={{ padding: "5px 11px", borderRadius: 999, border: `1px solid ${commentType === t ? C.accent : C.border}`, background: commentType === t ? C.adim : "transparent", color: commentType === t ? C.accent : C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>{t}</button>
                      ))}
                    </div>
                    <textarea key={detail.id} ref={noteRef} defaultValue={(placeComments[detail.id] && placeComments[detail.id].text) || ""} placeholder={"Share your " + commentType.toLowerCase() + " for this place."} rows={3} style={{ width: "100%", resize: "vertical", background: "rgba(22,27,34,.75)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", color: C.text, fontSize: 13.5, lineHeight: 1.45, fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
                      <button onClick={() => { const v = (noteRef.current && noteRef.current.value ? noteRef.current.value : "").trim(); const next = { ...placeComments }; if (v) next[detail.id] = { type: commentType, text: v }; else delete next[detail.id]; setPlaceComments(next); try { localStorage.setItem("wf_place_comments", JSON.stringify(next)); } catch (e) {} const posting = !!(supabase && user && v); if (v && supabase && !user) { setAuthOpen(true); } showToast(v ? (posting ? "Saving…" : commentType + " saved on this device — sign in to post to everyone") : "Cleared"); try { logEvent("user_comment", detail, { type: commentType, len: v.length, posted: posting }); } catch (e) {} if (posting) { try { supabase.auth.getSession().then(({ data: _sd }) => { const _u = _sd && _sd.session && _sd.session.user; if (!_u) { setAuthOpen(true); showToast("Session expired — sign in and tap Save again"); return; } const author = ((_u.email || "member").split("@")[0] || "member").slice(0, 24); supabase.from("comments").upsert({ place_id: detail.id, place_name: detail.name || "", user_id: _u.id, author, type: commentType, body: v.slice(0, 600), updated_at: new Date().toISOString() }, { onConflict: "user_id,place_id" }).then((res) => { if (res && res.error) { showToast("Couldn't post: " + String((res.error && res.error.message) || "server error").slice(0, 90) + " — saved on this device"); try { console.error("[wayfind comment]", res.error.message || res.error); } catch (e2) {} } else { showToast(commentType + " posted"); setPlacePosts((pp) => [{ place_id: detail.id, user_id: _u.id, author, type: commentType, body: v.slice(0, 600), created_at: new Date().toISOString() }, ...(pp || []).filter((x) => x.user_id !== _u.id)]); } }, (err) => { showToast("Couldn't post: " + String((err && err.message) || "network error").slice(0, 90) + " — saved on this device"); try { console.error("[wayfind comment]", err); } catch (e2) {} }); }, () => { showToast("Couldn't reach the server — saved on this device"); }); } catch (e) {} } }} style={{ padding: "8px 18px", background: "transparent", border: `1.5px solid ${C.accent}`, borderRadius: 12, color: C.accent, fontSize: 13, fontWeight: 800, cursor: "pointer" }}>Save</button>
                      {placeComments[detail.id] && <span style={{ fontSize: 11, color: C.muted }}>Saved as <span style={{ color: C.accent, fontWeight: 700 }}>{placeComments[detail.id].type}</span></span>}
                    </div>
                  </div>
                  {placePosts.length > 0 ? placePosts.slice(0, 6).map((cp, i) => (
                    <div key={cp.id || i} style={{ paddingTop: 10, marginTop: i ? 10 : 0, borderTop: `1px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: C.light }}>{cp.author || "member"}</span>
                        <span style={{ fontSize: 9, fontWeight: 800, color: C.accent, background: C.adim, border: `1px solid ${C.accent}44`, borderRadius: 999, padding: "2px 8px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{cp.type}</span>
                        {user && cp.user_id === user.id && (
                          <span style={{ marginLeft: "auto", display: "inline-flex", gap: 10 }}>
                            <button onClick={() => { setCommentType(cp.type || "Tip"); if (noteRef.current) { noteRef.current.value = cp.body || ""; noteRef.current.focus(); } }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>Edit</button>
                            {confirmDel ? (
                              <button onClick={() => { try { supabase.from("comments").delete().eq("user_id", user.id).eq("place_id", detail.id).then(() => {}, () => {}); } catch (e) {} setPlacePosts((pp) => (pp || []).filter((x) => x.user_id !== user.id)); const next = { ...placeComments }; delete next[detail.id]; setPlaceComments(next); try { localStorage.setItem("wf_place_comments", JSON.stringify(next)); } catch (e) {} if (noteRef.current) noteRef.current.value = ""; setConfirmDel(false); showToast("Deleted"); try { logEvent("user_comment_delete", detail, {}); } catch (e) {} }} style={{ background: "transparent", border: "none", color: "#F26D6D", fontSize: 10.5, fontWeight: 800, cursor: "pointer", padding: 0 }}>Confirm delete</button>
                            ) : (
                              <button onClick={() => { setConfirmDel(true); setTimeout(() => setConfirmDel(false), 3500); }} style={{ background: "transparent", border: "none", color: C.muted, fontSize: 10.5, fontWeight: 700, cursor: "pointer", padding: 0 }}>Delete</button>
                            )}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.text, lineHeight: 1.5 }}>{cp.body}</div>
                    </div>
                  )) : (
                    <div style={{ fontSize: 11.5, color: C.muted, marginTop: 10 }}>Be the first to share a tip for this place.</div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 }}>
                <FeaturedTag name={detail.name} />
                {experienceBadges(detail, null, 4).map((b) => (
                  <button key={b.key} onClick={() => { setDetail(null); openExperience(b.key); }} style={{ fontSize: 12, fontWeight: 700, color: C.light, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: "5px 11px", cursor: "pointer" }}>{b.label}</button>
                ))}
              </div>

              {detail._event && (() => {
                const ef = formatEventDate(detail._event.date, detail._event.time);
                const human = ef.wd ? (ef.wd + ", " + ef.mo + " " + ef.day + (ef.time ? " · " + ef.time : "")) : (ef.time || [detail._event.date, detail._event.time].filter(Boolean).join(" · "));
                const url = detail._event.url || "";
                const hasTickets = /ticket|seatgeek|stubhub|axs|livenation|eventbrite/i.test(url);
                const place = locName ? locName.split(",")[0] : "you";
                const why = [];
                if (detail.rating != null) why.push("★ " + detail.rating + " venue"); else why.push("at " + detail.name);
                if (detail.distMi != null) why.push(detail.distMi.toFixed(1) + " mi from " + place);
                return (
                  <div style={{ border: `1.5px solid ${C.accent}`, borderRadius: 16, overflow: "hidden", marginBottom: 14, background: `linear-gradient(160deg, ${C.adim} 0%, ${C.card} 70%)` }}>
                    <div style={{ padding: "14px 15px" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>Know before you go</div>
                      <div style={{ fontSize: 10.5, color: C.muted, marginTop: 3, marginBottom: 8 }}>Event time from the venue listing.</div>
                      <div style={{ fontSize: 10.5, fontWeight: 800, color: C.accent, textTransform: "uppercase", letterSpacing: "0.7px", marginBottom: 6 }}>🎟️ Upcoming event</div>
                      <div style={{ fontSize: 19, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>{detail._event.name}</div>
                      {human && <div style={{ fontSize: 14, fontWeight: 800, color: C.accent, marginTop: 7 }}>{human}</div>}
                      <div style={{ fontSize: 13, color: C.light, marginTop: 5 }}>📍 {detail.name}{detail.distMi != null ? " · " + detail.distMi.toFixed(1) + " mi" : ""}</div>
                      {why.length > 0 && <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.45, marginTop: 7 }}>{why.join(", ") + "."}</div>}
                      {url && <a href={url} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", marginTop: 12, padding: 12, background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>{hasTickets ? "Get tickets ↗" : "View event ↗"}</a>}
                    </div>
                  </div>
                );
              })()}
              {reviewsOpen && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 10 }}>What people say</div>
                  {insightFullLoading && !insightFull && <div style={{ fontSize: 13, color: C.muted, marginBottom: 8 }}>Reading the reviews…</div>}
                  {insightFull && !insightFull.error && (() => {
                    const A = (v) => (Array.isArray(v) ? v.filter((x) => x && String(x).trim()) : []);
                    const loves = A(insightFull.loves);
                    const keywords = A(insightFull.keywords);
                    if (!loves.length && !keywords.length) return null;
                    return (
                      <div style={{ marginBottom: 12 }}>
                        {loves.length > 0 && loves.slice(0, 5).map((l, i) => (
                          <div key={i} style={{ fontSize: 13.5, color: C.text, display: "flex", gap: 8, padding: "3px 0" }}><span style={{ color: C.green }}>✔</span><span>{l}</span></div>
                        ))}
                        {keywords.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                            {keywords.slice(0, 6).map((k, i) => (
                              <span key={i} style={{ fontSize: 11, fontWeight: 600, color: C.light, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 999, padding: "3px 10px" }}>{k}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Reviews</div>
                  {detailExtra && detailExtra.reviews && detailExtra.reviews.length > 0 ? (
                    detailExtra.reviews.map((r, i) => (
                      <div key={i} style={{ marginBottom: i < detailExtra.reviews.length - 1 ? 12 : 0, paddingBottom: i < detailExtra.reviews.length - 1 ? 12 : 0, borderBottom: i < detailExtra.reviews.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                          {r.rating && <span style={{ color: "#F59E0B", fontSize: 12 }}>{stars(r.rating)}</span>}
                          {r.author && <span style={{ fontSize: 11, color: C.muted }}>{r.author}</span>}
                          {r.when && <span style={{ fontSize: 11, color: C.muted }}>· {r.when}</span>}
                        </div>
                        <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5 }}>{r.text}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ fontSize: 13, color: C.muted }}>No review text available for this place.</div>
                  )}
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 10 }}>Reviews from Google, which shares up to five per place. The good, the bad, and everything between. No invented numbers.</div>
                  <a href={`https://search.google.com/local/reviews?placeid=${detail.id}`} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 10, fontSize: 12.5, fontWeight: 800, color: C.accent, textDecoration: "none" }}>Read all reviews on Google ↗</a>
                </div>
              )}

              {detailExtra && detailExtra.editorial && (
                <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.5, marginBottom: 14, paddingLeft: 10, borderLeft: `3px solid ${C.border}` }}>{detailExtra.editorial}</div>
              )}

              {/* Worth the Drive? widget — shows for far-away places or when opened from the drive hook */}
              {detail && (detailContext === "drive" || (detail.distMi != null && detail.distMi >= 20)) && (
                <WorthTheDriveWidget
                  place={detail}
                  myVote={(myVotes || {})[detail.id]}
                  votes={(communityVotes || {})[detail.id]}
                  onVote={(v) => handleVote(detail, v)}
                />
              )}

              {/* v6.25: founder curated note, shown only for properties in CURATED_NOTES. Hand-written, leads the page. */}
              {(() => { const cn = curatedNote(detail); if (!cn) return null; return (
                <div style={{ background: `linear-gradient(135deg, ${C.adim} 0%, ${C.card} 55%)`, border: `1px solid ${C.accent}55`, borderRadius: 14, padding: "14px 15px", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: cn.intro ? 3 : 10 }}>
                    <span style={{ fontSize: 15 }}>📌</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: C.accent, letterSpacing: "0.6px", textTransform: "uppercase" }}>{cn.title}</span>
                  </div>
                  {cn.intro && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 11 }}>{cn.intro}</div>}
                  {cn.items.map((it, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: i < cn.items.length - 1 ? 11 : 0 }}>
                      <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.3 }}>{it.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, lineHeight: 1.35 }}>{it.head}</div>
                        <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.5, marginTop: 2 }}>{it.body}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ); })()}

              {/* 2. Why Wayfind picked it — a judgment-driven decision reason, not a formula. No expand button; the deeper context lives in the insider tip and Tips, videos & more. */}
              {/* Viator experiences: shown only for activity-type places Viator actually sells (attractions, museums, nature, scenic, etc.), never restaurants, bars, or hotels. This is an affiliate link, disclosed in Terms; it is tracked once a Partner ID is set in AFFIL and works untracked until then. */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
                {showMore && (
                  <div style={{ marginTop: 10 }}>
                    {insightFullLoading && !insightFull && <div style={{ fontSize: 13, color: C.muted }}>Pulling the details together…</div>}
                    {insightFull && !insightFull.error && !insightFull.unavailable && (() => {
                      const A = (v) => (Array.isArray(v) ? v.filter((x) => x && String(x).trim()) : []);
                      const goodFor = A(insightFull.goodFor);
                      const tips = A(insightFull.tips);
                      const lab = { fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", margin: "12px 0 7px" };
                      return (
                        <div>
                          {goodFor.length > 0 && (
                            <>
                              <div style={lab}>Good for</div>
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {goodFor.slice(0, 6).map((g, i) => (
                                  <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.text, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, padding: "5px 12px" }}><span style={{ color: C.green, fontWeight: 800 }}>✓</span>{g}</span>
                                ))}
                              </div>
                            </>
                          )}
                          {(() => {
                            const mt = Array.isArray(insightFull.mustTry) ? insightFull.mustTry.filter((x) => x && String(x).trim()) : (insightFull.mustTry && String(insightFull.mustTry).trim() ? [insightFull.mustTry] : []);
                            if (!mt.length) return null;
                            return (
                              <>
                                <div style={lab}>Must try</div>
                                <div style={{ background: C.adim, border: `1px solid ${C.accent}`, borderRadius: 10, padding: "10px 12px" }}>
                                  {mt.slice(0, 3).map((m, i) => (
                                    <div key={i} style={{ fontSize: 14, fontWeight: 600, color: C.text, display: "flex", gap: 8, padding: "2px 0" }}><span>🍴</span><span>{m}</span></div>
                                  ))}
                                </div>
                              </>
                            );
                          })()}
                          {tips.length > 0 && (
                            <>
                              <div style={lab}>Insider tips</div>
                              {tips.slice(0, 4).map((t, i) => (
                                <div key={i} style={{ fontSize: 13, color: C.light, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 6, display: "flex", gap: 8 }}><span>💡</span><span>{t}</span></div>
                              ))}
                            </>
                          )}
                          {insightFull.vibe && String(insightFull.vibe).trim() && (
                            <div style={{ marginTop: 10 }}><InfoChip label="Vibe" value={insightFull.vibe} /></div>
                          )}
                        </div>
                      );
                    })()}
                    {insightFull && insightFull.error && (
                      <div style={{ fontSize: 13, color: C.muted }}>That's everything we have on this spot for now.</div>
                    )}
                    {(videosLoading || (videos && videos.length > 0)) && (
                      <div style={{ marginTop: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: C.text, marginBottom: 2, display: "flex", alignItems: "center", gap: 7 }}><span style={{ color: "#FF0000", fontSize: 14 }}>▶</span> Video reviews</div>
                        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>Creators who covered this place on YouTube.</div>
                        {videosLoading && !videos ? (
                          <div style={{ fontSize: 13, color: C.muted }}>Finding videos…</div>
                        ) : (
                          videos.map((v) => (
                            <a key={v.id} href={v.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 10, marginBottom: 10, textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>
                              {v.thumb && <FallbackImg src={v.thumb} icon="▶️" style={{ width: 120, height: 68, objectFit: "cover", flexShrink: 0 }} />}
                              <div style={{ padding: "7px 8px 7px 0", minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.title}</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{v.channel}</div>
                              </div>
                            </a>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>


              {/* 5. Optional collapsed */}
              <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginBottom: 4 }}>
                <div onClick={() => { const n = !venueEventsOpen; setVenueEventsOpen(n); if (n && venueEvents === null && !venueEventsLoading) loadVenueEvents(detail); }} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontSize: 13, fontWeight: 700, color: C.text }}>
                  <span>What's happening nearby</span>
                  <span style={{ fontSize: 12, color: C.accent, fontWeight: 800 }}>{venueEventsOpen ? "▴" : "▾"}</span>
                </div>
                {venueEventsOpen && (
                  <div style={{ marginTop: 10 }}>
                    {venueEventsLoading && <div style={{ fontSize: 13, color: C.muted }}>Checking Ticketmaster…</div>}
                    {!venueEventsLoading && venueEvents && venueEvents.length > 0 && (
                      <>
                        {venueEvents.map((e) => {
                          const f = formatEventDate(e.date, e.time);
                          return (
                            <a key={e.id} href={e.url} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 10, alignItems: "center", textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 11px", marginBottom: 7 }}>
                              <div style={{ flexShrink: 0, textAlign: "center", minWidth: 34 }}>
                                <div style={{ fontSize: 9, fontWeight: 800, color: C.accent, textTransform: "uppercase" }}>{f.mo}</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1 }}>{f.day}</div>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.venue ? `📍 ${e.venue} · ` : ""}{f.wd}{f.time ? ` · ${f.time}` : ""}{e.price ? ` · ${e.price}` : ""}</div>
                              </div>
                              <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: C.accent }}>{e.ticketed === false ? "Details ↗" : "Tickets ↗"}</span>
                            </a>
                          );
                        })}
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Ticketed events at or near this location, from Ticketmaster. Check the venue on each before you go.</div>
                      </>
                    )}
                    {!venueEventsLoading && venueEvents && venueEvents.length === 0 && (
                      <div style={{ fontSize: 12.5, color: C.muted }}>No ticketed events found near here right now. Casual or free live music will not show up here, since only ticketed events are listed.</div>
                    )}
                  </div>
                )}
              </div>
              </div>

              {detailExtra && (detailExtra.phone || detailExtra.website) && (
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {detailExtra.phone && <a href={"tel:" + detailExtra.phone} style={{ flex: 1, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 600, textDecoration: "none", textAlign: "center" }}>📞 Call</a>}
                  {detailExtra.website && <a href={detailExtra.website} target="_blank" rel="noreferrer" style={{ flex: 1, padding: 13, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 15, fontWeight: 600, textDecoration: "none", textAlign: "center" }}>🌐 Website ↗</a>}
                </div>
              )}

              {detail && offers[detail.id] && (() => {
                const o0 = offers[detail.id];
                const o = { ...o0, offer_title: o0.offer_title || o0.title, offer_description: o0.offer_description || o0.description, affiliate_url: o0.affiliate_url || o0.url, expiration_date: o0.expiration_date || (o0.expires_at ? String(o0.expires_at).slice(0, 10) : null) };
                return (
                  <div style={{ background: `linear-gradient(150deg, ${C.adim} 0%, ${C.card} 70%)`, border: `1px solid ${C.accent}`, borderRadius: 14, padding: 14, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#0D1117", background: C.accent, borderRadius: 999, padding: "2px 9px" }}>{offerLabel(o)}</span>
                      {o.last_verified_at && <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>✓ Verified</span>}
                    </div>
                    <div style={{ fontSize: 15.5, fontWeight: 800, color: C.text }}>{o.offer_title}</div>
                    {o.offer_description && <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, marginTop: 5 }}>{o.offer_description}</div>}
                    {o.terms && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 6, lineHeight: 1.4 }}>{o.terms}</div>}
                    {o.expiration_date && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4 }}>Through {o.expiration_date}</div>}
                    {(o.affiliate_url || o.direct_url) && <a href={o.affiliate_url || o.direct_url} target="_blank" rel="noreferrer" onClick={() => logEvent("offer_redeem", detail, { offer_id: o.id, source: o.source })} style={{ display: "block", textAlign: "center", marginTop: 10, padding: 12, background: C.accent, borderRadius: 12, color: "#0D1117", fontSize: 14.5, fontWeight: 800, textDecoration: "none" }}>{o.coupon_code ? "Show code" : "View offer ↗"}</a>}
                    {o.coupon_code && <div style={{ textAlign: "center", fontSize: 13, fontWeight: 800, color: C.accent, marginTop: 8, letterSpacing: "0.5px" }}>Code: {o.coupon_code}</div>}
                    <div onClick={() => { logEvent("offer_report", detail, { offer_id: o.id }); showToast("Thanks, we will take a look"); }} style={{ textAlign: "center", fontSize: 11, color: C.muted, marginTop: 10, cursor: "pointer", textDecoration: "underline" }}>Report an issue</div>
                  </div>
                );
              })()}

              {isBeach(detail) && (
                <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#2DD4BF", marginBottom: 8 }}>🏖️ Beach conditions</div>
                  {beachCondLoading && <div style={{ fontSize: 13, color: C.muted }}>Checking wind and water…</div>}
                  {!beachCondLoading && beachCond && (() => {
                    const bc = beachCond;
                    const dir = bc.windDir != null ? compass(bc.windDir) : null;
                    const opp = bc.windDir != null ? compass((bc.windDir + 180) % 360) : null;
                    let shore = null;
                    if (bc.windDir != null && bc.waveDir != null) {
                      let diff = Math.abs(bc.windDir - bc.waveDir) % 360;
                      if (diff > 180) diff = 360 - diff;
                      shore = diff <= 60 ? "onshore" : diff >= 120 ? "offshore" : "cross";
                    }
                    const waveFt = bc.waveHeight != null ? (bc.waveHeight * 3.281).toFixed(1) : null;
                    const hasAny = bc.wind != null || shore || waveFt;
                    return (
                      <div>
                        {bc.wind != null && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>💨 Wind {bc.wind} mph{bc.gust ? " (gusts " + bc.gust + ")" : ""}{dir ? " from the " + dir : ""}</div>}
                        {shore && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>🧭 {shore === "onshore" ? "Blowing in off the water" : shore === "offshore" ? "Blowing out toward the water" : "Blowing along the beach"}</div>}
                        {waveFt && <div style={{ fontSize: 13.5, color: C.text, marginBottom: 6 }}>🌊 Waves about {waveFt} ft{bc.wavePeriod != null ? ", " + Math.round(bc.wavePeriod) + "s apart" : ""}</div>}
                        {dir && <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, marginTop: 4 }}>Tent tip: the wind comes from the {dir}, so set your tent or windbreak with the opening facing the {opp}, away from the wind.</div>}
                        {!hasAny && <div style={{ fontSize: 13, color: C.muted }}>Live conditions are not available for this spot right now.</div>}
                      </div>
                    );
                  })()}
                  {!beachCondLoading && !beachCond && <div style={{ fontSize: 13, color: C.muted }}>Live conditions aren't available right now.</div>}
                </div>
              )}



              {/* Hours now expand from the Open/Closed status badge near the title. */}

              {debugOn && !detail._event && (() => {
                const audit = {};
                experienceBadges(detail, null, 99, audit);
                const ai = insight && !insight.error && !insight.unavailable ? insight : {};
                const aiRow = (k) => { const v = ai[k]; const has = Array.isArray(v) ? v.filter(Boolean).length > 0 : !!(v && String(v).trim()); return k + ": " + (has ? "shown" : "empty/hidden"); };
                return (
                  <div style={{ marginBottom: 16, padding: "10px 12px", background: "#0A0E14", border: "1px dashed #30363D", borderRadius: 10, fontFamily: "ui-monospace, monospace", fontSize: 10.5, color: "#8B949E", lineHeight: 1.6, overflowWrap: "anywhere" }}>
                    <div style={{ color: "#F97316", fontWeight: 800 }}>TRUST AUDIT</div>
                    <div>identity: {audit.identity}</div>
                    <div>types: {(detail.types || []).join(", ") || "none"}</div>
                    <div>candidates: {(audit.candidates || []).join(", ") || "none"}</div>
                    <div>shown: {(audit.shown || []).join(", ") || "none"}</div>
                    <div>blocked: {(audit.blocked || []).map((b) => b.key + " (" + b.reason + ")").join("; ") || "none"}</div>
                    <div>park admission cue: {String(Tags.requiresParkAdmission(detail.types))}</div>
                    <div>ai fields: {["verdict", "bestFor", "goWhen", "skipIf", "whyPicked", "tip", "caution", "mustTry"].map(aiRow).join(" · ")}</div>
                  </div>
                );
              })()}
              {/* v6.25: "More like this" — similar experience among loaded places, matched on shared traits. */}
              {!detail._event && (() => {
                const simPool = dedupePlaces([...(suggested || []), ...places]);
                const badgesOf = (x) => { try { return new Set(experienceBadges(x, null, 99).map((b) => b.key)); } catch (er) { return new Set(); } };
                const sim = similarPlaces(simPool, detail, 4, badgesOf);
                if (sim.length === 0) return null;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>More like {detail.name}</div>
                    <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>Spots nearby with a similar vibe and crowd, matched on what this place is known for.</div>
                    {sim.map((p) => (
                      <div key={"sim-" + p.id} onClick={() => openDetail(p)} style={{ display: "flex", gap: 11, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 10, marginBottom: 8, cursor: "pointer" }}>
                        <FallbackImg src={p.photo} icon="📍" style={{ width: 58, height: 58, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2 }}>
                            {(() => { const cz = Dining.cuisineLabel(p); return cz ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.light }}>{cz}</span> : null; })()}
                            {p.rating != null && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {p.rating}</span>}
                            {p.openNow === true && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>· Open</span>}
                            {p.openNow === false && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.red }}>· Closed</span>}
                            {p.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                          </div>
                        </div>
                        <span style={{ fontSize: 18, color: C.muted, flexShrink: 0 }}>›</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {(() => {
                const altPool = dedupePlaces([...(suggested || []), ...places]);
                const alts = betterAlternatives(detail, altPool, 3);
                const Row = (p, reasons, knownFor) => (
                  <div key={"alt-" + p.id} onClick={() => openDetail(p)} style={{ display: "flex", gap: 11, alignItems: "center", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 10, marginBottom: 8, cursor: "pointer" }}>
                    <FallbackImg src={p.photo} icon="📍" style={{ width: 58, height: 58, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 2 }}>
                        {p.rating != null && <span style={{ fontSize: 12, color: "#F59E0B" }}>★ {p.rating}</span>}
                        {p.openNow === true && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>· Open</span>}
                        {p.openNow === false && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.red }}>· Closed</span>}
                        {p.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                      </div>
                      {reasons && reasons.length > 0 && <div style={{ fontSize: 12, color: C.light, fontWeight: 600, lineHeight: 1.4, marginTop: 3 }}>{reasons.join(" · ")}</div>}
                      {knownFor ? <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.4, marginTop: 2 }}>{knownFor.charAt(0).toUpperCase() + knownFor.slice(1)}</div> : null}
                    </div>
                    <span style={{ fontSize: 18, color: C.muted, flexShrink: 0 }}>›</span>
                  </div>
                );
                if (alts.length > 0) {
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>Worth comparing nearby</div>
                      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>Other strong spots nearby, in case you want to compare.</div>
                      {alts.map(({ p, reasons, knownFor }) => Row(p, reasons, knownFor))}
                    </div>
                  );
                }
                const others = relatedPicks(altPool, detail, 4).filter((p) => p && p.id !== detail.id).slice(0, 3);
                if (others.length === 0) return null;
                return (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 3 }}>One of the strongest nearby</div>
                    <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 10 }}>Nothing close by clearly beats this pick right now. If you still want to compare, these are the next best in the same vein.</div>
                    {others.map((p) => Row(p, null))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {allExpOpen && (
        <div onClick={() => setAllExpOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
          <div onClick={(ev) => ev.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAllExpOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd} style={{ background: C.panel, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "82dvh", overflowY: "auto", overscrollBehaviorY: "contain", transition: SHEET_EASE, padding: "6px 16px calc(18px + env(safe-area-inset-bottom))" }}>
            <Grabber />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>All experiences</div>
              <button onClick={() => setAllExpOpen(false)} aria-label="Close" style={{ background: C.card, border: `1px solid ${C.border}`, color: C.text, borderRadius: 999, width: 34, height: 34, fontSize: 16, cursor: "pointer" }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
      {hookDetail && (() => {
        // Merge the two source lists, but de-dupe by id — a place that appears
        // in both the suggested feed and the nearby search would otherwise show
        // up twice in a themed list.
        const allSrc = dedupePlaces([...(suggested || []), ...places], true);
        const acc = hookDetail.accent || C.accent;
        const theme = hookDetail.theme || "best";
        const isLiked = hookLikes.has(hookDetail.id);
        const primaryId = hookDetail.placeId;

        // Theme-specific place curation — each theme shows the right number
        // of places, curated from real data. "Top 5" = exactly 5. "Skip" = 3.
        const byScore = [...allSrc].sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));
        let themePlaces = hookDetail.places || placesForHook(hookDetail, allSrc);

        if (themePlaces.length === 0 && primaryId) {
          const pri = allSrc.find((x) => x.id === primaryId);
          if (pri) themePlaces = [pri];
        }
        // Safety net: no theme should ever render the same place twice.
        themePlaces = themePlaces.filter((p, i, a) => p && p.id && a.findIndex((x) => x && x.id === p.id) === i);
        if (hkSort === "near") themePlaces = themePlaces.slice().sort((a, b) => (a.distMi ?? 1e12) - (b.distMi ?? 1e12));
        else if (hkSort === "rated") themePlaces = themePlaces.slice().sort((a, b) => ((b.rating || 0) - (a.rating || 0)) || ((b.reviews || 0) - (a.reviews || 0)));
        else if (hkSort === "price") themePlaces = themePlaces.slice().sort((a, b) => (((a.price_level ?? a.priceLevel ?? 9)) - ((b.price_level ?? b.priceLevel ?? 9))) || ((b.rating || 0) - (a.rating || 0)));
        if (hkMi < 60) themePlaces = themePlaces.filter((p) => p.distMi == null || p.distMi <= hkMi);
        if (hkDeals) themePlaces = themePlaces.filter((p) => offers[p.id]);
        const sheetLoading = !!(hookDetail.fetchKey && !hookDetail.places);

        const MEDALS = { 0: "🥇", 1: "🥈", 2: "🥉" };
        const rankColours = { 0: "#FBBF24", 1: "#CBD5E1", 2: "#CD7F32" };
        const showRank = theme === "top5" || theme === "best";
        const showWarn = theme === "skip";

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 950, background: C.bg, display: "flex", flexDirection: "column", overflowY: "hidden", alignItems: isDesktop ? "center" : "stretch" }}>
            {/* Gradient hero header */}
            <div style={{ background: `linear-gradient(155deg, ${acc}2A 0%, ${C.bg} 72%)`, borderBottom: `1px solid ${acc}35`, padding: "max(16px, calc(env(safe-area-inset-top) + 12px)) 16px 18px", flexShrink: 0, width: "100%", maxWidth: isDesktop ? 880 : "none", boxSizing: "border-box" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <button onClick={() => setHookDetail(null)} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 999, color: acc, fontSize: 14, fontWeight: 800, cursor: "pointer", padding: "8px 15px" }}>‹ Back</button>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {(() => { const u = mapsRouteUrl(themePlaces); return u ? (
                    <a href={u} target="_blank" rel="noreferrer" aria-label="Open this list in Google Maps" title="Open in Maps" onClick={() => { try { logEvent("maps_list", null, { theme, n: Math.min(themePlaces.length, 9) }); } catch (e) {} }} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, textDecoration: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3 3.6 5.4A1 1 0 0 0 3 6.3V20l6-2.5 6 2.5 5.4-2.4a1 1 0 0 0 .6-.9V3l-6 2.5Z" /><path d="M9 3v14.5" /><path d="M15 5.5V20" /></svg></a>
                  ) : null; })()}
                  <button onClick={() => { const _k = (hookDetail && (hookDetail.key || hookDetail.id)) || theme; const _t = (hookDetail && (hookDetail.title || hookDetail.label)) || "Top picks"; shareLink(_t, listShareUrl(_k, _t, themePlaces.length, locName, hookDetail.hol || ""), () => showToast("Link copied"), "Check this Wayfind list: " + _t, () => { try { logEvent("share", null, { kind: "list", theme: _k }); } catch (e) {} giveawayMark("list:" + _k); }); }} aria-label="Share list" title="Share list" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", border: `1.5px solid ${C.border}`, background: "transparent", color: C.muted, cursor: "pointer" }}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg></button>
                  <button onClick={() => { toggleHookLike(hookDetail.id); saveHookList(hookDetail, themePlaces); }} aria-label={isLiked ? "Saved to lists" : "Save to lists"} title={isLiked ? "Saved to lists" : "Save to lists"} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, borderRadius: "50%", background: isLiked ? acc + "25" : "transparent", border: `1.5px solid ${isLiked ? acc : C.border}`, color: isLiked ? acc : C.muted, cursor: "pointer" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={isLiked ? acc : "none"} stroke={isLiked ? acc : C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg>
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 10, fontWeight: 800, color: acc, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 7 }}>{hookDetail.emoji} {hookDetail.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.text, lineHeight: 1.25, marginBottom: hookDetail.themeBody ? 10 : 4 }}>
                {hookDetail.themeTitle || hookDetail.hook}
              </div>
              {hookDetail.themeBody && (
                <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.6, marginBottom: 8 }}>{hookDetail.themeBody}</div>
              )}
              <div style={{ fontSize: 11.5, color: C.muted, fontWeight: 600 }}>
                {sheetLoading ? "Finding the best picks near you…" : (themePlaces.length + " " + (theme === "skip" ? "to avoid" : theme === "drive" ? "worth the trip" : "curated picks") + " · Tap any to see full details")}
              </div>
              <div style={{ marginTop: 10 }}>
                <SortControl sortBy={hkSort} onSort={setHkSort} mi={hkMi} onMi={setHkMi} where={cityNow} dealsAvailable={Object.keys(offers).length > 0} dealsOnly={hkDeals} onDeals={setHkDeals} />
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>Rankings are merit-based. Affiliate links never change placement.</div>
            </div>

            {/* Scrollable editorial list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px calc(24px + env(safe-area-inset-bottom))", width: "100%", maxWidth: isDesktop ? 880 : "none", boxSizing: "border-box" }}>
              {sheetLoading && <Loader label="Finding the best picks" pad="28px 0" />}
              {!sheetLoading && themePlaces.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted }}>
                  <div style={{ display: "inline-flex", animation: "wfbob 1.4s ease-in-out infinite", marginBottom: 12 }}><Critter size={48} /></div>
                  <div style={{ fontSize: 14, color: C.light }}>Not enough data for this filter right now</div>
                </div>
              )}

              {themePlaces.map((p, i) => {
                const isFeatured = i === 0;
                const medalEmoji = MEDALS[i];
                const rankColor = rankColours[i] || C.accent;
                const _isWC = !!(hookDetail && hookDetail.hol === "worldcup");
                const _wcb = _isWC ? WCC.wcBadge(p, themePlaces) : null;
                const badges = _isWC ? (_wcb ? [{ key: "wc", icon: _wcb.icon, label: _wcb.label }] : []) : experienceBadges(p, null, 2);
                return (
                  <Fragment key={p.id}>
                    {hookDetail.sections && (() => { let acc = 0; for (const sec of hookDetail.sections) { if (i === acc) return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.9px", textTransform: "uppercase", color: C.accent, margin: i === 0 ? "2px 2px 10px" : "18px 2px 10px" }}>{sec.label}</div>; acc += sec.count; } return null; })()}
                  <div
                    onClick={() => { setHookDetail(null); openDetail(p, hookDetail.theme); }}
                    style={{
                      background: isFeatured ? `linear-gradient(135deg, ${acc}18 0%, ${C.card} 60%)` : C.card,
                      border: `1.5px solid ${isFeatured ? acc + "60" : C.border}`,
                      borderRadius: 16, marginBottom: 10, overflow: "hidden", cursor: "pointer",
                      boxShadow: isFeatured ? `0 4px 20px ${acc}20` : "none",
                    }}
                  >
                    {/* Featured (first) place: large photo on top */}
                    {isFeatured && (
                      <div style={{ position: "relative" }}>
                        <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: "100%", height: 180, objectFit: "cover", display: "block" }} />
                        {showRank && (
                          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,.7)", borderRadius: 10, padding: "5px 10px", display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 20 }}>{medalEmoji || "🏆"}</span>
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>#{i + 1} Pick</span>
                          </div>
                        )}
                        {showWarn && (
                          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(239,68,68,.85)", borderRadius: 10, padding: "5px 12px" }}>
                            <span style={{ fontSize: 12, fontWeight: 800, color: "#fff" }}>⚠️ Skip this</span>
                          </div>
                        )}
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(13,17,23,.95))", padding: "20px 14px 12px" }}>
                          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{p.name}</div>
                        </div>
                      </div>
                    )}

                    {/* Card body */}
                    <div style={{ display: isFeatured ? "block" : "flex", padding: isFeatured ? "12px 14px 14px" : 0, gap: 0 }}>
                      {!isFeatured && (
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <FallbackImg src={p.photo} icon={iconForPlace(p)} style={{ width: 86, height: 86, objectFit: "cover", display: "block" }} />
                          {showRank && (
                            <div style={{ position: "absolute", top: 5, left: 5, width: 22, height: 22, borderRadius: "50%", background: rankColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: medalEmoji ? 14 : 10, fontWeight: 800, color: "#0D1117" }}>
                              {medalEmoji || (i + 1)}
                            </div>
                          )}
                        </div>
                      )}
                      <div style={{ padding: isFeatured ? 0 : "10px 12px", flex: 1, minWidth: 0, position: "relative" }}>
                        {(() => { const _sv = isSaved(p.id); return (
                          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, zIndex: 2 }}>
                            <button onClick={(e) => { e.stopPropagation(); quickSaveFavorite(p); }} aria-label="Save" title="Save" style={{ width: 30, height: 30, borderRadius: "50%", background: _sv ? acc : "rgba(0,0,0,.38)", border: `1px solid ${_sv ? acc : "rgba(255,255,255,.28)"}`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", backdropFilter: "blur(4px)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill={_sv ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20 C12 20 4 14.6 4 9.2 C4 6.4 6.1 4.3 8.6 4.3 C10.3 4.3 11.5 5.4 12 6.5 C12.5 5.4 13.7 4.3 15.4 4.3 C17.9 4.3 20 6.4 20 9.2 C20 14.6 12 20 12 20 Z" /></svg></button>
                            
                          </div>
                        ); })()}
                        {!isFeatured && <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 5, paddingRight: 74 }}>{p.name}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5, paddingRight: isFeatured ? 74 : 0 }}>
                          {p.rating && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3, background: showWarn ? C.red : (p.rating >= 4.5 ? C.green : "#3F8F4E"), color: "#0D1117", fontWeight: 800, fontSize: 13, padding: "2px 8px", borderRadius: 7 }}>
                              ★ {p.rating}
                            </span>
                          )}
                          {p.reviews > 0 && <span style={{ fontSize: 12, color: C.muted }}>{p.reviews.toLocaleString()} reviews</span>}
                          {liveOpen(p) === true && <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>Open now</span>}
                          {liveOpen(p) === false && <span style={{ fontSize: 11, fontWeight: 700, color: C.red }}>Closed</span>}
                          {p.distMi != null && <span style={{ fontSize: 12, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                          {p.price && <span style={{ fontSize: 12, color: C.green, fontWeight: 700 }}>{p.price}</span>}
                        </div>
                        {badges.length > 0 && (
                          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
                            {badges.map((b) => (
                              <span key={b.key} style={{ fontSize: 11, fontWeight: 700, color: acc, background: acc + "18", border: `1px solid ${acc}55`, borderRadius: 999, padding: "2px 8px" }}>{b.icon} {cityFixM(b.label)}</span>
                            ))}
                          </div>
                        )}
                        {isFeatured && (() => { const _w1 = whyFirst(p, themePlaces); return _w1 ? <div style={{ fontSize: 12, fontWeight: 700, color: "#FFFFFF", background: acc + "14", border: "1px solid " + acc + "3D", borderRadius: 9, padding: "7px 10px", marginBottom: 9, lineHeight: 1.4 }}>{_w1}</div> : null; })()}
                        {(() => { const why = _isWC ? WCC.wcCopy(p, themePlaces, i) : pickReason(p, { rank: i + 1, total: themePlaces.length, next: themePlaces[i + 1], weather, night: isNightNow(weather), foodContext: (theme === "best" || theme === "top5" || theme === "food" || /food|eat|breakfast|lunch|dinner/i.test(hookDetail.themeTitle || "")) }); return why ? <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.4, marginBottom: isFeatured ? 8 : 2 }}>{why}</div> : null; })()}
                        {isFeatured && (
                          <div style={{ fontSize: 12.5, color: acc, fontWeight: 700 }}>See full details →</div>
                        )}
                      </div>
                    </div>
                  </div>
                  </Fragment>
                );
              })}

              {/* Bottom save + share actions */}
              {themePlaces.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                  <button
                    onClick={() => { toggleHookLike(hookDetail.id); saveHookList(hookDetail, themePlaces); }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", borderRadius: 14, border: `1.5px solid ${isLiked ? acc : C.border}`, background: isLiked ? acc + "20" : "transparent", color: isLiked ? acc : C.light, fontSize: 14, fontWeight: 700, cursor: "pointer" }}
                  >
                    {isLiked ? "❤️ Saved" : "🤍 Save this list"}
                  </button>
                  <button
                    onClick={async () => { const ttl = hookDetail.themeTitle || hookDetail.hook || "My Wayfind picks"; const url = await buildListShareUrl(themePlaces, ttl); shareLink(ttl, url, () => showToast("Link copied"), `${ttl} — help me wayfind it`); }}
                    style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 0", borderRadius: 14, border: "none", background: acc, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
                  >
                    ↗ Share
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Copied toast */}
      {toast && (
        <div style={{ position: "fixed", bottom: 84, left: "50%", transform: "translateX(-50%)", zIndex: 1100, background: C.text, color: C.bg, fontSize: 13, fontWeight: 700, padding: "10px 18px", borderRadius: 999, boxShadow: "0 8px 24px rgba(0,0,0,.4)" }}>{toast}</div>
      )}

      {/* Full-screen photo viewer */}
      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.92)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
          <img src={lightbox} alt="" onClick={() => setLightbox(null)} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 8 }} />
          <button onClick={() => setLightbox(null)} aria-label="Close" style={{ position: "absolute", top: "max(16px, calc(env(safe-area-inset-top) + 10px))", right: 16, width: 44, height: 44, borderRadius: "50%", border: "1px solid rgba(255,255,255,.3)", background: "rgba(0,0,0,.55)", color: "#fff", fontSize: 20, cursor: "pointer", zIndex: 2 }}>✕</button>
          <div style={{ position: "absolute", bottom: "max(20px, calc(env(safe-area-inset-bottom) + 12px))", left: 0, right: 0, textAlign: "center", pointerEvents: "none" }}>
            {(() => { const i = detail && Array.isArray(detail.photos) ? detail.photos.indexOf(lightbox) : -1; const by = i >= 0 && detail && Array.isArray(detail.photoAttrs) ? (detail.photoAttrs[i] || "") : ""; return <div style={{ color: "rgba(255,255,255,.85)", fontSize: 11.5, fontWeight: 600, marginBottom: 3 }}>{by === "Wayfind" ? "Photo: Wayfind" : by ? "Photo: " + by + " · via Google" : "Photo via Google"}</div>; })()}
            <div style={{ color: "rgba(255,255,255,.6)", fontSize: 12 }}>Tap anywhere to close</div>
          </div>
        </div>
      )}

      {/* Account menu — opens from the header avatar so a tap no longer signs you out by accident */}
      {accountOpen && user && (
        <div style={sheetBg} onClick={() => setAccountOpen(false)}>
          <div style={{ ...sheet, padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAccountOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", background: C.adim, border: `1px solid ${C.accent}`, color: C.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, textTransform: "uppercase", flexShrink: 0 }}>{(user.email || "?").slice(0, 1)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Signed in</div>
                <div style={{ fontSize: 13, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user.email || ""}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: C.light, lineHeight: 1.5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
              <span style={{ color: C.accent }}>✓ </span>Your favorites and likes are saved to your account and follow you to any device you sign in on.
            </div>
            <button onClick={() => { setAccountOpen(false); setScreen("saved"); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontWeight: 700, cursor: "pointer", marginBottom: 10, textAlign: "left" }}>❤️ Your saved spots</button>
            <button onClick={() => { setAccountOpen(false); signOutUser(); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.red}`, background: "transparent", color: C.red, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Sign out</button>
            <div style={{ textAlign: "center", marginTop: 12 }}><a href="/privacy" style={{ fontSize: 11.5, color: C.muted, textDecoration: "none" }}>Privacy &amp; disclosures</a></div>
            <div onClick={() => { try { window.__wfv = (window.__wfv || 0) + 1; clearTimeout(window.__wfvT); window.__wfvT = setTimeout(() => { window.__wfv = 0; }, 2200); if (window.__wfv >= 5) { window.__wfv = 0; wfShowDiag(); } } catch (e) {} }} style={{ textAlign: "center", fontSize: 10.5, color: C.muted, opacity: 0.5, marginTop: 16 }}>Wayfind · {BUILD_ID}</div>
            <div style={{ fontSize: 10.5, color: C.muted, opacity: 0.7, marginTop: 4 }}>© 2026 Wayfind. All rights reserved.</div>
          </div>
        </div>
      )}

      {/* App-tile sheets: opened from the home navigation grid */}
      {menuSheet && (
        <div style={sheetBg} onClick={() => setMenuSheet(null)}>
          <div style={{ ...sheet, padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setMenuSheet(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            {menuSheet === "menu" && (
              <>
                <SheetHero icon="🧭" title="Browse by category" subtitle={"Pick a category to explore near " + (locName ? locName.split(",")[0] : "you") + "."} color={C.accent} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {CATEGORIES.map((c) => {
                    const cc = CAT_COLOR[c.id] || { c: C.accent, dim: C.adim };
                    return (
                      <button key={c.id} onClick={() => { setMenuSheet(null); pickCat(c.id); }} style={{ height: 84, borderRadius: 16, border: `1.5px solid ${cc.c}`, background: cc.dim, color: C.text, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 15, fontWeight: 800 }}>
                        <span style={{ fontSize: 26, lineHeight: 1 }}>{CAT_ICONS[c.id] || "📍"}</span>
                        <span>{c.label.replace(/^\S+\s/, "")}</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setMenuSheet("experiences")} style={{ width: "100%", marginTop: 10, height: 56, borderRadius: 16, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 15, fontWeight: 800 }}>
                  <span style={{ fontSize: 20 }}>✨</span>
                  <span>Browse by occasion</span>
                </button>
                <button onClick={() => { setMenuSheet(null); openSurprise(); }} style={{ width: "100%", marginTop: 12, height: 62, borderRadius: 16, border: `1.5px solid ${C.accent}`, background: `linear-gradient(150deg, ${C.adim} 0%, ${C.card} 70%)`, color: C.accent, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 15, fontWeight: 800 }}>
                  <span style={{ fontSize: 20 }}>🎲</span>
                  <span>Can't decide? Let's Wayfind it</span>
                </button>
              </>
            )}
            {menuSheet === "community" && (
              <>
                <SheetHero icon="📚" title="Local Events" subtitle="Free local programs and civic events near you." color="#2DD4BF" />
                {libraryEvents && libraryEvents.length > 0 ? (
                  <>
                    {libraryEvents.slice(0, 12).map((e, i) => {
                      const dt = e.date ? new Date(e.date + "T00:00:00") : null;
                      return (
                        <div key={(e.id || e.name || "ev") + "-" + i} onClick={() => { if (e.url) window.open(e.url, "_blank", "noopener"); }} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 13px", marginBottom: 8, cursor: e.url ? "pointer" : "default" }}>
                          <div style={{ flexShrink: 0, width: 44, textAlign: "center" }}>
                            {dt ? (<><div style={{ fontSize: 10.5, fontWeight: 800, color: "#2DD4BF", textTransform: "uppercase", letterSpacing: "0.3px" }}>{dt.toLocaleDateString(undefined, { month: "short" })}</div><div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.05 }}>{dt.getDate()}</div></>) : (<div style={{ fontSize: 22 }}>📚</div>)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                            <div style={{ fontSize: 12, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.time ? e.time + " · " : ""}{e.venue || "Manatee County Library"}</div>
                          </div>
                          {e.url && <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>›</span>}
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10, textAlign: "center" }}>Manatee County Public Library · via LibCal</div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "28px 16px", color: C.muted, fontSize: 13.5, lineHeight: 1.5 }}>No local programs loaded right now. Check back soon for library events, workshops, and civic happenings nearby.</div>
                )}
              </>
            )}
            {menuSheet === "explore" && (
              <>
                <SheetHero icon="📍" title={locName || "Nearby"} subtitle="Open spots near you, ranked best first." color={C.accent} />
                {(() => {
                  const src = (suggested && suggested.length ? suggested : places) || [];
                  if (src.length < 4) return null;
                  const counts = {};
                  src.forEach((p) => { const c = primaryCategory(p); if (c) counts[c] = (counts[c] || 0) + 1; });
                  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2);
                  if (!top.length) return null;
                  const gems = src.filter((p) => (p.rating || 0) >= 4.5).length;
                  const catLine = top.map(([c, n]) => `${c} (${n})`).join(" and ");
                  return (
                    <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.55, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 5 }}>The local scene</div>
                      Strongest around here: {catLine}.{gems > 0 ? ` ${gems} spot${gems === 1 ? "" : "s"} sitting at 4.5★ or higher.` : ""}
                    </div>
                  );
                })()}
                {(() => {
                  const src = dedupePlaces([...(suggested || []), ...places]);
                  if (!src.length) return null;
                  const openFirst = src.filter((p) => p && p.openNow === true);
                  const base = (openFirst.length >= 2 ? openFirst : src).filter(Boolean);
                  const picks = base.slice(0, 2);
                  if (picks.length === 0) return null;
                  const evs = dedupeEvents(foryouEvents || [], true).filter(Boolean).slice(0, 2);
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: C.accent, marginBottom: 8 }}>Start with these</div>
                      {picks.map((p, i) => (
                        <div key={"nbpick-" + p.id} onClick={() => { setMenuSheet(null); openDetail(p); }} style={{ marginBottom: 10, border: `1.5px solid ${i === 0 ? C.accent : C.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer", background: i === 0 ? `linear-gradient(160deg, rgba(255,150,70,.10) 0%, ${C.card} 60%)` : C.card }}>
                          <div style={{ position: "relative" }}>
                            <FallbackImg src={p.photo} icon="📍" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                            <div style={{ position: "absolute", top: 9, left: 9, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,.62)", border: `1px solid ${(p.openNow === true ? C.green : C.accent)}80`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
                              <span style={{ fontSize: 9.5, fontWeight: 800, color: p.openNow === true ? C.green : C.accent, textTransform: "uppercase", letterSpacing: "0.7px" }}>{p.openNow === true ? "Open now" : (i === 0 ? "Top pick nearby" : "Also near you")}</span>
                            </div>
                          </div>
                          <div style={{ padding: "11px 13px 13px" }}>
                            <div style={{ fontSize: 16.5, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{p.name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 6 }}>
                              {p.rating != null && <span style={{ fontSize: 12.5, color: "#F59E0B" }}>★ {p.rating}</span>}
                              {p.reviews != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {p.reviews.toLocaleString()} reviews</span>}
                              {p.openNow === true && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>· Open</span>}
                              {p.openNow === false && <span style={{ fontSize: 11.5, fontWeight: 700, color: p.nextOpen && p.nextOpen.today ? C.gold : C.red }}>· {p.nextOpen && p.nextOpen.today ? p.nextOpen.label : "Closed"}</span>}
                              {p.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                            </div>
                            {whyNow(p) && <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.5, marginTop: 7 }}><span style={{ color: C.accent, fontWeight: 800 }}>Why now: </span>{whyNow(p)}</div>}
                          </div>
                        </div>
                      ))}
                      {evs.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: C.accent, margin: "6px 2px 8px" }}>Happening near you</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 9, marginBottom: 4 }}>
                            {evs.map((e) => {
                              const f = formatEventDate(e.date, e.time);
                              const evRel = (() => { if (!e.date) return null; const ed = new Date(e.date + "T00:00:00"); const t0 = new Date(); t0.setHours(0, 0, 0, 0); const diff = Math.round((ed - t0) / 86400000); if (diff <= 0) return "Tonight"; if (diff === 1) return "Tomorrow"; if (diff <= 6 && (ed.getDay() === 6 || ed.getDay() === 0)) return "This weekend"; return null; })();
                              return (
                                <div key={"nbev-" + e.id} onClick={() => { setMenuSheet(null); openVenue(e); }} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 11, cursor: "pointer", minWidth: 0 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: evRel ? C.accent : C.purple, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{evRel ? evRel.toUpperCase() : (f.mo + " " + f.day)}{f.time ? " · " + f.time : ""}</div>
                                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                                  <div style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {e.venue || e.city || "Nearby"}</div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const near = ((suggested && suggested.length ? suggested : places) || []).filter(Boolean);
                  if (near.length >= 1) return null;
                  return (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 16px", marginBottom: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Quiet right around {locName ? locName.split(",")[0] : "you"}</div>
                      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 12 }}>We did not find much in your immediate area. Want to look a little farther out?</div>
                      <button onClick={() => { setMenuSheet(null); setPendingRadius(Math.max(searchRadius || 0, 40234)); setRadiusSheet(true); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1.5px solid ${C.accent}`, background: C.adim, color: C.accent, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Search a wider area →</button>
                    </div>
                  );
                })()}
                <button onClick={() => { setMenuSheet(null); setScreen("explore"); }} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>Show me the best spots →</button>
              </>
            )}
            {menuSheet === "pick" && (
              <>
                <SheetHero icon="🎲" title="I want to take a chance" subtitle="Roll and Wayfind lands you on one great spot nearby. Your rolls are saved below." color={C.purple} />
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginBottom: 6 }}>
                  <button onClick={() => rollHomePick(suggested || places || [])} disabled={homeRolling} style={{ width: 84, height: 84, borderRadius: 20, border: `2px solid ${C.accent}`, background: C.adim, fontSize: 42, cursor: homeRolling ? "default" : "pointer", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", animation: homeRolling ? "wfroll 0.5s linear infinite" : "none" }}>{homeRolling ? homeDiceFace : "🎲"}</button>
                  <button onClick={() => rollHomePick(suggested || places || [])} disabled={homeRolling} style={{ padding: "11px 26px", borderRadius: 999, border: "none", background: C.accent, color: "#0D1117", fontSize: 14, fontWeight: 800, cursor: homeRolling ? "default" : "pointer", opacity: homeRolling ? 0.6 : 1 }}>{rollHistory.length ? "Roll again" : "Roll the dice"}</button>
                </div>
                {rollHistory.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Your rolls</div>
                    {rollHistory.map((rp, i) => (
                      <div key={rp.id + "-" + i} onClick={() => { setMenuSheet(null); openDetail(rp); }} style={{ display: "flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", marginBottom: 7, cursor: "pointer" }}>
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: C.adim, color: C.accent, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{rollHistory.length - i}</span>
                        <FallbackImg src={rp.photo} icon="🍽️" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rp.name}</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
                            {rp.rating && <span style={{ fontSize: 11, color: "#F59E0B" }}>★ {rp.rating}</span>}
                            {rp.distMi != null && <span style={{ fontSize: 11, color: C.muted }}>· {rp.distMi.toFixed(1)} mi</span>}
                          </div>
                        </div>
                        <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>›</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {menuSheet === "experiences" && (
              <>
                <SheetHero icon="✨" title="Occasions" subtitle="Pick an occasion and the feed reshapes around it." color={C.gold} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {INTENTS.map((it) => {
                    const on = intent === it.id;
                    return (
                      <button key={it.id} onClick={() => { setIntent(on ? null : it.id); setMenuSheet(null); }} style={{ height: 76, borderRadius: 16, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? C.adim : C.card, color: on ? C.accent : C.light, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 14, fontWeight: 800 }}>
                        <span style={{ fontSize: 24, lineHeight: 1 }}>{it.icon}</span>
                        <span>{it.label}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => { const rc = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]; setMenuSheet(null); pickCat(rc.id); }} style={{ height: 76, borderRadius: 16, border: `1.5px dashed ${C.accent}`, background: C.adim, color: C.accent, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: 800 }}>
                    <span style={{ fontSize: 24, lineHeight: 1 }}>🎲</span>
                    <span>Surprise Me</span>
                  </button>
                </div>
              </>
            )}
            {menuSheet === "weather" && weather && (
              <>
                {/* v4.7: no static icon tile above the title. The live condition icon sits to the right of the words. */}
                {(() => {
                  const hr = new Date().getHours();
                  const timeLabel = hr < 5 ? "Late-night weather" : hr < 12 ? "This morning's weather" : hr < 17 ? "This afternoon's weather" : hr < 21 ? "This evening's weather" : "Tonight's weather";
                  const night = isNightNow(weather);
                  const cloudyNight = night && !!weather.img && weather.img !== "sunny";
                  const headIcon = night ? ("/wx/" + moonImgName(new Date(), cloudyNight) + ".png") : ("/wx/" + (weather.img || "cloudy") + ".png");
                  return (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.2px", lineHeight: 1.15 }}>{timeLabel}</div>
                        <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>{(locName ? locName.split(",")[0] : "Your area") + (weather && weather.updated ? " · updated " + weather.updated : ", live conditions.")}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
                        <img src={headIcon} alt="" style={{ height: 58, width: "auto", display: "block" }} />
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 32, fontWeight: 800, color: C.text, lineHeight: 1 }}>{weather.temp}°</div>
                          {weather.label && <div style={{ fontSize: 12.5, color: C.light, marginTop: 3 }}>{weather.label}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {(() => { const adv = weatherAdvisory(weather); return adv ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.adim, border: `1px solid ${C.gold}`, borderRadius: 12, padding: "11px 13px", marginBottom: 14 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{adv.icon}</span>
                    <div style={{ fontSize: 13, color: C.light, lineHeight: 1.45 }}>{adv.text}</div>
                  </div>
                ) : null; })()}
                {(() => { const t = wayfindWeatherTake(weather); if (!t || (!t.good.length && !t.avoid.length)) return null; return (
                  <div style={{ background: `linear-gradient(150deg, ${C.adim} 0%, ${C.card} 70%)`, border: `1px solid ${C.accent}`, borderRadius: 14, padding: "13px 14px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.4px", color: C.accent, textTransform: "uppercase", marginBottom: 8 }}>Wayfind take · {t.night ? "tonight" : "today"}</div>
                    {t.good.length > 0 && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, color: C.text, lineHeight: 1.5, marginBottom: t.avoid.length ? 7 : 0 }}><span style={{ color: C.green, fontWeight: 800, flexShrink: 0 }}>Good for</span><span>{t.good.join(", ")}</span></div>}
                    {t.avoid.length > 0 && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, color: C.text, lineHeight: 1.5 }}><span style={{ color: C.muted, fontWeight: 800, flexShrink: 0 }}>Skip</span><span>{t.avoid.join(", ")}</span></div>}
                  </div>
                ); })()}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {weather.feels != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Feels like</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.feels}°</div></div>)}
                  {weather.wind != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Wind</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>💨 {weather.wind} mph</div></div>)}
                  {weather.sunset && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Sunset</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}><img src="/wx/sunset.png" alt="" style={{ height: 18, width: "auto", verticalAlign: "middle", marginRight: 4 }} />{weather.sunset}</div></div>)}
                  {weather.rain != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Rain chance</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.rain}%</div></div>)}
                  {weather.hi != null && weather.lo != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>High / Low</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.hi}° / {weather.lo}°</div></div>)}
                  {weather.humidity != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Humidity</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.humidity}%</div></div>)}
                  {weather.uv != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Today's UV peak</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.uv} · {uvLabel(weather.uv)}</div></div>)}
                  {weather.dew != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Dew point</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.dew}°{weather.dew >= 70 ? " · muggy" : weather.dew >= 60 ? " · sticky" : " · comfy"}</div></div>)}
                  {(() => { const m = moonPhase(new Date()); return (
                    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px" }}>
                      <img src={"/wx/" + moonImgName(new Date(), false) + ".png"} alt="" style={{ height: 40, width: "auto", display: "block", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Tonight's moon</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 2 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{m.illum}% illuminated</div>
                      </div>
                    </div>
                  ); })()}
                </div>
                <button onClick={shareWeather} style={{ width: "100%", marginTop: 16, padding: "13px 0", borderRadius: 12, border: `1.5px solid ${C.accent}`, background: C.adim, color: C.accent, fontSize: 14.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg>
                  {isNightNow(weather) ? "Share the weather tonight" : "Share the weather"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Save-to-list sheet */}
      {authOpen && (
        <div style={sheetBg} onClick={() => setAuthOpen(false)}>
          <div style={{ ...sheet, padding: "6px 16px 32px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setAuthOpen(false))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>{authMode === "signup" ? "Create your Wayfind account" : "Sign in to Wayfind"}</div>
            <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.5, marginBottom: 16 }}>Save your spots so they follow you across devices.</div>

            {!isStandalone && (
              <button onClick={() => signInWithProvider("google")} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1px solid ${C.border}`, background: "#FFFFFF", color: "#1F2937", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <span style={{ fontSize: 16, fontWeight: 800 }}>G</span> Continue with Google
            </button>
            )}

            {!isStandalone && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 1, background: C.border }} />
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>or with email</div>
              <div style={{ flex: 1, height: 1, background: C.border }} />
            </div>
            )}

            {isStandalone && (
              <div style={{ fontSize: 12.5, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "11px 13px", marginBottom: 14, lineHeight: 1.5 }}>
                You're in the home-screen app, so sign in with email below. Google sign-in only works in Safari; if you use Google, open Wayfind in Safari to sign in there.
              </div>
            )}

            <input type="email" inputMode="email" autoCapitalize="none" autoCorrect="off" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@email.com"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 10, outline: "none" }} />
            <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Password"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 12, outline: "none" }} />
            <button onClick={passwordAuth} disabled={authSending || !authEmail || !authPassword} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: authSending || !authEmail || !authPassword ? "default" : "pointer", opacity: authSending || !authEmail || !authPassword ? 0.6 : 1 }}>
              {authSending ? "…" : authMode === "signup" ? "Create account" : "Sign in"}
            </button>
            <div style={{ textAlign: "center", marginTop: 14, fontSize: 13, color: C.muted }}>
              {authMode === "signup" ? "Already have an account? " : "New here? "}
              <span onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")} style={{ color: C.accent, fontWeight: 700, cursor: "pointer" }}>{authMode === "signup" ? "Sign in" : "Create one"}</span>
            </div>
            {authMode === "signin" && (
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <span onClick={resetSending ? undefined : sendPasswordReset} style={{ fontSize: 12.5, color: C.muted, textDecoration: "underline", cursor: "pointer", opacity: resetSending ? 0.6 : 1 }}>{resetSending ? "Sending…" : "Forgot password?"}</span>
              </div>
            )}
            <div style={{ textAlign: "center", marginTop: 10 }}><a href="/privacy" style={{ fontSize: 11, color: C.muted, textDecoration: "none" }}>Privacy &amp; disclosures</a></div>
          </div>
        </div>
      )}
      {introOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(5,7,14,.78)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14, overflowY: "auto" }} onClick={() => { try { localStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 470, maxHeight: "94vh", overflowY: "auto", borderRadius: 26, padding: "18px 20px 20px", background: "#0B0E17", border: "1px solid rgba(255,138,61,.4)", boxShadow: "0 30px 90px rgba(0,0,0,.65), 0 0 60px rgba(249,115,22,.14)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}><IntroIcon k="pin" size={22} /><span style={{ fontSize: 19, fontWeight: 800, color: "#FF8A3D", letterSpacing: 0.2 }}>Wayfind</span></div>
              <IntroIcon k="spark" size={30} color="#FFC28A" />
              <button onClick={() => { try { localStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); }} aria-label="Close" style={{ width: 40, height: 40, borderRadius: 999, background: "rgba(255,255,255,.14)", border: "1.5px solid rgba(255,255,255,.45)", color: "#FFFFFF", fontSize: 18, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
            </div>
            <div style={{ textAlign: "center", fontSize: 29, fontWeight: 800, color: "#F4F6FC", lineHeight: 1.18, marginTop: 14 }}>Find the right place.<br />For the <span style={{ background: "linear-gradient(90deg, #FF8A3D, #E8B84B)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>right moment.</span></div>
            <div style={{ textAlign: "center", fontSize: 14.5, color: "#B6BCD0", lineHeight: 1.5, margin: "10px auto 16px", maxWidth: 360 }}>Wayfind turns how you feel and what you're in the mood for into the best places near you.</div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}><IntroIcon k="spark" size={17} /><span style={{ fontSize: 14, fontWeight: 800, color: "#F4F6FC" }}>Tell us what kind of day you want</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              {MOMENT_CHIPS.map((ch) => { const on = introSel.includes(ch.id); return (
                <button key={ch.id} onClick={() => setIntroSel((cur) => on ? cur.filter((x) => x !== ch.id) : [...cur, ch.id])} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", padding: "13px 12px", borderRadius: 15, border: `1.5px solid ${on ? "#FF8A3D" : "#262B3F"}`, background: on ? "rgba(255,138,61,.14)" : "#121524", color: "#E8EAF2", fontSize: 14, fontWeight: 600, cursor: "pointer", lineHeight: 1.25 }}>
                  <IntroIcon k={ch.id} /><span>{ch.label}</span>
                </button>
              ); })}
            </div>
            <button onClick={() => introSel.length && openMoment(introSel)} disabled={!introSel.length} style={{ width: "100%", marginTop: 15, padding: "15px 10px", borderRadius: 16, border: "none", background: "linear-gradient(90deg, #F97316 0%, #FF8A3D 55%, #E8B84B 100%)", color: "#FFFFFF", fontSize: 16.5, fontWeight: 800, cursor: introSel.length ? "pointer" : "default", opacity: introSel.length ? 1 : 0.55, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, boxShadow: "0 8px 26px rgba(255,138,61,.4)" }}><IntroIcon k="wand" size={20} color="#FFFFFF" />Design my curated list</button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 10px" }}>
              <div style={{ flex: 1, height: 1, background: "#232838" }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: "#AEB4C8", whiteSpace: "nowrap" }}>See what's possible right now</div>
              <div style={{ flex: 1, height: 1, background: "#232838" }} />
            </div>
            {introTeasers.length >= 2 ? (
              <div style={{ display: "grid", gridTemplateColumns: introTeasers.length >= 4 ? "1fr 1fr 1fr 1fr" : "1fr 1fr", gap: 8 }}>
                {introTeasers.map((tz) => (
                  <div key={tz.p.id} onClick={() => { try { localStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); openDetail(tz.p); }} style={{ background: "#121524", border: "1px solid #262B3F", borderRadius: 13, overflow: "hidden", cursor: "pointer" }}>
                    {tz.p.photo ? <img src={tz.p.photo} alt="" onError={(e) => { try { e.currentTarget.style.display = "none"; } catch (e2) {} }} style={{ width: "100%", height: 58, objectFit: "cover", display: "block" }} /> : null}
                    <div style={{ padding: "7px 8px 8px" }}>
                      <div style={{ fontSize: 11.5, fontWeight: 800, color: "#F4F6FC", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tz.p.name}</div>
                      <div style={{ fontSize: 10, color: "#AEB4C8", margin: "2px 0 3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tz.line}</div>
                      <div style={{ fontSize: 10, color: "#8B90A5" }}>{tz.p.distMi != null ? tz.p.distMi.toFixed(1) + " mi away" : (tz.p.openNow === true ? "Open now" : "Nearby")}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", fontSize: 11.5, color: "#8B90A5", padding: "4px 0 2px" }}>Finding what's around you{"\u2026"}</div>
            )}
            <div onClick={() => { try { localStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); }} style={{ textAlign: "center", fontSize: 12.5, color: "#AEB4C8", marginTop: 12, cursor: "pointer" }}>Just let me look around</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 9, fontSize: 10.5, color: "#8B90A5" }}><IntroIcon k="shield" size={13} color="#8B90A5" />Rankings are merit-based. Affiliate links never change placement.</div>
          </div>
        </div>
      )}
      {recoveryOpen && (
        <div style={sheetBg} onClick={() => setRecoveryOpen(false)}>
          <div style={{ ...sheet, padding: "22px 20px 30px" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 6 }}>Set a new password</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>You opened a password reset link. Choose a new password for your account.</div>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password (8+ characters)"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 10, outline: "none" }} />
            <input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} placeholder="Repeat new password"
              style={{ width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 12, outline: "none" }} />
            <button onClick={saveNewPassword} disabled={pwSaving || !newPw || !newPw2} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: pwSaving || !newPw || !newPw2 ? "default" : "pointer", opacity: pwSaving || !newPw || !newPw2 ? 0.6 : 1 }}>{pwSaving ? "…" : "Save new password"}</button>
          </div>
        </div>
      )}
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
            {[{ label: "Open", run: () => { const id = listMenu; setListMenu(null); setActiveList(id); } }, { label: "Share", run: () => { const l = lists[listMenu]; setListMenu(null); shareList(l.places, l.name); } }, { label: "Rename", run: () => openRename(listMenu) }].map((a) => (
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
function PlaceCard({ p, rank, saved, liked, disliked, onDetail, onSave, onLike, onDislike, onShareCard, line, onBadge, selectedBadge, onCuisineTap }) {
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
const sheetBg = { position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", zIndex: 900, display: "flex", alignItems: "flex-end", justifyContent: "center" };
const sheet = { background: C.panel, borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 480, maxHeight: "92dvh", overflowY: "auto" };

export default function Page() {
  return (
    <ErrorBoundary>
      <PageInner />
    </ErrorBoundary>
  );
}
