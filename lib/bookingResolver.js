// Booking-CTA integrity, Phase 2 (see BOOKING_INTEGRITY_DIAGNOSIS.md). Scores
// a candidate Viator product against a place; never itself decides "live" —
// callers must pass the result through lib/verifiedOffers.js's hard
// invariant. Replaces the old "any product mentioning the city passes"
// filter (the Bradenton Riverwalk false positive) with four scored signals.
import { buildVerifiedOffer, isLiveEligible } from "./verifiedOffers.js";

const STOP = new Set([
  "the", "a", "an", "and", "of", "at", "in", "on", "park", "trail", "beach",
  "walk", "area", "state", "county", "city", "point", "landing", "preserve",
  "reserve", "national", "public",
]);

// v2 (booking-integrity): words too generic to prove a product is about THIS
// specific place. Without this, a "Houston Museum of Natural Science" product
// matched a "Bishop Museum of Science and Nature" on museum/science/nature and
// bought false place-specific identity. A generic word is never distinctive.
const GENERIC = new Set([
  "tour", "tours", "ticket", "tickets", "admission", "entry", "pass", "passes", "experience",
  "experiences", "attraction", "attractions", "sightseeing", "museum", "gallery", "exhibit",
  "collection", "science", "art", "arts", "history", "nature", "natural", "garden", "gardens",
  "botanical", "zoo", "aquarium", "wildlife", "river", "riverwalk", "walk", "waterfront", "bay",
  "boat", "cruise", "kayak", "paddle", "beach", "shore", "island", "scenic", "overlook", "historic",
  "landmark", "monument", "show", "theater", "theatre", "park", "preserve", "reserve", "trail",
]);

function tokenize(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length >= 3);
}

function regionTokensOf(region) {
  return tokenize(region).filter((t) => t.length >= 4);
}

// Tokens that are actually distinctive to this place, i.e. not just a
// repeat of the city/region name. "Bradenton Riverwalk" in region
// "Bradenton" keeps only "riverwalk" -- a product that mentions only
// "Bradenton" earns zero entity credit, which is the exact false positive
// this resolver exists to kill.
function distinctiveTokens(placeName, region) {
  const cityToks = new Set(regionTokensOf(region));
  return tokenize(placeName).filter((t) => !STOP.has(t) && !GENERIC.has(t) && !cityToks.has(t));
}

// 0..1: fraction of the place's distinctive name tokens that appear in the
// product title. A place whose name has NO distinctive token beyond the
// city/region (so nothing to prove against) scores 0 -- indistinct names
// can never clear the entity floor, by design.
function entityMatch(placeName, region, productTitle) {
  const dist = distinctiveTokens(placeName, region);
  if (!dist.length) return 0;
  // Exact TOKEN equality, not substring. A distinctive token that is only a
  // SUBSTRING of a product-title word must NOT count: for a place whose one
  // distinctive token is a substring of its own region name (Braden River Park
  // -> "braden" ⊂ "bradenton"; The Land -> "land" ⊂ "orlando" — the only 2 such
  // places in 2,474, Cowork full-inventory sim 2026-07-17), a generic
  // "{City} City Sightseeing Tour" otherwise earned a FULL entity match and
  // cleared every gate. Tokenizing the title first makes "braden" != "bradenton".
  const titleToks = new Set(tokenize(productTitle));
  const hits = dist.filter((t) => titleToks.has(t)).length;
  if (!hits) return 0; // ZERO distinctive tokens matched -> not this place (B2 gate leans on this)
  // v5.97 recall fix: don't punish a genuine match for every extra token in a LONG
  // place name. A product titled with a shorter form of the place ("Mote Aquarium"
  // for "Mote Marine Laboratory & Aquarium", em was 2/4=0.50 -> 0.675 conf ->
  // wrongly suppressed) is still about THAT place. Diminishing penalty for unmatched
  // tokens: match k of many -> k/(k+1) (0.5, 0.67, 0.75, ...); a FULL match stays 1;
  // ZERO stays 0. Precision is still held by the entity FLOOR, specificity (fan-out),
  // and the foreign-destination gate — this only lifts multi-token partials.
  return hits / Math.min(dist.length, hits + 1);
}

const CATEGORY_WORDS = {
  museum: ["museum", "exhibit", "gallery", "collection"],
  wildlife: ["wildlife", "zoo", "aquarium", "sanctuary", "safari", "animal"],
  entertainment: ["show", "theater", "theatre", "performance", "concert"],
  scenic: ["scenic", "sunset", "overlook", "view"],
  beach: ["beach", "shore", "coast", "island"],
  nature: ["nature", "eco", "hike", "trail", "garden", "botanical"],
  landmark: ["landmark", "historic", "monument", "heritage"],
  waterfront: ["river", "bay", "waterfront", "cruise", "boat", "kayak", "paddle"],
};

