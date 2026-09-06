// Pure geography law for /api/rails. A market must be explicitly registered;
// proximity alone never turns an unsupported city into a Wayfind answer.
//
// COVERAGE_MI lived as a local literal in app/api/rails/route.js until
// 2026-09-06, when app/components/DaypartRail.js ("use client") needed the
// exact same value to resolve a city slug from the reader's exact coordinates
// (see that file's "WHY THE CITY IS RESOLVED HERE" comment). This file has no
// imports and no server-only code, so it is the one place both the server
// route and the client component can share the constant instead of each
// carrying its own copy of "90" that could quietly drift apart.

const R_EARTH_MI = 3958.8;
const rad = (degrees) => (degrees * Math.PI) / 180;

// Past this, the point is not in a market Wayfind has ranked inventory for.
// Same spirit as the beach rule (lib/beaches.js BEACH_NEAR_MI): near means
// near, not "nearest by arithmetic 400 miles away".
export const COVERAGE_MI = 90;

export function railDistanceMi(aLat, aLng, bLat, bLng) {
  const values = [aLat, aLng, bLat, bLng].map(Number);
  if (!values.every(Number.isFinite)) return Infinity;
  const [la1, ln1, la2, ln2] = values;
  const s = Math.sin(rad(la2 - la1) / 2) ** 2
    + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(ln2 - ln1) / 2) ** 2;
  return R_EARTH_MI * 2 * Math.asin(Math.sqrt(s));
}

export function nearestCoveredCity(landingCities, lat, lng, coverageMi = 90) {
  const la = Number(lat), ln = Number(lng), limit = Number(coverageMi);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || !Number.isFinite(limit) || limit < 0) return null;
  if (!landingCities || typeof landingCities !== "object") return null;
  let best = null, bestMi = Infinity;
  for (const [slug, city] of Object.entries(landingCities)) {
    if (!city) continue;
    const miles = railDistanceMi(la, ln, city.lat, city.lng);
    if (miles < bestMi) { bestMi = miles; best = slug; }
  }
  return best && bestMi <= limit ? best : null;
}
