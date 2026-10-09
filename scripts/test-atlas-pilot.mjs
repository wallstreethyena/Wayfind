#!/usr/bin/env node
// scripts/test-atlas-pilot.mjs — locks the Atlas pilot runner (scripts/atlas-pilot.mjs) and the
// sampling-parameter fix in lib/atlasWebLane.js laneRequestBody. FIXTURES ONLY: global fetch is
// stubbed, every host other than api.anthropic.com / geocoding.geo.census.gov fails the test, and
// nothing real is called. Money checks use the real Budget + FileLedger on temp files.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

let n = 0;
const fail = (m) => { console.error("test-atlas-pilot: FAIL - " + m); process.exit(1); };
const ok = (c, m) => { n++; if (!c) fail(m); };
const eq = (a, b, m) => ok(a === b, `${m} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = path.join(ROOT, "scripts/atlas-pilot.mjs");
const href = (p) => pathToFileURL(path.join(ROOT, p)).href;

const L = await import(href("lib/atlasWebLane.js"));
const P = await import(href("scripts/atlas-pilot.mjs"));
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/atlas-pilot-2026-10/manifest.json"), "utf8"));

// ===== A. temperature is omitted for models that 400 on non-default sampling =====
const place0 = { place_id: "x", name: "Test Place", category: "food", metro: "tampa", lat: 27.95, lng: -82.45 };
ok(Object.isFrozen(L.SAMPLING_PARAMS_REJECTED), "SAMPLING_PARAMS_REJECTED is frozen");
for (const m of ["claude-sonnet-5-5", "claude-haiku-5-5", "claude-opus-5-5", "claude-fable-5-1", "claude-mythos-5-1"]) {
  ok(L.SAMPLING_PARAMS_REJECTED.has(m), `${m} is in the rejected set`);
  const b = L.laneRequestBody(place0, m, [{ type: "text", text: "s" }], "Tampa");
  ok(!("temperature" in b) && !("top_p" in b) && !("top_k" in b), `${m}: request body has no temperature/top_p/top_k`);
}
eq(L.laneRequestBody(place0, "claude-haiku-4-5", [{ type: "text", text: "s" }], "Tampa").temperature, 0.4, "claude-haiku-4-5 keeps temperature 0.4");

// ===== fixtures =====
const KEY = "sk-ant-test-NOT-A-REAL-KEY-12345";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-pilot-"));
const PAGE = (name, city, addr) => `${name} in ${city}. ${name} is located at ${addr}, ${city}, FL 33602. The kitchen smokes brisket and pork over local oak every morning and the dining room fills at lunch. Order the brisket plate with two sides at the counter. Hours are Tuesday through Sunday.`;
const idx = (id) => MANIFEST.places.findIndex((p) => p.place_id === id);
const cityOf = (metro) => L.METRO_CITY[metro];
const addrOf = (i) => `${4100 + i} Bay Street`;
const urlOf = (i) => `https://venue${i}.example/about`;
const coords = Object.fromEntries(MANIFEST.places.map((p, i) => [p.place_id, { lat: 27.95 + i * 0.0001, lng: -82.45 }]));
function okBody(p, model, usage) {
  const i = idx(p.place_id), city = cityOf(p.metro), addr = `${addrOf(i)}, ${city}, FL 33602`;
  const good = {
    hook: "Oak smoked brisket served at the counter every morning",
    why_here: "The kitchen smokes brisket and pork over local oak every morning, so the lunch plate comes out fresh when the dining room fills up. Order at the counter and pick two sides.",
    found_address: addr, found_city: city, facts: [{ claim: "Smokes brisket and pork over local oak", source: urlOf(i) }],
  };
  return {
    model, stop_reason: "end_turn", id: "msg_" + i,
    content: [
      { type: "web_fetch_tool_result", content: { type: "web_fetch_result", url: urlOf(i), content: { type: "document", source: { type: "text", media_type: "text/plain", data: PAGE(p.name, city, addrOf(i)) } } } },
      { type: "text", text: "```json\n" + JSON.stringify(good) + "\n```" },
    ],
    usage: usage === undefined ? { input_tokens: 5000, output_tokens: 800, server_tool_use: { web_search_requests: 2 } } : usage,
  };
}
const censusMap = Object.fromEntries(MANIFEST.places.map((p, i) => [`${addrOf(i)}, ${cityOf(p.metro)}, FL 33602`, coords[p.place_id]]));

// stub: records every call, fails on forbidden hosts. `behave(place, model, body)` -> {status, body, requestId}
const realFetch = globalThis.fetch;
let calls = [];
let behave = null;
const forbidden = [];
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(String(url));
  calls.push({ host: u.hostname, url: String(url), headers: init.headers || {}, body: init.body });
  if (!["api.anthropic.com", "geocoding.geo.census.gov"].includes(u.hostname)) { forbidden.push(u.hostname); throw new Error("forbidden host " + u.hostname); }
  if (u.hostname === "geocoding.geo.census.gov") {
    const a = u.searchParams.get("address"); const g = censusMap[a];
    return { ok: !!g, status: 200, json: async () => ({ result: { addressMatches: g ? [{ coordinates: { x: g.lng, y: g.lat } }] : [] } }) };
  }
  const body = JSON.parse(init.body);
  const ctx = JSON.parse(body.messages[0].content.split("\n\n").pop());
  const place = MANIFEST.places.find((p) => p.name === ctx.name);
  const r = behave(place, body.model, body, calls.filter((c) => c.host === "api.anthropic.com").length);
  return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: (h) => (h.toLowerCase() === "request-id" ? r.requestId || "req_test" : null) }, json: async () => r.body };
};
const anthropicCalls = () => calls.filter((c) => c.host === "api.anthropic.com");
const goodBehave = (p, model) => ({ status: 200, body: okBody(p, model) });

