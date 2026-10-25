// scripts/test-inventory-free-refresh.mjs — the free-tier inventory refresh keeps
// its three owner promises, asserted on the CALL (import + invoke):
//   1. COSTS $0 EXTRA: spendAllowRefresh never takes a paid grant, never exceeds
//      its own sub-cap, takes from the shared ledger row, and shut = zero calls.
//   2. NEVER DATES CONTENT it did not fetch: essentials / pro checks never move
//      refreshed_at (that date is the age of Google CONTENT).
//   3. NEVER LOSES ANYTHING: no nulling of an existing field, NOT_FOUND only
//      flags, locked rows get flags only, other coordinate entries survive.
// Field masks are checked against Google's published tier table
// (developers.google.com/maps/documentation/places/web-service/data-fields,
// read 2026-10-25). `--red-prove` re-runs everything against mutated copies of
// the protected modules and requires each to go RED.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const url = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const NOW = Date.parse("2026-11-03T12:00:00Z");

// Google's tier table, copied from the docs page above.
const ESSENTIALS_FIELDS = new Set(["id", "name", "photos", "attributions", "movedPlace", "movedPlaceId", "addressComponents", "formattedAddress", "location", "plusCode", "postalAddress", "shortFormattedAddress", "types", "viewport"]);
const PRO_FIELDS = new Set(["businessStatus", "displayName", "googleMapsUri", "primaryType", "timeZone"]);

function load(src, rewrites = []) {
  let out = src;
  for (const [from, to] of rewrites) out = out.split(from).join(to);
  return import("data:text/javascript," + encodeURIComponent(out));
}
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
function mutate(rel, find, replace) {
  const raw = read(rel);
  assert.ok(raw.includes(find), `red-prove setup: ${rel} must contain ${JSON.stringify(find)}`);
  const out = raw.replace(find, replace);
  assert.notEqual(out, raw, "red-prove setup: mutation applied");
  return out;
}
// Import the three protected modules, optionally with one mutated.
async function modules(mut = {}) {
  const gateSrc = mut.spendGate || read("lib/spendGate.js");
  const gate = await load(gateSrc);
  const prov = await import(url("lib/coordProvenance.js"));
  const checkSrc = (mut.check || read("lib/inventoryGoogleCheck.js"))
    .replace('"./spendGate.js"', JSON.stringify(url("lib/spendGate.js")))
    .replace('"./coordProvenance.js"', JSON.stringify(url("lib/coordProvenance.js")))
    .replace('"./sightingRenewal.js"', JSON.stringify(url("lib/sightingRenewal.js")));
  const check = await load(checkSrc);
  const patchSrc = (mut.patch || read("lib/inventoryRefreshPatch.js")).replace(/^import[^;]+;\n/m, 'const placeDiscoveryRef = (id) => "places/" + id + "/photos/wfplacediscovery";\n');
  const patch = await load(patchSrc);
  const backupSrc = mut.backup || null;
  return { gate, prov, check, patch, backupSrc };
}

