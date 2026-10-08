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
  ok(/Math\.min\(limit1, 5\)/.test(route), "lane per-run limit is min(limit, 5)");
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
    const rec = { spend: [], writes: 0, urls: [], anthropicBodies: [], pulses: [] };
    const jr = (v, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => v, text: async () => JSON.stringify(v) });
    globalThis.fetch = async (u, init = {}) => {
      const url = String(u), method = (init.method || "GET").toUpperCase();
      rec.urls.push(url.slice(0, 160));
      if (url.includes("/rpc/wf_spend_take")) { rec.spend.push(JSON.parse(init.body)); return jr(true); }
      if (url.includes("/rest/v1/wf_job_pulse")) { rec.pulses.push(JSON.parse(init.body)); return jr({}); }
      if (url.includes("/rest/v1/wf_editorial") && method !== "GET") { rec.writes++; return jr([]); }
      if (url.includes("/rest/v1/wf_editorial")) return jr([]);
      if (url.includes("/rest/v1/wf_inventory")) return jr([F.food]);
      if (url.includes("/rpc/wf_atlas_missing")) return jr([]);
      if (url.includes("api.anthropic.com")) { rec.anthropicBodies.push(JSON.parse(init.body)); return jr(process.env.SCEN === "nofetch" ? F.NO_FETCH_RESP : F.GOOD_RESP); }
      if (url.includes("geocoding.geo.census.gov")) return jr({ result: { addressMatches: [{ coordinates: { x: -82.458, y: 27.951 } }] } });
      return jr({}, false);
    };
    const route = await import(${ROUTE});
    const res = await route.GET(new Request("https://gowayfind.com/api/cron/atlas-build?dry=1&limit=3", { headers: { authorization: "Bearer probe" } }));
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
  const D = run({ ATLAS_MONTH_PLACE_CAP: "0" });
  ok(D.body && D.body.skipped && D.rec.spend.length === 0, "with a bad cap the route skips and spends nothing");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (bad) { console.error(`test-atlas-web-lane: FAIL — ${bad} of ${n} assertions`); process.exit(1); }
console.log(`test-atlas-web-lane: OK — ${n} assertions (fixtures only; census geocoder and Anthropic stubbed; real route executed in a child with all outbound calls recorded)`);
