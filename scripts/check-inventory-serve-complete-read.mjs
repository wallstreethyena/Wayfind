#!/usr/bin/env node
// scripts/check-inventory-serve-complete-read.mjs — THE EXHAUSTIVE-READ
// CONTRACT for lib/inventoryServe.js's serveFromInventory(), driven by a fake
// PostgREST double instead of the live database.
//
// THE BUG THIS LOCKS (lib/inventoryServe.js's 2026-09-23 header, lib/ownedPool.js's
// 2026-09-23 header): serveFromInventoryUncached built a `wf_inventory?
// select=…&limit=1000` query with NO `order=`, then filtered/ranked. Ryan's
// Coffee House, Parrish (ChIJo_IdHf0lw4gRHDbQNKBRE84) — a real, operational,
// 4.9★/205-review café — sat past row 1,000 of 1,598 food rows in the Parrish
// box, in Postgres HEAP order (arbitrary, reshuffled by any UPDATE), and was
// silently never read: not filtered, not ranked, not served, and nothing in
// the response said so.
//
// v8.49 already fixed the ORDERING half (filter the chip before the rank cap —
// see check-narrow-chip-inventory.mjs). This guard is the other half: the READ
// ITSELF must be exhaustive — every row in the box, not an arbitrary slice of
// it — before either the chip filter or the rank ever runs.
//
// This EXECUTES the real serveFromInventory against a fake PostgREST server
// (a mocked global.fetch honoring `select`, the geo box, `order=place_id.asc`
// and `Range` paging) over a 1,456-row synthetic food fixture: a Ryan's-shaped
// sentinel deliberately placed past row 1,000 of the box's raw (shuffled,
// "heap-order") storage, real cafés it must serve, decoys it must not, and a
// pile of high-review filler restaurants that pad the box past the old single-
// page cap. See scripts/check-ryans-cafe-sentinel.mjs for the small, PERMANENT,
// named-sentinel lock built on the same scripts/lib/synthetic/fixtures.mjs
// constants every other synthetic guard in this repo anchors on; this file is
// the general contract, with the edge cases (page failure, truncation, offset
// paging, hydration scope) that guard does not try to cover.
import { serveFromInventory, boxForRadius, distMeters } from "../lib/inventoryServe.js";
import { RYANS_COFFEE_HOUSE, PARRISH } from "./lib/synthetic/fixtures.mjs";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

// ─────────────────────────── deterministic PRNG ───────────────────────────
// Same generator scripts/test-rail-compute-budget.mjs already uses for its own
// fixture world, so a "shuffled, reproducible" fixture is a pattern this repo
// already trusts rather than a one-off.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const rnd = mulberry32(0xca7e17);

// ─────────────────────────────── geometry ──────────────────────────────────
const CENTER = { lat: PARRISH.lat, lng: PARRISH.lng };
const RADIUS_MI = 17;
const RADIUS_M = RADIUS_MI * 1609.34;
const GATE_MI = RADIUS_MI * 1.15; // rankInventory's own gate — mirrored ONLY for the fixture-sanity check below, never re-implemented in the code under test.
const BOX = boxForRadius(CENTER.lat, CENTER.lng, RADIUS_M);

function destPoint(lat, lng, mi, bearingDeg) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = (mi / 69) * Math.cos(rad(bearingDeg));
  const dLng = (mi / (69 * Math.cos(rad(lat)))) * Math.sin(rad(bearingDeg));
  return { lat: lat + dLat, lng: lng + dLng };
}
function scatterPoint(maxMi) {
  return destPoint(CENTER.lat, CENTER.lng, rnd() * maxMi, rnd() * 360);
}

// ────────────────────────────── the fixture ────────────────────────────────
const FILLER_N = 1440;
const filler = Array.from({ length: FILLER_N }, (_, i) => {
  const p = scatterPoint(15); // comfortably inside the 19.55mi gate
  return {
    place_id: `wf_test_filler_${String(i).padStart(4, "0")}`,
    name: `Steakhouse ${i}`,
    lat: p.lat, lng: p.lng,
    category: "food", secondary_categories: [],
    primary_type: "restaurant", google_types: ["restaurant", "american_restaurant"],
    cuisines: ["american"], status: "OPERATIONAL", excluded: false,
    signals: { rating: 4.5 + (i % 5) / 10, reviews: 2000 + (i % 3000) },
    photo_ref: null,
  };
});

