// lib/travelEstimate.js — the travel time line between two itinerary stops.
// CLIENT SAFE, PURE. Owner rule (2026-11-27): transit times come from a real
// routing source or a CLEARLY LABELED estimate, never made up. This is the
// labeled estimate: straight-line miles from the two stops' stored
// coordinates, a road factor, and a conservative city speed. Every label it
// returns says "est." and the UI pairs it with a real Apple Maps directions
// link for that leg, which is the routing source of truth.

const R_MI = 3958.8;
const ROAD_FACTOR = 1.35; // roads are longer than a straight line

export function milesBetween(a, b) {
  const la1 = Number(a && a.lat), lo1 = Number(a && a.lng), la2 = Number(b && b.lat), lo2 = Number(b && b.lng);
  if (![la1, lo1, la2, lo2].every(Number.isFinite)) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(la2 - la1), dLng = toRad(lo2 - lo1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * { mode, minutes, miles, label } or null when either stop has no coordinates.
 * Walk under about half a mile (3 mph); otherwise drive at 22 mph in town,
 * 38 mph for longer legs, plus 5 minutes to park. Rounded up to 5 minutes.
 */
export function travelEstimate(a, b) {
  const straight = milesBetween(a, b);
  if (straight == null) return null;
  const miles = straight * ROAD_FACTOR;
  const roundUp5 = (m) => Math.max(5, Math.ceil(m / 5) * 5);
  if (miles <= 0.6) {
    const minutes = roundUp5((miles / 3) * 60);
    return { mode: "walk", minutes, miles: Number(miles.toFixed(1)), label: `About ${minutes} min walk (est.)` };
  }
  const mph = miles <= 12 ? 22 : 38;
  const minutes = roundUp5((miles / mph) * 60 + 5);
  const time = minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? " " + (minutes % 60) + " min" : ""}` : `${minutes} min`;
  return { mode: "drive", minutes, miles: Number(miles.toFixed(1)), label: `About ${time} drive, ${miles.toFixed(1)} mi (est.)` };
}

/** Apple Maps directions for one leg: the real route, opened on the visitor's device. */
export function legDirectionsUrl(a, b) {
  const ok = (p) => p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng));
  if (!ok(a) || !ok(b)) return null;
  const mode = travelEstimate(a, b)?.mode === "walk" ? "w" : "d";
  return `https://maps.apple.com/?saddr=${Number(a.lat).toFixed(5)},${Number(a.lng).toFixed(5)}&daddr=${Number(b.lat).toFixed(5)},${Number(b.lng).toFixed(5)}&dirflg=${mode}`;
}
