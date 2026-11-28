// Group Vote options are different outings, never the same mall twice.
// Owner 2026-11-28 ("wtf sup with the duplicate place cards?"): a vote offered
// "University Town Center" (9.2) and "Shoppes at University Center" (9.0), one
// mall complex under several Google records, ranked first because nearest won.
// No network: pure functions plus an injected inventory fetch.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sameOutingSpot, distinctOutingSpots, premiumGroupOption, recommendGroupOptions, GROUP_OPTION_MIN_SCORE } from "../lib/groupPlanCandidates.js";

let n = 0;
const ok = (v, m) => { assert.ok(v, m); n++; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const P = (id, name, lat, lng, primaryType = "shopping_mall", category = "shopping", extra = {}) =>
  ({ id, name, lat, lng, primaryType, category, city: "Sarasota", status: "OPERATIONAL", excluded: false, ...extra });

// Real UTC records (wf_inventory, 2026-11-28).
const mall = P("m", "The Mall at University Town Center", 27.3845, -82.4528);
const twins = [
  P("u", "University Town Center", 27.3845, -82.4526),
  P("s", "Shoppes at University Center", 27.3911, -82.4527),
  P("k", "The Market at UTC", 27.3897, -82.4659),
  P("q", "The Square at UTC", 27.3897, -82.4611),
  P("d", "UTC District", 27.3837, -82.4559),
  P("x", "UTC Mall", 27.3850, -82.4509),
];
for (const t of twins) ok(sameOutingSpot(mall, t), `${t.name} is the same outing as ${mall.name}`);
const elsewhere = [P("a", "St. Armands Circle", 27.3195, -82.5782), P("w", "Westfield Sarasota Square", 27.2380, -82.5011)];
for (const e of elsewhere) ok(!sameOutingSpot(mall, e), `${e.name} is a different outing`);
eq(distinctOutingSpots([...twins, ...elsewhere], [mall]).map((p) => p.id), ["a", "w"], "only genuinely different outings survive");
eq(distinctOutingSpots([twins[2], twins[3]]).map((p) => p.id), ["k"], "two sub-plazas of one complex never both appear");

// Different businesses inside one mall stay separate picks.
ok(!sameOutingSpot(P("p1", "Mister O1 Extraordinary Pizza UTC", 27.3889, -82.4659, "pizza_restaurant", "food"), P("p2", "Origin Craft Beer & Pizza Cafe UTC", 27.3904, -82.4578, "pizza_restaurant", "food")), "two pizza places in the same mall are different picks");
ok(!sameOutingSpot(P("r1", "Shake Shack UTC Sarasota", 27.3858, -82.4556, "hamburger_restaurant", "food"), P("r2", "Selva Grill University Town Center", 27.3866, -82.4563, "restaurant", "food")), "a burger spot and a grill in one mall are different picks");
ok(!sameOutingSpot(P("c1", "Siesta Key Oyster Bar", 27.2666, -82.55, "seafood_restaurant", "food", { city: "Siesta Key" }), P("c2", "Siesta Key Rum", 27.27, -82.55, "bar", "food", { city: "Siesta Key" })), "a shared town name never merges two businesses");
ok(sameOutingSpot(P("j1", "John's Pass", 27.7836, -82.7817, "tourist_attraction", "attractions"), P("j2", "John's Pass Village & Boardwalk", 27.7837, -82.7816, "tourist_attraction", "attractions")), "a place and its own village record are one outing");
ok(sameOutingSpot(P("o", "Same Spot", 27.5, -82.5, "bar", "food"), P("o2", "Totally Other Name", 27.5001, -82.5001, "bar", "food")), "two bars on top of each other are one record");

// Ranking: nearest no longer wins; the duplicate twin is never offered.
const seed = P("seed", "The Mall at University Town Center", 27.3845, -82.4528, "shopping_mall", "shopping", { score: 92 });
const recs = recommendGroupOptions(seed, [
  { ...twins[0], score: 92 }, { ...twins[1], score: 90 }, { ...twins[2], score: 88 },
  { ...elsewhere[0], score: 94 }, { ...elsewhere[1], score: 90 },
], [], { maxPlaces: 6 });
eq(recs.places.map((p) => p.id), ["a", "w"], "recommendations drop every twin of the clicked mall");
ok(recs.places.every((p) => !p.matchReasons.includes("Right next door")), "no 'Right next door' filler reason");

// Premium bar: 9.0+ and a real photo.
eq(GROUP_OPTION_MIN_SCORE, 90, "9.0 floor");
ok(premiumGroupOption({ score: 90, photo: "https://x.test/a.jpg" }), "9.0 with a photo qualifies");
ok(!premiumGroupOption({ score: 89, photo: "https://x.test/a.jpg" }), "8.9 does not");
ok(!premiumGroupOption({ score: 95, photo: null }), "no photo does not");
ok(!premiumGroupOption({ score: 95, photo: "javascript:alert(1)" }), "a non-web photo does not");

// Wiring: suggest ranks by quality, filters premium, and smart search dedupes.
const src = readFileSync(new URL("../lib/groupPlanPlaceData.js", import.meta.url), "utf8");
ok(/order=signals->reviews\.desc\.nullslast/.test(src) && /bayes\(b\) - bayes\(a\)/.test(src), "suggest reads and keeps the best rated nearby, not the nearest");
ok(/filter\(premiumGroupOption\)/.test(src), "suggest offers only premium options");
ok(/distinctOutingSpots\(\[\.\.\.picked, \.\.\.rest\]/.test(src), "plain-language search results are deduped too");

console.log(`test-group-vote-distinct-picks: OK — ${n} assertions (one outing per option, 9.0+ with real photos, nearest no longer wins)`);
