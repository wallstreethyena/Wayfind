// lib/daylight.js — THE CLOCK THE RAILS NEVER HAD.
//
// THE DEFECT, measured against production 2026-08-28 19:12 ET, reader at
// Bradenton (27.4989, -82.5748), /api/rails:
//
//   · 16 of 17 rails returned BYTE-IDENTICAL lists for band=morning and
//     band=night. Only `today` changes with the hour, and only because the
//     owner hand-filed a morning board and a night board. Every other rail is
//     a fixed list that does not know what time it is.
//   · Date Night's top four at 7:12pm: a dolphin-tour boat, a beach 16 miles
//     away, an italian room, and a NATURE PRESERVE THAT LOCKS AT DUSK. The
//     tile says "Quiet enough to talk". Three of those four have no indoors.
//   · Tonight's Move promises "Still open when you arrive" over 38 places of
//     which ZERO carry opening hours. Across all 17 rails, 19 of 1,404 rows
//     carry `oh`. The promise is not merely unmet, it is unmeetable.
//   · The Best Around You at 7:12pm led with an indoor children's playground,
//     then two parks and a kayak launch.
//
// WHY THE IDENTITY CONTRACT DID NOT CATCH THIS. v8.31.2 made every rail
// declare what its places ARE, and it works — `eat` gets meals, `tonight` gets
// nightlife venues. It asks one question and it is the right one. It simply
// never asks the second: *can a reader act on this right now*. A beach is a
// beach at 2am. The category is still true; the recommendation is not.
//
// So this module is the second axis, and it is deliberately NARROW. It does
// not model closing times it cannot know. It refuses exactly one thing: a
// place that requires DAYLIGHT, served after dark. That claim is falsifiable
// from data every row already carries, and it is the difference between a rail
// that looks correct and a rail a person would actually follow.
//
// TWO LAYERS, IN THIS ORDER — evidence first, inference second:
//
//   1. HOURS, where the row carries them. `oh` + `utcOffset` through
//      lib/businessStatus.js openNowFromHours() is a fact about this venue on
//      this day. It outranks everything below; a park that publishes hours and
//      is open is open, whatever its type suggests.
//   2. DAYLIGHT, where it does not. A primary type that cannot be used in the
//      dark, after real sunset for the reader's own coordinates.
//
// Anything else is UNKNOWN, and unknown is served. This module never claims a
// place is open — it only removes what it can prove is wrong. That asymmetry
// is the whole design: a false "closed" costs a good place a card, and with
// 98.6% of rows carrying no hours, a stricter rule would empty the board.
//
// SUNSET IS COMPUTED, NOT ASSUMED. "After 8pm" is wrong twice a year in
// Florida by more than 90 minutes: on 2026-12-21 Bradenton loses the sun at
// 5:36pm and on 2026-06-21 at 8:28pm. A fixed hour would blank the beach rails
// through winter afternoons and serve them through summer daylight. The NOAA
// solar position algorithm is closed-form, needs no network, and is pinned by
// scripts/test-daylight.mjs against published times for both solstices.
import { openNowFromHours } from "./businessStatus.js";

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/**
 * Sunrise/sunset for a coordinate on a calendar day, in UTC ms.
 * NOAA General Solar Position Calculations. Returns nulls above the polar
 * circles on days with no sunrise or sunset — Florida never reaches that, but
 * a total function is cheaper than a caller that has to know it cannot.
 */
