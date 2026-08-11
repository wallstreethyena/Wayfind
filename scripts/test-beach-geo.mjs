// scripts/test-beach-geo.mjs — THE 23-MILE BEACH RULE (owner, 2026-07-28).
//
// The bug this locks shut: the homepage told a user in Orlando "Beach day,
// decided" and deep-linked them to a hardcoded Gulf-coast metro roughly 60
// miles away. The beach hero rendered unconditionally and only swapped its
// COPY when no beach was found, so the absence of a beach was invisible.
//
// The owner's rule, verbatim: "a beach should not be recommended unless there
// is a beach within 23 miles of them... something that has the word beach
// should be vetted." And the cost constraint: "not in a way that we spend lots
// of money on." So the whole rule is arithmetic over coordinates the rows
// already carry — this file fails the build if any of that regresses.
import { readFileSync } from "fs";
import { BEACH_NEAR_MI, beachMilesFrom, saysBeach, beachesWithin, vetBeachDistance } from "../lib/beaches.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const sources = readFileSync(new URL("../lib/sources.js", import.meta.url), "utf8");
const tb = readFileSync(new URL("../lib/todaysBest.js", import.meta.url), "utf8");

// ── the constant itself ──────────────────────────────────────────────────────
ok(BEACH_NEAR_MI === 23, "the owner's radius is 23 miles — one constant, no literals scattered across surfaces");

// ── distance, measured from the USER ────────────────────────────────────────
const ORLANDO = { lat: 28.5384, lng: -81.3789 };
const PARRISH = { lat: 27.5689, lng: -82.4393 };   // the app's DEFAULT_CENTER
const COQUINA = { lat: 27.4586, lng: -82.6947 };   // Coquina Beach, Anna Maria
const SIESTA = { lat: 27.2664, lng: -82.5507 };    // Siesta Key

const dOrlando = beachMilesFrom(COQUINA, ORLANDO);
const dParrish = beachMilesFrom(COQUINA, PARRISH);
ok(dOrlando > 100 && dOrlando < 130, "Orlando -> Coquina is a real haversine (~115 mi), not a guess: " + dOrlando);
ok(dParrish > 14 && dParrish < 22, "Parrish -> Coquina is ~17 mi — the owner's own home case must survive the rule: " + dParrish);
ok(beachMilesFrom(COQUINA, null) === null, "no center and no carried distance -> null, never a fabricated 0");
ok(beachMilesFrom({ distance_mi: 9.5 }, null) === 9.5, "a row with no coords falls back to the distance it carries");
ok(beachMilesFrom({ distMi: 4 }, null) === 4, "the Places-side field name (distMi) is understood too");
ok(beachMilesFrom({}, null) === null, "nothing to measure with -> null (fail-closed input)");
// coordinates BEAT any carried distance: a row's distance_mi was measured from
// whatever point the server searched around, which is not always the user.
ok(Math.abs(beachMilesFrom({ ...COQUINA, distance_mi: 2 }, ORLANDO) - dOrlando) < 0.01, "real coordinates override a stale carried distance");

// ── what counts as "saying beach" ───────────────────────────────────────────
ok(saysBeach({ category: "beach" }) === true, "a verified beach category says beach");
ok(saysBeach({ types: ["natural_feature", "beach"] }) === true, "a beach TYPE says beach");
ok(saysBeach({ name: "Coquina Beach" }) === true, "a beach NAME says beach");
ok(saysBeach({ title: "Siesta Key Beach" }) === true, "engine rows use `title`, not `name` — both are read");
ok(saysBeach({ name: "Beach Bum Burgers", types: ["restaurant", "food"] }) === false, "a restaurant named Beach ___ is not a beach (same rule as isBeach in home.js)");
ok(saysBeach({ name: "Beachside Nail Salon", types: ["salon", "store"] }) === false, "a shop named Beach ___ is not a beach");
ok(saysBeach({ name: "Anna Maria Island Inn", types: ["lodging"] }) === false, "lodging is not a beach");
ok(saysBeach({ name: "Riverwalk Park", types: ["park"] }) === false, "an ordinary park does not say beach");
ok(saysBeach(null) === false && saysBeach(undefined) === false, "null-safe");

