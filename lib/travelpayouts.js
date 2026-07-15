// lib/travelpayouts.js — Travelpayouts affiliate deep-link engine (v6.35, infra).
//
// Travelpayouts is an aggregator: ONE account (Gowayfind) fronts many travel
// brands. Programs monetize via OUTBOUND deep links, not content APIs —
// Wayfind's places already come from Google/Foursquare; this layer just wraps a
// destination URL with our tracking so a booking pays a commission. Same
// "ships dark" discipline as lib/affiliates.js (withViatorTracking): every
// builder returns null until the program's tracking IDs exist, so nothing
// renders in the UI until it's real.
//
// IDENTIFIERS — verified live in the dashboard 2026-07-15 (all non-secret; they
// appear in the public click URLs the dashboard itself generates):
//   • account marker       = 750791   (the `marker` param)
//   • traffic source (trs)  = 550160   (the "Gowayfind" project; also ?source=550160
//                                       in dashboard URLs and t=550160 in the Drive tag)
//   NOTE: an earlier version used 550160 AS the marker — but 550160 is the
//   SOURCE id, not the account marker. Using it as the marker mis-attributes
//   clicks. The authoritative format is exactly what the dashboard's "Full
//   link" emits:
//     https://tp.media/r?campaign_id=<C>&marker=750791&p=<P>&trs=550160&u=<DEST>
//
// Per-program IDs (dashboard → Tools → Links → generate → "Full link"):
//   Tiqets         campaign_id 89  · p 2074
//   Klook          campaign_id 137 · p 4110
//   TicketNetwork  campaign_id 72  · p 1948
//   WeGoTrip       campaign_id 150 · p 4487
//   (TripAdvisor – Experiences: connection request IN REVIEW as of 2026-07-15.)
//
// BLOCKERS before a cent is collectible (owner actions, not code):
//   1. Set a payout method (Finance → Payout methods) — else commissions accrue
//      unpayable.
//   2. Flip NEXT_PUBLIC_BOOK_IT=on in Vercel to surface the "Book it" CTA.

const TP_MARKER = (process.env.NEXT_PUBLIC_TP_MARKER_ACCOUNT || "750791").trim(); // account marker
const TP_TRS = (process.env.NEXT_PUBLIC_TP_TRS || "550160").trim();               // traffic source (Gowayfind)

// tp.media redirect endpoint — the exact dynamic wrapper the dashboard emits.
// Params: campaign_id (per program) · marker (account) · p (promo_id, per program)
//         · trs (source) · sub_id (our attribution, optional) · u (encoded dest).
const TP_REDIRECT = "https://tp.media/r";

// Programs ordered by FIT for a local-discovery app (what Wayfind cards actually
// show), NOT by headline rate. Flights/eSIM/insurance are high-rate but ~zero
// conversion here, so they are intentionally omitted from the first wave.
// campaignId/promoId filled from the dashboard light each up.
export const TP_PROGRAMS = {
  // ── Wave 1: direct product fit — LIVE (approved + ids verified 2026-07-15) ──
  tiqets: {
    brand: "Tiqets", category: "attractions", rate: "3.5–8%",
    home: "https://www.tiqets.com", tpxHost: "tiqets.tpx.lu",
    promoId: "2074", campaignId: "89",
    note: "Museum/attraction tickets — attraction cards + Cozy Indoor. Verify FL inventory (Tampa/Orlando/Sarasota-area venues).",
  },
  ticketnetwork: {
    brand: "TicketNetwork", category: "events", rate: "6–12.5%",
    home: "https://www.ticketnetwork.com", tpxHost: "ticketnetwork.tpx.lu",
    promoId: "1948", campaignId: "72",
    note: "Event tickets — the Events tab (concerts, Marauders, Van Wezel). Makes waiting on Ticketmaster/Impact unnecessary. Respect the 'affiliate links never change placement' promise.",
  },
  wegotrip: {
    brand: "WeGoTrip", category: "tours", rate: "6.6–41.5%",
    home: "https://wegotrip.com", tpxHost: null,
    promoId: "4487", campaignId: "150",
    note: "Self-guided audio tours — highest margin; fits /guides/ and culture pages.",
  },
  klook: {
    brand: "Klook", category: "tours", rate: "2–5%",
    home: "https://www.klook.com", tpxHost: "klook.tpx.lu",
    promoId: "4110", campaignId: "137",
    note: "Tours/activities — Viator redundancy + coverage where Viator is thin. Merge/dedupe with Viator so cards never show the same product twice.",
  },
  // ── Wave 2: visitor-utility surfaces (ship dark until approved + ids set) ───
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
 * Emits the dashboard's exact format:
 *   https://tp.media/r?campaign_id=<C>&marker=750791&p=<P>&trs=550160&u=<DEST>
 * @param {string} key            program key (e.g. "tiqets")
 * @param {string} destinationUrl a specific product/search URL on that brand
 * @param {string} [subId]        our attribution tag (place id / surface)
 */
export function tpDeepLink(key, destinationUrl, subId) {
  const p = TP_PROGRAMS[key];
  if (!p || !isTpProgramLive(key) || !destinationUrl) return null;
  // Validate the destination is a real absolute http(s) URL — never wrap junk.
  let dest;
  try { dest = new URL(destinationUrl); } catch { return null; }
  if (!/^https?:$/.test(dest.protocol)) return null;
  const u = new URL(TP_REDIRECT);
  u.searchParams.set("campaign_id", p.campaignId);
  u.searchParams.set("marker", TP_MARKER);
  u.searchParams.set("p", p.promoId);
  u.searchParams.set("trs", TP_TRS);
  if (subId) u.searchParams.set("sub_id", String(subId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60));
  u.searchParams.set("u", dest.toString());
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
  return { marker: TP_MARKER, trs: TP_TRS, total: keys.length, live: live.length, liveKeys: live, pendingKeys: keys.filter((k) => !isTpProgramLive(k)) };
}
