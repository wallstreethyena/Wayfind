// lib/marqueeDayTrips.js — the MARQUEE lane of "Worth the Drive".
//
// OWNER (2026-08-11): "on worth the drive we got some of the best places
// around and you are going to give me museums and a park… give me disney
// springs give me them parks give me the best of the best it's worth the
// drive… 2 hour drive max."
//
// ROOT CAUSE the registry exists to fix: the worth-the-drive query bank
// searches NEAR THE READER (radiusM 50mi, proximity-biased text search), so
// Magic Kingdom can never be returned to a Bradenton reader — the bank finds
// the best thing within 50 miles and leads with a county park. Florida's
// handful of national-draw destinations are therefore DECLARED here with
// verified coordinates, and resolved into REAL Google place cards (live
// rating, review count, photo) through the same guarded, shared-cache
// /api/places/search proxy every other card uses.
//
// LAWS:
//  · ADMISSION IS DEMAND, NEVER COMMISSION. Entries are the state's highest-
//    visitation destinations; affiliate status is not an input and several
//    entries carry no affiliate at all. Leading the rail with the marquee
//    lane is an order-only, editorially stated rule (two lanes, each lane
//    internally in its ranker's own order) — no score is ever changed.
//  · THE 2-HOUR CAP (owner). DRIVE_MAX_MI = 110 straight-line miles ≈ two
//    hours of Florida highway driving (~1.2 road factor at ~65 mph average).
//    The near edge is the rail's own minDistanceMi: closer than that it is
//    not a drive, it is a nearby card's job — and Busch Gardens shown to a
//    Tampa reader as a "day trip" would read as a bug.
//  · THE REGISTRY ALONE CAN NEVER MINT A CARD. A card renders only when
//    Google confirms the venue live: the anchor's own name proof, coordinates
//    within IDENTITY_RADIUS_MI of the declared anchor, an allowed type, and
//    a positive rating (toRow refuses rating-less rows).
//  · COST IS FLAT. Each anchor's search is keyed to the ANCHOR's fixed
//    coordinates (never the reader's), so every reader everywhere shares one
//    cached upstream call per anchor. No `cat` param: inventory serving must
//    not answer a named-destination query with whatever it has in that cell.
import { toRow, rankRows } from "./intentPages.js";

export const DRIVE_MAX_MI = 110;
export const IDENTITY_RADIUS_MI = 5;
export const MARQUEE_RAIL_MAX = 8;
// ── ONE OPERATOR MAY NOT BE THE DAY TRIP (v7.24) ────────────────────────────
// Measured on the live rail from Parrish: 7 of the 10 "Worth the Drive" cards
// were Disney Springs, Epcot, Animal Kingdom, Magic Kingdom, Hollywood Studios,
// Universal Studios and Islands of Adventure. Two operators, seven seats.
//
// The cause was not the ranking — it was the RESOLUTION BUDGET. There are eight
// tier-1 anchors and every one of them is Disney or Universal, and
// marqueeCandidates takes the first MARQUEE_RAIL_MAX by (tier, distance). So
// the eight lookups were spent before SeaWorld, Busch Gardens, Kennedy Space
// Center, LEGOLAND or ICON Park were ever considered. A reader in Bradenton was
// shown five ways to visit Walt Disney World and no other idea in the state.
//
// The cap is applied when choosing WHICH anchors to look up, so it costs
// nothing extra and still never reorders a shown card — rankRows owns that.
export const MARQUEE_MAX_PER_OPERATOR = 2;
// A national destination with six figures of reviews at 4.4 is the definition
// of worth the drive; the local lane's 4.6 floor exists for local finds. The
// review bar here is 5,000 — nothing marquee is thinner than that.
export const MARQUEE_FLOOR = { rating: 4.3, reviews: 5000 };