const REAL_CAFE_N = 10;
const realCafes = Array.from({ length: REAL_CAFE_N }, (_, i) => {
  const p = scatterPoint(15);
  return {
    place_id: `wf_test_cafe_${i}`,
    name: `Roaster ${i}`,
    lat: p.lat, lng: p.lng,
    category: "food", secondary_categories: [],
    primary_type: "coffee_shop", google_types: ["coffee_shop", "cafe"],
    cuisines: [], status: "OPERATIONAL", excluded: false,
    signals: { rating: 4.6 + (i % 4) / 10, reviews: 80 + i * 10 },
    // 2026-09-23 fix round, item 7 — a REAL DB value, standing in for what the
    // underlying wf_inventory row actually carries. The box read must NOT
    // return this (EXHAUSTIVE_INVENTORY_FIELDS excludes photo_ref) — the
    // PostgREST double below PROJECTS each row onto its requested `select`
    // list, so this only reaches a served place if the SEPARATE, served-rows-
    // only photo hydration call fetches it back.
    photo_ref: `places/wf_test_cafe_${i}/photos/native`,
  };
});

const ryansPoint = destPoint(CENTER.lat, CENTER.lng, 3.2, 200); // ~3.2mi — the header's own measured distance
const ryans = {
  place_id: RYANS_COFFEE_HOUSE.placeId,
  name: RYANS_COFFEE_HOUSE.name,
  lat: ryansPoint.lat, lng: ryansPoint.lng,
  category: "food", secondary_categories: [],
  primary_type: RYANS_COFFEE_HOUSE.primaryType, google_types: ["coffee_shop", "cafe"],
  cuisines: [], status: "OPERATIONAL", excluded: false,
  signals: { rating: 4.9, reviews: 205 },
  photo_ref: `places/${RYANS_COFFEE_HOUSE.placeId}/photos/native`, // see realCafes above
};

// Decoys — every one absent from the served food:cafes set, each for a
// DIFFERENT reason, so a regression that widens any single gate (servability,
// exact radius, chip identity) is caught by the assertion that actually names it.
const decoyClosed = {
  place_id: "wf_test_decoy_closed_cafe", name: "Shuttered Roasters",
  ...scatterPoint(10),
  category: "food", secondary_categories: [], primary_type: "coffee_shop",
  google_types: ["coffee_shop", "cafe"], cuisines: [], status: "CLOSED_PERMANENTLY",
  excluded: false, signals: { rating: 4.8, reviews: 300 }, photo_ref: null,
};
const decoyUnrated = {
  place_id: "wf_test_decoy_unrated_cafe", name: "Unrated Roasters",
  ...scatterPoint(10),
  category: "food", secondary_categories: [], primary_type: "coffee_shop",
  google_types: ["coffee_shop", "cafe"], cuisines: [], status: "OPERATIONAL",
  excluded: false, signals: { rating: null, reviews: 0 }, photo_ref: null,
};
// Placed just inside the BOX's own corner (generous, rectangular) but past
// rankInventory's exact circular 1.15 gate — the same slack v8.49's header
// already documents, reused here on purpose rather than a hand-guessed offset.
const decoyFarPoint = { lat: BOX.maxLat - 0.001, lng: BOX.maxLng - 0.001 };
const decoyFar = {
  place_id: "wf_test_decoy_far_cafe", name: "Faraway Roasters",
  lat: decoyFarPoint.lat, lng: decoyFarPoint.lng,
  category: "food", secondary_categories: [], primary_type: "coffee_shop",
  google_types: ["coffee_shop", "cafe"], cuisines: [], status: "OPERATIONAL",
  excluded: false, signals: { rating: 4.7, reviews: 150 }, photo_ref: null,
};
const decoyExcluded = {
  place_id: "wf_test_decoy_excluded_cafe", name: "Vetoed Roasters",
  ...scatterPoint(10),
  category: "food", secondary_categories: [], primary_type: "coffee_shop",
  google_types: ["coffee_shop", "cafe"], cuisines: [], status: "OPERATIONAL",
  excluded: true, signals: { rating: 4.8, reviews: 400 }, photo_ref: null,
};
const decoyNonCafe = {
  place_id: "wf_test_decoy_bistro", name: "The Grand Bistro",
  ...scatterPoint(10),
  category: "food", secondary_categories: [], primary_type: "restaurant",
  google_types: ["restaurant"], cuisines: ["french"], status: "OPERATIONAL",
  excluded: false, signals: { rating: 4.9, reviews: 5000 }, photo_ref: null,
};
const decoys = [decoyClosed, decoyUnrated, decoyFar, decoyExcluded, decoyNonCafe];

