#!/usr/bin/env node
// Lock for the Atlas paid lane's WEB source path (lib/atlasWebLane.js + the lane branch of
// app/api/cron/atlas-build/route.js). The lane makes ZERO Google calls: Claude's own
// web_search / web_fetch server tools source the pages. FIXTURES ONLY: no network, the
// Census geocoder and Anthropic are stubbed, both in-process and in a child that runs the
// REAL route.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const href = (p) => pathToFileURL(path.join(ROOT, p)).href;
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s\/\/ .*$/gm, "");

const W = await import(href("lib/atlasWebLane.js"));

// ---- fixtures ---------------------------------------------------------------------------
const URL1 = "https://baysidesmokehouse.example/about";
const PAGE = "Bayside Smokehouse in Tampa. Bayside Smokehouse is located at 4100 Bay Street, Tampa, FL 33602. The kitchen smokes brisket and pork over local oak every morning and the dining room fills at lunch. Order the brisket plate with two sides at the counter. Hours are Tuesday through Sunday.";
const GOOD = {
  hook: "Oak smoked brisket served at the counter every morning",
  why_here: "The kitchen smokes brisket and pork over local oak every morning, so the lunch plate comes out fresh when the dining room fills up. Order at the counter and pick two sides.",
  found_address: "4100 Bay Street, Tampa, FL 33602", found_city: "Tampa",
  facts: [{ claim: "Smokes brisket and pork over local oak", source: URL1 }],
};
const fetchBlock = (url, data) => ({ type: "web_fetch_tool_result", tool_use_id: "t1", content: { type: "web_fetch_result", url, content: { type: "document", source: { type: "text", media_type: "text/plain", data } } } });
const resp = (blocks, searches = 2) => ({ content: blocks, usage: { server_tool_use: { web_search_requests: searches } }, stop_reason: "end_turn" });
const GOOD_RESP = resp([
  { type: "text", text: "Let me look." },
  { type: "server_tool_use", name: "web_search" },
  { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://snippet.example", title: "snippet only" }] },
  fetchBlock(URL1, PAGE),
  { type: "text", text: "```json\n" + JSON.stringify(GOOD) + "\n```" },
]);
const NO_FETCH_RESP = resp([
  { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://snippet.example", title: "Bayside Smokehouse snippet" }] },
  { type: "text", text: JSON.stringify(GOOD) },
]);
const food = { place_id: "ChIJa7bjTAB_54gR-M-m-KIOCP0", name: "Bayside Smokehouse", metro: "tampa", category: "food", lat: 27.9506, lng: -82.4572 };
const park = { ...food, name: "Bayside Smokehouse", category: "attractions", primary_type: "park" };
const near = { lat: 27.9510, lng: -82.4580 };
const far3km = { lat: 27.9506 + 0.027, lng: -82.4572 }; // ~3.0 km north
const fetchedGood = [{ url: URL1, text: PAGE }];

// ---- request body -----------------------------------------------------------------------
{
  const b = W.laneRequestBody(food, "claude-sonnet-5-5", [{ type: "text", text: "sys" }], "Tampa");
  const ws = (b.tools || []).find((t) => t.type === "web_search_20250305" && t.name === "web_search");
  const wf = (b.tools || []).find((t) => t.type === "web_fetch_20250910" && t.name === "web_fetch");
  ok(ws && ws.max_uses === 3 && ws.user_location && ws.user_location.city === "Tampa" && ws.user_location.region === "Florida" && ws.user_location.country === "US", "web_search tool: max_uses 3 and Tampa/Florida/US user_location");
  ok(wf && wf.max_uses === 3 && wf.max_content_tokens === 8000, "web_fetch tool: max_uses 3, max_content_tokens 8000");
  for (const t of [ws, wf]) {
    const d = (t && t.blocked_domains) || [];
    ok(["disney.com", "disneyworld.com", "disney.go.com", "yelp.com", "tripadvisor.com", "facebook.com", "instagram.com", "google.com"].every((x) => d.includes(x)), `${t && t.name}: Disney hosts + yelp/tripadvisor/facebook/instagram/google must be blocked`);
  }
  ok(b.max_tokens === 2000 && b.model === "claude-sonnet-5-5", "lane body: max_tokens 2000 and the lane model");
  const u = b.messages[0].content;
  ok(/found_address/.test(u) && /found_city/.test(u) && /\{"pending":true\}/.test(u) && /Bayside Smokehouse/.test(u) && /27\.95/.test(u), "user message names the place, asks for found_address/found_city and the pending escape");
}

// ---- extraction -------------------------------------------------------------------------
{
  const g = W.extractLaneResult(GOOD_RESP);
  ok(g.fetched.length === 1 && g.fetched[0].url === URL1 && /smokes brisket/.test(g.fetched[0].text), "fetched pages come from web_fetch_tool_result source.data only");
  ok(g.searches === 2 && /found_address/.test(g.text) && !/Let me look/.test(g.text), "searches from usage; JSON read from the LAST text block");
  ok(!JSON.stringify(g.fetched).includes("snippet.example"), "search snippets are never part of the corpus");
  const z = W.extractLaneResult(NO_FETCH_RESP);
  ok(z.fetched.length === 0, "zero web_fetch blocks -> zero fetched pages (the route then writes PENDING SOURCE)");
  const err = W.extractLaneResult(resp([{ type: "web_fetch_tool_result", content: { type: "web_fetch_tool_error", error_code: "url_not_accessible" } }, { type: "text", text: "{}" }]));
  ok(err.fetched.length === 0, "a fetch error block is not a page");
  const big = W.extractLaneResult(resp([fetchBlock("https://a.example/1", "Alpha sentence here. ".repeat(2000)), fetchBlock("https://b.example/2", "Beta sentence here. ".repeat(2000)), { type: "text", text: "{}" }]));
  ok(big.fetched.reduce((a, f) => a + f.text.length, 0) <= 20000, "corpus is capped at 20k chars in total");
  ok(W.deniedFetched([{ url: "https://disneyworld.disney.go.com/x", text: "t" }]) && !W.deniedFetched(fetchedGood), "a fetched Disney host is detected (BLOCKED section 7), a normal host is not");
}

// ---- identity gate ----------------------------------------------------------------------
{
  const idp = (parsed, fetched, place, geo) => W.identityProblems(parsed, fetched, place, geo);
  ok(idp(GOOD, fetchedGood, food, near).length === 0, "positive control: right place, near pin -> no problems");
  const other = [{ url: "https://other.example", text: "Harbor Pizza Company in Tampa. Harbor Pizza Company is located at 4100 Bay Street, Tampa, FL 33602. Wood fired pizza and salads every day." }];
  ok(idp(GOOD, other, food, near).some((x) => x.startsWith("name-tokens")), "fetched page missing the name tokens -> identity fail");
  ok(idp(GOOD, fetchedGood, food, far3km).some((x) => x.startsWith("distance:")), "address ~3 km from the pin on a food place -> fail");
  ok(idp(GOOD, fetchedGood, park, far3km).length === 0, "address ~3 km from the pin on a park/attraction -> pass (5 km allowance)");
  ok(idp(GOOD, fetchedGood, park, { lat: 27.9506 + 0.06, lng: -82.4572 }).some((x) => x.startsWith("distance:")), "park ~6.7 km away still fails");
  ok(idp(GOOD, fetchedGood, food, null).length === 0, "geocoder failed but metro city is literally in the pages -> pass");
  const noCity = [{ url: URL1, text: "Bayside Smokehouse is located at 4100 Bay Street, FL 33602. The kitchen smokes brisket every morning." }];
  ok(idp({ ...GOOD, found_city: "Bay Street" }, noCity, food, null).some((x) => x === "geocode-failed-and-metro-absent"), "geocoder failed and metro city absent from pages -> fail");
  ok(idp({ ...GOOD, found_address: "", found_city: "" }, fetchedGood, food, near).length >= 2, "missing found_address/found_city -> fail");
  ok(idp({ ...GOOD, found_address: "9999 Nowhere Blvd, Tampa" }, fetchedGood, food, near).includes("address-not-in-pages"), "found_address must literally appear on a fetched page");
  ok(idp(GOOD, [], food, near).includes("no-fetched-pages"), "no fetched pages -> fail");
  ok(Math.abs(W.haversineKm(27.9506, -82.4572, 27.9776, -82.4572) - 3.0) < 0.05, "haversine: 0.027 deg of latitude is about 3.0 km");
}

// ---- dry-sample cost metering --------------------------------------------------------------
{
  const c = W.laneCostUsd({ input_tokens: 1000000, cache_creation_input_tokens: 1000000, cache_read_input_tokens: 1000000, output_tokens: 1000000, server_tool_use: { web_search_requests: 3 } });
  ok(Math.abs(c - (2 + 2.5 + 0.2 + 10 + 0.03)) < 1e-9, "laneCostUsd: $2/MTok input, 1.25x cache write, 0.1x cache read, $10/MTok output, $0.01 per search; got " + c);
  ok(W.laneCostUsd(null) === 0 && W.laneCostUsd({ input_tokens: "x" }) === 0, "laneCostUsd tolerates junk usage");
  ok(W.dryBudgetAllows === undefined && W.DRY_WORST_NEXT_FLOOR_USD === undefined, "the old read-then-record budget helpers are gone");
  const lanes = await import(href("lib/atlasPaidLane.js"));
  const E = (o) => lanes.atlasPaidLane({ ATLAS_MONTH_PLACE_CAP: "5", ...o });
  ok(E({ ATLAS_PAID_ENABLED: "dry" }).mode === "dry" && E({ ATLAS_PAID_ENABLED: "1" }).mode === "full" && E({ ATLAS_PAID_ENABLED: "DRY!" }) === null && E({ ATLAS_PAID_ENABLED: "true" }) === null, "lane mode: dry / full / anything else null");
  ok(lanes.dryUsdCap({}) === 1 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "2.5" }) === 2.5 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "9" }) === 5 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "-1" }) === 1 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "0" }) === 1 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "1e3" }) === 1, "dryUsdCap: default 1, max 5, malformed 1");
  const b = W.laneRequestBody(food, "m", [], "Tampa");
  ok(b.max_tokens === 2000 && b.tools.every((t) => t.max_uses === 3) && b.tools.find((t) => t.name === "web_fetch").max_content_tokens === 8000, "per-request bound for dry runs: max_tokens 2000, both max_uses 3, max_content_tokens 8000");
}


