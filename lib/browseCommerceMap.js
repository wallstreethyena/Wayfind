// lib/browseCommerceMap.js — WHICH bookable inventory belongs under WHICH browse
// chip, and what to ask for when the local catalogue has none.
//
// ── 2026-08-04: EVERY CATEGORY, NOT JUST ATTRACTIONS ──────────────────────
// Owner: "I want every single Viator deeplink option showing up on my sheets.
// If it's for food give me food tours — match the Viator deeplink option with
// the category the user is searching for. I want this done everywhere."
//
// This map used to cover the ten `attractions` sub-chips and nothing else, so
// the browse rail mounted on three of the seven browse categories (attractions,
// family, hotels). Food, Nightlife, Shopping and Beach had NO bookable rail at
// all — and the food case was the sharpest: 35 food tours sit in wf_experiences
// across 11 markets, and not one of them could surface under a food heading,
// because the harvest tags them `private` or `historical` and the site had no
// way to ask for "food".
//
// Keys are now `category:sub`, because the sub ids collide across categories —
// "all" exists seven times and "family" is both an attractions sub-chip and a
// top-level category. A flat map silently resolved those to whichever entry was
// written last, which is exactly the accidental resolution the rest of this file
// exists to prevent.
//
// ── TWO KINDS OF INVENTORY ────────────────────────────────────────────────
//   catalogs  HARVESTED Viator tags (lib/experiencesData CATEGORIES) — the cron
//             pulled the product under that tag, so it is on the row.
//   concepts  DERIVED categories (lib/experienceConcepts) — matched on the
//             product TITLE, because the ground-truthed tag list has no food,
//             nightlife, shopping or wellness tag at all.
//
// Both are unioned by lib/experiencesServe.filterByChip. Concepts travel with a
// `concept:` prefix so the two namespaces cannot collide.
//
// ── THE RULE THIS FILE HOLDS ──────────────────────────────────────────────
// A chip serves the FULL catalogue only when it says so out loud. `catalogs:
// null` is legal but requires `fullCatalogReason`, so "this chip shows
// everything" is always a reviewed decision and never a fallthrough.
//
// AND COVERAGE IS PER-MARKET, which is why no static map can be right alone.
// The `museums` catalogue holds 25 products in New York, 9 in Orlando and ZERO
// in Sarasota and Clearwater. The map says what BELONGS; the serve layer says
// what EXISTS here; an empty answer falls back to this chip's own `query`.
// Neither half works alone.
//
// SHOPPING AND WELLNESS DELIBERATELY HAVE NO TABLE INVENTORY: measured over the
// full corpus they are 2 products and 1 product respectively. That is not a
// rail. Those chips go straight to a live search, exactly as Spa already did.

import { CATEGORY_BY_KEY } from "./experiencesData.js";
import { CONCEPTS } from "./experienceConcepts.js";

const C = (catalogs, concepts, query, fullCatalogReason) =>
  Object.freeze({
    catalogs: catalogs === null ? null : Object.freeze(catalogs),
    concepts: Object.freeze(concepts || []),
    query,
    ...(fullCatalogReason ? { fullCatalogReason } : {}),
  });

const ALL_REASON = "The All chip IS the unfiltered browse surface — narrowing it would hide inventory the user explicitly asked to see all of.";

// ── 2026-09-07: FOOD SELLS NO GENERIC TOUR (owner repro, live, mobile) ──────
// "Food -> Dinner" rendered, ABOVE the restaurant results:
//   "The Tour and Wine Tasting Experience at Aspirations Winery"
//   "Tampa Riverwalk Street Food by the Bay 3 Hour Walking Food Tour"
// captured via scripts/lib/synthetic/chromium.mjs against
// https://www.gowayfind.com/ at 390x844, geolocated to Tampa
// (27.9506,-82.4572) — GET / -> 200, .wf-place-card rows present
// ("Dracula's Legacy Wine Bar & Bistro Tampa", "Naked Farmer", ...), so the
// surface under test is real, not a soft-404. Network trace: BOTH products
// came back from `/api/experiences?...&cat=concept%3Afood` — the TABLE path,
// not the live-search fallback.
//
// THIS IS NOT A REGEX-TUNING BUG. scripts/test-experience-concepts.mjs
// already asserted, on purpose, that
// conceptsFor("Tampa Riverwalk Street Food by the Bay 3 Hour Walking Food
// Tour") === ["food"] — the SAME product the owner's screenshot shows. The
// `food` CONCEPT (lib/experienceConcepts.js) is working exactly as designed:
// it answers "does this Viator TOUR involve food or drink" — a fact about a
// multi-stop, guided, transportation-and-a-guide ACTIVITY (a winery tour, a
// walking food crawl, a kayak-and-tasting excursion). Every Food sub-chip,
// including all five meal dayparts (Breakfast/Cafés/Lunch/Dinner/Quick
// bites), answers a different question: "where do I go to EAT [X] right
// now". Viator sells zero restaurant reservations — nothing in the `food`
// concept's corpus is ever a place a reader can walk into and order a meal
// (lib/foodTours.js's own header: "every one of the 20 matches ... is a
// genuine food or drink TOUR") — so membership in that concept, however
// precisely the title matches, is definitionally the WRONG CLASS of
// inventory for an eat-intent chip. No title pattern can fix a category
// error; the chip was asking Viator the wrong question.
//
// THE LINE, DRAWN EXPLICITLY: a Viator product may earn a place under Food
// again the day it is a genuinely RESTAURANT-SPECIFIC offer — a named
// venue's own bookable seating (a chef's-table dinner, a reservation-linked
// tasting menu at one address) — rather than a guided, multi-stop TOUR that
// merely passes through food or drink. Nothing in the current corpus clears
// that bar. Until a real one exists, Food carries NO Viator experience rail
// at all — table AND live search, both closed by `noExperiences` below —
// mirroring the Hotels rule two sections down ("Viator does not sell
// lodging"). The tours themselves are not deleted from the site: they keep
// their honest home under `attractions:tours` ("every Viator product is a
// guided tour ... genuinely belongs under Tours").
//
// Keyed by top-level browse CATEGORY, not by sub-chip — the defect is that
// Food is the wrong CATEGORY for this inventory, not that one daypart picked
// badly. scripts/check-food-no-tour-rail.mjs holds this line and was
// red-proved against the pre-fix code (git stash) before this comment was
// written.
export const NO_TOUR_COMMERCE = Object.freeze({
  food: "Viator sells guided tours and activities, never a restaurant seat — the `food` concept matches multi-stop TOURS that merely involve food or drink, which is a different CLASS of thing than a place to eat a meal. See the 2026-09-07 comment above this constant for the measured Tampa repro.",
});