// FIXTURE SANITY — disambiguates "the code under test is broken" from "the
// fixture's geometry does not mean what this file assumes it means".
{
  const decoyFarMi = distMeters(CENTER.lat, CENTER.lng, decoyFarPoint.lat, decoyFarPoint.lng) / 1609.34;
  ok(decoyFarMi > GATE_MI, `FIXTURE SANITY: the far-café decoy sits ${decoyFarMi.toFixed(2)}mi out — past rankInventory's own ${GATE_MI.toFixed(2)}mi gate — while still inside the fetch box`);
  for (const [label, row] of [["a real café", realCafes[0]], ["Ryan's", ryans]]) {
    const mi = distMeters(CENTER.lat, CENTER.lng, row.lat, row.lng) / 1609.34;
    ok(mi < GATE_MI, `FIXTURE SANITY: ${label} sits ${mi.toFixed(2)}mi out — inside the gate, so its exclusion (if any) can only be a real regression`);
  }
}

const orderedWorld = [...filler, ...realCafes, ryans, ...decoys];
ok(orderedWorld.length >= 1400, `fixture has ${orderedWorld.length} rows (>= 1,400 required)`);

// THE RAW STORAGE ("heap") ORDER — shuffled, deterministic, standing in for
// what Postgres returns with no ORDER BY. A plain shuffle can land Ryan's
// anywhere, including inside the first 1,000 by chance — the property this
// guard needs (past row 1,000) is pinned explicitly rather than left to luck,
// exactly the way the real production row happened to sit at 1,001+ of 1,598.
let world = shuffle(orderedWorld, rnd);
let heapIndex = world.findIndex((r) => r.place_id === RYANS_COFFEE_HOUSE.placeId);
if (heapIndex < 1000) {
  const PINNED_INDEX = 1200;
  [world[heapIndex], world[PINNED_INDEX]] = [world[PINNED_INDEX], world[heapIndex]];
  heapIndex = PINNED_INDEX;
}
ok(heapIndex >= 1000, `FIXTURE SANITY: Ryan's sits at heap-order index ${heapIndex} (>= 1000), reproducing the real outage's row 1,001+ of 1,598`);

// THE REGRESSION COUNTERFACTUAL — what the PRE-FIX single `limit=1000`, no
// `order=` read actually returned: an arbitrary first thousand of this exact
// heap order. Structural, not a call into dead code (there is none left).
const legacySlice = world.slice(0, 1000);
ok(!legacySlice.some((r) => r.place_id === RYANS_COFFEE_HOUSE.placeId),
  "REGRESSION COUNTERFACTUAL: a single unordered limit=1000 read (the pre-fix bug, reproduced structurally against this fixture) would have missed Ryan's Coffee House entirely");

// ───────────────────────────── fake PostgREST ──────────────────────────────
const FIXTURE_URL = "https://fixture.supabase.co";
const FIXTURE_KEY = "fixture-service-role-key";
const FIXTURE_ENV = { url: FIXTURE_URL, key: FIXTURE_KEY };
// hydrateEditorialFor (lib/inventoryServe.js) always resolves its OWN env via
// the real sbEnv() (it does not accept options.env), so the fixture env also
// has to exist as process.env for that one call to succeed against the mock.
process.env.SUPABASE_URL = FIXTURE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = FIXTURE_KEY;

