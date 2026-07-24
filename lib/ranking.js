import { overrideFor } from "./placeOverrides.js";
import { isOpenNow } from "./businessStatus.js";
import { siteAnchorDate } from "./siteTime.js";
// v5.75: re-exported so app/home.js placeKind() can consult overrides through
// the Ranking namespace it already imports.
export { overrideFor } from "./placeOverrides.js";
// lib/ranking.js
// Conditions-aware ranking. The feed's base score (quality + personal affinity +
// distance) is computed in app/page.js as _ps. This module returns only the
// weather and time-of-day DELTAS to add on top, so the hero and the top-10
// reflect "the best move right now," not just all-time quality. Pure functions,
// unit-tested in isolation.
//
// The keyword buckets mirror catOfType() in app/page.js so classification stays
// consistent with the categories the app already trusts.

const KW = {
  water:   ["beach", "natural_feature", "marina"],          // outdoor + exposed; worst in storms
  outdoor: ["park", "amusement", "zoo", "stadium", "campground", "golf", "botanical"],
  // v5.75: expanded so name-based water words can't win over a clearly-indoor
  // TYPE. Added: theater/performing_arts, church/place_of_worship, gym/fitness,
  // hall/convention, school/university, hospital — the venue kinds that were
  // falling through to the nameWater read ("Bay Street Players Theater",
  // "Lake Wales Community Church").
  indoor:  ["museum", "art_gallery", "aquarium", "movie", "theater", "theatre", "performing_arts", "bowling", "spa", "casino", "library", "church", "place_of_worship", "gym", "fitness", "hall", "convention", "school", "university", "hospital"],
};

function typeList(place) {
  if (place && place.types && place.types.length) return place.types.map((t) => (t || "").toLowerCase());
  if (place && place.type) return [String(place.type).toLowerCase().split(" ").join("_")];
  return [];
}
const hasKw = (ts, arr) => ts.some((t) => arr.some((k) => t.includes(k)));

// Indoor/outdoor read, used by weather scoring and hero copy. Food, bars, and
// shops are always treated as indoor regardless of name. For everything else,
// the name can override an ambiguous type read (Google often tags an outdoor
// water attraction like "Dolphin Lagoon" as "aquarium").
export function venueLean(place) {
  const ts = typeList(place);
  const name = ((place && place.name) || "").toLowerCase();
  const foodBarShop = hasKw(ts, ["restaurant", "food", "cafe", "coffee", "bakery", "deli", "ice_cream", "night_club", "bar", "pub", "brewery", "liquor", "store", "shopping", "mall", "market", "shop", "boutique"]);
  if (foodBarShop) return { lean: "indoor", water: false };
  // v5.75 (accuracy): an indoor TYPE (theater, cinema, museum, church, gym...)
  // wins over a water-word in the NAME, so "Bay Street Players Theater" and
  // "Crystal Springs Museum" are never treated as waterfront — no false "Prime
  // beach weather" hero copy, no hot-day water boost. An override { noWater:true }
  // also forces the water read off for a specific inland-but-nautical-named place.
  if (hasKw(ts, KW.indoor)) return { lean: "indoor", water: false };
  const _ov = overrideFor(place);
  const noWater = !!(_ov && _ov.noWater);
  const nameWater = !noWater && /\b(beach|lagoon|pier|waterfront|marina|spring|springs|lake|river|bay|sound|gulf|ocean|shore|cove)\b/.test(name);
  const nameOutdoor = /\b(park|garden|trail|nature|preserve|zoo|outdoor|botanical|greenway|boardwalk)\b/.test(name);
  if ((hasKw(ts, KW.water) && !noWater) || nameWater) return { lean: "outdoor", water: true };
  if (hasKw(ts, KW.outdoor) || nameOutdoor) return { lean: "outdoor", water: false };
  return { lean: "neutral", water: false };
}

// Coarse category for day/time fit. Mirrors catOfType().
export function coarseCat(place) {
  // v5.61 (audit P2): a manual override pins the coarse bucket over Google's
  // noisy types (see lib/placeOverrides.js).
  const _ov = overrideFor(place);
  if (_ov && _ov.category) return _ov.category;
  const ts = typeList(place);
  if (hasKw(ts, ["lodging", "hotel", "motel", "resort", "guest_house", "bed_and_breakfast"])) return "Hotels";
  if (hasKw(ts, ["restaurant", "food", "cafe", "coffee", "bakery", "meal_", "ice_cream", "deli"])) return "Food";
  if (hasKw(ts, ["night_club", "bar", "pub", "brewery", "liquor"])) return "Nightlife";
  if (hasKw(ts, ["store", "shopping", "mall", "market", "shop", "boutique"])) return "Shopping";
  if (hasKw(ts, ["tourist", "museum", "park", "art_gallery", "amusement", "aquarium", "zoo", "stadium", "landmark", "historical", "beach", "marina", "natural_feature"])) return "Activities";
  return null;
}

// Bucket the current weather into a regime. weather shape from page.js:
// { wet: bool, rain: 0-100, temp: °F, label: string }.
export function weatherRegime(weather) {
  if (!weather) return "unknown";
  if (weather.wet || (weather.rain != null && weather.rain >= 50)) return "wet";
  if (weather.rain != null && weather.rain >= 30) return "showery";
  if (weather.temp != null && weather.temp >= 93) return "hot";
  if (weather.temp != null && weather.temp <= 45) return "cold";
  return "pleasant";
}

