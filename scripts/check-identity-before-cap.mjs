#!/usr/bin/env node
/**
 * check-identity-before-cap — the system-wide lock on candidate starvation.
 *
 * THE FAILURE CLASS, in one line: a surface reads a BROAD owned category, keeps
 * the highest-scoring N, and only THEN asks the narrow question. The narrow set
 * competes against the whole category for those N slots and loses, so the rail
 * is thin and the data was never the problem. lib/browseInventory.js named it:
 * "identity ∩ anchor top-N is thin BY CONSTRUCTION".
 *
 * It has been found and fixed SEVEN times under seven names — cafés (v8.49),
 * breakfast (v8.18), browse chips (v8.50), events (v8.19), Night Out (v8.97b),
 * and in v8.98 Lunch Break, Birthday, Date Night's dinner rail and Today's
 * nature rails. Every one of those fixes was local. This guard is the thing that
 * makes the eighth occurrence go red instead of shipping.
 *
 * WHAT IT ASSERTS, and why each one is in this shape rather than a grep:
 *
 *  1. THE READER'S TWO PROPERTIES ARE CALLED, NOT READ. readOwnedCategory is
 *     driven with an injected fetch and the ISSUED URLs are inspected: they must
 *     carry `order=place_id.asc` (without it, `limit=` returns an arbitrary
 *     slice in Postgres heap order that any UPDATE reshuffles — the upstream
 *     half of the bug, and completely invisible) and must page with Range
 *     headers until a short page arrives. A regex over the source would pass on
 *     a version that builds the string and never sends it.
 *
 *  2. ADMISSION HAPPENS BEFORE ANY COST BOUND, proven by a mutation run in the
 *     same process: a qualifying row placed below the old 400-row cap must be
 *     reachable identity-first and UNREACHABLE cap-first. If cap-first ever
 *     finds it, the fixture stopped reproducing the bug and every other
 *     assertion here is decoration.
 *
 *  3. EVERY REGISTERED SURFACE'S READ CARRIES AN IDENTITY. Asserted at the CALL
 *     SITE's option object, because `fetchOwnedPool` without `identity` is a
 *     deterministic exhaustive read and nothing more — better than before, and
 *     not the fix.
 *
 *  4. THE PREDICATE IS IMPORTED, NOT RESTATED. A route that grew its own
 *     opinion about what a dinner show or a Cuban counter is would drift from
 *     the composer, and the drift shows up as a rail that quietly widened.
 *
 *  5. `editorial` IS STILL SELECTED. isShow / isDateDining / lunchRailMembership
 *     and the rest match on name + types + EDITORIAL, so a payload optimisation
 *     that trims that column would cure candidate starvation by causing evidence
 *     starvation — and every count would look BETTER. Asserted on the issued
 *     query, after exactly that mutation once left a suite green.
 *
 * NO NETWORK.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import { admitOwnedRows, fetchOwnedPool, isServableRow, milesBetween, readOwnedCategory, rowToOwnedPlace, OWNED_POOL_FIELDS, OWNED_POOL_PAGE } from "../lib/ownedPool.js";
import { SURFACES } from "./lib/starvationSurfaces.mjs";
import { BROWSE_INVENTORY_N } from "../lib/browseInventory.js";
import { wayfindScore } from "../lib/wayfindScore.js";

let n = 0;
const bad = [];
const ok = (c, m) => { n++; if (!c) bad.push(m); };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

// ── 1. the reader, CALLED ──────────────────────────────────────────────────
{
  const urls = [];
  const ranges = [];
  const rows = (count, from) => Array.from({ length: count }, (_, i) => ({
    place_id: `p${from + i}`, name: `P${from + i}`, lat: 27.6, lng: -82.43,
    status: "OPERATIONAL", signals: { rating: 4.5, reviews: 100 },
  }));
  let served = 0;
  const fetchImpl = async (url, init) => {
    urls.push(url);
    ranges.push(init.headers.Range);
    const from = Number(String(init.headers.Range).split("-")[0]);
    // 1,500 rows in the box: page 0 full, page 1 short. A reader that stops at
    // the first page returns 1,000 and this goes red.
    const remaining = Math.max(0, 1500 - from);
    const page = Math.min(remaining, OWNED_POOL_PAGE);
    served += page;
    return { ok: true, json: async () => rows(page, from) };
  };
  const box = { minLat: 27, maxLat: 28, minLng: -83, maxLng: -82 };
  const out = await readOwnedCategory({ url: "https://example.invalid", key: "k" }, "food", box, { fetchImpl });

  ok(urls.length > 0, "positive control: the injected fetch was never called, so nothing below is evidence");
  ok(out.rows.length === 1500,
    `the reader stopped short: ${out.rows.length} of 1500 rows. An owned pool that stops at one page is the cap-before-identity bug with extra steps`);
  ok(urls.every((u) => /order=place_id\.asc/.test(u)),
    "an owned read was issued with NO order= — `limit=`/Range without an ORDER BY returns an arbitrary slice in Postgres heap order that any UPDATE reshuffles, and nothing goes red when it changes");
  ok(ranges.length >= 2 && /^0-/.test(ranges[0]) && /^1000-/.test(ranges[1]),
    `paging is not sequential Range requests (${ranges.slice(0, 3).join(" ")})`);
  ok(urls.every((u) => /select=[^&]*\beditorial\b/.test(u)),
    "an owned read no longer selects `editorial` — the identity predicates match on name + types + EDITORIAL, so trimming it starves the evidence instead of the candidates and every count looks BETTER");
  ok(urls.some((u) => /secondary_categories\.cs\.\{/.test(u)),
    "the owned read dropped secondary-category membership — a venue stored under its primary type would vanish from the category that wants it");
  ok(/\beditorial\b/.test(OWNED_POOL_FIELDS) && /\bgoogle_types\b/.test(OWNED_POOL_FIELDS) && /\bcuisines\b/.test(OWNED_POOL_FIELDS),
    "OWNED_POOL_FIELDS lost a column the predicates read (editorial / google_types / cuisines)");
}

// ── 2. admission before the cost bound, red-proved in-process ──────────────
{
  const ORIGIN = { lat: 27.5949, lng: -82.4265 };
  const at = (mi) => ({ lat: ORIGIN.lat + mi / 69, lng: ORIGIN.lng });
  const row = (o) => ({
    place_id: o.id, name: o.name, lat: at(o.mi ?? 3).lat, lng: at(o.mi ?? 3).lng,
    category: "food", primary_type: o.pt || "restaurant", google_types: [],
    status: "OPERATIONAL", signals: { rating: o.rating ?? 4.4, reviews: o.reviews ?? 400 },
  });
  const corpus = [];
  for (let i = 0; i < BROWSE_INVENTORY_N + 1099; i++) corpus.push(row({ id: `f${i}`, name: `Ordinary ${i}`, rating: 4.9, reviews: 5000, mi: 2 }));
  const BURIED = row({ id: "buried", name: "Rare Thing", pt: "comedy_club", mi: 6, rating: 4.3, reviews: 300 });
  const buriedIndex = corpus.length;
  corpus.push(BURIED);
  const identity = (p) => (p.primaryType === "comedy_club" ? "rare" : null);

  ok(buriedIndex > BROWSE_INVENTORY_N,
    `positive control: the buried row sits at index ${buriedIndex}, which must be past the ${BROWSE_INVENTORY_N}-row cap`);
  const first = admitOwnedRows(corpus, ORIGIN, { maxMi: 27, identity }).places.map((p) => p.id);
  ok(first.includes("buried"),
    "THE REGRESSION: a qualifying row below the old cap did not survive identity-first admission");

  const capFirst = admitOwnedRows(
    corpus.filter(isServableRow)
      .map((r) => ({ r, s: wayfindScore(r.signals.rating, r.signals.reviews) ?? 0 }))
      .sort((a, b) => b.s - a.s).slice(0, BROWSE_INVENTORY_N).map((x) => x.r),
    ORIGIN, { maxMi: 27, identity },
  ).places.map((p) => p.id);
  ok(!capFirst.includes("buried"),
    "NEGATIVE CONTROL FAILED: cap-before-identity still finds the buried row, so this corpus does not reproduce the bug and the assertion above means nothing");

  // …and the ORDER of the gates, so a future edit cannot move the radius cut
  // after the identity and quietly serve a 40-mile answer.
  const far = admitOwnedRows([row({ id: "far", name: "Far Thing", pt: "comedy_club", mi: 40 })], ORIGIN, { maxMi: 27, identity });
  ok(far.places.length === 0 && far.stats.withinRadius === 0, "the exact radius cut no longer runs before identity");
  let threw = false;
  try { admitOwnedRows([], ORIGIN, { identity }); } catch (e) { threw = true; }
  ok(threw, "admitOwnedRows accepted a missing maxMi — a default radius is how one surface silently starts serving another's law");
  let poolThrew = false;
  try { await fetchOwnedPool(27.5, -82.4, { categories: ["food"] }); } catch (e) { poolThrew = true; }
  ok(poolThrew, "fetchOwnedPool accepted a missing radiusMi");
}

// ── 3-5. every registered surface reads identity-first, from its OWN module ─
for (const surface of SURFACES) {
  const src = strip(read(surface.route));
  const pool = /fetchOwnedPool\s*\(/.test(src);
  const delegated = /nightOutPool|fetchNightOutPool/.test(src);
  ok(pool || delegated,
    `${surface.id}: ${surface.route} no longer reads through an identity-first owned pool — if that is deliberate, this surface's entry in scripts/lib/starvationSurfaces.mjs should say so, and the change should be measured before it ships`);
  if (!pool) continue;

  // The identity must be AT the CALL, not merely somewhere in the file. The
  // first version of this block anchored on the first occurrence of the NAME,
  // which is the import statement — it went red on four correct files, and a
  // guard that fires on correct code is worse than no guard (CLAUDE.md).
  const CALL = /fetchOwnedPool\s*\(/g;
  const blocks = [];
  for (let m = CALL.exec(src); m; m = CALL.exec(src)) {
    const rest = src.slice(m.index);
    const end = rest.indexOf("});");
    blocks.push(end === -1 ? rest.slice(0, 400) : rest.slice(0, end + 3));
  }
  ok(blocks.length > 0, `${surface.id}: fetchOwnedPool is imported but never CALLED`);
  for (const optionBlock of blocks) {
    ok(/\bidentity\s*:/.test(optionBlock),
      `${surface.id}: fetchOwnedPool is called with no \`identity\` — a deterministic exhaustive read with no predicate is better than before and is NOT the fix (${optionBlock.slice(0, 140).replace(/\s+/g, " ")})`);
    ok(/\bradiusMi\s*:/.test(optionBlock),
      `${surface.id}: fetchOwnedPool is called with no explicit radiusMi`);
  }

  // …and the predicate must be IMPORTED, so the route holds no second opinion.
  ok(/^import[\s\S]*?from "[^"]*\/lib\/[A-Za-z]+\.js"/m.test(src),
    `${surface.id}: no lib import found — the identity predicate must come from the module that composes the rails, never be restated here`);
}

// The registry itself must stay wired to the real modules. A registry that
// described the taxonomy instead of importing it is the exact thing this whole
// audit refuses to do.
{
  const reg = strip(read("scripts/lib/starvationSurfaces.mjs"));
  ok(!/=\s*\/.*\/[gimsuy]*\s*[;,)]/.test(reg.replace(/\/\//g, "")) || !/test\(/.test(reg),
    "scripts/lib/starvationSurfaces.mjs grew a regex of its own — the registry must IMPORT Wayfind's identity, never restate it");
  for (const s of SURFACES) {
    ok(typeof s.claims === "function" && typeof s.bucket === "function",
      `${s.id}: the registry entry lost its real predicate or composer`);
  }
}

// ── THE THREE READER DEFECTS FOUND IN REVIEW (owner, 2026-09-06) ───────────
//
// Every guard in this file was green while all three were live, which is the
// only reason they are asserted separately and by CALL rather than folded into
// the assertions above.
{
  const ORIGIN = { lat: 27.5949, lng: -82.4265 };
  const env = { url: "https://example.invalid", key: "k" };
  // Due north, so the offset is exact: milesBetween along a meridian is
  // R * dLatRad, and R * pi/180 = 69.0932 miles per degree. `mi / 69` is close
  // enough for a corpus and NOT close enough for a boundary fixture — the first
  // version of this block asked for 27.05 and got 27.0869, which rounds to 27.1
  // and is therefore not a rounding trap at all. The positive control below said
  // so rather than letting a fixture-shaped pass through.
  const MI_PER_DEG_LAT = 3958.8 * (Math.PI / 180);
  const bar = (id, mi) => ({
    place_id: id, name: "Edge Bar", lat: ORIGIN.lat + mi / MI_PER_DEG_LAT, lng: ORIGIN.lng,
    category: "nightlife", primary_type: "bar", google_types: [],
    status: "OPERATIONAL", signals: { rating: 4.5, reviews: 500 },
  });
  const admit = (row, extra) => admitOwnedRows([row], ORIGIN, { maxMi: 27, ...extra }).places.length;

  // 1. THE RADIUS IS MEASURED, NOT READ OFF THE CARD.
  //
  // Admission used to test `place.distMi`, which every mapper rounds to one
  // decimal for display, so a row at 27.0498 miles rendered "27" and was let in.
  // The fixture is chosen by MEASURING: the row below is past 27 miles and its
  // rounded display value is exactly 27.0, which is the whole trap.
  const past = bar("past", 27.02);
  const trueMi = milesBetween(ORIGIN.lat, ORIGIN.lng, past.lat, past.lng);
  const shownMi = rowToOwnedPlace(past, ORIGIN).distMi;
  ok(trueMi > 27 && shownMi === 27,
    `positive control: the boundary fixture is not actually a rounding trap (true ${trueMi.toFixed(4)}mi, shown ${shownMi}) — the assertion below would prove nothing`);
  ok(admit(past) === 0,
    `a row ${trueMi.toFixed(4)} miles out was admitted under a 27-mile law because its DISPLAY distance rounds to 27 — the rail's own copy says "the only place within 27 miles that clears this"`);
  ok(admit(bar("inside", 26.5)) === 1,
    "the 26.5-mile control was ALSO refused, so the refusal above proves nothing about distance");

  // …and the law must not be reachable from the caller's mapper. Four routes
  // pass their own toPlace; a cut that reads a field they compute is a cut any
  // of them could move by accident.
  const liar = (row, o) => ({ ...rowToOwnedPlace(row, o), distMi: 1 });
  ok(admit(past, { toPlace: liar }) === 0,
    "a caller's toPlace can move the radius law by reporting a different distMi — admission must come from the row's own coordinates");
  ok(admit(bar("inside2", 26.5), { toPlace: liar }) === 1,
    "positive control: the lying mapper refuses everything, so the assertion above is about the mapper and not about the fixture");

  // 2. A MALFORMED 200 IS A FAILURE, NOT AN EMPTY TOWN.
  //
  // This was `Array.isArray(list) ? list : []`, which turns a PostgREST error
  // object served with a 200, or an HTML interstitial, into "no places" — and it
  // gets cached for an hour like any real answer.
  const box = { minLat: 27, maxLat: 28, minLng: -83, maxLng: -82 };
  for (const [label, body] of [
    ["a PostgREST error object", { message: "JWT expired" }],
    ["an HTML interstitial", "<html>502</html>"],
    ["a null body", null],
  ]) {
    let threw = false, got = null;
    try { got = await readOwnedCategory(env, "food", box, { fetchImpl: async () => ({ ok: true, json: async () => body }) }); }
    catch (e) { threw = true; }
    ok(threw, `a 200 carrying ${label} was accepted as ${got && got.rows ? `${got.rows.length} rows` : "an empty list"} — an empty pool and a broken read must never be the same answer`);
  }
  {
    // positive control: a well-formed short page is still a normal, silent success
    const okRead = await readOwnedCategory(env, "food", box, { fetchImpl: async () => ({ ok: true, json: async () => [bar("a", 1)] }) });
    ok(okRead.rows.length === 1 && okRead.truncated === false,
      "a well-formed short page no longer reads cleanly — the assertions above would then be about any response, not a malformed one");
  }

  // 3. AN INCOMPLETE POOL IS NOT A NORMAL ANSWER.
  //
  // OWNED_POOL_MAX_ROWS is a runaway guard, and it used to be merely REPORTED as
  // `stats.truncated`. No route read that flag, so a metro whose library outgrew
  // the cap would have served identity over a SLICE and cached it for an hour.
  const neverShort = async () => ({ ok: true, json: async () => Array.from({ length: 1000 }, (_, i) => bar("p" + i, 1)) });
  let poolThrew = false;
  try { await fetchOwnedPool(ORIGIN.lat, ORIGIN.lng, { categories: ["food"], radiusMi: 27, env, fetchImpl: neverShort, maxRows: 3000 }); }
  catch (e) { poolThrew = true; }
  ok(poolThrew, "a pool that hit its row cap returned a partial answer instead of failing — identity ran on a slice and the caller could not tell");

  const degraded = await fetchOwnedPool(ORIGIN.lat, ORIGIN.lng, {
    categories: ["food"], radiusMi: 27, env, fetchImpl: neverShort, maxRows: 3000, allowTruncated: true,
  });
  ok(degraded.stats.degraded === true && degraded.stats.truncated === true,
    "allowTruncated no longer marks the answer degraded — an opt-in to a partial pool has to be visible to whoever opted in");

  // …and no route may opt in without saying something honest about it. Nothing
  // opts in today; this is the assertion that notices when one starts.
  for (const surface of SURFACES) {
    const src = strip(read(surface.route));
    ok(!/allowTruncated/.test(src) || /degraded/.test(src),
      `${surface.id}: ${surface.route} passes allowTruncated but never mentions \`degraded\` — opting into a partial pool obliges the route to tell the reader`);
  }

  // Every repaired route must have somewhere for these throws to land.
  for (const surface of SURFACES) {
    const src = strip(read(surface.route));
    ok(/catch\s*\([\s\S]{0,40}\)\s*\{[\s\S]{0,600}?50[03]/.test(src) || /catch\s*\([\s\S]{0,40}\)\s*\{[\s\S]{0,600}?temporarily unavailable/.test(src),
      `${surface.id}: ${surface.route} has no failure path that turns a thrown inventory read into a service error — the throws asserted above would surface as a 500 with a stack trace`);
  }
}

// ── PARTIAL CATEGORY FAILURE (owner review, 2026-09-06, post-#1117) ────────
//
// THE DEFECT THAT SHIPPED. `degraded` was set from `truncated` alone, so the
// commonest incomplete answer of all reported itself as healthy: ONE category
// failing while the others succeed returns a real pool, `sourceFailures: 1`,
// and `degraded: false`. Night Out reads food + nightlife + attractions, so a
// stalled `attractions` read silently costs Shows, Night Tours, Waterfront and
// Social-Play their candidates — and the route then cached that for an hour,
// pinning it on every reader in the cell.
//
// Serving the surviving categories stays deliberate and is locked elsewhere
// ("one stalled category must not blank every shelf"). What is asserted here is
// that the answer SAYS it is partial and that the caller ACTS on it — a flag no
// route reads is the shape of the bug, not the fix.
{
  const ORIGIN = { lat: 27.5949, lng: -82.4265 };
  const env = { url: "https://example.invalid", key: "k" };
  const okRow = {
    place_id: "cc1", name: "Comedy Cellar", lat: ORIGIN.lat + 0.02, lng: ORIGIN.lng,
    category: "nightlife", primary_type: "comedy_club", google_types: [],
    status: "OPERATIONAL", signals: { rating: 4.7, reviews: 900 },
  };
  const page = (rows) => ({ ok: true, json: async () => rows });
  const oneCategoryDies = async (url) => {
    if (/category\.eq\.attractions|secondary_categories\.cs\.\{attractions\}/.test(url)) throw new Error("attractions timed out");
    return page(/nightlife/.test(url) ? [okRow] : []);
  };
  const allHealthy = async (url) => page(/nightlife/.test(url) ? [okRow] : []);
  const cats = ["food", "nightlife", "attractions"];

  // lib/ownedPool.js. Wrapped, because a reader that stops surviving a partial
  // failure THROWS here, and an uncaught throw would take the other 80-odd
  // assertions in this file down with it — a crash reads as "the guard is
  // broken" rather than "the product regressed".
  const call = async (fn, label) => {
    try { return await fn(); } catch (e) { bad.push(`${label} THREW instead of serving its surviving categories: ${e.message}`); n++; return { places: [], stats: {} }; }
  };
  const partial = await call(() => fetchOwnedPool(ORIGIN.lat, ORIGIN.lng, { categories: cats, radiusMi: 27, env, fetchImpl: oneCategoryDies }), "fetchOwnedPool with one failed category");
  const healthy = await call(() => fetchOwnedPool(ORIGIN.lat, ORIGIN.lng, { categories: cats, radiusMi: 27, env, fetchImpl: allHealthy }), "fetchOwnedPool with all categories healthy");
  ok(partial.places.some((p) => p.id === "cc1"),
    "positive control: one failed category blanked the whole owned pool — the surviving categories must still serve, and every assertion below would be about an empty answer");
  ok(partial.stats.sourceFailures === 1, `the failed category is not counted (sourceFailures=${partial.stats.sourceFailures})`);
  ok(partial.stats.degraded === true,
    `ONE CATEGORY FAILED AND THE POOL SAYS degraded=${partial.stats.degraded}. A partial pool reporting itself healthy is cached for an hour as this town's answer.`);
  ok(healthy.stats.degraded === false && healthy.stats.sourceFailures === 0,
    "a fully healthy read is marked degraded — a flag that is always true is discarded by whoever reads it");
  ok(healthy.places.length === partial.places.length,
    "positive control: the healthy and partial reads differ in row count here, so degraded is not being inferred from the row count");

  // lib/nightOutPool.js — its own aggregation, so its own proof.
  const { fetchNightOutPool } = await import("../lib/nightOutPool.js");
  const noPartial = await call(() => fetchNightOutPool(ORIGIN.lat, ORIGIN.lng, { env, fetchImpl: oneCategoryDies }), "fetchNightOutPool with one failed category");
  const noHealthy = await call(() => fetchNightOutPool(ORIGIN.lat, ORIGIN.lng, { env, fetchImpl: allHealthy }), "fetchNightOutPool with all categories healthy");
  ok(noPartial.places.some((p) => p.id === "cc1"),
    "positive control: one failed category blanked the whole Night Out pool");
  ok(noPartial.stats.degraded === true && noPartial.stats.sourceFailures === 1,
    `Night Out's pool reports degraded=${noPartial.stats.degraded} with ${noPartial.stats.sourceFailures} failed categor(ies) — it has its own aggregation and needs its own proof`);
  ok(noHealthy.stats.degraded === false, "Night Out marks a fully healthy read degraded");

  // …AND THE CALLERS MUST ACT ON IT. A flag no route reads is the bug.
  // Execute the real module with only the platform cache replaced. A successful
  // probe against Runtime Cache cannot guarantee the next write is visible: the
  // production build on 2026-09-06 passed the probe then failed the legacy seed.
  // This fixture makes every lifetime assertion run, on every build, without
  // touching the production cache or changing the product's async-write policy.
  const cacheRows = new Map();
  const pendingWrites = [];
  const platform = {
    getCache: () => ({
      get: async (key) => cacheRows.get(key),
      set: async (key, value) => { cacheRows.set(key, structuredClone(value)); },
    }),
    waitUntil: (promise) => { pendingWrites.push(promise); },
  };
  const exports = {};
  const compiled = ts.transpileModule(read("lib/railFastCache.js"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function("require", "exports", compiled)((id) => {
    if (id !== "@vercel/functions") throw new Error(`unmocked cache import: ${id}`);
    return platform;
  }, exports);
  const { completeAnswersOnly, fastCachedRail } = exports;
  const u = completeAnswersOnly((v) => v.rails.length);
  ok(u({ rails: [1], degraded: false }) === true, "positive control: completeAnswersOnly rejects a healthy answer");
  ok(u({ rails: [1], degraded: true }) === false,
    "completeAnswersOnly accepts a DEGRADED answer — fastCachedRail would then store a partial pool as this cell's answer for an hour");
  ok(u({ rails: [], degraded: false }) === false && u(null) === false,
    "completeAnswersOnly stopped applying the caller's own emptiness test");

  // THE ENTRIES ALREADY IN THE DRAWER (owner review, 2026-09-06).
  //
  // The first version rejected `degraded === true` and ACCEPTED an answer with
  // no such field — which is every entry written before this shipped. The
  // namespace and every key are unchanged and entries live for seven days, so a
  // partial answer cached minutes before the deploy would have been read back,
  // passed by omission, and served as healthy for the rest of its life. New
  // copies correct, old copies still in the drawer.
  //
  // THE PURE HALF RUNS EVERYWHERE. `completeAnswersOnly` is a function, so the
  // four shapes it has to separate are asserted by CALLING it, with no cache and
  // no timing. These are the assertions that must never be conditional.
  const usable = completeAnswersOnly((v) => v.rails.length);
  const HEALTHY = { rails: [{ id: "r", places: [{ id: "p" }] }], degraded: false };
  const LEGACY = { rails: [{ id: "r", places: [{ id: "p" }] }] };            // no field — the old shape
  ok(usable(LEGACY) === false,
    "A LEGACY ENTRY WITH NO `degraded` FIELD IS CACHEABLE. Every answer written before this shipped would be read back, pass by omission, and be served as healthy for the seven days it lives.");
  ok(usable(HEALTHY) === true,
    "a healthy answer is not cacheable — requiring an explicit flag must not turn every surface uncacheable, which would be a cache-disabling patch wearing a correctness patch's clothes");

  // A controlled in-memory backend makes the round trip mandatory. No probe
  // can skip the assertions, and every call still executes fastCachedRail.
  {
    // 1. Seed a legacy entry exactly as the pre-fix code did — permissive
    //    `usable`, which is what it actually used — rather than by reaching into
    //    cache internals a guard has no business knowing.
    const legacyKey = `guard:legacy:${Date.now()}:${Math.random()}`;
    let builds = 0;
    const loader = (value) => async () => { builds++; return value; };
    await fastCachedRail(legacyKey, loader(LEGACY), { name: "guard-legacy", usable: Boolean });
    const reread = await fastCachedRail(legacyKey, loader(LEGACY), { name: "guard-legacy", usable: Boolean });
    ok(reread.state === "hit" && builds === 1,
      `positive control: the seeded legacy entry does not read back as a HIT under the old permissive rule (state=${reread.state}, builds=${builds}) — the assertion below would be about a cache that never held anything`);

    // 2. …and under the new rule that same entry must REBUILD, not be served.
    const before = builds;
    const strict = await fastCachedRail(legacyKey, loader(HEALTHY), { name: "guard-legacy", usable });
    ok(builds === before + 1 && strict.state === "miss",
      `an entry cached before this shipped was SERVED (state=${strict.state}, builds=${builds}) instead of being rebuilt`);
    ok(strict.value.degraded === false, "the rebuild did not produce a complete answer");

    // 3. A DEGRADED answer must never be WRITTEN. Re-reading with the same
    //    strict `usable` proves nothing — the read-side rule rebuilds either
    //    way, and removing the write gate left that version green, which makes
    //    it decoration. A PERMISSIVE reader is what finds it in the drawer.
    const badKey = `guard:degraded:${Date.now()}:${Math.random()}`;
    let db = 0;
    const dLoad = async () => { db++; return { ...HEALTHY, degraded: true }; };
    const served = await fastCachedRail(badKey, dLoad, { name: "guard-degraded", usable });
    ok(db === 1 && served.value.degraded === true,
      "positive control: the degraded answer was not returned to the caller who asked for it — it must still be SERVED, just never stored");
    let probe2 = 0;
    const peek = await fastCachedRail(badKey, async () => { probe2++; return HEALTHY; }, { name: "guard-degraded", usable: Boolean });
    ok(peek.state === "miss" && probe2 === 1,
      `a degraded answer was WRITTEN to the cache (a permissive read found it: state=${peek.state}) — the next reader in the cell inherits a partial pool`);
  }
  await Promise.all(pendingWrites);
  ok(pendingWrites.length >= 3,
    "positive control: the real module never scheduled its healthy cache writes");

  for (const surface of SURFACES) {
    const src = strip(read(surface.route));
    ok(/usable:\s*completeAnswersOnly\(/.test(src),
      `${surface.id}: ${surface.route} does not gate its fast cache with completeAnswersOnly — a degraded pool would be cached as this cell's answer`);
    ok(/degraded/.test(src),
      `${surface.id}: ${surface.route} never mentions \`degraded\`, so the pool's own report of being partial is discarded`);
    // …and the CDN header too. The fast cache and the CDN are two different
    // caches; gating only one leaves the other holding the partial answer.
    ok(/cache-control[^\n]*degraded|incomplete \? "no-store"/.test(src),
      `${surface.id}: ${surface.route} sends a public cache-control without consulting \`degraded\` — the fast cache is guarded and the CDN is not`);
  }
}

if (bad.length) {
  for (const m of bad) console.error("  - " + m);
  console.error(`check-identity-before-cap: FAIL — ${bad.length}/${n} assertions`);
  process.exit(1);
}
console.log(`check-identity-before-cap: OK — ${n} assertions, all by CALL. readOwnedCategory EXECUTED against an injected fetch over a 1,500-row box (order=, sequential Range paging to exhaustion, editorial + secondary-category membership asserted on the ISSUED urls); admission proven to run before the cost bound by a buried row that identity-first finds and cap-first cannot, in the same process; the ${SURFACES.length} registered surfaces asserted to call fetchOwnedPool WITH an identity at the call site, to gate BOTH their fast cache and their CDN header on \`degraded\`, and to have a failure path for a thrown read. The reader defects found in owner review, each with its own positive control: the radius cut is MEASURED from the row rather than read off a display-rounded distMi (fixture true 27.02mi, card 27.0) and cannot be moved by a caller's own toPlace; a 200 carrying a non-array body THROWS across three shapes; a pool that hits its row cap throws unless the caller opts in; and ONE FAILED CATEGORY ALONGSIDE HEALTHY ONES is driven through BOTH fetchOwnedPool and fetchNightOutPool. completeAnswersOnly is CALLED over the four shapes that matter, a LEGACY entry with no flag among them. fastCachedRail's lifetimes were exercised with the real module and an isolated cache backend: a legacy entry read back as a HIT under the old permissive rule and REBUILDS under this one, and a degraded answer is proven unwritten by a PERMISSIVE re-read. No lifetime assertions were skipped. False-positive surface: a surface that deliberately stops using the owned pool, or a route that legitimately opts into a partial pool, goes red here and should be re-declared in scripts/lib/starvationSurfaces.mjs rather than have the assertion deleted.`);
