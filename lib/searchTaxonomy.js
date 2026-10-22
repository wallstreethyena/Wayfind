// lib/searchTaxonomy.js — one category for every searchable thing.
//
// The six tiles in lib/categories.js (Food, Night out, Activities, Family,
// Stays, Shopping) and the sub-filters in lib/google.js SUBFILTERS are the
// only taxonomy. Places, events, and guides (the site's blogs) all land on
// that same pair. A search phrase such as "things to do" or "brunch" is a
// category filter. Ranking stays in lib/searchRank.js.

import { CATEGORY_TILES } from "./categories.js";
import { morningDisplayIdentity } from "./morningIdentity.js";

export const NAV_CATEGORY_IDS = CATEGORY_TILES.map((tile) => tile.id);

// Sub-filter ids from lib/google.js SUBFILTERS. scripts/test-search-taxonomy.mjs
// asserts this table is exactly those ids, so the search taxonomy cannot grow
// a private subcategory. google.js is a client module; the ranker does not import it.
export const NAV_SUBCATEGORY_IDS = {
  food: ["all", "breakfast", "cafes", "lunch", "dinner", "quickbites", "delivery", "dessert"],
  nightlife: ["all", "bars", "clubs", "speakeasy", "karaoke", "sports", "music"],
  attractions: ["all", "themeparks", "outdoors", "beaches", "museums", "family", "tours", "spa", "landmarks", "arts", "marinas"],
  family: ["all", "toddlers", "kids", "adults", "rainy"],
  hotels: ["all", "luxury", "budget", "beach", "boutique"],
  shopping: ["all", "malls", "boutiques", "markets", "outlets", "giftshops"],
};

const STORED_CATEGORY = {
  food: "food",
  nightlife: "nightlife",
  attractions: "attractions",
  beach: "attractions",
  activities: "attractions",
  hotels: "hotels",
  shopping: "shopping",
  family: "family",
};

const TAG_SUBS = {
  food: ["breakfast", "cafes", "lunch", "dinner", "quickbites", "dessert", "delivery"],
  nightlife: ["bars", "clubs", "speakeasy", "karaoke", "sports", "music"],
  attractions: ["themeparks", "outdoors", "beaches", "museums", "family", "tours", "spa", "landmarks", "arts", "marinas"],
  family: ["toddlers", "kids", "adults", "rainy"],
  hotels: ["luxury", "budget", "beach", "boutique"],
  shopping: ["malls", "boutiques", "markets", "outlets", "giftshops"],
};

const TYPE_SUB = [
  [/cafe|coffee_shop|coffeehouse/, "food", "cafes"],
  [/bakery|ice_cream|dessert/, "food", "dessert"],
  [/meal_takeaway|fast_food|sandwich/, "food", "quickbites"],
  [/brunch|breakfast/, "food", "breakfast"],
  // A restaurant primary is dinner. Breakfast and fast food matched above,
  // so this does not turn a diner or a drive-through into a date-night table.
  [/restaurant|steak_house|bistro/, "food", "dinner"],
  [/meal_delivery|(?:^|\s)food(?:\s|$)/, "food", "all"],
  [/night_club/, "nightlife", "clubs"],
  [/bar|pub|wine_bar|cocktail/, "nightlife", "bars"],
  [/amusement_park|theme_park|water_park/, "attractions", "themeparks"],
  [/museum|art_gallery/, "attractions", "museums"],
  [/aquarium|zoo|park|campground|hiking/, "attractions", "outdoors"],
  [/beach|natural_feature/, "attractions", "beaches"],
  [/tourist_attraction|landmark|monument/, "attractions", "landmarks"],
  [/spa|wellness/, "attractions", "spa"],
  [/tour|boat_tour/, "attractions", "tours"],
  [/marina|boat_rental/, "attractions", "marinas"],
  [/hotel|lodging|resort/, "hotels", "all"],
  [/shopping_mall/, "shopping", "malls"],
  [/clothing_store|boutique/, "shopping", "boutiques"],
  [/department_store|outlet/, "shopping", "outlets"],
  [/market|grocery|supermarket/, "shopping", "markets"],
  [/gift_shop|souvenir/, "shopping", "giftshops"],
  [/store|shop/, "shopping", "all"],
];

const GUIDE_RULES = [
  [/halloween|haunt|spooky|pumpkin/, "attractions", "all"],
  [/brunch|breakfast/, "food", "breakfast"],
  [/restaurant|dining|\bfood\b|culinary|\beat\b|dinner|taco|pizza|bbq|seafood|oyster/, "food", "dinner"],
  [/nightlife|cocktail|\bbar\b|date night|speakeasy|\bclub\b/, "nightlife", "bars"],
  [/hotel|resort|\bstay\b|\binn\b|motel/, "hotels", "all"],
  [/shopping|boutique|outlet|\bmall\b/, "shopping", "malls"],
  [/\bkids?\b|family|toddler|children/, "family", "kids"],
  [/beach/, "attractions", "beaches"],
  [/museum|gallery|\bart\b/, "attractions", "museums"],
  [/kayak|tour|boat|manatee|spring|scallop|snorkel|paddle|cruise|biolumin/, "attractions", "tours"],
  [/park|hike|trail|outdoor|wildlife|garden|preserve/, "attractions", "outdoors"],
];

