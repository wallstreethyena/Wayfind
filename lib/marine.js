// lib/marine.js — Beach Intelligence data layer.
//
// Real, keyless sources only (matches the app's server-proxy + fail-soft pattern):
//   • Open-Meteo Marine API      → water temperature + wave height/period   (keyless)
//   • Open-Meteo Forecast API    → UV index, air temp, precip prob, sunset  (keyless; same
//                                   provider app/api/weather already uses)
//   • NWS active alerts (api.weather.gov/alerts/active?point=) → rip-current / beach-hazard /
//                                   storm SAFETY GATE  (keyless; UA header required)
//   • NOAA CO-OPS Tides & Currents → today's high/low tide times            (keyless)
//
// Server-only: this file is imported by app/api/beach/conditions. No key material anywhere.
// Every source fails soft — one source down degrades gracefully, never throws to the caller.

const UA = "wayfind/1.0 (+https://gowayfind.com)";
const c2f = (c) => (c == null ? null : Math.round((c * 9) / 5 + 32));
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// ── configurable thresholds (vision: "configurable values") ──────────────────
export const BEACH_DEFAULTS = {
  maxDistanceMi: 25,     // only surface beach intel within this radius
  minAirF: 72,           // below this it's not a beach day
  maxAirF: 104,          // above this = heat risk
  minWaterF: 68,         // colder than this and nobody's swimming
  maxUv: 10,             // 11+ = extreme, warn
  maxPrecipProbPct: 30,  // higher = likely washout
};

// NWS alert events that make the water unsafe → block the "great beach day" hero.
const UNSAFE_ALERT = /rip current|high surf|beach hazard|coastal flood|tropical|hurricane|tsunami|storm|tornado|thunderstorm warning/i;

async function getJSON(url, { revalidate = 900 } = {}) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, next: { revalidate } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

// ── 1) marine: water temp + waves ────────────────────────────────────────────
export async function fetchMarine(lat, lng) {
  try {
    const u = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}` +
      `&current=wave_height,wave_period,sea_surface_temperature&daily=wave_height_max` +
      `&timezone=auto&length_unit=imperial&forecast_days=1`;
    const j = await getJSON(u);
    const cur = j.current || {};
    return {
      waterTempF: c2f(cur.sea_surface_temperature),
      waveHeightFt: round1(cur.wave_height),
      wavePeriodS: round1(cur.wave_period),
      waveHeightMaxFt: round1((j.daily?.wave_height_max || [])[0]),
    };
  } catch { return {}; }
}

// ── 2) weather: UV, air temp, precip, sunset (Open-Meteo, same as app) ───────
export async function fetchBeachWeather(lat, lng) {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      `&daily=uv_index_max,sunset,precipitation_probability_max,temperature_2m_max` +
      `&timezone=auto&forecast_days=1&temperature_unit=fahrenheit`;
    const d = (await getJSON(u, { revalidate: 600 })).daily || {};
    return {
      airTempMaxF: (d.temperature_2m_max || [])[0] ?? null,
      uvIndexMax: (d.uv_index_max || [])[0] ?? null,
      precipProbMaxPct: (d.precipitation_probability_max || [])[0] ?? null,
      sunset: (d.sunset || [])[0] ?? null,
    };
  } catch { return {}; }
}

// ── 3) NWS active alerts: the SAFETY GATE ────────────────────────────────────
export async function fetchBeachAlerts(lat, lng) {
  try {
    const j = await getJSON(`https://api.weather.gov/alerts/active?point=${lat},${lng}`, { revalidate: 600 });
    const alerts = (j.features || []).map((f) => f.properties || {}).map((p) => ({
      event: p.event, severity: p.severity, headline: p.headline,
      until: p.ends || p.expires || null, unsafe: UNSAFE_ALERT.test(p.event || ""),
    }));
    return { alerts, hasUnsafe: alerts.some((a) => a.unsafe) };
  } catch { return { alerts: [], hasUnsafe: false }; }
}