let seq = 0;
function setup({ ceiling = MANIFEST.ceilingMicroUsd, mutate } = {}) {
  const d = path.join(tmp, "run" + ++seq); fs.mkdirSync(d, { recursive: true });
  const m = JSON.parse(JSON.stringify(MANIFEST)); m.ceilingMicroUsd = ceiling; if (mutate) mutate(m);
  const manifest = path.join(d, "manifest.json"); fs.writeFileSync(manifest, JSON.stringify(m));
  const cf = path.join(d, "coords.json"); fs.writeFileSync(cf, JSON.stringify(coords));
  calls = []; behave = goodBehave;
  return { d, opts: { confirmSpend: true, ledger: path.join(d, "ledger.json"), out: path.join(d, "out"), manifest, coords: cf, env: { ANTHROPIC_API_KEY: KEY } } };
}
const rejects = async (fn, rx, m) => { try { await fn(); } catch (e) { ok(e instanceof P.PilotUsageError && rx.test(e.message), `${m} (threw ${e && e.name}: ${e && e.message})`); return; } fail(`${m} (did not throw)`); };
const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

// ===== B. full run: 40 calls, hosts, ordering, no key leak, blind packet, mapping =====
{
  const { d, opts } = setup();
  const s = await P.runPilot(opts);
  eq(anthropicCalls().length, 40, "20 places x 2 models = 40 Anthropic calls");
  ok(calls.every((c) => ["api.anthropic.com", "geocoding.geo.census.gov"].includes(c.host)), "only the two allowed hosts were contacted");
  eq(forbidden.length, 0, "no forbidden host (so no Supabase / database write path) was touched");
  ok(anthropicCalls().every((c) => c.headers["x-api-key"] === KEY && c.headers["anthropic-version"] === "2023-06-01" && /json/.test(c.headers["content-type"])), "headers: x-api-key, anthropic-version 2023-06-01, json");
  ok(calls.filter((c) => c.host !== "api.anthropic.com").every((c) => !JSON.stringify(c.headers).includes(KEY)), "API key is only ever sent to api.anthropic.com");
  ok(anthropicCalls().every((c) => !("temperature" in JSON.parse(c.body))), "CALLED: no 5.5 request carried temperature");
  // execution order = seeded, recorded, and actually followed
  const seen = anthropicCalls().map((c) => { const b = JSON.parse(c.body); return JSON.parse(b.messages[0].content.split("\n\n").pop()).name + "|" + b.model; });
  const want = s.executionOrder.flatMap((o) => { const pl = MANIFEST.places.find((p) => p.place_id === o.place_id); return o.models.map((m) => pl.name + "|" + m); });
  ok(JSON.stringify(seen) === JSON.stringify(want), "calls follow the recorded per-place model order, in manifest place order");
  const s2 = await (async () => { const x = setup(); const r = await P.runPilot(x.opts); return r; })();
  ok(JSON.stringify(s2.executionOrder) === JSON.stringify(s.executionOrder), "model order is deterministic from the pilotId seed");
  ok(s.executionOrder.some((o) => o.models[0] === "claude-haiku-5-5") && s.executionOrder.some((o) => o.models[0] === "claude-sonnet-5-5"), "order is actually randomized (both models lead somewhere)");
  // cost: 5000 in, 800 out, 2 searches. haiku-5-5 tier A: 5000*100+800*500+2*10,000,000 = 20,900,000 nano = 20,900. sonnet: 5000*2000+800*10000+20,000,000 = 38,000,000 = 38,000
  eq(s.perModel["claude-haiku-5-5"].settledMicroUsd, 20 * 20900, "haiku settled micro-USD exact");
  eq(s.perModel["claude-sonnet-5-5"].settledMicroUsd, 20 * 38000, "sonnet settled micro-USD exact");
  eq(s.perModel["claude-haiku-5-5"].accepted, 20, "all fixtures verify (route lane checks pass)");
  eq(s.ledgerTotals.settled, 20 * 20900 + 20 * 38000, "ledger total matches");
  // outputs
  eq(fs.readdirSync(path.join(d, "out/raw")).length, 40, "40 raw files");
  const blob = [...fs.readdirSync(path.join(d, "out/raw")).map((f) => fs.readFileSync(path.join(d, "out/raw", f), "utf8")), fs.readFileSync(path.join(d, "out/summary.json"), "utf8"), fs.readFileSync(path.join(d, "out/blind/mapping.json"), "utf8")].join("\n");
  ok(!blob.includes(KEY) && !/x-api-key/i.test(blob), "no API key or key header in any output");
  const packetTxt = fs.readFileSync(path.join(d, "out/blind/packet.json"), "utf8");
  ok(!/claude|haiku|sonnet|micro|usd|price|token/i.test(packetTxt), "blind packet carries no model ids, prices or tokens");
  const packet = readJson(path.join(d, "out/blind/packet.json")), mapping = readJson(path.join(d, "out/blind/mapping.json"));
  eq(packet.items.length, 20, "20 packet items"); eq(mapping.mapping.length, 20, "20 mapping rows");
  ok(packet.items.every((it) => it.A && it.B && it.A.status === "output"), "each item has A and B");
  let roundTrip = 0, aIsHaiku = 0;
  for (const mrow of mapping.mapping) {
    const it = packet.items.find((x) => x.place_id === mrow.place_id);
    for (const side of ["A", "B"]) {
      const raw = readJson(path.join(d, "out/raw", `${mrow.place_id}.${mrow[side]}.json`));
      const txt = raw.response.content.find((b) => b.type === "text").text;
      if (txt.includes(it[side].hook)) roundTrip++;
    }
    if (mrow.A === "claude-haiku-5-5") aIsHaiku++;
    ok(mrow.A !== mrow.B, "A and B are different models");
  }
  eq(roundTrip, 40, "mapping round-trips: every blind side matches the raw output of its mapped model");
  ok(aIsHaiku > 0 && aIsHaiku < 20, "A/B assignment is randomized");
  eq(JSON.stringify(Object.keys(s)).includes("attempts"), true, "summary lists attempts");
  // rerun on the same ledger: duplicate attempt keys -> zero calls
  calls = [];
  const rr = await P.runPilot({ ...opts, out: path.join(d, "out2") });
  eq(anthropicCalls().length, 0, "re-running on a used ledger makes zero Anthropic calls");
  ok(rr.attempts.every((a) => a.status === "not_run"), "all not_run on reuse");
}