// Weather fit delta. Positive favors the place, negative demotes it.
export function weatherFit(place, weather) {
  const regime = weatherRegime(weather);
  if (regime === "unknown") return 0;
  const { lean, water } = venueLean(place);
  switch (regime) {
    case "wet":      return water ? -18 : lean === "outdoor" ? -12 : lean === "indoor" ? 10 : -3;
    case "showery":  return water ? -9  : lean === "outdoor" ? -6  : lean === "indoor" ? 5  : -1;
    case "hot":      return water ? 8   : lean === "outdoor" ? -4  : lean === "indoor" ? 3  : 0;
    case "cold":     return water ? -10 : lean === "outdoor" ? -8  : lean === "indoor" ? 6  : 0;
    case "pleasant": return water ? 8   : lean === "outdoor" ? 8   : lean === "neutral" ? 3 : 0;
    default:         return 0;
  }
}

// Day/time fit delta. hour 0-23, isWeekend boolean.
export function dayFit(place, hour, isWeekend) {
  const cat = coarseCat(place);
  const h = hour;
  let d = 0;
  const meal = (h >= 6 && h <= 10) || (h >= 11 && h <= 14) || (h >= 17 && h <= 21);
  if (cat === "Food" && meal) d += 6;
  if (cat === "Nightlife") d += (h >= 21 || h <= 2) ? 10 : (h >= 17 ? 3 : -8);
  if (cat === "Activities") d += (h >= 10 && h < 17) ? 5 : (h >= 21 || h <= 5) ? -8 : 0;
  if (cat === "Shopping") d += (h >= 10 && h < 19) ? 4 : (h >= 21 || h <= 7) ? -6 : 0;
  if (isWeekend && cat === "Activities") d += 4;
  if (isWeekend && cat === "Nightlife") d += 3;
  // Open-now dominates: you cannot go somewhere closed. v6.34: decided by the
  // live status source (freshness-gated), never the raw cached boolean — a
  // stale snapshot must not bury an open place 15 points.
  const lo = isOpenNow(place);
  if (lo === false) d -= 15;
  else if (lo === true) d += 3;
  return d;
}

export function conditionsAdjust(place, ctx) {
  const w = ctx && ctx.weather;
  const h = ctx && ctx.hour != null ? ctx.hour : new Date().getHours();
  const wk = ctx && ctx.isWeekend != null ? ctx.isWeekend : [0, 6].includes(siteAnchorDate().getDay());
  return weatherFit(place, w) + dayFit(place, h, wk);
}

// Rank a list by base score + conditions. baseOf extracts the base score
// (defaults to _ps, then wfScore, then 50). Returns a new sorted array with _cs.
// First-party member signal. Comments: silent below 3 distinct authors so one
// person can never move a score; capped under a point so Google-scale evidence
// still anchors the number. Warnings pull down, everything else pushes up.
// v5.05 likes: every like nudges the card up for EVERYONE (product direction:
// the count is never displayed, but the card is impacted). Log curve + hard
// cap keep it gaming-resistant: 1 like ≈ +0.3, 3 ≈ +0.6, 15 hits the +1.2
// ceiling — enough to win ties, never enough to beat real review evidence.
export function memberDelta(sig) {
  if (!sig) return 0;
  const up = (sig.authors && sig.authors >= 3) ? Math.min(0.75, 0.15 * sig.authors) : 0;
  const down = Math.min(0.75, 0.25 * (sig.warnAuthors || 0));
  const likeUp = sig.likes ? Math.min(1.2, 0.3 * Math.log2(1 + sig.likes)) : 0;
  return +(up + likeUp - down).toFixed(2);
}
// v6.42 (owner directive, PERMANENT): "Top rated" everywhere means the
// DISPLAYED Wayfind Score, best to worst. Distance NEVER matters here — it has
// its own "Closest first" sort — and raw star rating never substitutes for the
// Score (the Score IS the moat; the badge must read in order). Reviews only
// break exact ties. EVERY view's "rated" sort MUST delegate to this comparator:
// scripts/test-top-rated.mjs fails the build if a divergent copy reappears.
export const byTopRated = (a, b) =>
  (((b && b.wfScore) || 0) - ((a && a.wfScore) || 0)) ||
  (((b && b.reviews) || 0) - ((a && a.reviews) || 0));

export function rankByConditions(places, ctx, baseOf) {
  const base = baseOf || ((p) => (p._ps != null ? p._ps : (p.wfScore != null ? p.wfScore : 50)));
  return (places || [])
    .filter(Boolean)
    .map((p) => ({ ...p, _cs: base(p) + conditionsAdjust(p, ctx) }))
    .sort((a, b) => b._cs - a._cs);
}

// Short, honest one-liner for the hero, given the winner and the conditions.
export function heroReason(place, ctx) {
  const regime = weatherRegime(ctx && ctx.weather);
  const { lean, water } = venueLean(place);
  // A paid theme/water park is never framed as a generic "get outside" or
  // beach move; weather can still rank it, but the copy must not misrepresent
  // what it is (v2.3, from the Diagon Alley hero bug).
  const _t = ((place && place.types) || []).join(" ").toLowerCase();
  const paidPark = /amusement_park|theme_park|water_park/.test(_t);
  const h = ctx && ctx.hour != null ? ctx.hour : new Date().getHours();
  if (regime === "wet" && lean === "indoor") return "Top pick to stay dry today";
  if (regime === "wet") return "Top pick that holds up in today's weather";
  if ((regime === "hot" || regime === "pleasant") && water && !paidPark) return "Prime beach weather right now";
  if (regime === "hot" && lean === "indoor") return "A cool escape from the heat right now";
  if (regime === "pleasant" && lean === "outdoor" && !paidPark) return "Great weather to get outside";
  if (h >= 17 && h <= 21 && coarseCat(place) === "Food") return "Top dinner pick near you";
  if ((h >= 21 || h <= 2) && coarseCat(place) === "Nightlife") return "Top spot out tonight";
  return "Your top pick right now";
}
