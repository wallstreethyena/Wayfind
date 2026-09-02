// lib/eventPairings.js — "make it an outing": the real places worth going to
// NEAR an event, so an event page answers "what else is around this" the way
// the app answers it everywhere else.
//
// WHY THIS EXISTS (owner, 2026-08-23): "when you are inside of these page we
// need to make sure that we have other places that are near the location that
// are worth going to that pairs well." The event page carried only a one-line
// `pairing` sentence; this turns it into actual, ranked, tappable places.
//
// It reuses the ONE retrieval the whole app trusts — buildNearbyPool over
// wf_inventory, reader-first, governed-score ranked (lib/nearbyPool.js) — so
// these are the SAME places, judged the SAME way, that a rail would show near
// that point. Nothing here invents a score or a place.
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

// Eat, do, and go out — the three things you pair with an event. Beaches are
// deliberately out: a beach is a destination of its own, not an "after the
// event" stop, and its pool is gated on a different radius rule.
const PAIR_CATS = ["restaurants", "things-to-do", "nightlife"];
const CAT_LABEL = { restaurants: "Restaurant", "things-to-do": "To do", nightlife: "Night out" };

/**
 * Ranked nearby places for one event, or [] when there is nothing honestly
 * nearby to show.
 *
 * @param {{lat:number,lng:number,city?:string,place_id?:string}} event
 * @param {{max?:number, maxMi?:number, min?:number, fetchImpl?:Function}} [opts]
 * @returns {Promise<object[]>} card-shaped rows: id,name,rating,reviews,wfScore,distMi,photoRef,cat,city
 */
export async function eventPairings(event, opts = {}) {
  const max = opts.max || 6;
  const maxMi = opts.maxMi || 12;      // "make a day of it near the event", not a road trip
  const min = opts.min || 3;           // never ship a thin shelf
  if (!event || !Number.isFinite(event.lat) || !Number.isFinite(event.lng)) return [];
  const origin = { lat: event.lat, lng: event.lng };
  const locName = event.city || null;

  const pools = await Promise.all(
    PAIR_CATS.map((c) =>
      buildNearbyPool(origin, c, { locName, fetchImpl: opts.fetchImpl })
        .then((rows) => (rows || []).map((r) => ({ ...r, _cat: c })))
        .catch(() => []),
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
  // One stamp, one order: governed score (already the sort inside each pool),
  // re-applied across the merged set so eat / do / night out interleave by merit.
  merged.sort((a, b) => (Number(b.governed_score) || 0) - (Number(a.governed_score) || 0));

  if (merged.length < min) return [];
  return merged.slice(0, max).map((r) => ({
    id: r.id,
    name: r.name,
    rating: r.rating,
    reviews: r.reviews,
    wfScore: wayfindScore(r.rating, r.reviews),
    distMi: r.distMi,
    photoRef: r.photoRef || null,
    cat: CAT_LABEL[r._cat] || "Nearby",
    city: locName,
  }));
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
