// lib/travelpayouts.js — Travelpayouts affiliate deep-link engine (v6.28, infra).
//
// Travelpayouts is an aggregator: ONE account fronts many travel brands.
// fronts many travel brands. Programs monetize via OUTBOUND deep links, not
// content APIs — Wayfind's places already come from Google/Foursquare; this
// layer just wraps a destination URL with our tracking so a booking pays a
// commission. Same shape and "ships dark" discipline as lib/affiliates.js
// (withViatorTracking): every builder returns null until the program's
// tracking IDs exist, so nothing renders in the UI until it's real.
//
// VERIFIED 2026-07-15 in the dashboard, CORRECTED 2026-07-29:
//   • account marker (`marker`) = 750791  — the ACCOUNT (gabrielpereira@me.com)
//   • traffic source (`trs`)    = 550160  — the PROJECT "Gowayfind"
//
// THE BUG THIS FIXES: 550160 was used as the account marker. It is the traffic
// SOURCE id, not the account. They are two different params and both are ours.
// Sending 550160 as `marker` attributes clicks to a source id rather than the
// account.
//
// NOT A REGRESSION IN PRODUCTION: every program below shipped with null IDs, so
// isTpProgramLive() was false for all nine and tpDeepLink() returned null on
// every call. Nothing was emitted, so nothing was mis-attributed — the
// ships-dark discipline held. The real cost was that the integration has been
// DARK since 2026-07-15 because the approved program IDs were never applied.
//
// DO NOT "FIX" app/layout.js:191. The Drive script there is
// tp-em.com/NTUwMTYw.js?t=550160, and NTUwMTYw is base64("550160"). It is
// PROJECT-scoped site verification, not a click wrapper. Two different systems
// that happen to share a number; renaming it to the account id would break the
// verification it exists to perform.
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

// Renamed from NEXT_PUBLIC_TP_MARKER deliberately: a stale
// NEXT_PUBLIC_TP_MARKER=550160 in Vercel must not be able to override the
// corrected account marker. A new name cannot be shadowed by the old value.
const TP_MARKER_ACCOUNT = (process.env.NEXT_PUBLIC_TP_MARKER_ACCOUNT || "750791").trim();
// Traffic source. Same value as before, now in the param it actually belongs in.
export const TP_TRS = "550160";

// The authoritative format, exactly what the dashboard "Full link" emits:
//   https://tp.media/r?campaign_id=<C>&marker=750791&p=<P>&trs=550160&u=<ENCODED_DEST>
// Note: /r, not /click. `marker`, not `shmarker`. `p`, not `promo_id`.
const TP_ENDPOINT = "https://tp.media/r";

