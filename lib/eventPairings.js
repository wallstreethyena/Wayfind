// lib/eventPairings.js — "make it an outing": BEFORE/AFTER picks for the
// event, not a generic top-rated list near it. So an event page answers
// "where do I go before/after this" the way people actually plan a night out.
//
// WHY THIS EXISTS (owner, 2026-08-23, extended 2026-09-22): "when you are
// inside of these page we need to make sure that we have other places that
// are near the location that are worth going to that pairs well." The event
// page carried only a one-line `pairing` sentence; this turns it into actual,
// ranked, tappable places. The 2026-09-22 change is what "pairs well" means:
// a concert, a symphony, a kids' matinee and a food festival do NOT want the
// same shelf of best-rated restaurants — lib/eventOuting.js classifies the
// event and slots these candidates into "before" and "after" picks that
// match it (see docs/proposals/events-outing-intelligence.md).
//
// It reuses the ONE retrieval the whole app trusts — buildNearbyPool over
// wf_inventory, reader-first, governed-score ranked (lib/nearbyPool.js) — so
// these are the SAME places, judged the SAME way, that a rail would show near
// that point. Nothing here invents a score, a place or an hours claim.
//
// TWO honesty rules are structural:
//   1. GENUINELY NEARBY. Capped at maxMi so a page never calls a 20-mile-away
//      restaurant something that "pairs well" with the event.
//   2. NEVER A THIN SHELF. Returns [] below a floor, and the page renders
//      nothing rather than a lonely card or two. Measured 2026-08-23: Daytona
//      and other North/Panhandle venues have little owned inventory nearby, so
//      those pages correctly show no section instead of a starved one.
import { buildNearbyPool } from "./nearbyPool.js";
import { wayfindScore } from "./wayfindScore.js";
import { classifyEvent, fillOutingSlots } from "./eventOuting.js";

// Eat, do, and go out — the three pools the outing engine picks from. Beaches
// are deliberately out: a beach is a destination of its own, not an "after
// the event" stop, and its pool is gated on a different radius rule.
const PAIR_CATS = ["restaurants", "things-to-do", "nightlife"];

// The card/map "cat" label — a reader-facing family, derived from the PLACE's
// own type (never from which of the three pools it happened to come from, so
// a bar-forward restaurant still reads "Night out"). eventMapFamily
// (lib/eventMapPlaces.js) groups map pins primarily off primaryType/types,
// which are unchanged here, so this relabeling cannot break map chips.
const CAFE_TYPES = new Set(["cafe", "coffee_shop", "tea_house"]);
const DESSERT_TYPES = new Set(["bakery", "pastry_shop", "donut_shop", "ice_cream_shop", "dessert_shop", "juice_shop", "acai_shop", "candy_store", "confectionery", "cake_shop", "chocolate_shop", "frozen_yogurt_shop", "patisserie"]);
const NIGHTLIFE_TYPES = new Set(["bar", "cocktail_bar", "wine_bar", "pub", "irish_pub", "brewery", "brewpub", "beer_garden", "gastropub", "sports_bar", "lounge_bar", "lounge", "night_club", "dive_bar", "karaoke", "hookah_bar", "bar_and_grill"]);
function familyLabel(r) {
  const primary = String(r.primaryType || "").toLowerCase();
  const types = (Array.isArray(r.types) ? r.types : []).map((t) => String(t).toLowerCase());
  const has = (set) => set.has(primary) || types.some((t) => set.has(t));
  if (has(CAFE_TYPES)) return "Cafe";
  if (has(DESSERT_TYPES)) return "Dessert";
  if (has(NIGHTLIFE_TYPES)) return "Night out";
  if (primary === "restaurant" || primary.endsWith("_restaurant") || primary === "steak_house" || primary === "diner" || primary === "food_court") return "Restaurant";
  return "To do";
}

/**
 * Before/after outing picks for one event, or [] when there is nothing
 * honestly nearby to show.
 *
 * @param {{lat:number,lng:number,city?:string,place_id?:string,
 *   name?:string,date?:string,time?:string,segment?:string,genre?:string,
 *   outing?:object}} event live-shaped fields feed classifyEvent directly;
 *   a pre-classified `event.outing` (lib/eventPairingsCache.js) skips
 *   re-classifying.
 * @param {{max?:number, maxMi?:number, min?:number, fetchImpl?:Function}} [opts]
 * @returns {Promise<object[]>} canonical IconicPlaceCard rows, each stamped
 *   with `outing` (slot + rail copy) and `rankingNote`, plus map coordinates
 */