// A fake Supabase ledger: wf_spend_take / wf_spend_refund over an in-memory map.
function fakeLedger(initial = {}) {
  const used = { ...initial }, calls = [];
  const fn = async (u, init) => {
    const body = JSON.parse(init.body);
    calls.push({ rpc: String(u).split("/").pop(), ...body });
    if (String(u).endsWith("wf_spend_take")) {
      const n = used[body.p_sku] || 0;
      if (n < body.p_cap) { used[body.p_sku] = n + 1; return Response.json(true); }
      return Response.json(false);
    }
    if (String(u).endsWith("wf_spend_refund")) { used[body.p_sku] = Math.max(0, (used[body.p_sku] || 0) - body.p_n); return Response.json(true); }
    return new Response("no", { status: 404 });
  };
  return { used, calls, fn };
}
function env(vars) {
  for (const k of ["WAYFIND_GATE", "WAYFIND_PROMOTE_PAID", "PROMOTE_DETAILS_MONTH_CAP", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
  for (const [k, v] of Object.entries({ SUPABASE_URL: "https://stub.test", SUPABASE_SERVICE_ROLE_KEY: "stub", ...vars })) process.env[k] = v;
}

async function run(m) {
  const { gate, prov, check, patch } = m;
  const realFetch = globalThis.fetch;
  const NOV = new Date("2026-11-03T12:00:00Z"), OCT = new Date("2026-10-25T12:00:00Z");
  try {
    // ── 1a. shut = zero calls, even for the free tier ──
    { const L = fakeLedger(); globalThis.fetch = L.fn; env({ WAYFIND_GATE: "shut" });
      for (const sku of ["details_essentials", "details_pro", "details_enterprise"]) assert.equal(await gate.spendAllowRefresh(sku, NOV), false, `shut: ${sku} refused`);
      assert.equal(L.calls.length, 0, "shut: zero ledger calls"); }

    // ── 1b. October: Pro/Enterprise refresh off; Essentials on ──
    { const L = fakeLedger(); globalThis.fetch = L.fn; env({ WAYFIND_GATE: "free" });
      assert.equal(await gate.spendAllowRefresh("details_pro", OCT), false, "October: Pro refresh is off");
      assert.equal(await gate.spendAllowRefresh("details_enterprise", OCT), false, "October: Enterprise refresh is off");
      assert.equal(L.calls.length, 0, "October: the off tiers never touch the ledger");
      assert.equal(await gate.spendAllowRefresh("details_essentials", OCT), true, "October: Essentials refresh is on"); }

    // ── 1c. sub-caps hold exactly, from an empty ledger, in free mode ──
    for (const [sku, sub, free] of [["details_pro", 2400, 4800], ["details_enterprise", 475, 950], ["details_essentials", 8000, 9500]]) {
      const L = fakeLedger(); globalThis.fetch = L.fn; env({ WAYFIND_GATE: "free" });
      let granted = 0;
      for (let i = 0; i < sub + 50; i++) if (await gate.spendAllowRefresh(sku, NOV)) granted++;
      assert.equal(granted, sub, `${sku}: refresh gets exactly its sub-cap (${sub}), no more`);
      assert.equal(L.used[sku], sub, `${sku}: the grants were counted on the SAME shared ledger row`);
      assert.equal(L.used["refresh_" + sku], sub, `${sku}: and on refresh's own counter`);
      // the rest of the free line is still there for the site / promoter
      let others = 0; for (let i = 0; i < free; i++) if (await gate.spendAllow(sku)) others++;
      assert.equal(others, free - sub, `${sku}: the site keeps the other half of the free line after refresh took its share`);
    }

    // ── 1d. NEVER A PAID GRANT: promoter already past the free line, paid switch ON ──
    { const L = fakeLedger({ details_pro: 4800, details_enterprise: 950, details_essentials: 9500 }); globalThis.fetch = L.fn;
      env({ WAYFIND_GATE: "free", WAYFIND_PROMOTE_PAID: "1", PROMOTE_DETAILS_MONTH_CAP: "7350" });
      for (const sku of ["details_pro", "details_enterprise", "details_essentials"]) assert.equal(await gate.spendAllowRefresh(sku, NOV), false, `${sku}: row at the free line -> refresh refused`);
      assert.equal(L.used.details_pro, 4800, "paid zone untouched: details_pro still 4800");
      assert.equal(L.used.refresh_details_pro || 0, 0, "the refused attempt did not leave a refresh grant behind (refunded)");
      // and with room below the line, the cap sent for the SHARED row is the free line, never the paid ceiling
      const L2 = fakeLedger({ details_pro: 100 }); globalThis.fetch = L2.fn;
      assert.equal(await gate.spendAllowRefresh("details_pro", NOV), true);
      const shared = L2.calls.filter((c) => c.rpc === "wf_spend_take" && c.p_sku === "details_pro");
      assert.deepEqual(shared.map((c) => c.p_cap), [4800], "shared-row cap is 4800 even though the paid switch says 7350"); }

    // ── 1e. open mode behaves identically (still the free line) ──
    { const L = fakeLedger({ details_pro: 4799 }); globalThis.fetch = L.fn; env({ WAYFIND_GATE: "open", WAYFIND_PROMOTE_PAID: "1", PROMOTE_DETAILS_MONTH_CAP: "7350" });
      assert.equal(await gate.spendAllowRefresh("details_pro", NOV), true, "open: last free grant ok");
      assert.equal(await gate.spendAllowRefresh("details_pro", NOV), false, "open: the 4801st is refused"); }

    // ── 1f. unknown SKU ──
    { const L = fakeLedger(); globalThis.fetch = L.fn; env({ WAYFIND_GATE: "free" });
      assert.equal(await gate.spendAllowRefresh("photos", NOV), false, "refresh can only spend its three details SKUs");
      assert.equal(L.calls.length, 0); }

    // ── 1g. masks bill at the tier they claim (Google's published table) ──
    const fields = (mask) => mask.split(",");
    for (const f of fields(check.ESSENTIALS_MASK)) assert.ok(ESSENTIALS_FIELDS.has(f), `ESSENTIALS_MASK field ${f} is Essentials (or free IDs-only) in Google's table`);
    for (const f of fields(check.PRO_MASK)) assert.ok(ESSENTIALS_FIELDS.has(f) || PRO_FIELDS.has(f), `PRO_MASK field ${f} is Essentials or Pro in Google's table`);
    assert.ok(fields(check.PRO_MASK).includes("businessStatus"), "the Pro mask is the one that learns CLOSED_PERMANENTLY");
    assert.ok(!fields(check.ESSENTIALS_MASK).includes("businessStatus"), "the Essentials mask never asks for a Pro field");

    // ── 2/3. plans ──
    const T = NOW;
    const row = (extra = {}) => ({ place_id: "P1", lat: 27.5, lng: -82.4, status: "OPERATIONAL", refreshed_at: "2026-08-01T00:00:00Z", signals: { rating: 4.6, reviews: 120, address: "1 Main" }, independent_coords: null, locked: false, ...extra });
    const okPlace = (extra = {}) => ({ kind: "ok", place: { id: "P1", location: { latitude: 27.5001, longitude: -82.4001 }, ...extra } });
    for (const tier of ["essentials", "pro"]) {
      const plan = check.planCheck(row(), tier, okPlace({ businessStatus: "OPERATIONAL" }), T);
      for (const k of ["refreshed_at", "last_verified_at", "lat", "lng", "excluded", "locked", "google_types", "photo_ref", "name"]) assert.ok(!(k in plan.update), `${tier}: never writes ${k}`);
      assert.equal(plan.update.signals.google_checked_at, new Date(T).toISOString(), `${tier}: stamps the check time`);
      assert.equal(plan.update.signals.rating, 4.6, `${tier}: existing signals survive the merge`);
      assert.equal(plan.update.signals.address, "1 Main");
      const e = plan.update.independent_coords.at(-1);
      assert.equal(e.method, prov.INVENTORY_CHECK_METHOD); assert.equal(e.source, "google_places");
      assert.equal(e.observed_at, new Date(T).toISOString(), `${tier}: the coordinate carries the instant Google returned it`);
    }
    // a Pro check can say CLOSED_PERMANENTLY: status changes, the row is NOT removed
    { const p = check.planCheck(row(), "pro", okPlace({ businessStatus: "CLOSED_PERMANENTLY" }), T);
      assert.equal(p.update.status, "CLOSED_PERMANENTLY"); assert.ok(!("excluded" in p.update) && !("exclusion_reason" in p.update)); }
    // never blanks: absent / junk status, absent location
    { const p = check.planCheck(row(), "pro", { kind: "ok", place: { id: "P1" } }, T);
      assert.ok(!("status" in p.update) && !("independent_coords" in p.update) && !("lat" in p.update), "Google omitted fields -> nothing is written over the stored ones");
      const q = check.planCheck(row(), "pro", okPlace({ businessStatus: "" }), T); assert.ok(!("status" in q.update), "empty status never overwrites"); }
    // essentials never touches status even if Google volunteers one
    { const p = check.planCheck(row(), "essentials", okPlace({ businessStatus: "CLOSED_PERMANENTLY" }), T); assert.ok(!("status" in p.update), "essentials tier does not write status"); }
    // NOT_FOUND: flag only
    { const p = check.planCheck(row(), "essentials", { kind: "not_found" }, T);
      assert.deepEqual(Object.keys(p.update), ["signals"], "NOT_FOUND writes only signals");
      assert.equal(p.update.signals.google_not_found_at, new Date(T).toISOString());
      assert.ok(!("excluded" in p.update) && !("status" in p.update) && !("lat" in p.update));
      const again = check.planCheck(row({ signals: { google_not_found_at: "2026-10-01T00:00:00.000Z" } }), "essentials", { kind: "not_found" }, T);
      assert.equal(again.update.signals.google_not_found_at, "2026-10-01T00:00:00.000Z", "the first NOT_FOUND date is never overwritten"); }
    // locked: flags only
    { const p = check.planCheck(row({ locked: true }), "pro", okPlace({ businessStatus: "CLOSED_PERMANENTLY" }), T);
      assert.deepEqual(Object.keys(p.update), ["signals"], "locked rows keep owner coordinates and status: signals only"); }
    // a pin that jumps >50 m is flagged, not drawn
    { const p = check.planCheck(row(), "essentials", { kind: "ok", place: { id: "P1", location: { latitude: 27.52, longitude: -82.4 } } }, T);
      assert.ok(!("independent_coords" in p.update) && p.update.signals.google_coord_shift_m > 1000, "far move: flagged for review, not drawn"); }
    // other coordinate entries survive; an old entry of OUR method is replaced by the newer one
    { const other = { source: "osm", lat: 27.5, lng: -82.4, observed_at: "2026-09-01T00:00:00Z", method: "x" };
      const mine = { source: "google_places", lat: 27.5, lng: -82.4, observed_at: "2026-09-01T00:00:00Z", method: prov.INVENTORY_CHECK_METHOD };
      const p = check.planCheck(row({ independent_coords: [other, mine] }), "essentials", okPlace(), T);
      assert.deepEqual(p.update.independent_coords[0], other, "non-Google entries are preserved untouched");
      assert.equal(p.update.independent_coords.filter((e) => e.method === prov.INVENTORY_CHECK_METHOD).length, 1); }
    // enterprise: the dated patch never blanks either
    { const dated = { details: { id: "P1", lat: 27.5, lng: -82.4, types: [], businessStatus: null, photoRef: null }, live: true, fetchedAt: new Date(T).toISOString() };
      const pt = patch.inventoryRefreshPatch("P1", dated, T + 1000, "2026-08-01T00:00:00Z");
      for (const k of ["google_types", "status", "photo_ref"]) assert.ok(!(k in pt), `enterprise patch: ${k} is not written when Google returned nothing for it`);
      const pe = check.planEnterprise(row(), { kind: "ok", place: {} }, pt, T);
      assert.equal(pe.update.refreshed_at, new Date(T).toISOString(), "enterprise (live content) does re-date");
      const locked = check.planEnterprise(row({ locked: true }), { kind: "ok", place: { id: "P1" } }, pt, T);
      assert.ok(!("refreshed_at" in locked.update) && !("lat" in locked.update), "enterprise on a locked row: no date, no coordinate"); }
    assert.deepEqual(check.tierOrder(row({ locked: true })), ["essentials"]);

    // ── map: a check entry lets a stale-content row draw for 30 days, then stops ──
    { const stale = { lat: 27.5, lng: -82.4, refreshed_at: "2026-08-01T00:00:00Z", independent_coords: check.planCheck(row(), "essentials", okPlace(), T).update.independent_coords };
      assert.equal(prov.resolveMapCoordinate(stale, T + 5 * 86400000).ok, true, "5 days after the check the pin may be drawn");
      assert.equal(prov.resolveMapCoordinate(stale, T + 31 * 86400000).ok, false, "31 days after the check Google's window has closed");
      assert.equal(prov.resolveMapCoordinate({ ...stale, independent_coords: [{ ...stale.independent_coords[0], method: "something-else" }] }, T + 86400000).ok, false, "an unknown method claiming google_places is still refused"); }

    // ── fetcher: shut = no request; 404 -> not_found; 429 -> denied (unbilled) ──
    { let hits = 0; const f = (status) => async () => { hits++; return new Response(status === 200 ? "{\"id\":\"P1\"}" : "x", { status }); };
      env({ WAYFIND_GATE: "shut" });
      assert.equal((await check.fetchGoogleCheck("P1", check.ESSENTIALS_MASK, { key: "k", fetchFn: f(200) })).kind, "error"); assert.equal(hits, 0, "shut: the fetcher makes no request");
      env({ WAYFIND_GATE: "free" });
      assert.equal((await check.fetchGoogleCheck("P1", check.ESSENTIALS_MASK, { key: "k", fetchFn: f(404) })).kind, "not_found");
      const d = await check.fetchGoogleCheck("P1", check.ESSENTIALS_MASK, { key: "k", fetchFn: f(429) }); assert.equal(d.kind, "denied"); assert.equal(d.billed, false);
      assert.equal((await check.fetchGoogleCheck("P1", check.ESSENTIALS_MASK, { key: "k", fetchFn: f(503) })).billed, false);
      assert.equal((await check.fetchGoogleCheck("P1", check.ESSENTIALS_MASK, { key: "k", fetchFn: f(200) })).kind, "ok"); }
    // ── backup SQL: create-only, RLS on, no grants ──
    { const bk = await import(url("scripts/lib/inventoryBackup.mjs").replace("scripts/lib/inventoryBackup.mjs", "scripts/lib/inventoryBackup.mjs"));
      const sql = (m.backupSrc ? await load(m.backupSrc) : bk).buildBackupSql("20261025");
      assert.ok(/create table public\.wf_inventory_backup_20261025 as select \* from public\.wf_inventory;/.test(sql), "backup copies every column of every row");
      assert.ok(/enable row level security/.test(sql) && /revoke all on public\.wf_inventory_backup_20261025 from anon, authenticated/.test(sql), "backup table has RLS on and no public grants");
      assert.ok(!/\b(drop|delete|truncate|update|alter\s+table\s+public\.wf_inventory\b)/i.test(sql.split("\n").filter((l) => !/^comment on/.test(l)).join("\n")), "backup SQL is create-only");
      assert.throws(() => bk.buildBackupSql("2026; drop table x"), "date is validated"); }
  } finally {
    globalThis.fetch = realFetch;
    for (const k of ["WAYFIND_GATE", "WAYFIND_PROMOTE_PAID", "PROMOTE_DETAILS_MONTH_CAP", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) delete process.env[k];
  }
}

const REDS = [
  ["refresh takes the shared row at the PAID ceiling", () => ({ spendGate: mutate("lib/spendGate.js", "if (await takeFromLedger(sku, free)) return true;", "if (await takeFromLedger(sku, effectiveCap(sku, 999999))) return true;") })],
  ["refresh sub-cap not enforced", () => ({ spendGate: mutate("lib/spendGate.js", "if (!(await takeFromLedger(refreshCounterSku(sku), sub))) return false;", "") })],
  ["refresh ignores the shut gate", () => ({ spendGate: mutate("lib/spendGate.js", 'export async function spendAllowRefresh(sku, now = new Date()) {\n  if (gateMode() === "shut") return false;', "export async function spendAllowRefresh(sku, now = new Date()) {") })],
  ["rich tiers start before November", () => ({ spendGate: mutate("lib/spendGate.js", "return utcLedgerMonth(now) >= REFRESH_RICH_TIERS_FROM_MONTH;", "return true;") })],
  ["a denied shared grant keeps the refresh grant", () => ({ spendGate: mutate("lib/spendGate.js", "await refundToLedger(refreshCounterSku(sku), 1);\n  return false;", "return false;") })],
  ["essentials check re-dates refreshed_at", () => ({ check: mutate("lib/inventoryGoogleCheck.js", "const update = { signals: sig };", "const update = { signals: sig, refreshed_at: at };") })],
  ["NOT_FOUND excludes the row", () => ({ check: mutate("lib/inventoryGoogleCheck.js", "sig.google_not_found_last_at = at;", "sig.google_not_found_last_at = at; update.excluded = true;") })],
  ["pro check blanks status when Google omits it", () => ({ check: mutate("lib/inventoryGoogleCheck.js", 'if (tier === "pro" && typeof place.businessStatus === "string" && STATUSES.has(place.businessStatus)) {\n    if (place.businessStatus !== row.status) update.status = place.businessStatus;\n  }', 'if (tier === "pro") { update.status = place.businessStatus || null; }') })],
  ["locked rows lose their coordinates", () => ({ check: mutate("lib/inventoryGoogleCheck.js", "export function rowIsFlagOnly(row) { return !row || row.locked === true; }", "export function rowIsFlagOnly(row) { return !row; }") })],
  ["essentials mask asks for a Pro field", () => ({ check: mutate("lib/inventoryGoogleCheck.js", 'export const ESSENTIALS_MASK = "id,location,movedPlaceId";', 'export const ESSENTIALS_MASK = "id,location,movedPlaceId,displayName";') })],
  ["fetcher ignores the shut gate", () => ({ check: mutate("lib/inventoryGoogleCheck.js", 'if (gateShut()) return { kind: "error", status: 0, billed: false };', "") })],
  ["other coordinate entries are dropped", () => ({ check: mutate("lib/inventoryGoogleCheck.js", "update.independent_coords = [...others, entry];", "update.independent_coords = [entry];") })],
  ["backup turns destructive / drops RLS", () => ({ backup: mutate("scripts/lib/inventoryBackup.mjs", "`alter table public.${t} enable row level security;`,", "`delete from public.wf_inventory;`,") })],
  ["enterprise patch blanks types", () => ({ patch: mutate("lib/inventoryRefreshPatch.js", "if (Array.isArray(d.types) && d.types.length) patch.google_types = d.types;", "patch.google_types = Array.isArray(d.types) ? d.types : [];") })],
];

if (process.argv.includes("--red-prove")) {
  let n = 0;
  for (const [name, mk] of REDS) {
    let went = false;
    try { await run(await modules(mk())); } catch (e) { went = true; if (/red-prove setup/.test(String(e && e.message))) throw e; }
    assert.ok(went, `red-prove: "${name}" must make the test fail`);
    console.log("  RED as required: " + name); n++;
  }
  console.log(`test-inventory-free-refresh: red-prove OK — ${n}/${REDS.length} mutations went RED`);
} else {
  await run(await modules());
  console.log(`test-inventory-free-refresh: OK — shut=zero calls; Pro 2400 / Enterprise 475 / Essentials 8000 sub-caps hold on the shared rows; never a paid grant; Nov-only rich tiers; masks match Google's tier table; essentials/pro never re-date; nothing nulled, excluded or lost (${REDS.length} red-proves via --red-prove)`);
}
