// scripts/check-spend-guard.mjs — THE $1,878 GUARD (2026-08-25).
//
// August 1-25, 2026: $1,878.92 of Google Places spend. Root causes, so they are
// never rediscovered the hard way:
//   (a) `editorialSummary` in the Place Details field mask billed EVERY call at
//       the Enterprise + Atmosphere SKU (~$25/1k) — $1,198 of the bill — for a
//       field the product does not display (v6.61).
//   (b) The same Text Search query was bought at two radii (27359m AND 32000m):
//       Google support case 74703052 measured a 10–86% duplicate rate.
//   (c) Background pipelines re-bought cached places on a schedule.
//
// This guard pins the fixes:
//   1. No atmosphere-tier field (editorialSummary, reviews, serves*, allowsDogs)
//      may appear in a server-side Places field mask. lib/google.js (the client
//      detail sheet) is the ONE allowlisted exception — an owner spend decision;
//      volume is a handful of detail-opens a day and the project quota cap
//      bounds it. atlas-build lost the field with the rest.
//   2. Every metered server call site must import the spend gate (lib/spendGate.js)
//      or define the identical local gate (search route), so WAYFIND_GATE=shut
//      always means ZERO paid Google calls.
//   3. The radius ladder must stay in /api/places/search.
import { readFileSync, readdirSync } from "node:fs";

let failed = 0;
const die = (msg) => { console.error("check-spend-guard: FAIL — " + msg); failed++; };
const read = (p) => readFileSync(p, "utf8");

const ATMOSPHERE = /editorialSummary|\breviews\b|serves[A-Z]|allowsDogs/;

// 1 — masks that must stay lean (file → mask const name, for the error message)
const MASK_FILES = [
  "lib/placeDetails.js",
  "lib/landing.js",
  "lib/nightlifeCensus.js",
  "app/api/places/search/route.js",
  "app/api/places/refresh/route.js",
  "app/api/city/unlock/route.js",
  "app/api/cron/atlas-build/route.js",
];
for (const f of MASK_FILES) {
  const src = read(f);
  // Only inspect mask-bearing lines: const *FIELDS*/MASK* strings and FieldMask headers.
  const maskLines = src.split("\n").filter((l) =>
    /X-Goog-FieldMask|FIELDS\s*=|FIELD_MASK\s*=|_MASK\s*=|PLACE_FIELDS\s*=/.test(l) && /"/.test(l) && !l.trim().startsWith("//")
  );
  for (const l of maskLines) {
    if (ATMOSPHERE.test(l)) die(`${f} carries an atmosphere-tier field in a mask line: ${l.trim().slice(0, 120)} — this re-creates the August 2026 bill. Owner spend decision required.`);
  }
}

// 2 — every metered call site is gated.
//
// 2026-09-04 — THIS LIST USED TO BE HARDCODED, AND THAT IS HOW THREE LIVE
// GOOGLE CALLERS SHIPPED WITH NO GATE AT ALL: app/api/places/details,
// app/api/places/autocomplete and app/api/sources/compare. The first two are
// wired to the home search box, so autocomplete billed on typing. The guard
// was green the entire time because those files were simply not in the array —
// the same scoped-by-name disease CLAUDE.md names, and the same shape as the
// $1,878 August bill this guard exists to prevent.
//
// The list is now DISCOVERED: every route/lib file that actually names
// places.googleapis.com must hold a gate. A new metered caller is therefore
// guarded the day it is written, whether or not anyone remembers this file.
function discoverGoogleCallers() {
  const roots = ["app", "lib", "scripts/lib"];
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = dir + "/" + e.name;
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") walk(full); continue; }
      if (!/\.(js|mjs)$/.test(e.name)) continue;
      const src = read(full);
      // Comments are prose, not calls — this repo documents the API constantly.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (!/places\.googleapis\.com/.test(code)) continue;
      // A GUARD THAT FIRES ON CORRECT CODE IS WORSE THAN NO GUARD (CLAUDE.md),
      // and the first draft of this discovery fired on three of them:
      //   - app/layout.js  <link rel="preconnect" href="https://places.googleapis.com">
      //     is a DNS hint, not a request. Only a fetch spends money.
      //   - lib/placePhotoServe.js takes gateShut/spendAllowed as INJECTED
      //     PARAMETERS so it stays pure and unit-testable; its caller holds the
      //     gate. Gating by injection is gating.
      // So: flag only a real fetch to that host, and accept either an imported
      // gate or an injected one.
      // DETECT BROADLY, EXCLUDE PRECISELY. A first draft required the URL to sit
      // literally inside a fetch(...) call and MISSED lib/nightlifeCensus.js,
      // which stores the URL in a const and calls it as `f(NEARBY, …)` through an
      // injected fetch. Narrow detection is how the original hardcoded list
      // failed in the first place, so the rule is: any places.googleapis.com in
      // CODE counts, and only two things excuse it.
      //   1. a preconnect/dns-prefetch <link> — a DNS hint, not a request.
      //   2. gating by INJECTION — lib/placePhotoServe.js takes gateShut /
      //      spendAllowed as parameters so it stays pure; its caller holds the
      //      gate. Gating by injection is gating.
      const onlyPreconnect = !/places\.googleapis\.com/.test(
        code.replace(/<link[^>]*places\.googleapis\.com[^>]*>/g, " ")
      );
      if (onlyPreconnect) continue;
      const injected = /\binput\s*&&\s*input\.gateShut|\bgateShut\s*=\s*!!\(?\s*input|\bspendAllowed\b/.test(code);
      if (injected) continue;
      out.push(full);
    }
  };
  roots.forEach(walk);
  return out.sort();
}

