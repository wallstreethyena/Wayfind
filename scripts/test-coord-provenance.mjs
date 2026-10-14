// scripts/test-coord-provenance.mjs — source-aware map coordinates, no
// timestamp-bump extension, and list/map parity accounting (2026-10-14).
//
// Three behaviours, each asserted on the CALL (import + invoke), each with a
// positive and a negative control:
//   A. SOURCE-AWARE FRESHNESS (lib/coordProvenance.js, lib/mapAreaData.js): a
//      Google Places coordinate is drawable only inside its 30-day cache
//      window (Maps Service Specific Terms §14.3); an independently sourced
//      coordinate is judged by its own licence; an unknown source never draws.
//   B. NO TIMESTAMP-BUMP EXTENSION (lib/inventoryRefreshPatch.js,
//      lib/placeDetails.getPlaceDetailsDated, app/api/cron/inventory-refresh):
//      refreshed_at moves only for content fetched live in that call, is dated
//      by that fetch, and carries the fetched lat/lng. A cached copy re-dates
//      nothing. The cron route itself is executed with stubbed DB/details.
//   C. LIST/MAP PARITY ACCOUNTING (lib/mapListAccounting.js): every list place
//      gets exactly one map status; a list place with no permitted coordinate
//      is counted as such, never silently missing.
//
// Red-proof: `node scripts/test-coord-provenance.mjs --red-prove` re-runs the
// three behaviour checks against mutated copies of the protected modules
// (window widened, cron re-stamping now, accounting dropping a place) and
// requires each to go RED.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const DAY = 86400000;
const NOW = Date.parse("2026-10-14T12:00:00Z");
const RYANS = "ChIJo_IdHf0lw4gRHDbQNKBRE84";

// Load a module's source with its imports replaced by a prelude (and optional
// source mutation), as a data: module. Relative imports kept in the prelude
// must be absolute file: URLs.
async function sourceModule(rel, prelude, mutate = (s) => s) {
  const raw = readFileSync(path.join(ROOT, rel), "utf8");
  const mutated = mutate(raw); // callers assert their mutation applied
  const source = mutated.replace(/^import[^;]+;\n/gm, "");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + source));
}
const fileUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

function mutated(rel, find, replace) {
  const raw = readFileSync(path.join(ROOT, rel), "utf8");
  assert.ok(raw.includes(find), `red-prove setup: ${rel} must contain ${JSON.stringify(find)}`);
  const out = raw.replace(find, replace);
  assert.notEqual(out, raw, `red-prove setup: mutation of ${rel} did not apply`);
  return out;
}

