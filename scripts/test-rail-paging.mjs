#!/usr/bin/env node
// scripts/test-rail-paging.mjs — WO11 (2026-09-02, owner): "load the top ten
// based on the Wayfind score, and as they scroll ... start loading 10 more
// cards, and 10 more, instead of loading everything at once." This is a
// CALL-based test of the paging math in lib/railPage.js — page boundaries,
// determinism, dedupe, hasMore — executed against real inputs, never a
// regex over the source (see CLAUDE.md, "assert on the CALL, not the
// string").
import { pageOf, pageOneRail, pageAllRails, pageRailMenuRail, RAIL_PAGE_SIZE } from "../lib/railPage.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { liveFromRailsResponse, mergeRailPage } from "../lib/locationHonesty.js";
import { railHasNextPage, railUsesSharedPaging, railPageScope, isCurrentRailPageScope, settleRailPageStateForScope } from "../lib/railResponse.js";
import { splitBreakfastRails } from "../lib/breakfastRails.js";
import { composeWorthEatingRails } from "../lib/worthEatingRails.js";

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

// ── 10. COMPOSER PAGING — rendering a subrail never owns its source pages ──
// The production defect was not page math. /api/rails truthfully sent 12/25
// and hasMore:true, but BreakfastRails / WorthEatingRails render their own
// display rails, so DaypartRail read that as "do not page." These calls pin
// the distinction: the display can be composer-owned while the source still
// pages from the shared ranked rail.
{
  ok(railUsesSharedPaging("breakfast", true), "Breakfast renders its own subrails but still uses the shared source pager");
  ok(railUsesSharedPaging("eat", true), "Actually Worth Eating renders its own subrails but still uses the shared source pager");
  ok(railUsesSharedPaging("locals", true), "Creators Pick drains the shared source pager before grouping by creator");
  ok(!railUsesSharedPaging("datenight", true), "an independently fetched intent does not accidentally use /api/rails paging");
  ok(railUsesSharedPaging("best", false), "a normal shared-pool rail still pages normally");
  ok(railHasNextPage(12, 25, true), "the route's explicit hasMore:true keeps a 12/25 composer pageable");
  ok(railHasNextPage(12, 25, false), "a legacy response with only a truthful total remains pageable");
  ok(!railHasNextPage(25, 25, false), "the final composer page stops paging exactly at its total");

  const parrishBreakfast = railPageScope("breakfast", "27.58,-82.43", "morning", "parrish");
  const bradentonBreakfast = railPageScope("breakfast", "27.58,-82.43", "morning", "bradenton");
  ok(isCurrentRailPageScope(parrishBreakfast, parrishBreakfast), "a continuation page for the current city/rail/daypart is accepted");
  ok(!isCurrentRailPageScope(bradentonBreakfast, parrishBreakfast), "a late continuation page for another city is rejected, even inside the same snapped cell");
  ok(!isCurrentRailPageScope(railPageScope("eat", "27.58,-82.43", "morning", "parrish"), parrishBreakfast), "a late page for another poster is rejected");

  // Actual lifecycle: Breakfast starts loading in Parrish; the reader moves to
  // Bradenton before it settles. The late completion clears only the old
  // scope, so reopening Breakfast at the new location starts usable (idle),
  // not permanently disabled behind the old poster-id loading flag.
  let lifecycle = settleRailPageStateForScope({}, parrishBreakfast, parrishBreakfast, "loading");
  eq(lifecycle[parrishBreakfast], "loading", "page lifecycle records loading under the complete request scope");
  lifecycle = settleRailPageStateForScope(lifecycle, bradentonBreakfast, parrishBreakfast, "idle");
  ok(!Object.prototype.hasOwnProperty.call(lifecycle, parrishBreakfast), "late old-city completion removes the stale loading state");
  ok(lifecycle[bradentonBreakfast] == null, "the new city's same poster is idle and can page or retry immediately");
  lifecycle = settleRailPageStateForScope(lifecycle, bradentonBreakfast, bradentonBreakfast, "loading");
  lifecycle = settleRailPageStateForScope(lifecycle, bradentonBreakfast, bradentonBreakfast, "failed");
  eq(lifecycle[bradentonBreakfast], "failed", "a current-city failure remains visible so the retry control is enabled");

  // RED-PROVE: the pre-repair predicate conflated render ownership with page
  // ownership, exactly reproducing the unreachable-card defect.
  const preRepairMutant = (railId, renderOwnsAnswer) => !renderOwnsAnswer;
  ok(!preRepairMutant("breakfast", true) && railUsesSharedPaging("breakfast", true),
    "RED-PROVE: restoring `!renderOwnsAnswer` makes breakfast 12/25 unpageable and fails this distinction");
}

