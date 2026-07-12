// lib/dining.js
// Cuisine label and cost helpers. Pure functions.
// - Cuisine is parsed from Google place types (e.g. "tapas_restaurant" -> "Tapas").
// - Cost is Google's real per-person price range when we captured it, otherwise an
//   HONEST estimate derived from Google's price tier, otherwise "Price not listed".
//   We never invent a couple's bill when Google gives no price signal at all.

const CUISINE = {
  afghani: "Afghan", african: "African", american: "American", asian: "Asian",
  bar_and_grill: "Bar & Grill", barbecue: "Barbecue", brazilian: "Brazilian",
  breakfast: "Breakfast", brunch: "Brunch", buffet: "Buffet", cafe: "Café",
  chinese: "Chinese", coffee_shop: "Café", dessert: "Dessert", donut: "Donuts",
  fast_food: "Fast food", fine_dining: "Fine dining", french: "French",
  greek: "Greek", hamburger: "Burgers", ice_cream: "Ice cream", indian: "Indian",
  indonesian: "Indonesian", italian: "Italian", japanese: "Japanese",
  korean: "Korean", lebanese: "Lebanese", mediterranean: "Mediterranean",
  mexican: "Mexican", middle_eastern: "Middle Eastern", pizza: "Pizza",
  ramen: "Ramen", seafood: "Seafood", spanish: "Spanish", steak: "Steakhouse",
  sushi: "Sushi", tapas: "Tapas", thai: "Thai", turkish: "Turkish",
  vegan: "Vegan", vegetarian: "Vegetarian", vietnamese: "Vietnamese",
  wine_bar: "Wine bar", pub: "Pub", bakery: "Bakery", deli: "Deli",
  sandwich: "Sandwiches", sports_bar: "Sports bar",
};

function typeList(place) {
  if (place && place.types && place.types.length) return place.types.map((t) => (t || "").toLowerCase());
  if (place && place.type) return [String(place.type).toLowerCase().split(" ").join("_")];
  return [];
}

// Friendly cuisine/venue label from Google types. Returns null when Google only
// gives generic "restaurant"/"food"/"point_of_interest".
import { overrideFor } from "./placeOverrides.js";

export function cuisineLabel(place) {
  // v5.61 (audit P2): a manual override always wins over Google's noisy tags
  // (Seasons 52 -> "Vegan", Bocas -> "Breakfast"). See lib/placeOverrides.js.
  const ov = overrideFor(place);
  if (ov && ov.cuisine) return ov.cuisine;
  const suppress = ov && ov.suppressCuisine ? new Set(ov.suppressCuisine) : null;
  // v2.3 identity rule: real cuisine identities (*_restaurant types) always win.
  // Cafe/bakery/dessert-style labels only apply when that is plausibly the
  // place's identity: the name says so, the leading Google types say so, or
  // there is no restaurant/bar identity at all. A seafood grill that Google
  // noisily also tags "cafe" must never read as a Café anywhere in the app.
  const ts = typeList(place);
  const nm = ((place && place.name) || "").toLowerCase();
  const CAFEISH = /cafe|coffee|bak|dessert|ice[_ ]?cream|gelato|donut|dough|juice|boba|crepe|pastr|sweet|tea/;
  const cafeAllowed = CAFEISH.test(nm)
    || ts.slice(0, 2).some((t) => /^(cafe|coffee_shop|bakery|ice_cream_shop|dessert_shop|donut_shop|tea_house|juice_shop)$/.test(t))
    || !ts.some((t) => t === "restaurant" || t === "bar" || t === "night_club" || /_restaurant$/.test(t));
  for (const gate of [false, true]) {
    for (const t of ts) {
      const key = t.replace(/_restaurant$/, "").replace(/_place$/, "");
      const label = CUISINE[key] || CUISINE[t];
      if (!label) continue;
      if (suppress && suppress.has(label)) continue;
      const isCafe = CAFEISH.test(key) || CAFEISH.test(String(label).toLowerCase());
      if (gate ? (isCafe && cafeAllowed) : !isCafe) return label;
    }
    for (const t of ts) {
      for (const k of Object.keys(CUISINE)) {
        if (!t.includes(k)) continue;
        if (suppress && suppress.has(CUISINE[k])) continue;
        const isCafe = CAFEISH.test(k) || CAFEISH.test(String(CUISINE[k]).toLowerCase());
        if (gate ? (isCafe && cafeAllowed) : !isCafe) return CUISINE[k];
      }
    }
  }
  return null;
}

// Rough per-person spend by Google tier (US full-service, food before tax/tip).
const PER_PERSON = { 1: [10, 20], 2: [22, 40], 3: [45, 80], 4: [90, 160] };
const TIER_STR = { 0: "Free", 1: "$", 2: "$$", 3: "$$$", 4: "$$$$" };
const money = (n) => "$" + Math.round(n);

// Cost read for the card/sheet.
// { listed, real, tier, forTwoLow, forTwoHigh, text }
export function costForTwo(place) {
  const pr = place && place.priceRange;
  if (pr && (pr.startUsd != null || pr.endUsd != null)) {
    const lo = (pr.startUsd != null ? pr.startUsd : pr.endUsd) * 2;
    const hi = (pr.endUsd != null ? pr.endUsd : pr.startUsd) * 2;
    return {
      listed: true, real: true,
      tier: place.price || (place.priceNum != null ? TIER_STR[place.priceNum] : null),
      forTwoLow: lo, forTwoHigh: hi,
      text: lo === hi ? "~" + money(lo) + " for two" : money(lo) + "–" + money(hi) + " for two",
    };
  }
  const n = place && place.priceNum;
  if (n === 0) return { listed: true, real: false, tier: "Free", forTwoLow: 0, forTwoHigh: 0, text: "Free" };
  if (n != null && PER_PERSON[n]) {
    const [lo, hi] = PER_PERSON[n];
    return {
      listed: true, real: false, tier: TIER_STR[n],
      forTwoLow: lo * 2, forTwoHigh: hi * 2,
      text: "Est. " + money(lo * 2) + "–" + money(hi * 2) + " for two",
    };
  }
  return { listed: false, real: false, tier: null, forTwoLow: null, forTwoHigh: null, text: "Price not listed" };
}

// Average cost for two across a list of places. Uses the midpoint of each priced
// place's for-two range; places with no price signal are skipped. Returns null
// when fewer than two places have price (an average of 0-1 is not meaningful).
export function avgCostForTwo(places) {
  const mids = [];
  for (const p of (places || [])) {
    const c = costForTwo(p);
    if (c.listed && c.forTwoLow != null && c.forTwoHigh != null && (c.forTwoLow > 0 || c.forTwoHigh > 0)) {
      mids.push((c.forTwoLow + c.forTwoHigh) / 2);
    }
  }
  if (mids.length < 2) return null;
  const avg = mids.reduce((s, x) => s + x, 0) / mids.length;
  const rounded = Math.max(5, Math.round(avg / 5) * 5);
  return { n: mids.length, total: (places || []).length, avg: rounded, text: "Est. avg ~$" + rounded + " for two" };
}

// v5.61 (audit P0): price glyph string for a numeric level. Pure so
// scripts/test-price.mjs proves "level 1 -> $, never $$$$". null -> "";
// 0 -> "Free"; 1-4 -> that many "$".
export function priceGlyphs(level) {
  if (level == null) return "";
  if (level === 0) return "Free";
  return "$".repeat(Math.max(1, Math.min(4, level)));
}