// tier 1 = the parks themselves plus Disney Springs; tier 2 = the rest of the
// state's headline draws. Tier decides which anchors get RESOLVED first when
// more are in range than the rail can seat — it never reorders shown cards.
export const MARQUEE_DAY_TRIPS = Object.freeze([
  { key: "magic_kingdom", operator: "disney", ownerNamed: true, tier: 1, name: "Magic Kingdom Park", town: "Lake Buena Vista", lat: 28.4177, lng: -81.5812, proof: /magic kingdom/i, types: ["amusement_park", "theme_park", "tourist_attraction"] },
  { key: "epcot", operator: "disney", tier: 1, name: "EPCOT", town: "Lake Buena Vista", lat: 28.3747, lng: -81.5494, proof: /\bepcot\b/i, types: ["amusement_park", "theme_park", "tourist_attraction"] },
  { key: "hollywood_studios", operator: "disney", tier: 1, name: "Disney's Hollywood Studios", town: "Lake Buena Vista", lat: 28.3575, lng: -81.5583, proof: /hollywood studios/i, types: ["amusement_park", "theme_park", "tourist_attraction"] },
  { key: "animal_kingdom", operator: "disney", tier: 1, name: "Disney's Animal Kingdom Theme Park", town: "Lake Buena Vista", lat: 28.3589, lng: -81.5901, proof: /animal kingdom/i, types: ["amusement_park", "theme_park", "tourist_attraction"] },
  { key: "disney_springs", operator: "disney", ownerNamed: true, tier: 1, name: "Disney Springs", town: "Lake Buena Vista", lat: 28.3703, lng: -81.5194, proof: /disney springs/i, types: ["shopping_mall", "shopping_center", "tourist_attraction", "amusement_park"] },
  { key: "universal_studios", operator: "universal", tier: 1, name: "Universal Studios Florida", town: "Orlando", lat: 28.4794, lng: -81.4685, proof: /universal studios/i, types: ["amusement_park", "theme_park", "tourist_attraction"] },
  { key: "islands_of_adventure", operator: "universal", tier: 1, name: "Universal's Islands of Adventure", town: "Orlando", lat: 28.4711, lng: -81.4713, proof: /islands of adventure/i, types: ["amusement_park", "theme_park", "tourist_attraction"] },
  { key: "epic_universe", operator: "universal", tier: 1, name: "Universal Epic Universe", town: "Orlando", lat: 28.4157, lng: -81.4610, proof: /epic universe/i, types: ["amusement_park", "theme_park", "tourist_attraction"] },
  { key: "seaworld_orlando", tier: 2, name: "SeaWorld Orlando", town: "Orlando", lat: 28.4114, lng: -81.4633, proof: /seaworld/i, types: ["amusement_park", "theme_park", "tourist_attraction", "aquarium"] },
  { key: "busch_gardens", tier: 2, name: "Busch Gardens Tampa Bay", town: "Tampa", lat: 28.0372, lng: -82.4194, proof: /busch gardens/i, types: ["amusement_park", "theme_park", "tourist_attraction", "zoo"] },
  { key: "kennedy_space_center", tier: 2, name: "Kennedy Space Center Visitor Complex", town: "Merritt Island", lat: 28.5230, lng: -80.6810, proof: /kennedy space center/i, types: ["tourist_attraction", "museum", "visitor_center"] },
  { key: "legoland", tier: 2, name: "LEGOLAND Florida Resort", town: "Winter Haven", lat: 27.9906, lng: -81.6900, proof: /legoland/i, types: ["amusement_park", "theme_park", "tourist_attraction", "water_park"] },
  { key: "icon_park", tier: 2, name: "ICON Park", town: "Orlando", lat: 28.4432, lng: -81.4682, proof: /icon park/i, types: ["amusement_park", "tourist_attraction", "observation_deck", "shopping_mall"] },
]);