// ── A ────────────────────────────────────────────────────────────────────────
async function checkFreshness(prov, mapData) {
  const { judgeCoordinate, resolveMapCoordinate, mapCoordVerdict, mapCoordAllowedNow, COORD_SOURCES, NO_PERMITTED_COORDINATE } = prov;
  const g = (ageDays, extra = {}) => ({ source: "google_places", lat: 27.54, lng: -82.48, observed_at: new Date(NOW - ageDays * DAY).toISOString(), ...extra });
  assert.equal(judgeCoordinate(g(1), NOW).ok, true, "A: a 1-day-old Google coordinate is drawable");
  assert.equal(judgeCoordinate(g(29.9), NOW).ok, true, "A: inside the 30-day window is drawable");
  assert.equal(judgeCoordinate(g(30.1), NOW).reason, "coordinate-expired", "A: past 30 days a Google coordinate is not drawable");
  assert.equal(judgeCoordinate(g(0, { observed_at: null }), NOW).reason, "coordinate-undated", "A: an undated Google coordinate is not drawable");
  assert.equal(judgeCoordinate(g(-1), NOW).reason, "coordinate-future-dated", "A: a future-dated Google coordinate is not drawable");
  assert.equal(judgeCoordinate({ source: "osm", lat: 27.54, lng: -82.48 }, NOW).ok, true, "A: an OSM coordinate has no Google clock");
  assert.equal(judgeCoordinate({ source: "osm", lat: 27.54, lng: -82.48 }, NOW).attribution, COORD_SOURCES.osm.attribution, "A: OSM carries its ODbL attribution");
  assert.equal(judgeCoordinate({ source: "scraped_somewhere", lat: 27.54, lng: -82.48 }, NOW).reason, "unknown-source", "A: an unlisted source never draws");
  assert.equal(judgeCoordinate({ source: "osm", lat: 127, lng: -82.48 }, NOW).reason, "coordinate-invalid");
  const staleRow = { place_id: RYANS, lat: 27.5403614, lng: -82.4805321, refreshed_at: "2026-08-14T03:20:13Z" };
  const stale = resolveMapCoordinate(staleRow, NOW);
  assert.equal(stale.ok, false, "A: Ryan's (refreshed 2026-08-14) has no permitted coordinate on 2026-10-14");
  assert.equal(stale.reason, NO_PERMITTED_COORDINATE);
  const indep = resolveMapCoordinate({ ...staleRow, independent_coords: [{ source: "osm", lat: 27.5404, lng: -82.4806, ref: "node/1" }] }, NOW);
  assert.equal(indep.ok && indep.source, "osm", "A: an independent coordinate wins when Google's window has passed");
  assert.equal(indep.lat, 27.5404, "A: the pin uses the independent coordinate, not the expired Google one");
  const spoof = resolveMapCoordinate({ ...staleRow, independent_coords: [{ source: "google_places", lat: 1, lng: 1, observed_at: new Date(NOW).toISOString() }] }, NOW);
  assert.equal(spoof.ok, false, "A: a Google coordinate cannot re-enter dressed as an independent one");
  // List verdict + browser re-check of an edge-cached verdict.
  const v = mapCoordVerdict({ ...staleRow, refreshed_at: new Date(NOW - 29 * DAY).toISOString() }, NOW);
  assert.equal(v.ok, true);
  assert.equal(mapCoordAllowedNow({ mapCoord: v }, NOW), true);
  assert.equal(mapCoordAllowedNow({ mapCoord: v }, NOW + 2 * DAY), false, "A: a cached ok verdict expires in the browser at its until");
  assert.equal(mapCoordAllowedNow({ mapCoord: mapCoordVerdict(staleRow, NOW) }, NOW), false);
  assert.equal(mapCoordAllowedNow({}, NOW), null, "A: no verdict is unknown, never 'not permitted'");
  // The map candidate path (pins) obeys the same rule.
  const base = { name: "Ryan's Coffee House", metro: "manatee-sarasota", category: "food", primary_type: "coffee_shop", google_types: ["coffee_shop"], signals: { rating: 4.9, reviews: 205 }, status: "OPERATIONAL" };
  const origin = { lat: 27.5689, lng: -82.4393 };
  const fresh = mapData.mapInventoryPlace({ ...base, ...staleRow, refreshed_at: new Date(NOW - 5 * DAY).toISOString() }, NOW, origin);
  assert.ok(fresh && fresh.coordSource === "google_places", "A: positive control — a fresh Google row is a pin");
  assert.equal(mapData.mapInventoryPlace({ ...base, ...staleRow }, NOW, origin), null, "A: the same row past 30 days is not a pin");
  const viaOsm = mapData.mapInventoryPlace({ ...base, ...staleRow, independent_coords: [{ source: "osm", lat: 27.5404, lng: -82.4806 }] }, NOW, origin);
  assert.ok(viaOsm && viaOsm.coordSource === "osm" && viaOsm.lat === 27.5404 && /OpenStreetMap/.test(viaOsm.coordAttribution), "A: an independent coordinate makes a truthful, attributed pin");
  // The area reader's prefilter reads only rows inside the Google window.
  let seenUrl = null;
  await mapData.readMapAreaPage({ bounds: { north: 28, south: 27, east: -82, west: -83 }, origin, now: NOW,
    config: { url: "https://owned.example", key: "k" },
    fetcher: async (url) => { seenUrl = url; return { ok: true, json: async () => [] }; } });
  assert.equal(new URL(seenUrl).searchParams.get("refreshed_at"), "gte." + new Date(NOW - 30 * DAY).toISOString(), "A: the map area read never fetches expired Google rows");
}

