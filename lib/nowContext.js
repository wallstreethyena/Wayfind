// lib/nowContext.js — THE single source of "what time is it, and what does that
// mean for what we should recommend right now".
//
// WHY THIS EXISTS (owner, 2026-07-30, third request):
// Before this module, 38 call sites across 14 files independently called
// `new Date().getHours()` and each invented its own bucketing. They disagreed:
// `home.js:5267` split food at 11/15/21, `Surprise.js` split at 12/17,
// `IntentPageClient` used a 15-hour binary, `home.js:6223` used 11/15/21 again
// with different labels. Same question, ten answers, so every surface could
// legitimately claim to be "time-aware" while showing the user the same list at
// 8am and 8pm. One function answers the question now; everything consumes it.
//
// THREE RULES THIS MODULE IS BUILT ON:
//
//   1. PURE. No fetch, no localStorage, no module-level clock read. Weather is
//      passed IN by the caller. Every input is an argument, which is what makes
//      the three-hour verification (and the unit tests) possible at all.
//   2. VENUE-LOCAL, not device-local. Wayfind's inventory is Florida. A user in
//      Seattle at 6pm PT looking at Orlando is looking at a 9pm ET city, and
//      "open late" is the correct read there. Same doctrine as siteTime.js,
//      which exists because a UTC-anchored "today" dropped tonight's events
//      every evening after 8pm ET.
//   3. THE REASON IS PART OF THE ANSWER. `reason` is not decoration — it is the
//      headline. If we cannot say WHY this bucket and this gate produced this
//      list, we did not adapt to anything and must not claim we did.
import { siteAnchorDate } from "./siteTime.js";

export const SITE_TZ = "America/New_York";

// ── THE VENUE'S timezone, not the site's (v7.27) ────────────────────────────
//
// Rule 2 above says VENUE-LOCAL, and it justified a hardcoded ET with "Wayfind's
// inventory is Florida". That was true when it was written. It is not any more:
// v7.23 shipped the everywhere-in-the-US fallback (lib/todaysBest.js), so a
// reader in Seattle is now served Seattle places — and was still being bucketed
// on Eastern time.
//
// Measured, 2026-08-12 18:30 Pacific:
//     Seattle reader, actually sitting down to DINNER
//     -> hour 21.50, bucket "night", meal "LATE-NIGHT"
//
// A three-hour error, and it lands on the two values every rail keys on. The
// meal window is the visible half: that reader got the late-night bank (cheap
// late eats, bars) instead of dinner. Mountain runs 2 hours out, Central 1.
//
// The fix keeps rule 2 and finally honours it: the hour is read in the timezone
// of the COORDINATES BEING RANKED. A Florida centre resolves to America/New_York
// and every existing behaviour is byte-identical; only non-Eastern readers move.
//
// APPROXIMATE BY LONGITUDE, deliberately. A true lat/lng -> IANA lookup needs a
// shapefile this bundle has no business carrying. Longitude bands put every
// contiguous-US reader within one hour of correct and most of them exactly
// right, against a status quo of up to three hours out. The known error is the
// Florida panhandle and the western edges of Indiana/Michigan/Kentucky, which
// are Central-in-fact and read as Eastern here; that is a one-hour error on a
// bucket edge, and it is the same one-hour error those places already had.
// Arizona is named explicitly because it does not observe DST and Intl is what
// makes that correct rather than a subtraction we would have to maintain.
export function tzForPoint(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return SITE_TZ;
  if (la > 51 && ln < -129) return "America/Anchorage";
  if (la < 26 && ln < -150) return "Pacific/Honolulu";
  // Arizona: no DST. Bounded before the Mountain band so it wins inside it.
  if (la >= 31 && la <= 37.1 && ln <= -109 && ln >= -115) return "America/Phoenix";
  if (ln >= -87.5) return SITE_TZ;
  if (ln >= -101.5) return "America/Chicago";
  if (ln >= -114.5) return "America/Denver";
  return "America/Los_Angeles";
}

