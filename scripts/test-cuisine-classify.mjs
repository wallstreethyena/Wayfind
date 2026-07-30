// scripts/test-cuisine-classify.mjs — locks the classifier, both directions.
//
// Cuisine is stored nowhere today, so users cannot search by kind of food at all.
// The two fixtures that matter most are RED ones, named in the brief, because a
// name-based signal that is not vetoed is worse than no signal:
//   "Kobe Steakhouse"         must NOT classify japanese  (Kobe is a beef breed)
//   "Havana Nights Nightclub" must NOT classify cuban     (it is a nightclub)
//
// Names are still required. Google has no cuban_restaurant, no
// puerto_rican_restaurant, no colombian_restaurant and no
// venezuelan_restaurant — all of it collapses into latin_american_restaurant or
// plain restaurant. In Tampa and Orlando those are distinct and large. So the
// test is not "do names work", it is "do names work WITHOUT being fooled".
import { classifyCuisine, LOW_CONFIDENCE, ALL_CUISINES, NAME_CUISINE, TYPE_CUISINE, dishMentions, CUISINE_DISH_RX } from "../lib/cuisine.js";

let pass = 0;
const fail = (m) => { console.error("test-cuisine-classify: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const C = (name, types = [], editorial = "") => classifyCuisine({ name, google_types: types, editorial });
const has = (r, c) => r.cuisines.includes(c);

// ── THE RED CASES ─────────────────────────────────────────────────────────
{
  const kobe = C("Kobe Steakhouse", ["steak_house", "restaurant"]);
  ok(!has(kobe, "japanese"), "Kobe Steakhouse is NOT japanese — Kobe is a beef breed before it is a city");
  ok(has(kobe, "steakhouse"), "...and it IS a steakhouse, so the veto is scoped, not a blanket rejection");

  const havana = C("Havana Nights Nightclub", ["night_club", "bar"]);
  ok(havana.cuisines.length === 0, "Havana Nights Nightclub gets NO cuisine — a nightclub is not a restaurant");
  ok(/vetoed/.test(havana.reason), `the reason names the veto (got "${havana.reason}")`);

  // The veto must not overreach: a real Cuban restaurant with Havana in the name
  // must still classify.
  ok(has(C("Havana Cafe", ["restaurant"]), "cuban"), "Havana Cafe IS cuban — the veto targets nightclubs, not the word Havana");
  ok(has(C("Kobe Japanese Steakhouse", ["japanese_restaurant"]), "japanese"),
    "Kobe JAPANESE Steakhouse is japanese — the `unless` clause lets a real one through");
}

// ── the cuisines Google cannot express ────────────────────────────────────
// Every one of these has NO Google type. If names did not work, these would be
// unreachable in the product.
for (const [name, cuisine] of [
  ["El Mofongo Criollo", "puerto-rican"],
  ["Lechonera La Isla", "puerto-rican"],
  ["La Cubana Cafe", "cuban"],
  ["Ropa Vieja Grill", "cuban"],
  ["Arepas El Cacao", "colombian"],
  ["Bandeja Paisa Express", "colombian"],
  ["Cachapas y Mas", "venezuelan"],
  ["Pupuseria Salvadorena", "salvadoran"],
  ["Mangu Dominican Kitchen", "dominican"],
  ["Griot Haitian Cuisine", "haitian"],
]) ok(has(C(name, ["restaurant"]), cuisine), `"${name}" -> ${cuisine} (Google has no type for this)`);

// ── the types I wrongly said did not exist ────────────────────────────────
// I asserted in three files that Google has no cuban_restaurant /
// colombian_restaurant / peruvian_restaurant / caribbean_restaurant /
// argentinian_restaurant. All five exist in the live inventory. The cost was not
// cosmetic: Latin Touch Sandwich Shop CARRIES cuban_restaurant and was scored
// 0.55 off an editorial guess, which nearly dropped Cuban below Tampa's chip
// floor. Note the spelling — Google uses `argentinian_restaurant`.
for (const [type, cuisine] of [
  ["cuban_restaurant", "cuban"], ["colombian_restaurant", "colombian"],
  ["peruvian_restaurant", "peruvian"], ["caribbean_restaurant", "caribbean"],
  ["argentinian_restaurant", "argentine"],
]) {
  const r = C("Somewhere", [type, "restaurant"]);
  ok(has(r, cuisine), `${type} -> ${cuisine} at type strength`);
  ok(r.confidence === 0.9, `${type} scores 0.9, not an editorial guess (got ${r.confidence})`);
}
// ...and the ones that genuinely have no type still depend on names.
for (const absent of ["puerto_rican_restaurant", "venezuelan_restaurant", "dominican_restaurant", "salvadoran_restaurant", "haitian_restaurant"])
  ok(!Object.keys(TYPE_CUISINE).includes(absent),
    `${absent} is NOT claimed as a type — names are the only route to it`);
ok(has(C("Latin Touch Sandwich Shop", ["sandwich_shop", "cuban_restaurant", "breakfast_restaurant"]), "cuban"),
  "the real row that exposed the gap now classifies at type strength");
ok(has(C("Kubana Kafe", ["coffee_shop", "cafe"]), "cuban"),
  "Kubana is a Cuban spelling the name pattern originally missed");

// ── signal 4: review synthesis tests DISHES, not the word ─────────────────
// A shop pouring one Cuban-style shot among many origins is not a Cuban kitchen.
// Noble Brew's editorial calls its menu "a coffee atlas"; zero of five reviews
// mentioned a Cuban dish. Kubana Kafe had two. That difference is invisible to a
// name or word match.
ok(dishMentions("cuban", ["The cubano here is unreal", "good wifi"]) === 1, "a real dish mention counts");
ok(dishMentions("cuban", ["Cuban-style shot was fine", "matcha latte"]) === 0,
  "the WORD Cuban is not a dish — this is what separates a kitchen from a coffee atlas");
ok(dishMentions("cuban", ["ropa vieja", "lechon asado", "medianoche"]) === 3, "each mention counts once");
ok(dishMentions("puerto-rican", ["the mofongo is the reason to come"]) === 1, "puerto-rican dishes are covered");
ok(dishMentions("cuban", null) === 0 && dishMentions("nonesuch", ["x"]) === 0, "total over junk input");
ok(Object.keys(CUISINE_DISH_RX).length >= 4, "dish patterns exist for the cuisines names alone cannot settle");

// ── types[] still leads where it exists ───────────────────────────────────
ok(C("Sushi Sake", ["sushi_restaurant", "japanese_restaurant"]).confidence === 0.9,
  "a types[] hit scores 0.9 — the strongest signal");
ok(C("Mofongo House", ["restaurant"]).confidence === 0.7, "a name+dish hit scores 0.7");
ok(C("Corner Cafe", ["cafe"], "A counter serving lechon and croquetas.").confidence === 0.55,
  "an editorial-prose hit scores 0.55 — weakest, and below the re-check floor");
ok(0.55 < LOW_CONFIDENCE, "the editorial tier sits BELOW the re-check floor, so the cron revisits it");

// ── specific beats generic ────────────────────────────────────────────────
// For a FILTER, "asian" is nearly useless next to "korean".
{
  const r = C("Seoul Garden", ["asian_restaurant", "korean_restaurant"]);
  ok(has(r, "korean") && !has(r, "asian"), "korean wins over asian — a generic label is dropped when a specific one exists");
  const g = C("Pan Asian Bistro", ["asian_restaurant"]);
  ok(has(g, "asian") && g.reason === "generic-only",
    "...but a genuinely generic place keeps its generic label, flagged generic-only rather than discarded");
}
// The KPOT false positive that the hot-pot fix removed.
{
  const k = C("KPOT Korean BBQ & Hot Pot", ["restaurant"]);
  ok(has(k, "korean"), "KPOT is korean");
  ok(!has(k, "chinese"),
    "KPOT is NOT chinese — 'hot pot' is pan-Asian, and for a FILTER a wrong extra label shows a Korean place to someone who asked for Chinese");
}

// ── an honest blank is a distinct outcome ─────────────────────────────────
{
  const u = C("Joe's Place", ["restaurant"]);
  ok(u.cuisines.length === 0 && u.reason === "unclassifiable",
    "no signal returns unclassifiable — an HONEST answer, and NOT the same as never-attempted");
  ok(C("").reason === "no-name", "a missing name is its own reason, not silently unclassifiable");
  ok(classifyCuisine(null).cuisines.length === 0, "total over null");
  ok(classifyCuisine({ name: "x" }).cuisines.length === 0, "total over a row with no types and no editorial");
}

// ── the vocabulary is closed and consistent ───────────────────────────────
ok(ALL_CUISINES.length >= 30, `the vocabulary is declared (${ALL_CUISINES.length} labels)`);
for (const { cuisine } of NAME_CUISINE) ok(ALL_CUISINES.includes(cuisine), `${cuisine} is in ALL_CUISINES`);
for (const c of Object.values(TYPE_CUISINE)) ok(ALL_CUISINES.includes(c), `${c} is in ALL_CUISINES`);
ok(new Set(ALL_CUISINES).size === ALL_CUISINES.length, "ALL_CUISINES has no duplicates");
// Every name pattern needs a DISH or cultural marker, not just a country word —
// a bare country word is what makes a name signal a liability.
for (const { cuisine, rx } of NAME_CUISINE) {
  const alts = rx.source.replace(/^\\y\(|\)\\y$/g, "").split("|");
  ok(alts.length >= 3, `${cuisine} has >=3 alternatives (${alts.length}) — one country word alone is not evidence`);
}

console.log(`test-cuisine-classify: OK — ${pass} assertions (Kobe not japanese, Havana Nights vetoed, the ten Google cannot express, specific over generic, honest blanks)`);
