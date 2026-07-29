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
// TWO NUMBERS, AND THEY ARE NOT INTERCHANGEABLE. Confusing them has cost two
// cycles already, so both are named here:
//
//   750791 = MARKER. The per-link tracking marker that earns the commission.
//            This is what goes in `marker=` on every outbound link.
//   550160 = TRS / account id. The project-scoped account number. It goes in
//            `trs=` and NOWHERE else in a link.
//
// 550160 is ALSO correct in app/layout.js — that script is
// tp-em.com/NTUwMTYw.js?t=550160, and NTUwMTYw is base64("550160"). It is the
// site-OWNERSHIP VERIFICATION tag. Changing it breaks verification. Do not
// "fix" it to 750791. That file is not this module's business.
//
// The env var is deliberately named NEXT_PUBLIC_TP_MARKER_ACCOUNT, not
// NEXT_PUBLIC_TP_MARKER: a stale NEXT_PUBLIC_TP_MARKER=550160 is still set in
// Vercel from the dark period, and under the old name it would silently
// override the correct marker and send every commission to the account id.
// Renaming the variable is what makes that stale value inert.
//
// VERIFIED in dashboard 2026-07-15, re-verified 2026-07-29.
//
// LIVE-PAGE ACCEPTANCE TEST, run 2026-07-29 before these were lit (the
// app/layout.js "two rewriters contend" conflict):
//   • Stay22 rewrites booking.com links -> stay22.com/allez/booking, SINGLE
//     wrap, inner target left plain, and it sets hasTP=true — it detects
//     Travelpayouts and coexists rather than fighting it.
//   • Travelpayouts Drive rewrites tp.media/r links -> tp-em.com/re and
//     PRESERVES campaign_id, marker, p, trs and the target intact, adding only
//     its own telemetry (journey_id, trace_id, promo_kind, install_type).
//     The marker survives: trace_id itself ends "-750791".
//   • Neither rewrites the other's output. Partner brand hosts (tiqets, klook,
//     ticketnetwork, wegotrip) and viator.com are untouched by both.
//   No double-wrap. Attribution is intact on both paths.

const TP_MARKER = (process.env.NEXT_PUBLIC_TP_MARKER_ACCOUNT || "750791").trim();

/** Account id. Emitted as `trs=`. NOT the marker — see the note above. */
export const TP_TRS = "550160";

// The dashboard's own dynamic format, emitted verbatim:
//   https://tp.media/r?campaign_id=<C>&marker=750791&p=<P>&trs=550160&u=<ENC>
// Param order is the dashboard's order and is preserved deliberately —
// URLSearchParams keeps insertion order, so the emitted string matches what the
// dashboard produces character for character. Easier to diff against a
// dashboard link when something looks wrong.
const TP_CLICK = "https://tp.media/r";

// Programs ordered by FIT for a local-discovery app (what Wayfind cards
// actually show), NOT by headline rate. Flights/eSIM/insurance are high-rate
// but ~zero conversion here, so they are intentionally omitted from the
// first wave. Fill promoId/campaignId from the dashboard to light each up.
export const TP_PROGRAMS = {
  // ── Wave 1: direct product fit (wire these first) ──────────────────────────
  tiqets: {
    brand: "Tiqets", category: "attractions", rate: "3.5–8%",
    home: "https://www.tiqets.com", tpxHost: "tiqets.tpx.lu",
    promoId: "2074", campaignId: "89",
    note: "Museum/attraction tickets — attraction cards + Cozy Indoor. Verify FL inventory (Tampa/Orlando/Sarasota-area venues).",
  },
  ticketnetwork: {
    brand: "TicketNetwork", category: "events", rate: "6–12.5%",
    home: "https://www.ticketnetwork.com", tpxHost: null,
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
    home: "https://www.klook.com", tpxHost: null,
    promoId: "4110", campaignId: "137",
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
  // Only http(s) may be wrapped. Without this a javascript: or data: URL
  // reaching a builder becomes a live link on the page — new URL() accepts both.
  if (!/^https?:$/.test(dest.protocol)) return null;
  const u = new URL(TP_CLICK);
  // Dashboard order: campaign_id, marker, p, trs, u.
  u.searchParams.set("campaign_id", p.campaignId);
  u.searchParams.set("marker", TP_MARKER);
  u.searchParams.set("p", p.promoId);
  u.searchParams.set("trs", TP_TRS);
  u.searchParams.set("u", dest.toString());
  // NOTE: sub_id is intentionally NOT emitted. The dashboard format is exactly
  // the five params above, and this ships matching it character for character.
  // The cost is real and is stated rather than hidden: revenue attributes at
  // PROGRAM level, not per-surface, so we cannot yet tell which page earned.
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
  return { marker: TP_MARKER, total: keys.length, live: live.length, liveKeys: live, pendingKeys: keys.filter((k) => !isTpProgramLive(k)) };
}
