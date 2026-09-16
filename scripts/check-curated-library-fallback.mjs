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
import { INV_CAT_FOR_TILE, sameIdSet } from "../lib/curatedLibrary.js";

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
