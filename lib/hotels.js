// v6.11 — "Stay Tonight" hotel source = Wayfind's OWNED, lodging-only inventory.
//
// WHY THIS (and why NOT a live API): the old path was a live Google/Foursquare
// search filtered by isTrueLodging — which went EMPTY in thin markets (Parrish:
// "0 / not enough data") AND leaked residential noise (55+ communities, mobile-home
// parks) because isTrueLodging has no rule against them. The intended fix was a live
// hotel API (Travelpayouts/Hotellook), but Travelpayouts RETIRED its affiliate
// hotel-search data API (every engine.hotellook.com endpoint now 404s; the current
// docs list only Flights/tours/eSIM — no Hotels API). So the durable answer is to
// OWN the list: 744 lodging-only properties sourced from FSQ OS (Apache-2.0),
// residential/55+/mobile-home/closed stripped at ingest (lib/ownedHotels.json).
// Ranked by DISTANCE from the user so thin markets borrow the nearest real hotels
// (Parrish -> Ellenton/Bradenton on I-75). Booking is monetized by the app's
// existing Stay22 link path (app/components/BookingCTA.js, Aff.hotelUrl) — no new
// key needed. Live nightly prices can layer on later if a hotel API becomes viable.

import OWNED from "./ownedHotels.json";

// Always "configured" — the owned list is bundled, no external key required.
export function hotelsConfigured() { return Array.isArray(OWNED) && OWNED.length > 0; }

const R = 6371; // km
function haversineKm(la1, lo1, la2, lo2) {
  const p1 = (la1 * Math.PI) / 180, p2 = (la2 * Math.PI) / 180;
  const dp = ((la2 - la1) * Math.PI) / 180, dl = ((lo2 - lo1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Map an owned record -> Wayfind's place shape (what the cards + Stay22 CTA read).
// No rating/price yet (FSQ doesn't carry them) — honest: distance-ranked "easy
// places to land," monetized via the existing Stay22 booking link by name+location.
function toPlace(h, distKm) {
  return {
    id: "wfh-" + (h.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48) + "-" + Math.round(h.lat * 1000),
    name: h.name,
    lat: h.lat, lng: h.lng,
    category: "hotels",
    types: ["lodging", "hotel"],
    source: "owned",
    // Enriched from the Google hotels we already had in wf_inventory (name+geo
    // match). place_id is ToS-legal to persist; the rating rode along with it.
    rating: h.rating != null ? h.rating : null,
    reviews: h.reviews || 0,
    googlePlaceId: h.gpid || null,
    price: null, priceNum: null,
    address: h.address || (h.city ? h.city + ", FL" : null),
    distMi: distKm != null ? Math.round(distKm * 0.621371 * 10) / 10 : null,
    // v6.12: real card photo, built from the Google photo resource name we already
    // stored in wf_inventory (same URL construction as lib/google restToPlace). No
    // new Google SEARCH call — only the browser's <img> fetches the photo. Hotels
    // without a stored ref keep the branded/pin fallback.
    photo: h.photo_ref ? "https://places.googleapis.com/v1/" + h.photo_ref + "/media?maxWidthPx=640&key=" + (process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || "") : null,
    photos: [],
    mapsUrl: "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(h.name),
    // Wayfind-OWNED card content (lib/ownedHotels.json) so the card renders
    // without Google: our Wayfind Score, our category + copy. wfScore drives the
    // "/10" badge; blurb feeds the list/detail copy in place of a generated one.
    wfScore: h.wfScore != null ? h.wfScore : (h.rating != null ? Math.round(h.rating * 2 * 10) / 10 : null),
    stayType: h.stayType || null,
    lane: h.lane || null,
    vibe: h.vibe || null,
    whyGo: h.whyGo || null,
    knownFor: h.knownFor || null,
    bookingMove: h.bookingMove || null,
    insiderMove: h.insiderMove || null,
    blurb: h.whyGo || null,
    owned: true,
  };
}

// PUBLIC — owned hotels nearest to (lat,lng), closest first. Falls back to a city
// text match when coords are absent. Empty only if the bundle is somehow missing.
export async function searchHotels({ lat, lng, city, limit = 20 } = {}) {
  if (!hotelsConfigured()) return [];
  const n = Math.min(Math.max(limit, 1), 50);
  // Coverage guard: the owned list is the manatee-sarasota metro ONLY. Serve it
  // only to users within ~28mi; farther users get [] so the caller falls back to
  // the legacy live search (so Tampa/Orlando never see Sarasota hotels).
  const MAX_KM = 45;
  if (typeof lat === "number" && typeof lng === "number" && isFinite(lat) && isFinite(lng)) {
    // Take a nearby candidate pool by distance, then rank by rating within it so
    // "Stay Tonight" surfaces the best-reviewed hotels you can actually reach
    // tonight (rated first, then the rest by distance). Google-matched hotels
    // carry a rating; unmatched real hotels fall in below, still bookable.
    const near = OWNED
      .map((h) => ({ h, d: haversineKm(lat, lng, h.lat, h.lng) }))
      .filter((x) => x.d <= MAX_KM)
      .sort((a, b) => a.d - b.d);
    if (!near.length) return []; // outside owned coverage -> caller falls back to live search
    const pool = near.slice(0, Math.max(n * 3, 40));
    pool.sort((a, b) => {
      const ra = a.h.rating != null ? a.h.rating : -1, rb = b.h.rating != null ? b.h.rating : -1;
      if (rb !== ra) return rb - ra;
      if ((b.h.reviews || 0) !== (a.h.reviews || 0)) return (b.h.reviews || 0) - (a.h.reviews || 0);
      return a.d - b.d;
    });
    return pool.slice(0, n).map(({ h, d }) => toPlace(h, d));
  }
  if (city) {
    const c = String(city).toLowerCase().trim();
    return OWNED.filter((h) => (h.city || "").toLowerCase() === c).slice(0, n).map((h) => toPlace(h, null));
  }
  return OWNED.slice(0, n).map((h) => toPlace(h, null));
}