export function sunTimesUtc(lat, lng, when) {
  // Number(null) is 0, and 0/0 is a real coordinate in the Gulf of Guinea — so
  // a null island would have been resolved as a place with a sunset, and an
  // unlocated reader's now-rails emptied at 11pm ET. Caught by this module's
  // own guard; reject the empties before coercing, never after.
  if (lat == null || lng == null || lat === "" || lng === "") return { sunrise: null, sunset: null };
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return { sunrise: null, sunset: null };
  const d = when instanceof Date ? when : new Date(when || Date.now());
  if (Number.isNaN(d.getTime())) return { sunrise: null, sunset: null };

  // The Julian date of the INSTANT, not of UTC midnight, and ROUNDED — the two
  // together select the solar day the reader is actually inside. Both were got
  // wrong once and both failures were silent: anchoring on UTC midnight
  // resolved the PREVIOUS day's sun for every reader west of Greenwich, and
  // ceil() resolved the NEXT day's once the instant passed local solar noon —
  // which made a 6pm August afternoon report "dark", because it was being
  // compared against tomorrow morning's sunrise.
  const jd = d.getTime() / 86400000 + 2440587.5;
  // THE MEAN SOLAR NOON, AND THE TWO SIGN TRAPS IN IT. `n` must be a WHOLE
  // number of days since J2000 — a Julian date runs noon-to-noon, so
  // `jd - 2451545.0` for a UTC midnight always ends in .5 and skipping the
  // round() puts every result exactly twelve hours out (measured: sunset came
  // back as 7:57 AM). And the sunrise equation takes longitude WEST-positive,
  // while every coordinate in this codebase is east-positive, so it is negated
  // here rather than at each call site.
  const lw = -ln;                              // longitude, west-positive
  const n = Math.round(jd - 2451545.0 + 0.0008 - lw / 360);
  const Jstar = n + 0.0008 + lw / 360;         // mean solar noon, days since J2000
  const M = (357.5291 + 0.98560028 * Jstar) % 360;                    // solar mean anomaly
  const C = 1.9148 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 0.0003 * Math.sin(rad(3 * M));
  const L = (M + C + 180 + 102.9372) % 360;    // ecliptic longitude
  const Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(rad(M)) - 0.0069 * Math.sin(rad(2 * L));
  const decl = Math.asin(Math.sin(rad(L)) * Math.sin(rad(23.4397)));   // solar declination

  // -0.833° accounts for refraction plus the sun's own radius: the standard
  // definition of sunrise/sunset (upper limb touching the horizon), which is
  // what published tables print.
  const cosH = (Math.sin(rad(-0.833)) - Math.sin(rad(la)) * Math.sin(decl))
    / (Math.cos(rad(la)) * Math.cos(decl));
  if (cosH > 1 || cosH < -1) return { sunrise: null, sunset: null };  // polar day / night
  const H = deg(Math.acos(cosH));

  const Jset = Jtransit + H / 360;
  const Jrise = Jtransit - H / 360;
  const toMs = (j) => Math.round((j - 2440587.5) * 86400000);
  return { sunrise: toMs(Jrise), sunset: toMs(Jset) };
}

/**
 * Is it dark at this coordinate right now? Dark = after sunset, or before
 * sunrise. Unknown coordinates answer FALSE — "we do not know" must never
 * silently empty a rail, and every other gate still applies.
 */
export function isAfterDark(lat, lng, now) {
  const t = now instanceof Date ? now.getTime() : Number(now != null ? now : Date.now());
  if (!Number.isFinite(t)) return false;
  const { sunrise, sunset } = sunTimesUtc(lat, lng, new Date(t));
  if (sunrise == null || sunset == null) return false;
  return t >= sunset || t < sunrise;
}

// ── WHAT CANNOT BE USED IN THE DARK ─────────────────────────────────────────
// PRIMARY TYPE ONLY, which is the v8.30.1 discipline and it is load-bearing
// here rather than stylistic. N Skyway Fishing Pier State Park carries `park`
// AND `state_park` AND `tourist_attraction` in its secondary types, and it is
// the one place on Tonight's Move that is genuinely, deliberately a night
// venue — the summer registry's own line is "night fishing under the lit
// Skyway span". Its PRIMARY type is `fishing_pier`, which is not on this list,
// so it survives. Read the secondary tokens and this module would delete the
// best card on the rail it was written to fix.
//
// The list is short on purpose. Every entry is a place whose entire use is
// outdoors in daylight: you cannot walk a preserve, sit on sand, tour a
// garden or board a sightseeing boat at 10pm. Types that merely CLOSE in the
// evening — museum, aquarium, art_gallery, amusement_center, indoor_playground
// — are deliberately absent: that is an hours fact, not a daylight fact, and
// inventing a closing time we do not have is exactly the unfalsifiable claim
// this codebase refuses to make. When their hours arrive, layer 1 handles them.
const DAYLIGHT_ONLY_PRIMARY = new Set([
  "beach", "park", "city_park", "state_park", "national_park", "dog_park",
  "skate_park", "picnic_ground", "playground", "nature_preserve",
  "wildlife_refuge", "wildlife_park", "hiking_area", "botanical_garden",
  "garden", "zoo", "farm", "farmstead", "marina", "fishing_charter",
  "tour_agency", "boat_tour_agency", "sightseeing_tour_agency", "water_park",
  "campground", "rv_park", "golf_course", "farmers_market", "scenic_spot",
  "off_roading_area", "cycling_park", "swimming_pool",
]);