function clean(value) {
  return String(value || "").toLowerCase().trim();
}

function knownSub(category, sub) {
  const list = NAV_SUBCATEGORY_IDS[category];
  if (!list) return "all";
  return list.includes(sub) ? sub : "all";
}

function nav(category, sub, via) {
  if (!NAV_CATEGORY_IDS.includes(category)) return null;
  return { category, sub: knownSub(category, sub || "all"), via: via || "mapped" };
}

function subFromTags(category, tags) {
  const allowed = TAG_SUBS[category] || [];
  const have = new Set((tags || []).map((tag) => clean(tag)));
  return allowed.find((sub) => have.has(sub)) || null;
}

function morningSub(row) {
  const morning = morningDisplayIdentity({
    name: row.name || row.title || "",
    primaryType: row.primary_type || row.primaryType,
    primary_type: row.primary_type || row.primaryType,
    types: row.google_types || row.types || [],
    google_types: row.google_types || row.types || [],
  });
  if (morning === "breakfast") return "breakfast";
  if (morning === "cafe") return "cafes";
  return null;
}

function subFromType(primaryType, types) {
  const blob = [primaryType, ...(types || [])].map(clean).join(" ");
  if (!blob.trim()) return null;
  for (const [pattern, category, sub] of TYPE_SUB) {
    if (pattern.test(blob)) return { category, sub };
  }
  return null;
}

/** A stored place row → { category, sub } on the nav taxonomy, or null. */
export function classifyPlace(row) {
  if (!row) return null;
  const stored = STORED_CATEGORY[clean(row.category)];
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const typed = subFromType(row.primary_type || row.primaryType, row.google_types || row.types);
  if (stored === "attractions" && clean(row.category) === "beach") return nav("attractions", "beaches", "stored");
  if (stored === "food") {
    const morning = morningSub(row);
    if (morning) return nav("food", morning, "morning");
  }
  if (stored) {
    let tagged = subFromTags(stored, tags);
    // The morning classifier already refused this room. A stored breakfast
    // or café tag (McDonald's breakfast menu, a steakhouse Sunday tag) does
    // not put it on that shelf.
    if (stored === "food" && (tagged === "breakfast" || tagged === "cafes")) tagged = null;
    if (tagged) return nav(stored, tagged, "tag");
    if (typed && typed.category === stored) return nav(stored, typed.sub, "type");
    return nav(stored, "all", "stored");
  }
  if (typed) return nav(typed.category, typed.sub, "type");
  return null;
}

/** An event's own category and subcategory → the same nav pair, or null. */
export function classifyEvent(row) {
  if (!row) return null;
  const cat = clean(row.category);
  const sub = clean(row.subcategory);
  const audience = Array.isArray(row.audience) ? row.audience.map(clean).join(" ") : clean(row.audience);
  const blob = `${cat} ${sub} ${audience}`;
  if (!cat) return null;
  if (/market|boutique|outlet|\bmall\b/.test(sub)) return nav("shopping", /mall|outlet/.test(sub) ? "outlets" : "markets", "event");
  if (/bar|crawl|nightlife|party|club|cocktail/.test(sub) || cat === "nightlife") {
    const nightSub = /club/.test(sub) ? "clubs" : /music|concert/.test(sub) ? "music" : "bars";
    return nav("nightlife", nightSub, "event");
  }
  if (/family|kid|toddler|trunk|trick-or-treat|pumpkin|petting|\bfarm\b/.test(blob)) {
    return nav("family", /toddler/.test(blob) ? "toddlers" : "kids", "event");
  }
  if (cat === "music") return nav("nightlife", "music", "event");
  if (cat === "food" || /brunch|breakfast|coffee/.test(sub)) {
    const foodSub = /brunch|breakfast|coffee/.test(sub) ? "breakfast" : /dessert|ice/.test(sub) ? "dessert" : "dinner";
    return nav("food", foodSub, "event");
  }
  if (cat === "tour" || /tour|ghost|cruise|paddle|kayak/.test(sub)) return nav("attractions", "tours", "event");
  if (cat === "sports" || /race|surf|tennis|fitness/.test(sub)) return nav("attractions", "outdoors", "event");
  if (cat === "boating" || /boat|marina/.test(sub)) return nav("attractions", "marinas", "event");
  if (cat === "arts" || cat === "film" || /art|theatre|theater|film|screening/.test(sub)) return nav("attractions", "arts", "event");
  if (["halloween", "holiday", "seasonal", "festival", "community", "motorsports", "aviation"].includes(cat)) {
    const activitySub = /beach/.test(sub) ? "beaches" : /museum/.test(sub) ? "museums" : "all";
    return nav("attractions", activitySub, "event");
  }
  return null;
}