const GATED_FILES = discoverGoogleCallers();
for (const f of GATED_FILES) {
  const src = read(f);
  if (!/spendGate/.test(src)) die(`${f} calls Google but does not import lib/spendGate.js — WAYFIND_GATE=shut would leak spend here.`);
  if (!/gateShut\(\)/.test(src)) die(`${f} imports the gate but never calls gateShut().`);
}
const search = read("app/api/places/search/route.js");
if (!/WAYFIND_GATE/.test(search)) die("search route lost its WAYFIND_GATE kill switch.");

// 3 — the radius ladder stays
if (!/RADIUS_LADDER/.test(search)) die("search route lost the radius ladder — duplicate paid searches return (Google case 74703052).");

// 4 - FREE MODE invariants (WAYFIND_GATE=free must stay inside Google's free tier)
const gate = read("lib/spendGate.js");
if (!/wf_spend_take/.test(gate)) die("spendGate lost the ledger RPC - free mode would spend unmetered.");
for (const [sku, cap] of [["text_pro", 4800], ["details_enterprise", 950], ["details_pro", 4800], ["photos", 950], ["nearby_pro", 4800]]) {
  if (!new RegExp(sku + ":\\s*" + cap).test(gate)) die(`spendGate cap for ${sku} moved off ${cap} - it must stay ~5% under Google's monthly free line.`);
}
if (!/TEXT_PRO_MASK/.test(search)) die("search route lost TEXT_PRO_MASK - free mode would bill Enterprise Text Search.");
const proMask = search.match(/const TEXT_PRO_MASK = \[([^\]]*)\]/);
if (!proMask) die("TEXT_PRO_MASK not parseable");
else if (/rating|priceLevel|priceRange|regularOpeningHours|businessStatus/.test(proMask[1])) die("TEXT_PRO_MASK carries an Enterprise-tier field - free mode would bill.");
if (!/spendAllow\("text_pro"\)/.test(search)) die("search route can pay Google without a text_pro ledger grant.");
if (!/spendAllow\("details_enterprise"\)/.test(read("lib/placeDetails.js"))) die("placeDetails can pay Google without a details_enterprise ledger grant.");
if (!/spendAllow\("photos"\)/.test(read("app/api/photo/route.js"))) die("photo route can pay Google without a photos ledger grant.");

// 5 - FREE MODE serving invariants (live empty-results incident, 2026-08-25):
// the rich v1 cache must be consulted before any paid decision, and lean
// Pro-mask results must be enriched from owned inventory signals.
if (!/kRich/.test(search) || !/rich-cache/.test(search)) die("free mode lost the rich v1 cache fallback - warm cache orphaned, empty results return.");
if (!/enrichFromInventory\(places\)/.test(search)) die("free mode lost inventory enrichment - lean results fail the ranking floors and every list renders empty.");

// red-prove ourselves: the atmosphere regex must actually catch the original sin
if (!ATMOSPHERE.test('const FIELDS = "id,editorialSummary";')) die("self-test: atmosphere regex is broken");

// 6 — Anthropic requests are discovered, then exercised entirely behind a
// fetch stub. The billing incident was not a route-specific problem: a new
// provider caller must be impossible to add without this shared gate.
function discoverAnthropicEndpointLiterals() {
  const out = [];
  const walk = (dir) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = dir + "/" + entry.name;
      if (entry.isDirectory()) { if (entry.name !== "node_modules" && entry.name !== ".next") walk(full); continue; }
      if (!/\.js$/.test(entry.name)) continue;
      const code = read(full).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/api\.anthropic\.com\/v1\/messages/.test(code)) out.push(full);
    }
  };
  ["app/api", "lib"].forEach(walk);
  return out.sort();
}
const ok = (condition, message) => { if (!condition) die(message); };
const ANTHROPIC_LITERAL_CALLERS = discoverAnthropicEndpointLiterals();
if (JSON.stringify(ANTHROPIC_LITERAL_CALLERS) !== JSON.stringify(["lib/paidAi.js"])) {
  die(`Anthropic endpoint literals must live only in lib/paidAi.js; found ${ANTHROPIC_LITERAL_CALLERS.join(", ") || "none"}`);
}

