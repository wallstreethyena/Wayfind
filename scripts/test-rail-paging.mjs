#!/usr/bin/env node
// scripts/test-rail-paging.mjs — WO11 (2026-09-02, owner): "load the top ten
// based on the Wayfind score, and as they scroll ... start loading 10 more
// cards, and 10 more, instead of loading everything at once." This is a
// CALL-based test of the paging math in lib/railPage.js — page boundaries,
// determinism, dedupe, hasMore — executed against real inputs, never a
// regex over the source (see CLAUDE.md, "assert on the CALL, not the
// string").
import { pageOf, pageOneRail, pageAllRails, pageRailMenuRail, RAIL_PAGE_SIZE } from "../lib/railPage.js";

let pass = 0, fail = 0;
const ok = (cond, msg) => { cond ? pass++ : (fail++, console.error("  FAIL: " + msg)); };
const eq = (a, b, msg) => ok(a === b, `${msg}\n    got  ${JSON.stringify(a)}\n    want ${JSON.stringify(b)}`);

const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: "p" + i, governed_score: n - i }));

// ── 1. DEFAULT SIZE IS 10 — "the top ten" ───────────────────────────────────
eq(RAIL_PAGE_SIZE, 10, "the shared page size is 10, matching the owner's literal ask");

// ── 2. PAGE BOUNDARIES: every page is exactly `size` rows, none skipped ────
{
  const rows = mk(35);
  const p0 = pageOf(rows, { page: 0 });
  const p1 = pageOf(rows, { page: 1 });
  const p2 = pageOf(rows, { page: 2 });
  const p3 = pageOf(rows, { page: 3 }); // 35 rows / 10 = 3 full pages + 5
  eq(p0.places.length, 10, "page 0 holds exactly 10");
  eq(p1.places.length, 10, "page 1 holds exactly 10");
  eq(p2.places.length, 10, "page 2 holds exactly 10");
  eq(p3.places.length, 5, "the last partial page holds the remainder, 5");
  eq(p0.places[0].id, "p0", "page 0 starts at row 0");
  eq(p1.places[0].id, "p10", "page 1 starts at row 10 — no overlap with page 0");
  eq(p2.places[0].id, "p20", "page 2 starts at row 20");
  eq(p3.places[0].id, "p30", "page 3 starts at row 30");
  // NO SKIP: the union of every page's ids, in order, reconstructs the
  // original list exactly — nothing dropped, nothing duplicated, nothing
  // reordered.
  const rebuilt = [...p0.places, ...p1.places, ...p2.places, ...p3.places].map((p) => p.id);
  eq(rebuilt.join(","), rows.map((p) => p.id).join(","), "concatenating every page reconstructs the source list exactly — no overlap, no gap");
}

// ── 3. hasMore ───────────────────────────────────────────────────────────────
{
  const rows = mk(25);
  eq(pageOf(rows, { page: 0 }).hasMore, true, "hasMore is true when rows remain");
  eq(pageOf(rows, { page: 1 }).hasMore, true, "…still true mid-list");
  eq(pageOf(rows, { page: 2 }).hasMore, false, "hasMore is false on the exact last (partial) page");
  eq(pageOf(rows, { page: 3 }).hasMore, false, "…and false past the end — no phantom page");
  eq(pageOf(rows, { page: 3 }).places.length, 0, "…which correctly holds zero rows");
  // Exact multiple of size: the boundary case that off-by-ones live in.
  const exact = mk(20);
  eq(pageOf(exact, { page: 1 }).hasMore, false, "hasMore is false when the list ends EXACTLY on a page boundary");
  eq(pageOf(exact, { page: 1 }).places.length, 10, "…and that final page is still full");
}

// ── 4. total is the FULL count, not the loaded count (RailNav's contract) ──
{
  const rows = mk(130);
  eq(pageOf(rows, { page: 0 }).total, 130, "page 0 reports the TRUE total (130), never 10 — this is what RailNav renders");
  eq(pageOf(rows, { page: 5 }).total, 130, "total is stable across every page of the same list");
}

