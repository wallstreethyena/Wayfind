#!/usr/bin/env node
// check-provider-empty-answers — the two remaining "empty answer" leaks found
// by the 2026-09-15 text_pro investigation (#1327 fixed the Google one).
//
//  1. /api/fsq/search: an honest EMPTY Foursquare answer wrote nothing, so the
//     same question hit the provider again on every request. Now: ok-empty is
//     cached under a short 3-day clock; real rows keep FSQ_TTL_MS (30d); an
//     exhausted chain (ok:false) still writes nothing and serves stale.
//
//  2. lib/landing.js: a DENIED text_pro grant returned [] and searchOnce()
//     cached that [] for 30 days ("live !== null"), blanking a city's organic
//     page for a month after one denial. Now: denial returns null → stale row
//     served, nothing written.
//
// Both EXECUTE the real code with only the network edges mocked.
import { readFileSync } from "node:fs";
import { DAY } from "../lib/serverCache.js";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };
const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// ── 1. Foursquare route, hermetic ───────────────────────────────────────────
async function loadFsq(prelude) {
  let src = read("app/api/fsq/search/route.js");
  src = src.replace(/^import[^;]+;\n/gm, "").replace(/^export const runtime[^\n]*\n/m, "");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + src));
}
function fsqHarness(results, okFlag = true) {
  const S = { calls: 0, cache: new Map() };
  globalThis.__F = Object.assign(S, { results: () => results, okFlag });
  const prelude = `
    const DAY = ${DAY};
    const cget = async (k, o) => { const r = __F.cache.get(k); return r ? { v: r.v, stale: false } : null; };
    const cset = async (k, v, ttl) => { __F.cache.set(k, { v, ttl }); };
    const fsqSearch = async () => { __F.calls++; return { ok: __F.okFlag, results: __F.results() }; };
    const fsqOutcomeLabel = () => "ok";
    globalThis.process.env.FOURSQUARE_API_KEY = "test";
  `;
  return { S, prelude };
}
const REQ = () => ({ url: "https://x.test/api/fsq/search?q=late+night+food&lat=27.58&lng=-82.42&radius=27000&limit=30", headers: new Headers() });

{ // 1a. ok-empty: two identical asks → ONE provider call, [] cached on the short clock
  const { S, prelude } = fsqHarness([]);
  const m = await loadFsq(prelude);
  const r1 = await (await m.GET(REQ())).json();
  const r2 = await (await m.GET(REQ())).json();
  ok(Array.isArray(r1.places) && r1.places.length === 0 && Array.isArray(r2.places) && r2.places.length === 0, "fsq 1a: both answers honestly empty");
  ok(S.calls === 1, `fsq 1a: two identical asks reach Foursquare ONCE (got ${S.calls})`);
  const row = [...S.cache.values()][0];
  ok(row && row.v.length === 0 && row.ttl === 3 * DAY, `fsq 1a: empty answer cached under the 3-day clock (ttl ${row && row.ttl})`);
}
{ // 1b. ok:false (exhausted chain): nothing cached, provider asked again next time (stale path)
  const { S, prelude } = fsqHarness([], false);
  const m = await loadFsq(prelude);
  await m.GET(REQ()); await m.GET(REQ());
  ok(S.cache.size === 0, "fsq 1b: an exhausted chain (ok:false) writes NOTHING — a provider outage is never remembered as 'nothing here'");
  ok(S.calls === 2, "fsq 1b: …and is retried on the next request");
}
{ // 1c. real rows keep the 30-day clock, unchanged
  const rows = [{ fsq_id: "a", name: "Taco Bus", geocodes: { main: { latitude: 27.58, longitude: -82.42 } }, location: { formatted_address: "x" }, categories: [], distance: 100 }];
  const { S, prelude } = fsqHarness(rows);
  const m = await loadFsq(prelude);
  const r1 = await (await m.GET(REQ())).json();
  const r2 = await (await m.GET(REQ())).json();
  const row = [...S.cache.values()][0];
  ok(r1.places.length === 1 && r2.cached === true && S.calls === 1, "fsq 1c: a real answer serves and hits cache on the second ask");
  ok(row && row.ttl === 30 * DAY, "fsq 1c: real rows still cached under FSQ_TTL_MS (30d)");
}