// ---- provable worst-case cost gate (laneWorstCaseUsd) -------------------------------------
{
  const laneBody = W.laneRequestBody(food, "claude-sonnet-5-5", [{ type: "text", text: "sys" }], "Tampa");
  ok(W.laneWorstCaseUsd(laneBody, 10000) === null && W.laneWorstCaseUsd(laneBody, null) === null, "the CURRENT lane body (server tools) is UNBOUNDED -> null, even with a token count");
  const bare = { model: "claude-sonnet-5-5", max_tokens: 600, messages: [{ role: "user", content: "x" }] };
  for (const tools of [[{ type: "web_search_20250305", name: "web_search" }], [{ type: "web_fetch_20250910", name: "web_fetch" }], [{ type: "bash_20250124", name: "bash" }], [{ name: "custom", input_schema: { type: "object" } }]])
    ok(W.laneWorstCaseUsd({ ...bare, tools }, 10000) === null, "any tool at all -> null: " + JSON.stringify(tools).slice(0, 60));
  const v = W.laneWorstCaseUsd(bare, 10000);
  ok(Math.abs(v - 0.026) < 1e-12, "tool-less body: 10000 in x $2/MTok + 600 max_tokens x $10/MTok = $0.026, got " + v);
  ok(Math.abs(W.laneWorstCaseUsd({ ...bare, tools: [] }, 10000) - 0.026) < 1e-12, "an empty tools array is tool-less");
  for (const [name, b, c] of [["count null", bare, null], ["count 0", bare, 0], ["count -5", bare, -5], ["count 1.5", bare, 1.5], ["count NaN", bare, NaN], ["count string", bare, "10000"], ["count unsafe", bare, 2 ** 60],
    ["max_tokens missing", { ...bare, max_tokens: undefined }, 10000], ["max_tokens 0", { ...bare, max_tokens: 0 }, 10000], ["max_tokens 1.5", { ...bare, max_tokens: 1.5 }, 10000], ["max_tokens string", { ...bare, max_tokens: "600" }, 10000], ["body null", null, 10000]])
    ok(W.laneWorstCaseUsd(b, c) === null, "not provable -> null: " + name);
}

