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

if (bad.length) {
  for (const m of bad) console.error("  - " + m);
  console.error(`check-identity-before-cap: FAIL — ${bad.length}/${n} assertions`);
  process.exit(1);
}
console.log(`check-identity-before-cap: OK — ${n} assertions, all by CALL. readOwnedCategory EXECUTED against an injected fetch over a 1,500-row box (order=, sequential Range paging to exhaustion, editorial + secondary-category membership asserted on the ISSUED urls); admission proven to run before the cost bound by a buried row that identity-first finds and cap-first cannot, in the same process; the ${SURFACES.length} registered surfaces asserted to call fetchOwnedPool WITH an identity at the call site and to have a failure path for a thrown read. Plus the three reader defects found in owner review, each with its own positive control: the radius cut is MEASURED from the row rather than read off a display-rounded distMi (fixture true 27.02mi, card 27.0) and cannot be moved by a caller's own toPlace; a 200 carrying a non-array body THROWS across three shapes instead of reading as an empty town; and a pool that hits its row cap throws unless the caller opts in, and is then told it is degraded. False-positive surface: a surface that deliberately stops using the owned pool, or a route that legitimately opts into a partial pool, goes red here and should be re-declared in scripts/lib/starvationSurfaces.mjs rather than have the assertion deleted.`);