// Bucket edges, in float hours. Owner-specified:
//   morning   06:00 – 11:30
//   afternoon 11:30 – 17:30
//   night     17:30 – 06:00  (wraps midnight)
// Half-hour edges are why these are floats and why every consumer must take the
// float hour, not `getHours()`. An integer hour cannot express 11:30.
export const BUCKET_EDGES = { morningStart: 6, afternoonStart: 11.5, nightStart: 17.5 };
export const TIME_BUCKETS = ["morning", "afternoon", "night"];

export function bucketForHour(h) {
  const x = Number(h);
  if (!isFinite(x)) return "afternoon";
  const n = ((x % 24) + 24) % 24;
  if (n >= BUCKET_EDGES.nightStart || n < BUCKET_EDGES.morningStart) return "night";
  if (n < BUCKET_EDGES.afternoonStart) return "morning";
  return "afternoon";
}

// Venue-local (ET) float hour of `now`, DST-aware. Falls back to the device
// clock only when Intl has no tz data — the same fail-soft shape siteTodayStr
// uses, for the same reason: a missing timezone database must degrade, not throw.
// v7.27 — `tz` defaults to SITE_TZ, so every existing caller (pairsWellWith,
// trendingTime, exploreMenu, morningPicks, ranking.js) keeps its exact previous
// behaviour and only nowContext, which knows the coordinates, passes a zone.
export function siteHourFloat(now = new Date(), tz = SITE_TZ) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz || SITE_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
    const g = (t) => Number(p.find((x) => x.type === t).value);
    // hourCycle h23 can report hour 24 at midnight on some ICU builds.
    return (g("hour") % 24) + g("minute") / 60;
  } catch (e) {
    return now.getHours() + now.getMinutes() / 60;
  }
}

// The venue-local weekday, for the same reason. `isWeekend` feeds the weekend
// bonuses in dayFit/bucketAdjust, and between 9pm and midnight Pacific the
// Eastern anchor is already on tomorrow — so a Friday night in Los Angeles was
// being ranked as a Saturday. Falls back to the ET anchor on any Intl failure,
// which is the behaviour this replaces.
export function siteDayOfWeek(now = new Date(), tz = SITE_TZ) {
  try {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz || SITE_TZ, weekday: "short" }).format(now);
    const i = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
    if (i >= 0) return i;
  } catch (e) {}
  return siteAnchorDate(now).getDay();
}

// ── Weather normalisation ───────────────────────────────────────────────────
// The app carries weather in two shapes: the ranking shape ({ temp, rain, wet,
// label }) and the raw Open-Meteo payload from /api/weather. Normalise both, so
// a caller that has either one gets the same gate. Unknown weather is NOT
// treated as bad weather — it returns nulls and leaves outdoorOK true, because
// suppressing every outdoor place because a fetch failed is a worse answer than
// showing them.
const WET_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
const SEVERE_CODES = new Set([65, 67, 75, 82, 86, 95, 96, 99]);

export function normalizeWeather(w) {
  if (!w || typeof w !== "object") return null;
  // Ranking shape first — it is already normalised.
  if (w.temp != null || w.rain != null || w.wet != null || w.label != null) {
    const tempF = Number.isFinite(Number(w.temp)) ? Number(w.temp) : null;
    return {
      tempF,
      feelsF: Number.isFinite(Number(w.feels)) ? Number(w.feels) : tempF,
      rainPct: Number.isFinite(Number(w.rain)) ? Number(w.rain) : null,
      condition: w.label || null,
      code: Number.isFinite(Number(w.code)) ? Number(w.code) : null,
      // v6.97: the ranking shape's `wet` boolean (derived from the LIVE weather
      // code in app/home.js weatherFromCode) used to be DROPPED here, so a
      // caller reporting "it is raining right now" with a daily rain%% under 50
      // left the outdoor gate open — and the reason line claimed "clear" while
      // the weather chip beside it said Rain. An explicit wet report is
      // evidence; absence of the field stays null (never treated as dry-proof).
      wet: w.wet === true ? true : null,
    };
  }
  // Raw Open-Meteo.
  const cur = w.current || {};
  const daily = w.daily || {};
  const tempF = Number.isFinite(Number(cur.temperature_2m)) ? Number(cur.temperature_2m) : null;
  const feelsF = Number.isFinite(Number(cur.apparent_temperature)) ? Number(cur.apparent_temperature) : tempF;
  const rainPct = Array.isArray(daily.precipitation_probability_max) && Number.isFinite(Number(daily.precipitation_probability_max[0]))
    ? Number(daily.precipitation_probability_max[0]) : null;
  const code = Number.isFinite(Number(cur.weather_code)) ? Number(cur.weather_code) : null;
  if (tempF == null && rainPct == null && code == null) return null;
  return { tempF, feelsF, rainPct, condition: null, code, wet: null };
}

