// Reuse the Stays inventory, centered on the event rather than the reader.
// No live discovery or new booking resolver: missing attribution stays closed.
import { serveFromInventory, distMeters } from "./inventoryServe.js";
import { isTrueLodging } from "./lodging.js";
import { hotelCardImageSrc } from "./hotelImage.js";
import { wayfindScore } from "./wayfindScore.js";
import { validStayOrigin } from "./stayOrigin.js";
import { isOperational } from "./businessStatus.js";
import { orderPlaceRecommendations } from "./placeRecommendationOrder.js";

export { validStayOrigin } from "./stayOrigin.js";

export const EVENT_STAYS_RADIUS_MI = 12;

// VENUE-FIRST STAY RANKING (owner, 2026-09-30: "we are recommending more
// places that MAKES sense"). The event page is not a destination poster: a
// reader booking a room for a show wants to walk back after the encore. A
// pure Wayfind Score sort inside 12 miles sent a Jannus Live (downtown St
// Pete) page to five beach resorts 7 to 9 miles away, while 11 real hotels
// sat within half a mile (measured on wf_inventory 2026-09-30, Hollander
// 4.7 / 3,209 reviews at 0.34 mi lost to a 4.9 / 423 beach hotel at 7.4 mi).
//
// The rule, in order:
//   1. QUALITY FLOOR. Below EVENT_STAY_MIN_SCORE a stay is only a fallback;
//      it never outranks a room that clears the floor.
//   2. STAY CLOSE WHEN WE CAN. If at least `max` floor-clearing stays sit
//      within EVENT_STAY_CLOSE_MI, nothing farther is shown at all.
//   3. SELECT. Within what is left, select by 0.55 quality + 0.45 proximity,
//      where proximity is 1 inside a comfortable walk and decays after it,
//      so a 4.9 an hour's walk away does not beat a 4.7 around the corner.
//   4. DISPLAY. The selected stays are ordered by the actual Wayfind Score
//      badge. Proximity selects the practical rooms, never a lower visible
//      rank above a higher one. Equal badges retain the selected order.
// Nothing here invents a score: the card's governed/stored score is unchanged.
export const EVENT_STAY_WALK_MI = 0.6;
export const EVENT_STAY_CLOSE_MI = 3;
export const EVENT_STAY_MIN_SCORE = 75;

export function venueStayProximity(distMi) {
  if (!Number.isFinite(distMi)) return 0;
  if (distMi <= EVENT_STAY_WALK_MI) return 1;
  return Math.exp(-(distMi - EVENT_STAY_WALK_MI) / 1.5);
}

export function venueStayRank(stays, max = 6) {
  const clears = (p) => Number.isFinite(p.wfScore) && p.wfScore >= EVENT_STAY_MIN_SCORE;
  const closeGood = stays.filter((p) => clears(p) && p.distMi <= EVENT_STAY_CLOSE_MI);
  const pool = closeGood.length >= max ? closeGood : stays;
  const rank = (p) => 0.55 * ((Number.isFinite(p.wfScore) ? p.wfScore : 0) / 100) + 0.45 * venueStayProximity(p.distMi);
  const selected = pool
    .map((p) => ({ p, good: clears(p) ? 1 : 0, r: rank(p) }))
    .sort((a, b) => b.good - a.good || b.r - a.r || a.p.distMi - b.p.distMi || String(a.p.id).localeCompare(String(b.p.id)))
    .map(({ p }) => p)
    .slice(0, max);
  return orderPlaceRecommendations(selected);
}

/**
 * @param {object[]} rows owned + inventory stay rows
 * @param {{lat:number,lng:number}} origin
 * @param {number} [max]
 * @param {{rank?: "score"|"venue"}} [opts] "score" (default) keeps the
 *   Wayfind Score order the destination poster promises; "venue" is the
 *   event page's walk-back-after-the-show selection (venueStayRank). Both
 *   display the selected stays in descending Wayfind Score badge order.
 */
export function selectEventStays(rows, origin, max = 6, opts = {}) {
  if (!validStayOrigin(origin?.lat, origin?.lng)) return [];
  const seen = new Set();
  const shaped = rows.filter((p) => {
    if (!p?.id || !p.name || !isOperational(p) || !isTrueLodging(p) || !validStayOrigin(p.lat, p.lng)) return false;
    const key = String(p.googlePlaceId || p.id).trim();
    if (!key) return false;
    if (seen.has(key) || distMeters(origin.lat, origin.lng, p.lat, p.lng) > EVENT_STAYS_RADIUS_MI * 1609.344) return false;
    seen.add(key);
    return true;
  }).map((p) => {
    const sourceId = String(p.id).trim();
    const googlePlaceId = String(p.googlePlaceId || "").trim();
    const id = googlePlaceId || sourceId;
    const mapsOnly = sourceId.startsWith("wfh-") && !googlePlaceId;
    return { ...p, ...(id !== sourceId ? { sourceId } : {}), id, category: "hotels", distMi: distMeters(origin.lat, origin.lng, p.lat, p.lng) / 1609.344,
      detailHref: mapsOnly
        ? `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${encodeURIComponent(p.name)}`
        : `/p/${encodeURIComponent(id)}`,
      mapsOnly,
    };
  });
  if (opts.rank === "venue") return venueStayRank(shaped, max);
  // Keep the selector's established score/distance tiebreak before the stable
  // badge-order pass. The shared renderer then preserves this chosen tie order.
  const selectedOrder = shaped.sort((a, b) => (b.wfScore ?? -1) - (a.wfScore ?? -1) || a.distMi - b.distMi);
  return orderPlaceRecommendations(selectedOrder).slice(0, max);
}

