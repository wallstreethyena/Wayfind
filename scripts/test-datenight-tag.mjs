// test-datenight-tag.mjs — v8.24 (owner: "let's find other experience pills
// that match the place card — I have seen lots of hidden gems but we need to
// be looking for date night and whatever other experiences we have").
//
// Asserts ON THE CALL (repo doctrine): experienceTags() is executed against
// fixtures, not grepped. The tag's evidence contract: a real restaurant
// identity + (price tier >= 3, or >= 2 with a room-word name) + a 4.4 floor.
// The negative controls are the point — a cheap counter-serve and a pricey
// non-restaurant must never wear "Date night", or the tag becomes noise on
// exactly the cards the owner is trying to diversify.
import path from "node:path";
import { loadComponent } from "./lib/jsxLoad.mjs";

const ROOT = process.cwd();
let fails = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fails++; } };

const mod = await loadComponent(path.join(ROOT, "app/components/IconicPlaceCard.js"), ROOT);
const tags = (p) => mod.experienceTags(p, 4).map((t) => t.key);

// positives
ok(tags({ name: "Sunset Chophouse", types: ["restaurant"], rating: 4.7, reviews: 900, priceLevel: 3 }).includes("datenight"),
  "a $$$ 4.7 restaurant wears Date night");
ok(tags({ name: "Harbor Bistro", types: ["restaurant"], rating: 4.5, reviews: 300, priceLevel: 2 }).includes("datenight"),
  "a $$ room-word restaurant (bistro) wears Date night");
ok(tags({ name: "Vino Cellar Wine Bar", types: ["wine_bar"], rating: 4.6, reviews: 200, priceLevel: 2 }).includes("datenight"),
  "a wine bar with room evidence wears Date night");

// negative controls — each kills one specific failure mode
ok(!tags({ name: "Corner Taco", types: ["fast_food_restaurant"], rating: 4.6, reviews: 900, priceLevel: 1 }).includes("datenight"),
  "a $ counter-serve never wears Date night (price gate)");
ok(!tags({ name: "Plain Diner", types: ["restaurant"], rating: 4.5, reviews: 400, priceLevel: 2 }).includes("datenight"),
  "a $$ restaurant with NO room evidence never wears Date night");
ok(!tags({ name: "Sunset Mini Golf", types: ["amusement_park"], rating: 4.8, reviews: 900, priceLevel: 3 }).includes("datenight"),
  "a non-restaurant never wears Date night whatever it costs (identity gate)");
ok(!tags({ name: "Cheap Chophouse", types: ["restaurant"], rating: 4.2, reviews: 900, priceLevel: 3 }).includes("datenight"),
  "below the 4.4 floor never wears Date night (quality gate)");

// the deep-link stays live: ?exp=datenight must resolve in home.js's registry
import { readFileSync } from "node:fs";
const home = readFileSync(path.join(ROOT, "app/home.js"), "utf8");
ok(/^\s*datenight:\s*\{/m.test(home), "?exp=datenight resolves — the EXPERIENCES registry still carries the key");

// …and lib/tags.js's identity gate allows it on dining while refusing it on a theme park
const T = await import(path.join(ROOT, "lib/tags.js"));
ok(T.filterAllowed(T.resolveIdentity(["restaurant"], false), ["datenight"]).shown.includes("datenight"),
  "tags.js: dining identity allows datenight");
ok(!T.filterAllowed(T.resolveIdentity(["amusement_park"], false), ["datenight"]).shown.includes("datenight"),
  "tags.js: themePark identity refuses datenight");

if (fails) { console.error(`test-datenight-tag: ${fails} FAILED`); process.exit(1); }
console.log("test-datenight-tag: OK — 10 assertions EXECUTED (3 positives, 4 negative controls, deep-link + identity gates)");