// ===== C. insufficient ceiling => ZERO Anthropic calls, outputs still written =====
{
  const { d, opts } = setup({ ceiling: 1000 });
  const s = await P.runPilot(opts);
  eq(anthropicCalls().length, 0, "insufficient ceiling: zero Anthropic calls");
  eq(calls.length, 0, "insufficient ceiling: zero network calls of any kind");
  ok(s.attempts.length === 40 && s.attempts.every((a) => a.status === "not_run" && a.reason === "budget"), "all 40 marked not_run: budget");
  ok(fs.existsSync(path.join(d, "out/summary.json")) && fs.existsSync(path.join(d, "out/blind/packet.json")) && fs.existsSync(path.join(d, "out/blind/mapping.json")), "outputs still written");
  eq(readJson(path.join(d, "out/blind/packet.json")).items.length, 0, "empty packet");
}

// ===== D. budget binds mid-run: dispatch stops, partial pairs preserved =====
{
  // sonnet 250,000 in: 250,000*2000 + 800*10000 + 2*10,000,000 = 528,000,000 nano = 528,000 micro. haiku (tier B): 250,000*500+800*2500+20,000,000 = 147,000,000 = 147,000.
  // bounds: sonnet 1,570,000 ; haiku 415,000. ceiling 2,000,000: after one full pair (675,000) a sonnet bound (1,570,000) no longer fits.
  const { opts } = setup({ ceiling: 2000000 });
  behave = (p, model) => ({ status: 200, body: okBody(p, model, { input_tokens: 250000, output_tokens: 800, server_tool_use: { web_search_requests: 2 } }) });
  const s = await P.runPilot(opts);
  const ran = s.attempts.filter((a) => a.status === "settled"), notRun = s.attempts.filter((a) => a.status === "not_run");
  ok(ran.length >= 1 && ran.length < 40, "some attempts ran, not all");
  eq(anthropicCalls().length, ran.length, "calls == settled attempts (nothing dispatched after the bind)");
  ok(notRun.length === 40 - ran.length && notRun.every((a) => a.reason === "budget"), "every remaining attempt is not_run: budget");
  const firstNot = s.attempts.findIndex((a) => a.status === "not_run");
  ok(s.attempts.slice(firstNot).every((a) => a.status === "not_run"), "once it stops, nothing later runs");
  ok(ran.every((a) => fs.existsSync(path.join(opts.out, "raw", `${a.place_id}.${a.model}.json`))), "partial results preserved in raw/");
  ok(s.ledgerTotals.settled + s.ledgerTotals.liability <= 2000000, "ledger never exceeds the ceiling");
  ok(!s.attempts.some((a) => a.status === "unresolved"), "budget stop leaves nothing unresolved");
}

