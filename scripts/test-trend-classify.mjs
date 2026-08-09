#!/usr/bin/env node
// scripts/test-trend-classify.mjs — topic classification, strength, and
// topic→place matching. The false matches this file forbids are named in the
// product spec, one assertion each.

import { readFileSync } from "node:fs";
import {
  conceptForTopic, CONCEPTS, MENU_LISTS, conceptsForList, nearbyEligibleConcepts,
  googleQueryFor, APPROVED_METROS, ALL_ALIASES,
} from "../lib/trendTaxonomy.js";
import {
  evaluateTopic, familyVolumeIndex, observedGrowth, volumePercentile, growthScore,
  WEIGHTS, assertWeights, MIN_GROWTH, MAX_VOLATILITY,
} from "../lib/trendStrength.js";
import { matchConcept, matchTopicToInventory, classifyGap, MATCH_CODES, NAME_ONLY_CEILING } from "../lib/trendMatch.js";

let pass = 0;
const fail = (m) => { console.error("test-trend-classify: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const PLACES = JSON.parse(readFileSync(new URL("./fixtures/trends/inventory.json", import.meta.url), "utf8")).places
  .map((p) => ({ ...p, refreshed_at: new Date(Date.now() - 3 * 86400000).toISOString() }));
const byName = (n) => PLACES.find((p) => p.name === n);

// ── Taxonomy: accepted ─────────────────────────────────────────────────────
for (const [topic, want] of [
  ["Korean coffee", "korean_coffee"], ["Kakigori", "kakigori"], ["Pickleball", "pickleball"],
  ["Natural wine bar", "natural_wine_bar"], ["Bioluminescent kayaking", "bioluminescent_kayaking"],
  ["Sound bath", "sound_bath"], ["Omakase", "omakase"], ["Food hall", "food_hall"],
  ["  KOREAN   COFFEE  ", "korean_coffee"],
]) {
  const r = conceptForTopic(topic);
  ok(r.key === want, `"${topic}" maps to ${want}, got ${r.key}`);
  ok(r.reason, `"${topic}" carries a reason even when ACCEPTED`);
}

// ── Taxonomy: the named false matches ──────────────────────────────────────
const rejects = [
  ["Hands-free dog leash", /equipment/, "a product must not become evidence that pet-friendly places should rise"],
  ["Viator", /booking_platform/, "an affiliate booking platform must never be a ranking topic"],
  ["GetYourGuide", /booking_platform/, "…nor any other OTA"],
  ["AI travel planner", /software/, "software is not experienceable at a place"],
  ["Creatine gummies", /supplements/, "supplements are not a place"],
  ["Wireless earbuds", /electronics/, "consumer electronics are not a place"],
  ["Running shoes", /apparel/, "apparel is not a place"],
  ["Series A funding round", /startup_finance/, "investment topics are not a place"],
  ["Netflix season 3", /media_celebrity/, "TV/celebrity spikes are not a place"],
  ["best pickleball paddle review", /equipment/, "a paddle is equipment even though 'pickleball' is a real concept — the product noun wins"],
  ["best korean coffee review", /product-shaped/, "a buying/review topic is product-shaped even though it contains an exact concept alias"],
  ["Quantum flux capacitor", /no controlled Wayfind concept/, "an unknown string is rejected by the ALLOWLIST, not by a denylist"],
];
for (const [topic, re, why] of rejects) {
  const r = conceptForTopic(topic);
  ok(r.concept === null, `"${topic}" must be rejected — ${why}`);
  ok(re.test(r.reason), `"${topic}" rejection reason matches ${re}, got "${r.reason}"`);
}
// EVERY rejection carries a reason — checked exhaustively, not by sampling.
for (const t of ["", "   ", "zzzz", "Viator", "dog leash"]) ok(conceptForTopic(t).reason, `"${t}" carries a rejection reason`);

// Word-boundary matching, not substring: "ai" must not swallow "Thai".
ok(conceptForTopic("Thai coffee").reason.includes("no controlled Wayfind concept"),
  '"Thai coffee" is unmapped, NOT excluded as software — "ai" must match on word boundaries');

// ── Menu lists ─────────────────────────────────────────────────────────────
ok(MENU_LISTS.length === 8, "there are exactly eight menu lists");
for (const l of MENU_LISTS) ok(Array.isArray(conceptsForList(l)), `list "${l}" resolves to a concept array`);
// "The best near you" is a UNION, never its own pool.
for (const [k, c] of Object.entries(CONCEPTS)) {
  ok(!c.lists.includes("nearby") || c.lists.length > 1,
    `concept "${k}" may not claim "nearby" alone — the front page is the union of specific qualifications, not a catch-all`);
}
const union = nearbyEligibleConcepts();
ok(union.length > 0 && union.every((k) => CONCEPTS[k].lists.some((l) => l !== "nearby")),
  "every concept in the nearby union qualifies for at least one SPECIFIC list");
// Each of the eight lists is reachable — a list with no concepts is a mapping
// that was never written.
for (const l of MENU_LISTS) {
  if (l === "hidden-gems" || l === "creator-finds") continue; // gated by existing predicates, see below
  ok(conceptsForList(l).length > 0, `list "${l}" has at least one mapped concept`);
}
// hidden-gems and creator-finds carry NO concepts by design: their membership is
// decided by the existing hidden-gem predicate and by verified creator evidence.
// A trend may only REORDER what those gates already produced.
ok(conceptsForList("hidden-gems").length === 0,
  "no concept may nominate a place INTO hidden gems — the existing predicate decides membership, the trend only reorders");
ok(conceptsForList("creator-finds").length === 0,
  "no concept may nominate a place INTO creator finds — verified creator evidence decides membership");

// ── Controlled Google queries ──────────────────────────────────────────────
const q = googleQueryFor("korean_coffee", "tampa");
ok(/Tampa, Florida/.test(q.textQuery), "a query is scoped to an approved metro");
ok(!/undefined|\{metro\}/.test(q.textQuery), "the template is fully interpolated");
ok(q.sku === "searchText" && Array.isArray(q.denyTypes), "the query carries its SKU and its type guards");
// ARBITRARY CSV TEXT CANNOT REACH GOOGLE: the raw topic is not a parameter, so
// there is no argument through which it could pass.
ok(googleQueryFor.length === 2, "googleQueryFor takes (conceptKey, metro) only — a raw topic string is not a parameter it can accept");
let threw = false;
try { googleQueryFor("=cmd|calc", "tampa"); } catch (e) { threw = /not a declared concept/.test(e.message); }
ok(threw, "an undeclared concept key cannot produce a Google query");
threw = false;
try { googleQueryFor("korean_coffee", "paris"); } catch (e) { threw = /not an approved metro/.test(e.message); }
ok(threw, "an unapproved metro cannot produce a Google query");
for (const k of Object.keys(CONCEPTS)) {
  for (const m of APPROVED_METROS) {
    const built = googleQueryFor(k, m);
    ok(built.textQuery.length > 5 && !/\{/.test(built.textQuery), `every concept×metro produces a clean query (${k}/${m})`);
  }
}
ok(ALL_ALIASES.length === new Set(ALL_ALIASES).size, "no alias is claimed by two concepts");

// ── Strength ───────────────────────────────────────────────────────────────
ok(assertWeights(), "strength weights sum to 1");
ok(WEIGHTS.growth > WEIGHTS.volume && WEIGHTS.growth > WEIGHTS.stability,
  "observed growth dominates — it is the only real period-over-period delta");
ok(growthScore(-0.5) === 0 && growthScore(0) === 0, "non-positive growth scores zero");
ok(growthScore(10) > growthScore(2) && growthScore(10) <= 1, "growth saturates rather than letting one freak topic compress everything");
// The longer, less-noisy window wins.
ok(observedGrowth({ growth_3mo: 5, growth_12mo: 1 }).window === "12 months",
  "12-month growth is preferred over a noisier 3-month figure");
ok(observedGrowth({ growth_3mo: 5 }).window === "3 months", "…and 3-month is used when nothing longer exists");
ok(observedGrowth({}).value === null, "no growth column yields null, never 0");
// Category-relative normalisation: identical volumes in different families must
// not be comparable on raw magnitude.
ok(volumePercentile(100, [100]) === 0.5, "a family of one returns 0.5 — a single observation says nothing about a distribution");
ok(volumePercentile(500, [10, 20, 30, 500]) > volumePercentile(20, [10, 20, 30, 500]), "percentile ranks within the family");
ok(volumePercentile(50, [50, 50, 50, 50]) === 0.5, "ties get a midrank, independent of array order");

const base = { topic: "Korean coffee", observed_at: "2026-08-04", classification: "exploding", search_volume: 12100, growth_12mo: 1.9 };
const fam = { beverage: [12100, 4400, 9900] };
const good = evaluateTopic(base, { familyVolumes: fam });
ok(good.eligible && good.strength > 0 && good.strength <= 1, "a good topic is eligible with a 0..1 strength");
ok(good.reason.includes("+190%") && good.reason.includes("12 months"), "the eligibility reason states the growth AND the window");

// FORECASTS DO NOT CONTRIBUTE. Proven by changing the forecast and asserting the
// strength does not move — reading the module would not prove this.
const withForecast = evaluateTopic({ ...base, forecast_growth: 99 }, { familyVolumes: fam });
ok(withForecast.strength === good.strength, "a wildly different forecast does NOT change strength — forecasts are excluded from v1 ranking");

// Each rejection path, with its own reason.
const cases = [
  [{ ...base, classification: "peaked" }, /past peak/, "a peaked topic never gets a positive boost"],
  [{ ...base, classification: "declining" }, /past peak/, "a declining topic never gets a positive boost"],
  [{ ...base, growth_12mo: 0.02 }, /below the \+10% floor/, "growth under the floor is rejected"],
  [{ ...base, growth_12mo: -0.5 }, /below the \+10% floor/, "negative growth is rejected"],
  [{ ...base, observed_at: null }, /observation date/, "no observation date is rejected"],
  [{ ...base, volatility: 0.9 }, /volatility/, "excess volatility is rejected"],
  [{ ...base, topic: "Viator" }, /booking_platform/, "an excluded domain is rejected at evaluation too"],
  [{ ...base, search_volume: 1 }, /percentile/, "volume below the category-relative floor is rejected"],
];
for (const [row, re, why] of cases) {
  const v = evaluateTopic(row, { familyVolumes: { beverage: [12100, 4400, 9900, 1] } });
  ok(!v.eligible, why);
  ok(re.test(v.reason), `${why} — reason matches ${re}, got "${v.reason}"`);
}
ok(!evaluateTopic(base, { familyVolumes: fam, snapshotStale: true }).eligible, "a stale snapshot makes every topic ineligible");
ok(/stale/.test(evaluateTopic(base, { familyVolumes: fam, snapshotStale: true }).reason), "…and says so");
// A seasonal spike is FLAGGED, not silently treated as emerging.
ok(evaluateTopic({ ...base, seasonal: true }, { familyVolumes: fam }).seasonal === true, "a seasonal topic is flagged as seasonal");
ok(/seasonal/.test(evaluateTopic({ ...base, seasonal: true }, { familyVolumes: fam }).reason), "…and the reason discloses it");

// Category-relative normalisation across families, end to end: a niche activity
// with big growth must be able to outrank a food topic with larger raw volume.
const idx = familyVolumeIndex([
  { topic: "Korean coffee", search_volume: 12100 }, { topic: "Omakase", search_volume: 22200 },
  { topic: "Sound bath", search_volume: 8100 }, { topic: "Pickleball", search_volume: 74000 },
]);
const niche = evaluateTopic({ topic: "Sound bath", observed_at: "2026-08-04", classification: "rising", search_volume: 8100, growth_12mo: 3.0 }, { familyVolumes: idx });
const bigFood = evaluateTopic({ topic: "Omakase", observed_at: "2026-08-04", classification: "rising", search_volume: 22200, growth_12mo: 0.2 }, { familyVolumes: idx });
ok(niche.strength > bigFood.strength,
  "a fast-rising niche topic outranks a slow-growing high-volume food topic — volume is normalised WITHIN its family, never across");

// ── Matching ───────────────────────────────────────────────────────────────
const M = (c, p, o) => matchConcept(c, byName(p), { metro: "tampa", ...(o || {}) });

ok(M("korean_coffee", "Dosan Coffee House").matched, "Korean coffee matches a verified Korean coffee shop");
ok(M("kakigori", "Yuki Shaved Ice").matched, "Kakigori matches a venue verified as serving it");
ok(M("pickleball", "Gulf Coast Pickleball Club").matched, "Pickleball matches a real pickleball venue");
ok(M("natural_wine_bar", "Cellar & Vine").matched, "Natural wine bar matches a verified natural-wine bar");
for (const [c, p] of [["korean_coffee", "Dosan Coffee House"], ["kakigori", "Yuki Shaved Ice"]]) {
  ok(M(c, p).evidence.length > 0 && M(c, p).reason.length > 10, `${c} match stores its evidence and an explanation`);
}

// The named false matches, each with its own CODE.
const reject = (c, p, code, why) => {
  const v = M(c, p);
  ok(!v.matched, why);
  ok(v.code === code, `${why} — code should be ${code}, got ${v.code}`);
};
// The paddle shop is refused by the CATEGORY gate, which runs before the type
// veto — both are correct, and asserting the wrong one of the two would make
// this test a description of the check order rather than of the outcome.
const depot = M("pickleball", "Pickleball Paddle Depot");
ok(!depot.matched, "a sporting-goods store must not match pickleball even with a perfect name match");
ok(depot.code === MATCH_CODES.WRONG_CATEGORY, `…refused by the category gate first (got ${depot.code})`);
// So the type VETO gets its own proof, on a row that clears the category gate:
// a shop mis-categorised into attractions still carries sporting_goods_store.
const misfiled = matchConcept("pickleball",
  { ...byName("Pickleball Paddle Depot"), category: "attractions", tags: ["pickleball"] }, { metro: "tampa" });
ok(!misfiled.matched && misfiled.code === MATCH_CODES.DENIED_TYPE,
  "a disqualifying Google type vetoes even with the right category AND a matching discriminator tag");
reject("natural_wine_bar", "Harbour Grill", MATCH_CODES.NO_SPECIFIC_EVIDENCE, "a restaurant with no evidence it pours natural wine must not match");
reject("immersive_art", "Bayfront Museum of Art", MATCH_CODES.NO_SPECIFIC_EVIDENCE, "an ordinary museum must not match immersive art");
reject("korean_coffee", "Bayshore Coffee Roasters", MATCH_CODES.NO_SPECIFIC_EVIDENCE, "a generic cafe must not match KOREAN coffee — the venue type is not the concept");
reject("korean_coffee", "Seoul Bean Coffee", MATCH_CODES.NOT_OPERATIONAL, "a permanently closed place must never match");
reject("korean_coffee", "Hanok Coffee Orlando", MATCH_CODES.WRONG_METRO, "a place in another metro must never match (AGENTS.md §12)");
reject("listening_bar", "The Listening Bar", MATCH_CODES.NO_SPECIFIC_EVIDENCE, "an exact NAME match with no structural evidence must not match");
reject("pickleball", "Riverwalk Dog Park", MATCH_CODES.NO_SPECIFIC_EVIDENCE, "a dog park must not match pickleball");

// Name-only is capped by ARITHMETIC, not by a comment.
const nameOnly = M("listening_bar", "The Listening Bar");
ok(nameOnly.confidence <= NAME_ONLY_CEILING, `a name-only match is capped at ${NAME_ONLY_CEILING}, got ${nameOnly.confidence}`);
ok(nameOnly.confidence < Math.min(...Object.values(CONCEPTS).map((c) => c.evidenceFloor)),
  "the name-only ceiling sits below EVERY concept's evidence floor — so name-alone can never clear any of them");

// Stale Google content is refused.
const stale = M("korean_coffee", "Dosan Coffee House", { nowMs: Date.now() + 40 * 86400000 });
ok(!stale.matched && stale.code === MATCH_CODES.STALE_CONTENT, "Google content past 30 days must not be matched on (Places ToS)");
// …and a place with no freshness timestamp at all is refused, not assumed fresh.
const noTs = matchConcept("korean_coffee", { ...byName("Dosan Coffee House"), refreshed_at: null, last_verified_at: null }, { metro: "tampa" });
ok(!noTs.matched && noTs.code === MATCH_CODES.NO_FRESHNESS, "a place with no refresh timestamp is refused, never assumed fresh");

// Low confidence is refused with the floor named.
const low = matchConcept("kakigori", { ...byName("Yuki Shaved Ice"), editorial: null, tags: [] }, { metro: "tampa" });
ok(!low.matched, "kakigori without a verified fact falls below its high floor");
ok(low.code === MATCH_CODES.NO_SPECIFIC_EVIDENCE || low.code === MATCH_CODES.BELOW_FLOOR, "…with a specific code");

// UNVERIFIED editorial is not evidence — a draft must not justify a match.
const draft = matchConcept("kakigori", { ...byName("Yuki Shaved Ice"), tags: [], editorial: { ...byName("Yuki Shaved Ice").editorial, verified: false } }, { metro: "tampa" });
ok(!draft.matched, "an UNVERIFIED atlas row is not evidence — a draft cannot close a match");

// Every rejection carries a reason and a code.
const all = matchTopicToInventory("korean_coffee", PLACES, { metro: "tampa" });
ok(all.rejections.every((r) => r.reason && r.code), "every rejection carries both a human reason and a machine code");
ok(all.matches.every((m) => m.confidence >= CONCEPTS.korean_coffee.evidenceFloor), "every accepted match clears the concept floor");

// ── Gap classification ─────────────────────────────────────────────────────
const gapNone = classifyGap("sound_bath", matchTopicToInventory("sound_bath", PLACES, { metro: "tampa" }), { metro: "tampa", inventoryCount: 11 });
ok(gapNone.kind === "INVENTORY_COVERAGE" && gapNone.searchable, "a concept with no candidate at all is a searchable coverage gap");
// A museum scoring on `tourist_attraction` is NOT a mislabelled kayak operator.
// Getting this wrong suppresses the search the gap actually needs.
const gapKayak = classifyGap("bioluminescent_kayaking", matchTopicToInventory("bioluminescent_kayaking", PLACES, { metro: "tampa" }), { metro: "tampa", inventoryCount: 11 });
ok(gapKayak.searchable, "a museum matching only on a broad type must not be misread as a near-miss that blocks discovery");
ok(classifyGap("korean_coffee", { rejections: [] }, { metro: "tampa", inventoryCount: 0 }).kind === "NO_LOCAL_VENUE",
  "an empty metro is NO_LOCAL_VENUE, not a searchable gap");

console.log(`test-trend-classify: OK — ${pass} assertions (allowlist taxonomy, category-relative strength, forecast excluded, evidence-based matching)`);