// ---- dry meter: atomic reserve, chunked refund (mock fetch) --------------------------------
const M = await import(href("lib/atlasDryMeter.js"));
{
  const S = { url: "https://probe.supabase.co", key: "k" };
  const mk = (reply) => { const calls = []; const f = async (u, init) => { calls.push({ url: String(u), body: JSON.parse(init.body), signal: !!init.signal, method: init.method }); return reply(calls.length, JSON.parse(init.body)); }; f.calls = calls; return f; };
  const R = (v, okk = true) => ({ ok: okk, status: okk ? 200 : 500, json: async () => v });
  const t1 = mk(() => R(true));
  ok((await M.reserveDryCents(S, 100, 7, t1)) === true && t1.calls.length === 1 && t1.calls[0].url === "https://probe.supabase.co/rest/v1/rpc/wf_spend_take" && JSON.stringify(t1.calls[0].body) === JSON.stringify({ p_sku: "atlas_dry_cents", p_cap: 100, p_n: 7 }) && t1.calls[0].signal && t1.calls[0].method === "POST", "reserveDryCents: ONE wf_spend_take {p_sku atlas_dry_cents, p_cap, p_n}, with an abort signal");
  ok((await M.reserveDryCents(S, 100, 7, mk(() => R(false)))) === false, "reserveDryCents: RPC false -> false (denied)");
  ok((await M.reserveDryCents(S, 100, 7, async () => { throw new Error("down"); })) === null && (await M.reserveDryCents(S, 100, 7, mk(() => R(true, false)))) === null && (await M.reserveDryCents(S, 100, 7, mk(() => R("yes")))) === null && (await M.reserveDryCents(S, 100, 7, mk(() => ({ ok: true, json: async () => { throw new SyntaxError("x"); } })))) === null, "reserveDryCents: throw / non-200 / non-boolean / bad JSON -> null (fail closed)");
  for (const [cap, n] of [[100, 0], [100, -1], [100, 1.5], [100, NaN], [100, "7"], [0, 7], [1.5, 7], [null, 7]]) {
    const f = mk(() => R(true));
    ok((await M.reserveDryCents(S, cap, n, f)) === null && f.calls.length === 0, `reserveDryCents(cap ${cap}, n ${n}): null with NO call`);
  }
  const r1 = mk(() => R(true));
  ok((await M.refundDryCents(S, 25, r1)) === 25 && r1.calls.map((c) => c.body.p_n).join() === "10,10,5" && r1.calls.every((c) => c.url.endsWith("/rest/v1/rpc/wf_spend_refund") && c.body.p_sku === "atlas_dry_cents" && c.signal), "refundDryCents(25): wf_spend_refund chunks 10,10,5");
  const r2 = mk((i) => R(i !== 2));
  ok((await M.refundDryCents(S, 25, r2)) === 10 && r2.calls.length === 2, "refundDryCents stops at the first failed chunk and returns what was refunded (10 of 25)");
  const r3 = mk((i) => (i === 2 ? R(true, false) : R(true)));
  ok((await M.refundDryCents(S, 25, r3)) === 10 && r3.calls.length === 2, "a non-200 chunk also stops the refund");
  let thrown = 0;
  ok((await M.refundDryCents(S, 25, async () => { thrown++; throw new Error("down"); })) === 0 && thrown === 1, "a transport failure refunds 0 and stops");
  for (const n of [0, -3, 2.5, NaN]) { const f = mk(() => R(true)); ok((await M.refundDryCents(S, n, f)) === 0 && f.calls.length === 0, `refundDryCents(${n}): no call`); }
  ok(M.readDryUsedCents === undefined && M.recordDryCents === undefined && M.reserveCents === undefined && M.DRY_RESERVE_FLOOR_CENTS === undefined, "the old read-then-record meter API is gone");
}

// ---- CONCURRENCY PROOF: 50 interleaved reservations against a model of wf_spend_take -------
{
  // The model executes wf_spend_take's single conditional UPDATE as one synchronous step
  // (used + n <= cap checked and incremented with no await in between): exactly what the
  // row lock gives in Postgres. Every network hop around it is an awaited random delay.
  let seed = 20261008;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const hop = () => new Promise((r) => setTimeout(r, Math.floor(rand() * 4)));
  const S = { url: "https://probe.supabase.co", key: "k" };
  const model = () => {
    const db = { used: 0, maxSeen: 0 };
    const fetchImpl = async (u, init = {}) => {
      await hop();
      const url = String(u);
      let v;
      if (url.endsWith("/rpc/wf_spend_take")) {
        const b = JSON.parse(init.body);
        if (db.used + b.p_n <= b.p_cap) { db.used += b.p_n; v = true; } else v = false; // atomic: no await inside
      } else if (url.includes("/rest/v1/wf_spend_ledger")) {
        v = [{ used: db.used }];
      } else if (url.endsWith("/rpc/wf_spend_record")) {
        const b = JSON.parse(init.body); db.used += b.p_n; v = true; // unconditional record (old pattern's meter row)
      }
      db.maxSeen = Math.max(db.maxSeen, db.used);
      await hop();
      return { ok: true, status: 200, json: async () => { await hop(); return v; } };
    };
    return { db, fetchImpl };
  };
  const A = model();
  const res = await Promise.all(Array.from({ length: 50 }, async () => { await hop(); return M.reserveDryCents(S, 100, 7, A.fetchImpl); }));
  const granted = res.filter((x) => x === true).length;
  ok(res.every((x) => x === true || x === false), "every concurrent reservation answered true/false");
  ok(granted * 7 <= 100 && A.db.used <= 100 && A.db.maxSeen <= 100, `50 concurrent reserveDryCents(100, 7): never exceeds the cap (granted ${granted}, used ${A.db.used}, max ${A.db.maxSeen})`);
  ok(granted === Math.floor(100 / 7) && granted === 14 && A.db.used === 98, `exactly floor(100/7) = 14 granted, used 98 (got ${granted}, ${A.db.used})`);
  // NEGATIVE CONTROL: the OLD read-then-check-then-record pattern under the SAME interleaving.
  const B = model();
  const oldReserve = async () => {
    await hop();
    const rows = await (await B.fetchImpl(`${S.url}/rest/v1/wf_spend_ledger?month=eq.x&sku=eq.atlas_dry_cents&select=used`)).json();
    const used = rows[0].used;
    if (used + 7 > 100) return false;
    await hop();
    await (await B.fetchImpl(`${S.url}/rest/v1/rpc/wf_spend_record`, { method: "POST", body: JSON.stringify({ p_n: 7 }) })).json();
    return true;
  };
  const oldRes = await Promise.all(Array.from({ length: 50 }, () => oldReserve()));
  const oldGranted = oldRes.filter((x) => x === true).length;
  ok(oldGranted * 7 > 100 && B.db.used > 100, `NEGATIVE CONTROL: the old read-then-record pattern overshoots the cap under the same interleaving (granted ${oldGranted}, used ${B.db.used}); the proof above can detect the bug`);
}