// ── beachesWithin: the hero's data gate ─────────────────────────────────────
const POOL = [
  { name: "Coquina Beach", rating: 4.7, reviews: 5000, ...COQUINA },
  { name: "Siesta Key Beach", rating: 4.8, reviews: 20000, ...SIESTA },
  { name: "West Beach Park", rating: 4.4, reviews: 300, lat: 28.5586, lng: -81.6081 }, // the Orlando "beach" — a lake
];
const fromOrlando = beachesWithin(POOL, ORLANDO);
ok(fromOrlando.length === 1 && fromOrlando[0].name === "West Beach Park", "from Orlando only the ~15-mi lake beach survives — the Gulf beaches are gone");
const fromParrish = beachesWithin(POOL, PARRISH);
ok(fromParrish.some((b) => b.name === "Coquina Beach"), "from Parrish the real Gulf beach survives — the rule must not break the coastal case");
ok(!fromParrish.some((b) => b.name === "West Beach Park"), "from Parrish the Orlando lake is 90+ mi away and drops");
ok(fromParrish.every((b) => b.distance_mi <= BEACH_NEAR_MI), "every surviving row is inside the radius");
ok(fromParrish.every((b) => Math.abs(b.distance_mi - beachMilesFrom(b, PARRISH)) < 0.01), "distance_mi is REWRITTEN to the distance from the user, so the card's '17 mi away' is true");
ok(beachesWithin([{ name: "Mystery Beach" }], PARRISH).length === 0, "FAIL-CLOSED: a beach with no provable location is dropped, never assumed near");
ok(beachesWithin(null, PARRISH).length === 0 && beachesWithin(undefined, null).length === 0, "null-safe");
// the boundary is inclusive and it is the constant, not a magic number
ok(beachesWithin([{ name: "Edge Beach", distance_mi: 23 }], null).length === 1, "exactly 23 mi is inside the rule");
ok(beachesWithin([{ name: "Edge Beach", distance_mi: 23.1 }], null).length === 0, "23.1 mi is outside the rule");

// ── vetBeachDistance: the universal mixed-list vet ──────────────────────────
const MIXED = [
  { name: "Coquina Beach", ...COQUINA },
  { name: "The Escape Game Orlando", types: ["tourist_attraction"], lat: 28.44, lng: -81.47 },
  { name: "Beach Bum Burgers", types: ["restaurant", "food"], lat: 28.5, lng: -81.4 },
  { name: "Nameless place with no coords", types: ["park"] },
];
const vetted = vetBeachDistance(MIXED, ORLANDO);
ok(!vetted.some((p) => p.name === "Coquina Beach"), "the far beach is vetted OUT of a mixed list");
ok(vetted.some((p) => p.name === "The Escape Game Orlando"), "non-beach rows pass through untouched");
ok(vetted.some((p) => p.name === "Beach Bum Burgers"), "a restaurant that merely has 'Beach' in its name is NOT collateral damage");
ok(vetted.some((p) => p.name === "Nameless place with no coords"), "a non-beach row with no coords is not punished by a beach rule");
ok(vetBeachDistance(MIXED, PARRISH).some((p) => p.name === "Coquina Beach"), "the same list from the coast keeps the beach");
ok(vetBeachDistance([], ORLANDO).length === 0 && Array.isArray(vetBeachDistance(null, ORLANDO)), "null/empty-safe");

