// lib/travelpayouts.js — Travelpayouts affiliate deep-link engine (v6.28, infra).
//
// Travelpayouts is an aggregator: ONE account (Gowayfind, marker 550160)
// fronts many travel brands. Programs monetize via OUTBOUND deep links, not
// content APIs — Wayfind's places already come from Google/Foursquare; this
// layer just wraps a destination URL with our tracking so a booking pays a
// commission. Same shape and "ships dark" discipline as lib/affiliates.js
// (withViatorTracking): every builder returns null until the program's
// tracking IDs exist, so nothing renders in the UI until it's real.
//
// VERIFIED 2026-07-15 in the dashboard:
//   • account marker (shmarker) = 550160  (non-secret; appears in dashboard URLs)
//   • the Drive tool emits per-link short URLs like  https://tiqets.tpx.lu/XXXXXXXX
//   • the CLASSIC dynamic format (usable from code for any destination) is the
//     tp.media click wrapper below — it needs each program's promo_id +
//     campaign_id, which are read ONCE from the dashboard's classic link
//     builder (Tools → Links) or the API. Those are the TODOs per program.
//
// BLOCKERS before a cent is collectible (owner actions, not code):
//   1. Finish "Drive" / account setup in the Travelpayouts dashboard.
//   2. Set a payout method (Finance → Payout methods) — else commissions
//      accrue unpayable.
//   3. Paste each program's promo_id + campaign_id below (or wire the API token
//      as a SERVER env var, never NEXT_PUBLIC).

const TP_MARKER = (process.env.NEXT_PUBLIC_TP_MARKER || "550160").trim();

// tp.media click endpoint — the documented dynamic wrapper. Params:
//   shmarker    account marker (550160)
//   promo_id    per-program (from dashboard classic link builder) — REQUIRED
//   campaign_id per-program — REQUIRED
//   source_type "link", type "click"
//   sub_id      our own attribution (place id / surface) — optional, <= ~60 chars
//   url         the encoded destination (a specific product/search page)
const TP_CLICK = "https://tp.media/click";

// Programs ordered by FIT for a local-discovery app (what Wayfind cards
// actually show), NOT by headline rate. Flights/eSIM/insurance are high-rate
// but ~zero conversion here, so they are intentionally omitted from the
// first wave. Fill promoId/campaignId from the dashboard to light each up.
export const TP_PROGRAMS = {
  // ── Wave 1: direct product fit (wire these first) ──────────────────────────
  tiqets: {
    brand: "Tiqets", category: "attractions", rate: "3.5–8%",
    home: "https://www.tiqets.com", tpxHost: "tiqets.tpx.lu",
    promoId: null, campaignId: null, // TODO: dashboard → Tiqets → classic link
    note: "Museum/attraction tickets — attraction cards + Cozy Indoor. Verify FL inventory (Tampa/Orlando/Sarasota-area venues).",
  },
  ticketnetwork: {
    brand: "TicketNetwork", category: "events", rate: "6–12.5%",
    home: "https://www.ticketnetwork.com", tpxHost: null,
    promoId: null, campaignId: null,
    note: "Event tickets — the Events tab (concerts, Marauders, Van Wezel). Makes waiting on Ticketmaster/Impact unnecessary. Respect the 'affiliate links never change placement' promise.",
  },
  wegotrip: {
    brand: "WeGoTrip", category: "tours", rate: "6.6–41.5%",
    home: "https://wegotrip.com", tpxHost: null,
    promoId: null, campaignId: null,
    note: "Self-guided audio tours — highest margin; fits /guides/ and culture pages.",
  },
  klook: {
    brand: "Klook", category: "tours", rate: "2–5%",
    home: "https://www.klook.com", tpxHost: null,
    promoId: null, campaignId: null,
    note: "Tours/activities — Viator redundancy + coverage where Viator is thin. Merge/dedupe with Viator so cards never show the same product twice.",
  },
  // ── Wave 2: visitor-utility surfaces (after wave 1 proves out) ─────────────
  welcomepickups: { brand: "Welcome Pickups", category: "transfers", rate: "8–9%", home: "https://welcomepickups.com", tpxHost: null, promoId: null, campaignId: null, note: "SRQ/TPA airport transfers." },
  kiwitaxi:       { brand: "Kiwitaxi", category: "transfers", rate: "9–11%", home: "https://kiwitaxi.com", tpxHost: null, promoId: null, campaignId: null, note: "Airport transfers." },
  gocity:         { brand: "Go City", category: "passes", rate: "3.4–6%", home: "https://gocity.com", tpxHost: null, promoId: null, campaignId: null, note: "City passes — verify Tampa/Orlando coverage." },
  radicalstorage: { brand: "Radical Storage", category: "utility", rate: "8%", home: "https://radicalstorage.com", tpxHost: null, promoId: null, campaignId: null, note: "Beach-day luggage storage." },
  bikesbooking:   { brand: "BikesBooking", category: "utility", rate: "4%", home: "https://bikesbooking.com", tpxHost: null, promoId: null, campaignId: null, note: "Anna Maria Island bike days." },
};

/** A program is live only when it has BOTH tracking IDs. Ships dark otherwise. */
export function isTpProgramLive(key) {
  const p = TP_PROGRAMS[key];
  return !!(p && p.promoId && p.campaignId && TP_MARKER);
}

/**
 * Build a tracked Travelpayouts deep link for a destination page, or null.
 * @param {string} key            program key (e.g. "tiqets")
 * @param {string} destinationUrl a specific product/search URL on that brand
 * @param {string} [subId]        our attribution tag (place id / surface)
 */
export function tpDeepLink(key, destinationUrl, subId) {
  const p = TP_PROGRAMS[key];
  if (!p || !isTpProgramLive(key) || !destinationUrl) return null;
  // Validate the destination is a real absolute URL — never wrap junk.
  let dest;
  try { dest = new URL(destinationUrl); } catch { return null; }
  const u = new URL(TP_CLICK);
  u.searchParams.set("shmarker", TP_MARKER);
  u.searchParams.set("promo_id", p.promoId);
  u.searchParams.set("campaign_id", p.campaignId);
  u.searchParams.set("source_type", "link");
  u.searchParams.set("type", "click");
  if (subId) u.searchParams.set("sub_id", String(subId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60));
  u.searchParams.set("url", dest.toString());
  return u.toString();
}

/** Convenience: link to a brand's home/search when we have no product URL yet. */
export function tpBrandLink(key, subId) {
  const p = TP_PROGRAMS[key];
  return p ? tpDeepLink(key, p.home, subId) : null;
}

/** Live programs in a category, fit-order preserved (drives future rails). */
export function tpProgramsForCategory(category) {
  return Object.entries(TP_PROGRAMS)
    .filter(([, p]) => p.category === category)
    .filter(([k]) => isTpProgramLive(k))
    .map(([key, p]) => ({ key, ...p }));
}

/** Owner-facing readiness snapshot (for a setup/status surface, not the UI). */
export function tpReadiness() {
  const keys = Object.keys(TP_PROGRAMS);
  const live = keys.filter(isTpProgramLive);
  return { marker: TP_MARKER, total: keys.length, live: live.length, liveKeys: live, pendingKeys: keys.filter((k) => !isTpProgramLive(k)) };
}
