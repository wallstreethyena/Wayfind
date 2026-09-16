#!/usr/bin/env node
// check-curated-library-fallback — a curated tile must read the owned library
// when Google cannot be bought.
//
// 2026-09-15 (owner screenshot, "Best things to do today"): 0 curated picks,
// "Not enough data for this filter right now". September's free text_pro
// ledger stood at 4800/4800 since 07:05 UTC. /api/places/search answered every
// slot query with { places: [], gate: "free-budget" } — while the SAME endpoint
// with cat=attractions&inv=1 returned 40 owned attractions within 25 miles.
// The tile never told the server which library it stood in for, so the
// fallback that exists for exactly this day never ran.
//
// Owner: "we have the cards in our cache in our library why are we not using
// that." This guard keeps the answer "we are":
//
//   1. searchNearbyPlaces carries an optional `cat` to proxySearch.
//   2. openCurated passes INV_CAT_FOR_TILE[kind] on every slot search.
//   3. The mapping covers every non-bestof tile and only names categories
//      serveFromInventory can actually serve.
//   4. sameIdSet() — executed — collapses identical slot answers into ONE
//      list so no slot header is printed over rows that never matched it.
//   5. COST INVARIANT: `cat` never reaches the Google request body or the
//      server cache key. Zero new spend, zero cache pollution.
import { readFileSync } from "node:fs";
import { INV_CAT_FOR_TILE, sameIdSet, tileAdmits, OUTING_TILES } from "../lib/curatedLibrary.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
const read = (p) => strip(readFileSync(new URL(p, import.meta.url), "utf8"));

const GOOGLE = read("../lib/google.js");
const HOME = read("../app/home.js");
const ROUTE = read("../app/api/places/search/route.js");
const INV = read("../lib/inventoryServe.js");

// 1. the wire
ok(/export function searchNearbyPlaces\(query, center, radiusMiles = DEFAULT_RADIUS_MI, cat\)/.test(GOOGLE),
  "searchNearbyPlaces accepts a 4th `cat` argument");
ok(/proxySearch\(query, center, radiusMeters, 10, cat \|\| undefined\)/.test(GOOGLE),
  "…and forwards it to proxySearch so the server can serve the owned library");

// 2. the caller
ok(/searchNearbyPlaces\(sl\.q, center, DEFAULT_RADIUS_MI, _INV_CAT\[kind\]\)/.test(HOME),
  "openCurated passes the tile's library category on every slot search");
ok(/const _INV_CAT = INV_CAT_FOR_TILE;/.test(HOME) && /from "\.\.\/lib\/curatedLibrary"/.test(HOME),
  "the mapping comes from lib/curatedLibrary (one source of truth, guard-executable)");
ok(/const oneLibraryList = sameIdSet\(results\);/.test(HOME) && /if \(!oneLibraryList\) c\.slots\.forEach/.test(HOME),
  "identical slot answers take the one-list path; per-slot headers only for distinct answers");