function parseBoxQuery(url) {
  const u = new URL(url);
  const raw = u.search;
  const num = (re) => { const m = raw.match(re); return m ? Number(m[1]) : null; };
  const inListMatch = raw.match(/place_id=in\.\(([^)]*)\)/);
  const select = u.searchParams.get("select") || "";
  const isInListRead = !!inListMatch && !/lat=gte\./.test(raw);
  // Quoted ids (lib/ownedPool.js's hydratePhotoRefs double-quotes each id —
  // "a comma or parenthesis in a place_id can never split the list") vs the
  // bare, individually-encoded ids hydrateEditorialFor's in.() list uses.
  const inList = inListMatch
    ? decodeURIComponent(inListMatch[1]).split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean)
    : null;
  return {
    order: u.searchParams.get("order") || "",
    select,
    selectFields: select.split(",").map((s) => s.trim()).filter(Boolean),
    minLat: num(/lat=gte\.(-?[\d.]+)/), maxLat: num(/lat=lte\.(-?[\d.]+)/),
    minLng: num(/lng=gte\.(-?[\d.]+)/), maxLng: num(/lng=lte\.(-?[\d.]+)/),
    isBoxRead: /lat=gte\./.test(raw),
    // 2026-09-23 fix round, item 7 — editorial and photo_ref are now TWO
    // separate in.() hydration calls, distinguished by their `select`, not
    // conflated into one "isEditorialRead" bucket.
    isEditorialRead: isInListRead && select.includes("editorial"),
    isPhotoRead: isInListRead && select.includes("photo_ref"),
    inList,
  };
}
function jsonRes(body, okStatus = true, status = okStatus ? 200 : 500) {
  return { ok: okStatus, status, json: async () => body, text: async () => JSON.stringify(body) };
}
// Real PostgREST returns ONLY the requested columns. The fixture rows carry
// every field regardless of what is asked for, so without this projection a
// box read would leak `photo_ref` into the response even after
// EXHAUSTIVE_INVENTORY_FIELDS stopped requesting it — silently proving
// nothing about the fix. Projecting makes the field list itself load-bearing.
function project(row, fields) {
  if (!fields || !fields.length) return row;
  const out = {};
  for (const f of fields) out[f] = row[f];
  return out;
}

let calls = [];       // reset per scenario: {kind:"box"|"editorial"|"photo", ...}
let failPlan = null;  // {from, timesLeft} — the box page at `from` fails `timesLeft` times

function installMock() {
  const orig = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.includes("/rest/v1/wf_inventory")) return jsonRes([], false, 404);
    const q = parseBoxQuery(url);
    if (q.isEditorialRead) {
      calls.push({ kind: "editorial", url, ids: q.inList || [] });
      return jsonRes((q.inList || []).map((id) => ({ place_id: id, editorial: null })));
    }
    if (q.isPhotoRead) {
      calls.push({ kind: "photo", url, ids: q.inList || [] });
      return jsonRes((q.inList || []).map((id) => {
        const row = world.find((r) => r.place_id === id);
        return { place_id: id, photo_ref: (row && row.photo_ref) || null };
      }));
    }
    const rangeHeader = String((init && init.headers && init.headers.Range) || "");
    const m = rangeHeader.match(/^(\d+)-(\d+)$/);
    const from = m ? Number(m[1]) : 0;
    const to = m ? Number(m[2]) : from + 999;
    calls.push({ kind: "box", url, order: q.order, range: rangeHeader, from, to, select: q.select });
    if (failPlan && failPlan.from === from && failPlan.timesLeft > 0) {
      failPlan.timesLeft--;
      return jsonRes({ message: "synthetic failure" }, false, 500);
    }
    let matches = world.filter((r) => r.lat >= q.minLat && r.lat <= q.maxLat && r.lng >= q.minLng && r.lng <= q.maxLng);
    if (q.order === "place_id.asc") {
      matches = matches.slice().sort((a, b) => (a.place_id < b.place_id ? -1 : a.place_id > b.place_id ? 1 : 0));
    }
    return jsonRes(matches.slice(from, to + 1).map((row) => project(row, q.selectFields)));
  };
  return () => { globalThis.fetch = orig; };
}

