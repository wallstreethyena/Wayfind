// scripts/test-orderin-rails.mjs — locks Order In v3 (owner directives):
// 11 fixed cuisine rails in the owner's exact order; owner-curated brands
// GUARANTEED a card per metro; locals badged Wayfind Featured and ranked
// first; chains as utility (last, never badged); Uber Eats honesty wiring.
import { buildCuisineRails, categoryKeyFor, ORDER_IN_CATEGORIES, MORE_CATEGORY, byOrderInRank } from "../lib/orderInRails.js";
import { baseBrand, guaranteedFor, missingGuaranteed, nearestMetro, isFeaturedLocal, isChainBrand, tagFeatured, GUARANTEED } from "../lib/orderInFeatured.js";
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-orderin-rails: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── 1) the 11 rails render in the OWNER'S order ──────────────────────────────
const mk = (id, name, extra = {}) => ({ id, name, wfScore: 7, ...extra });
const pool = [
  mk("m1", "Mystery Bistro"),                       // -> More
  mk("h1", "Green Bowls Salads & Smoothies"),       // healthy
  mk("su1", "Sakura Sushi"),                        // sushi
  mk("se1", "Gulf Seafood House"),                  // seafood
  mk("l1", "Havana Cuban Cafe"),                    // latin
  mk("br1", "Sunrise Pancake Diner"),               // breakfast
  mk("i1", "Trattoria Roma"),                       // italian
  mk("a1", "Golden Wok Chinese"),                   // asian
  mk("ch1", "Wing Shack Chicken Wings"),            // chicken
  mk("mx1", "Taco Cantina"),                        // mexican
  mk("p1", "Mario Pizzeria"),                       // pizza
  mk("b1", "Best Burger Joint"),                    // burgers
];
const rails = buildCuisineRails(pool, { labeler: () => null });
const wantOrder = ORDER_IN_CATEGORIES.map((c) => c.key).concat(MORE_CATEGORY.key);
ok(JSON.stringify(rails.map((r) => r.key)) === JSON.stringify(wantOrder),
  "rails render in the owner's exact fixed order, More last — got " + rails.map((r) => r.key).join(","));
ok(rails[0].label === "Burgers & Fast Food" && rails[1].label === "Pizza",
  "labels verbatim from the owner's list");

// ── 2) the owner's actual brands bucket correctly ────────────────────────────
const cat = (name) => categoryKeyFor({ name }, null);
ok(cat("SoDough Square") === "pizza", "SoDough Square -> Pizza");
ok(cat("Pho 813") === "asian", "Pho 813 -> Chinese & Asian");
ok(cat("Fresh Kitchen") === "healthy", "Fresh Kitchen -> Healthy Bowls");
ok(cat("Mi Carreta Restaurant and Bakery") === "latin", "Mi Carreta -> Cuban/Caribbean/Latin");
ok(cat("Ichiban Restaurant & Sushi Bar") === "sushi", "Ichiban -> Sushi & Japanese");
ok(cat("PDQ Chicken") === "chicken", "PDQ -> Chicken/Wings/Tenders");
ok(cat("Winter Park Biscuit Co.") === "breakfast", "Winter Park Biscuit -> Breakfast & Brunch");
ok(cat("Tandoor Fine Indian Cuisine") === "asian", "Tandoor (Indian) -> Chinese & Asian rail");

// ── 3) tiering: hero-first > featured > plain > chain; deals never beat tier ─
const tierPool = [
  mk("c9", "McDonald's Pizza Wow", { _wfChain: true, _deal: { title: "BOGO" }, wfScore: 10 }),
  mk("n5", "Plain Pizzeria", { wfScore: 5 }),
  mk("f8", "Valentino Pizzeria Trattoria", { _wfFeatured: true, wfScore: 8 }),
  mk("hf", "Cappy's Pizza", { _wfFeatured: true, _wfHeroFirst: true, wfScore: 6 }),
];
const ranked = tierPool.slice().sort(byOrderInRank).map((p) => p.id);
ok(JSON.stringify(ranked) === JSON.stringify(["hf", "f8", "n5", "c9"]),
  "tier order hero-first > featured > plain > CHAIN — a chain with a deal and a 10 never outranks a local (got " + ranked.join(",") + ")");