// ---- dashes -----------------------------------------------------------------------------
{
  ok(W.hasDash("a — b") && W.hasDash("a – b") && W.hasDash("a - b") && !W.hasDash("oak-smoked brisket"), "hasDash: em, en and spaced hyphen yes; compound hyphen no");
  ok(W.dashProblems({ hook: "Great — truly", why_here: "ok" }).join() === "dash:hook" && W.dashProblems({ hook: "fine", why_here: "x - y" }).join() === "dash:why_here" && W.dashProblems(GOOD).length === 0, "dashProblems flags hook / why_here only");
}

// ---- Census geocoder (mocked) -----------------------------------------------------------
{
  const urls = [];
  const okFetch = async (u) => { urls.push(String(u)); return { ok: true, json: async () => ({ result: { addressMatches: [{ coordinates: { x: -82.458, y: 27.951 } }] } }) }; };
  const g = await W.geocodeCensus("4100 Bay Street, Tampa, FL", okFetch);
  ok(g && g.lat === 27.951 && g.lng === -82.458 && /geocoding\.geo\.census\.gov\/geocoder\/locations\/onelineaddress\?address=4100%20Bay/.test(urls[0]) && /benchmark=Public_AR_Current&format=json/.test(urls[0]), "census geocoder: URL shape and x/y -> lng/lat");
  ok((await W.geocodeCensus("x", async () => { throw new Error("down"); })) === null && (await W.geocodeCensus("x", async () => ({ ok: false }))) === null && (await W.geocodeCensus("x", async () => ({ ok: true, json: async () => ({ result: { addressMatches: [] } }) }))) === null, "census geocoder is fail-soft: throw, non-200 and no match all -> null");
}

// ---- zero Google, statically ------------------------------------------------------------
{
  const route = strip(read("app/api/cron/atlas-build/route.js"));
  const a = route.indexOf("if (!(await takeFromLedger(lane.searchSku");
  const b = route.indexOf('if (!(await spendAllow("details_enterprise")))');
  ok(a > 0 && b > a, "lane branch located in the route");
  const laneBranch = route.slice(a, b) + route.slice(route.indexOf("async function writeLaneEditorial"), route.indexOf("async function pool("));
  ok(!/googleapis|placeDetails|gkey|GOOGLE_MAPS|officialPage|PLACE_FIELDS/.test(laneBranch), "lane branch + lane writer contain no googleapis / placeDetails / gkey / officialPage");
  ok(!/googleapis|placeDetails|gkey|GOOGLE_MAPS|officialPage/.test(strip(read("lib/atlasWebLane.js"))), "lib/atlasWebLane.js contains no Google Places reference");
  ok(/if \(!akey \|\| \(!lane && !gkey\)\)/.test(route), "the Google key is required only off the lane");
  ok(/Math\.min\(limit1, dryMetered \? 10 : 5\)/.test(route), "lane per-run limit is 5 (10 only for metered dry samples)");
}

