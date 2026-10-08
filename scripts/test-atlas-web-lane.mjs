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
  ok(W.dryBudgetAllows(0.76, [0.1], 1) === false && W.dryBudgetAllows(0.75, [0.1], 1) === true && W.dryBudgetAllows(0.5, [0.6], 1) === false, "dryBudgetAllows: spent + max($0.25, highest seen) must fit the cap");
  const lanes = await import(href("lib/atlasPaidLane.js"));
  const E = (o) => lanes.atlasPaidLane({ ATLAS_MONTH_PLACE_CAP: "5", ...o });
  ok(E({ ATLAS_PAID_ENABLED: "dry" }).mode === "dry" && E({ ATLAS_PAID_ENABLED: "1" }).mode === "full" && E({ ATLAS_PAID_ENABLED: "DRY!" }) === null && E({ ATLAS_PAID_ENABLED: "true" }) === null, "lane mode: dry / full / anything else null");
  ok(lanes.dryUsdCap({}) === 1 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "2.5" }) === 2.5 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "9" }) === 5 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "-1" }) === 1 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "0" }) === 1 && lanes.dryUsdCap({ ATLAS_DRY_USD_CAP: "1e3" }) === 1, "dryUsdCap: default 1, max 5, malformed 1");
  const b = W.laneRequestBody(food, "m", [], "Tampa");
  ok(b.max_tokens === 2000 && b.tools.every((t) => t.max_uses === 3) && b.tools.find((t) => t.name === "web_fetch").max_content_tokens === 8000, "per-request bound for dry runs: max_tokens 2000, both max_uses 3, max_content_tokens 8000");
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
  const childSrc = `
    import { register } from "node:module";
    register(${HOOK}, import.meta.url);
    const F = ${JSON.stringify({ GOOD_RESP, NO_FETCH_RESP, food })};
    const rec = { spend: [], writes: 0, urls: [], anthropicBodies: [], pulses: [], invUrls: [], ledgerReads: 0 };
    let dryUsed = Number(process.env.LEDGER_USED || 0);
    const jr = (v, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => v, text: async () => JSON.stringify(v) });
    globalThis.fetch = async (u, init = {}) => {
      const url = String(u), method = (init.method || "GET").toUpperCase();
      rec.urls.push(url.slice(0, 160));
      if (url.includes("/rest/v1/wf_spend_ledger")) { rec.ledgerReads++; if (process.env.LEDGER_FAIL) return jr({}, false); return jr(process.env.LEDGER_NOROW ? [] : [{ used: dryUsed }]); }
      if (url.includes("/rpc/wf_spend_take")) { const b = JSON.parse(init.body); rec.spend.push(b); if (b.p_sku === "atlas_dry_cents") { if (process.env.RECORD_FAIL) return jr(false); dryUsed += b.p_n; } return jr(true); }
      if (url.includes("/rest/v1/wf_job_pulse")) { rec.pulses.push(JSON.parse(init.body)); return jr({}); }
      if (url.includes("/rest/v1/wf_editorial") && method !== "GET") { rec.writes++; return jr([]); }
      if (url.includes("/rest/v1/wf_editorial")) return jr(process.env.EDITORIAL_JSON ? JSON.parse(process.env.EDITORIAL_JSON) : []);
      if (url.includes("/rest/v1/wf_inventory")) { rec.invUrls.push(url); if (!url.includes("status=eq.OPERATIONAL")) { const ids = (url.match(/place_id=in\\.\\(([^)]*)\\)/) || [, ""])[1].split(","); const missing = (process.env.NOTFOUND || "").split(","); const closed = (process.env.CLOSED || "").split(","); return jr(ids.filter((id) => !missing.includes(id)).map((id) => ({ ...F.food, place_id: id, metro: closed.includes(id) ? "miami-dade" : F.food.metro, status: closed.includes(id) ? "CLOSED_PERMANENTLY" : "OPERATIONAL", photo_ref: closed.includes(id) ? null : "places/x/photos/y" }))); } const m = url.match(/place_id=in\\.\\(([^)]*)\\)/); return jr((m ? m[1].split(",") : [F.food.place_id]).map((id) => ({ ...F.food, place_id: id }))); }
      if (url.includes("/rpc/wf_atlas_missing")) return jr([]);
      if (url.includes("api.anthropic.com")) { rec.anthropicBodies.push(JSON.parse(init.body)); const base = process.env.SCEN === "nofetch" ? F.NO_FETCH_RESP : F.GOOD_RESP; return jr(process.env.USAGE_JSON ? { ...base, usage: JSON.parse(process.env.USAGE_JSON) } : base); }
      if (url.includes("geocoding.geo.census.gov")) return jr({ result: { addressMatches: [{ coordinates: { x: -82.458, y: 27.951 } }] } });
      return jr({}, false);
    };
    const route = await import(${ROUTE});
    const res = await route.GET(new Request("https://gowayfind.com/api/cron/atlas-build" + (process.env.QS ? process.env.QS : "?dry=1&limit=3"), { headers: { authorization: "Bearer probe" } }));
    let body = null; try { body = await res.json(); } catch (e) {}
    console.log("@@" + JSON.stringify({ status: res.status, body, rec }));
  `;
  const f = path.join(dir, "child.mjs");
  writeFileSync(f, childSrc);
  const run = (over) => {
    const out = execFileSync(process.execPath, [f], {
      encoding: "utf8", timeout: 60000, cwd: ROOT,
      env: { ...process.env, CRON_SECRET: "probe", WAYFIND_GATE: "free", ATLAS_PAID_ENABLED: "1", ATLAS_MONTH_PLACE_CAP: "5", ATLAS_MODEL: "", SUPABASE_URL: "https://probe.supabase.co", NEXT_PUBLIC_SUPABASE_URL: "https://probe.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "probe-key", ANTHROPIC_API_KEY: "sk-ant-api03-probeprobeprobeprobeprobeprobe", LLM_API_KEY: "", GOOGLE_MAPS_SERVER_KEY: "", SCEN: "good", ...over },
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
  const USAGE30 = JSON.stringify({ input_tokens: 50000, output_tokens: 10000, server_tool_use: { web_search_requests: 10 } }); // $0.10 + $0.10 + $0.10
  const Y = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=10", USAGE_JSON: USAGE30 });
  ok(Y.status === 200 && Y.body && Y.body.dry === true && Y.body.lane === true, "dry flag + ?dry=1 runs the lane");
  ok(Y.rec.writes === 0, "dry flag + ?dry=1 wrote nothing to wf_editorial");
  ok(Y.rec.anthropicBodies.length === 3 && Y.body.stopped_for_budget === true, `$0.30/place stops after 3 places under the $1.00 ceiling (calls ${Y.rec.anthropicBodies.length}, stopped ${Y.body && Y.body.stopped_for_budget})`);
  ok(Y.body.cost_usd_total <= 1.0 && Math.abs(Y.body.cost_usd_total - 0.9) < 1e-6 && Y.body.cost_usd_per_place.length === 3 && Y.body.cap_usd === 1, `cost_usd_total ${Y.body.cost_usd_total} <= 1.00, per place ${JSON.stringify(Y.body.cost_usd_per_place)}, cap ${Y.body.cap_usd}`);
  const Z = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=10", USAGE_JSON: USAGE30, ATLAS_DRY_USD_CAP: "99" });
  ok(Z.body.cap_usd === 5 && Z.rec.anthropicBodies.length === 10 && Math.abs(Z.body.cost_usd_total - 3) < 1e-6 && Z.body.stopped_for_budget === false, "ATLAS_DRY_USD_CAP above 5 is clamped to the $5.00 hard max");
  const Z2 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=10", USAGE_JSON: USAGE30, ATLAS_DRY_USD_CAP: "abc" });
  ok(Z2.body.cap_usd === 1 && Z2.rec.anthropicBodies.length === 3, "malformed ATLAS_DRY_USD_CAP falls back to $1.00");
  const cheap = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=10" });
  ok(cheap.body.cost_usd_total < 0.5 && cheap.body.stopped_for_budget === false && cheap.rec.anthropicBodies.length === 10, "cheap usage processes all 10 places sequentially without stopping");
  // ---- persistent cross-request meter, ids=, default limit ---------------------------------
  const sumDry = (r) => r.rec.spend.filter((x) => x.p_sku === "atlas_dry_cents").reduce((a, x) => a + x.p_n, 0);
  const M1 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=1", LEDGER_USED: "80" });
  ok(M1.rec.anthropicBodies.length === 0 && M1.rec.spend.length === 0 && M1.body.stopped_for_budget === true && M1.body.budget.used_cents_before === 80 && M1.body.budget.cap_cents === 100, `ledger used=80 + reserve 25 > cap 100: blocked with ZERO Anthropic calls and zero grants (calls ${M1.rec.anthropicBodies.length}, spend ${M1.rec.spend.length}, ${JSON.stringify(M1.body.budget)})`);
  const M2 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=1", LEDGER_USED: "75" });
  ok(M2.rec.anthropicBodies.length === 1 && M2.body.budget.used_cents_before === 75, "ledger used=75 + reserve 25 = cap 100: exactly fits, the place runs");
  const U23 = JSON.stringify({ input_tokens: 100000, output_tokens: 2340, server_tool_use: { web_search_requests: 0 } }); // $0.2234 -> 23 cents
  const M3 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=1", LEDGER_USED: "10", USAGE_JSON: U23 });
  ok(sumDry(M3) === 23 && M3.rec.spend.filter((x) => x.p_sku === "atlas_dry_cents").every((x) => x.p_cap === 1000000 && x.p_n >= 1 && x.p_n <= 10) && M3.body.budget.used_cents_after === 33 && M3.body.meter_record_failed === false, `a $0.2234 place records ceil = 23 cents on the ledger (recorded ${sumDry(M3)}, ${JSON.stringify(M3.body.budget)})`);
  const M4 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=1", LEDGER_FAIL: "1" });
  ok(M4.rec.anthropicBodies.length === 0 && M4.rec.spend.length === 0 && M4.body.meter_read_failed === true && M4.body.stopped_for_budget === true, "unreadable ledger -> fail closed: zero Anthropic calls, zero grants");
  const M5 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=3", RECORD_FAIL: "1" });
  ok(M5.rec.anthropicBodies.length === 1 && M5.body.meter_record_failed === true && M5.body.stopped_for_budget === true, "a failed meter record stops further places and reports meter_record_failed");
  const M6 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&limit=1", LEDGER_NOROW: "1" });
  ok(M6.rec.anthropicBodies.length === 1 && M6.body.budget.used_cents_before === 0, "a missing ledger row reads as 0 used");
  const M7 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1" });
  ok(M7.rec.anthropicBodies.length === 1, `dry without ids or limit does exactly ONE place (got ${M7.rec.anthropicBodies.length})`);

  const IDS = ["ChIJidsTestAAAA1", "ChIJidsTestBBBB2", "ChIJidsTestCCCC3"];
  const I1 = run({ ATLAS_PAID_ENABLED: "dry", QS: "?dry=1&ids=" + IDS.join(",") + ",bad id,ChIJidsTestAAAA1", CLOSED: IDS[1], NOTFOUND: IDS[2], EDITORIAL_JSON: JSON.stringify([{ place_id: IDS[0], verified: false }]) });
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

  const bogus = run({ ATLAS_PAID_ENABLED: "yes", QS: "?dry=1&limit=3" });
  ok(bogus.body.skipped && bogus.rec.spend.length === 0, "any other ATLAS_PAID_ENABLED value fails closed");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (bad) { console.error(`test-atlas-web-lane: FAIL — ${bad} of ${n} assertions`); process.exit(1); }
console.log(`test-atlas-web-lane: OK — ${n} assertions (fixtures only; census geocoder and Anthropic stubbed; real route executed in a child with all outbound calls recorded)`);
