export const runtime = "nodejs";

// /api/date-night — owned-inventory journey for the Date Night qualified intent.
//
// NO Google Places, Place Details, or photo APIs. Inventory is wf_inventory.
// Weather is the existing keyless Open-Meteo fetch (same shape as /api/weather).
// Beach conditions are getBeachConditions (already fail-closed). Ranking is
// never for sale.
//
// WEATHER (founder lock, 2026-08-29): Beach only when we KNOW the evening is
// good. nowContext.outdoorOK fails OPEN on unknown weather — that is correct
// for the rest of the app and WRONG here. dateNightBeachOk requires
// weather.known AND outdoorOK AND beach.show. Any unknown → Museums, hide Beach.

import { invRowToPlace, serveFromInventory } from "../../../lib/inventoryServe.js";
import { fetchOwnedPool } from "../../../lib/ownedPool.js";
import { NET_DEADLINE_MS } from "../../../lib/fetchDeadline.js";
import { getBeachConditions } from "../../../lib/marine.js";
import { nowContext } from "../../../lib/nowContext.js";
import { BROWSE_INVENTORY_N } from "../../../lib/browseInventory.js";
import {
  DATE_NIGHT_WIDEN_MI,
  composeDateNightRails,
  isDateDinner,
  isDateShopping,
  toDateNightPlace,
} from "../../../lib/dateNightIntent.js";
import { completeAnswersOnly, fastCachedRail, geoCell } from "../../../lib/railFastCache.js";
import { windowRailAnswer } from "../../../lib/railResponse.js";
import { pageOneRail } from "../../../lib/railPage.js";

const WX_URL =
  "https://api.open-meteo.com/v1/forecast?current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,dew_point_2m" +
  "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset,sunrise,uv_index_max" +
  "&hourly=temperature_2m,apparent_temperature,weather_code,is_day" +
  "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=2";

function json(obj, status = 200, cache = "public, s-maxage=3600, stale-while-revalidate=86400") {
  return Response.json(obj, {
    status,
    headers: { "cache-control": cache },
  });
}

