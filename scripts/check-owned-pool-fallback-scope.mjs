#!/usr/bin/env node
// scripts/check-owned-pool-fallback-scope.mjs — 2026-09-23 fix round, item 4
// (independent audit of PR #1495). lib/ownedPool.js's readOwnedCategory used
// to swap the `secondary_categories` OR-clause for the plain `category=eq.`
// clause on ANY `!res.ok`, at ANY page — not just the pre-migration "the
// column doesn't exist yet" 400 on the FIRST page. Two ordinary transient 5xx
// responses on a LATER page silently swapped the query SHAPE for the rest of
// the walk, dropping every remaining row whose PRIMARY category differs but
// SECONDARY category matches — the auditor reproduced this live as 100
// missing rows reported `truncated:false`: a confidently wrong, undercounted
// answer, never a visible failure.
//
// This drives the REAL serveFromInventory -> readExhaustiveRows ->
// fetchPageWithRetry -> readOwnedCategory pipeline against a fake PostgREST
// double: page 1 (from=1000) fails 503 TWICE against the `withSecondary` URL
// — the initial attempt AND fetchPageWithRetry's own one retry, exactly the
// shape the auditor reproduced. The FIX must throw/fail loud (or return a
// genuinely EMPTY, never a partial/silently-truncated, answer) rather than
// falling back to the `plain` URL past page 0, and must never actually
// request the `plain` shape once paging has started.
import { serveFromInventory, boxForRadius } from "../lib/inventoryServe.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const CENTER = { lat: 27.58, lng: -82.45 };
const RADIUS_M = 17 * 1609.34;
const BOX = boxForRadius(CENTER.lat, CENTER.lng, RADIUS_M);
const midLat = (BOX.minLat + BOX.maxLat) / 2;
const midLng = (BOX.minLng + BOX.maxLng) / 2;

// A 2,199-row "food" world, ids 0000..2198 (already in place_id.asc order by
// construction — no separate sort needed). Page 0 = rows 0-999, page 1 =
// rows 1000-1999, page 2 = the remainder.
const FOOD_N = 2199;
const world = Array.from({ length: FOOD_N }, (_, i) => ({
  place_id: `wf_owned_fallback_${String(i).padStart(4, "0")}`,
  name: `Restaurant ${i}`,
  lat: midLat, lng: midLng,
  category: "food", secondary_categories: [],
  primary_type: "restaurant", google_types: ["restaurant"],
  cuisines: [], status: "OPERATIONAL", excluded: false,
  signals: { rating: 4.5, reviews: 100 },
  photo_ref: null,
}));
// Replace ONE row INSIDE page 1's range with a row whose PRIMARY category
// differs but SECONDARY category is "food" — same place_id (same sort
// position, same page) as the row it replaces, so paging boundaries are
// unaffected; only its category membership changes. This is the row a silent
// URL-shape swap starting at page 1 would drop.
const SECONDARY_INDEX = 1500;
const secondaryRow = {
  ...world[SECONDARY_INDEX],
  name: "Speakeasy Diner",
  category: "nightlife",
  secondary_categories: ["food"],
};
world[SECONDARY_INDEX] = secondaryRow;

const FIXTURE_URL = "https://fixture-fallback.supabase.co";
const FIXTURE_KEY = "fixture-fallback-key";
process.env.SUPABASE_URL = FIXTURE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = FIXTURE_KEY;
const ENV = { url: FIXTURE_URL, key: FIXTURE_KEY };

function jsonRes(body, okStatus = true, status = okStatus ? 200 : 500) {
  return { ok: okStatus, status, json: async () => body, text: async () => JSON.stringify(body) };
}
function withMock(handler, run) {
  const orig = globalThis.fetch;
  globalThis.fetch = handler;
  return run().finally(() => { globalThis.fetch = orig; });
}
function isSecondaryShapeUrl(url) { return /or=\(category\.eq\./.test(url); }
function rangeFrom(init) {
  const rangeHeader = String((init && init.headers && init.headers.Range) || "");
  const m = rangeHeader.match(/^(\d+)-(\d+)$/);
  return { from: m ? Number(m[1]) : 0, to: m ? Number(m[2]) : (m ? Number(m[1]) : 0) + 999 };
}

// ══════════════ SCENARIO 1 — two 503s on page 1's withSecondary shape MUST
// throw / fail loud, and MUST NEVER touch the `plain` URL shape past page 0 ══
{
  const requests = [];
  let secondaryFailuresLeft = 2; // the initial attempt AND fetchPageWithRetry's one retry
  const handler = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.includes("/rest/v1/wf_inventory")) return jsonRes([], false, 404);
    const shape = isSecondaryShapeUrl(url) ? "withSecondary" : "plain";
    const { from, to } = rangeFrom(init);
    requests.push({ from, shape });
    if (from === 1000 && shape === "withSecondary" && secondaryFailuresLeft > 0) {
      secondaryFailuresLeft--;
      return jsonRes({ message: "synthetic 503" }, false, 503);
    }
    const rows = shape === "withSecondary" ? world : world.filter((r) => r.category === "food");
    return jsonRes(rows.slice(from, to + 1));
  };

  let threw = null, resultLoud = null, resultSoft = null;
  await withMock(handler, async () => {
    try {
      resultLoud = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "all", { env: ENV, failLoud: true });
    } catch (e) { threw = e; }
  });
  ok(threw instanceof Error, `two 503s on page 1 (from=1000) against the withSecondary URL THROW under failLoud (threw: ${threw ? threw.message : "no throw"})`);
  ok(!requests.some((r) => r.from > 0 && r.shape === "plain"), "no request past page 0 ever used the `plain` (secondary-categories-dropping) URL shape — the fallback never fires past from===0");
  ok(requests.filter((r) => r.from === 1000 && r.shape === "withSecondary").length === 2, `page 1 was attempted exactly twice against the withSecondary shape before giving up (saw ${requests.filter((r) => r.from === 1000).length})`);

  // Same fixture, non-failLoud: the failure must surface as an EMPTY answer,
  // never a plausible-looking PARTIAL one (the actual shape of the bug — a
  // "short set" that looks like a complete, if smaller, town).
  requests.length = 0;
  secondaryFailuresLeft = 2;
  await withMock(handler, async () => {
    resultSoft = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "all", { env: ENV });
  });
  ok(Array.isArray(resultSoft) && resultSoft.length === 0, `a non-failLoud failure returns an EMPTY array, never a short/partial set (got ${Array.isArray(resultSoft) ? resultSoft.length : typeof resultSoft} rows)`);
  ok(!requests.some((r) => r.from > 0 && r.shape === "plain"), "the non-failLoud path also never falls back to `plain` past page 0");
}

