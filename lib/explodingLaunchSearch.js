// The launch feed uses the owner-supplied 20-trend list as its trend source.
// It does not call Semrush or Exploding Topics. Google Places is used only to
// resolve current local inventory for those declared concepts; Wayfind's
// governed score still decides which place leads inside each trend.

import { EXPLODING_NEARBY_UNIVERSE, CONCEPTS } from "./trendTaxonomy.js";
import { bucketForHour, siteHourFloat, TIME_BUCKETS } from "./nowContext.js";
import { wayfindScore, governedWayfindScore } from "./wayfindScore.js";
import { PRICE_ENUM } from "./price.js";

export const LAUNCH_SEARCH_BATCH = 4;
// v7.12 (owner, 2026-08-11): "make sure we are showing the highest rated
// options… fetch from Google other places that rank higher; if they don't,
// default to what we have." The search now reads 20 candidates per concept
// (same ONE cached text search — n changes the page size, not the call count)
// so the governed sort picks the best of twenty rather than the best of eight,
// and up to six verified matches ride the rail. The evidence gates are
// unchanged: a place still has to PROVE the offering (type + name) — a coffee
// shop with no hojicha is still refused, however well it rates.
export const LAUNCH_MATCH_LIMIT = 6;
export const LAUNCH_RADIUS_MI = 17;

// ── THE EVIDENCE FLOOR (v7.24, owner: "the cards are mostly below 9.0 — could we
// not find higher scoring place cards?") ────────────────────────────────────
//
// Measured on the live rail, 29 trend cards in Parrish: median 8.9, and the
// tail was the problem rather than the middle — "Smash Burgers & Tacos" at 46
// reviews, "The Daily Brew Station" at 42, "Craftails Speakeasy" at 69. In the
// morning it was worse: Club Pilates, 7.9 with NINETEEN reviews, wearing
// "🏆 ONE OF THE BEST NEARBY PLACES TO TRY IT".
//
// Every other list on this site has a review floor — quick-bite 120, hidden
// gems 60, tonight 150, worth-the-drive 300. Trend matches had NONE, which is
// the whole defect: the trend gate proves a place offers the thing, and then
// nothing asked whether the place is any good.
//
// WHY THE SCORES ARE LOWER HERE EVEN AFTER THIS, stated honestly rather than
// engineered away: a trend module admits only places that PROVE the specific
// offering (hojicha, reformer Pilates, smash burgers). That is a far narrower
// pool than "best restaurants near me", so a market may hold two qualifying
// places and the second one is legitimately an 8.6. The floor removes the cards
// that were never evidence of anything; it cannot invent a 9.5 ramen bar in a
// town that does not have one.
//
// 60 matches hidden-gems, the app's most permissive existing floor — the list
// whose whole promise is "loved but not overrun", so it is the right precedent
// for a small, genuinely-good place.
export const LAUNCH_MIN_REVIEWS = 60;
// The LEAD card wears a superlative ("one of the best nearby places to try
// it"), so it carries a higher bar than the cards behind it. A module whose
// best match cannot clear this does not render at all: no trend is worth a
// claim we cannot support.
export const LAUNCH_LEAD_MIN_REVIEWS = 100;
export const LAUNCH_LEAD_MIN_SCORE = 8.5;
// Owner 2026-08-11: "i want the top 10 ideally and work our way down if we
// cannot find any matches on google of places that offer the trends." Ten
// modules is the display budget; the ranked walk below decides which ten.
export const LAUNCH_MAX_TRENDS = 10;

// These concepts require a dated occurrence, not a place that could plausibly
// host one. Google Places text search cannot establish that, so the live place
// resolver skips them until an event record supplies scheduled evidence.
export const SCHEDULE_REQUIRED = new Set(["soft_clubbing", "puppy_yoga", "candlelight_concerts"]);

/**
 * THE DAYPART TRIGGER (owner voice note, 2026-08-11: "make sure that these
 * places are listed on their ideal time for today… some sort of a command
 * that triggers it based on those particular times").
 *
 * One clock only: the bucket comes from lib/nowContext (check-one-clock).
 * A trend is eligible ONLY inside its owner-declared windows, and the order
 * is primary-daypart trends first, then also-works trends, both by the
 * owner's research rank. This is also the cost gate: trends outside their
 * daypart are never searched at all.
 */
