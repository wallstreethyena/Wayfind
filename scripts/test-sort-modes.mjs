// scripts/test-sort-modes.mjs — locks "every list is monotonic in the sort the
// reader chose" (owner, 2026-09-28: "0.7 miles, then 15 miles, then 0.9 miles").
//
// Behavior is asserted by CALLING the real pipeline pieces (dedupePlaces +
// sortPlacesBy), reproducing the exact incident: a chain whose near branch was
// sorted first and whose far flagship then inherited that slot via brand
// collapse. The static half asserts app/home.js orders AFTER dedupe.
import { readFileSync } from "node:fs";
import { dedupePlaces, betterPlace } from "../lib/placeDedupe.js";
import { sortPlacesBy, isSortedBy, nearestBranch, byDistance, comparatorFor } from "../lib/sortModes.js";

let pass = 0;
const fail = (m) => { console.error("test-sort-modes: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const row = (id, name, distMi, extra = {}) => ({ id, name, distMi, rating: 4.5, reviews: 100, wfScore: 88, ...extra });
// The incident shape: Chain near (closed, fewer reviews) and Chain far (open,
// more reviews) — betterPlace prefers the far one.
const pool = () => [
  row("a", "Chain Cafe", 0.7, { openNow: false, reviews: 40 }),
  row("b", "Local Spot", 0.9, { openNow: null }),
  row("c", "Chain Cafe", 15.2, { openNow: true, reviews: 900 }),
  row("d", "Other Place", 3.1, { openNow: true }),
  row("e", "No Coords", null),
];

// ── negative control: the OLD order (sort, then dedupe) really is broken ───────
{
  const old = dedupePlaces(pool().sort(byDistance), true);
  ok(!isSortedBy(old, "near"), "control: sort-then-dedupe must reproduce the non-monotonic incident (else this test proves nothing)");
  ok(old[0].distMi === 15.2, "control: the far flagship inherits the near branch's slot under the old order");
}

// ── the fix: dedupe (nearest branch) then sort ──────────────────────────────────
{
  const out = sortPlacesBy(dedupePlaces(pool(), true, nearestBranch), "near");
  ok(isSortedBy(out, "near"), "near: ascending distance");
  ok(out.map((p) => p.id).join(",") === "a,b,d,e", "near: chain collapses to its NEAREST branch, unknown distance last — got " + out.map((p) => p.id).join(","));
}
// every mode stays monotonic after the default brand collapse too
for (const mode of ["near", "rated", "price"]) {
  const mixed = pool().map((p, i) => ({ ...p, wfScore: 70 + i * 5, rating: 4 + i * 0.2, price_level: (i * 3) % 4 }));
  const out = sortPlacesBy(dedupePlaces(mixed, true, betterPlace), mode);
  ok(isSortedBy(out, mode), mode + ": monotonic after dedupe");
}
ok(comparatorFor("fit") === null && sortPlacesBy([row("x", "X", 1)], "fit").length === 1, "unknown mode passes through unchanged");
ok(byDistance(row("o", "O", 2, { openNow: true }), row("c", "C", 2, { openNow: false })) < 0, "near: open-now only breaks exact distance ties");
ok(byDistance(row("c", "C", 1, { openNow: false }), row("o", "O", 2, { openNow: true })) < 0, "near: open-now never beats a closer place");

// ── static: the browse feed orders AFTER dedupe, and the hero is row 1 ───────────
// Whole-line // comments only: a naive /* */ strip eats real code in home.js
// (glob-like "/*" inside strings), which made every probe read as absent.
const code = readFileSync("app/home.js", "utf8").replace(/^\s*\/\/.*$/gm, "");
ok(code.length > 400000 && /function PlaceCard\(/.test(code), "positive control: home.js read intact");
const iDedupe = code.search(/const _dedupedPool = dedupePlaces\(/);
const iSort = code.search(/viewBase = sortPlacesBy\(_dedupedPool, sortBy\)/);
ok(iDedupe > 0 && iSort > iDedupe, "home.js: browse pool is deduped before the explicit sort");
ok(!/const view = dedupePlaces\(/.test(code), "home.js: no dedupe after ordering the browse view");
ok(/sortBy === "near" \? nearestBranch/.test(code), "home.js: Closest first keeps the nearest branch");
ok(/const exHero = [^\n]*comparatorFor\(sortBy\) \? consolidatedView\[0\]/.test(code), "home.js: hero is row 1 under an explicit sort");

console.log(`test-sort-modes: OK — ${pass} assertions (incident reproduced on old order, fixed on new; near/rated/price monotonic)`);
