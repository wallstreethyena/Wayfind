// lib/monetize.js — Wayfind monetization engine (v6.28, infra, additive).
//
// Purpose: given a Google/Foursquare place, decide (a) is it BOOKABLE through an
// affiliate we earn on, (b) which program has the highest EXPECTED VALUE, and
// (c) a bounded, SORT-ONLY ranking nudge for the disclosed "Book it" layer.
//
// ── HARD INTEGRITY CONTRACT (do not violate; enforced by tests) ──────────────
// 1. The number this file produces is a RANKING/SORT input only. It is NEVER
//    added to the displayed Wayfind Score (lib/score.js) or the score badge —
//    the merit number stays merit-only (v6.18 spec: "affiliate status never
//    affects score or band"). A paid-looking objective score is the one form of
//    this that is genuinely deceptive; we don't build it.
// 2. Any place whose position is monetization-influenced (isSponsoredPlacement)
//    MUST render a visible "Sponsored" / "Partner" / "Book" label at the point
//    of placement. Undisclosed pay-to-rank is the FTC problem; disclosed
//    pay-to-rank is legal and standard. The label is not optional.
// 3. The boost is BOUNDED (default cap 8 on the 0–100 scale) so a low-merit
//    place can never leapfrog a much-better one. Merit still dominates order;
//    money only breaks near-ties and lifts genuinely-good bookable places. This
//    protects both the user experience and the "our ranking is our honest
//    opinion" legal posture.
//
// Economics below: commission rates are the VERIFIED dashboard display rates.
// avgValue / conv are internal tunable estimates for ranking math only — they
// are never shown to users and make no user-facing claim.

const CATEGORY_ECON = {
  // avgValue = rough $ per booking; conv = how likely a LOCAL-app user books it.
  tours:       { avgValue: 65, conv: 0.80 },
  attractions: { avgValue: 38, conv: 1.00 },
  events:      { avgValue: 95, conv: 0.50 },
  audio:       { avgValue: 20, conv: 0.45 },
  transfers:   { avgValue: 55, conv: 0.30 },
};

// Which programs serve which categories, and their commission rate (mid of the
// dashboard range). Only VERIFIED-live providers should be passed in `available`.
const PROVIDER_ECON = {
  viator:        { categories: ["tours", "attractions"], rate: 0.08 },
  tiqets:        { categories: ["attractions"],          rate: 0.06 },
  ticketnetwork: { categories: ["events"],               rate: 0.09 },
  klook:         { categories: ["tours", "attractions"], rate: 0.035 },
  wegotrip:      { categories: ["audio", "tours"],       rate: 0.24 },
  gyg:           { categories: ["tours", "attractions"], rate: 0.08 },
};

// Reference EV used to normalize the boost to [0, cap]. ~ a strong attraction.
const EV_REF = 5.5;

const _types = (p) => ((p && p.types) || []).join(" ").toLowerCase();
const _name = (p) => ((p && p.name) || "").toLowerCase();

/** Monetizable category for a place, or null if it isn't bookable via affiliates.
 *  Restaurants, bars, cafes, lodging (handled by CJ/Booking separately), and
 *  free spaces (parks/beaches) intentionally return null. */
export function monetizableCategory(place) {
  const t = _types(place);
  const n = _name(place);
  if (/restaurant|\bbar\b|cafe|coffee|bakery|meal_|food/.test(t)) return null;
  if (/lodging|hotel|motel/.test(t)) return null; // lodging = separate (CJ/Booking)
  // Events / performing arts / ticketed venues.
  if (/performing_arts|stadium|arena|concert|theater|theatre/.test(t) || /concert|live music|symphony|philharmonic/.test(n)) return "events";
  // Self-guided audio-tour fit (walkable historic/landmark districts).
  if (/(self.?guided|audio) (tour|guide)/.test(n)) return "audio";
  // Tours / experiences (boat, kayak, guided, cruise, sightseeing).
  if (/travel_agency|tour_agency/.test(t) || /\btour\b|kayak|cruise|sailing|airboat|snorkel|sightseeing|excursion|paddle/.test(n)) return "tours";
  // Ticketed attractions.
  if (/tourist_attraction|amusement_park|water_park|aquarium|zoo|museum|art_gallery|botanical/.test(t)) return "attractions";
  return null;
}

/** Best-EV affiliate for a place among the `available` (verified-live) programs.
 *  Returns { provider, category, expectedValue, rate } or null. */
export function bestAffiliate(place, available) {
  const category = monetizableCategory(place);
  if (!category) return null;
  const econ = CATEGORY_ECON[category];
  const providers = Array.isArray(available) && available.length ? available : Object.keys(PROVIDER_ECON);
  let best = null;
  for (const key of providers) {
    const pe = PROVIDER_ECON[key];
    if (!pe || !pe.categories.includes(category)) continue;
    const ev = pe.rate * econ.avgValue * econ.conv;
    if (!best || ev > best.expectedValue) best = { provider: key, category, expectedValue: Math.round(ev * 100) / 100, rate: pe.rate };
  }
  return best;
}

