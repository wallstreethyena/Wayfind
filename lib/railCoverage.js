// Pure geography law for /api/rails. A market must be explicitly registered;
// proximity alone never turns an unsupported city into a Wayfind answer.

const R_EARTH_MI = 3958.8;
const rad = (degrees) => (degrees * Math.PI) / 180;

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
