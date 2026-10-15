// scripts/test-map-area-collation-paging.mjs — THE MAP AREA PAGES IN THE DATABASE'S ORDER.
//
// 2026-10-15 (synthetic `surface-parity-parrish-cafes`: "list 39, pins 9,
// area-not-ready 17; Ryan's: area-not-ready"). wf_inventory.place_id is ordered
// by Postgres in en_US.UTF-8 collation, where "ChIJZ_J2k…" sorts AFTER
// "ChIJjbpE…" (case-folded). lib/mapAreaData.js and lib/mapAreaRead.js checked
// "the cursor advanced" with JS `<=`, which compares UTF-16 code units ("Z" <
// "j"), so a correct page 2 was rejected as a non-advance: /api/places/map
// answered 503 for page 2 of the Parrish viewport, the map parked at "error"
// and every list place past page 1 (Ryan's Coffee House included) never
// reached "ready".
//
// This guard drives the REAL readMapAreaPage + readCompleteMapArea against a
// fake PostgREST that orders and filters `gt.` with an en_US collator (the
// production collation, measured: datcollate = en_US.UTF-8), over mixed-case
// Google place ids including the exact production pair, and asserts:
//   A. paging completes, every row is returned exactly once, Ryan's is reached;
//   B. the stall protections still fire (cursor row repeated, duplicate id,
//      same next cursor, a cursor the client already used);
//   C. a failed area read is accounted "area-failed", never "area-not-ready".
//
// `--red-prove` re-runs A against copies of the two modules with the bytewise
// `<=` checks restored, and requires RED.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const RYANS = "ChIJo_IdHf0lw4gRHDbQNKBRE84";
const NOW = Date.parse("2026-10-15T12:00:00Z");
const bounds = { north: 27.93, south: 27.21, east: -82.02, west: -82.86 };
const origin = { lat: 27.5689, lng: -82.4393 };
const pg = new Intl.Collator("en-US"); // stand-in for Postgres en_US.UTF-8: case-folded first level

// Deterministic mixed-case pool shaped like Google place ids, plus the real ids.
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const ids = new Set([RYANS, "ChIJjbpE8twRw4gRUbXfuHT99u4", "ChIJZ_J2k-w5w4gRQJ_gfD_8JXA", "ChIJf37FaCrPwogROlINWp24_-Q"]);
while (ids.size < 1310) ids.add("ChIJ" + Array.from({ length: 23 }, () => ALPHA[Math.floor(rnd() * ALPHA.length)]).join(""));
const rows = [...ids].map((place_id, i) => ({
  place_id, name: `Place ${i}`, metro: "Parrish", lat: 27.5 + (i % 50) / 200, lng: -82.5 + (i % 40) / 200,
  category: "food", secondary_categories: [], primary_type: "cafe", google_types: ["cafe"], cuisines: [],
  status: "OPERATIONAL", signals: { rating: 4.9, reviews: 900 }, refreshed_at: new Date(NOW - 86400000).toISOString(),
}));
const dbOrder = rows.slice().sort((a, b) => pg.compare(a.place_id, b.place_id));
// Precondition: the pool really contains a page boundary where the two orders disagree.
const disagreements = dbOrder.slice(1).filter((r, i) => r.place_id < dbOrder[i].place_id).length;
assert.ok(disagreements > 50, `setup: en_US order must disagree with code-unit order (found ${disagreements})`);
assert.ok(pg.compare("ChIJjbpE8twRw4gRUbXfuHT99u4", "ChIJZ_J2k-w5w4gRQJ_gfD_8JXA") < 0 && "ChIJZ_J2k-w5w4gRQJ_gfD_8JXA" < "ChIJjbpE8twRw4gRUbXfuHT99u4",
  "setup: the production pair sorts one way in en_US and the other in code units");

const postgrest = (pool = dbOrder, tamper = (page) => page) => async (url) => {
  const q = new URL(url).searchParams;
  assert.equal(q.get("order"), "place_id.asc");
  const gt = (q.get("place_id") || "").replace(/^gt\./, "");
  const limit = Number(q.get("limit"));
  const page = pool.filter((r) => !gt || pg.compare(r.place_id, gt) > 0).slice(0, limit);
  return { ok: true, json: async () => tamper(page, gt) };
};
// The route's contract: a thrown readMapAreaPage is a 503 (app/api/places/map/route.js).
const route = (data, fetcher) => async (u) => {
  const p = new URL(u, "https://wayfind.example").searchParams;
  try {
    const page = await data.readMapAreaPage({ bounds, origin, cursor: p.get("cursor") || "", config: { url: "https://owned.example", key: "test-only" }, fetcher, now: NOW });
    return { ok: true, json: async () => page };
  } catch (e) { return { ok: false, status: 503, json: async () => ({ error: e.message }) }; }
};