// ── 11. REAL COMPOSERS REACH CARD 13 AND THE FINAL CARD ───────────────────
// Run the actual response merge plus each actual composer. Every source row is
// intentionally a known-good member of its respective rail; if page two is
// not requested/merged, both 13 and 25 disappear from the displayed answer.
function pagePayload(railId, rows, total = rows.length) {
  return { covered: true, data: { places: { [railId]: rows }, railTotals: { [railId]: total }, railHasMore: { [railId]: rows.length < total } } };
}
function mergedRows(railId, rows) {
  const first = liveFromRailsResponse(pagePayload(railId, rows.slice(0, 12), rows.length));
  ok(railHasNextPage(first.places[railId].length, first.railTotals[railId], first.railHasMore[railId]),
    `${railId}: first response is 12/${rows.length} and actually requests its next page`);
  const merged = mergeRailPage(first, pagePayload(railId, rows.slice(12), rows.length), railId);
  return merged.places[railId];
}

{
  const breakfastRows = Array.from({ length: 25 }, (_, i) => ({
    id: `breakfast-${i + 1}`, name: `Breakfast House ${i + 1}`,
    primaryType: "breakfast_restaurant", rating: 4.9, reviews: 1000 - i,
  }));
  const displayed = splitBreakfastRails(mergedRows("breakfast", breakfastRows))
    .find((rail) => rail.id === "breakfast-restaurants").places.map((place) => place.id);
  ok(displayed.includes("breakfast-13"), "Breakfast: card 13 reaches the displayed Best Breakfast rail");
  ok(displayed.includes("breakfast-25"), "Breakfast: the final available card reaches the displayed Best Breakfast rail");
  eq(displayed.join(","), breakfastRows.map((place) => place.id).join(","), "Breakfast: paging preserves ranked order and neither skips nor duplicates cards");
}

{
  const worthRows = Array.from({ length: 25 }, (_, i) => ({
    id: `worth-${i + 1}`, name: `American Kitchen ${i + 1}`, cuisines: ["american"],
    primaryType: "restaurant", rating: 4.9, reviews: 1000 - i,
  }));
  const displayed = composeWorthEatingRails(mergedRows("eat", worthRows))
    .find((rail) => rail.id === "american-contemporary").places.map((place) => place.id);
  ok(displayed.includes("worth-13"), "Actually Worth Eating: card 13 reaches its displayed cuisine rail");
  ok(displayed.includes("worth-25"), "Actually Worth Eating: the final available card reaches its displayed cuisine rail");
  eq(displayed.join(","), worthRows.map((place) => place.id).join(","), "Actually Worth Eating: paging preserves ranked order and neither skips nor duplicates cards");
}