export async function eventPairings(event, opts = {}) {
  const max = opts.max || 8;
  const maxMi = opts.maxMi || 12;      // "make a day of it near the event", not a road trip
  const min = opts.min || 3;           // never ship a thin shelf
  const requireComplete = opts.requireComplete === true;
  if (!event || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return [];
  const origin = { lat: event.lat, lng: event.lng };
  const locName = event.city || null;

  const pools = await Promise.all(
    PAIR_CATS.map((c) =>
      buildNearbyPool(origin, c, { locName, fetchImpl: opts.fetchImpl, includeStatus: requireComplete })
        .then((result) => {
          const rows = requireComplete ? result?.rows : result;
          if (requireComplete && (!result || result.degraded || !Array.isArray(result.rows))) {
            throw new Error(`Event pairing inventory is incomplete for ${c}`);
          }
          return (rows || []).map((r) => ({ ...r, _cat: c }));
        })
        .catch((error) => {
          if (requireComplete) throw error;
          return [];
        }),
    ),
  );

  const seen = new Set();
  const merged = [];
  for (const r of pools.flat()) {
    if (!r || !r.id || seen.has(r.id)) continue;
    if (event.place_id && r.id === event.place_id) continue;   // never pair a venue with itself
    if (!(r.distMi != null && r.distMi <= maxMi)) continue;    // genuinely nearby only
    seen.add(r.id);
    merged.push(r);
  }

  // THE OUTING ENGINE. A bare governed-score sort+slice used to decide the
  // order here — that was "top rated nearby," not "what pairs with THIS
  // event." classifyEvent reads the event's own fields (or a pre-computed
  // `event.outing` — see lib/eventPairingsCache.js, which classifies once
  // outside the cache boundary) and fillOutingSlots slots the merged
  // candidates into before/after picks for that archetype.
  const ctx = (event && event.outing) || classifyEvent(event);
  const outing = fillOutingSlots(ctx, merged, { max, min });

  if (outing.length < min) return [];   // still never a thin shelf
  return outing.map((r) => {
    // Shown == sorted. IconicPlaceCard reads governed_score, while the map
    // callout and pairingHref read wfScore. Stamp the same already-governed
    // score into both fields so all three surfaces show the number that
    // produced this order. The base formula remains the fallback only for a
    // legacy row without the pool's governed stamp.
    const visibleScore = Number.isFinite(r.governed_score)
      ? r.governed_score
      : wayfindScore(r.rating, r.reviews);
    const label = familyLabel(r);
    return {
      id: r.id,
      name: r.name,
      rating: r.rating,
      reviews: r.reviews,
      types: Array.isArray(r.types) ? r.types : [],
      primaryType: r.primaryType || null,
      status: r.status || null,
      priceLevel: r.priceLevel != null ? r.priceLevel : null,
      wfScore: visibleScore,
      governed_score: visibleScore,
      distMi: r.distMi,
      // v8.99 — the map pins these. The pool row always carries both (it is
      // filtered on Number.isFinite(lat/lng) at shape time), so nothing here
      // can put a pin on a place that has no location.
      lat: r.lat,
      lng: r.lng,
      photoRef: r.photoRef || null,
      editorial: r.editorial || null,
      cat: label,
      category: label,
      city: locName,
      // 2026-09-22 — WHY this place, not just that it scored well: which
      // slot it filled (dinner before the show, nightcap after, ...) and the
      // rail copy for the whole shelf. See lib/eventOuting.js.
      outing: r.outing,
      rankingNote: r.rankingNote,
    };
  });
}

/** The canonical in-app place URL, carrying the metadata /p/[id] reads for its
 *  title, score chip and OG card (same params the place cards pass). */
export function pairingHref(p) {
  const q = new URLSearchParams();
  if (p.name) q.set("t", p.name);
  if (p.city) q.set("loc", p.city);
  if (p.rating != null) q.set("r", String(p.rating));
  if (p.reviews != null) q.set("rev", String(p.reviews));
  if (p.wfScore != null) q.set("sc", String(p.wfScore));
  if (p.cat) q.set("cat", p.cat);
  const qs = q.toString();
  return "/p/" + encodeURIComponent(p.id) + (qs ? "?" + qs : "");
}
