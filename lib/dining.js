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
export function cuisineLabel(place) {
  const ts = typeList(place);
  for (const t of ts) {
    const key = t.replace(/_restaurant$/, "").replace(/_place$/, "");
    if (CUISINE[key]) return CUISINE[key];
    if (CUISINE[t]) return CUISINE[t];
  }
  for (const t of ts) {
    for (const k of Object.keys(CUISINE)) {
      if (t.includes(k)) return CUISINE[k];
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