// ── The gate ────────────────────────────────────────────────────────────────
// Florida-specific and deliberately asymmetric. Heat is the common case here and
// it is a REAL constraint: an 88°F afternoon with a heat advisory is not a
// "prefer indoors" nudge, it is the reason a family abandons the day. Rain is
// the other. Everything else leaves the gate open.
//
// The thresholds use FEELS-LIKE, not air temperature. Florida humidity routinely
// puts the heat index 8–12°F above the thermometer, and the heat index is what
// the National Weather Service issues advisories on.
export const HEAT_ADVISORY_F = 95;   // NWS heat-index advisory territory
export const HOT_F = 88;             // uncomfortable outdoors at midday
export const COLD_F = 45;
export const WET_RAIN_PCT = 50;

export function weatherFlags(nw) {
  if (!nw) return { isWet: false, isHot: false, isCold: false, advisory: null, severe: false };
  const feels = nw.feelsF != null ? nw.feelsF : nw.tempF;
  const severe = nw.code != null && SEVERE_CODES.has(nw.code);
  const isWet = severe || nw.wet === true || (nw.code != null && WET_CODES.has(nw.code)) || (nw.rainPct != null && nw.rainPct >= WET_RAIN_PCT);
  const isHot = feels != null && feels >= HOT_F;
  const isCold = feels != null && feels <= COLD_F;
  let advisory = null;
  if (severe) advisory = "storm warning";
  else if (feels != null && feels >= HEAT_ADVISORY_F) advisory = "heat advisory";
  else if (isWet) advisory = "rain likely";
  return { isWet, isHot, isCold, advisory, severe };
}

// outdoorOK is the SUPPRESSION gate, not a demotion hint. False means outdoor
// categories are removed from the mix, in the same class as showing a Sarasota
// deal in Orlando: not a worse recommendation, a wrong one.
//
// Note the deliberate asymmetry between hot and wet. Rain closes the gate at any
// hour. Heat closes it only when the sun is actually on you — a 90°F Florida
// evening at 8pm is a perfectly good time to be outside, and suppressing the
// beach then would be the mirror-image error.
export function outdoorGate(bucket, flags) {
  if (!flags) return { outdoorOK: true, why: null };
  if (flags.severe) return { outdoorOK: false, why: "a storm warning is up" };
  if (flags.isWet) return { outdoorOK: false, why: "rain is likely" };
  if (flags.isCold) return { outdoorOK: false, why: "it is too cold to be out long" };
  if (flags.isHot && bucket === "afternoon") {
    return { outdoorOK: false, why: flags.advisory === "heat advisory" ? "there is a heat advisory" : "the afternoon heat is punishing" };
  }
  return { outdoorOK: true, why: null };
}

// ── Season / region ─────────────────────────────────────────────────────────
// Kept here so a consumer needs ONE import to answer "when and where are we".
// Month-based, ET-anchored. Mirrors lib/seasons.js currentSeason(); nowContext
// does not import it because seasons.js pulls in hero art and query tables that
// a pure time module has no business dragging along.
export function seasonForMonth(m) {
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "fall";
}