// Page boundaries move with the pool, so page the pool from many starting
// offsets; at least one must put a case-crossing pair on a page boundary (the
// production shape), proven before it is relied on.
const OFFSETS = Array.from({ length: 40 }, (_, k) => k * 7);
const SIZE = 500;
const boundaryInversions = OFFSETS.filter((k) => {
  const pool = dbOrder.slice(k);
  for (let b = SIZE - 1; b + SIZE < pool.length; b += SIZE) if (pool[b + SIZE].place_id < pool[b].place_id) return true;
  return false;
}).length;
assert.ok(boundaryInversions >= 5, `setup: page boundaries must cross a case inversion in some offsets (found ${boundaryInversions})`);
async function checkPaging(data, read) {
  let total = 0;
  for (const k of OFFSETS) {
    const pool = dbOrder.slice(k);
    const got = await read.readCompleteMapArea({ bounds, origin, fetcher: route(data, postgrest(pool)) });
    const gotIds = got.map((p) => p.id);
    assert.equal(new Set(gotIds).size, gotIds.length, `A(offset ${k}): no place is returned twice across pages`);
    assert.equal(gotIds.length, pool.length, `A(offset ${k}): every one of ${pool.length} rows is reached`);
    if (pool.some((r) => r.place_id === RYANS)) assert.ok(gotIds.includes(RYANS), `A(offset ${k}): Ryan's Coffee House is reached`);
    total += got.length;
  }
  return total;
}

async function checkStalls(data, read) {
  const cfg = { url: "https://owned.example", key: "test-only" };
  const cursor = dbOrder[499].place_id;
  const page = (tamper) => data.readMapAreaPage({ bounds, origin, cursor, config: cfg, fetcher: postgrest(dbOrder, tamper), now: NOW });
  await assert.rejects(page((p) => [dbOrder[499], ...p.slice(0, -1)]), /did not advance/, "B: a page repeating the cursor row is refused");
  await assert.rejects(page((p) => [p[0], ...p.slice(0, -1)]), /did not advance/, "B: a page repeating an id is refused");
  await assert.rejects(page((p) => [...p.slice(0, -1), dbOrder[499]]), /did not advance/, "B: a next cursor equal to the current one is refused");
  let n = 0;
  const loop = async () => ({ ok: true, json: async () => ({ places: [], nextCursor: ++n % 2 ? "ChIJaaaa" : "ChIJbbbb", complete: false }) });
  await assert.rejects(read.readCompleteMapArea({ bounds, origin, fetcher: loop }), /Incomplete/, "B: the client refuses a cursor it already used (no paging loop)");
  await assert.rejects(read.readCompleteMapArea({ bounds, origin, fetcher: async () => ({ ok: true, json: async () => ({ places: [], nextCursor: "", complete: false }) }) }), /Incomplete/);
}

function checkAccounting(acc) {
  const place = { id: RYANS, mapCoord: { allowed: true } };
  const failed = acc.accountListOnMap({ listPlaces: [place], pins: [], areaPlaces: [], areaStatus: "error" });
  assert.equal(failed.rows[0].status, "area-failed", "C: a failed area read is said as a failure");
  assert.ok(acc.MAP_LIST_STATUSES.includes("area-failed"));
  assert.equal(acc.accountListOnMap({ listPlaces: [place], areaStatus: "loading" }).rows[0].status, "area-not-ready", "C: loading stays area-not-ready");
}

const fileUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
function moduleFrom(rel, find, replace) {
  const raw = readFileSync(path.join(ROOT, rel), "utf8");
  let src = raw;
  if (find) {
    assert.ok(raw.includes(find), `red-prove setup: ${rel} must contain ${JSON.stringify(find)}`);
    src = raw.replace(find, replace);
    assert.notEqual(src, raw, `red-prove setup: mutation of ${rel} did not apply`);
  }
  src = src.replace(/from\s+(['"])\.\/([^'"]+)\1/g, (_, q, f) => `from ${q}${fileUrl("lib/" + f)}${q}`);
  return import("data:text/javascript," + encodeURIComponent(src));
}

const data = await import("../lib/mapAreaData.js");
const read = await import("../lib/mapAreaRead.js");
const acc = await import("../lib/mapListAccounting.js");
const n = await checkPaging(data, read);
await checkStalls(data, read);
checkAccounting(acc);
console.log(`test-map-area-collation-paging: OK — ${n} mixed-case rows paged in en_US order over ${OFFSETS.length} pool offsets (${boundaryInversions} with a case-crossing page boundary; ${disagreements} code-unit inversions in the pool), stall/loop refusals and area-failed accounting hold`);

if (process.argv.includes("--red-prove")) {
  const reds = [];
  const expectRed = async (label, fn) => {
    try { await fn(); } catch (e) {
      if (/red-prove setup/.test(String(e && e.message))) throw new Error(`red-prove: ${label} did not apply — ${e.message}`);
      reds.push(label); console.log(`  RED as required: ${label} — ${String(e.message).split("\n")[0]}`); return;
    }
    throw new Error(`red-prove: ${label} stayed GREEN`);
  };
  await expectRed("server compares cursors bytewise", async () => {
    const d = await moduleFrom("lib/mapAreaData.js", "nextCursor === cursor ||", "nextCursor <= cursor ||");
    await checkPaging(d, read);
  });
  await expectRed("client compares cursors bytewise", async () => {
    const r = await moduleFrom("lib/mapAreaRead.js", "next === cursor || cursors.has(next)", "cursors.has(next) || (cursor && next <= cursor)");
    await checkPaging(data, r);
  });
  await expectRed("server stops refusing a repeated cursor row", async () => {
    const d = await moduleFrom("lib/mapAreaData.js", "(id === cursor || pageIds.has(id))", "(false)");
    await checkStalls(d, read);
  });
  await expectRed("a failed area is said as still loading", async () => {
    const a = await moduleFrom("lib/mapListAccounting.js", 'else if (areaStatus === "error") status = "area-failed";', "");
    checkAccounting(a);
  });
  assert.equal(reds.length, 4);
  console.log(`test-map-area-collation-paging: red-prove OK — ${reds.length}/4 mutations went RED`);
}