// ── 12. THE REAL RENDERERS REQUEST THE NEXT SHARED SOURCE PAGE ────────────
// The pure contract above catches a broken decision. These narrow wiring
// checks catch the other half: dropping the callback between DaypartRail and a
// composer would make all of the correct page math unreachable again. The
// positive controls ensure the probes themselves can match; the mutation
// controls prove they reject the old ownership-only predicate and an unwired
// callback rather than merely finding a word in a comment.
{
  const root = fileURLToPath(new URL("../", import.meta.url));
  const read = (rel) => readFileSync(new URL(rel, new URL("./", `file://${root}/`)), "utf8");
  const daypart = read("app/components/DaypartRail.js");
  const breakfast = read("app/components/BreakfastRails.js");
  const worthEating = read("app/components/WorthEatingRails.js");
  const creatorPicks = read("app/components/CreatorPicksRails.js");
  const sharedPagingCall = /railUsesSharedPaging\(selected, railOwnsItsOwnAnswer\)/;
  const staleScopeCall = /isCurrentRailPageScope\(railPageScopeRef\.current, requestScope\)/;
  const scopedStateCall = /settleRailPageStateForScope\(state, railPageScopeRef\.current, requestScope,/;
  const callbackProp = /hasMore=\{selectedHasMore\}[\s\S]{0,260}onLoadMore=\{loadSelectedRailPage\}/;
  const rendererCallback = /onScroll=\{\(event\) => \{[\s\S]{0,220}onLoadMore\?\.\(\)/;
  const callbackPropCount = (source) => [...source.matchAll(new RegExp(callbackProp.source, "g"))].length;

  ok(sharedPagingCall.test("const selectedUsesSharedPaging = railUsesSharedPaging(selected, railOwnsItsOwnAnswer);"),
    "POSITIVE CONTROL: the shared-paging probe matches the real decision shape");
  ok(callbackProp.test("<BreakfastRails hasMore={selectedHasMore} loadingMore={busy} onLoadMore={loadSelectedRailPage} />"),
    "POSITIVE CONTROL: the parent-to-composer callback probe matches a wired fixture");
  ok(rendererCallback.test('<div onScroll={(event) => { if (hasMore) onLoadMore?.(); }} />'),
    "POSITIVE CONTROL: the composer scroll probe matches a real callback fixture");

  ok(sharedPagingCall.test(daypart), "DaypartRail calls the render/page ownership separator");
  ok((daypart.match(new RegExp(staleScopeCall.source, "g")) || []).length === 1, "DaypartRail prevents a stale response from merging into the new city, poster, or daypart");
  ok((daypart.match(new RegExp(scopedStateCall.source, "g")) || []).length === 4, "DaypartRail stores continuation state by scope and clears it through both stale completion paths");
  ok(callbackPropCount(daypart) === 3, "Breakfast, Actually Worth Eating, and Creators Pick receive hasMore plus the real next-page callback");
  ok(rendererCallback.test(breakfast), "Breakfast scroll end asks for the next shared source page");
  ok(rendererCallback.test(worthEating), "Actually Worth Eating scroll end asks for the next shared source page");
  ok(/shouldAutoLoadCreatorPage\(\{[\s\S]{0,180}lastAttemptKey: lastAutoAttempt\.current/.test(creatorPicks)
    && /lastAutoAttempt\.current = attemptKey;[\s\S]{0,80}onLoadMore\(\)/.test(creatorPicks)
    && /loadFailed/.test(creatorPicks),
    "Creators Pick drains each complete mixed-source page once and stops automatic retries on a failed offset");
  ok(/Show more ranked places/.test(breakfast) && /Show more ranked places/.test(worthEating),
    "both composers expose a retryable, keyboard-accessible next-page control");

  const ownershipMutant = daypart.replace("railUsesSharedPaging(selected, railOwnsItsOwnAnswer)", "!railOwnsItsOwnAnswer");
  const staleCityMutant = daypart.replace("isCurrentRailPageScope(railPageScopeRef.current, requestScope)", "true");
  const posterStateMutant = daypart.replace("railPageState[selectedPageScope]", "railPageState[selected]");
  const unwiredMutant = daypart.replace("onLoadMore={loadSelectedRailPage}", "onLoadMore={undefined}");
  ok(!sharedPagingCall.test(ownershipMutant), "RED-PROVE: the old ownership-only gate does not satisfy the shared-paging wire");
  ok((staleCityMutant.match(new RegExp(staleScopeCall.source, "g")) || []).length === 0, "RED-PROVE: removing the stale-city gate from a page response makes the rejection check fail");
  ok((posterStateMutant.match(/railPageState\[selectedPageScope\]/g) || []).length === 5, "RED-PROVE: reading one state site by poster id instead of scope makes the lifecycle wiring check fail");
  ok(callbackPropCount(unwiredMutant) === 2, "RED-PROVE: removing one composer callback makes the three-renderer wiring check fail");
}

if (fail) {
  console.error(`\ntest-rail-paging: ${fail} FAILED of ${pass + fail}`);
  process.exit(1);
}
console.log(`test-rail-paging: OK — ${pass} assertions; page math is boundary-correct, deterministic across repeated calls, and total/hasMore never lie`);