const DOW_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── The one function ────────────────────────────────────────────────────────
// nowContext({ lat, lng, city, weather, now, hour }) -> the shape every list
// surface consumes.
//
// `hour` is an explicit override (float, 0–23.99). It exists for two reasons and
// both are load-bearing: the unit tests need to pin an hour without freezing the
// clock, and the live three-hour verification the owner requires is impossible
// without it. It is read from ?hour= by the client wrapper, never from user
// input server-side.
export function nowContext(opts = {}) {
  const { lat = null, lng = null, city = null, weather = null } = opts;
  const now = opts.now instanceof Date ? opts.now : new Date();
  // v7.27 — the zone of the PLACE being ranked. No coordinates resolves to
  // SITE_TZ, so every caller that does not pass a centre is unchanged.
  const tz = tzForPoint(lat, lng);
  const hour = Number.isFinite(Number(opts.hour)) ? ((Number(opts.hour) % 24) + 24) % 24 : siteHourFloat(now, tz);
  const timeBucket = bucketForHour(hour);

  const anchor = siteAnchorDate(now);
  const dow = siteDayOfWeek(now, tz);
  const isWeekend = dow === 0 || dow === 6;
  const season = seasonForMonth(anchor.getMonth() + 1);

  const nw = normalizeWeather(weather);
  const flags = weatherFlags(nw);
  const gate = outdoorGate(timeBucket, flags);

  const ctx = {
    hour,
    timeBucket,
    // v7.23 — the meal window, from the one sanctioned sub-bucket split defined
    // at the bottom of this file. It is here rather than re-derived per surface
    // for the reason this whole module exists: a food rail that bucketed
    // "breakfast" on its own clock would be making a claim about what was
    // ranked that nothing else in the app agrees with.
    meal: mealForHour(hour),
    dayOfWeek: dow,
    dayName: DOW_NAMES[dow],
    isWeekend,
    season,
    // Venue-local (ET) month, 1-12. Editorial seasonal facts key on this.
    monthNum: anchor.getMonth() + 1,
    region: city || null,
    lat, lng,
    weather: {
      tempF: nw ? nw.tempF : null,
      feelsF: nw ? nw.feelsF : null,
      condition: nw ? nw.condition : null,
      rainPct: nw ? nw.rainPct : null,
      isWet: flags.isWet,
      isHot: flags.isHot,
      isCold: flags.isCold,
      advisory: flags.advisory,
      known: !!nw,
    },
    outdoorOK: gate.outdoorOK,
    gateWhy: gate.why,
  };
  ctx.reason = nowReason(ctx);
  return ctx;
}