// ══════════════ SCENARIO 1 — exhaustive read, decoys excluded, hydration scoped ══════════════
{
  calls = [];
  failPlan = null;
  const uninstall = installMock();
  let result;
  try {
    result = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", {
      env: FIXTURE_ENV, primaryOnly: true, withMeta: true,
    });
  } finally { uninstall(); }

  const boxCalls = calls.filter((c) => c.kind === "box");
  ok(boxCalls.length >= 2, `the 1,456-row fixture forces multiple box-read pages (got ${boxCalls.length}) — proof the read did not stop at one`);
  ok(boxCalls.every((c) => c.order === "place_id.asc"), "EVERY box-read page carries order=place_id.asc");
  ok(boxCalls.every((c) => /^\d+-\d+$/.test(c.range)), "EVERY box-read page carries a Range header");

  const servedIds = result.places.map((p) => p.id);
  ok(servedIds.includes(RYANS_COFFEE_HOUSE.placeId), `Ryan's Coffee House is served under food:cafes (served ids: ${servedIds.join(",")})`);
  ok(result.meta.eligible === 1 + REAL_CAFE_N, `meta.eligible counts exactly the real cafés (${REAL_CAFE_N}) + Ryan's = ${1 + REAL_CAFE_N} (got ${result.meta.eligible})`);

  for (const d of decoys) ok(!servedIds.includes(d.place_id), `decoy "${d.name}" is excluded from the served food:cafes set`);
  ok(!servedIds.some((id) => id.startsWith("wf_test_filler_")), "no filler restaurant leaks into food:cafes");

  const editorialCalls = calls.filter((c) => c.kind === "editorial");
  const editorialIds = new Set(editorialCalls.flatMap((c) => c.ids));
  ok(editorialCalls.length > 0, "editorial hydration ran for the served page");
  ok(servedIds.every((id) => editorialIds.has(id)), "editorial hydration requested EVERY served id");
  ok([...editorialIds].every((id) => servedIds.includes(id)), "editorial hydration requested ONLY served ids — never the full eligible set or a decoy");

  // ── 2026-09-23 fix round, item 7 — photo_ref: dropped from the box read,
  // hydrated back for served rows only. ──
  const boxCallSelects = boxCalls.map((c) => c.select);
  ok(boxCallSelects.every((s) => !s.split(",").includes("photo_ref")), "the box read's own `select` still requests photo_ref — EXHAUSTIVE_INVENTORY_FIELDS must not carry it");
  ok(boxCallSelects.every((s) => s.split(",").includes("name") && s.split(",").includes("signals")), "FIXTURE SANITY: the box read's select is otherwise unchanged (still requests name, signals, …)");
  const photoCalls = calls.filter((c) => c.kind === "photo");
  const photoIds = new Set(photoCalls.flatMap((c) => c.ids));
  ok(photoCalls.length > 0, "a separate photo_ref hydration call ran for the served page");
  ok(servedIds.every((id) => photoIds.has(id)), "photo_ref hydration requested EVERY served id");
  ok([...photoIds].every((id) => servedIds.includes(id)), "photo_ref hydration requested ONLY served ids — never the full eligible set, filler, or a decoy");
  const ryansServed = result.places.find((p) => p.id === RYANS_COFFEE_HOUSE.placeId);
  ok(!!ryansServed && ryansServed.photo_ref === `places/${RYANS_COFFEE_HOUSE.placeId}/photos/native`,
    "Ryan's served place object does not carry the hydrated photo_ref — the exhaustive read must stay byte-identical in shape to before this split");
  ok(!!ryansServed && Array.isArray(ryansServed.photos) && ryansServed.photos[0] && ryansServed.photos[0].name === ryansServed.photo_ref,
    "Ryan's served place's photos[0].name does not mirror the hydrated photo_ref — this is the exact shape invRowToPlace produced when photo_ref rode along on the box read");
}

// bonus: options.skipEditorial means no hydration call at all
{
  calls = []; failPlan = null;
  const uninstall = installMock();
  try {
    await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", { env: FIXTURE_ENV, primaryOnly: true, skipEditorial: true });
  } finally { uninstall(); }
  ok(!calls.some((c) => c.kind === "editorial"), "options.skipEditorial suppresses editorial hydration entirely — a caller that hydrates its own final set must not pay for it twice");
  // 2026-09-23 fix round, item 7 — photo_ref hydration is a SEPARATE concern
  // from skipEditorial (which has only ever meant "the caller hydrates
  // EDITORIAL text itself"). Every caller, skipEditorial or not, received
  // photo_ref on served rows before this split, and must still receive it.
  ok(calls.some((c) => c.kind === "photo"), "options.skipEditorial must NOT suppress photo_ref hydration — every caller received photo_ref on served rows before this split, skipEditorial or not");
}