const { spawnSync } = await import("node:child_process");
const paidAiProbe = (env) => {
  const code = `
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const target = String(url); calls.push({ target, init: { method: init.method, redirect: init.redirect, cache: init.cache } });
      if (target.includes("/rest/v1/rpc/wf_spend_take")) return new Response(process.env.LEDGER === "true" ? "true" : "false", { status: 200, headers: { "content-type": "application/json" } });
      if (target === "https://api.anthropic.com/v1/messages") return new Response('{"content":[]}', { status: 200, headers: { "content-type": "application/json" } });
      throw new Error("unexpected network target: " + target);
    };
    const { paidAnthropicRequest } = await import("./lib/paidAi.js");
    const kind = process.env.PROBE_KIND;
    const payload = kind === "bad_shape"
      ? { model: "claude-haiku-4-5", max_tokens: 10, messages: [] }
      : { model: "claude-haiku-4-5", max_tokens: kind === "bad_max" ? 4097 : 10, messages: [{ role: "user", content: kind === "oversize" ? "x".repeat(65_537) : "test" }] };
    const response = await paidAnthropicRequest({
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "test-key", "anthropic-version": "2023-06-01" },
      body: JSON.stringify(payload),
    });
    console.log(JSON.stringify({ status: response.status, calls }));
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
    cwd: process.cwd(),
    env: { ...env }, encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`paid AI probe failed: ${(result.stderr || result.stdout).slice(0, 500)}`);
  return JSON.parse(result.stdout.trim());
};
const ledgerEnv = { SUPABASE_URL: "https://ledger.test", SUPABASE_SERVICE_ROLE_KEY: "test-service-key", ANTHROPIC_MONTHLY_REQUEST_CAP: "17" };
const invalidShape = paidAiProbe({ ...ledgerEnv, PROBE_KIND: "bad_shape", LEDGER: "true" });
ok(invalidShape.status === 400 && invalidShape.calls.length === 0, "paid AI: malformed Messages payload blocks before the ledger");
const invalidMax = paidAiProbe({ ...ledgerEnv, PROBE_KIND: "bad_max", LEDGER: "true" });
ok(invalidMax.status === 400 && invalidMax.calls.length === 0, "paid AI: max_tokens above the hard ceiling blocks before the ledger");
const oversized = paidAiProbe({ ...ledgerEnv, PROBE_KIND: "oversize", LEDGER: "true" });
ok(oversized.status === 400 && oversized.calls.length === 0, "paid AI: oversized payload blocks before the ledger");
const missingCap = paidAiProbe({ ...ledgerEnv, ANTHROPIC_MONTHLY_REQUEST_CAP: "", LEDGER: "true" });
ok(missingCap.status === 503 && missingCap.calls.length === 0, "paid AI: missing ANTHROPIC_MONTHLY_REQUEST_CAP blocks before any network call");
const invalidCap = paidAiProbe({ ...ledgerEnv, ANTHROPIC_MONTHLY_REQUEST_CAP: "17.5", LEDGER: "true" });
ok(invalidCap.status === 503 && invalidCap.calls.length === 0, "paid AI: invalid ANTHROPIC_MONTHLY_REQUEST_CAP blocks before any network call");
const unsetGate = paidAiProbe({ ...ledgerEnv, LEDGER: "true" });
ok(unsetGate.status === 503 && unsetGate.calls.length === 0, "paid AI: an unset WAYFIND_GATE fails closed before ledger or provider network");
const typoGate = paidAiProbe({ ...ledgerEnv, WAYFIND_GATE: "enabled", LEDGER: "true" });
ok(typoGate.status === 503 && typoGate.calls.length === 0, "paid AI: an unrecognized WAYFIND_GATE fails closed before ledger or provider network");
const shut = paidAiProbe({ ...ledgerEnv, WAYFIND_GATE: "shut", LEDGER: "true" });
ok(shut.status === 503 && shut.calls.length === 0, "paid AI: WAYFIND_GATE=shut blocks before ledger or provider network");
const denied = paidAiProbe({ ...ledgerEnv, WAYFIND_GATE: "free", LEDGER: "false" });
ok(denied.status === 503 && denied.calls.length === 1 && /wf_spend_take$/.test(denied.calls[0].target), "paid AI: denied atomic ledger grant never reaches Anthropic");
const granted = paidAiProbe({ ...ledgerEnv, WAYFIND_GATE: "open", LEDGER: "true" });
ok(granted.status === 200 && granted.calls.length === 2 && /wf_spend_take$/.test(granted.calls[0].target) && granted.calls[1].target === "https://api.anthropic.com/v1/messages" && granted.calls[1].init.redirect === "error" && granted.calls[1].init.cache === "no-store", "paid AI: granted request takes the ledger then reaches Anthropic with redirect:error and no-store");

if (failed) { console.error(`check-spend-guard: ${failed} failure(s)`); process.exit(1); }
console.log("check-spend-guard: OK — Google and Anthropic requests are discovered, fail-closed, and capped");
