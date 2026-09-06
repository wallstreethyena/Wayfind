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
  toDateNightPlace,
} from "../../../lib/dateNightIntent.js";
import { fastCachedRail, geoCell } from "../../../lib/railFastCache.js";
import { windowRailAnswer } from "../../../lib/railResponse.js";
import { pageOneRail } from "../../../lib/railPage.js";

const WX_URL =
  "https://api.open-meteo.com/v1/forecast?current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,dew_point_2m" +
  "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunset,sunrise,uv_index_max" +
  "&hourly=temperature_2m,apparent_temperature,weather_code,is_day" +
  "&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=2";

// v8.93.2 — PUBLIC, because nothing in this response is private and the
// `private` keyword was costing every reader a full origin round trip.
//
// MEASURED on production 2026-08-30: `x-vercel-cache: MISS` on every request,
// 1.6-2.2s TTFB for 268KB brotli, twice in a row for the identical URL. That
// is not a slow route — it is a route the shared cache was FORBIDDEN to hold.
// `private` means "one browser may store this, no proxy may", and it is for
// responses shaped by who is asking: a signed-in cart, a personal feed. This
// payload is shaped by lat, lng, city and hour and by nothing else — two
// readers standing together get byte-identical answers — so it is exactly the
// class /api/rails already serves as public.
//
// The numbers match that route on purpose: an hour of shared cache, a day of
// stale-while-revalidate so the first reader after expiry is served instantly
// while the rebuild happens behind them. The intent rails change when the
// INVENTORY changes, which is a cron, not a request.
//
// The 400 path keeps no-store, and a degraded answer must still never be
// cached as the truth — the v8.74 rule this file inherits.
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
   * v8.98 — THE DINNER RAIL ASKS BEFORE THE COST BOUND.
   *
   * Eight of these nine reads carry a chip contract, and serveFromInventory has
   * applied those BEFORE its top-N cut since v8.49 — dessert, speakeasy, music,
   * clubs, spa, tours, museums, beaches are already identity-first and are left
   * exactly as they are. The NINTH was the bare `food` read, and the `dinner`
   * rail is what eats from it: isDateDinner requires a real date-dinner signal
   * (price level 2+, a room word in the name, or an occasion primary type) and,
   * by this file's own measurement, 68% of food rows are price-blind and room
   * words are rare. So a narrow predicate competed against all 2,417 food rows
   * in the 27-mile box for 400 slots and lost — "identity ∩ anchor top-N is thin
   * BY CONSTRUCTION" (lib/browseInventory.js), for the seventh time.
   *
   * isDateDinner itself is handed to the reader, so this route still holds one
   * opinion about what a date dinner is, and the read is deterministic
   * (order=place_id.asc) and exhaustive instead of an arbitrary unordered
   * thousand. Radius, shape, ranking and the other eight reads are unchanged.
   */
  const dinnerPool = fetchOwnedPool(lat, lng, {
    categories: ["food"],
    radiusMi: DATE_NIGHT_WIDEN_MI,
    deadlineMs: NET_DEADLINE_MS,
    toPlace: (row, o) => toDateNightPlace(invRowToPlace(row), o),
    identity: isDateDinner,
  }).then((pool) => pool.places).catch((error) => {
    // The other eight reads already degrade to [] on a database problem, so this
    // one does too rather than 503-ing a surface that can still answer. It says
    // so out loud: a silent [] here and a genuinely empty town look identical.
    console.error("[api/date-night] dinner pool unavailable", { message: String(error?.message || error) });
    return [];
  });

  const pools = await Promise.all([
    dinnerPool,
    serveFromInventory("food", lat, lng, radiusM, n, "dessert"),
    serveFromInventory("nightlife", lat, lng, radiusM, n, "speakeasy"),
    serveFromInventory("nightlife", lat, lng, radiusM, n, "music"),
    serveFromInventory("nightlife", lat, lng, radiusM, n, "clubs"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "spa"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "tours"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "museums"),
    serveFromInventory("attractions", lat, lng, radiusM, n, "beaches"),
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
  return {
    rails: composed.rails,
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
  // WO11 paging contract — see app/api/night-out/route.js for the full
  // rationale (same "rank once, page many" shape, same fast-cache reuse).
  const railId = searchParams.get("rail") || "";
  const page = searchParams.get("page");
  const size = searchParams.get("size");
  const hourBucket = Number.isFinite(hour) ? Math.floor(hour / 3) : "auto";
  const key = `date-night:${geoCell(lat)}:${geoCell(lng)}:${hourBucket}`;
  const cached = await fastCachedRail(key, () => buildDateNightAnswer({ lat, lng, city, hour }), {
    name: "date-night-rails",
    usable: (value) => !!(value && Array.isArray(value.rails) && value.rails.length),
  });
  const answer = cached.value;

  // …AND A DEGRADED ANSWER IS STILL NOT CACHED AS THE TRUTH (the v8.74 rule
  // /api/rails carries, which arrives here the moment this route becomes
  // publicly cacheable). Composing zero rails is not a fact about the reader's
  // town — it is what a stalled inventory read, a cold pool or a bad radius
  // also looks like. An hour of shared cache on that would pin "nothing near
  // you clears the bar for a date-night journey" on every reader in the cell,
  // off one transient miss, which is exactly the "sometimes it shows up,
  // sometimes it doesn't" report that rule was written for. no-store means the
  // very next request rebuilds and the cell self-heals; a real answer keeps
  // the hour it earned.
  const empty = !answer.rails || answer.rails.length === 0;
  const headers = {
    "cache-control": empty ? "no-store" : "public, s-maxage=3600, stale-while-revalidate=86400",
    "x-wayfind-fast-cache": cached.state,
  };
  if (railId) {
    const paged = pageOneRail(answer.rails, railId, { page, size });
    if (!paged) return Response.json({ error: "unknown rail" }, { status: 404, headers: { "cache-control": "no-store" } });
    return Response.json({ rail: railId, ...paged }, { status: 200, headers });
  }
  return Response.json(windowRailAnswer(answer, full), { status: 200, headers });
}
