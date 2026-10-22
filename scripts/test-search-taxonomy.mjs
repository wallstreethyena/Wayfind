// Category coverage and search-card relevance.
// Places and events are the operational census measured 2026-10-22 (category
// counts only — no place names). Guides are the live currentGuides() set.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATEGORY_TILES } from "../lib/categories.js";
import { GUIDES } from "../lib/guides.js";
import { currentGuides } from "../lib/guideLifecycle.js";
import { cardRankScore } from "../lib/searchRank.js";
import { searchResultCards } from "../lib/searchCards.js";
import { NAV_CATEGORY_IDS, NAV_SUBCATEGORY_IDS, classifyPlace, classifyEvent, classifyGuide, coverageOf } from "../lib/searchTaxonomy.js";

const PARRISH = { lat: 27.5859, lng: -82.4254 };
const SARASOTA = { lat: 27.3364, lng: -82.5307 };

assert.deepEqual(NAV_CATEGORY_IDS, CATEGORY_TILES.map((tile) => tile.id), "search categories are the nav tiles");
const subfilterSource = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const subfilterStart = subfilterSource.indexOf("export const SUBFILTERS = {");
const subfilterEnd = subfilterSource.indexOf("export function queryFor");
assert.ok(subfilterStart > 0 && subfilterEnd > subfilterStart, "SUBFILTERS is readable");
const subfilterBody = subfilterSource.slice(subfilterStart, subfilterEnd);
const liveSubs = {};
let currentCat = null;
for (const line of subfilterBody.split("\n")) {
  const cat = line.match(/^  ([a-z]+): \[/);
  if (cat) currentCat = cat[1];
  const id = line.match(/\{\s*id:\s*"([^"]+)"/);
  if (currentCat && id) {
    if (!liveSubs[currentCat]) liveSubs[currentCat] = [];
    liveSubs[currentCat].push(id[1]);
  }
  if (currentCat && /^  \],/.test(line)) currentCat = null;
}
for (const [cat, ids] of Object.entries(NAV_SUBCATEGORY_IDS)) {
  assert.deepEqual(ids, liveSubs[cat], `${cat} subcategories match the nav chips`);
}

// Operational, non-excluded wf_inventory rows by stored category.
const PLACE_CENSUS = [
  { category: "food", n: 10490 },
  { category: "attractions", n: 6057 },
  { category: "nightlife", n: 2488 },
  { category: "shopping", n: 1403 },
  { category: "hotels", n: 706 },
  { category: "beach", n: 212 },
  { category: "Food", n: 3 },
  { category: "Activities", n: 2 },
];
// Scheduled or sold-out wf_events rows by their own category.
const EVENT_CENSUS = [
  { category: "halloween", n: 189 },
  { category: "food", n: 144 },
  { category: "festival", n: 121 },
  { category: "holiday", n: 119 },
  { category: "nightlife", n: 118 },
  { category: "seasonal", n: 96 },
  { category: "arts", n: 69 },
  { category: "music", n: 63 },
  { category: "community", n: 31 },
  { category: "sports", n: 7 },
  { category: "tour", n: 7 },
  { category: "boating", n: 2 },
  { category: "motorsports", n: 2 },
  { category: "aviation", n: 1 },
  { category: "film", n: 1 },
];

const places = coverageOf(PLACE_CENSUS, classifyPlace);
const events = coverageOf(EVENT_CENSUS, classifyEvent);
const guideRows = Object.values(currentGuides(GUIDES)).filter((guide) => guide && guide.title);
const guides = coverageOf(guideRows, classifyGuide);
console.log(`category coverage: places ${places.categorized}/${places.total} = ${places.percent}% ${JSON.stringify(places.by)}`);
console.log(`category coverage: events ${events.categorized}/${events.total} = ${events.percent}% ${JSON.stringify(events.by)}`);
console.log(`category coverage: guides ${guides.categorized}/${guides.total} = ${guides.percent}% via ${JSON.stringify(guides.via)} by ${JSON.stringify(guides.by)}`);
assert.equal(places.percent, 100, "every operational place category maps onto the nav taxonomy");
assert.equal(events.percent, 100, "every scheduled event category maps onto the nav taxonomy");
assert.equal(guides.percent, 100, "every current guide maps onto the nav taxonomy");
assert.ok(guides.via.guide > 0, "guide coverage is not only the attractions default");
for (const id of ["food", "nightlife", "attractions", "hotels", "shopping"]) assert.ok(places.by[id] > 0, `places include ${id}`);