/** Bounded, SORT-ONLY ranking nudge (0–cap). 0 when not bookable. NEVER add to
 *  the displayed Wayfind Score. A positive value REQUIRES a disclosure label. */
export function monetizationBoost(place, opts = {}) {
  const cap = typeof opts.cap === "number" ? opts.cap : 8;
  const best = bestAffiliate(place, opts.available);
  if (!best) return 0;
  const scaled = cap * Math.min(1, best.expectedValue / EV_REF);
  return Math.round(scaled * 100) / 100;
}

/** True when a place's rank is money-influenced — drives the required label. */
export function isSponsoredPlacement(place, opts = {}) {
  return monetizationBoost(place, opts) > 0;
}

/** The exact microcopy the placement label MUST use (honest, not buried). */
export const SPONSOR_LABEL = { text: "Book it", sub: "Partner — Wayfind may earn a commission" };

// ── Guaranteed wrap: the three-tier waterfall ────────────────────────────────
// Tier 1: exact product URL (caller resolved it via the booking-CTA integrity
//         system — verifiedOffers/bookingResolver). Highest conversion.
// Tier 2: tracked DESTINATION-SEARCH link on the best-EV provider — fires for
//         EVERY monetizable card even when no exact product exists. Cookie
//         windows (7–30 days) mean any booking after the click still pays.
// Tier 3: null — the place isn't bookable through any network (restaurants,
//         bars, parks). Correctly unwrapped; that inventory monetizes through
//         coupons/partner offers instead. Never fake a button.
//
// Search-URL patterns per provider (Viator verified in-session; Tiqets/Klook
// standard patterns; TicketNetwork VERIFY before first render — marked below).
const SEARCH_URL = {
  viator: (q) => "https://www.viator.com/searchResults/all?text=" + encodeURIComponent(q),
  gyg: (q) => "https://www.getyourguide.com/s/?q=" + encodeURIComponent(q),
  tiqets: (q) => "https://www.tiqets.com/en/search/?q=" + encodeURIComponent(q),
  klook: (q) => "https://www.klook.com/en-US/search/result/?query=" + encodeURIComponent(q),
  ticketnetwork: (q) => "https://www.ticketnetwork.com/search?q=" + encodeURIComponent(q), // TODO verify exact search path in TN before first render
  wegotrip: (q) => "https://wegotrip.com/search/?q=" + encodeURIComponent(q), // TODO verify
};

/**
 * The one call the card layer makes. Returns
 *   { kind: "product"|"search", provider, url, label } or null (tier 3).
 * `url` is the UNTRACKED destination — the caller applies tracking with the
 * provider's own wrapper (withViatorTracking for viator/gyg, tpDeepLink for
 * Travelpayouts programs) so pid/marker logic stays in one place per network.
 * @param {object} place       Google/FSQ place ({ name, types, address? })
 * @param {object} [opts]      { productUrl?, city?, available? }
 */
export function wrapCard(place, opts = {}) {
  const category = monetizableCategory(place);
  if (!category) return null;
  const best = bestAffiliate(place, opts.available);
  if (!best) return null;
  if (opts.productUrl) {
    return { kind: "product", provider: best.provider, url: opts.productUrl, label: SPONSOR_LABEL };
  }
  const build = SEARCH_URL[best.provider];
  if (!build) return null;
  const q = (place && place.name ? place.name : "") + (opts.city ? " " + opts.city : "");
  if (!q.trim()) return null;
  return { kind: "search", provider: best.provider, url: build(q.trim()), label: SPONSOR_LABEL };
}

/**
 * The "Book it" target for the place detail sheet: the best-EV bookable match
 * among the caller's LIVE Travelpayouts programs, as { provider, url, label },
 * or null. The url is UNTRACKED — the caller applies tpDeepLink, which returns
 * null until the program's ids exist, so the whole surface ships dark. viator
 * and gyg are excluded on purpose: the Viator "Tickets & tours" CTA
 * (app/components/BookingCTA.js) owns those and this must never duplicate them.
 * Pure and testable without any live program ids (see scripts/test-book-it.mjs).
 * @param {object} place            Google/FSQ place ({ name, types })
 * @param {object} [opts]           { available?: string[], city?: string }
 *   available = program keys the CALLER has verified live (isTpProgramLive).
 */
export function bookItTarget(place, opts = {}) {
  const available = (opts.available || []).filter((k) => k !== "viator" && k !== "gyg");
  if (!available.length) return null;                 // no live Travelpayouts program → dark
  const wrap = wrapCard(place, { city: opts.city, available });
  if (!wrap) return null;                             // not bookable, or no eligible program
  return { provider: wrap.provider, url: wrap.url, label: wrap.label };
}

export const MONETIZE_INTERNALS = { CATEGORY_ECON, PROVIDER_ECON, EV_REF, SEARCH_URL }; // test/tuning only