// ===== E. missing usage => unresolved + run stops =====
{
  const { opts } = setup();
  behave = (p, model) => (p.place_id === MANIFEST.places[2].place_id ? { status: 200, body: okBody(p, model, null) } : goodBehave(p, model));
  const s = await P.runPilot(opts);
  const u = s.attempts.filter((a) => a.status === "unresolved");
  eq(u.length, 1, "exactly one unresolved attempt");
  eq(anthropicCalls().length, s.attempts.findIndex((a) => a.status === "unresolved") + 1, "no Anthropic call after the unresolved attempt");
  ok(s.attempts.slice(s.attempts.indexOf(u[0]) + 1).every((a) => a.status === "not_run" && a.reason === "unresolved_attempt"), "run stopped; the rest are not_run");
  ok(s.ledgerTotals.liability > 0, "the unresolved attempt keeps its reserved bound as liability");
  eq(s.perModel[u[0].model].unresolved, 1, "summary counts the unresolved attempt");
}
// network error after dispatch => unresolved, stops
{
  const { opts } = setup();
  const prev = globalThis.fetch;
  globalThis.fetch = async (url, init) => { if (String(url).includes("anthropic")) { calls.push({ host: "api.anthropic.com" }); throw new Error("socket hang up"); } return prev(url, init); };
  const s = await P.runPilot(opts);
  eq(s.attempts.filter((a) => a.status === "unresolved").length, 1, "network error after dispatch => unresolved");
  eq(anthropicCalls().length, 1, "and the run stops after it");
  globalThis.fetch = prev;
}