// ══════════════ SCENARIO 2 — a page failure is never a silent empty answer ══════════════
{
  calls = [];
  failPlan = { from: 0, timesLeft: 2 }; // the initial attempt AND its one retry both fail
  const uninstall = installMock();
  let soft;
  try {
    soft = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", { env: FIXTURE_ENV, primaryOnly: true });
  } finally { uninstall(); }
  ok(Array.isArray(soft) && soft.length === 0, "a page failure (non-failLoud) returns [] — the plain-array shape every existing caller already handles");
}
{
  calls = [];
  failPlan = { from: 0, timesLeft: 2 };
  const uninstall = installMock();
  let threw = null;
  try {
    await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", { env: FIXTURE_ENV, primaryOnly: true, failLoud: true });
  } catch (e) { threw = e; } finally { uninstall(); }
  ok(threw instanceof Error, "the SAME page failure THROWS under failLoud rather than returning a confident empty list");
}

// ══════════════ SCENARIO 3 — truncation is REPORTED, never silently eaten ══════════════
{
  calls = []; failPlan = null;
  const uninstall = installMock();
  const origError = console.error;
  const errors = [];
  console.error = (...args) => { errors.push(args.join(" ")); };
  let truncatedResult;
  try {
    truncatedResult = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", {
      env: FIXTURE_ENV, primaryOnly: true, withMeta: true, pageSize: 100, maxRows: 300,
    });
  } finally { console.error = origError; uninstall(); }
  ok(truncatedResult.meta.truncated === true, "hitting maxRows sets meta.truncated");
  ok(errors.some((m) => /INCOMPLETE/.test(m)), "a non-failLoud truncated read logs a loud console.error naming it INCOMPLETE");
  ok(Array.isArray(truncatedResult.places), "a truncated read still returns a real (partial) places array rather than throwing, when failLoud is not set");
}
{
  calls = []; failPlan = null;
  const uninstall = installMock();
  let threw = null;
  try {
    await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", {
      env: FIXTURE_ENV, primaryOnly: true, pageSize: 100, maxRows: 300, failLoud: true,
    });
  } catch (e) { threw = e; } finally { uninstall(); }
  ok(threw instanceof Error && /INCOMPLETE/.test(threw.message), "the SAME truncated read throws under failLoud, naming it INCOMPLETE — never a confident partial answer");
}

// ══════════════ SCENARIO 4 — offset paging is DISJOINT; its union is the FULL ranked eligible set ══════════════
{
  calls = []; failPlan = null;
  const uninstall = installMock();
  let full, page1, page2, page3;
  try {
    full = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 100, "cafes", { env: FIXTURE_ENV, primaryOnly: true, withMeta: true });
    page1 = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", { env: FIXTURE_ENV, primaryOnly: true, withMeta: true, offset: 0 });
    page2 = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", { env: FIXTURE_ENV, primaryOnly: true, withMeta: true, offset: 5 });
    page3 = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", { env: FIXTURE_ENV, primaryOnly: true, withMeta: true, offset: 10 });
  } finally { uninstall(); }

  const fullIds = full.places.map((p) => p.id);
  ok(fullIds.length === 1 + REAL_CAFE_N, `one unpaged call sees the full eligible set (${1 + REAL_CAFE_N})`);

  const pages = [page1, page2, page3];
  const pagedIds = pages.flatMap((p) => p.places.map((x) => x.id));
  ok(new Set(pagedIds).size === pagedIds.length, "three consecutive offset pages are DISJOINT — no id repeats across pages");
  ok(JSON.stringify(pagedIds) === JSON.stringify(fullIds), "the UNION of consecutive offset pages, in order, equals the single full-set read — same deterministic rank, just paged");

  for (const p of pages) ok(p.meta.eligible === fullIds.length, "every page reports the SAME total eligible count");
  ok(page1.meta.served === 5 && page1.meta.offset === 0, "page1 meta: served=5, offset=0");
  ok(page1.meta.offset + page1.meta.served < page1.meta.eligible, "page1: offset+served < eligible -> hasMore reads true");
  ok(page2.meta.offset + page2.meta.served < page2.meta.eligible, "page2: offset+served < eligible -> hasMore reads true");
  ok(page3.meta.offset + page3.meta.served === page3.meta.eligible, "page3 (the last page): offset+served == eligible -> hasMore reads false");
}

