// lib/nearbyHotspots.js — which real places count as a nearby hotspot, and how
// close is "near". Used by app/api/nearby-picks/route.js (server) and
// app/components/NearbyAlerts.js (the in-page nudge distances, on the phone).
//
// OWNER INTENT (Gabe, 2026-11-27): nudge people toward hidden springs and the
// dessert spots everyone talks about when they are close by. Real places only,
// opt-in, location used in the moment and never stored.
//
// SPRINGS ARE A CURATED ALLOWLIST, ON PURPOSE. A name match on "spring" pulls in
// Tarpon Springs Sponge Docks, Spring Hill Pink Dinosaur, Spring Garden Point
// Park and out-of-state parks (all real wf_inventory rows, checked 2026-11-27),
// and no inventory row carries a "springs" tag yet, so the trend matcher's
// springs_swimming concept matches nothing. Every id below is a Florida natural
// spring park checked by name and coordinates against wf_inventory on
// 2026-11-27. Unrated rows stay listed: lib/nearbyPool.shapeNearbyRow drops a
// place with no rating, so they appear on their own once a rating lands.
// Add a spring here only after checking it is a real natural spring.
//
// SWEET SPOTS are dessert venue types, not the "dessert" tag (that tag sits on
// ordinary restaurants that serve a dessert menu). "Popular" is earned with a
// rating and review floor, never asserted: the copy never says "viral".
//
// Locked by scripts/test-nearby-picks.mjs.

export const SPRING_PLACE_IDS = Object.freeze([
  "ChIJyYEUav8P54gRatuv_zQzm20", // Blue Spring State Park
  "ChIJVZxw1tCj6IgRdJVRXYV9PDY", // Boulware Springs Park
  "ChIJq3cIgmL95ogRL_r7fixwFjo", // De León Springs State Park
  "ChIJny8VYW-I7IgRDri7905NC2o", // Edward Ball Wakulla Springs State Park
  "ChIJTTHiI8w_6IgR89hvVjSS-vc", // Ellie Schiller Homosassa Springs Wildlife State Park
  "ChIJyefyOo4f6YgR98DvEw2xLgA", // Fanning Springs State Park
  "ChIJwX3JRSAS54gRfgxrCYZ5T5M", // Gemini Springs Park
  "ChIJT1H5Y6wW54gRGLS0dxT7w8I", // Green Springs Park
  "ChIJAZwIUMpB6IgRjk1R9o3UJRA", // Hunter Springs Park
  "ChIJ2xLazC4t74gRvvWbcPOcRIc", // Ichetucknee Springs State Park
  "ChIJw5hmHut154gRI1LE7BjQiEg", // Kelly Park - Rock Springs
  "ChIJq0CdwjfI7ogR9eChggLnQec", // Lafayette Blue Springs State Park
  "ChIJk7kaZsbSwogRcfaqX6EjQ9A", // Lithia Springs Park
  "ChIJxf1K4M3s7ogRjk1EoWCBhn8", // Madison Blue Spring State Park
  "ChIJEZKHxnA9w4gRhX3ZI3kDY6k", // Manatee Mineral Spring Park
  "ChIJt1H-yNbj6IgR-D0KZqXPJ5Q", // Manatee Springs State Park
  "ChIJNy0abY63k4gR10F9jIXmiW4", // Morrison Springs County Park
  "ChIJzWYezizJ6IgRNnljZCQPeqI", // Poe Springs Park
  "ChIJ1RDv6-Jk6IgRn4hQniPFIz8", // Rainbow Springs State Park Tubing
  "ChIJ3-YSgHtk6IgRGIerf2Vx92I", // Rainbow Springs State Park Visitor Center
  "ChIJd-60Ze7O6IgRq6l4yefHfCE", // Rum Island Springs County Park
  "ChIJbZjmtIJF5ogR7YHsQYeZYg8", // Silver Glen Springs Recreation Area
  "ChIJBVpsJmwt5ogRBsbq-vIlVqw", // Silver Springs State Park
  "ChIJq2_1qUxA6IgRCarDmMlmNgQ", // Three Sisters Springs
  "ChIJezyMhZ7U7ogRA4_EqWvzZxg", // Troy Springs State Park
  "ChIJgX1tnNTywogR2elcoaT8hOE", // Wall Springs Park
  "ChIJPXlTqYFTw4gRveHTZWG55DY", // Warm Mineral Springs Park
  "ChIJz3OOrDIg6IgRMKjzAPsV3NI", // Weeki Wachee Springs State Park
  "ChIJd_yTxUh054gR9cGD0gI_yHw", // Wekiwa Springs State Park
  "ChIJa_tbbseawogRDfszogOLD9o", // Werner-Boyce Salt Springs State Park
  "ChIJKXmFgRvP7ogRB6AS8LJzQiM", // Wes Skiles Peacock Springs State Park
]);