/** The row's own claim about what it is. Primary first, then the lead type. */
export function primaryTypeOf(p) {
  if (!p) return "";
  const primary = p.primaryType || p.primary_type;
  if (primary) return String(primary).toLowerCase();
  const list = Array.isArray(p.types) ? p.types : Array.isArray(p.google_types) ? p.google_types : [];
  return String(list[0] || "").toLowerCase();
}

/** Does this place require daylight to be worth going to at all? */
export function isDaylightOnlyPlace(p) {
  return DAYLIGHT_ONLY_PRIMARY.has(primaryTypeOf(p));
}

/**
 * THE GATE. `true` = this place is a reasonable answer to "right now".
 *
 * Total over garbage and biased toward serving: a row with no hours, no
 * coordinates or no types is UNKNOWN, and unknown is served. The only `false`
 * this function returns is one it can defend — published hours that say
 * closed, or a daylight-only place after a computed sunset.
 */
export function servableNow(place, ctx) {
  const p = place || {};
  const now = (ctx && ctx.now != null) ? ctx.now : Date.now();

  // Layer 1 — EVIDENCE. Real published hours outrank every inference below.
  if (p.oh) {
    // v8.89 — ASK ABOUT `now`, NOT ABOUT THE WALL CLOCK. This passed no instant,
    // so businessStatus fell back to Date.now() while layer 2 below correctly
    // used `now` — two layers of one decision reading two different clocks.
    // Harmless whenever they agreed and wrong whenever they did not: a rail
    // computed for the evening band, a cached response evaluated for the minute
    // it was built for, or a guard walking a boundary all pass an explicit
    // `now` precisely because it is not the current one.
    const open = openNowFromHours(p.oh, p.utcOffset, now);
    if (open === true) return true;
    if (open === false) return false;
  }

  // Layer 2 — INFERENCE, and only the one inference that is falsifiable.
  if (!isDaylightOnlyPlace(p)) return true;
  const lat = (ctx && Number.isFinite(ctx.lat)) ? ctx.lat : p.lat;
  const lng = (ctx && Number.isFinite(ctx.lng)) ? ctx.lng : p.lng;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return true;
  return !isAfterDark(Number(lat), Number(lng), now);
}

// ── WHICH RAILS ANSWER "RIGHT NOW" ──────────────────────────────────────────
// A rail is on this list when its tile makes a claim about the reader's
// CURRENT moment. A rail is off it when the tile is a plan — you read "Beach
// Day" at 11pm to decide about tomorrow, and filtering it after dark would
// delete the whole rail every evening for no reader benefit.
//
// The membership of this set is asserted by scripts/test-rail-daylight.mjs so
// a rail cannot quietly join or leave it: adding one is a product decision
// about what its tile promises, not a tuning knob.
//
//   tonight    "Still open when you arrive"     — the literal claim
//   datenight  "Quiet enough to talk"           — tonight's dinner, not July's
//   eat        "Skip the bad meal"              — the meal you are having now
//   break      "Back at your desk in 30"        — this break, this hour
//   breakfast  "Worth waking up for"            — this morning
//   best       "The highest score near you"     — the answer to right now
//   gems       "Great, and nobody found it"     — served beside `best`
//   trending   "Everyone's searching this"      — a claim about this moment
//   family     "Nobody melts down at 3pm"       — an outing starting now
//
// Deliberately NOT here: season, today, beach, drive, events, birthday,
// locals, cindy — every one of those is read to PLAN. `events` carries its own
// dates; `drive` is a trip you take tomorrow; `birthday` is a date in the
// future. Gating them on the current minute would answer a question nobody
// asked.
export const NOW_RAILS = Object.freeze([
  "tonight", "datenight", "eat", "break", "breakfast", "best", "gems", "trending", "family",
]);

export const isNowRail = (id) => NOW_RAILS.indexOf(id) !== -1;

/**
 * Filter one rail's rows for the reader's actual moment. A rail NOT on
 * NOW_RAILS is returned untouched — the caller does not have to know which is
 * which, so the rule lives in one place instead of at every call site.
 */
export function servableRows(railId, rows, ctx) {
  const list = Array.isArray(rows) ? rows : [];
  if (!isNowRail(railId)) return list;
  return list.filter((p) => {
    try { return servableNow(p, ctx); } catch { return true; }
  });
}