// ══════════════ SCENARIO 2 (happy path) — the LEGITIMATE page-0 migration
// fallback (a pre-migration DB lacking secondary_categories 400s the OR form)
// still works, unchanged, after the from===0 && status===400 narrowing. ══════
{
  const requests = [];
  let sawMissingColumn400 = false;
  const handler = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.includes("/rest/v1/wf_inventory")) return jsonRes([], false, 404);
    const shape = isSecondaryShapeUrl(url) ? "withSecondary" : "plain";
    const { from, to } = rangeFrom(init);
    requests.push({ from, shape });
    if (from === 0 && shape === "withSecondary") {
      sawMissingColumn400 = true;
      return jsonRes({ message: "column secondary_categories does not exist", code: "42703" }, false, 400);
    }
    const rows = world.filter((r) => r.category === "food"); // already swapped to plain for this DB
    return jsonRes(rows.slice(from, to + 1));
  };
  let threw = null, result = null;
  await withMock(handler, async () => {
    try {
      result = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "all", { env: ENV, failLoud: true });
    } catch (e) { threw = e; }
  });
  ok(sawMissingColumn400, "the page-0 fallback scenario actually exercised a from===0 400 (fixture sanity)");
  ok(threw === null, `the LEGITIMATE page-0 migration fallback still succeeds — got a throw instead: ${threw && threw.message}`);
  ok(requests.some((r) => r.from === 0 && r.shape === "plain"), "page 0 fell back to the plain URL after its 400, exactly as before this fix");
  ok(Array.isArray(result), "the legitimate fallback still returns a real (non-empty-by-accident) result");
}

// ══════════════ SCENARIO 3 — a 5xx on page 0 must ALSO throw, never fall
// back. The fix is from===0 AND status===400, not from===0 alone — a
// transient 503 on the very first page is exactly as much "not a schema
// error" as one on page 1000. ══════════════
{
  const requests = [];
  const handler = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.includes("/rest/v1/wf_inventory")) return jsonRes([], false, 404);
    const shape = isSecondaryShapeUrl(url) ? "withSecondary" : "plain";
    const { from, to } = rangeFrom(init);
    requests.push({ from, shape });
    if (from === 0 && shape === "withSecondary") return jsonRes({ message: "synthetic 503" }, false, 503);
    const rows = world.filter((r) => r.category === "food");
    return jsonRes(rows.slice(from, to + 1));
  };
  let threw = null;
  await withMock(handler, async () => {
    try {
      await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "all", { env: ENV, failLoud: true });
    } catch (e) { threw = e; }
  });
  ok(threw instanceof Error, `a 503 (not a 400) on page 0's withSecondary URL still THROWS under failLoud (threw: ${threw ? threw.message : "no throw"})`);
  ok(!requests.some((r) => r.shape === "plain"), "a page-0 503 never falls back to the plain URL — only a page-0 400 may");
}

// REGRESSION COUNTERFACTUAL — proves this guard exercises a REAL, not
// vacuous, distinction: the `plain` URL shape alone genuinely excludes the
// secondary-category row that a silent mid-walk swap would have dropped.
{
  const plainOnlyIds = new Set(world.filter((r) => r.category === "food").map((r) => r.place_id));
  ok(!plainOnlyIds.has(secondaryRow.place_id),
    "REGRESSION COUNTERFACTUAL: the `plain` shape alone excludes the secondary-category row — had the old code swapped to it after two transient 503s, the read would have completed NORMALLY (truncated:false) while silently missing this row");
}

if (fail.length) {
  console.error(`check-owned-pool-fallback-scope: FAIL (${fail.length} of ${pass + fail.length})`);
  for (const msg of fail) console.error("  ✗ " + msg);
  process.exit(1);
}
console.log(`check-owned-pool-fallback-scope: OK (${pass} assertions) — lib/ownedPool.js's secondary_categories fallback is scoped to from===0 && status===400, never a later page's transient 5xx`);