// 0..1: does the product title use vocabulary consistent with the place's
// category? Unknown/unlisted kinds are neutral (0.5) rather than penalized,
// since this is a corroborating signal, not a standalone gate.
function categoryMatch(kind, productTitle) {
  const words = CATEGORY_WORDS[kind];
  if (!words || !words.length) return 0.5;
  const hay = String(productTitle || "").toLowerCase();
  return words.some((w) => hay.includes(w)) ? 1 : 0;
}

// 0..1: 1 / fan-out. A product that has already matched many distinct
// places is a generic bundled/area tour, not a place-specific product.
// fanoutCount is supplied by the caller (backed by the verified_offers
// store's distinct-place-per-product count); callers without store access
// omit it, which reads as fanout=1 -- missing data is not penalized.
function specificity(fanoutCount) {
  const n = Math.max(1, Number(fanoutCount) || 1);
  return 1 / n;
}

// NOT SCORED in v1. Viator's freetext search response -- the fields this
// codebase parses (title, productUrl, productCode, images, reviews,
// pricing, duration) -- does not surface product geocoordinates, and
// guessing an unconfirmed field name would be worse than being explicit
// about the gap. Contributes a neutral 0.5 so its absence neither helps nor
// hurts a candidate. Wire in a real distance check here once a geocoded
// field is confirmed against Viator's partner docs or support.
function geoMatch() {
  return 0.5;
}

// v2 (booking-integrity): POSITIVE geography. The old geoMatch was a no-op and the
// only geo protection was a Florida-only blacklist (FOREIGN_DESTINATIONS), so a
// Barcelona / Houston / San Antonio product passed unchecked. geoConfirms requires
// a significant (>=4-char) region token to actually appear in the product title or
// URL. A MISSING region has no tokens -> returns false -> the hard gate in
// verifiedOffers fails CLOSED (no guess). This is a whitelist, not a blacklist:
// only products that positively name the place's own region can be "live".
function geoConfirms(region, product) {
  const toks = regionTokensOf(region); // [] when region missing -> fail closed
  if (!toks.length) return false;
  const hay = (((product && product.title) || "") + " " + ((product && (product.productUrl || product.url)) || "")).toLowerCase();
  return toks.some((t) => hay.includes(t));
}

// v5.83 (B2 region gate): high-precision, multi-word-where-possible names of
// destinations distinct enough that a product titled after one is about THAT
// place, not the user's. This closes the "Key West tour on a Siesta Key place"
// leak: when the region string absorbs the place's own name (locality "Siesta
// Key"), the only distinctive token left is the generic "key", which a "Key
// West" product matches and so buys false place-specific credit. Rather than
// blunt the entity score (which would also kill the legit "Siesta Key Kayak
// Tour"), we detect the foreign destination by name and hard-reject.
const FOREIGN_DESTINATIONS = [
  "key west", "key largo", "florida keys", "islamorada", "duval street",
  "miami", "south beach", "miami beach", "biscayne", "wynwood",
  "orlando", "walt disney", "disney world", "universal studios", "universal orlando", "kissimmee", "seaworld", "sea world",
  "tampa", "ybor city", "busch gardens",
  "clearwater", "st petersburg", "st. petersburg", "saint petersburg",
  "naples", "marco island", "fort myers", "sanibel", "captiva",
  "cocoa beach", "kennedy space", "cape canaveral",
  "st augustine", "st. augustine", "saint augustine", "daytona", "jacksonville", "amelia island",
  "fort lauderdale", "west palm", "palm beach", "boca raton",
  "everglades", "crystal river", "homosassa",
];

// True when the product title names a well-known destination that is NOT in the
// place's region, AND does not also name the local region. The second half
// keeps a legitimate "Sarasota to Key West day trip" (departs locally) while
// gating a bare "Key West Sunset Cruise" shown on a Sarasota-area place. This is
// evidence for the HARD gate in lib/verifiedOffers.js isLiveEligible, not a soft
// geo weight — a generic geographic token must never earn a wrong-destination
// product a booking CTA.
function namesForeignDestination(region, productTitle) {
  const title = String(productTitle || "").toLowerCase();
  if (!title) return false;
  const reg = String(region || "").toLowerCase();
  // Significant region tokens (length >= 4, so the generic "key" is excluded).
  if (regionTokensOf(region).some((t) => title.includes(t))) return false; // names our own region -> keep
  for (const d of FOREIGN_DESTINATIONS) {
    if (title.includes(d) && !reg.includes(d)) return true;
  }
  return false;
}

const WEIGHTS = { entity: 0.55, category: 0.15, specificity: 0.2, geo: 0.1 };