// Programs ordered by FIT for a local-discovery app (what Wayfind cards
// actually show), NOT by headline rate. Flights/eSIM/insurance are high-rate
// but ~zero conversion here, so they are intentionally omitted from the
// first wave. Fill promoId/campaignId from the dashboard to light each up.
export const TP_PROGRAMS = {
  // ── Wave 1: direct product fit (wire these first) ──────────────────────────
  tiqets: {
    brand: "Tiqets", category: "attractions", rate: "3.5–8%",
    home: "https://www.tiqets.com", tpxHost: "tiqets.tpx.lu",
    promoId: "2074", campaignId: "89", // APPROVED 2026-07-15
    note: "Museum/attraction tickets — attraction cards + Cozy Indoor. Verify FL inventory (Tampa/Orlando/Sarasota-area venues).",
  },
  ticketnetwork: {
    brand: "TicketNetwork", category: "events", rate: "6–12.5%",
    home: "https://www.ticketnetwork.com", tpxHost: null,
    promoId: "1948", campaignId: "72", // APPROVED 2026-07-15
    note: "Event tickets — the Events tab (concerts, Marauders, Van Wezel). Makes waiting on Ticketmaster/Impact unnecessary. Respect the 'affiliate links never change placement' promise.",
  },
  wegotrip: {
    brand: "WeGoTrip", category: "tours", rate: "6.6–41.5%",
    home: "https://wegotrip.com", tpxHost: null,
    promoId: "4487", campaignId: "150", // APPROVED 2026-07-15
    note: "Self-guided audio tours — highest margin; fits /guides/ and culture pages.",
  },
  klook: {
    brand: "Klook", category: "tours", rate: "2–5%",
    home: "https://www.klook.com", tpxHost: null,
    promoId: "4110", campaignId: "137", // APPROVED 2026-07-15
    note: "Tours/activities — Viator redundancy + coverage where Viator is thin. Merge/dedupe with Viator so cards never show the same product twice.",
  },
  // TripAdvisor-Experiences is IN REVIEW in the dashboard and stays DARK —
  // promoId/campaignId null, so isTpProgramLive() is false and tpDeepLink()
  // returns null. It is listed so nobody re-adds it as "missing".
  tripadvisorexperiences: { brand: "TripAdvisor Experiences", category: "tours", rate: "—", home: "https://www.tripadvisor.com/Attractions", tpxHost: null, promoId: null, campaignId: null, note: "IN REVIEW 2026-07-29 — stays dark until approved." },

  // ── Wave 2: visitor-utility surfaces — ALL STAY DARK for now ──────────────
  welcomepickups: { brand: "Welcome Pickups", category: "transfers", rate: "8–9%", home: "https://welcomepickups.com", tpxHost: null, promoId: null, campaignId: null, note: "SRQ/TPA airport transfers." },
  kiwitaxi:       { brand: "Kiwitaxi", category: "transfers", rate: "9–11%", home: "https://kiwitaxi.com", tpxHost: null, promoId: null, campaignId: null, note: "Airport transfers." },
  gocity:         { brand: "Go City", category: "passes", rate: "3.4–6%", home: "https://gocity.com", tpxHost: null, promoId: null, campaignId: null, note: "City passes — verify Tampa/Orlando coverage." },
  radicalstorage: { brand: "Radical Storage", category: "utility", rate: "8%", home: "https://radicalstorage.com", tpxHost: null, promoId: null, campaignId: null, note: "Beach-day luggage storage." },
  bikesbooking:   { brand: "BikesBooking", category: "utility", rate: "4%", home: "https://bikesbooking.com", tpxHost: null, promoId: null, campaignId: null, note: "Anna Maria Island bike days." },
};

/** A program is live only when it has BOTH tracking IDs. Ships dark otherwise. */
export function isTpProgramLive(key) {
  const p = TP_PROGRAMS[key];
  return !!(p && p.promoId && p.campaignId && TP_MARKER_ACCOUNT);
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
  // Protocol guard: only http(s) destinations are ever wrapped. javascript:,
  // data: and mailto: are rejected outright rather than encoded into `u`.
  if (!/^https?:$/.test(dest.protocol)) return null;
  const u = new URL(TP_ENDPOINT);
  // Dashboard order: campaign_id, marker, p, trs, u. Kept exact so a diff
  // against a dashboard "Full link" is meaningful.
  u.searchParams.set("campaign_id", p.campaignId);
  u.searchParams.set("marker", TP_MARKER_ACCOUNT);
  u.searchParams.set("p", p.promoId);
  u.searchParams.set("trs", TP_TRS);
  u.searchParams.set("u", dest.toString());
  // NOTE: sub_id is intentionally NOT emitted. The dashboard format is exactly
  // the five params above, and this ships matching it character for character.
  // Re-add only after confirming tp.media/r accepts sub_id without disturbing
  // attribution — an unverified sixth param is how silent mis-attribution starts.
  void subId;
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
  return { marker: TP_MARKER_ACCOUNT, trs: TP_TRS, total: keys.length, live: live.length, liveKeys: live, pendingKeys: keys.filter((k) => !isTpProgramLive(k)) };
}