function place(fields) {
  return {
    place_id: fields.id,
    name: fields.name,
    lat: fields.lat,
    lng: fields.lng,
    category: fields.category,
    primary_type: fields.primaryType,
    tags: fields.tags || [],
    signals: { rating: fields.rating, reviews: fields.reviews },
    locality: fields.locality || "",
  };
}

function names(cards) {
  return cards.map((card) => card.name);
}

{
  const result = await searchResultCards({
    query: "things to do",
    ...PARRISH,
    guides: [],
    events: [],
    places: [
      place({ id: "museum", name: "Florida Railroad Museum", lat: 27.60, lng: -82.43, category: "attractions", primaryType: "museum", rating: 4.6, reviews: 900 }),
      place({ id: "hotel", name: "Parrish Inn", lat: 27.58, lng: -82.43, category: "hotels", primaryType: "hotel", rating: 4.9, reviews: 3000 }),
      place({ id: "miami", name: "Miami Science Museum", lat: 25.78, lng: -80.21, category: "attractions", primaryType: "museum", rating: 4.8, reviews: 5000 }),
      place({ id: "beach", name: "Palma Sola Beach", lat: 27.48, lng: -82.62, category: "beach", primaryType: "beach", rating: 4.7, reviews: 600 }),
      place({ id: "far-park", name: "Farther County Park", lat: 27.85, lng: -82.30, category: "attractions", primaryType: "park", rating: 4.6, reviews: 900 }),
    ],
  });
  const got = names(result.cards);
  assert.ok(got.includes("Florida Railroad Museum"), `things to do includes the nearby museum, got ${got.join(" | ")}`);
  assert.ok(got.includes("Palma Sola Beach"), `things to do includes a nearby beach, got ${got.join(" | ")}`);
  assert.ok(!got.includes("Parrish Inn"), "things to do does not return a hotel");
  assert.ok(!got.includes("Miami Science Museum"), "things to do stays inside the city radius");
  assert.ok(got.indexOf("Florida Railroad Museum") < got.indexOf("Farther County Park"), "a nearer equal-quality activity ranks first");
}

{
  const result = await searchResultCards({
    query: "date night",
    ...SARASOTA,
    guides: [],
    events: [],
    places: [
      place({ id: "bistro", name: "Sarasota Bistro", lat: 27.34, lng: -82.53, category: "food", primaryType: "restaurant", tags: ["dinner"], rating: 4.5, reviews: 700 }),
      place({ id: "bar", name: "Gulf Date Bar", lat: 27.33, lng: -82.54, category: "nightlife", primaryType: "bar", tags: ["bars"], rating: 4.6, reviews: 500 }),
      place({ id: "cafe", name: "Morning Coffee", lat: 27.34, lng: -82.53, category: "food", primaryType: "cafe", tags: ["cafes"], rating: 5, reviews: 4000 }),
      place({ id: "mall", name: "Sarasota Mall", lat: 27.34, lng: -82.52, category: "shopping", primaryType: "shopping_mall", rating: 4.4, reviews: 2000 }),
    ],
  });
  const got = names(result.cards);
  assert.ok(got.includes("Sarasota Bistro") && got.includes("Gulf Date Bar"), `date night returns dinner and a bar, got ${got.join(" | ")}`);
  assert.ok(!got.includes("Morning Coffee"), "date night does not return a cafe");
  assert.ok(!got.includes("Sarasota Mall"), "date night does not return shopping");
}

{
  const result = await searchResultCards({
    query: "brunch",
    ...SARASOTA,
    guides: [],
    events: [],
    places: [
      place({ id: "brunch", name: "Sunday Brunch House", lat: 27.34, lng: -82.53, category: "food", primaryType: "brunch_restaurant", tags: ["breakfast"], rating: 4.4, reviews: 320 }),
      place({ id: "bar", name: "Gulf Date Bar", lat: 27.33, lng: -82.54, category: "nightlife", primaryType: "bar", rating: 4.8, reviews: 900 }),
      place({ id: "steak", name: "Steak House", lat: 27.34, lng: -82.53, category: "food", primaryType: "steak_house", tags: ["dinner"], rating: 4.7, reviews: 1500 }),
    ],
  });
  const got = names(result.cards);
  assert.deepEqual(got, ["Sunday Brunch House"], `brunch is the breakfast shelf, got ${got.join(" | ")}`);
}

