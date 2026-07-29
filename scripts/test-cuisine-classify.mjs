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
import { classifyCuisine, LOW_CONFIDENCE, ALL_CUISINES, NAME_CUISINE, TYPE_CUISINE } from "../lib/cuisine.js";

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
