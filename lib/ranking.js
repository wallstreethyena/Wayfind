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
  indoor:  ["museum", "art_gallery", "aquarium", "movie", "bowling", "spa", "casino", "library"],
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
  const nameWater = /\b(beach|lagoon|pier|waterfront|marina|spring|springs|lake|river|bay|sound|gulf|ocean|shore|cove)\b/.test(name);
  const nameOutdoor = /\b(park|garden|trail|nature|preserve|zoo|outdoor|botanical|greenway|boardwalk)\b/.test(name);
  if (hasKw(ts, KW.water) || nameWater) return { lean: "outdoor", water: true };
  if (hasKw(ts, KW.outdoor) || nameOutdoor) return { lean: "outdoor", water: false };
  if (hasKw(ts, KW.indoor)) return { lean: "indoor", water: false };
  return { lean: "neutral", water: false };
}

// Coarse category for day/time fit. Mirrors catOfType().
export function coarseCat(place) {
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
  // Open-now dominates: you cannot go somewhere closed.
  if (place && place.openNow === false) d -= 15;
  else if (place && place.openNow === true) d += 3;
  return d;
}

export function conditionsAdjust(place, ctx) {
  const w = ctx && ctx.weather;
  const h = ctx && ctx.hour != null ? ctx.hour : new Date().getHours();
  const wk = ctx && ctx.isWeekend != null ? ctx.isWeekend : [0, 6].includes(new Date().getDay());
  return weatherFit(place, w) + dayFit(place, h, wk);
}

// Rank a list by base score + conditions. baseOf extracts the base score
// (defaults to _ps, then wfScore, then 50). Returns a new sorted array with _cs.
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
  const h = ctx && ctx.hour != null ? ctx.hour : new Date().getHours();
  if (regime === "wet" && lean === "indoor") return "Top pick to stay dry today";
  if (regime === "wet") return "Top pick that holds up in today's weather";
  if ((regime === "hot" || regime === "pleasant") && water) return "Prime beach weather right now";
  if (regime === "pleasant" && lean === "outdoor") return "Great weather to get outside";
  if (h >= 17 && h <= 21 && coarseCat(place) === "Food") return "Top dinner pick near you";
  if ((h >= 21 || h <= 2) && coarseCat(place) === "Nightlife") return "Top spot out tonight";
  return "Your top pick right now";
}