async function fetchWeather(lat, lng) {
  try {
    const url = WX_URL + "&latitude=" + encodeURIComponent(lat) + "&longitude=" + encodeURIComponent(lng);
    const r = await fetch(url, { next: { revalidate: 600 } });
    if (!r.ok) return null;
    const j = await r.json();
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

async function buildDateNightAnswer({ lat, lng, city, hour }) {
  const radiusM = DATE_NIGHT_WIDEN_MI * 1609.34;
  const n = BROWSE_INVENTORY_N;
  const origin = { lat, lng };

  let wxSignals = { weatherKnown: false, outdoorOK: false, beachShow: false, gateWhy: null };
  const wxReady = Promise.all([
    fetchWeather(lat, lng),
    getBeachConditions(lat, lng).catch(() => ({ show: false })),
  ]).then(([weather, beachCond]) => {
    const ctx = nowContext({ lat, lng, city, weather, hour });
    wxSignals = {
      weatherKnown: !!(ctx.weather && ctx.weather.known),
      outdoorOK: ctx.outdoorOK === true,
      beachShow: !!(beachCond && beachCond.show === true),
      gateWhy: ctx.gateWhy || null,
    };
  }).catch(() => {});

  /**
   * CANDIDATE INTEGRITY — IDENTITY BEFORE RANKING, RANKING BEFORE OUTPUT CAP.
   *
   * Dinner and Shopping are narrow questions over broad owned categories, so
   * they both use fetchOwnedPool with the REAL predicate from dateNightIntent.
   * That reader pages the owned box deterministically to exhaustion, applies
   * serviceability + exact radius + identity, and only then lets the composer
   * rank/output the survivors. The other reads below already carry chip
   * identities into serveFromInventory, which applies those before its top-N.
   *
   * Shopping used to be worse than starved: the composer declared the rail but
   * this route never read shopping inventory at all, making it permanently
   * empty. Feeding its exact identity here closes that gap without widening the
   * predicate or changing the score.
   */
  const toIntentPlace = (row, o) => toDateNightPlace(invRowToPlace(row), o);
  const ownedPools = Promise.all([
    fetchOwnedPool(lat, lng, {
      categories: ["food"],
      radiusMi: DATE_NIGHT_WIDEN_MI,
      deadlineMs: NET_DEADLINE_MS,
      toPlace: toIntentPlace,
      identity: isDateDinner,
    }),
    fetchOwnedPool(lat, lng, {
      categories: ["shopping"],
      radiusMi: DATE_NIGHT_WIDEN_MI,
      deadlineMs: NET_DEADLINE_MS,
      toPlace: toIntentPlace,
      identity: isDateShopping,
    }),
  ]);

  const pools = await Promise.all([
    ownedPools.then(([dinner]) => dinner.places),
    serveFromInventory("food", lat, lng, radiusM, n, "dessert"),
    serveFromInventory("nightlife", lat, lng, radiusM, n, "speakeasy"),
    serveFromInventory("nightlife", lat, lng, radiusM, n, "music"),
    serveFromInventory("nightlife", lat, lng, radiusM, n, "clubs"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "spa"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "tours"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "museums"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "beaches"),
    ownedPools.then(([, shopping]) => shopping.places),
  ]);

  // Weather is optional enrichment. Unknown conditions deliberately fail
  // closed to Museums and must never hold the place answer hostage.
  await Promise.race([wxReady, Promise.resolve()]);
  const seen = new Set();
  const places = [];
  for (const raw of pools.flat()) {
    const row = toDateNightPlace(raw, origin);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    places.push(row);
  }
  const composed = composeDateNightRails(places, {
    weatherKnown: wxSignals.weatherKnown,
    outdoorOK: wxSignals.outdoorOK,
    beachShow: wxSignals.beachShow,
  });
  const [dinnerPool, shoppingPool] = await ownedPools;
  const degraded = !!dinnerPool.stats.degraded || !!shoppingPool.stats.degraded;
  return {
    rails: composed.rails,
    degraded,
    sourceStats: {
      dinner: dinnerPool.stats,
      shopping: shoppingPool.stats,
    },
    beachOk: composed.beachOk,
    hidden: composed.hidden,
    weather: {
      known: wxSignals.weatherKnown,
      outdoorOK: wxSignals.outdoorOK,
      beachShow: wxSignals.beachShow,
      gateWhy: wxSignals.gateWhy,
    },
  };
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const lat = parseFloat(searchParams.get("lat"));
  const lng = parseFloat(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return json({ error: "lat and lng are required" }, 400, "no-store");
  }
  const hourRaw = parseFloat(searchParams.get("hour"));
  const hour = Number.isFinite(hourRaw) ? hourRaw : undefined;
  const city = String(searchParams.get("city") || "").slice(0, 40) || null;
  const full = searchParams.get("full") === "1";
  const railId = searchParams.get("rail") || "";
  const page = searchParams.get("page");
  const size = searchParams.get("size");
  const hourBucket = Number.isFinite(hour) ? Math.floor(hour / 3) : "auto";
  const key = `date-night:${geoCell(lat)}:${geoCell(lng)}:${hourBucket}`;
  let cached;
  try {
    cached = await fastCachedRail(key, () => buildDateNightAnswer({ lat, lng, city, hour }), {
      name: "date-night-rails",
      usable: completeAnswersOnly((value) => Array.isArray(value.rails) && value.rails.length),
    });
  } catch (error) {
    console.error("[api/date-night] inventory unavailable", { message: String(error?.message || error) });
    return json({ error: "Date Night inventory is temporarily unavailable" }, 503, "no-store");
  }
  const answer = cached.value;
  const incomplete = !answer.rails || answer.rails.length === 0 || answer.degraded === true;
  const headers = {
    "cache-control": incomplete ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400",
    "x-wayfind-fast-cache": cached.state,
  };
  if (railId) {
    const paged = pageOneRail(answer.rails, railId, { page, size });
    if (!paged) return Response.json({ error: "unknown rail" }, { status: 404, headers: { "cache-control": "no-store" } });
    return Response.json({ rail: railId, ...paged }, { status: 200, headers });
  }
  return Response.json(windowRailAnswer(answer, full), { status: 200, headers });
}