const readStayInventory = async (options) => (await import("./hotels.js")).searchHotels(options);
function eventStayPhoto(p) {
  // One hotel resolver for every stay surface (lib/hotelImage.js).
  return hotelCardImageSrc({ id: p?.id, name: p?.displayName?.text, photo_url: p?.photo_url, photoUrl: p?.photoUrl, photos: p?.photos });
}
export async function eventStays(origin, { readOwned = readStayInventory, readInventory = serveFromInventory } = {}) {
  if (!validStayOrigin(origin?.lat, origin?.lng)) return { places: [], unavailable: false };
  const [owned, inventory] = await Promise.allSettled([
    readOwned({ lat: origin.lat, lng: origin.lng, limit: 50 }),
    readInventory("hotels", origin.lat, origin.lng, EVENT_STAYS_RADIUS_MI * 1609.344, 50, "all", { failLoud: true, primaryOnly: true, deadlineMs: 2500 }),
  ]);
  const rows = inventory.status === "fulfilled" ? inventory.value.map((p) => ({
    id: p.id, name: p.displayName?.text, lat: p.location?.latitude, lng: p.location?.longitude,
    types: p.types || [], primaryType: p.primaryType, rating: p.rating, reviews: p.userRatingCount || 0,
    wfScore: wayfindScore(p.rating, p.userRatingCount || 0), address: p.formattedAddress || "",
    // Keep a stored inventory URL only when it passes the shared non-stock URL
    // validator. Otherwise retain the exact place-bound Google ref path.
    photo: eventStayPhoto(p),
    blurb: p.editorialSummary?.text || null,
  })) : [];
  const places = selectEventStays([...(owned.status === "fulfilled" ? owned.value : []), ...rows], origin, 6, { rank: "venue" });
  return { places, unavailable: !places.length && (owned.status === "rejected" || inventory.status === "rejected") };
}

const readAllOwnedHotels = async (origin) => (await import("./hotels.js")).searchHotels({ ...origin, exhaustive: true });

const HOTEL_MARKET_NAMES = Object.freeze({
  orlando: "Orlando, Florida",
  tampa: "Tampa Bay, Florida",
  "st-pete": "St. Petersburg, Florida",
  "miami-dade": "Miami-Dade County, Florida",
  broward: "Broward County, Florida",
  "palm-beach": "Palm Beach County, Florida",
  keys: "Florida Keys",
  "manatee-sarasota": "Manatee and Sarasota Counties, Florida",
});

export function hotelMarketName(metro) {
  const key = String(metro || "").trim().toLowerCase();
  return Object.hasOwn(HOTEL_MARKET_NAMES, key) ? HOTEL_MARKET_NAMES[key] : "";
}

export function completePoolPlace(row) {
  const signals = row?.signals || {};
  const photoUrl = row?.photo_url || signals.photo_url || signals.photoUrl || null;
  return {
    id: row?.place_id, name: row?.name, lat: Number(row?.lat), lng: Number(row?.lng),
    types: row?.google_types || [], primaryType: row?.primary_type,
    rating: signals.rating, reviews: signals.reviews || 0,
    wfScore: wayfindScore(signals.rating, signals.reviews || 0),
    address: signals.formattedAddress || signals.address || "",
    // BookingCTA accepts a place's own city when no street address exists.
    // Only the row's persisted market may supply it; the selected event city
    // is deliberately absent from this mapper and unknown/generic slugs close.
    city: hotelMarketName(row?.metro),
    photo: hotelCardImageSrc({ place_id: row?.place_id, name: row?.name, photo_url: photoUrl, photo_ref: row?.photo_ref }),
    blurb: row?.editorial || null,
  };
}

export const readCompleteStayPool = async (origin, options = {}) => {
  const { fetchOwnedPool, OWNED_POOL_FIELDS } = await import("./ownedPool.js");
  const result = await fetchOwnedPool(origin.lat, origin.lng, {
    radiusMi: EVENT_STAYS_RADIUS_MI,
    categories: ["hotels"],
    primaryOnly: true,
    identity: isTrueLodging,
    toPlace: completePoolPlace,
    deadlineMs: 2500,
    deadlineAt: Date.now() + 6500,
    photoDeadlineMs: 2500,
    ...options,
    // This exhaustive hotel reader alone needs the stored market to create an
    // honest booking search when the inventory row has no street address.
    fields: `${OWNED_POOL_FIELDS},metro`,
  });
  if (result.stats?.degraded) throw new Error("Hotel inventory is incomplete");
  return result.places;
};

// The poster claims a complete scored order. Unlike the event-page helper,
// this reads every owned hotel in the exact box and fails the whole answer if
// either source is unavailable or the exhaustive reader hits its loud cap.
export async function completeEventStays(origin, { readOwned = readAllOwnedHotels, readInventory = readCompleteStayPool } = {}) {
  if (!validStayOrigin(origin?.lat, origin?.lng)) return { places: [], unavailable: false };
  const [owned, inventory] = await Promise.allSettled([readOwned(origin), readInventory(origin)]);
  if (owned.status === "rejected" || inventory.status === "rejected") return { places: [], unavailable: true };
  return { places: selectEventStays([...(owned.value || []), ...(inventory.value || [])], origin), unavailable: false };
}