// ══════════════ SCENARIO 5 — a per-page RETRY is clamped to what remains of
// the TOTAL budget, never the page's own (stale) ms — item 8 of the 2026-09-23
// fix round audit. Deterministic: Date.now() is monkey-patched to a fake
// clock the fake page-fetch itself advances, so this needs no real sleeping
// and cannot flake under CI load. options.fetchImpl (readExhaustiveRows'
// OWN test seam — see its `const baseFetch = options.fetchImpl ||
// fetchDeadline`) is used directly, so this observes the exact `ms` every
// physical attempt receives with no need to mock the global fetch. ══════════
{
  const realNow = Date.now;
  let clock = 1_000_000; // arbitrary fixed epoch — only the DELTA matters
  Date.now = () => clock;
  const seenMs = [];
  let attempt = 0;
  const fakeFetchImpl = async (url, init, ms) => {
    seenMs.push(ms);
    attempt++;
    if (attempt === 1) {
      clock += 800; // the first attempt eats 800 of the 1000ms TOTAL budget before failing
      return jsonRes({ message: "synthetic 500" }, false, 500);
    }
    return jsonRes([]); // the retry — an empty (short) page completes the read cleanly
  };
  let threw = null;
  try {
    await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", {
      env: FIXTURE_ENV, primaryOnly: true,
      fetchImpl: fakeFetchImpl, deadlineMs: 900, totalDeadlineMs: 1000,
    });
  } catch (e) { threw = e; } finally { Date.now = realNow; }
  ok(threw === null, `the retry (clamped or not) should let this read complete, not throw: ${threw && threw.message}`);
  ok(seenMs.length === 2, `the failed page retried exactly once (saw ${seenMs.length} attempt(s))`);
  ok(seenMs[0] === 900, `the FIRST attempt gets the full per-page budget (900ms), got ${seenMs[0]}`);
  ok(seenMs[1] < seenMs[0], `the RETRY's ms (${seenMs[1]}) is not clamped below the page's own ms (${seenMs[0]}) once 800 of the 1000ms total budget is already spent`);
  ok(seenMs[1] <= 200, `the RETRY's ms (${seenMs[1]}) does not reflect only what remains of the 1000ms total budget after the first attempt's simulated 800ms — it should be ~200ms, not the page's full 900ms ceiling`);
}
// The SAME clamp must not let a retry proceed with a non-positive budget —
// it should give up rather than issue a request with an already-exhausted
// (or negative) deadline.
{
  const realNow = Date.now;
  let clock = 1_000_000;
  Date.now = () => clock;
  const seenMs = [];
  let attempt = 0;
  const fakeFetchImpl = async (url, init, ms) => {
    seenMs.push(ms);
    attempt++;
    clock += 1000; // consume the ENTIRE total budget on the first attempt alone
    return jsonRes({ message: "synthetic 500" }, false, 500);
  };
  let threw = null, resultSoft = null;
  try {
    resultSoft = await serveFromInventory("food", CENTER.lat, CENTER.lng, RADIUS_M, 5, "cafes", {
      env: FIXTURE_ENV, primaryOnly: true,
      fetchImpl: fakeFetchImpl, deadlineMs: 900, totalDeadlineMs: 1000,
    });
  } catch (e) { threw = e; } finally { Date.now = realNow; }
  ok(seenMs.length === 1, `with NO budget left after the first attempt, no second physical request is issued (saw ${seenMs.length})`);
  ok(Array.isArray(resultSoft) && resultSoft.length === 0, "an exhausted-budget failure still answers (a plain empty array, non-failLoud), never hangs or throws unexpectedly");
}

if (fail.length) {
  console.error(`check-inventory-serve-complete-read: FAIL (${fail.length} of ${pass + fail.length})`);
  for (const m of fail) console.error("  ✗ " + m);
  process.exit(1);
}
console.log(`check-inventory-serve-complete-read: OK (${pass} assertions) — the box read is exhaustive, ordered, paged, decoy-safe, reports its own truncation, hydrates photo_ref for served rows only, and clamps a page retry to the remaining total budget`);