/** A guide (blog post) → the nav pair. A travel piece with no sharper signal is Activities. */
export function classifyGuide(guide) {
  if (!guide || !guide.title) return null;
  const blob = [guide.title, guide.keyword, guide.region, guide.description, ...(guide.relatedKeywords || [])].filter(Boolean).join(" ");
  const text = blob.toLowerCase();
  for (const [pattern, category, sub] of GUIDE_RULES) {
    if (pattern.test(text)) return nav(category, sub, "guide");
  }
  return nav("attractions", "all", "default");
}

const INTENT_TAXONOMY = {
  "things-to-do": { mode: "category", categories: ["attractions"], subs: [], allowGeneral: [], keywords: [], radiusMi: 40, also: [["attractions", "beaches"]] },
  "date-night": { mode: "category", categories: ["nightlife", "food"], subs: ["food:dinner", "nightlife:bars", "nightlife:clubs", "nightlife:music", "nightlife:speakeasy"], allowGeneral: ["food", "nightlife"], keywords: ["romantic", "date"], radiusMi: 30, also: [] },
  // "breakfast" is the category, not a keyword: a fast-food row tagged
  // breakfast would otherwise clear the word check after the morning
  // classifier had already refused it.
  brunch: { mode: "category", categories: ["food"], subs: ["food:breakfast"], allowGeneral: [], keywords: ["brunch"], radiusMi: 30, also: [] },
  halloween: { mode: "text", categories: ["attractions", "nightlife", "family", "food"], subs: [], allowGeneral: [], keywords: ["halloween", "spooky", "haunted"], radiusMi: 80, also: [] },
  family: { mode: "category", categories: ["family"], subs: [], allowGeneral: ["family"], keywords: ["family", "kids"], radiusMi: 40, also: [] },
  rainy: { mode: "category", categories: ["family", "attractions"], subs: ["family:rainy", "attractions:museums"], allowGeneral: [], keywords: ["indoor", "museum"], radiusMi: 40, also: [] },
  nightlife: { mode: "category", categories: ["nightlife"], subs: [], allowGeneral: ["nightlife"], keywords: [], radiusMi: 30, also: [] },
  beaches: { mode: "category", categories: ["attractions"], subs: ["attractions:beaches"], allowGeneral: [], keywords: ["beach"], radiusMi: 40, also: [] },
  budget: { mode: "category", categories: ["food"], subs: ["food:quickbites", "food:lunch", "food:dinner"], allowGeneral: ["food"], keywords: ["cheap"], radiusMi: 30, also: [] },
  events: { mode: "kind", kinds: ["event"], categories: [], subs: [], allowGeneral: [], keywords: [], radiusMi: 80, also: [] },
  guides: { mode: "kind", kinds: ["guide"], categories: [], subs: [], allowGeneral: [], keywords: [], radiusMi: 200, also: [] },
  coupons: { mode: "text", categories: [], subs: [], allowGeneral: [], keywords: ["coupon", "deal"], radiusMi: 40, also: [] },
};

/** What a query is asking for, in the same taxonomy. `mode: "text"` still requires a word match. */
export function taxonomyForQuery(intentId) {
  const row = INTENT_TAXONOMY[intentId];
  if (!row) return { mode: "text", categories: [], subs: [], allowGeneral: [], keywords: [], radiusMi: 140, also: [], kinds: [] };
  return { kinds: [], ...row };
}

export function taxonomyMatches(item, taxonomy) {
  if (!item || !taxonomy || taxonomy.mode !== "category") return false;
  if (!taxonomy.categories.includes(item.category)) return false;
  if (!taxonomy.subs.length) return true;
  if (taxonomy.subs.includes(`${item.category}:${item.sub}`)) return true;
  if (item.sub === "all" && taxonomy.allowGeneral.includes(item.category)) return true;
  return false;
}

/**
 * Weighted coverage. Each record counts as `n` (default 1). A record counts
 * as categorized only when `classify` returns a nav category.
 */
export function coverageOf(records, classify) {
  let total = 0;
  let categorized = 0;
  const by = {};
  const via = {};
  for (const record of records || []) {
    const weight = Number(record && record.n) > 0 ? Number(record.n) : 1;
    total += weight;
    const navHit = classify(record);
    if (!navHit || !navHit.category) continue;
    categorized += weight;
    by[navHit.category] = (by[navHit.category] || 0) + weight;
    const how = navHit.via || "mapped";
    via[how] = (via[how] || 0) + weight;
  }
  return {
    total,
    categorized,
    percent: total ? Math.round((categorized / total) * 1000) / 10 : 0,
    by,
    via,
  };
}
