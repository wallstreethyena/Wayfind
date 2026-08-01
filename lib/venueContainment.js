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
import { isInsidePark } from "./parkZones.js";

// Types that can ENCLOSE other places.
const PARENT_TYPES = /amusement_park|theme_park|water_park|\bzoo\b|aquarium|amusement_center/i;
// Types that can be an anchor purely on scale (see LARGE_ANCHOR_REVIEWS).
const ANCHOR_TYPES = /tourist_attraction|amusement_park|theme_park|water_park|resort|entertainment/i;

// Types that are never swallowed by a parent, even when geographically inside
// its radius. A resort hotel on park property is a destination in its own right
// and has its own booking intent.
const NEVER_CHILD_TYPES = /lodging|hotel|resort_hotel|motel|campground|rv_park|airport|train_station|subway_station|transit_station|parking/i;

// A parent must be a real anchor, not a two-review roadside attraction.
export const PARENT_MIN_REVIEWS = 2000;

// A venue this heavily reviewed is an anchor even without a theme-park type.
// Live Orlando showed why: ICON Park carries 51,062 reviews but is typed only
// tourist_attraction, so the type gate never saw it as a parent and The Orlando
// Eye + Orlando Starflyer — both physically inside it — stayed peer cards.
export const LARGE_ANCHOR_REVIEWS = 20000;

// A sub-park nests under its resort complex only when the complex is clearly
// the bigger entity. Universal Orlando Resort (191,760) plainly contains
// Islands of Adventure (108,574); two comparable parks never swallow each other.
export const COMPLEX_REVIEW_RATIO = 1.5;

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
  const reviews = Number(p.reviews || 0);
  if (PARENT_TYPES.test(typesOf(p)) && reviews >= PARENT_MIN_REVIEWS) return true;
  // Type-agnostic anchor: an entertainment complex with enormous review volume
  // encloses things whatever Google typed it as.
  return ANCHOR_TYPES.test(typesOf(p)) && reviews >= LARGE_ANCHOR_REVIEWS;
}

// Normalised street address. Two results at the same street address are almost
// certainly the same complex — a far stronger containment signal than distance,
// and it costs nothing. "6000 Universal Blvd, Orlando, FL 32819, USA" appearing
// on three separate cards is exactly the duplication this collapses.
export function addressKey(p) {
  const a = String((p && p.address) || "").trim().toLowerCase();
  if (!a) return null;
  const street = a.split(",")[0]
    .replace(/\b(suite|ste|unit|bldg|building|#)\s*[\w-]+/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // A bare number or a single word is not distinctive enough to merge on.
  return street.length >= 8 && /\d/.test(street) ? street : null;
}

/**
 * Is `p` eligible to nest inside `parent`?
 *
 * A parent CAN nest inside a larger parent, but only when the larger one is
 * unambiguously the enclosing complex — same street address, or a review count
 * at least COMPLEX_REVIEW_RATIO times bigger. Without that guard two peer parks
 * (Magic Kingdom and EPCOT) could swallow each other depending on result order.
 */
export function canBeChild(p, parent) {
  if (!p || !p.name) return false;
  if (NEVER_CHILD_TYPES.test(typesOf(p))) return false;   // hotels stand alone
  if (!isParentVenue(p)) return true;
  if (!parent) return false;                              // no candidate => stays top-level
  const pr = Number(p.reviews || 0), par = Number(parent.reviews || 0);
  // The complex must be STRICTLY bigger. Without this, two venues sharing an
  // address nest into whichever the loop happened to visit first — a probe on
  // real Universal data made the 191k-review resort a child of its own 108k
  // sub-park and dropped it off the list entirely.
  if (par <= pr) return false;
  const sameAddress = !!(addressKey(p) && addressKey(parent) && addressKey(p) === addressKey(parent));
  return sameAddress || par >= pr * COMPLEX_REVIEW_RATIO;
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
  const suppressedIds = new Set();
  const childrenBy = new Map();

  for (const p of list) {
      let best = null, bestD = Infinity;
      for (const par of parents) {
        if (par === p || (par.id && p.id && par.id === p.id)) continue;
        if (!canBeChild(p, par)) continue;
        const ak = addressKey(p), pk = addressKey(par);
        // Same street address == same complex, whatever the centroids say.
        if (ak && pk && ak === pk) { best = par; bestD = -1; break; }
        const d = metresBetween(p.lat, p.lng, par.lat, par.lng);
        if (d <= radius && d < bestD) { best = par; bestD = d; }
      }
      // A coordinate-backed park zone is the structural fallback for venues
      // whose Places result does not share the park's centroid or address.
      // Bayside Stadium is the concrete failure: SeaWorld was in the same
      // ranked pool, but the stadium still escaped as a peer destination.
      if (!best && canBeChild(p)) {
        const parkName = isInsidePark(p.lat, p.lng, p.name);
        if (parkName) {
          const needle = parkName.toLowerCase();
          best = parents.find((par) => {
            const n = String(par && par.name || "").toLowerCase();
            return n.includes(needle) || needle.includes(n);
          }) || null;
          // If the park result is absent, hiding the inside-only venue is the
          // honest failure mode. It cannot be visited independently, so one
          // wrong card is worse than one fewer result. When the parent arrives
          // in the pool, the same item is attached below it automatically.
          if (!best) {
            const childId = p.id || p.name;
            suppressedIds.add(childId);
            nestedIds.add(childId);
            continue;
          }
        }
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

  const groups = [];
  for (const p of list) {
    const id = p.id || p.name;
    if (nestedIds.has(id)) continue;             // rendered inside its parent
    groups.push({ place: p, children: childrenBy.get(id) || [] });
  }
  return { groups, nestedIds, suppressedIds };
}

/**
 * Presentation-ready destinations. Ranking stays upstream; this only attaches
 * child venues to their parent and removes known inside-only orphans.
 */
export function consolidateDestinations(places, opts) {
  const { groups, nestedIds, suppressedIds } = groupByContainment(places, opts);
  return {
    places: groups.map(({ place, children }) => children && children.length
      ? { ...place, _children: children }
      : place),
    nestedIds,
    suppressedIds,
  };
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