// ---- the REAL route, in a child, with every outbound call stubbed -----------------------
const dir = mkdtempSync(path.join(tmpdir(), "wf-atlas-weblane-"));
try {
  const HOOK = JSON.stringify(new URL("./lib/nodeResolveHook.mjs", import.meta.url).href);
  const ROUTE = JSON.stringify(href("app/api/cron/atlas-build/route.js"));
  const SHIM_HOOK = JSON.stringify(pathToFileURL(path.join(dir, "shimHook.mjs")).href);
  const childSrc = `
    import { register } from "node:module";
    register(${HOOK}, import.meta.url);
    // BOUNDED_TOKENS: route-level stub of a tool-less lane body (see the shim below).
    if (process.env.BOUNDED_TOKENS) register(${SHIM_HOOK}, import.meta.url);
    const F = ${JSON.stringify({ GOOD_RESP, NO_FETCH_RESP, food })};
    const rec = { spend: [], refunds: [], writes: 0, urls: [], anthropicBodies: [], anthropicAttempts: 0, pulses: [], invUrls: [], ledgerReads: 0, cacheWrites: 0, dryUsedEnd: null };
    let dryUsed = Number(process.env.LEDGER_USED || 0);
    const jr = (v, ok = true, st) => ({ ok, status: st || (ok ? 200 : 500), headers: { get: () => null }, json: async () => v, text: async () => JSON.stringify(v) });
    globalThis.fetch = async (u, init = {}) => {
      const url = String(u), method = (init.method || "GET").toUpperCase();
      rec.urls.push(url.slice(0, 160));
      if (url.includes("/rest/v1/wf_spend_ledger")) { rec.ledgerReads++; if (process.env.LEDGER_FAIL) return jr({}, false); return jr(process.env.LEDGER_NOROW ? [] : [{ used: dryUsed }]); }
      if (url.includes("/rest/v1/wf_places_cache") && method !== "GET") { rec.cacheWrites++; return jr({}); }
      if (url.includes("/rpc/wf_spend_take")) { const b = JSON.parse(init.body); rec.spend.push(b); if (process.env.ANTH_GRANT_DENY && b.p_sku === "atlas_anthropic_requests") return jr(false); if (process.env.SEARCH_DENY && b.p_sku === "atlas_web_search") return jr(false); if (b.p_sku === "atlas_dry_cents") { if (process.env.TAKE_DRY_FAIL) return jr({}, false); if (dryUsed + b.p_n <= b.p_cap) { dryUsed += b.p_n; return jr(true); } return jr(false); } return jr(true); }
      if (url.includes("/rpc/wf_spend_refund")) { const b = JSON.parse(init.body); rec.refunds.push(b); if (process.env.REFUND_FAIL) return jr(false); if (!(b.p_n >= 1 && b.p_n <= 10)) return jr(false); dryUsed = Math.max(dryUsed - b.p_n, 0); return jr(true); }
      if (url.includes("/rest/v1/wf_job_pulse")) { rec.pulses.push(JSON.parse(init.body)); return jr({}); }
      if (url.includes("/rest/v1/wf_editorial") && method !== "GET") { rec.writes++; return jr([]); }
      if (url.includes("/rest/v1/wf_editorial")) return jr(process.env.EDITORIAL_JSON ? JSON.parse(process.env.EDITORIAL_JSON) : []);
      if (url.includes("/rest/v1/wf_inventory")) { rec.invUrls.push(url); if (!url.includes("status=eq.OPERATIONAL")) { const ids = (url.match(/place_id=in\\.\\(([^)]*)\\)/) || [, ""])[1].split(","); const missing = (process.env.NOTFOUND || "").split(","); const closed = (process.env.CLOSED || "").split(","); return jr(ids.filter((id) => !missing.includes(id)).map((id) => ({ ...F.food, place_id: id, metro: closed.includes(id) ? "miami-dade" : F.food.metro, status: closed.includes(id) ? "CLOSED_PERMANENTLY" : "OPERATIONAL", photo_ref: closed.includes(id) ? null : "places/x/photos/y" }))); } const m = url.match(/place_id=in\\.\\(([^)]*)\\)/); return jr((m ? m[1].split(",") : [F.food.place_id]).map((id) => ({ ...F.food, place_id: id }))); }
      if (url.includes("/rpc/wf_atlas_missing")) return jr([]);
      if (url.includes("api.anthropic.com")) { rec.anthropicAttempts++; if (process.env.ANTH_THROW) throw new Error("timeout"); if (process.env.ANTH_STATUS) return jr({ error: { message: "Your credit balance is too low" } }, false, Number(process.env.ANTH_STATUS)); rec.anthropicBodies.push(JSON.parse(init.body)); const base = process.env.SCEN === "nofetch" ? F.NO_FETCH_RESP : F.GOOD_RESP; return jr(process.env.USAGE_JSON ? { ...base, usage: JSON.parse(process.env.USAGE_JSON) } : base); }
      if (url.includes("geocoding.geo.census.gov")) return jr({ result: { addressMatches: [{ coordinates: { x: -82.458, y: 27.951 } }] } });
      return jr({}, false);
    };
    const route = await import(${ROUTE});
    const res = await route.GET(new Request("https://gowayfind.com/api/cron/atlas-build" + (process.env.QS ? process.env.QS : "?dry=1&limit=3"), { headers: process.env.SENDKEY ? { "x-atlas-dry-key": process.env.SENDKEY } : (process.env.CRON_SECRET ? { authorization: "Bearer probe" } : {}) }));
    let body = null; try { body = await res.json(); } catch (e) {}
    rec.dryUsedEnd = dryUsed;
    console.log("@@" + JSON.stringify({ status: res.status, body, rec }));
  `;
  const f = path.join(dir, "child.mjs");
  // Route-level stub for the BOUNDED path: the route's import of lib/atlasWebLane resolves to
  // a shim that re-exports the real module but (1) drops the server tools from the lane body
  // and (2) feeds laneWorstCaseUsd a token count from BOUNDED_TOKENS (the route itself passes
  // none). The real laneWorstCaseUsd still computes the bound from the real tool-less body.
  writeFileSync(path.join(dir, "shim.mjs"), `
    import * as real from ${JSON.stringify(href("lib/atlasWebLane.js"))};
    export * from ${JSON.stringify(href("lib/atlasWebLane.js"))};
    export function laneRequestBody(...a) { const b = real.laneRequestBody(...a); delete b.tools; return b; }
    export function laneWorstCaseUsd(body) { return real.laneWorstCaseUsd(body, Number(process.env.BOUNDED_TOKENS)); }
  `);
  writeFileSync(path.join(dir, "shimHook.mjs"), `
    const SHIM = ${JSON.stringify(pathToFileURL(path.join(dir, "shim.mjs")).href)};
    export async function resolve(spec, ctx, next) {
      if (/lib\\/atlasWebLane(\\.js)?$/.test(spec) && ctx.parentURL && ctx.parentURL.includes("/app/api/cron/atlas-build/route.js")) return { url: SHIM, shortCircuit: true };
      return next(spec, ctx);
    }
  `);
  writeFileSync(f, childSrc);
  const run = (over) => {
    const out = execFileSync(process.execPath, [f], {
      encoding: "utf8", timeout: 60000, cwd: ROOT,
      env: { ...process.env, CRON_SECRET: "probe", WAYFIND_GATE: "free", ATLAS_PAID_ENABLED: "1", ATLAS_MONTH_PLACE_CAP: "5", ATLAS_MODEL: "", SUPABASE_URL: "https://probe.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://probe.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "probe-key", ANTHROPIC_API_KEY: "sk-ant-api03-probeprobeprobeprobeprobeprobe", LLM_API_KEY: "", GOOGLE_MAPS_SERVER_KEY: "", SCEN: "good", SENDKEY: "", ATLAS_DRY_TRIGGER_KEY: "", ...over },
    });
    return JSON.parse(out.split("\n").filter((l) => l.startsWith("@@")).pop().slice(2));
  };

  const A = run({});
  const skus = A.rec.spend.map((s) => s.p_sku);
  ok(A.status === 200 && A.body && A.body.dry === true && A.body.lane === true, `lane dry run answered ${A.status} ${JSON.stringify(A.body).slice(0, 200)}`);
  ok(skus.includes("atlas_web_search") && skus.includes("atlas_anthropic_requests") && skus.every((s) => s.startsWith("atlas_")), "wf_spend_take receives atlas_web_search then atlas_anthropic_requests, and no shared sku: " + skus.join());
  ok(A.rec.spend.every((s) => s.p_cap === 5), "both grants are capped at ATLAS_MONTH_PLACE_CAP");
  ok(skus.indexOf("atlas_web_search") < skus.indexOf("atlas_anthropic_requests"), "search grant comes before the Anthropic grant (both before the spend)");
  ok(!A.rec.urls.some((u) => /googleapis\.com|maps\.google/.test(u)), "ZERO Google calls: " + A.rec.urls.filter((u) => /google/.test(u)).join());
  ok(A.rec.writes === 0, "dry mode wrote nothing to wf_editorial");
  const body = A.rec.anthropicBodies[0] || {};
  ok(body.model === "claude-sonnet-5-5" && (body.tools || []).length === 2, "lane model defaults to claude-sonnet-5-5 when ATLAS_MODEL is unset; both tools sent");
  const row = A.body && A.body.rows && A.body.rows[0];
  ok(row && row.verified === true && row.issues === null && row.name === "Bayside Smokehouse" && row.hook && row.why_here, "good fixture publishes in the dry response");
  ok(row && Array.isArray(row.sources) && row.sources[0] === URL1 && row.found_address === GOOD.found_address && typeof row.distance_km === "number" && row.distance_km < 1 && row.searches === 2, "dry row carries sources, found_address, distance_km, searches");

  const B = run({ SCEN: "nofetch" });
  const rb = B.body && B.body.rows && B.body.rows[0];
  ok(rb && rb.verified === false && (rb.issues || []).includes("PENDING SOURCE") && B.rec.writes === 0, "zero fetch blocks -> PENDING SOURCE, never grounded on snippets");

  const C = run({ ATLAS_PAID_ENABLED: "" });
  ok(C.body && C.body.skipped && C.rec.spend.length === 0 && C.rec.anthropicBodies.length === 0, "without ATLAS_PAID_ENABLED=1 the route skips and spends nothing");
  const E = run({ ATLAS_PAID_ENABLED: "1", QS: "?limit=3" });
  ok(E.status === 200 && E.rec.anthropicBodies.length >= 1 && E.rec.spend.length >= 1, "ATLAS_PAID_ENABLED=1 still serves the plain cron URL exactly as before");
  const D = run({ ATLAS_MONTH_PLACE_CAP: "0" });
  ok(D.body && D.body.skipped && D.rec.spend.length === 0, "with a bad cap the route skips and spends nothing");

  // ---- ATLAS_PAID_ENABLED=dry: dry samples only, with a hard dollar ceiling --------------
  for (const qs of ["?limit=3", "?retry=1&limit=3", "?refresh=1&limit=3"]) {
    const X = run({ ATLAS_PAID_ENABLED: "dry", QS: qs });
    ok(X.status === 200 && X.body && X.body.skipped && X.body.ranWork === false, `dry flag + ${qs}: today's exact free-gate skip, got ${JSON.stringify(X.body).slice(0, 120)}`);
    ok(X.rec.anthropicBodies.length === 0 && X.rec.spend.length === 0 && X.rec.writes === 0, `dry flag + ${qs}: ZERO Anthropic calls, ZERO wf_spend_take, ZERO wf_editorial writes (got ${X.rec.anthropicBodies.length}/${X.rec.spend.length}/${X.rec.writes})`);
    ok(X.rec.pulses.length === 1 && /intentional skip: gate=free/.test(X.rec.pulses[0].note || ""), `dry flag + ${qs}: the usual pulse note is recorded`);
  }
  // ---- PROVABLE COST GATE: today's lane body (server tools) is UNBOUNDED ---------------------
  const USAGE30 = JSON.stringify({ input_tokens: 50000, output_tokens: 10000, server_tool_use: { web_search_requests: 10 } }); // $0.10 + $0.10 + $0.10
  const dryTakes = (r) => r.rec.spend.filter((x) => x.p_sku === "atlas_dry_cents");
  for (const [name, over] of [["limit=10", { QS: "?dry=1&limit=10" }], ["limit=1", { QS: "?dry=1&limit=1" }], ["default", { QS: "?dry=1" }], ["cap 99 (clamped)", { QS: "?dry=1&limit=10", ATLAS_DRY_USD_CAP: "99" }], ["usage 30c", { QS: "?dry=1&limit=10", USAGE_JSON: USAGE30 }]]) {
    const U = run({ ATLAS_PAID_ENABLED: "dry", ...over });
    ok(U.status === 200 && U.body && U.body.dry === true && U.body.lane === true && U.body.cost_unbounded === true && U.body.stopped_for_budget === true, `unbounded lane body (${name}): cost_unbounded true, stopped (got ${JSON.stringify(U.body).slice(0, 160)})`);
    ok(U.rec.anthropicAttempts === 0 && U.rec.anthropicBodies.length === 0 && U.rec.spend.length === 0 && U.rec.refunds.length === 0 && U.rec.writes === 0, `unbounded lane body (${name}): ZERO Anthropic calls, ZERO wf_spend_take of ANY sku, zero refunds, zero writes (got ${U.rec.anthropicAttempts}/${U.rec.spend.map((x) => x.p_sku).join()}/${U.rec.refunds.length}/${U.rec.writes})`);
    ok(U.body.budget && U.body.budget.reserved_cents === 0 && U.body.budget.refunded_cents === 0 && U.body.budget.charged_cents === 0 && U.body.cost_usd_total === 0 && !("used_cents_before" in U.body.budget), `unbounded (${name}): budget {cap, reserved 0, refunded 0, charged 0}`);
  }
  {
    const Z = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=10", ATLAS_DRY_USD_CAP: "99" });
    const Z2 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=10", ATLAS_DRY_USD_CAP: "abc" });
    ok(Z.body.cap_usd === 5 && Z.body.budget.cap_cents === 500 && Z2.body.cap_usd === 1 && Z2.body.budget.cap_cents === 100, "ATLAS_DRY_USD_CAP above 5 is clamped to $5.00; malformed falls back to $1.00");
  }

  // ---- BOUNDED path (route-level stub of a tool-less body, 90000 counted tokens) -----------
  // worst = 90000 x $2/MTok + 2000 max_tokens x $10/MTok = $0.20 -> 20 cents reserved per place.
  const BT = { ATLAS_PAID_ENABLED: "dry", BOUNDED_TOKENS: "90000" };
  const G1 = run({ ...BT, QS: "?dry=1&limit=10" });
  const g1skus = G1.rec.spend.map((x) => x.p_sku);
  ok(G1.body.cost_unbounded === false && G1.rec.anthropicBodies.length === 10 && G1.rec.anthropicBodies.every((b) => b.tools === undefined && b.max_tokens === 2000), `bounded stub: the tool-less body is what is SENT, all 10 places run (calls ${G1.rec.anthropicBodies.length}, ${JSON.stringify(G1.body).slice(0, 200)})`);
  ok(dryTakes(G1).length === 10 && dryTakes(G1).every((x) => x.p_n === 20 && x.p_cap === 100), "each place reserves exactly its 20 cent worst case against cap 100, in ONE wf_spend_take");
  ok(g1skus.slice(0, 3).join() === "atlas_dry_cents,atlas_web_search,atlas_anthropic_requests", "order per place: reserve dollars, then search grant, then Anthropic grant: " + g1skus.slice(0, 3).join());
  ok(G1.body.budget.reserved_cents === 200 && G1.body.budget.charged_cents === 20 && G1.body.budget.refunded_cents === 180 && G1.rec.dryUsedEnd === 20, `2 searches ($0.02) per place: reserved 200, charged 20, refunded 180, ledger ends at 20 (${JSON.stringify(G1.body.budget)}, ledger ${G1.rec.dryUsedEnd})`);
  ok(G1.rec.refunds.every((x) => x.p_n >= 1 && x.p_n <= 10 && x.p_sku === "atlas_dry_cents") && G1.rec.refunds.map((x) => x.p_n).slice(0, 2).join() === "10,8", "refunds go back in wf_spend_refund chunks of <= 10 (18 -> 10,8)");
  const G2 = run({ ...BT, QS: "?dry=1&limit=1", LEDGER_USED: "85" });
  ok(G2.rec.anthropicAttempts === 0 && dryTakes(G2).length === 1 && G2.rec.spend.length === 1 && G2.body.stopped_for_budget === true && G2.rec.dryUsedEnd === 85, `ledger 85 + 20 > 100: reservation DENIED -> zero Anthropic calls, no search grant (spend ${G2.rec.spend.map((x) => x.p_sku).join()})`);
  const G3 = run({ ...BT, QS: "?dry=1&limit=3", LEDGER_USED: "80" });
  ok(G3.rec.anthropicBodies.length === 1 && G3.body.stopped_for_budget === true && G3.rec.dryUsedEnd === 82, `ledger 80 + 20 = 100 fits exactly: one place, refund to 82; the next reservation (82 + 20) is denied (calls ${G3.rec.anthropicBodies.length}, ledger ${G3.rec.dryUsedEnd})`);
  const G4 = run({ ...BT, QS: "?dry=1&limit=3", TAKE_DRY_FAIL: "1" });
  ok(G4.rec.anthropicAttempts === 0 && G4.rec.spend.length === 1 && G4.body.meter_read_failed === true && G4.body.stopped_for_budget === true, "reservation transport failure -> fail closed: zero Anthropic calls, no search grant");
  const G5 = run({ ...BT, QS: "?dry=1&limit=3", SEARCH_DENY: "1" });
  ok(G5.rec.anthropicAttempts === 0 && G5.body.budget.reserved_cents === G5.body.budget.refunded_cents && G5.body.budget.reserved_cents > 0 && G5.rec.dryUsedEnd === 0, `search grant denied after the reservation -> the full reservation is refunded (${JSON.stringify(G5.body.budget)}, ledger ${G5.rec.dryUsedEnd})`);
  const G6 = run({ ...BT, QS: "?dry=1&limit=3", ANTH_GRANT_DENY: "1" });
  ok(G6.rec.anthropicAttempts === 0 && G6.body.meter_blocked === true && G6.body.stopped_for_budget === true && G6.body.budget.charged_cents === 0 && G6.body.budget.refunded_cents === 20 && G6.rec.dryUsedEnd === 0 && G6.body.cost_usd_total === 0, `paidAi-blocked (not sent): charged 0, full refund, run stops with meter_blocked (${JSON.stringify(G6.body.budget)})`);
  const G7 = run({ ...BT, QS: "?dry=1&limit=10", ANTH_THROW: "1" });
  ok(G7.rec.anthropicAttempts === 5 && G7.body.budget.charged_cents === 100 && G7.body.budget.refunded_cents === 0 && G7.rec.dryUsedEnd === 100 && G7.body.stopped_for_budget === true, `sent but threw (cost unknown): the WHOLE 20 cent reservation is kept, so 5 places fill the $1.00 cap and the 6th is denied (attempts ${G7.rec.anthropicAttempts}, ${JSON.stringify(G7.body.budget)})`);
  const G8 = run({ ...BT, QS: "?dry=1&limit=3", REFUND_FAIL: "1" });
  ok(G8.rec.anthropicBodies.length === 1 && G8.body.meter_record_failed === true && G8.body.stopped_for_budget === true && G8.rec.dryUsedEnd === 20, "a failed refund leaves the ledger OVER-counted (20, safe) and stops the run");
  const G9 = run({ ...BT, QS: "?dry=1&limit=3", USAGE_JSON: USAGE30 });
  ok(G9.rec.anthropicBodies.length === 1 && G9.body.stopped_for_overage === true && G9.body.budget.charged_cents === 30 && G9.body.budget.refunded_cents === 0 && dryTakes(G9).length === 1 && G9.rec.dryUsedEnd === 20, `actual 30c > reserved 20c (impossible for a true bound): nothing more is taken, the run stops (stopped_for_overage; ${JSON.stringify(G9.body.budget)})`);
  const U23 = JSON.stringify({ input_tokens: 5000, output_tokens: 1234, server_tool_use: { web_search_requests: 0 } }); // $0.01 + $0.01234 = $0.02234 -> 3 cents
  const G10 = run({ ...BT, QS: "?dry=1&limit=1", USAGE_JSON: U23, LEDGER_USED: "10" });
  ok(G10.body.budget.charged_cents === 3 && G10.body.budget.refunded_cents === 17 && G10.rec.dryUsedEnd === 13, `a $0.02234 place is charged ceil = 3 cents and 17 refunded (${JSON.stringify(G10.body.budget)}, ledger ${G10.rec.dryUsedEnd})`);
  const G11 = run({ ...BT, QS: "?dry=1&limit=1", BOUNDED_TOKENS: "600000" });
  ok(G11.rec.anthropicAttempts === 0 && G11.rec.spend.length === 1 && dryTakes(G11)[0].p_n === 122, "a worst case above the cap (600000 x $2/MTok + 2000 x $10/MTok = 122 cents > 100) is denied before anything is sent");
  const M7 = run({ ...BT, QS: "?dry=1" });
  ok(M7.rec.anthropicBodies.length === 1, `dry without ids or limit does exactly ONE place (got ${M7.rec.anthropicBodies.length})`);
  const IDS = ["ChIJidsTestAAAA1", "ChIJidsTestBBBB2", "ChIJidsTestCCCC3"];
  const I1 = run({ ATLAS_PAID_ENABLED: "dry", BOUNDED_TOKENS: "90000", QS: "?dry=1&ids=" + IDS.join(",") + ",bad id,ChIJidsTestAAAA1", CLOSED: IDS[1], NOTFOUND: IDS[2], EDITORIAL_JSON: JSON.stringify([{ place_id: IDS[0], verified: false }]) });
  ok(I1.rec.anthropicBodies.length === 2 && I1.body.rows.map((r) => r.place_id).join() === IDS[0] + "," + IDS[1], "ids= processes exactly the found ids, in order, deduped, junk dropped (incl. a non-OPERATIONAL one)");
  ok(JSON.stringify(I1.body.not_found) === JSON.stringify([IDS[2]]), "ids= reports unknown ids as not_found");
  const r0 = I1.body.rows[0], r1 = I1.body.rows[1];
  ok(r0.start && r0.start.status === "OPERATIONAL" && r0.start.has_editorial_row === true && r0.start.editorial_verified === false && r0.start.has_photo_ref === true && r0.start.category === "food" && r0.start.metro === "tampa", "dry row start = status, category, metro, editorial row + verified, photo ref (existing row, unverified)");
  ok(r1.start && r1.start.status === "CLOSED_PERMANENTLY" && r1.start.metro === "miami-dade" && r1.start.has_editorial_row === false && r1.start.editorial_verified === null && r1.start.has_photo_ref === false, "a closed, off-metro place with no editorial row is processed and reported as such");
  ok(I1.rec.invUrls.length === 1 && !/status=eq|metro=in/.test(I1.rec.invUrls[0]), "ids= inventory lookup carries no status or metro filter");
  ok(I1.rec.writes === 0, "ids= dry run wrote nothing to wf_editorial");
  const I2 = run({ ATLAS_PAID_ENABLED: "1", QS: "?limit=2&ids=" + IDS.join(",") });
  ok(!I2.rec.invUrls.concat(I2.rec.urls).some((u) => u.includes(IDS[0])), "ids= on a non-dry request has no effect (ignored entirely)");
  const I3 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?limit=2&ids=" + IDS.join(",") });
  ok(I3.rec.anthropicBodies.length === 0 && I3.rec.spend.length === 0 && I3.rec.invUrls.length === 0, "ids= on a non-dry request under the dry flag: skip, zero calls");
  const I4 = run({ ATLAS_PAID_ENABLED: "1", QS: "?dry=1&limit=1&ids=" + IDS.join(",") });
  ok(!I4.rec.invUrls.concat(I4.rec.urls).some((u) => u.includes(IDS[0])), "ids= is honoured only for ATLAS_PAID_ENABLED=dry (metered) dry requests");
  const I5 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&ids=" + IDS[2], NOTFOUND: IDS[2] });
  ok(I5.body.processed === 0 && I5.rec.anthropicBodies.length === 0 && JSON.stringify(I5.body.not_found) === JSON.stringify([IDS[2]]), "all ids unknown: nothing runs, nothing falls through to the normal selector");

  // ---- breaker ----------------------------------------------------------------------------
  const BR = run({ ATLAS_PAID_ENABLED: "dry", BOUNDED_TOKENS: "90000", QS: "?dry=1&limit=1", ANTH_STATUS: "402" });
  ok(BR.rec.cacheWrites === 0 && BR.body.provider_halt && BR.body.provider_halt.kind === "billing", `dry mode never writes the provider-health cache (cache writes ${BR.rec.cacheWrites}); the in-run halt is still reported`);
  ok(BR.body.budget.charged_cents === 20 && BR.body.budget.refunded_cents === 0, "a sent request that failed (402, no usage) keeps the whole reservation");
  const BF = run({ ATLAS_PAID_ENABLED: "1", QS: "?limit=1", ANTH_STATUS: "402" });
  ok(BF.rec.cacheWrites >= 1, "positive control: a full (non-dry) run still trips the breaker and writes the cache");

  // ---- ATLAS_DRY_TRIGGER_KEY: narrow header auth for the dry test (no CRON_SECRET) --------
  const KEY = "k".repeat(40);
  const kr = (over) => run({ CRON_SECRET: "", SENDKEY: KEY, ATLAS_DRY_TRIGGER_KEY: KEY, ATLAS_PAID_ENABLED: "dry", BOUNDED_TOKENS: "90000", QS: "?dry=1&limit=1", ...over });
  const K1 = kr({});
  ok(K1.status === 200 && K1.body.dry === true && K1.rec.anthropicBodies.length === 1, `valid key + dry flag + dry=1 authorizes and runs exactly one place (status ${K1.status})`);
  ok(JSON.stringify(K1).indexOf(KEY) === -1, "the trigger key is never echoed in the response or recorded calls");
  for (const [name, over] of [
    ["ATLAS_PAID_ENABLED=1", { ATLAS_PAID_ENABLED: "1" }],
    ["no dry=1", { QS: "?limit=1" }],
    ["retry=1", { QS: "?dry=1&retry=1&limit=1" }],
    ["refresh=1", { QS: "?dry=1&refresh=1&limit=1" }],
    ["wrong key", { SENDKEY: "x".repeat(40) }],
    ["31 char env key", { ATLAS_DRY_TRIGGER_KEY: "k".repeat(31), SENDKEY: "k".repeat(31) }],
    ["key in query string", { SENDKEY: "", QS: "?dry=1&limit=1&dry_key=" + KEY }],
    ["no header", { SENDKEY: "" }],
  ]) {
    const X = kr(over);
    ok(X.status === 401 && X.rec.anthropicBodies.length === 0 && X.rec.spend.length === 0, `trigger key rejected (401, zero spend): ${name} (got ${X.status})`);
  }
  const KC = run({ ATLAS_PAID_ENABLED: "dry", BOUNDED_TOKENS: "90000", QS: "?dry=1&limit=1", ATLAS_DRY_TRIGGER_KEY: KEY });
  ok(KC.status === 200 && KC.rec.anthropicBodies.length === 1, "the CRON_SECRET path is unchanged");

  const bogus = run({ ATLAS_PAID_ENABLED: "yes", QS: "?dry=1&limit=3" });
  ok(bogus.body.skipped && bogus.rec.spend.length === 0, "any other ATLAS_PAID_ENABLED value fails closed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (bad) { console.error(`test-atlas-web-lane: FAIL — ${bad} of ${n} assertions`); process.exit(1); }
console.log(`test-atlas-web-lane: OK — ${n} assertions (fixtures only; census geocoder and Anthropic stubbed; real route executed in a child with all outbound calls recorded; bounded dry path exercised through a route-level tool-less-body shim; 50-way reservation concurrency proof with a negative control)`);