// ── B ────────────────────────────────────────────────────────────────────────
async function checkNoBump({ patchMod, placeDetailsMutate = (s) => s, cronMutate = (s) => s }) {
  const { inventoryRefreshPatch } = patchMod;
  const details = { id: RYANS, name: "Ryan's Coffee House", lat: 27.54036, lng: -82.48053, types: ["coffee_shop"], businessStatus: "OPERATIONAL", photoRef: "x" };
  const fetchedAt = new Date(NOW - 60000).toISOString();
  const live = inventoryRefreshPatch(RYANS, { details, live: true, fetchedAt }, NOW);
  assert.ok(live, "B: positive control — live content makes a patch");
  assert.equal(live.refreshed_at, fetchedAt, "B: refreshed_at is the fetch time, never 'now'");
  assert.equal(live.lat, details.lat, "B: the fetched coordinate is written with its date");
  assert.equal(live.lng, details.lng);
  assert.equal(inventoryRefreshPatch(RYANS, { details, live: false, fetchedAt: null }, NOW), null, "B: a cached copy never re-dates a row");
  assert.equal(inventoryRefreshPatch(RYANS, { details, live: false, fetchedAt }, NOW), null, "B: a cached copy never re-dates a row even if it carries a time");
  assert.equal(inventoryRefreshPatch(RYANS, { details, live: true, fetchedAt: null }, NOW), null, "B: undated content never re-dates a row");
  assert.equal(inventoryRefreshPatch(RYANS, { details, live: true, fetchedAt: new Date(NOW + DAY).toISOString() }, NOW), null, "B: future-dated content never re-dates a row");
  assert.equal(inventoryRefreshPatch(RYANS, { details: { ...details, lat: null }, live: true, fetchedAt }, NOW), null, "B: content without a coordinate never re-dates the coordinate");
  assert.equal(inventoryRefreshPatch("other", { details, live: true, fetchedAt }, NOW), null, "B: another place's content never re-dates this row");

  // getPlaceDetailsDated: cache hit is not live; a provider fetch is live.
  globalThis.__pd = { cache: null, sets: 0 };
  const pd = await sourceModule("lib/placeDetails.js", `
    const DAY = 86400000;
    const cget = async () => globalThis.__pd.cache;
    const cset = async () => { globalThis.__pd.sets++; };
    const gateShut = () => false;
    const spendAllow = async () => true;
    const placeDiscoveryRef = (id) => "places/" + id + "/photos/wfplacediscovery";
  `, placeDetailsMutate);
  const realFetch = globalThis.fetch;
  try {
    process.env.GOOGLE_MAPS_SERVER_KEY = "fixture-not-a-key";
    let provider = 0;
    globalThis.fetch = async (url) => { assert.equal(new URL(url).hostname, "places.googleapis.com"); provider++; return Response.json({ id: RYANS, displayName: { text: "Ryan's" }, location: { latitude: 27.5, longitude: -82.4 } }); };
    globalThis.__pd.cache = { v: { id: RYANS, name: "Ryan's", lat: 1, lng: 1, photoRef: null }, stale: false, ageMs: 25 * DAY };
    const hit = await pd.getPlaceDetailsDated(RYANS);
    assert.equal(hit.live, false, "B: a cache hit is reported as not live");
    assert.equal(hit.fetchedAt, null);
    assert.equal(provider, 0, "B: the dated read adds no provider call on a cache hit");
    globalThis.__pd.cache = null;
    const miss = await pd.getPlaceDetailsDated(RYANS);
    assert.equal(miss.live, true, "B: a provider fetch is reported as live");
    assert.ok(Number.isFinite(Date.parse(miss.fetchedAt)));
    assert.equal(provider, 1, "B: exactly one provider call, same as getPlaceDetails");
    assert.equal((await pd.getPlaceDetails(RYANS)).id, RYANS, "B: getPlaceDetails still returns the details object");
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_MAPS_SERVER_KEY; // fixture only; each guard is its own process
  }

  // Execute the cron route with stubbed DB + details: a cached copy must not
  // update the row; live content updates it with its own fetch time.
  globalThis.__cron = { updates: [], dated: {} };
  const cron = await sourceModule("app/api/cron/inventory-refresh/route.js", `
    import { inventoryRefreshPatch } from "${fileUrl("lib/inventoryRefreshPatch.js")}";
    const gateShut = () => false; const gateFree = () => false;
    const recordPulse = async () => {};
    const jobCannotRun = (j, m) => Response.json({ cannot: m }, { status: 503 });
    const jobFailed = (j, m) => Response.json({ failed: m }, { status: 500 });
    const getPlaceDetailsDated = async (id) => globalThis.__cron.dated[id];
    const createClient = () => ({ from: () => {
      const q = { select: () => q, lt: () => q, order: () => q,
        limit: async () => ({ data: [{ place_id: "cached1", refreshed_at: "2026-08-01T00:00:00Z" }, { place_id: "live1", refreshed_at: "2026-08-01T00:00:00Z" }], error: null }),
        update: (patch) => ({ eq: async (col, id) => { globalThis.__cron.updates.push({ id, patch }); return { error: null }; } }) };
      return q; } });
  `, cronMutate);
  const liveAt = new Date(Date.now() - 1000).toISOString();
  globalThis.__cron.dated = {
    cached1: { details: { ...details, id: "cached1" }, live: false, fetchedAt: null },
    live1: { details: { ...details, id: "live1" }, live: true, fetchedAt: liveAt },
  };
  try {
    process.env.CRON_SECRET = "fixture"; process.env.NEXT_PUBLIC_SUPABASE_URL = "https://db.example.test"; process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture";
    const res = await cron.GET(new Request("https://fixture.test/api/cron/inventory-refresh", { headers: { authorization: "Bearer fixture" } }));
    assert.equal(res.status, 200);
    const ids = globalThis.__cron.updates.map((u) => u.id);
    assert.deepEqual(ids, ["live1"], "B: the cron updates only the row whose content was fetched live");
    assert.equal(globalThis.__cron.updates[0].patch.refreshed_at, liveAt, "B: the cron dates the row by the fetch, never by 'now'");
    assert.equal(globalThis.__cron.updates[0].patch.lat, details.lat, "B: the cron writes the fetched coordinate");
  } finally {
    for (const k of ["CRON_SECRET", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k]; // fixture only
  }
}

// ── C ────────────────────────────────────────────────────────────────────────
function checkParity(acc, prov) {
  const { accountListOnMap, MAP_LIST_STATUSES } = acc;
  const ok = (id) => ({ id, mapCoord: prov.mapCoordVerdict({ lat: 27.5, lng: -82.4, refreshed_at: new Date(NOW - 2 * DAY).toISOString() }, NOW) });
  const stale = (id) => ({ id, mapCoord: prov.mapCoordVerdict({ lat: 27.5, lng: -82.4, refreshed_at: "2026-08-14T03:20:13Z" }, NOW) });
  const list = [stale(RYANS), ok("pinned1"), ok("floor1"), ok("away1"), { id: "nojudge" }, stale(RYANS)];
  const r = accountListOnMap({ listPlaces: list, pins: [{ id: "pinned1" }], areaPlaces: [{ id: "pinned1" }, { id: "floor1" }], areaStatus: "ready", now: NOW });
  assert.equal(r.total, 5, "C: duplicates count once");
  assert.equal(r.rows.length, new Set(r.rows.map((x) => x.id)).size, "C: one status per place");
  for (const row of r.rows) assert.ok(MAP_LIST_STATUSES.includes(row.status), `C: ${row.id} has a known status`);
  const statusOf = Object.fromEntries(r.rows.map((x) => [x.id, x.status]));
  assert.equal(statusOf[RYANS], "no-permitted-coordinate", "C: Ryan's is accounted as no permitted coordinate");
  assert.equal(statusOf.pinned1, "pinned", "C: positive control — a drawn place is pinned");
  assert.equal(statusOf.floor1, "below-map-floor");
  assert.equal(statusOf.away1, "not-in-map-area");
  assert.equal(statusOf.nojudge, "not-in-map-area", "C: an unjudged place is never claimed as a coordinate refusal");
  assert.equal(Object.values(r.counts).reduce((a, b) => a + b, 0), r.total, "C: counts add up to the list (nothing silently missing)");
  assert.equal(r.unmapped.length, r.total - r.counts.pinned);
  const loading = accountListOnMap({ listPlaces: [ok("a")], pins: [], areaPlaces: [], areaStatus: "loading", now: NOW });
  assert.equal(loading.rows[0].status, "area-not-ready");
  // Map.js renders the accounting (visible note + diagnostic hook).
  const screen = readFileSync(path.join(ROOT, "app/components/screens/Map.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
  assert.match(screen, /accountListOnMap\(\{\s*listPlaces:\s*contextualView/, "C: the map accounts for the on-screen list");
  assert.match(screen, /window\.__wfMapList\s*=/, "C: the accounting is published for the synthetic monitor");
  assert.match(screen, /data-wf-map-unpinned=\{unpinnedForCoord\}/, "C: the unpinned count is rendered on screen");
}

async function loadAll(overrides = {}) {
  const prov = await import(fileUrl("lib/coordProvenance.js"));
  const provMut = overrides.prov ? await import("data:text/javascript," + encodeURIComponent(overrides.prov)) : prov;
  const mapData = await import(fileUrl("lib/mapAreaData.js"));
  const patchMod = overrides.patch ? await import("data:text/javascript," + encodeURIComponent(overrides.patch)) : await import(fileUrl("lib/inventoryRefreshPatch.js"));
  const acc = overrides.acc ? await import("data:text/javascript," + encodeURIComponent(overrides.acc)) : await import(fileUrl("lib/mapListAccounting.js"));
  return { prov: provMut, mapData, patchMod, acc };
}

async function main() {
  const m = await loadAll();
  await checkFreshness(m.prov, m.mapData);
  await checkNoBump({ patchMod: m.patchMod });
  checkParity(m.acc, m.prov);

  if (process.argv.includes("--red-prove")) {
    const reds = [];
    const expectRed = async (label, fn) => {
      try { await fn(); } catch (e) { reds.push(label); console.log(`  RED as required: ${label} — ${String(e.message).split("\n")[0]}`); return; }
      throw new Error(`red-prove: ${label} stayed GREEN`);
    };
    const provSrc = (find, rep) => mutated("lib/coordProvenance.js", find, rep);
    await expectRed("Google window widened to 90 days", async () => {
      const src = provSrc("export const GOOGLE_COORD_MAX_AGE_DAYS = 30;", "export const GOOGLE_COORD_MAX_AGE_DAYS = 90;");
      await checkFreshness(await import("data:text/javascript," + encodeURIComponent(src)), m.mapData);
    });
    await expectRed("undated Google coordinate accepted", async () => {
      const src = provSrc('if (!Number.isFinite(observed)) return { ok: false, reason: "coordinate-undated", source };', "");
      await checkFreshness(await import("data:text/javascript," + encodeURIComponent(src)), m.mapData);
    });
    await expectRed("patch re-stamps refreshed_at = now", async () => {
      const src = mutated("lib/inventoryRefreshPatch.js", "const at = new Date(fetched).toISOString();", "const at = new Date(now).toISOString();")
        .replace(/^import[^;]+;\n/m, 'const placeDiscoveryRef = (id) => "places/" + id + "/photos/wfplacediscovery";\n');
      await checkNoBump({ patchMod: await import("data:text/javascript," + encodeURIComponent(src)) });
    });
    await expectRed("patch accepts cached content", async () => {
      const src = mutated("lib/inventoryRefreshPatch.js", "if (!placeId || !dated || dated.live !== true) return null;", "if (!placeId || !dated) return null;")
        .replace(/^import[^;]+;\n/m, 'const placeDiscoveryRef = (id) => "places/" + id + "/photos/wfplacediscovery";\n');
      await checkNoBump({ patchMod: await import("data:text/javascript," + encodeURIComponent(src)) });
    });
    await expectRed("cron reverts to stamping now after any details read", async () => {
      await checkNoBump({ patchMod: m.patchMod, cronMutate: (s) => {
        const out = s.replace("const patch = inventoryRefreshPatch(row.place_id, dated);", "const patch = dated && dated.details ? { refreshed_at: new Date().toISOString(), last_verified_at: new Date().toISOString() } : null;");
        assert.notEqual(out, s, "cron mutation applied"); return out; } });
    });
    await expectRed("getPlaceDetailsDated reports a cache hit as live", async () => {
      await checkNoBump({ patchMod: m.patchMod, placeDetailsMutate: (s) => {
        const out = s.replace('const cached = (details) => ({ details: details || null, live: false, fetchedAt: null });', 'const cached = (details) => ({ details: details || null, live: true, fetchedAt: new Date().toISOString() });');
        assert.notEqual(out, s, "placeDetails mutation applied"); return out; } });
    });
    await expectRed("accounting silently drops refused places", async () => {
      const src = mutated("lib/mapListAccounting.js", "else if (mapCoordAllowedNow(p, now) === false) status = NO_PERMITTED_COORDINATE;", "else if (mapCoordAllowedNow(p, now) === false) continue;")
        .replace(/^import[^;]+;\n/m, `import { mapCoordAllowedNow, NO_PERMITTED_COORDINATE } from "${fileUrl("lib/coordProvenance.js")}";\n`);
      checkParity(await import("data:text/javascript," + encodeURIComponent(src)), m.prov);
    });
    console.log(`test-coord-provenance: red-prove OK — ${reds.length}/7 mutations went RED`);
    assert.equal(reds.length, 7);
  }
  console.log("test-coord-provenance: OK — A source-aware freshness (Google 30d window, independent sources by licence, unknown/undated/future refused, map pins + area prefilter), B no timestamp-bump (patch dated by live fetch, cached copy re-dates nothing, cron route executed with stubbed DB), C list/map parity accounting (every list place exactly one status, Ryan's = no-permitted-coordinate).");
}

main().catch((e) => { console.error("test-coord-provenance: FAIL —", e && e.stack || e); process.exit(1); });
