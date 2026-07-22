// lib/offers.js — Undercover Tourist (CJ affiliate) attraction-ticket offers.
// A SECOND inventory provider alongside Viator, stored in the same wf_experiences
// table (provider='undercover_tourist') so every downstream consumer — the
// /api/experiences rails and the wf_things_to_do merge RPC — picks them up
// unchanged. This file owns ONLY the CJ/UT-specific bits: the affiliate
// deep-link form, provider detection for honest badging, and the
// attraction-matching layer. It deliberately does NOT touch any Viator builder
// (those live in lib/affiliates.js and are an active parallel lane).
//
// CJ facts (confirmed): Publisher ID (PID) 101643573 (WayfindLLC). Undercover
// Tourist advertiser 684659, JOINED/ACTIVE. Commission on attraction tickets +
// car rentals.
//
// DEEP-LINK FORM — verified empirically 2026-07-22, NOT guessed. The destination
// rides as a RAW PATH SEGMENT after /type/dlg/sid/{sid}/ — the ?url=<encoded>
// variant in early notes resolves to a tracking PIXEL (GIF89a), never a click
// redirect. The raw-path form produces the real attributed chain:
//   anrdoezrs.net → cj.dotomi.com (sets CJSession) → emjcd.com →
//   undercovertourist.com/...?AID=11556282&PID=101643573&SID={sid}&cjevent=...
// i.e. the click lands on the real page carrying PID=101643573 + a cjevent token.
export const CJ_PID = "101643573";
export const CJ_UT_ADVERTISER = "684659";

// CJ tracking/redirect domains (a click that has been through CJ carries one of
// these somewhere in its chain; a stored booking_url starts at anrdoezrs.net).
const CJ_HOSTS = /(?:^|\.)(?:anrdoezrs\.net|dpbolvw\.net|tkqlhce\.com|jdoqocy\.com|kqzyfj\.com|emjcd\.com|dotomi\.com|qksrv\.net)$/i;

// Build the CJ affiliate deep link that wraps an Undercover Tourist destination
// page. sid is a short surface tag (e.g. "card", "attach:seaworld") flowing to
// CJ's SID for per-surface reporting. Guard: only wraps undercovertourist.com
// https URLs — wrapping a foreign host would send a competitor's page through
// our UT-advertiser link and never attribute. Returns null otherwise so callers
// ship nothing rather than an untracked link.
export function undercoverDeepLink(destUrl, sid = "card") {
  if (!destUrl) return null;
  let host;
  try { host = new URL(destUrl).hostname; } catch { return null; }
  if (!/^(?:www\.)?undercovertourist\.com$/i.test(host)) return null;
  if (!/^https:\/\//i.test(destUrl)) return null;
  const s = String(sid || "card").replace(/[^\w.:-]/g, "").slice(0, 40) || "card";
  // Destination as a raw path segment (NOT url-encoded) — the verified form.
  return `https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/sid/${s}/${destUrl}`;
}

// Is this stored booking/product URL a CJ/Undercover Tourist affiliate link?
// Used by the renderers to badge honestly ("Discount tickets · Undercover
// Tourist") and to route the click verbatim (never re-wrap it).
export function isUndercoverLink(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (CJ_HOSTS.test(u.hostname) && u.pathname.includes(`/${CJ_PID}/`)) return true;
  } catch { /* fall through */ }
  // Post-redirect destinations carry PID=101643573 as a query param.
  return new RegExp(`[?&]PID=${CJ_PID}(?:&|$)`).test(String(url));
}

// Every UT card/CTA must carry our PID or it earns nothing. The renderers assert
// this; the guard test locks it. A link that fails is dropped, never shown.
export function offerLinkIsAttributed(url) {
  return typeof url === "string" && url.includes(CJ_PID);
}

// ── Attraction matching (layer 3b: "if it's recommended and they offer it, show
// it") ──────────────────────────────────────────────────────────────────────
// The match is keyed off the maps_to value carried on each seeded UT row, so it
// is correct BY CONSTRUCTION — it only ever matches attractions that genuinely
// exist as UT inventory (never a hardcoded guess that might 404). normalizeName
// collapses a Google place name to a comparable token; ATTRACTION_ALIASES maps
// common name variants onto the canonical maps_to key.
export function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(resort|theme park|park|orlando|tampa|florida|fl|the|a)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Canonical maps_to keys → substrings that, if present in a normalized place
// name, indicate that attraction. Kept small and specific to avoid false hits.
const ATTRACTION_ALIASES = [
  { mapsTo: "walt disney world", needles: ["disney world", "magic kingdom", "epcot", "disney springs", "hollywood studios", "animal kingdom", "walt disney"] },
  { mapsTo: "universal orlando", needles: ["universal studios", "universal orlando", "islands of adventure", "epic universe", "universal"] },
  { mapsTo: "seaworld orlando", needles: ["seaworld", "sea world", "aquatica", "discovery cove"] },
  { mapsTo: "busch gardens tampa", needles: ["busch gardens", "adventure island"] },
  { mapsTo: "legoland florida", needles: ["legoland"] },
  { mapsTo: "kennedy space center", needles: ["kennedy space", "space center"] },
];

// Derive the canonical maps_to key from a product/attraction title (used by the
// ingest cron to stamp maps_to on each row, and to place the row geographically).
// Returns null when a product doesn't map to a known Florida attraction.
export function deriveMapsTo(name) {
  const norm = normalizeName(name);
  if (!norm) return null;
  const alias = ATTRACTION_ALIASES.find((a) => a.needles.some((n) => norm.includes(n)));
  return alias ? alias.mapsTo : null;
}

// Geographic placement per attraction — keyed to the real DESTS ids/cities in
// lib/experiencesData.js so a UT row surfaces in the same market rails as Viator
// inventory. lat/lng are the attraction's real coordinates (public), so the
// radius-match path in wf_things_to_do also picks them up. Set once here so the
// cron and any hand-seed stay consistent.
export const ATTRACTION_PLACEMENT = {
  "walt disney world":   { dest_id: "663", city: "Orlando", lat: 28.3852, lng: -81.5639 },
  "universal orlando":   { dest_id: "663", city: "Orlando", lat: 28.4749, lng: -81.4664 },
  "seaworld orlando":    { dest_id: "663", city: "Orlando", lat: 28.4114, lng: -81.4639 },
  "busch gardens tampa": { dest_id: "666", city: "Tampa",   lat: 28.0372, lng: -82.4194 },
  "legoland florida":    { dest_id: "663", city: "Orlando", lat: 27.9899, lng: -81.6893 },
  "kennedy space center":{ dest_id: "663", city: "Orlando", lat: 28.5729, lng: -80.6490 },
};

// Given a place name and the set of currently-available UT rows (each carrying a
// maps_to), return the matching UT offer row or null. utRows come from
// wf_experiences (provider='undercover_tourist') — the single source of truth.
export function matchUtOffer(placeName, utRows) {
  if (!placeName || !Array.isArray(utRows) || !utRows.length) return null;
  const norm = normalizeName(placeName);
  if (!norm) return null;
  const alias = ATTRACTION_ALIASES.find((a) => a.needles.some((n) => norm.includes(n)));
  if (!alias) return null;
  const row = utRows.find((r) => r && r.maps_to === alias.mapsTo && offerLinkIsAttributed(r.product_url || r.booking_url || ""));
  return row || null;
}

export const OFFER_BADGE = "Discount tickets · Undercover Tourist";