export function launchTrendsForBucket(bucket) {
  const b = TIME_BUCKETS.includes(bucket) ? bucket : bucketForHour(siteHourFloat());
  return EXPLODING_NEARBY_UNIVERSE
    .filter((t) => t.primaryBucket === b || (Array.isArray(t.alsoBuckets) && t.alsoBuckets.includes(b)))
    .sort((a, z) => ((a.primaryBucket === b ? 0 : 1) - (z.primaryBucket === b ? 0 : 1)) || (a.rank - z.rank));
}

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const clean = (v) => String(v == null ? "" : v).trim();

// v7.24 — the SAME base-brand rule lib/todaysBest.dedupeBrands uses: split on a
// dash-separated location suffix ("3Natives - UTC", "Foxtail Coffee Co. -
// Riverview South") and normalise, so two branches of one brand collapse to the
// best-scoring one. Kept here rather than imported because this module is the
// pure launch-search layer and todaysBest pulls in Supabase.
export function launchBrandKey(name) {
  return String(name || "").split(/\s+[—–-]{1,2}\s+/)[0].toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Text Search returns related venues as well as exact offering matches. These
// concept-specific name checks are the second proof: a generic cafe returned
// for "hojicha latte" is still rejected, while Smashburger, a sauna studio, or
// Club Pilates can establish the narrow offering in its own identity.
const NAME_EVIDENCE = {
  smash_burgers: /\bsmash(?:ed|burger| burgers?)?\b/i,
  cold_plunge_sauna: /\b(?:cold[ -]?plunge|sauna)\b/i,
  social_wellness_clubs: /\b(?:social wellness|wellness club)\b/i,
  hojicha_lattes: /\bhojicha\b/i,
  immersive_gamebox: /\bimmersive game\s*box\b/i,
  dubai_chocolate: /\b(?:dubai chocolate|kunafa chocolate)\b/i,
  black_sesame_lattes: /\bblack[ -]?sesame\b/i,
  hwachae: /\bhwachae\b/i,
  tanghulu: /\btanghulu\b/i,
  kunafa: /\b(?:kunafa|knafeh|kanafeh)\b/i,
  protein_ice_cream: /\bprotein(?: ice cream)?\b/i,
  immersive_dining: /\bimmersive dining\b/i,
  pilates_reformer: /\b(?:pilates|reformer)\b/i,
  rucking: /\bruck(?:ing)?\b/i,
  breathwork: /\bbreath[ -]?work\b/i,
  forest_bathing: /\bforest bath(?:ing)?\b/i,
  kintsugi: /\bkintsugi\b/i,
  elevated_ramen: /\b(?:ramen|noodle)\b/i,
  caribbean_curry_bowls: /\b(?:caribbean|jamaican|jerk|trini(?:dad)?|roti|oxtail|island)\b/i,
  miso_umami_seafood: /\b(?:miso|umami|izakaya|omakase)\b/i,
  functional_smoothie_acai: /\b(?:a[c\u00e7]a[i\u00ed]|smoothie|juice)\b/i,
  high_protein_grab_and_go: /\b(?:protein|nutrition|macro|fuel|shake)\b/i,
  gut_health_food: /\b(?:kombucha|kefir|gut|ferment|probiotic)\b/i,
  fermented_pickled: /\b(?:kimchi|ferment|pickle|brine|banchan)\b/i,
  matcha_specialty_coffee: /\b(?:matcha|roaster|roasting|specialty coffee|espresso|pour ?over|brew)\b/i,
  mocktail_bar: /\b(?:mocktail|zero[ -]?proof|sober|dry bar|alcohol[ -]?free|botanical|elixir)\b/i,
  savory_cocktails: /\b(?:martini|cocktail|speakeasy|mixolog|lounge)\b/i,
  food_hall: /\b(?:food hall|public market|market hall|social hall|collective|food park)\b/i,
  listening_bar: /\b(?:listening|hi[ -]?fi|vinyl|record bar)\b/i,
  pickleball: /\b(?:pickle|padel|dink)\b/i,
  golf_simulators: /\b(?:golf|swing)\b/i,
};

// Types that ALONE prove the offering: a place Google itself classifies as a
// ramen restaurant serves ramen; a place classified as an acai shop serves
// acai bowls. This is "types are truth, names lie" running in the trend's
// favor: the dedicated type is stronger evidence than any name, so a venue
// with one is admitted even when its name says nothing ("Kazu Kitchen" is
// still a ramen bar). Concepts WITHOUT a discriminating Google type stay
// name-proof only.
const TYPE_EVIDENCE = {
  elevated_ramen: ["ramen_restaurant"],
  miso_umami_seafood: ["japanese_restaurant", "sushi_restaurant"],
  functional_smoothie_acai: ["acai_shop", "juice_shop"],
  fermented_pickled: ["korean_restaurant"],
  matcha_specialty_coffee: ["tea_house"],
  food_hall: ["food_court"],
};

function distanceMi(a, b) {
  if (!a || !b || !finite(a.lat) || !finite(a.lng) || !finite(b.lat) || !finite(b.lng)) return null;
  const R = 3958.7613, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const placeName = (p) => clean(typeof p.displayName === "string" ? p.displayName : p.displayName && p.displayName.text) || clean(p.name);
const placeLocation = (p) => ({
  lat: finite(p && p.location && p.location.latitude) ? p.location.latitude : (finite(p && p.lat) ? p.lat : null),
  lng: finite(p && p.location && p.location.longitude) ? p.location.longitude : (finite(p && p.lng) ? p.lng : null),
});

export function placeFromGoogle(raw, conceptKey, center) {
  const concept = CONCEPTS[conceptKey];
  if (!raw || !concept || !clean(raw.id || raw.place_id)) return null;
  const status = clean(raw.businessStatus || raw.business_status || "OPERATIONAL").toUpperCase();
  if (status !== "OPERATIONAL") return null;
  const types = Array.isArray(raw.types) ? raw.types.map((t) => clean(t).toLowerCase()).filter(Boolean) : [];
  const denied = new Set((concept.denyTypes || []).map((t) => clean(t).toLowerCase()));
  if (types.some((t) => denied.has(t))) return null;
  const allowed = new Set([...(concept.primaryTypes || []), ...(concept.types || [])].map((t) => clean(t).toLowerCase()));
  if (!types.some((t) => allowed.has(t))) return null;
  const name = placeName(raw);
  // Proof of the OFFERING, not just the venue shape: a discriminating Google
  // type proves it alone; otherwise the place's own identity has to name it.
  const typeProof = TYPE_EVIDENCE[conceptKey];
  const typeProven = Array.isArray(typeProof) && typeProof.some((t) => types.includes(t));
  const nameProof = NAME_EVIDENCE[conceptKey];
  if (!typeProven && (!nameProof || !nameProof.test(name))) return null;

  const loc = placeLocation(raw);
  const dist = distanceMi(center, loc);
  if (!finite(dist) || dist > LAUNCH_RADIUS_MI) return null;
  const rating = Number(raw.rating);
  const reviews = Number(raw.userRatingCount ?? raw.reviews ?? 0);
  const base = wayfindScore(finite(rating) ? rating : null, finite(reviews) ? reviews : 0);
  if (base == null) return null;
  const photoRef = raw.photo_ref || (Array.isArray(raw.photos) && raw.photos[0] && raw.photos[0].name) || null;
  // Google's enum -> 1..4 through lib/price's ONE map (check-one-price-source):
  // every card carries the price when Google knows it, never a guessed one.
  const priceLevel = PRICE_ENUM[raw.priceLevel] != null ? PRICE_ENUM[raw.priceLevel] : (Number.isFinite(raw.priceNum) ? raw.priceNum : null);
  return {
    priceLevel,
    id: clean(raw.id || raw.place_id),
    name,
    lat: loc.lat,
    lng: loc.lng,
    rating,
    reviews: finite(reviews) ? reviews : 0,
    category: concept.categories && concept.categories[0],
    primaryType: types.find((t) => (concept.primaryTypes || []).includes(t)) || types[0] || null,
    types,
    photoRef,
    distanceMi: dist,
    governedScore: governedWayfindScore(base, { distanceMi: dist }),
    hasCreatorVideo: false,
    editorialHook: null,
    evidenceKinds: ["googleTextSearch"],
  };
}

function searchQuery(meta, city) {
  const concept = CONCEPTS[meta.key];
  const where = clean(city) || "near me";
  return clean((concept.query || meta.label).replace("{metro}", where));
}

async function searchOne(meta, center, city, fetchImpl, signal) {
  const params = new URLSearchParams({
    q: searchQuery(meta, city),
    lat: center.lat.toFixed(5),
    lng: center.lng.toFixed(5),
    radius: String(Math.round(LAUNCH_RADIUS_MI * 1609.344)),
    n: "20",
  });
  const response = await fetchImpl("/api/places/search?" + params.toString(), { cache: "no-store", signal });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Google place search failed (${response.status})`);
  if (body.gate === "shut") throw new Error("Google place search is disabled by WAYFIND_GATE");
  const seen = new Set();
  const seenBrand = new Set();
  const matches = (Array.isArray(body.places) ? body.places : [])
    .map((p) => placeFromGoogle(p, meta.key, center))
    .filter((p) => p && p.name && !seen.has(p.id) && seen.add(p.id))
    // v7.24 — THE EVIDENCE FLOOR. See LAUNCH_MIN_REVIEWS above.
    .filter((p) => Number(p.reviews) >= LAUNCH_MIN_REVIEWS)
    .sort((a, b) => (b.governedScore - a.governedScore) || (b.reviews - a.reviews))
    // v7.24 — ONE CARD PER BRAND, the same rule every other rail already runs
    // ("three Melt N Dips is one Melt N Dip", lib/todaysBest dedupeBrands).
    // Measured live: `3Natives` held ranks 2 AND 4 of a single trend module —
    // two branches of one juice bar reading as two independent finds.
    .filter((p) => { const k = launchBrandKey(p.name); if (seenBrand.has(k)) return false; seenBrand.add(k); return true; })
    .slice(0, LAUNCH_MATCH_LIMIT);
  // v7.24 — the module renders only when its LEAD can carry the superlative it
  // is about to wear. A trend with nothing but thin evidence behind it is not a
  // recommendation, and dropping it is cheaper than the trust it costs.
  const lead = matches[0];
  if (!lead || Number(lead.reviews) < LAUNCH_LEAD_MIN_REVIEWS || Number(lead.governedScore) < LAUNCH_LEAD_MIN_SCORE) return null;
  // `stat` is the owner-supplied search signal for this trend (see
  // lib/trendTaxonomy.js) — the card's evidence for "exploding", not decoration.
  return matches.length ? { conceptKey: meta.key, label: meta.label, headline: meta.headline, dek: meta.dek, stat: meta.stat || null, matches } : null;
}

export async function loadProvidedTrendList({ center, city, bucket, fetchImpl = fetch, signal } = {}) {
  if (!center || !finite(center.lat) || !finite(center.lng)) {
    return { status: "invalid_location", trends: [], error: "A valid location is required." };
  }
  const activeBucket = TIME_BUCKETS.includes(bucket) ? bucket : bucketForHour(siteHourFloat());
  const searchable = launchTrendsForBucket(activeBucket).filter((meta) => !SCHEDULE_REQUIRED.has(meta.key));
  const claimed = new Set();
  const trends = [];
  let successfulSearches = 0;
  let lastError = null;

  // THE RANKED WALK (owner, 2026-08-11): the trends eligible for the CURRENT
  // daypart are searched in the owner's research order, primary-daypart
  // trends first, #1 downward, and the walk STOPS once ten trends have a
  // verified local card ("the top 10 ideally and work our way down if we
  // cannot find any matches"). A trend still renders ONLY when a real,
  // Google-verified local place proves the offering — trend momentum never
  // invents a card. Cost stays flat after the first visitor: every query runs
  // through the shared /api/places/search cache, and each cold search grows the
  // permanent wf_place_ids library for the next reader in that town.
  for (let i = 0; i < searchable.length; i += LAUNCH_SEARCH_BATCH) {
    if (trends.length >= LAUNCH_MAX_TRENDS) break;
    const batch = searchable.slice(i, i + LAUNCH_SEARCH_BATCH);
    const settled = await Promise.allSettled(batch.map((meta) => searchOne(meta, center, city, fetchImpl, signal)));
    for (const result of settled) {
      if (result.status === "rejected") { lastError = result.reason; continue; }
      successfulSearches++;
      const trend = result.value;
      if (!trend) continue;
      const unique = trend.matches.filter((p) => p.id && !claimed.has(p.id));
      if (!unique.length) continue;
      unique.forEach((p) => claimed.add(p.id));
      trends.push({ ...trend, matches: unique });
    }
  }

  if (trends.length) return { status: "ok", source: "provided-20-trend-list", bucket: activeBucket, trends: trends.slice(0, LAUNCH_MAX_TRENDS) };
  if (!successfulSearches && lastError) {
    return { status: "trend_data_error", trends: [], error: "Trend recommendations are temporarily unavailable." };
  }
  return { status: "no_verified_inventory", source: "provided-20-trend-list", bucket: activeBucket, trends: [] };
}