{
  const result = await searchResultCards({
    query: "brunch",
    ...PARRISH,
    guides: [],
    events: [],
    places: [
      place({ id: "chain", name: "McDonald's", lat: 27.6, lng: -82.45, category: "food", primaryType: "fast_food_restaurant", tags: ["breakfast", "quickbites"], rating: 3.4, reviews: 4000 }),
      place({ id: "keke", name: "Keke's Breakfast Cafe", lat: 27.5, lng: -82.5, category: "food", primaryType: "breakfast_restaurant", tags: ["breakfast"], rating: 4.8, reviews: 3800 }),
      place({ id: "seafood", name: "Walt's Fish Market", lat: 27.33, lng: -82.53, category: "food", primaryType: "seafood_restaurant", rating: 4.6, reviews: 8000 }),
    ],
  });
  const got = names(result.cards);
  assert.deepEqual(got, ["Keke's Breakfast Cafe"], `brunch uses the breakfast identity, got ${got.join(" | ")}`);
}

{
  const result = await searchResultCards({
    query: "date night",
    ...SARASOTA,
    guides: [],
    events: [],
    places: [
      place({ id: "fish", name: "Walt's Fish Market", lat: 27.29, lng: -82.53, category: "food", primaryType: "seafood_restaurant", rating: 4.6, reviews: 8000 }),
      place({ id: "chain", name: "McDonald's", lat: 27.34, lng: -82.53, category: "food", primaryType: "fast_food_restaurant", tags: ["breakfast", "quickbites"], rating: 3.4, reviews: 4000 }),
    ],
  });
  const got = names(result.cards);
  assert.deepEqual(got, ["Walt's Fish Market"], `a restaurant with no meal tag is dinner, got ${got.join(" | ")}`);
}

{
  const result = await searchResultCards({
    query: "halloween",
    ...PARRISH,
    guides: [],
    places: [
      place({ id: "beach", name: "Palma Sola Beach", lat: 27.48, lng: -82.62, category: "beach", primaryType: "beach", rating: 4.9, reviews: 2000 }),
    ],
    events: [{
      event_name: "Halloween on the River",
      slug: "halloween-on-the-river",
      category: "halloween",
      subcategory: "haunted-house",
      place_id: "venue-1",
      venue_name: "River Park",
      rating: 4.6,
      reviews: 400,
      lat: 27.57,
      lng: -82.44,
      primary_type: "park",
      city: "Parrish",
    }],
  });
  const got = names(result.cards);
  assert.ok(got.includes("River Park"), `halloween returns the venue card, got ${got.join(" | ")}`);
  assert.equal(result.cards.find((card) => card.name === "River Park").line, "Halloween on the River");
  assert.ok(!got.includes("Palma Sola Beach"), "halloween does not return an unrelated beach");
}

{
  const result = await searchResultCards({
    query: "manetees",
    ...PARRISH,
    guides: [],
    events: [],
    places: [
      place({ id: "manatee", name: "Crystal River Manatee Center", lat: 28.90, lng: -82.60, category: "attractions", primaryType: "tourist_attraction", rating: 4.7, reviews: 2200, locality: "Crystal River" }),
      place({ id: "cafe", name: "Parrish Coffee", lat: 27.57, lng: -82.44, category: "food", primaryType: "cafe", rating: 4.9, reviews: 800 }),
    ],
  });
  const got = names(result.cards);
  assert.deepEqual(got, ["Crystal River Manatee Center"], `the manatee typo returns the manatee place, got ${got.join(" | ")}`);
}

{
  const near = { title: "County Museum", nav: { category: "attractions", sub: "museums" }, category: "attractions", lat: 27.59, lng: -82.43, rating: 4.6, reviews: 900, keywords: [] };
  const weak = { ...near, title: "County Museum", rating: 3.6, reviews: 12 };
  const strong = { ...near, title: "County Museum", rating: 4.8, reviews: 2500 };
  const ctx = { query: "things to do", city: { lat: PARRISH.lat, lng: PARRISH.lng, slug: "parrish" }, taxonomy: { mode: "category", categories: ["attractions"], subs: [], allowGeneral: [], keywords: [], radiusMi: 40 } };
  assert.ok(cardRankScore(strong, ctx) > cardRankScore(weak, ctx), "higher Wayfind quality ranks above a thin rating at the same distance");
  const far = { ...strong, lat: 27.95, lng: -82.10 };
  assert.ok(cardRankScore(strong, ctx) > cardRankScore(far, ctx), "the same quality ranks nearer first");
  assert.equal(cardRankScore(strong, ctx), cardRankScore({ ...strong, sponsored: true }, ctx), "a commercial flag does not change the score");
}

console.log("test-search-taxonomy: OK");