export const CHIP_COMMERCE = Object.freeze({
  // ── ATTRACTIONS ─────────────────────────────────────────────────────────
  "attractions:all": C(null, [], "top attractions and experiences", ALL_REASON),
  "attractions:themeparks": C(["theme"], ["family"], "theme park tickets"),
  "attractions:outdoors": C(["nature", "adventure", "kayaking"], [], "outdoor and nature experiences"),
  "attractions:beaches": C(["water", "parasailing"], [], "beach water sports and boat trips"),
  "attractions:museums": C(["museums"], [], "museum and gallery tickets"),
  "attractions:family": C(["theme"], ["family"], "family attractions and theme parks"),
  // Every Viator product is a guided tour or experience, so the whole catalogue
  // genuinely belongs here. Declared, not inherited.
  "attractions:tours": C(null, [], "guided sightseeing tours", "Every Viator product is a guided tour or experience, so the whole catalogue genuinely belongs under Tours."),
  // wellness is a REAL concept (lib/experienceConcepts) but measures ONE product
  // corpus-wide, so it is deliberately not wired to the table — a rail with a
  // single Chicago massage in it is worse than an honest live search.
  "attractions:spa": C([], [], "spa and wellness"),
  "attractions:landmarks": C(["historical"], ["sightseeing"], "landmarks and monuments"),
  "attractions:arts": C(["museums"], [], "art galleries and theater"),
  "attractions:marinas": C(["water"], [], "boat charters and marina tours"),

  // ── FOOD ────────────────────────────────────────────────────────────────
  // 2026-08-04's mandate ("if it's for food give me food tours") wired every
  // sub-chip to the derived `food` concept (35 products, 11 markets) — see the
  // NO_TOUR_COMMERCE comment above for why that shipped a wine-tasting tour
  // and a Riverwalk walking tour ABOVE the restaurant results under Dinner,
  // measured live 2026-09-07. `concepts: []` below is that reversal: Food
  // asks Viator for NOTHING now, and `noExperiences` in chipCommerce() (see
  // NO_TOUR_COMMERCE) stops the live-search fallback too, so an empty concepts
  // array here can never quietly turn into a live tour search the way
  // catalogParam===null does for every other category. The `query` strings
  // are left in place, inert but documented, for the day a genuinely
  // restaurant-specific offer (OpenTable, a named venue's own seating) needs
  // exactly this per-daypart wiring back.
  "food:all": C([], [], "food and drink tours"),
  "food:breakfast": C([], [], "breakfast and brunch food tour"),
  "food:cafes": C([], [], "coffee and cafe tasting tour"),
  "food:lunch": C([], [], "lunch food tour"),
  "food:dinner": C([], [], "dinner and food tasting tour"),
  "food:quickbites": C([], [], "street food and food crawl"),
  "food:delivery": C([], [], "food tasting experiences"),
  "food:dessert": C([], [], "dessert and chocolate tasting tour"),

  // ── NIGHTLIFE ───────────────────────────────────────────────────────────
  "nightlife:all": C([], ["nightlife"], "bar crawls and night tours"),
  "nightlife:bars": C([], ["nightlife"], "bar crawl and pub tour"),
  "nightlife:clubs": C([], ["nightlife"], "nightclub and party experiences"),
  "nightlife:speakeasy": C([], ["nightlife"], "speakeasy and cocktail tour"),
  "nightlife:karaoke": C([], ["nightlife"], "nightlife and evening entertainment"),
  "nightlife:sports": C([], ["nightlife"], "sports bar and game day experiences"),
  "nightlife:music": C([], ["nightlife"], "live music and evening tours"),

  // ── BEACH ───────────────────────────────────────────────────────────────
  "beach:all": C(["water", "parasailing"], [], "beach water sports and boat trips"),
  "beach:beaches": C(["water", "parasailing"], [], "beach water sports and boat trips"),

  // ── FAMILY (top-level category) ─────────────────────────────────────────
  "family:all": C(["theme"], ["family"], "family attractions and theme parks"),
  "family:toddlers": C(["theme"], ["family"], "toddler friendly attractions"),
  "family:kids": C(["theme"], ["family"], "family attractions and theme parks"),
  "family:adults": C(["adventure"], ["sightseeing"], "adult friendly tours and experiences"),
  "family:rainy": C(["museums", "theme"], [], "indoor attractions and museums"),

  // ── SHOPPING ────────────────────────────────────────────────────────────
  // The `shopping` concept measures TWO products corpus-wide. Same call as
  // wellness: defined and measured, deliberately not wired. Live search only.
  "shopping:all": C([], [], "shopping tours and outlets"),
  "shopping:malls": C([], [], "shopping mall tours"),
  "shopping:boutiques": C([], [], "boutique shopping tour"),
  "shopping:markets": C([], [], "local market tour"),
  "shopping:outlets": C([], [], "outlet shopping tour"),
  "shopping:giftshops": C([], [], "souvenir and gift shopping"),

  // ── HOTELS ──────────────────────────────────────────────────────────────
  // Viator does not sell lodging. These chips carry the DEALS rail (theme-park
  // hotel packages) rather than experience inventory, so they declare no
  // catalogues and no concepts — an experience rail here would be off-topic.
  "hotels:all": C([], [], "city passes and attraction bundles"),
  "hotels:luxury": C([], [], "luxury experiences and private tours"),
  "hotels:budget": C([], [], "affordable attraction tickets"),
  "hotels:beach": C([], [], "beach water sports and boat trips"),
  "hotels:boutique": C([], [], "local experiences and city tours"),
});

