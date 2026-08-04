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

export const CHIP_COMMERCE = Object.freeze({
  // ── ATTRACTIONS ─────────────────────────────────────────────────────────
  "attractions:all": C(null, [], "top attractions and experiences", ALL_REASON),
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
  // The headline of this change. Viator has no food TAG, so every one of these
  // rides the derived `food` concept (35 products, 11 markets). The sub-chips
  // share that inventory and differ in their live-search text, because Viator
  // does not sell "a breakfast tour" as a distinct catalogue — asking it for one
  // is how a market with no food inventory still gets something food-shaped.
  "food:all": C([], ["food"], "food and drink tours"),
  "food:breakfast": C([], ["food"], "breakfast and brunch food tour"),
  "food:cafes": C([], ["food"], "coffee and cafe tasting tour"),
  "food:lunch": C([], ["food"], "lunch food tour"),
  "food:dinner": C([], ["food"], "dinner and food tasting tour"),
  "food:quickbites": C([], ["food"], "street food and food crawl"),
  "food:delivery": C([], ["food"], "food tasting experiences"),
  "food:dessert": C([], ["food"], "dessert and chocolate tasting tour"),

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
 * @returns {{key:string, catalogs:string[]|null, concepts:string[], catalogParam:string|null, query:string, fullCatalog:boolean, known:boolean}}
 *
 * catalogParam is what to send as /api/experiences?cat= — "all" for the full
 * catalogue, a comma-joined key list otherwise, or NULL when the chip has no
 * table inventory at all. A null catalogParam means DO NOT CALL the table; an
 * empty string would be read as "all" by the route's `|| "all"` default, which
 * is the silent widening this module exists to prevent.
 */
export function chipCommerce(cat, sub) {
  const key = `${String(cat || "attractions")}:${String(sub || "all")}`;
  const known = Object.prototype.hasOwnProperty.call(CHIP_COMMERCE, key);
  const spec = CHIP_COMMERCE[key] || CHIP_COMMERCE[FALLBACK_KEY];
  if (spec.catalogs === null) {
    return { key, catalogs: null, concepts: [], catalogParam: "all", query: spec.query, fullCatalog: true, known };
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
  };
}

/** The live-Viator search text for a chip in a city. Never a taxonomy key. */
export function chipSearchQuery(cat, sub, city) {
  const q = chipCommerce(cat, sub).query;
  return city ? `${city} ${q}` : q;
}
