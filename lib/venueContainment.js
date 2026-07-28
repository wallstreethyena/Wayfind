// lib/venueContainment.js — one destination, one card.
//
// THE PROBLEM
// -----------
// Searching Orlando returns Magic Kingdom AND Space Mountain AND Haunted
// Mansion AND Once Upon a Toy as four peer results. They are not four
// destinations — they are one destination and three things inside it. The list
// reads as noise, the same park is effectively repeated, and a visitor deciding
// "where do I go today" gets no help from a ride that they cannot visit without
// first buying a ticket to the park it lives in.
//
// A ride is not a destination. It is a REASON to pick the destination.
//
// THE RULE
// --------
// Detect containment from the data rather than from a hardcoded list of Orlando
// parks. A curated map would be accurate for Orlando on day one and wrong
// everywhere else — and the whole point of the app is that it works in any
// city. So:
//
//   parent  = a large enclosing venue (theme park, water park, zoo, aquarium)
//             with enough reviews to be a real anchor
//   child   = any place inside that parent's footprint that is not itself a
//             parent, and is not lodging (a hotel across the road is its own
//             destination, not part of the park)
//
// Footprint is a radius, because Places gives us a point and not a polygon.
// The radius is deliberately TIGHT: a false nest (hiding a real destination
// inside an unrelated card) is much worse than a missed nest (one extra row).
//
// This module is pure and side-effect free so the rule is unit-testable without
// a browser, a network call, or a Places key.

// Types that can ENCLOSE other places.
const PARENT_TYPES = /amusement_park|theme_park|water_park|\bzoo\b|aquarium|amusement_center/i;

// Types that are never swallowed by a parent, even when geographically inside
// its radius. A resort hotel on park property is a destination in its own right
// and has its own booking intent.
const NEVER_CHILD_TYPES = /lodging|hotel|resort_hotel|motel|campground|rv_park|airport|train_station|subway_station|transit_station|parking/i;

// A parent must be a real anchor, not a two-review roadside attraction.
export const PARENT_MIN_REVIEWS = 2000;

// Metres. A large theme park is roughly 1-1.5 km across, so ~800 m from the
// centroid covers the park itself without reaching across a highway. Tight on
// purpose — see the note above about which error is worse.
export const CONTAINMENT_RADIUS_M = 800;

const R_EARTH_M = 6371000;

/** Great-circle distance in metres. */
export function metresBetween(aLat, aLng, bLat, bLng) {
  if (![aLat, aLng, bLat, bLng].every((v) => typeof v === "number" && isFinite(v))) return Infinity;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R_EARTH_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

const typesOf = (p) => ((p && p.types) || []).join(" ").toLowerCase();

/** Could this place enclose others? */
export function isParentVenue(p) {
  if (!p || !p.name) return false;
  if (!PARENT_TYPES.test(typesOf(p))) return false;
  return Number(p.reviews || 0) >= PARENT_MIN_REVIEWS;
}

/** Is this place eligible to be nested inside something else? */
export function canBeChild(p) {
  if (!p || !p.name) return false;
  if (isParentVenue(p)) return false;             // two parks never nest
  return !NEVER_CHILD_TYPES.test(typesOf(p));      // hotels stand alone
}

/**
 * Group a flat result list into parents-with-children plus standalone places,
 * PRESERVING the incoming rank order. Ranking is decided upstream by the
 * Wayfind score; this only changes presentation, never merit order.
 *
 * @param {Array} places ranked results
 * @param {{radiusM?:number, maxChildren?:number}} [opts]
 * @returns {{ groups: Array<{place:Object, children:Array}>, nestedIds:Set }}
 *          `groups` is in the original order with children attached.
 */
export function groupByContainment(places, opts) {
  const list = Array.isArray(places) ? places.filter(Boolean) : [];
  const radius = (opts && opts.radiusM) || CONTAINMENT_RADIUS_M;
  const maxChildren = (opts && opts.maxChildren) || 6;

  const parents = list.filter(isParentVenue);
  const nestedIds = new Set();
  const childrenBy = new Map();

  if (parents.length) {
    for (const p of list) {
      if (!canBeChild(p)) continue;
      let best = null, bestD = Infinity;
      for (const par of parents) {
        if (par === p || (par.id && p.id && par.id === p.id)) continue;
        const d = metresBetween(p.lat, p.lng, par.lat, par.lng);
        if (d <= radius && d < bestD) { best = par; bestD = d; }
      }
      if (!best) continue;
      const key = best.id || best.name;
      const arr = childrenBy.get(key) || [];
      // Keep the ranked order; cap so one park cannot dominate the screen.
      if (arr.length < maxChildren) {
        arr.push(p);
        childrenBy.set(key, arr);
        nestedIds.add(p.id || p.name);
      }
    }
  }

  const groups = [];
  for (const p of list) {
    const id = p.id || p.name;
    if (nestedIds.has(id)) continue;             // rendered inside its parent
    groups.push({ place: p, children: childrenBy.get(id) || [] });
  }
  return { groups, nestedIds };
}

/**
 * Honest label for the nested block. Never claims a ranking we did not compute
 * and never says "top rides" for things that are not rides.
 */
export function childrenLabel(parent, children) {
  const n = (children || []).length;
  if (!n) return "";
  const inside = /amusement_park|theme_park/i.test(typesOf(parent)) ? "inside this park"
    : /water_park/i.test(typesOf(parent)) ? "inside this water park"
    : /\bzoo\b|aquarium/i.test(typesOf(parent)) ? "inside" : "inside";
  return "Top rated " + inside;
}