// ── 4) NOAA CO-OPS tides (nearest tide-prediction station) ───────────────────
let _stationCache = null; // { at, stations:[{id,lat,lng}] }
async function tideStations() {
  if (_stationCache && Date.now() - _stationCache.at < 24 * 3600 * 1000) return _stationCache.stations;
  try {
    const j = await getJSON("https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions", { revalidate: 86400 });
    const stations = (j.stations || []).map((s) => ({ id: s.id, lat: s.lat, lng: s.lng }));
    _stationCache = { at: Date.now(), stations };
    return stations;
  } catch { return _stationCache?.stations || []; }
}
function haversineMi(aLat, aLng, bLat, bLng) {
  const R = 3958.8, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function ymd(d = new Date()) { const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`; }
export async function fetchTides(lat, lng) {
  try {
    const st = await tideStations();
    if (!st.length) return { tides: [] };
    let best = null, bestD = Infinity;
    for (const s of st) { const dd = haversineMi(lat, lng, s.lat, s.lng); if (dd < bestD) { bestD = dd; best = s; } }
    if (!best || bestD > 60) return { tides: [] };
    const today = ymd(); const j = await getJSON(
      `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=wayfind` +
      `&begin_date=${today}&end_date=${today}&datum=MLLW&station=${best.id}&time_zone=lst_ldt&units=english&interval=hilo&format=json`,
      { revalidate: 3600 });
    const tides = (j.predictions || []).map((p) => ({ type: p.type === "H" ? "High" : "Low", time: p.t, ft: round1(parseFloat(p.v)) }));
    return { tides, tideStationMi: round1(bestD) };
  } catch { return { tides: [] }; }
}

// ── scorer: turn conditions into a show/hide decision + verdict ───────────────
export function scoreBeachDay(conditions, distanceMi, cfg = {}) {
  const c = { ...BEACH_DEFAULTS, ...cfg };
  const reasons = [];
  if (distanceMi != null && distanceMi > c.maxDistanceMi) return { show: false, status: "too_far", reasons: [`nearest beach is ${round1(distanceMi)}mi away`], conditions };
  if (conditions.hasUnsafe) reasons.push("active water-safety alert");
  if (conditions.airTempMaxF != null && conditions.airTempMaxF < c.minAirF) reasons.push(`only ${conditions.airTempMaxF}°F today`);
  if (conditions.airTempMaxF != null && conditions.airTempMaxF > c.maxAirF) reasons.push(`heat risk (${conditions.airTempMaxF}°F)`);
  if (conditions.waterTempF != null && conditions.waterTempF < c.minWaterF) reasons.push(`water only ${conditions.waterTempF}°F`);
  if (conditions.precipProbMaxPct != null && conditions.precipProbMaxPct > c.maxPrecipProbPct) reasons.push(`${conditions.precipProbMaxPct}% rain chance`);
  const uvWarn = conditions.uvIndexMax != null && conditions.uvIndexMax > c.maxUv;

  // hard gate: unsafe water OR out-of-range temp/rain hides the hero (safety + honesty).
  const blocked = conditions.hasUnsafe ||
    (conditions.airTempMaxF != null && (conditions.airTempMaxF < c.minAirF || conditions.airTempMaxF > c.maxAirF)) ||
    (conditions.precipProbMaxPct != null && conditions.precipProbMaxPct > c.maxPrecipProbPct);
  if (blocked) return { show: false, status: conditions.hasUnsafe ? "unsafe" : "poor", reasons, conditions };
  return { show: true, status: uvWarn ? "great_uv_caution" : "great", reasons: uvWarn ? ["high UV — bring sunscreen"] : [], conditions };
}

// ── one call the API route uses ──────────────────────────────────────────────
export async function getBeachConditions(lat, lng, distanceMi = null, cfg = {}) {
  const [marine, wx, al, td] = await Promise.all([fetchMarine(lat, lng), fetchBeachWeather(lat, lng), fetchBeachAlerts(lat, lng), fetchTides(lat, lng)]);
  const conditions = { ...marine, ...wx, ...al, ...td, distanceMi: round1(distanceMi) };
  return scoreBeachDay(conditions, distanceMi, cfg);
}