// ===== F. pause_turn => incomplete, no continuation call =====
{
  const { opts } = setup();
  const target = MANIFEST.places[1].place_id;
  behave = (p, model) => (p.place_id === target ? { status: 200, body: { ...okBody(p, model), stop_reason: "pause_turn" } } : goodBehave(p, model));
  const s = await P.runPilot(opts);
  eq(anthropicCalls().length, 40, "pause_turn: still exactly 40 calls (no continuation request)");
  const inc = s.attempts.filter((a) => a.place_id === target);
  ok(inc.every((a) => a.status === "settled" && a.category === "incomplete" && a.microUsd > 0), "pause_turn attempts are settled with usage and recorded incomplete");
  ok(inc.every((a) => a.verified !== true), "incomplete is never accepted");
  eq(anthropicCalls().filter((c) => /"role":"assistant"/.test(c.body)).length, 0, "no request ever carried an assistant turn (continuation)");
}

// ===== G. provider errors =====
{
  const { opts } = setup();
  behave = (p, model) => (p.place_id === MANIFEST.places[0].place_id ? { status: 400, body: { type: "error", error: { type: "invalid_request_error", message: "temperature is not supported" } } } : goodBehave(p, model));
  const s = await P.runPilot(opts);
  const pe = s.attempts.filter((a) => a.category === "provider_error");
  eq(pe.length, 2, "400 validation error => provider_error for both models");
  ok(pe.every((a) => a.status === "settled" && a.microUsd === 0), "validation errors settle at zero tokens ($0 assumed: Anthropic does not bill invalid requests)");
  eq(anthropicCalls().length, 40, "run continues past validation errors");
}
{
  const { opts } = setup();
  behave = (p, model) => (p.place_id === MANIFEST.places[0].place_id ? { status: 529, body: { type: "error", error: { type: "overloaded_error", message: "x" } } } : goodBehave(p, model));
  const s = await P.runPilot(opts);
  eq(s.attempts.filter((a) => a.status === "unresolved").length, 1, "non-validation HTTP error => unresolved (bound held), not zero");
  eq(anthropicCalls().length, 1, "and the run stops");
}
// failure categories
{
  const { opts } = setup();
  const pend = MANIFEST.places[0].place_id, wrong = MANIFEST.places[1].place_id, unsup = MANIFEST.places[2].place_id, dashp = MANIFEST.places[3].place_id;
  behave = (p, model) => {
    const b = okBody(p, model);
    const txt = b.content.find((x) => x.type === "text"); const j = JSON.parse(txt.text.replace(/```json\n|\n```/g, ""));
    if (p.place_id === pend) { b.content = [{ type: "text", text: '{"pending":true}' }]; }
    if (p.place_id === wrong) { b.content[0].content.content.source.data = "A totally different business on Elm Road in Miami."; }
    if (p.place_id === unsup) { j.why_here += " It was founded in 1987 by Zorblax."; txt.text = JSON.stringify(j); }
    if (p.place_id === dashp) { j.hook = "Oak smoked brisket - served at the counter every morning"; txt.text = JSON.stringify(j); }
    return { status: 200, body: b };
  };
  const s = await P.runPilot(opts);
  const cat = (id) => [...new Set(s.attempts.filter((a) => a.place_id === id).map((a) => a.category))].join();
  eq(cat(pend), "insufficient_sources", "pending => insufficient_sources");
  eq(cat(wrong), "wrong_place", "identity failure => wrong_place");
  eq(cat(unsup), "unsupported_claim", "unsourced number/entity => unsupported_claim");
  eq(cat(dashp), "dash", "spaced hyphen => dash");
  ok(s.attempts.filter((a) => a.place_id === pend).every((a) => a.verified !== true), "failures are not accepted");
}

