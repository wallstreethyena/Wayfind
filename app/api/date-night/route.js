export const runtime = "nodejs";

// /api/date-night — owned-inventory journey for the Date Night qualified intent.
//
// NO Google Places, Place Details, or photo APIs. Inventory is wf_inventory
// via serveFromInventory. Weather is the existing keyless Open-Meteo fetch
// (same shape as /api/weather). Beach conditions are getBeachConditions
// (already fail-closed). Ranking is never for sale.
//
// WEATHER (founder lock, 2026-08-29): Beach only when we KNOW the evening is
// good. nowContext.outdoorOK fails OPEN on unknown weather — that is correct
// for the rest of the app and WRONG here. dateNightBeachOk requires
// weather.known AND outdoorOK AND beach.show. Any unknown → Museums, hide Beach.

import { serveFromInventory } from "../../../../lib/inventoryServe.js";
import { getBeachConditions } from "../../../../lib/marine.js";
import { nowContext } from "../../../../lib/nowContext.js";
import { BROWSE_INVENTORY_N } from "../../../../lib/browseInventory.js";
import {
  DATE_NIGHT_WIDEN_MI,
  composeDateNightRails,
  toDateNightPlace,
} from "../../../../lib/dateNightIntent.js";

const WX_URL =
  "https://api.open-meteo.com/v1/forecast?current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,dew_point_2m" +
  "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset,sunrise,uv_index_max" +
  "&hourly=temperature_2m,apparent_temperature,weather_code,is_day" +
  "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=2";

function json(obj, status = 200, cache = "private, max-age=60") {
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
  const radiusM = DATE_NIGHT_WIDEN_MI * 1609.34;
  const n = BROWSE_INVENTORY_N;
  const origin = { lat, lng };

  // Weather must NEVER block Dinner. Kick it off, then compose with whatever
  // has arrived by the time inventory returns. If weather is still in flight,
  // fail closed to Museums (dateNightBeachOk). No new vendor, no guess.
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

  const [food, dessert, speakeasy, music, clubs, spa, tours, museums, beaches] = await Promise.all([
    serveFromInventory("food", lat, lng, radiusM, n),
    serveFromInventory("food", lat, lng, radiusM, n, "dessert"),
    serveFromInventory("nightlife", lat, lng, radiusM, n, "speakeasy"),
    serveFromInventory("nightlife", lat, lng, radiusM, n, "music"),
    serveFromInventory("nightlife", lat, lng, radiusM, n, "clubs"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "spa"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "tours"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "museums"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "beaches"),
  ]);

  await Promise.race([wxReady, Promise.resolve()]);

  const seen = new Set();
  const places = [];
  for (const raw of [...food, ...dessert, ...speakeasy, ...music, ...clubs, ...spa, ...tours, ...museums, ...beaches]) {
    const row = toDateNightPlace(raw, origin);
    if (!row || seen.has(row.id)) continue;
    seen.add(row.id);
    places.push(row);
  }

  const signals = {
    weatherKnown: wxSignals.weatherKnown,
    outdoorOK: wxSignals.outdoorOK,
    beachShow: wxSignals.beachShow,
  };
  const composed = composeDateNightRails(places, signals);

  return json({
    rails: composed.rails,
    beachOk: composed.beachOk,
    hidden: composed.hidden,
    weather: {
      known: wxSignals.weatherKnown,
      outdoorOK: wxSignals.outdoorOK,
      beachShow: wxSignals.beachShow,
      gateWhy: wxSignals.gateWhy,
    },
  });
}