// ── 2. landing.js searchOnce / _searchGoogle, executed in isolation ─────────
const LANDING = read("lib/landing.js");
function fn(name) {
  const m = LANDING.match(new RegExp("\\n(async function " + name + "\\([\\s\\S]*?\\n})\\n"));
  if (!m) throw new Error("could not extract " + name);
  return m[1];
}
async function loadLanding(prelude) {
  const body = [fn("_cacheRow"), fn("_cachePut"), fn("searchOnce"), fn("_searchGoogle")].join("\n");
  return import("data:text/javascript," + encodeURIComponent(prelude + "\n" + body + "\nexport { searchOnce as __searchOnce };"));
}
function landingHarness({ deny, staleRow }) {
  const S = { puts: [], google: 0 };
  globalThis.__L = Object.assign(S, { deny, staleRow });
  const prelude = `
    const NET_DEADLINE_MS = 1000, DB_DEADLINE_MS = 1000;
    const isSsgBuild = () => false;
    const gateShut = () => false;
    const spendAllow = async () => !__L.deny;
    const _sb = () => ({ url: "https://db.test", k: "k" });
    const fetchDeadline = async (url, init) => {
      const u = String(url);
      if (u.includes("/rest/v1/wf_places_cache") && (!init || !init.method)) return new Response(JSON.stringify(__L.staleRow ? [__L.staleRow] : []), { status: 200 });
      if (u.includes("/rest/v1/wf_places_cache")) { __L.puts.push(JSON.parse(init.body)); return new Response("", { status: 201 }); }
      if (u.includes("places.googleapis.com")) { __L.google++; return new Response(JSON.stringify({ places: [] }), { status: 200 }); }
      throw new Error("unexpected " + u);
    };
    globalThis.process.env.GOOGLE_MAPS_SERVER_KEY = "test-key";
  `;
  return { S, prelude };
}
const CITY = { name: "Parrish", state: "FL", lat: 27.58, lng: -82.42 };
{ // 2a. denied grant, no stale row → null, and NOTHING is written
  const { S, prelude } = landingHarness({ deny: true, staleRow: null });
  const m = await loadLanding(prelude);
  const out = await m.__searchOnce("best restaurants", CITY, 24000, true, false);
  ok(out === null, `landing 2a: a denied grant yields null, not [] (got ${JSON.stringify(out)})`);
  ok(S.puts.length === 0, `landing 2a: nothing written to the 30-day cache on a denial (wrote ${S.puts.length})`);
  ok(S.google === 0, "landing 2a: Google not called");
}
{ // 2b. denied grant WITH an expired stale row → the stale list is served, still nothing written
  const stale = { v: [{ id: "p1", name: "Ryan's Coffee House" }], exp: new Date(Date.now() - DAY).toISOString() };
  const { S, prelude } = landingHarness({ deny: true, staleRow: stale });
  const m = await loadLanding(prelude);
  const out = await m.__searchOnce("best restaurants", CITY, 24000, true, false);
  ok(Array.isArray(out) && out.length === 1, "landing 2b: yesterday's list beats a blank page on a denial");
  ok(S.puts.length === 0, "landing 2b: …and the stale row is not overwritten with []");
}
{ // 2c. grant allowed, Google genuinely empty → [] is a real answer and IS cached (unchanged behaviour)
  const { S, prelude } = landingHarness({ deny: false, staleRow: null });
  const m = await loadLanding(prelude);
  const out = await m.__searchOnce("best restaurants", CITY, 24000, true, false);
  ok(Array.isArray(out) && out.length === 0 && S.google === 1 && S.puts.length === 1, "landing 2c: a bought empty answer is still an answer and is cached (unchanged)");
}

delete globalThis.__F; delete globalThis.__L;
if (fail.length) {
  console.error(`check-provider-empty-answers: FAIL (${pass} ok, ${fail.length} failed)`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-provider-empty-answers: OK (${pass} checks)`);