// ── The headline's WHY ──────────────────────────────────────────────────────
// Never generic. This states the three things that produced the list: the
// bucket, the gate, and the evidence for the gate. Every branch names a fact we
// actually hold — the bucket comes from the clock, the temperature and advisory
// come from the weather payload, and there is no fallback line that fits any
// hour and any weather. When weather is unknown we say so rather than inventing
// a condition, which is the same honesty rule the intent-page subheads live
// under (lib/intentPages.js: a stated filter must have an implementing
// predicate).
export function nowReason(ctx) {
  const b = ctx.timeBucket;
  const w = ctx.weather;
  const t = w.feelsF != null ? Math.round(w.feelsF) : null;

  if (!ctx.outdoorOK) {
    // The gate fired. Lead with the consequence, then the evidence.
    if (w.advisory === "storm warning") return "indoors, because there is a storm warning";
    if (w.isWet) return t != null ? `indoors, because rain is likely and it is ${t}°` : "indoors, because rain is likely";
    if (w.advisory === "heat advisory") return t != null ? `indoors, because it is ${t}° and there is a heat advisory` : "indoors, because there is a heat advisory";
    if (w.isHot) return t != null ? `indoors, because ${t}° in the afternoon sun is punishing` : "indoors, because of the afternoon heat";
    if (w.isCold) return t != null ? `indoors, because it is only ${t}°` : "indoors, because it is too cold to be out long";
    return "indoors, because the weather is against being outside";
  }

  // The gate is open. Say what the bucket is FOR, and cite the weather that let
  // it stay open when we have it.
  // No em-dashes in any branch below: nowSubline joins the lead and the reason
  // with one, and a second inside the reason produced "Tonight around Orlando —
  // 96° after dark — the evening list" in the first draft.
  if (!w.known) {
    if (b === "morning") return "the quiet hours, before the crowds";
    if (b === "afternoon") return "the middle of the day, when everything is open";
    return "the late list, open after dark";
  }
  // AN OPEN GATE IS NOT A CLAIM OF GOOD WEATHER. The gate opens in the morning
  // and at night even when it is hot, because those are the hours the heat is
  // survivable, NOT because it is pleasant. "Outdoors is still comfortable at
  // 96°" is a fabrication in a friendly voice, and it shipped in the first draft
  // of this function — caught only by printing the real 88°/96° Orlando case.
  // When it is hot and the gate is open, the line says so, and says which hour
  // is doing the rescuing.
  if (w.isHot) {
    if (b === "morning") return t != null ? `get out now, before it hits ${t}° this afternoon` : "get out now, before the afternoon heat";
    return t != null ? `still ${t}° after dark, so this leans shaded and indoor-adjacent` : "still hot after dark, so this leans shaded and indoor-adjacent";
  }
  if (b === "morning") {
    return t != null ? `outdoors is still comfortable at ${t}°` : "outdoors is still comfortable this early";
  }
  if (b === "afternoon") {
    return t != null ? `${t}° and clear, so everything is open` : "clear, and everything is open";
  }
  return t != null ? `${t}° after dark, and the late list is open` : "the late list is open";
}

// The full headline. `Afternoon picks near Orlando — indoors, because it's 88
// and there's a heat advisory`. Surfaces that own their own title (the intent
// pages) use `reason` alone and keep their headline; surfaces without one use
// this whole line.
const BUCKET_LABEL = { morning: "Morning", afternoon: "Afternoon", night: "Tonight" };
export function nowHeadline(ctx, city) {
  const place = city || ctx.region;
  const lead = ctx.timeBucket === "night"
    ? (place ? `Tonight around ${place}` : "Tonight")
    : `${ctx.isWeekend ? ctx.dayName + " " : ""}${BUCKET_LABEL[ctx.timeBucket].toLowerCase()} picks${place ? " near " + place : ""}`;
  return lead.charAt(0).toUpperCase() + lead.slice(1) + " — " + ctx.reason;
}

// ── Shared labels ───────────────────────────────────────────────────────────
// These exist so the ten surfaces that each derived their own label from their
// own getHours() can DELETE that computation rather than merely re-source the
// hour. They were the visible half of the drift: home.js called 11:00-15:00
// "lunch" in one place and "this afternoon" in another, and Surprise called
// 12:00-17:00 "Afternoon" while the list beside it called the same hour
// "evening". Same clock, three vocabularies, on one screen.

// The three-bucket label, in the app's voice. `night` reads as "tonight" in
// prose and "Evening" as a noun, so both spellings live here rather than being
// re-invented per surface.
export const BUCKET_PHRASE = { morning: "this morning", afternoon: "this afternoon", night: "tonight" };
export const BUCKET_NOUN = { morning: "Morning", afternoon: "Afternoon", night: "Evening" };

// Meal windows are DELIBERATELY finer than the three buckets: "lunch" and
// "dinner" both sit inside the afternoon/night buckets and a food rail has to
// tell them apart. This is the one sanctioned sub-bucket split, defined once.
export function mealForHour(h) {
  const n = ((Number(h) % 24) + 24) % 24;
  if (n < 10.5) return "breakfast";
  if (n < 15) return "lunch";
  if (n < 21) return "dinner";
  return "late-night";
}

export function greetingForHour(h) {
  const b = bucketForHour(h);
  return b === "morning" ? "Good morning" : b === "afternoon" ? "Good afternoon" : "Good evening";
}