// ===== H. guards: flags, env, out dir, ledger path, manifest, frozen config =====
{
  const { opts } = setup();
  await rejects(() => P.runPilot({ ...opts, confirmSpend: false }), /--confirm-spend/, "missing --confirm-spend names the flag");
  await rejects(() => P.runPilot({ ...opts, ledger: undefined }), /--ledger/, "missing --ledger names the flag");
  await rejects(() => P.runPilot({ ...opts, env: {} }), /ANTHROPIC_API_KEY/, "missing key names ANTHROPIC_API_KEY");
  await rejects(() => P.runPilot({ ...opts, manifest: path.join(tmp, "nope.json") }), /manifest/, "missing manifest names it");
  await rejects(() => P.runPilot({ ...opts, out: path.join(ROOT, "lib/pilot-out") }), /protected paths/, "--out inside lib/ refused");
  for (const dname of ["data", "app", "public"]) await rejects(() => P.runPilot({ ...opts, out: path.join(ROOT, dname, "x") }), /protected paths/, `--out inside ${dname}/ refused`);
  await rejects(() => P.runPilot({ ...opts, out: ROOT }), /protected paths|repo root/, "--out = repo root refused");
  await rejects(() => P.runPilot({ ...opts, ledger: path.join(ROOT, "ledger.json") }), /inside the repo/, "--ledger inside the repo refused");
  fs.symlinkSync(path.join(ROOT, "lib"), path.join(opts.manifest + "-link"));
  await rejects(() => P.runPilot({ ...opts, out: path.join(opts.manifest + "-link", "sneaky") }), /protected paths/, "a symlink into lib/ is resolved and refused");
  eq(calls.length, 0, "no network call happened in any refusal");
  const a = setup({ mutate: (m) => { m.priceVersion = "anthropic-std-1999"; } });
  await rejects(() => P.runPilot(a.opts), /price version/, "unknown price version refused");
  const b = setup({ mutate: (m) => { m.models = ["claude-haiku-5-5", "claude-mystery-9"]; } });
  try { await P.runPilot(b.opts); fail("unknown model must throw"); } catch (e) { ok(/unknown model/.test(e.message), "unknown model throws, never substituted"); }
  const c = setup({ mutate: (m) => { m.frozenConfig.files["lib/atlasVerify.js"] = "0".repeat(64); } });
  await rejects(() => P.runPilot(c.opts), /frozenConfig mismatch/, "frozenConfig hash mismatch => refuse");
  eq(calls.length, 0, "mismatch refused before any call");
  const c2 = setup({ mutate: (m) => { m.frozenConfig.systemPrompt["claude-haiku-5-5"] = "1".repeat(64); } });
  await rejects(() => P.runPilot(c2.opts), /frozenConfig mismatch/, "system prompt hash mismatch => refuse");
  const rf = await P.runPilot({ ...c.opts, refreeze: true });
  ok(rf.refrozen === true && rf.frozenConfigMatched === false, "--refreeze runs and records the mismatch");
  const dz = setup({ mutate: (m) => { m.places[0].name = "Magic Kingdom Park"; } });
  await rejects(() => P.runPilot(dz.opts), /section 7/, "a Disney entity in the manifest is refused before any output");
  ok(!fs.existsSync(dz.opts.out), "...and nothing was written");
  const nc = setup(); fs.unlinkSync(nc.opts.coords);
  await rejects(() => P.runPilot(nc.opts), /--coords/, "missing coords names the flag");
}

// ===== I. manifest shape =====
{
  eq(MANIFEST.pilotId, "atlas-pilot-2026-10-08", "pilotId");
  eq(MANIFEST.places.length, 20, "20 places");
  eq(MANIFEST.ceilingMicroUsd, 8000000, "ceiling $8");
  eq(JSON.stringify(MANIFEST.models), JSON.stringify(["claude-haiku-5-5", "claude-sonnet-5-5"]), "models");
  eq(JSON.stringify(MANIFEST.limits), JSON.stringify({ maxInputTokens: 350000, maxOutputTokens: 14000, maxSearches: 3, cacheWriteTokens: 350000 }), "limits");
  ok(MANIFEST.retries === 0 && MANIFEST.continuations === 0 && MANIFEST.concurrency === 1 && MANIFEST.attemptsPerPlacePerModel === 1, "no retries/continuations, concurrency 1");
  ok(/NOT a provable hard maximum/.test(MANIFEST.limitsNote), "limits note says the bound is not provable");
  ok(MANIFEST.places.every((p) => !/disney|epcot|magic kingdom|hollywood studios|animal kingdom|typhoon lagoon|blizzard beach/i.test(p.name)), "no section 7 names");
  const live = await P.computeFrozenConfig(MANIFEST.models);
  eq(JSON.stringify(live), JSON.stringify(MANIFEST.frozenConfig), "committed frozenConfig matches the live files and prompts");
}

