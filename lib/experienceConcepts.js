// lib/experienceConcepts.js — DERIVED categories for cached Viator products.
//
// WHY THIS EXISTS. The harvest cron (app/api/cron/experiences) pulls
// destination × TAG, so a product's categories[] is simply "which tag pull found
// it". The ground-truthed tag list in lib/experiencesData.js CATEGORIES has
// eleven entries — kayaking, parasailing, private, historical, water, walking,
// theme, museums, adventure, airboat, nature — and NO tag for food, nightlife,
// shopping or wellness. So products in those concepts are invisible to every
// category filter the site has, even though we already hold them.
//
// Measured with THESE EXACT PATTERNS over the full 1,242-row corpus (paginated;
// PostgREST caps at 1000 and a first pass undercounted because of it):
//
//     concept       products   cities
//     sightseeing        169       12
//     food                35       11
//     nightlife           28        7
//     family              27        8
//     shopping             2        2   <- not inventory
//     wellness             1        1   <- not inventory
//
//     253 / 1242 products (20%) are reachable by at least one concept.
//
// A LOOSER FIRST DRAFT SCORED HIGHER AND WAS WORSE. It reported food 57 and
// wellness 11 by matching bare "beer", bare "market" and bare "spa" — which also
// matched "Beer Can Island" (a sandbar), "Market Street" and any title with
// "spa" inside another word. The numbers above are what survives requiring the
// word to name the ACTIVITY. Lower and true beats higher and wrong; the whole
// point of this file is that a product appears under a heading it belongs to.
//
// SHOPPING AND WELLNESS ARE DELIBERATELY NOT WIRED TO THE TABLE. Two products
// and one product are not a rail. lib/browseCommerceMap.js sends those chips
// straight to a live search instead, the same way the Spa chip already works —
// an honest empty beats a rail with one Chicago massage in it.
//
// lib/foodTours.js reached the same conclusion for food alone and said the
// long-term fix was a tag in the harvest. This is the general form of that fix,
// minus the part that needs new Viator tag IDs: it classifies rows we ALREADY
// hold, so it ships without a re-harvest and without inventing a tag id nobody
// has verified. Adding real tags to the cron deepens the pool later; it is not a
// prerequisite for surfacing what is already here.
//
// ── HOW THESE MATCHERS ARE ALLOWED TO BE WRONG ────────────────────────────
// A title matcher is a heuristic, and the honest failure direction is to miss a
// product rather than to mis-file one. A food tour that does not surface costs
// us a click. A boat charter surfacing under "Breakfast" is the spa-shows-kayak-
// tours complaint again, which costs trust. So every pattern below is anchored
// on words that name the ACTIVITY, never on incidental scenery:
//
//   • "beer" alone matches "Beer Can Island" (a sandbar, not a brewery), so the
//     beer token requires a drink context — brewery/beer tasting/beer tour.
//   • "market" alone matches "Market Street", so shopping requires
//     "market tour" / "shopping tour" / outlet / boutique.
//   • "club" alone matches "Yacht Club" and "Beach Club", so nightlife requires
//     nightclub / club crawl / a crawl or night-tour phrase.
//
// Every count above was produced by running these exact patterns over the real
// corpus, not estimated. scripts/test-experience-concepts.mjs re-runs them
// against fixtures drawn from real titles, including the traps named here.

/**
 * key → { label, test(title), query }
 *
 * `query` is the human search text used when the local corpus has nothing for
 * this concept in this market — the same contract lib/browseCommerceMap.js
 * holds for chips, so an empty market asks Viator for something a person would
 * type rather than for a taxonomy key.
 */
