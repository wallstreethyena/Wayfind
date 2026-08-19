// lib/waterStations.js — resolve beach water quality by GEOGRAPHY, not id.
//
// v8.19 (owner, fifth report: "I think I have asked over 5 times now for the
// water quality … I need the water quality to be accurate"). The data was
// there the whole time — wf_beach_water carries fresh FL Healthy Beaches
// samples — but it keys ~32 exact place_ids while one physical beach exists
// under MANY Google place_ids (four "Coquina Beach" rows near Bradenton
// alone). Every id-exact join showed water on the one sampled id and nothing
// on its twins, which read as "no water quality" on most beach cards.
//
// The cure: wf_beach_water_geo (view: samples + station coordinates via
// wf_inventory). A beach card resolves the NEAREST sampled station within
// NEAR_STATION_MI. A DOH station speaks for its stretch of sand — 1.5 miles
// is within one named beach's span and far short of the next town's beach,
// so this never borrows a neighbor's reading. Exact-id rows win when
// present; nothing is ever invented (no station in range → no chip).
export const NEAR_STATION_MI = 1.5;

const R = 3958.8;
export function stationDistMi(aLat, aLng, bLat, bLng) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Nearest sampled station to (lat,lng) within maxMi, or null.
 * @param {Array<{beach_place_id:string,result:string,advisory:boolean,sampled_at:string,lat:number,lng:number}>} stations
 */
export function nearestWater(stations, lat, lng, maxMi = NEAR_STATION_MI) {
  if (!Array.isArray(stations) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  let best = null, bestMi = Infinity;
  for (const s of stations) {
    if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const d = stationDistMi(lat, lng, s.lat, s.lng);
    if (d <= maxMi && d < bestMi) { bestMi = d; best = s; }
  }
  return best ? { result: best.result, advisory: best.advisory, sampled_at: best.sampled_at, _stationMi: Math.round(bestMi * 10) / 10 } : null;
}

/**
 * Water rows for a set of beach rows: exact place_id match first, nearest
 * station fallback second. Returns { [placeId]: waterRow }.
 * @param {Array<{id:string,lat?:number,lng?:number}>} beachRows
 * @param {Array} stations  rows from wf_beach_water_geo
 */
export function waterForBeaches(beachRows, stations) {
  const byId = new Map();
  for (const s of Array.isArray(stations) ? stations : []) {
    if (s && s.beach_place_id && !byId.has(s.beach_place_id)) byId.set(s.beach_place_id, s);
  }
  const out = {};
  for (const p of Array.isArray(beachRows) ? beachRows : []) {
    if (!p || !p.id) continue;
    const exact = byId.get(p.id);
    if (exact) { out[p.id] = { result: exact.result, advisory: exact.advisory, sampled_at: exact.sampled_at }; continue; }
    const near = nearestWater(stations, Number(p.lat), Number(p.lng));
    if (near) out[p.id] = near;
  }
  return out;
}

/** Short sample-date suffix for the chip: "Aug 12" (site-local enough — DOH
 *  dates are date-only strings; no clock math, no TZ trap). */
export function sampledShort(sampled_at) {
  const m = String(sampled_at || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return MON[Number(m[2]) - 1] + " " + Number(m[3]);
}