// ===== J. no database write path =====
{
  const seen = new Set(); const hits = [];
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const walk = (f) => {
    if (seen.has(f) || !fs.existsSync(f)) return; seen.add(f);
    const src = strip(fs.readFileSync(f, "utf8"));
    if (/sbEnv|\/rest\/v1|createClient\(|@supabase|serverCache|paidAi|jobPulse/.test(src)) hits.push(path.relative(ROOT, f));
    for (const m of src.matchAll(/(?:import|from)\s*(?:[^"']*from\s*)?["'](\.[^"']+)["']|import\(\s*["'](\.[^"']+)["']\s*\)/g)) {
      const rel = m[1] || m[2]; let t = path.resolve(path.dirname(f), rel);
      if (!/\.[mc]?js$/.test(t)) t += ".js";
      walk(t);
    }
  };
  // the lib modules the runner loads dynamically via imp("lib/...")
  const src = fs.readFileSync(RUNNER, "utf8");
  const libs = [...src.matchAll(/imp\("(lib\/[^"]+)"\)/g)].map((m) => m[1]);
  ok(libs.length >= 8, "runner's dynamic lib imports found (" + libs.length + ")");
  walk(RUNNER); for (const l of libs) walk(path.join(ROOT, l));
  eq(hits.join(","), "", "no module in the runner's import closure references Supabase / sbEnv / rest/v1");
  // positive control: the probe does fire on a file that really writes to Supabase
  const walked = seen.size;
  seen.clear(); hits.length = 0; walk(path.join(ROOT, "lib/serverCache.js"));
  ok(hits.length > 0, "positive control: the probe flags lib/serverCache.js");
  ok(walked > 8, "closure walked " + walked + " files");
}

// ===== K. CLI: refusals exit non-zero naming the problem; --mock works for free =====
{
  const run = (args, env = {}) => spawnSync(process.execPath, [RUNNER, ...args], { encoding: "utf8", env: { ...env } });
  let r = run([]);
  ok(r.status !== 0 && /--confirm-spend/.test(r.stderr), "CLI: no flags => non-zero naming --confirm-spend");
  const d = path.join(tmp, "cli"); fs.mkdirSync(d, { recursive: true });
  r = run(["--confirm-spend", "--ledger", path.join(d, "l.json"), "--out", path.join(d, "o")]);
  ok(r.status !== 0 && /ANTHROPIC_API_KEY/.test(r.stderr), "CLI: missing key => non-zero naming ANTHROPIC_API_KEY");
  ok(!r.stderr.includes(KEY) && !r.stdout.includes(KEY), "CLI never prints a key");
  // --mock fixtures dir (free)
  const fx = path.join(d, "fx"); fs.mkdirSync(fx);
  fs.writeFileSync(path.join(fx, "coords.json"), JSON.stringify(coords)); fs.writeFileSync(path.join(fx, "census.json"), JSON.stringify(censusMap));
  MANIFEST.places.forEach((p, i) => { for (const m of MANIFEST.models) fs.writeFileSync(path.join(fx, `${i}.${m}.json`), JSON.stringify({ placeName: p.name, status: 200, requestId: "req_mock", body: okBody(p, m) })); });
  calls = [];
  r = run(["--confirm-spend", "--mock", fx, "--ledger", path.join(d, "l2.json"), "--out", path.join(d, "o2")]);
  ok(r.status === 0, "CLI --mock exits 0 (" + r.stderr.slice(0, 200) + ")");
  const ms = readJson(path.join(d, "o2/summary.json"));
  eq(ms.perModel["claude-sonnet-5-5"].accepted, 20, "--mock run accepts all fixtures with no API key and no network");
  eq(ms.perModel["claude-sonnet-5-5"].settledMicroUsd, 20 * 38000, "--mock costs computed from fixture usage");
  eq(calls.length, 0, "(child process) the parent's fetch stub saw nothing");
}

globalThis.fetch = realFetch;
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`test-atlas-pilot: OK - ${n} assertions (temperature omitted for 5.5 models, 40-call run with exact micro-USD, zero calls on insufficient ceiling, budget bind mid-run, unresolved stops run, pause_turn incomplete without continuation, failure categories, out/ledger/manifest/frozenConfig guards, blind packet leak check + mapping round-trip, no DB write path, CLI refusals and --mock)`);
