#!/usr/bin/env node
// scripts/check-inventory-paging.mjs — where the next inv=1 page starts
// (lib/inventoryPaging.js), proven by CALLING it over simulated page walks.
//
// Found by the post-deploy parity audit of #1495 (2026-09-23): Orlando,
// Activities > All, total 692, the walk collected 691. Page 0 of the discovery
// branch carries exact-ID extras on top of the 400 ranked rows, and advancing
// by the count of rows RECEIVED skipped the ranked row at 400 (The Escape
// Company). Separately, pages are fresh ranked reads that the edge cache can
// serve from different moments, so a place can drift across a boundary.
import { readFileSync } from "node:fs";
import { INV_PAGE_OVERLAP, nextPageOffset } from "../lib/inventoryPaging.js";

let n = 0;
const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };

// ── the rule ──
ok(INV_PAGE_OVERLAP > 0 && INV_PAGE_OVERLAP < 100, `INV_PAGE_OVERLAP is a small positive overlap (got ${INV_PAGE_OVERLAP})`);
ok(nextPageOffset({ nextOffset: 400 }, 0, 401) === 400 - INV_PAGE_OVERLAP, "the route's nextOffset wins over the count of rows received (page 0 with one discovery extra)");
ok(nextPageOffset({}, 400, 292) === 692 - INV_PAGE_OVERLAP, "without nextOffset, the next page starts at requested + received, minus the overlap");
ok(nextPageOffset({ nextOffset: 10 }, 0, 10) === 1, "a page smaller than the overlap still makes progress (never re-requests the same offset)");
ok(nextPageOffset({ nextOffset: 400 }, 400, 0) === 400, "no progress means no overlap; the caller's hasMore check ends the walk");

// ── simulated walks: a fake route over a ranked list, the client's dedupe ──
const ranked = (N) => Array.from({ length: N }, (_, i) => `p${String(i).padStart(4, "0")}`);
function fakeRoute(list, extras = []) {
  return (offset, n = 400) => {
    const served = list.slice(offset, offset + n);
    const places = offset === 0 ? [...served, ...extras.filter((id) => !served.includes(id))] : served;
    return { places: places.map((id) => ({ id })), hasMore: offset + served.length < list.length, nextOffset: offset + served.length, total: list.length };
  };
}
function walk(pageAt, advance) {
  const seen = new Set();
  let offset = 0;
  for (let guard = 0; guard < 50; guard++) {
    const j = pageAt(offset, guard);
    for (const p of j.places) seen.add(p.id);
    if (!j.hasMore || !j.places.length) break;
    offset = advance(j, offset);
  }
  return seen;
}
const byRule = (j, offset) => nextPageOffset(j, offset, j.places.length);
const byReceived = (j, offset) => offset + j.places.length; // the pre-fix client rule

{
  // Discovery extras: page 0 = 400 ranked + an exact-ID candidate that ranks 450.
  const list = ranked(692);
  const route = fakeRoute(list, ["p0450"]);
  const fixed = walk((o) => route(o), byRule);
  const old = walk((o) => route(o), byReceived);
  ok(fixed.size === 692, `with nextOffset, every one of the 692 ranked places is reached (got ${fixed.size})`);
  ok(old.size === 691 && !old.has("p0400"), `control: counting rows received skips the ranked row at 400, as measured live (got ${old.size}, has p0400=${old.has("p0400")})`);
}
{
  // Ranking drift between page reads: a place ranked 395 on the page-0 read
  // is ranked 405 by the time page 1 is read.
  const before = ranked(700);
  const after = before.slice();
  const [moved] = after.splice(395, 1);
  after.splice(405, 0, moved);
  const pageAt = (o, i) => fakeRoute(i === 0 ? before : after)(o);
  // After the move, the row that slid up from 400 to 399 is on neither page
  // without an overlap.
  const fixed = walk(pageAt, byRule);
  const noOverlap = walk(pageAt, (j, offset) => (j.nextOffset != null ? j.nextOffset : offset + j.places.length));
  ok(fixed.size === 700, `with the overlap, a place that drifts across the page boundary between reads is still reached (got ${fixed.size})`);
  ok(noOverlap.size === 699, `control: without the overlap, the same drift loses one place (got ${noOverlap.size})`);
}

// ── wiring: the route reports nextOffset on both inv=1 branches ──
const ROUTE = readFileSync(new URL("../app/api/places/search/route.js", import.meta.url), "utf8");
ok((ROUTE.match(/nextOffset: meta\.offset \+ meta\.served/g) || []).length === 2, "both inv=1 branches (plain and discovery) must report nextOffset: meta.offset + meta.served");
const PROOF = readFileSync(new URL("./lib/parity/pagingProof.mjs", import.meta.url), "utf8");
ok(/offset = nextPageOffset\(r\.json, offset, r\.json\.places\.length\);/.test(PROOF), "the parity audit's page walk must advance with the same nextPageOffset rule as the client");

if (bad.length) {
  for (const m of bad) console.error("  ✗ " + m);
  console.error(`check-inventory-paging: FAIL (${bad.length} of ${n})`);
  process.exit(1);
}
console.log(`check-inventory-paging: OK — ${n} assertions (the next page follows the route's nextOffset, never the count of rows received, and overlaps by ${INV_PAGE_OVERLAP} rows so a place drifting across a boundary between reads is still reached)`);