export const CONCEPTS = Object.freeze({
  food: Object.freeze({
    label: "Food & drink",
    query: "food and drink tours",
    rx: /\b(food tour|food and wine|culinary|tasting tour|wine tasting|winery|wineries|vineyard|brewery|breweries|beer tasting|beer tour|distiller|cocktail|mixolog|chef|dining experience|gastronom|foodie|tapas|progressive dinner|farmers market tour|chocolate|bakery|patisserie|dessert tour|coffee tour|food crawl|eat like a local|street food|dinner cruise|lunch cruise|brunch)\b/i,
  }),
  nightlife: Object.freeze({
    label: "Nightlife",
    query: "bar crawls and night tours",
    rx: /\b(bar crawl|pub crawl|club crawl|nightclub|nightlife|night tour|after dark|speakeasy|ghost tour|haunted|night walking tour|evening walking tour)\b/i,
  }),
  family: Object.freeze({
    label: "Family",
    query: "family friendly attractions and tickets",
    rx: /\b(family|kid.friendly|for kids|children|petting zoo|dinosaur|water park|theme park|legoland|peppa|aquarium|zoo)\b/i,
  }),
  shopping: Object.freeze({
    label: "Shopping",
    query: "shopping tours and outlets",
    rx: /\b(shopping tour|shopping pass|shop and sip|outlet|boutique tour|market tour|souvenir)\b/i,
  }),
  wellness: Object.freeze({
    label: "Spa & wellness",
    query: "spa and wellness experiences",
    rx: /\b(spa|massage|wellness|yoga|thermal bath|hot spring|sauna|hammam|meditation retreat)\b/i,
  }),
  sightseeing: Object.freeze({
    label: "Sightseeing",
    query: "sightseeing and city tours",
    rx: /\b(sightseeing|city tour|hop.?on hop.?off|trolley|segway|bike tour|walking tour|guided tour|city pass|observation deck)\b/i,
  }),
});

export const CONCEPT_KEYS = Object.freeze(Object.keys(CONCEPTS));

/** True when a product title belongs to `key`. Unknown key → false, never true. */
export function isConcept(key, title) {
  const c = CONCEPTS[key];
  if (!c) return false;
  return c.rx.test(String(title || ""));
}

/** Every concept a title belongs to (a product can be food AND sightseeing). */
export function conceptsFor(title) {
  const t = String(title || "");
  return CONCEPT_KEYS.filter((k) => CONCEPTS[k].rx.test(t));
}

/** The human search phrase for a concept, or null. Never a taxonomy key. */
export function conceptQuery(key) {
  const c = CONCEPTS[key];
  return c ? c.query : null;
}

// ── SUB-CHIP AFFINITY ─────────────────────────────────────────────────────
// A concept is one pool: every Food sub-chip draws from the same 35 food tours,
// because Viator does not sell "a dessert catalogue". So `food:dessert` served
// the identical list as `food:all`, and its dessert-specific search text only
// ever fired in a market with NO food inventory — i.e. exactly when it could not
// help. The owner ask is that the deeplink match the category the user is
// searching for, and at sub-chip level it did not.
//
// This is an ORDER-ONLY, BOUNDED bonus, the same shape as discountDepthBonus and
// timeOfDayBonus in lib/experienceNowRank.js — NOT a filter. Two reasons it must
// not filter: a market with three food tours and no dessert tour would render an
// empty Dessert rail while holding relevant inventory, and the owner asked for
// ranking "from highest score", which a filter would override outright.
//
// The cap is deliberately small. A dessert tour edges past an EQUALLY-rated
// generic food tour; it cannot leapfrog a clearly better one. Same discipline as
// the monetization boost: money and relevance break near-ties, merit still wins.
const SUB_AFFINITY = Object.freeze({
  "food:breakfast": /\b(breakfast|brunch|morning)\b/i,
  "food:cafes": /\b(coffee|cafe|espresso|roaster)\b/i,
  "food:lunch": /\b(lunch|midday)\b/i,
  "food:dinner": /\b(dinner|evening|supper|progressive)\b/i,
  "food:quickbites": /\b(street food|food crawl|bites|tapas|market)\b/i,
  "food:dessert": /\b(dessert|chocolate|bakery|patisserie|sweet|ice cream|gelato)\b/i,
  "nightlife:bars": /\b(bar crawl|pub crawl|pub|bar)\b/i,
  "nightlife:clubs": /\b(nightclub|club crawl|party)\b/i,
  "nightlife:speakeasy": /\b(speakeasy|cocktail|mixolog)\b/i,
  "nightlife:music": /\b(music|jazz|live band|concert)\b/i,
  "family:toddlers": /\b(toddler|preschool|little ones)\b/i,
  "family:kids": /\b(kid|child|family)\b/i,
  "attractions:arts": /\b(art|gallery|theater|theatre|mural)\b/i,
});

/** Cap on the affinity nudge, on the same ~0-10 scale as the experience score. */
export const AFFINITY_CAP = 0.5;

/**
 * Order-only relevance nudge for a product under a specific sub-chip.
 * Returns 0 when the chip declares no affinity, or the title does not match.
 * NEVER negative, never larger than AFFINITY_CAP — so it can reorder near-ties
 * and nothing else.
 */
export function chipAffinityBonus(cat, sub, title) {
  const rx = SUB_AFFINITY[`${String(cat || "")}:${String(sub || "")}`];
  if (!rx) return 0;
  return rx.test(String(title || "")) ? AFFINITY_CAP : 0;
}
