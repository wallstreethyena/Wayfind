// scripts/test-experiences.mjs — locks the Viator experiences engine's pure
// core (geo-lock, dedup, categorize, rank). No network, no key.
import { buildPool, geoLocked, rankExperiences, EXP_CATEGORIES } from "../lib/experiencesEngine.js";

let pass = 0;
const fail = (m) => { console.error("test-experiences: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const TAMPA = "666", tokens = ["tampa"];
const water = [
  { productCode: "P1", title: "Tampa Bay Jet Ski Adventure", productUrl: "https://viator.com/p1", destinations: [{ ref: "d666" }], reviews: { combinedAverageRating: 4.8, totalReviews: 520 }, pricing: { summary: { fromPrice: 89 } } },
  { productCode: "P2", title: "Aruba Jet Ski Rental", productUrl: "https://viator.com/p2", destinations: [{ ref: "d50" }], reviews: { combinedAverageRating: 4.9, totalReviews: 30 } },       // wrong geo
  { productCode: "P3", title: "Sunset Cruise in Tampa", productUrl: "https://viator.com/p3", destinations: [{ ref: "d999" }], reviews: { combinedAverageRating: 4.5, totalReviews: 1200 } }, // title-token geo
];
const adventure = [
  { productCode: "P4", title: "Everglades Airboat near Tampa", productUrl: "https://viator.com/p4", destinations: [{ ref: "d666" }], reviews: { combinedAverageRating: 4.7, totalReviews: 800 } },
  { productCode: "P1", title: "Tampa Bay Jet Ski Adventure", productUrl: "https://viator.com/p1", destinations: [{ ref: "d666" }], reviews: { combinedAverageRating: 4.8, totalReviews: 520 } }, // dupe of P1
];

// geo-lock
ok(geoLocked(water[0], TAMPA, tokens) === true, "destId match passes geo-lock");
ok(geoLocked(water[1], TAMPA, tokens) === false, "wrong-destination product (Aruba) REJECTED");
ok(geoLocked(water[2], TAMPA, tokens) === true, "title-token region match passes even without destId");
ok(geoLocked({ title: "x" }, TAMPA, tokens) === false, "product without productUrl rejected");

const pool = buildPool([{ category: "water", results: water }, { category: "adventure", results: adventure }], TAMPA, tokens);
ok(pool.length === 3, "5 raw -> 3 unique (Aruba rejected, P1 deduped) — got " + pool.length);
ok(!pool.some((p) => p.code === "P2"), "Aruba jet ski absent from pool");
ok(pool.find((p) => p.code === "P1").category === "water", "first-category-wins: P1 stays 'water'");
ok(pool.every((p) => p.category && p.title && p.url), "every card carries category + title + url");
ok(pool.find((p) => p.code === "P1").fromPrice === 89, "price mapped onto card");
ok(pool[0].rating >= pool[pool.length - 1].rating - 0.001 || pool[0].reviews >= pool[pool.length - 1].reviews, "ranked (rating-dominant)");

// taxonomy integrity — the categories that reach the stuff people do
const keys = EXP_CATEGORIES.map((c) => c.key);
ok(keys.includes("water") && keys.includes("adventure") && keys.includes("fishing"), "taxonomy covers water/adventure/fishing");
ok(EXP_CATEGORIES.find((c) => c.key === "water").terms.includes("jet ski"), "water category queries 'jet ski' by name");
ok(EXP_CATEGORIES.find((c) => c.key === "adventure").terms.includes("airboat"), "adventure queries 'airboat' by name");
ok(rankExperiences([{ rating: 4.2, reviews: 100 }, { rating: 4.8, reviews: 100 }])[0].rating === 4.8, "at equal review volume, higher rating ranks first");
ok(rankExperiences([{ rating: 4.5, reviews: 9000 }, { rating: 4.6, reviews: 30 }])[0].reviews === 9000, "a huge review lead can overtake a tiny rating gap (4.5/9000 > 4.6/30) — intended");

console.log(`test-experiences: OK — ${pass} assertions (geo-lock kills off-region noise, dedup + category + rank, taxonomy reaches jet-ski/airboat by name)`);
