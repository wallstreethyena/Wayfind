// test-taxonomy — proves the deterministic taxonomy mapper (lib/placeTaxonomy.js)
// against REAL Google type output (pulled live from /api/places/search), not
// assumed types. Every place below is pinned to what Google actually returns —
// which is the whole point: Mote is a "research_institute" (no aquarium type),
// Siesta Beach has NO beach type, and a mapper tested on guessed types would go
// green while the seeder still misclassified them. Also asserts that every tag
// the mapper can emit is a real sub-filter id from lib/google.js SUBFILTERS
// (read from source here), so the read path can match tags by equality.
import { readFileSync } from "fs";
import { classifyPlace } from "../lib/placeTaxonomy.js";

// --- the sub-filter vocabulary, parsed from the source of truth ---
const src = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const sfBlock = src.slice(src.indexOf("export const SUBFILTERS"), src.indexOf("export function queryFor"));
const VOCAB = {};
for (const cat of ["food", "nightlife", "attractions", "beach", "hotels", "shopping"]) {
  const m = sfBlock.match(new RegExp(cat + "\\s*:\\s*\\[([\\s\\S]*?)\\]"));
  VOCAB[cat] = new Set(m ? [...m[1].matchAll(/id:\s*"([a-z]+)"/g)].map((x) => x[1]) : []);
}

let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; if (!cond) console.log("FAIL " + name); };

// case: assert category, that expected tags are present, and — always — that
// EVERY emitted tag is a member of the category's real sub-filter vocabulary.
function tc(label, { types = [], primaryType = null, name = "" }, expectCat, mustHaveTags = []) {
  const r = classifyPlace(types, primaryType, name);
  ok(`${label}: category=${expectCat} (got ${r.category})`, r.category === expectCat);
  for (const t of mustHaveTags) ok(`${label}: has tag "${t}" (got [${r.tags}])`, r.tags.includes(t));
  if (r.category) for (const t of r.tags) ok(`${label}: tag "${t}" is a real ${r.category} sub-filter id`, VOCAB[r.category].has(t));
  return r;
}

// ─── REAL types (verified live via /api/places/search near Sarasota) ─────────
tc("Selby (real)", { types: ["botanical_garden", "tourist_attraction", "museum", "point_of_interest", "establishment"], name: "Marie Selby Botanical Gardens Downtown Sarasota" }, "attractions", ["outdoors"]);

tc("Ringling (real)", { types: ["art_museum", "garden", "tourist_attraction", "history_museum", "performing_arts_theater", "event_venue", "museum", "point_of_interest", "establishment"], name: "The John and Mable Ringling Museum of Art" }, "attractions", ["museums", "arts"]);

tc("Myakka State Park (real)", { types: ["state_park", "park", "point_of_interest", "establishment"], name: "Myakka River State Park" }, "attractions", ["outdoors"]);

tc("Owen's Fish Camp (real)", { types: ["seafood_restaurant", "restaurant", "point_of_interest", "food", "establishment"], name: "Owens Fish Camp" }, "food", []);

// Siesta Beach: Google returns NO `beach` type — only the NAME saves it.
tc("Siesta Beach (real, name-only)", { types: ["point_of_interest", "establishment"], name: "Siesta Beach" }, "beach", ["beaches"]);

// Mote: `research_institute` only, and the Google name is "Mote Marine
// Laboratory" (no "aquarium" token) — types AND name are insufficient, so the
// mapper MUST return null and a marquee place like this MUST be an anchor.
{
  const r = classifyPlace(["research_institute", "point_of_interest", "establishment"], null, "Mote Marine Laboratory");
  ok("Mote (real): category is null -> requires an anchor override", r.category === null);
  ok("Mote (real): no tags when unclassified", r.tags.length === 0);
}

// St. Armands Circle: mixed-use. TYPES-ONLY it has `restaurant`, so food wins
// (historical_landmark is deliberately WEAK, so it is NOT dragged to attractions).
tc("St. Armands (types-only, mixed-use)", { types: ["shopping_mall", "historical_landmark", "beauty_salon", "historical_place", "park", "restaurant", "food", "point_of_interest", "establishment"], name: "St. Armands Circle" }, "food");
// WITH primaryType the ambiguity resolves — proves the seeder's primaryType mask matters.
tc("St. Armands (+primaryType shopping_mall)", { types: ["shopping_mall", "historical_landmark", "restaurant", "food"], primaryType: "shopping_mall", name: "St. Armands Circle" }, "shopping", ["malls"]);

// ─── precedence + tag guards ─────────────────────────────────────────────────
tc("resort -> hotels", { types: ["resort_hotel", "lodging"], name: "Longboat Key Club" }, "hotels");
tc("brewery -> nightlife", { types: ["brewery", "bar"], name: "Big Top Brewing" }, "nightlife", ["bars"]);
tc("mall -> shopping", { types: ["shopping_mall"], name: "Westfield Sarasota Square" }, "shopping", ["malls"]);
tc("bakery -> food/dessert", { types: ["bakery", "cafe"], name: "Pastry Art" }, "food", ["dessert"]);
tc("marina -> beach/marinas", { types: ["marina"], name: "Marina Jack" }, "beach", ["marinas"]);
tc("campground -> attractions/outdoors (not hotels)", { types: ["campground", "rv_park"], name: "Myakka Campground" }, "attractions", ["outdoors"]);

// primaryType votes first even when the type list is bare.
tc("primaryType decides (art_gallery)", { types: ["point_of_interest", "establishment"], primaryType: "art_gallery", name: "Some Gallery" }, "attractions", ["arts"]);

// GUARD: a restaurant named "...Beach..." must stay food — the name net only
// fires when the TYPES failed to classify (Beach Bistro is a restaurant).
tc("Beach Bistro guard (name must not override types)", { types: ["restaurant", "food", "point_of_interest"], name: "Beach Bistro" }, "food");

// GUARD: unclassifiable -> null, no tags.
{
  const r = classifyPlace([], null, "");
  ok("empty input -> null", r.category === null && r.tags.length === 0);
}

// `via` — HOW the category was decided (the seeder flags name-recovered rows).
ok("via: Selby decided by TYPES", classifyPlace(["botanical_garden", "tourist_attraction", "museum"], null, "Marie Selby Botanical Gardens").via === "types");
ok("via: Siesta Beach decided by NAME (=> review queue, last_verified_at=null)", classifyPlace(["point_of_interest", "establishment"], null, "Siesta Beach").via === "name");
ok("via: St. Armands +primaryType decided by PRIMARYTYPE", classifyPlace(["shopping_mall", "restaurant"], "shopping_mall", "St. Armands Circle").via === "primaryType");
ok("via: Mote unclassified => via null", classifyPlace(["research_institute"], null, "Mote Marine Laboratory").via === null);

console.log(`\ntest-taxonomy: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log("test-taxonomy: OK — mapper pinned to REAL Google types; every tag is a valid sub-filter id; primaryType + name paths verified");