// Multiple distinct products can be scored together in one call (the
// /api/viator/tours list, or /api/viator/go's short candidate set), and
// each one has its OWN fan-out history -- a single scalar fanoutCount would
// wrongly apply one product's genericness to every other candidate. Callers
// scoring more than one candidate should pass fanoutByCode (an object keyed
// by productCode/productUrl -> distinct-place count); opts.fanoutCount
// remains a same-value-for-every-candidate fallback for the common single-
// candidate case (and for tests).
function fanoutFor(product, opts) {
  const key = (product && (product.productCode || product.code || product.productUrl || product.url)) || "";
  if (opts.fanoutByCode && key && Object.prototype.hasOwnProperty.call(opts.fanoutByCode, key)) return opts.fanoutByCode[key];
  return opts.fanoutCount;
}

export function scoreCandidate(place, product, opts = {}) {
  const region = opts.region || "";
  const kind = opts.kind || null;
  const em = entityMatch(place && place.name, region, product && product.title);
  const cm = categoryMatch(kind, product && product.title);
  const sp = specificity(fanoutFor(product, opts));
  const gm = geoMatch();
  const geoMismatch = namesForeignDestination(region, product && product.title);
  const geoConfirmed = geoConfirms(region, product);
  const confidence = em * WEIGHTS.entity + cm * WEIGHTS.category + sp * WEIGHTS.specificity + gm * WEIGHTS.geo;
  return {
    confidence: Math.round(confidence * 1000) / 1000,
    evidence: { entityMatch: em, categoryMatch: cm, specificity: sp, geoMatch: gm, geoMismatch, geoConfirmed, fanoutCount: Math.max(1, Number(fanoutFor(product, opts)) || 1) },
  };
}

// Highest-scored candidate, or null. Ties and non-clearing scores break
// toward null -- this function never guesses.
export function pickBest(place, products, opts = {}) {
  let best = null;
  for (const p of products || []) {
    if (!p || !p.title || !(p.productUrl || p.url)) continue;
    const { confidence, evidence } = scoreCandidate(place, p, opts);
    // A foreign-destination product can never be live (isLiveEligible hard-
    // rejects it), so it must not win "best" over a legitimate lower-scored
    // local product and turn the whole resolution into a no-CTA.
    if (evidence.geoMismatch) continue;
    if (!best || confidence > best.confidence) best = { product: p, confidence, evidence };
  }
  return best;
}

function toOffer(place, product, confidence, evidence, opts) {
  const offer = buildVerifiedOffer({
    placeId: opts.placeId || (place && place.id) || "",
    placeName: (place && place.name) || null,
    region: opts.region || null,
    kind: opts.kind || null,
    productProvider: "viator",
    productCode: product.productCode || product.code || null,
    productUrl: product.productUrl || product.url || null,
    // Every productUrl returned by the partner search endpoint already
    // carries our pid attribution -- see lib/affiliates.js withViatorTracking.
    commissionable: true,
    // KNOWN GAP: Viator's freetext search returns generally-sellable
    // products, but this codebase has no separate availability-check call,
    // so "bookable now" is inferred from appearing in search results, not
    // independently confirmed. A real availability call (if Viator's API
    // exposes one) belongs in the Phase 4 re-verification cron, not here.
    bookableNow: true,
    confidence,
    evidence,
  });
  return offer;
}

// End-to-end: scores every candidate and returns a VerifiedOffer ONLY if it
// clears the hard invariant (lib/verifiedOffers.js) -- otherwise null. This
// is the single function API routes should call for a "one exact product"
// resolution; nothing downstream needs to re-implement the threshold check.
// v2 (booking-integrity): resolve through the independently-gated list, and REFUSE
// to guess when the top two live candidates are within AMBIGUITY_EPS of each other
// (two plausible products -> no single "exact" answer -> no CTA). Each candidate is
// already geo-gated + entity-gated by isLiveEligible, so this only chooses among
// genuinely-eligible products.
const AMBIGUITY_EPS = 0.05;
export function resolveVerified(place, products, opts = {}) {
  const live = resolveVerifiedMany(place, products, opts); // each independently gated, sorted desc
  if (!live.length) return null;
  if (live.length >= 2 && (live[0].confidence - live[1].confidence) < AMBIGUITY_EPS) return null;
  return live[0];
}

// Same scoring, but for surfaces that render several candidates at once
// (the "Book tours & experiences" card list): every candidate is scored and
// vetted independently, only the ones that individually clear the hard
// invariant survive, sorted best-first. A generic bundle tour sitting next
// to a genuinely specific product does not "borrow" the specific one's
// eligibility -- each row must earn its own place on the list.
export function resolveVerifiedMany(place, products, opts = {}) {
  const offers = [];
  for (const p of products || []) {
    if (!p || !p.title || !(p.productUrl || p.url)) continue;
    const { confidence, evidence } = scoreCandidate(place, p, opts);
    const offer = toOffer(place, p, confidence, evidence, opts);
    if (isLiveEligible(offer)) offers.push(offer);
  }
  offers.sort((a, b) => b.confidence - a.confidence);
  return offers;
}