// 3. the mapping is complete and serveable
const CURATED_KINDS = [...HOME.matchAll(/^\s{4}(today|food|experiences|nightlife|shopping|stays|bestof): \{ title:/gm)].map((m) => m[1]);
ok(CURATED_KINDS.length >= 6, `found the CURATED tile table in home.js (${CURATED_KINDS.length} kinds)`);
for (const k of CURATED_KINDS) {
  if (k === "bestof") continue;
  ok(typeof INV_CAT_FOR_TILE[k] === "string", `tile "${k}" names a library category`);
}
const SERVEABLE = (INV.match(/const CATS = new Set\(\[([^\]]+)\]\)/) || [, ""])[1].match(/"([a-z]+)"/g)?.map((s) => s.replace(/"/g, "")) || [];
ok(SERVEABLE.length >= 5, `read serveFromInventory's category set (${SERVEABLE.join(", ")})`);
for (const [k, cat] of Object.entries(INV_CAT_FOR_TILE)) {
  ok(SERVEABLE.includes(cat), `"${k}" -> "${cat}" is a category serveFromInventory can serve`);
}

// 4. executed: the one-list collapse
const A = [{ id: "a" }, { id: "b" }, { id: "c" }];
const Ashuf = [{ id: "c" }, { id: "a" }, { id: "b" }];
const B = [{ id: "a" }, { id: "x" }];
ok(sameIdSet([A, Ashuf, A, Ashuf]) === true, "four slots, same ids in any order -> one list");
ok(sameIdSet([A, B, A, A]) === false, "one slot differs -> labeled slots as before");
ok(sameIdSet([A]) === false, "a single slot never collapses (nothing to collapse)");
ok(sameIdSet([[], [], []]) === false, "all-empty is not a library answer (honest empty state stays)");
ok(sameIdSet(null) === false && sameIdSet([A, null]) === false, "defensive on bad input");

// 6. executed (2026-09-16): the two "what to go and DO" tiles apply the
//    existing outing rule; the other tiles do not. The rows that opened the
//    live tile the day the fallback shipped are the fixture.
{
  const medSpa = { id: "m", name: "Elite Medical Spa of Parrish", primaryType: "spa", rating: 4.9 };
  const wedding = { id: "w", name: "Bakers Ranch Wedding Venue", primaryType: "wedding_venue", rating: 4.9 };
  const massage = { id: "x", name: "MassageLuXe Parrish", primaryType: "massage", rating: 4.8 };
  const gym = { id: "g", name: "Crunch Fitness - Parrish", primaryType: "gym", rating: 4.8 };
  const escape = { id: "e", name: "Premier Escape Adventures", primaryType: "amusement_center", rating: 4.9 };
  const park = { id: "p", name: "Parrish Community Park", primaryType: "park", rating: 4.6 };
  const resortSpa = { id: "r", name: "The Spa at The Resort at Longboat Key Club", primaryType: "tourist_attraction", rating: 4.8 };
  ok(OUTING_TILES.has("today") && OUTING_TILES.has("experiences") && OUTING_TILES.size === 2, "exactly the two outing tiles are governed");
  for (const p of [medSpa, wedding, massage, gym, resortSpa]) ok(!tileAdmits("today", p), `today refuses ${p.name}`);
  for (const p of [escape, park]) ok(tileAdmits("today", p) && tileAdmits("experiences", p), `today/experiences admit ${p.name}`);
  for (const k of ["food", "nightlife", "shopping", "stays", "bestof"]) ok(tileAdmits(k, medSpa), `${k} is not an outing question and is untouched`);
  ok(/inCat\(p\) && tileAdmits\(kind, p\)/.test(HOME), "the on-screen pool picks apply tileAdmits");
  ok(/placeAllowed\(null, null, p\)\)\)\.then\(\(l\) => l\.filter\(\(p\) => tileAdmits\(kind, p\)\)\)/.test(HOME), "the fetched slot results apply tileAdmits AFTER the shared filter (check-gate's pattern stays intact)");
}

// 7. (2026-09-16) NO CENTER, NO SHEET. The ?exp=cur-today deep link fires
//    before `center` exists; searchNearbyPlaces(q, null) resolves [] with no
//    request and the sheet opened as a permanent empty state — verified live
//    on production after #1333 (zero /api/places/search requests). The ask is
//    parked and replayed once by an effect keyed on center.
{
  const open = HOME.slice(HOME.indexOf("const openCurated = async (kind, opts = {}) =>"));
  const guardIx = open.indexOf("if (!center) { _pendingCurated.current = { kind, opts }; return; }");
  const poolIx = open.indexOf("const _poolPicks = ");
  const searchIx = open.indexOf("searchNearbyPlaces(sl.q, center");
  ok(guardIx > 0 && guardIx < poolIx && guardIx < searchIx, "openCurated parks the ask when center is null, BEFORE the pool read and the slot searches");
  ok(/const _pendingCurated = useRef\(null\);/.test(HOME), "one parked ask lives in a ref (no state churn, no double-open)");
  ok(/useEffect\(\(\) => \{\s*if \(!center \|\| !_pendingCurated\.current\) return;\s*const p = _pendingCurated\.current; _pendingCurated\.current = null;\s*try \{ openCurated\(p\.kind, p\.opts\); \} catch \(e\) \{\}\s*\}, \[center\]\);/.test(HOME),
    "an effect keyed on center replays the parked ask exactly once");
  ok(/if \(!query \|\| !center\) return Promise\.resolve\(\[\]\);/.test(GOOGLE), "(the reason) searchNearbyPlaces with no center resolves [] without a request");
}

// 5. cost invariant — cat stays OUT of the paid request and the cache key
const keyLine = ROUTE.match(/const k = \[[^\n]+\]\.join\("\|"\);/);
ok(!!keyLine && !/\bcat\b/.test(keyLine[0]), "server cache key does not include cat (no cache split, no pollution)");
const body = ROUTE.match(/body: JSON\.stringify\(\{ textQuery[^\n]+\}\),/);
ok(!!body && !/\bcat\b/.test(body[0]), "Google searchText body does not include cat (zero spend change; note locationBias contains the letters c-a-t)");
ok(/gate: why/.test(ROUTE) && /serveFromInventory\(params\.cat, lat, lng, radius, n, params\.sub\)/.test(ROUTE),
  "the gate-blocked path still serves owned inventory by params.cat");

if (fail.length) {
  console.error(`check-curated-library-fallback: FAIL (${pass} ok, ${fail.length} failed)`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-curated-library-fallback: OK (${pass} checks)`);