// ── 5. DETERMINISM — pages never overlap or skip across repeated calls ─────
// The same cache generation (lib/railFastCache.js keeps one value per key for
// up to an hour) hands every request the SAME array reference; two "page 1"
// requests — concurrent or minutes apart — must return byte-identical rows.
{
  const rows = mk(47);
  const a = pageOf(rows, { page: 2, size: 10 });
  const b = pageOf(rows, { page: 2, size: 10 });
  eq(a.places.map((p) => p.id).join(","), b.places.map((p) => p.id).join(","), "two calls for the same page of the same list return identical rows");
  eq(a.total, b.total, "…and identical totals");
  eq(a.hasMore, b.hasMore, "…and identical hasMore");
}

// ── 6. malformed input never throws — page/size are sanitized ──────────────
{
  ok(pageOf(null, { page: 0 }).places.length === 0, "null rows -> empty page, not a throw");
  ok(pageOf(mk(5), { page: -1 }).page === 0, "a negative page clamps to 0");
  ok(pageOf(mk(5), { page: "not a number" }).page === 0, "a non-numeric page clamps to 0");
  ok(pageOf(mk(5), { size: 0 }).size === RAIL_PAGE_SIZE, "a zero size falls back to the default");
  ok(pageOf(mk(5), { size: -3 }).size === RAIL_PAGE_SIZE, "a negative size falls back to the default");
}

// ── 7. pageOneRail — the `{rails:[{id,places|cards}]}` shape every intent
//      endpoint (night-out, date-night, birthday, today-discovery, fall)
//      returns ────────────────────────────────────────────────────────────
{
  const rails = [
    { id: "clubs", title: "Clubs", deck: "d", places: mk(23) },
    { id: "photos", title: "Photos", deck: "d", cards: mk(14) }, // Fall Intent's shape
  ];
  const clubsPage1 = pageOneRail(rails, "clubs", { page: 1, size: 10 });
  ok(!!clubsPage1, "an existing rail id resolves");
  eq(clubsPage1.places.length, 10, "…and pages its `places` array");
  eq(clubsPage1.total, 23, "…reporting the rail's true total");
  eq(clubsPage1.places[0].id, "p10", "…starting at the right offset");
  const photosPage0 = pageOneRail(rails, "photos", { page: 0, size: 10 });
  ok(!!photosPage0 && Array.isArray(photosPage0.cards), "a `cards`-shaped rail (Fall Intent) is auto-detected and paged under `cards`, not `places`");
  eq(photosPage0.cards.length, 10, "…10 cards on page 0");
  eq(pageOneRail(rails, "nope", { page: 0 }), null, "an unknown rail id returns null — the route turns this into a 404, never a fabricated empty page");
}

// ── 8. pageAllRails — every rail windowed to the same page/size at once ────
{
  const rails = [{ id: "a", places: mk(15) }, { id: "b", places: mk(3) }];
  const paged = pageAllRails(rails, { page: 0, size: 10 });
  eq(paged.find((r) => r.id === "a").places.length, 10, "rail a: windowed to 10 of 15");
  eq(paged.find((r) => r.id === "a").hasMore, true, "rail a: hasMore true");
  eq(paged.find((r) => r.id === "b").places.length, 3, "rail b: shorter than a page ships everything it has");
  eq(paged.find((r) => r.id === "b").hasMore, false, "rail b: hasMore false — nothing left to stream");
}

// ── 9. pageRailMenuRail — /api/rails' flat `{ places: { railId: [...] } }`
//      shape (railMenuData) ────────────────────────────────────────────────
{
  const placesById = { today: mk(40), season: [] };
  const todayPage2 = pageRailMenuRail(placesById, "today", { page: 2, size: 10 });
  ok(!!todayPage2, "a known rail id resolves");
  eq(todayPage2.places.length, 10, "page 2 of 40 holds 10");
  eq(todayPage2.places[0].id, "p20", "…starting at offset 20");
  const seasonPage0 = pageRailMenuRail(placesById, "season", { page: 0 });
  ok(!!seasonPage0 && seasonPage0.places.length === 0 && seasonPage0.hasMore === false, "an empty-but-KNOWN rail (season, thin) pages to an honest empty, not null");
  eq(pageRailMenuRail(placesById, "nope", { page: 0 }), null, "an unknown rail id is null, distinct from a known-but-empty one");
}

if (fail) {
  console.error(`\ntest-rail-paging: ${fail} FAILED of ${pass + fail}`);
  process.exit(1);
}
console.log(`test-rail-paging: OK — ${pass} assertions; page math is boundary-correct, deterministic across repeated calls, and total/hasMore never lie`);
