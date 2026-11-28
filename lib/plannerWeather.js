// lib/plannerWeather.js — today's real forecast steers the planner (owner,
// 2026-11-27: "a differentiated experience" from Google and Yelp, so a plan
// for a rainy or very hot day leans indoors on its own).
//
// HONEST BY CONSTRUCTION
//   - Numbers come only from Open-Meteo's forecast for the city's own
//     coordinates (free, no key, same source lib/guideNow.js already uses).
//   - A day with no forecast (too far ahead, network down) changes nothing and
//     says nothing. The planner never guesses the weather.
//   - The note names the forecast number it acted on, so the visitor can see
//     why the plan leans indoors and judge for themselves.
import { fetchDeadline, NET_DEADLINE_MS } from "./fetchDeadline.js";

export const RAIN_LEAN_PCT = 50;   // daily max chance of rain at or above this leans the plan indoors
export const HEAT_LEAN_F = 95;     // daily max feels like temperature at or above this leans indoors
const FORECAST_DAYS = 7;

/** The Open-Meteo URL for one city. PURE. Null when the coordinates are unusable. */
export function forecastUrl(dest) {
  if (!dest || dest.lat == null || dest.lng == null || dest.lat === "" || dest.lng === "") return null;
  const lat = Number(dest.lat), lng = Number(dest.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return "https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(4) + "&longitude=" + lng.toFixed(4) +
    "&daily=precipitation_probability_max,apparent_temperature_max&temperature_unit=fahrenheit" +
    "&timezone=America%2FNew_York&forecast_days=" + FORECAST_DAYS;
}

/** Open-Meteo daily JSON to { "YYYY-MM-DD": { rainPct, feelsHighF } }. PURE. Drops anything malformed. */
export function dailyByDate(json) {
  const d = json && json.daily;
  const out = {};
  if (!d || !Array.isArray(d.time)) return out;
  d.time.forEach((date, i) => {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    const rain = Array.isArray(d.precipitation_probability_max) ? d.precipitation_probability_max[i] : null;
    const feels = Array.isArray(d.apparent_temperature_max) ? d.apparent_temperature_max[i] : null;
    out[date] = {
      rainPct: Number.isFinite(rain) && rain >= 0 && rain <= 100 ? Math.round(rain) : null,
      feelsHighF: Number.isFinite(feels) && feels > -60 && feels < 140 ? Math.round(feels) : null,
    };
  });
  return out;
}

/**
 * Should the plan for these dates lean indoors? PURE. Returns null when no
 * date in the plan has a forecast, or { lean: "rain"|"heat"|null, date,
 * rainPct, feelsHighF } for the plan's wettest (then hottest) day.
 */
export function weatherLean(byDate, dates) {
  const days = (Array.isArray(dates) ? dates : []).map((dt) => ({ date: dt, ...(byDate && byDate[dt]) })).filter((x) => x.rainPct != null || x.feelsHighF != null);
  if (!days.length) return null;
  const wettest = [...days].sort((a, b) => (b.rainPct ?? -1) - (a.rainPct ?? -1))[0];
  if (wettest.rainPct != null && wettest.rainPct >= RAIN_LEAN_PCT) return { lean: "rain", date: wettest.date, rainPct: wettest.rainPct, feelsHighF: wettest.feelsHighF };
  const hottest = [...days].sort((a, b) => (b.feelsHighF ?? -999) - (a.feelsHighF ?? -999))[0];
  if (hottest.feelsHighF != null && hottest.feelsHighF >= HEAT_LEAN_F) return { lean: "heat", date: hottest.date, rainPct: hottest.rainPct, feelsHighF: hottest.feelsHighF };
  return { lean: null, date: wettest.date, rainPct: wettest.rainPct, feelsHighF: wettest.feelsHighF };
}

function dayWord(date, todayYmd) {
  if (date === todayYmd) return "today";
  const d = new Date(date + "T12:00:00Z");
  const t = new Date(todayYmd + "T12:00:00Z");
  if (Math.round((d - t) / 86400000) === 1) return "tomorrow";
  return "on " + d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

/** One plain sentence for the visitor, or null when the plan was not changed. PURE. No dashes. */
export function weatherNote(w, cityName, todayYmd) {
  if (!w || !w.lean) return null;
  const city = String(cityName || "").trim() || "the area";
  const when = dayWord(w.date, todayYmd);
  if (w.lean === "rain") return `Rain is likely in ${city} ${when} (${w.rainPct}% chance), so this plan leans indoors.`;
  return `It should feel like ${w.feelsHighF}°F in ${city} ${when}, so this plan leans indoors and shaded.`;
}

/** Fetch the forecast for one city. Resolves the by-date map, or {} on any failure. Never throws. */
export async function fetchForecast(dest, fetchImpl = fetchDeadline) {
  const url = forecastUrl(dest);
  if (!url) return {};
  if (process.env.NEXT_PHASE === "phase-production-build") return {};
  try {
    const r = await fetchImpl(url, { next: { revalidate: 1800 } }, NET_DEADLINE_MS);
    if (!r || !r.ok) return {};
    return dailyByDate(await r.json());
  } catch {
    return {};
  }
}

/**
 * Add "indoors" to the planner's interests when the forecast says so. PURE.
 * Returns the same parsed object when nothing changes.
 */
export function leanParsed(parsed, w) {
  if (!parsed || !w || !w.lean) return parsed;
  const prefs = parsed.preferences || {};
  const interests = [...new Set([...(prefs.interests || []), "indoors"])];
  return { ...parsed, preferences: { ...prefs, interests } };
}

// ── right now (owner 2026-11-28: "make sure the AI knows the weather") ──────
// The current conditions for one point, from the same free Open-Meteo source.
// Unknown stays unknown: no reading means the AI says nothing about weather.

const WMO_WORDS = [
  [[0], "clear"], [[1], "mostly clear"], [[2], "partly cloudy"], [[3], "overcast"], [[45, 48], "foggy"],
  [[51, 53, 55, 56, 57], "drizzly"], [[61, 63, 65, 66, 67, 80, 81, 82], "rainy"], [[71, 73, 75, 77, 85, 86], "snowy"], [[95, 96, 99], "stormy"],
];

/** The Open-Meteo URL for current conditions at a point. PURE. Null when unusable. */
export function currentWeatherUrl(point) {
  if (!point || point.lat == null || point.lng == null) return null;
  const lat = Number(point.lat), lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return "https://api.open-meteo.com/v1/forecast?latitude=" + lat.toFixed(3) + "&longitude=" + lng.toFixed(3) +
    "&current=temperature_2m,precipitation,weather_code&daily=precipitation_probability_max&temperature_unit=fahrenheit&timezone=America%2FNew_York&forecast_days=1";
}

/** Open-Meteo JSON to { tempF, words, wet, rainPct } or null. PURE. */
export function parseCurrentWeather(json) {
  const c = json && json.current;
  if (!c) return null;
  const tempF = Number.isFinite(c.temperature_2m) ? Math.round(c.temperature_2m) : null;
  const code = Number.isFinite(c.weather_code) ? c.weather_code : null;
  const entry = code == null ? null : WMO_WORDS.find(([codes]) => codes.includes(code));
  const words = entry ? entry[1] : null;
  const rainArr = json.daily && Array.isArray(json.daily.precipitation_probability_max) ? json.daily.precipitation_probability_max : [];
  const rainPct = Number.isFinite(rainArr[0]) && rainArr[0] >= 0 && rainArr[0] <= 100 ? Math.round(rainArr[0]) : null;
  const wet = (Number.isFinite(c.precipitation) && c.precipitation > 0.1) || words === "rainy" || words === "stormy" || words === "drizzly";
  if (tempF == null && !words) return null;
  return { tempF, words, wet: Boolean(wet), rainPct };
}

/** Fetch current conditions. Resolves the parsed reading or null. Never throws. */
export async function fetchCurrentWeather(point, fetchImpl = fetchDeadline) {
  const url = currentWeatherUrl(point);
  if (!url || process.env.NEXT_PHASE === "phase-production-build") return null;
  try {
    const r = await fetchImpl(url, { next: { revalidate: 600 } }, NET_DEADLINE_MS);
    if (!r || !r.ok) return null;
    return parseCurrentWeather(await r.json());
  } catch {
    return null;
  }
}