export const SWEET_PRIMARY_TYPES = Object.freeze([
  "dessert_shop", "dessert_restaurant", "ice_cream_shop", "bakery", "chocolate_shop",
  "donut_shop", "candy_store", "pastry_shop", "cake_shop", "confectionery", "frozen_yogurt_shop",
]);

export const SPRING_RADIUS_MI = 60;     // springs are a drive worth making
export const SWEET_RADIUS_MI = 5;       // sweets are a stop on the way
export const SWEET_MIN_RATING = 4.5;
export const SWEET_MIN_REVIEWS = 100;
export const PICKS_PER_KIND = 3;

// The in-page nudge fires only this close, measured on the phone.
export const SPRING_NUDGE_MI = 3;
export const SWEET_NUDGE_MI = 0.4;

// Coordinates are rounded on the phone before they leave it: 2 decimals is
// about 1.1 km, enough to rank places within 5 to 60 miles, too coarse to
// pinpoint a home. The server rounds again and never trusts finer input.
export const COORD_DECIMALS = 2;
export const roundCoord = (v) => Number(Number(v).toFixed(COORD_DECIMALS));

export function validOrigin(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: roundCoord(la), lng: roundCoord(ln) };
}

export function isSpringId(id) {
  return SPRING_PLACE_IDS.includes(id);
}

export function isSweetSpot(row) {
  if (!row) return false;
  const t = String(row.primaryType || row.primary_type || "");
  if (!SWEET_PRIMARY_TYPES.includes(t)) return false;
  return Number(row.rating) >= SWEET_MIN_RATING && Number(row.reviews) >= SWEET_MIN_REVIEWS;
}

/**
 * Pick the cards. `springs` and `sweets` are already-shaped rows (id, name,
 * distMi, governed_score...). Ranked by the lawful score, nearest first on a tie.
 */
export function selectHotspots({ springs = [], sweets = [] } = {}) {
  const byScore = (a, b) => (b.governed_score - a.governed_score) || (a.distMi - b.distMi);
  const pick = (rows, radius, accept) => {
    const seen = new Set();
    return rows
      .filter((r) => r && r.id && !seen.has(r.id) && seen.add(r.id))
      .filter((r) => Number.isFinite(r.distMi) && r.distMi <= radius && Number.isFinite(r.governed_score) && accept(r))
      .sort(byScore)
      .slice(0, PICKS_PER_KIND);
  };
  return {
    springs: pick(springs, SPRING_RADIUS_MI, (r) => isSpringId(r.id)),
    sweets: pick(sweets, SWEET_RADIUS_MI, isSweetSpot),
  };
}

/** Which loaded hotspot (if any) is close enough to nudge. Runs on the phone. */
export function nudgeCandidate(position, picks, measure) {
  if (!position || !picks) return null;
  const within = [];
  for (const r of picks.springs || []) {
    const d = measure(position, r);
    if (Number.isFinite(d) && d <= SPRING_NUDGE_MI) within.push({ place: r, kind: "spring", d });
  }
  for (const r of picks.sweets || []) {
    const d = measure(position, r);
    if (Number.isFinite(d) && d <= SWEET_NUDGE_MI) within.push({ place: r, kind: "sweet", d });
  }
  within.sort((a, b) => a.d - b.d);
  return within[0] || null;
}