// ── the homepage hero: rendered ONLY when a nearby beach exists ─────────────
ok(/import \{ rankBeaches, beachesWithin, BEACH_NEAR_MI \} from "\.\.\/lib\/beaches"/.test(home), "home.js imports the ONE rule, it does not re-implement it");
ok(/const rows = beachesWithin\(fetched, center, BEACH_NEAR_MI\)/.test(home), "the beach hero's pool is filtered by the 23-mile rule BEFORE ranking");
ok((home.match(/\{bestBeach && \(/g) || []).length === 2, "both beach hero slides are gated on a real nearby beach — no beach, no card");
ok(!/Beach day, decided/.test(home), "the placeholder copy that used to render with NO beach behind it is gone");
ok(!/manatee-sarasota/.test(home), "the hardcoded Gulf-metro fallback destination is gone — the hero can only open a metro it actually found");
ok(/p_radius_mi: 60/.test(home), "the RPC still asks for 60 mi: ONE call, unchanged cost — the rule is applied to data already in memory, not by re-querying");
ok((home.match(/image="\/cards\/beach-adobestock-216195684\.jpeg"/g) || []).length === 2, "both beach slides still exist in source (gated, not deleted)");

// ── the chokepoints: every other beach-shaped surface ───────────────────────
ok(/import \{ vetBeachDistance, BEACH_NEAR_MI \} from "\.\/beaches"/.test(sources), "lib/sources.js — the one door every venue list walks through — imports the rule");
ok((sources.match(/vetBeachDistance\(out\.filter/g) || []).length === 2, "BOTH return paths of searchPlaces are vetted — the no-secondary-source shortcut returns early and would otherwise leak a beach");
ok((sources.match(/qualityFloor\(p\)\), center, beachMax\)/g) || []).length === 2, "both vetted paths pass the SAME cap — the early return cannot quietly use a different rule from the merged one");

// ── RECOMMENDATION vs REQUEST: the explicit-browse exemption ────────────────
// Tapping "Beach day" is a REQUEST; a beach appearing under Food or Things to
// do is a RECOMMENDATION. The owner's rule governs recommendations. These
// assertions pin the exemption narrowly so it can never widen into "beaches
// are exempt from the rule" or shrink into "the Beach category is broken".
ok(/const beachMax = categoryId === "beach" \? Math\.max\(BEACH_NEAR_MI, radiusMeters \/ 1609\.34\) : BEACH_NEAR_MI;/.test(sources), "only an explicit beach browse honors its own radius; every other category holds to BEACH_NEAR_MI");
ok(/Math\.max\(BEACH_NEAR_MI,/.test(sources), "the exemption can only ever WIDEN the radius — a small search radius must never tighten the rule below 23 mi");
// and the vet actually honors a caller-supplied cap, in both directions
const FAR = [{ name: "Far Beach", distance_mi: 30 }];
ok(vetBeachDistance(FAR, null).length === 0, "30 mi is out under the default rule");
ok(vetBeachDistance(FAR, null, 48).length === 1, "…and in when an explicit beach browse asks for a wider radius");
ok(beachesWithin(FAR, null, 48).length === 1, "beachesWithin takes the same override, so the two helpers cannot diverge");
// 2026-08-11: the list is assembled into `pool` first (discovery gate + the
// everywhere fallback); the beach vet still runs on the way into the sort.
ok(/vetBeachDistance\(pool\.filter\(isRenderableThing\), \{ lat, lng \}\)/.test(tb), "wf_things_to_do searches 30 mi — its beach rows are vetted to 23");
ok(/category === "beach" \? beachesWithin\(ranked, \{ lat, lng \}\) : vetBeachDistance\(ranked, \{ lat, lng \}\)/.test(tb), "wf_best_picks searches 25 mi — the beach SECTION is held to 23, and every other section still vets beach-named rows");

// ── THE SEARCHED LOCATION, not just the device location ────────────────────
// The owner, asked to settle the scope, drew the line himself: "we dont show a
// beach hero card for someone who is currently not within 23 miles from a beach
// OR SEARCH FOR A PLACE that is not 23 miles from a beach — we keep the beach
// menu live for the user to search; the hero cards are recommendations."
//
// So the rule has to follow `center`, which is the ONE thing both the device
// fix and the search box write to. It already does. Nothing pinned it, which
// means a future refactor could pin the hero to geolocation and pass every
// other assertion in this file while quietly reintroducing the bug: search
// Orlando from the coast and still get a beach card.
{
  const eff = home.indexOf("setBestBeach(bPool.length");
  ok(eff > 0, "the beach hero effect is still findable");
  const deps = home.slice(eff, eff + 700).match(/\}, \[([^\]]*)\]\);/);
  ok(!!deps && /\bcenter\b/.test(deps[1]), "the beach hero re-runs on `center` — searching a city re-applies the 23-mile rule from the SEARCHED point, not the device");
}
ok(/const \[center, setCenter\] = useState\(DEFAULT_CENTER\)/.test(home), "`center` is one piece of state — the single source of truth the rule measures from");
{
  // Every path a user can take to name a place must land on the same `center`:
  // picking a suggestion, submitting a freetext search that geocodes, and
  // jumping to a featured area. If any one of them stopped writing center, the
  // hero would keep showing beaches from wherever the user physically is.
  const pick = home.indexOf("async function pickSuggestion(item)");
  ok(pick > 0, "pickSuggestion is still the search-suggestion handler");
  ok(/setCenter\(/.test(home.slice(pick, pick + 4000)), "picking a search suggestion writes `center`, so a searched city is subject to the same rule as a located one");
}

// ── the cost constraint, asserted ───────────────────────────────────────────
ok(!/fetch\(/.test(readFileSync(new URL("../lib/beaches.js", import.meta.url), "utf8")), "lib/beaches.js makes NO network call — the geographic pull is arithmetic on data we already paid for");

console.log(failn ? `test-beach-geo: FAIL ${failn}/${n}` : `test-beach-geo: ${n}/${n} pass`);
process.exit(failn ? 1 : 0);