const FALLBACK_KEY = "attractions:all";

/**
 * Resolve a browse chip to its commerce plan.
 *
 * @param {string} cat  the top-level browse category (SUBFILTERS key)
 * @param {string} sub  the active sub-chip id
 * @returns {{key:string, catalogs:string[]|null, concepts:string[], catalogParam:string|null, query:string, fullCatalog:boolean, known:boolean, noExperiences:boolean}}
 *
 * catalogParam is what to send as /api/experiences?cat= — "all" for the full
 * catalogue, a comma-joined key list otherwise, or NULL when the chip has no
 * table inventory at all. A null catalogParam means DO NOT CALL the table; an
 * empty string would be read as "all" by the route's `|| "all"` default, which
 * is the silent widening this module exists to prevent.
 *
 * noExperiences is a STRONGER statement than catalogParam===null. A null
 * catalogParam still means "this ONE chip has no local rows, try a live
 * search with its own honest query text" (the Spa/Shopping pattern) — the
 * CONCEPT or CATALOGUE is still the right kind of thing to ask Viator for,
 * coverage is just thin here. noExperiences means the caller must not even
 * try the live search, because the entire CATEGORY sells no bookable
 * experience at all (see NO_TOUR_COMMERCE) — asking Viator anything, table or
 * freetext, only ever returns the wrong CLASS of product. UnifiedBrowseCommerceRail
 * (app/home.js) checks this before either path runs.
 */
export function chipCommerce(cat, sub) {
  const catKey = String(cat || "attractions");
  const key = `${catKey}:${String(sub || "all")}`;
  const known = Object.prototype.hasOwnProperty.call(CHIP_COMMERCE, key);
  const spec = CHIP_COMMERCE[key] || CHIP_COMMERCE[FALLBACK_KEY];
  const noExperiences = Object.prototype.hasOwnProperty.call(NO_TOUR_COMMERCE, catKey);
  if (spec.catalogs === null) {
    return { key, catalogs: null, concepts: [], catalogParam: "all", query: spec.query, fullCatalog: true, known, noExperiences };
  }
  // Only keys that are REAL survive. A typo would otherwise filter to zero and
  // read as "no local inventory", which is a lie the guard cannot see from
  // outside.
  const catalogs = spec.catalogs.filter((k) => CATEGORY_BY_KEY[k]);
  const concepts = spec.concepts.filter((k) => CONCEPTS[k]);
  const parts = [...catalogs, ...concepts.map((k) => `concept:${k}`)];
  return {
    key,
    catalogs,
    concepts,
    catalogParam: parts.length ? parts.join(",") : null,
    query: spec.query,
    fullCatalog: false,
    known,
    noExperiences,
  };
}

/** The live-Viator search text for a chip in a city. Never a taxonomy key. */
export function chipSearchQuery(cat, sub, city) {
  const q = chipCommerce(cat, sub).query;
  return city ? `${city} ${q}` : q;
}