const R_MI = 3958.8;
export function marqueeDistMi(aLat, aLng, bLat, bLng) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R_MI * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * The band + the resolution budget. Anchors inside (minDistanceMi, DRIVE_MAX_MI],
 * tier first then nearest, capped at `max` — this decides which anchors are
 * WORTH A LOOKUP, not the shown order (rankRows owns that inside the lane).
 */
export function marqueeCandidates(origin, { minDistanceMi = 17, max = MARQUEE_RAIL_MAX, maxPerOperator = MARQUEE_MAX_PER_OPERATOR } = {}) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const inBand = MARQUEE_DAY_TRIPS
    .map((a) => ({ ...a, distMi: marqueeDistMi(origin.lat, origin.lng, a.lat, a.lng) }))
    .filter((a) => a.distMi > minDistanceMi && a.distMi <= DRIVE_MAX_MI)
    // `ownerNamed` first WITHIN an operator: the owner asked for these two by
    // name — "give me disney springs give me them parks" — and with five Disney
    // anchors at almost identical distance, plain (tier, distance) sorting
    // decided that ask on a two-mile difference. Independents are unaffected.
    .sort((x, y) => (Number(!!y.ownerNamed) - Number(!!x.ownerNamed)) || (x.tier - y.tier) || (x.distMi - y.distMi));
  // The operator cap, applied to the LOOKUP budget. An anchor with no operator
  // is an independent destination and is never capped against another.
  const perOp = {};
  const out = [];
  for (const a of inBand) {
    if (out.length >= Math.max(0, max)) break;
    if (a.operator) {
      const n = perOp[a.operator] || 0;
      if (maxPerOperator > 0 && n >= maxPerOperator) continue;
      perOp[a.operator] = n + 1;
    }
    out.push(a);
  }
  return out;
}

/** Google's live answer for one anchor, or null when identity is not proven. */
export function verifiedMarqueeRow(anchor, places) {
  for (const p of Array.isArray(places) ? places : []) {
    const row = toRow(p);
    if (!row || !row.id || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue;
    if (!anchor.proof.test(row.name)) continue;
    if (marqueeDistMi(anchor.lat, anchor.lng, row.lat, row.lng) > IDENTITY_RADIUS_MI) continue;
    if (!row.types.some((t) => anchor.types.includes(t))) continue;
    return row;
  }
  return null;
}

/**
 * Resolve the marquee lane into ranked, render-ready rows.
 *
 * The lane is ranked by the SAME rankRows as the local lane (origin distance,
 * governed score, planAhead — a landmark closed right now is still tomorrow's
 * plan), with the marquee floor. `marquee: true` is stamped so the UI and the
 * dedupe can tell the lanes apart.
 */
export async function resolveMarqueeDayTrips({ origin, minDistanceMi = 17, max = MARQUEE_RAIL_MAX, fetchImpl = fetch } = {}) {
  const candidates = marqueeCandidates(origin, { minDistanceMi, max });
  if (!candidates.length) return [];
  const settled = await Promise.allSettled(candidates.map(async (anchor) => {
    // Anchor-keyed URL: identical for every reader, so the shared server cache
    // makes each anchor ONE upstream call, ever, per TTL.
    const u = "/api/places/search?q=" + encodeURIComponent(anchor.name)
      + "&lat=" + anchor.lat.toFixed(2) + "&lng=" + anchor.lng.toFixed(2)
      + "&radius=8000&n=5";
    const r = await fetchImpl(u);
    const j = r && r.ok ? await r.json() : null;
    const row = verifiedMarqueeRow(anchor, j && j.places);
    return row ? { ...row, marquee: true, marqueeKey: anchor.key } : null;
  }));
  const rows = settled.map((s) => (s.status === "fulfilled" ? s.value : null)).filter(Boolean);
  return rankRows(rows, MARQUEE_FLOOR, { origin, planAhead: true, minDistanceMi })
    .filter((r) => Number.isFinite(r.distMi) && r.distMi <= DRIVE_MAX_MI)
    .map((r) => ({ ...r, marquee: true }));
}