// ── 4) guaranteed inventory helpers ──────────────────────────────────────────
ok(baseBrand("Taco Bell — 4th Street") === "Taco Bell" && baseBrand("Pura Vida Miami — The Landings") === "Pura Vida Miami",
  "branch suffixes strip to the base brand");
const g = guaranteedFor("stpete");
ok(g.filter((x) => x.name === "Taco Bell").length === 1 && g.filter((x) => x.name === "McDonald's").length === 1,
  "st pete guarantees dedupe the 7 Taco Bell / McDonald's branches to one brand card each");
ok(g.some((x) => x.name === "Bellabrava" && !x.chain) && g.some((x) => x.name === "Taco Bell" && x.chain),
  "locals vs chains classified inside the guaranteed list");
const missing = missingGuaranteed([mk("x", "McDonald's — Pinellas Park"), mk("y", "AHI Sushi")], "stpete");
ok(!missing.some((x) => x.name === "McDonald's") && !missing.some((x) => x.name === "AHI Sushi"),
  "brands already in the pool (any branch) are not re-fetched");
ok(missing.some((x) => x.name === "Bellabrava"), "absent owner picks are reported missing so the page resolves their card");
ok(nearestMetro(27.58, -82.42) === "sarasota", "Parrish resolves to the Sarasota curation");
ok(nearestMetro(28.54, -81.38) === "orlando" && nearestMetro(40.7, -74.0) === null,
  "Orlando resolves; New York gets no curation (organic only)");
ok(isFeaturedLocal("Bellabrava", "stpete") === true && isFeaturedLocal("McDonald's", "stpete") === false,
  "featured = curated LOCALS only; chains never featured");
ok(isChainBrand("Starbucks — Kennedy & Dakota") && isChainBrand("Crumbl Cookies"), "chain matcher catches branches");
const tagged = tagFeatured({ id: "t", name: "Pho 813" }, "tampa");
ok(tagged._wfFeatured === true && tagged._wfHeroFirst === true, "Pho 813 tagged featured + hero-first (owner's feature-first list)");
ok(Object.keys(GUARANTEED).length === 4, "all four metros carry a guaranteed list");

// ── 5) the page actually wires it (static) ───────────────────────────────────
const page = readFileSync(new URL("../app/order-in/OrderInClient.js", import.meta.url), "utf8");
ok(/from "\.\.\/\.\.\/lib\/orderInRails"/.test(page) && /from "\.\.\/\.\.\/lib\/orderInFeatured"/.test(page),
  "OrderInClient delegates to the rails + featured libs");
ok(/\/api\/eats\/check/.test(page), "page verifies cards against Uber Eats (eats/check)");
ok(/Powered by Uber Eats/.test(page), "Powered by Uber Eats branding present");
ok(/Wayfind Featured/.test(page), "the Wayfind Featured badge renders");
ok(/\/api\/eats\/go\?/.test(page), "every CTA routes through the attributed /api/eats/go");
ok(/Find on Uber Eats/.test(page), "unverified cards soften to Find on Uber Eats (honesty rule)");
// Honesty default: the green "Order" is gated on eatsOk===true (CONFIRMED), so
// unchecked cards (eatsOk===undefined -- only <=24 heads get verified) fall to
// "Find", never a fake-verified "Order". Guards against re-inverting to `===false`.
ok(/eatsOk\[p\.id\] === true \? "Order on Uber Eats/.test(page),
  "the green Order CTA is gated on eatsOk===true (verified), so unchecked cards default to Find");
ok(/missingGuaranteed\(/.test(page) && /findPlace\(/.test(page),
  "missing owner picks are resolved so every curated brand gets its card");

console.log(`test-orderin-rails: OK — ${pass} assertions (fixed rail order, owner-brand buckets, tiering, guaranteed cards, UE honesty wiring)`);
