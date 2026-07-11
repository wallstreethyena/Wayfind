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
  return tokenize(placeName).filter((t) => !STOP.has(t) && !cityToks.has(t));
}

// 0..1: fraction of the place's distinctive name tokens that appear in the
// product title. A place whose name has NO distinctive token beyond the
// city/region (so nothing to prove against) scores 0 -- indistinct names
// can never clear the entity floor, by design.
function entityMatch(placeName, region, productTitle) {
  const dist = distinctiveTokens(placeName, region);
  if (!dist.length) return 0;
  const hay = String(productTitle || "").toLowerCase();
  const hits = dist.filter((t) => hay.includes(t));
  return hits.length / dist.length;
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
  const confidence = em * WEIGHTS.entity + cm * WEIGHTS.category + sp * WEIGHTS.specificity + gm * WEIGHTS.geo;
  return {
    confidence: Math.round(confidence * 1000) / 1000,
    evidence: { entityMatch: em, categoryMatch: cm, specificity: sp, geoMatch: gm, fanoutCount: Math.max(1, Number(fanoutFor(product, opts)) || 1) },
  };
}

// Highest-scored candidate, or null. Ties and non-clearing scores break
// toward null -- this function never guesses.
export function pickBest(place, products, opts = {}) {
  let best = null;
  for (const p of products || []) {
    if (!p || !p.title || !(p.productUrl || p.url)) continue;
    const { confidence, evidence } = scoreCandidate(place, p, opts);
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
export function resolveVerified(place, products, opts = {}) {
  const best = pickBest(place, products, opts);
  if (!best) return null;
  const offer = toOffer(place, best.product, best.confidence, best.evidence, opts);
  return isLiveEligible(offer) ? offer : null;
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
