#!/usr/bin/env node
// scripts/atlas-pilot.mjs — the Atlas Haiku-5.5 vs Sonnet-5.5 paid pilot runner (20 places x 2 models).
//
//   node scripts/atlas-pilot.mjs --confirm-spend --ledger /abs/outside/repo/ledger.json \
//        --out /abs/outdir [--manifest docs/atlas-pilot-2026-10/manifest.json] \
//        [--coords coords.json] [--refreeze] [--mock <fixturesDir>]
//   ANTHROPIC_API_KEY must be in the environment (never printed, never written).
//
// What it does: for each manifest place (in order) and each manifest model (seeded-random order per
// place) it makes ONE raw-fetch Messages call through lib/atlasBudget.js runAttempt (reserve -> dispatch
// -> call -> settle), then runs the SAME lane checks the atlas-build route runs, in the route's order,
// by importing the lib functions. It NEVER writes Supabase / wf_editorial: the only hosts it may contact
// are api.anthropic.com and geocoding.geo.census.gov (enforced by a host allow-list wrapper), and it
// imports no module that talks to a database. No retries, no continuations, no substituted model/budget.
//
// ROUTE LOGIC NOT IMPORTABLE (reported as gaps, nothing reimplemented): the lane ORCHESTRATION is
// inline in app/api/cron/atlas-build/route.js (writeLaneEditorial + the `if (lane)` block). This file
// mirrors its call ORDER with the exported lib functions. Not mirrored: paidAnthropicRequest (spend gate,
// provider breaker), takeFromLedger (route ledger), the 48s route timeout (pilot uses 60s), pool().
// Also the route's ride/park pre-check (RIDE_RX, isInsidePark) is mirrored: such a place is recorded
// "not_run: ride_level" with no spend, exactly as the route writes RIDE-LEVEL without calling Anthropic.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { LedgerStateError } from "../lib/atlasBudget.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT); // lib/atlasCache.js reads docs/* relative to cwd
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

export const ALLOWED_HOSTS = Object.freeze(["api.anthropic.com", "geocoding.geo.census.gov"]);
export const FROZEN_FILES = Object.freeze(["lib/atlasWebLane.js", "lib/atlasVerify.js", "lib/atlasEditorial.js", "lib/atlasCache.js"]);
const DISNEY_RX = /disney|epcot|magic kingdom|hollywood studios|animal kingdom|typhoon lagoon|blizzard beach/i;
const FORBIDDEN_OUT = ["data", "app", "lib", "public", "supabase", ".git"];
// 120s: one call is a SERVER-SIDE tool loop (up to 3 searches + 3 fetches, several model iterations)
// and can legitimately run past a minute. A timeout leaves the attempt UNRESOLVED (full bound held),
// so a too-short limit costs budget and halts the run. The cron route keeps its own 48s (unchanged).
const CALL_TIMEOUT_MS = 120000;

export class PilotUsageError extends Error {
  constructor(msg) { super(msg); this.name = "PilotUsageError"; }
}
const need = (c, msg) => { if (!c) throw new PilotUsageError(msg); };

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
function realish(p) { // realpath of the nearest existing ancestor + the rest
  let cur = path.resolve(p); const rest = [];
  while (!fs.existsSync(cur)) { rest.unshift(path.basename(cur)); const up = path.dirname(cur); if (up === cur) break; cur = up; }
  return path.join(fs.realpathSync(cur), ...rest);
}
const inside = (child, parent) => { const r = path.relative(parent, child); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); };

export function checkOutDir(out, root = ROOT) {
  need(out, "missing --out <dir>");
  const real = realish(out), rroot = realish(root);
  need(real !== rroot && !FORBIDDEN_OUT.some((d) => inside(real, path.join(rroot, d))),
    `--out ${out} is inside the repo's protected paths (${FORBIDDEN_OUT.join(", ")}) or is the repo root; pick a directory outside the repo`);
  return real;
}
export function checkLedgerPath(file, root = ROOT) {
  need(file, "missing --ledger <path>");
  need(!inside(realish(file), realish(root)), `--ledger ${file} is inside the repo; the ledger must live outside it`);
  return path.resolve(file);
}

// seeded PRNG (mulberry32 over the first 32 bits of sha256(seed))
export function prng(seed) {
  let a = crypto.createHash("sha256").update(String(seed)).digest().readUInt32LE(0);
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffled = (arr, rnd) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export async function computeFrozenConfig(models) {
  const { buildAtlasSystemBlocks } = await imp("lib/atlasCache.js");
  const files = {};
  for (const f of FROZEN_FILES) files[f] = sha(fs.readFileSync(path.join(ROOT, f)));
  const systemPrompt = {};
  for (const m of models) systemPrompt[m] = sha(JSON.stringify(buildAtlasSystemBlocks(m).blocks));
  return { files, systemPrompt };
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function guardedFetch(inner) {
  return async (url, init) => {
    const host = new URL(String(url)).hostname;
    if (!ALLOWED_HOSTS.includes(host)) throw new Error(`atlas-pilot: refusing to contact host ${host}`);
    return inner(url, init);
  };
}

function mockAnthropic(dir) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const place = JSON.parse(body.messages[0].content.split("\n\n").pop());
    const f = fs.readdirSync(dir).find((n) => n.endsWith(`.${body.model}.json`) && JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")).placeName === place.name);
    if (!f) throw new Error(`mock: no fixture for ${place.name} / ${body.model}`);
    const fx = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    if (fx.throw) throw new Error(fx.throw);
    return { ok: fx.status >= 200 && fx.status < 300, status: fx.status, headers: { get: (h) => (h.toLowerCase() === "request-id" ? fx.requestId || null : null) }, json: async () => fx.body };
  };
}

// Pre-generation 4xx validation error (an error object): Anthropic does not bill invalid requests (ASSUMPTION).
const isValidationError = (status, body) => [400, 413, 422].includes(status) && body && body.type === "error" && body.error && body.error.type === "invalid_request_error";

// PAID RUNS ARE BLOCKED (owner, 2026-10-09). The owner's condition for any paid run is a
// provable maximum liability per request. The lane request uses Anthropic's server-side
// web_search/web_fetch loop: output is hard-capped by max_tokens, but the docs give NO cap on
// search result size or on loop iterations, and earlier loop context is billed again as input.
// The reserved bound in manifest.limits is therefore an assumption, not a maximum (DECISION.md
// section 7). Only --mock fixtures or an injected test fetch may run. Lifting this needs a
// bounded request design (no server tools, or a documented hard cap) and a code change here.
export const PAID_RUN_BLOCKED_REASON = "paid run blocked: the server-side search loop has no provable per-request maximum cost (docs/atlas-pilot-2026-10/DECISION.md section 7)";

export async function runPilot(opts) {
  const env = opts.env || process.env;
  need(opts.mock || opts.fetchImpl, PAID_RUN_BLOCKED_REASON);
  need(opts.confirmSpend, "missing flag --confirm-spend");
  const ledgerFile = checkLedgerPath(opts.ledger);
  const outDir = checkOutDir(opts.out);
  need(opts.mock || env.ANTHROPIC_API_KEY, "missing environment variable ANTHROPIC_API_KEY");
  const manifestPath = path.resolve(opts.manifest || path.join(ROOT, "docs/atlas-pilot-2026-10/manifest.json"));
  need(fs.existsSync(manifestPath), `missing manifest ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const B = await imp("lib/atlasBudget.js");
  const { FileLedger } = await imp("lib/atlasBudgetFileLedger.js");
  const L = await imp("lib/atlasWebLane.js");
  const { buildAtlasSystemBlocks, RIDE_RX } = await imp("lib/atlasCache.js");
  const { extractModelJson } = await imp("lib/atlasExtract.js");
  const { verifyAtlasEditorial, corpusOf } = await imp("lib/atlasVerify.js");
  const { editorialRow } = await imp("lib/atlasEditorial.js");
  const { isInsidePark } = await imp("lib/parkZones.js");

  need(manifest.pilotId, "manifest missing pilotId");
  need(manifest.priceVersion, "manifest missing priceVersion");
  need(B.KNOWN_PRICE_VERSIONS.includes(manifest.priceVersion), `unknown price version ${manifest.priceVersion}`);
  need(Number.isInteger(manifest.ceilingMicroUsd) && manifest.ceilingMicroUsd >= 0, "manifest missing ceilingMicroUsd");
  need(Array.isArray(manifest.models) && manifest.models.length === 2, "manifest models must list exactly 2 models");
  need(manifest.limits && manifest.retries === 0 && manifest.continuations === 0 && manifest.attemptsPerPlacePerModel === 1 && manifest.concurrency === 1, "manifest must have retries 0, continuations 0, attemptsPerPlacePerModel 1, concurrency 1, limits");
  need(Array.isArray(manifest.places) && manifest.places.length, "manifest missing places");
  for (const m of manifest.models) B.requestBound(m, manifest.limits, manifest.priceVersion); // throws on unknown model/version
  const bad = manifest.places.filter((p) => DISNEY_RX.test(p.name));
  need(!bad.length, `AGENTS.md section 7: Disney entity in manifest places: ${bad.map((p) => p.name).join(", ")}`);

  // frozen config
  const now = await computeFrozenConfig(manifest.models);
  const frozenOk = same(now, manifest.frozenConfig);
  need(frozenOk || opts.refreeze, "frozenConfig mismatch (lib/prompt changed since the manifest was frozen); re-review and pass --refreeze to run anyway");

  // place coordinates (manifest carries none)
  const coordsFile = opts.coords || (opts.mock && path.join(opts.mock, "coords.json"));
  need(coordsFile && fs.existsSync(coordsFile), "missing --coords <file> (JSON {placeId:{lat,lng,zip?,primary_type?}}): the manifest has no coordinates");
  const coords = JSON.parse(fs.readFileSync(coordsFile, "utf8"));
  for (const p of manifest.places) need(coords[p.place_id] && Number.isFinite(coords[p.place_id].lat) && Number.isFinite(coords[p.place_id].lng), `coords missing lat/lng for ${p.place_id}`);

  fs.mkdirSync(path.join(outDir, "raw"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "blind"), { recursive: true });

  const rawFetch = opts.mock ? mockAnthropic(opts.mock) : (opts.fetchImpl || ((u, i) => globalThis.fetch(u, i)));
  const censusFetch = opts.mock && fs.existsSync(path.join(opts.mock, "census.json"))
    ? (() => { const m = JSON.parse(fs.readFileSync(path.join(opts.mock, "census.json"), "utf8")); return async (url) => { const a = new URL(url).searchParams.get("address"); const g = m[a] || m["*"]; return { ok: !!g, json: async () => ({ result: { addressMatches: g ? [{ coordinates: { x: g.lng, y: g.lat } }] : [] } }) }; }; })()
    : (opts.fetchImpl || ((u, i) => globalThis.fetch(u, i)));
  const anthropicFetch = guardedFetch(rawFetch), geoFetch = guardedFetch(censusFetch);

  // Refuse a silent ledger reset: a NEW ledger file while --out already holds this pilot's summary.
  const priorSummary = path.join(outDir, "summary.json");
  if (!fs.existsSync(ledgerFile) && fs.existsSync(priorSummary) && !opts.newLedger) {
    let pid = null; try { pid = JSON.parse(fs.readFileSync(priorSummary, "utf8")).pilotId; } catch { /* unreadable summary: treat as same pilot */ pid = manifest.pilotId; }
    need(pid !== manifest.pilotId, `--ledger ${ledgerFile} is a NEW file but ${priorSummary} already exists for ${manifest.pilotId}; a fresh ledger would reset spend tracking. Point at the original ledger or pass --new-ledger`);
  }
  fs.mkdirSync(outDir, { recursive: true });
  const ledger = new FileLedger({ file: ledgerFile });
  try {
    if (opts.raiseCeiling !== undefined) {
      need(Number.isInteger(opts.raiseCeiling) && opts.raiseCeiling >= 0, "--raise-ceiling needs a non-negative integer micro-USD value");
      const r = await ledger.setBudget(manifest.pilotId, manifest.pilotId, opts.raiseCeiling, { allowRaise: true });
      console.log(`atlas-pilot: OPERATOR ceiling change ${r.old === null ? "(new)" : r.old} -> ${r.new} micro-USD`);
    } else {
      await ledger.setBudget(manifest.pilotId, manifest.pilotId, manifest.ceilingMicroUsd);
    }
  } catch (e) { if (e instanceof LedgerStateError) throw new PilotUsageError(e.message); throw e; }
  const budget = new B.Budget({ ledger, scope: manifest.pilotId, period: manifest.pilotId, priceVersion: manifest.priceVersion });

  const rnd = prng(manifest.pilotId);
  const order = manifest.places.map((p) => ({ place_id: p.place_id, models: shuffled(manifest.models, rnd) }));
  const blindOrder = manifest.places.map(() => shuffled(manifest.models, rnd)); // A/B assignment, separate draws
  const nowIso = (opts.now || new Date()).toISOString();
  const attempts = []; // one record per place x model
  let stopReason = null, stopDetail = null;
  const sysCache = {};

  for (let pi = 0; pi < manifest.places.length; pi++) {
    const mp = manifest.places[pi];
    const place = { ...coords[mp.place_id], place_id: mp.place_id, name: mp.name, category: mp.category, metro: mp.metro };
    for (const model of order[pi].models) {
      const rec = { place_id: mp.place_id, name: mp.name, model, status: null, category: null };
      attempts.push(rec);
      if (stopReason) { rec.status = "not_run"; rec.reason = stopReason; continue; }
      // Resume: look the attempt up BEFORE reserving.
      const attemptKey = `${manifest.pilotId}:${mp.place_id}:${model}`;
      const prior = await ledger.getAttempt(attemptKey);
      if (prior) {
        if (prior.state === "settled" || prior.state === "released") {
          const rawFile = path.join(outDir, "raw", `${mp.place_id}.${model}.json`);
          if (prior.state === "settled" && fs.existsSync(rawFile)) {
            const raw = JSON.parse(fs.readFileSync(rawFile, "utf8"));
            Object.assign(rec, raw.record, { status: "settled", skipped: "already_settled" });
            if (!rec.category || rec.category !== "provider_error") if (rec.category !== "incomplete") Object.assign(rec, await validate(raw.response, place));
          } else { rec.status = "skipped"; rec.reason = `already_${prior.state}`; rec.microUsd = prior.settledMicroUsd; }
        } else {
          rec.status = "not_run"; rec.reason = `unresolved_prior_attempt: ${attemptKey} is ${prior.state}; operator must reconcileAttempt first`;
          stopReason = "unresolved_prior_attempt"; stopDetail = attemptKey;
        }
        continue;
      }
      if (RIDE_RX.test(String(place.name || "")) || isInsidePark(place.lat, place.lng, place.name)) { rec.status = "not_run"; rec.reason = "ride_level"; continue; }

      const sys = (sysCache[model] ||= buildAtlasSystemBlocks(model));
      const body = L.laneRequestBody(place, model, sys.blocks, L.metroCity(place.metro));
      const call = async ({ signal }) => {
        const r = await anthropicFetch("https://api.anthropic.com/v1/messages", {
          method: "POST", signal, cache: "no-store",
          headers: { "x-api-key": env.ANTHROPIC_API_KEY || "mock", "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const requestId = r.headers && r.headers.get ? r.headers.get("request-id") : null;
        let json;
        try { json = await r.json(); } catch { throw new Error(`unparseable response body (http ${r.status})`); }
        if (!r.ok) {
          if (isValidationError(r.status, json)) {
            return { requestId, result: { httpStatus: r.status, providerError: json.error, json }, usage: { input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 0 } } };
          }
          throw new Error(`provider http ${r.status} ${(json && json.error && json.error.type) || ""}`); // -> unresolved
        }
        return { requestId, result: { httpStatus: r.status, json }, usage: json && json.usage, contentBlocks: Array.isArray(json && json.content) ? json.content : undefined };
      };
      const out = await B.runAttempt({
        budget, attemptKey, placeId: mp.place_id, model,
        limits: manifest.limits, call, timeoutMs: CALL_TIMEOUT_MS,
      });
      if (out.status === "rejected") {
        rec.status = "not_run"; rec.reason = out.reason === "over_ceiling" || out.reason === "halted" ? "budget" : out.reason; stopReason = rec.reason;
        continue;
      }
      if (out.status === "unresolved") { rec.status = "unresolved"; rec.reason = out.reason; stopReason = "unresolved_attempt"; continue; }
      rec.status = "settled"; rec.microUsd = out.microUsd; rec.overrun = out.overrun; rec.tier = out.tier;
      const json = out.result.json;
      rec.requestId = out.requestId || null; rec.stopReason = json && json.stop_reason || null; rec.modelReturned = json && json.model || null; rec.usage = json && json.usage || null;
      if (out.overrun) stopReason = "budget";
      if (out.result.providerError) { rec.category = "provider_error"; rec.providerError = out.result.providerError; }
      else if (rec.stopReason === "pause_turn") rec.category = "incomplete";
      else Object.assign(rec, await validate(json, place));
      fs.writeFileSync(path.join(outDir, "raw", `${mp.place_id}.${model}.json`), JSON.stringify({
        place_id: mp.place_id, model, request_id: rec.requestId, http_status: out.result.httpStatus, stop_reason: rec.stopReason,
        model_returned: rec.modelReturned, usage: rec.usage, settled_micro_usd: rec.microUsd, record: pick(rec), response: json,
      }, null, 2));
    }
  }

  // The route's lane block, in order, via lib functions only. Returns the validation record.
  async function validate(json, place) {
    const res = L.extractLaneResult(json);
    const v = { searches: res.searches, sources: res.fetched.map((f) => f.url), identity: [], verifierIssues: [], verified: false, category: null, parsed: null };
    const blocks = Array.isArray(json && json.content) ? json.content : [];
    const toolErr = blocks.some((b) => b && ((b.type === "web_fetch_tool_result" && b.content && b.content.type === "web_fetch_tool_error") || (b.type === "web_search_tool_result" && b.content && !Array.isArray(b.content) && b.content.type === "web_search_tool_result_error")));
    if (!res.fetched.length) { v.category = toolErr ? "tool_failure" : "insufficient_sources"; return v; }
    if (L.deniedFetched(res.fetched)) { v.category = "blocked_source"; return v; }
    const ext = extractModelJson(res.text);
    const lp = ext && ext.value;
    if (!lp) { v.category = "malformed_output"; return v; }
    if (lp.pending === true) { v.category = "insufficient_sources"; return v; }
    if (!lp.hook) { v.category = "malformed_output"; return v; }
    v.parsed = lp;
    const addr = typeof lp.found_address === "string" ? lp.found_address : null;
    const geo = addr ? await L.geocodeCensus(addr, geoFetch) : null;
    v.geo = geo;
    const idp = L.identityProblems(lp, res.fetched, place, geo);
    const dash = L.dashProblems(lp).map((x) => (x.split(":")[0] === "dash" ? "dash" : x));
    const ver = verifyAtlasEditorial(lp, corpusOf({ name: place.name }, res.fetched), res.fetched.map((f) => f.url));
    v.identity = idp; v.verifierIssues = ver.map((p) => `${p.check}:${p.field}:${p.value}`.slice(0, 90));
    const issues = [...idp.map((x) => "identity:" + x), ...dash, ...v.verifierIssues];
    const row = editorialRow(place, lp, nowIso, issues.length ? ["FAILED VERIFICATION", ...issues.slice(0, 8)] : null);
    v.verified = row.verified === true; v.rowIssues = row.issues;
    if (!v.verified) {
      const all = row.issues || [];
      v.category = idp.length ? "wrong_place"
        : ver.some((p) => /^(unsourced|invented)/.test(p.check)) ? "unsupported_claim"
        : dash.length ? "dash"
        : all.includes("no-sourced-facts") ? "insufficient_sources"
        : "malformed_output";
    }
    return v;
  }

  const totals = await ledger.totals(manifest.pilotId, manifest.pilotId);

  // ---- blind packet + mapping
  const byKey = new Map(attempts.map((a) => [`${a.place_id}|${a.model}`, a]));
  const packet = [], mapping = [], incompletePairs = [];
  manifest.places.forEach((mp, i) => {
    const pair = blindOrder[i].map((m) => byKey.get(`${mp.place_id}|${m}`));
    if (pair.some((a) => !a || a.status !== "settled")) { incompletePairs.push(mp.place_id); return; }
    packet.push({ place_id: mp.place_id, name: mp.name, category: mp.category, metro: mp.metro,
      A: blindOutput(pair[0]), B: blindOutput(pair[1]) });
    mapping.push({ place_id: mp.place_id, A: pair[0].model, B: pair[1].model, reasons: { A: pair[0].parsed ? null : pair[0].category, B: pair[1].parsed ? null : pair[1].category } });
  });
  function blindOutput(a) {
    const p = a.parsed;
    return p ? { status: "output", hook: p.hook || null, why_here: p.why_here || null, know_before: p.know_before || null, best_time: p.best_time || null, local_tip: p.local_tip || null, facts: (p.facts || []).map((f) => ({ claim: f.claim, source: f.source })), sources_fetched: a.sources }
      : { status: "no_output" };
  }
  fs.writeFileSync(path.join(outDir, "blind", "packet.json"), JSON.stringify({ pilotId: manifest.pilotId, items: packet }, null, 2));
  fs.writeFileSync(path.join(outDir, "blind", "mapping.json"), JSON.stringify({ pilotId: manifest.pilotId, mapping }, null, 2));

  // ---- summary
  const perModel = {};
  for (const m of manifest.models) {
    const rows = attempts.filter((a) => a.model === m);
    const cats = {};
    for (const a of rows) if (a.status === "settled" && !a.verified) cats[a.category] = (cats[a.category] || 0) + 1;
    perModel[m] = {
      attempts: rows.filter((a) => a.status === "settled" || a.status === "unresolved").length,
      settled: rows.filter((a) => a.status === "settled").length,
      accepted: rows.filter((a) => a.verified === true).length,
      failureCategories: cats,
      settledMicroUsd: rows.reduce((s, a) => s + (a.status === "settled" ? a.microUsd : 0), 0),
      unresolved: rows.filter((a) => a.status === "unresolved").length,
      notRun: rows.filter((a) => a.status === "not_run").map((a) => ({ place_id: a.place_id, reason: a.reason })),
    };
  }
  const summary = {
    pilotId: manifest.pilotId, priceVersion: manifest.priceVersion, ceilingMicroUsd: manifest.ceilingMicroUsd,
    frozenConfigMatched: frozenOk, refrozen: !frozenOk, stoppedBecause: stopReason, stoppedDetail: stopDetail, ledgerTotals: totals,
    executionOrder: order, incompletePairs, perModel,
    attempts: attempts.map(pick),
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  return summary;
}
function pick(a) {
  const { parsed, geo, ...rest } = a; // parsed output lives in raw/ and blind/
  return rest;
}

function parseArgs(argv) {
  const o = {}; const val = (i) => { need(i + 1 < argv.length && !argv[i + 1].startsWith("--"), `flag ${argv[i]} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--confirm-spend") o.confirmSpend = true;
    else if (a === "--refreeze") o.refreeze = true;
    else if (a === "--ledger") o.ledger = val(i++);
    else if (a === "--out") o.out = val(i++);
    else if (a === "--manifest") o.manifest = val(i++);
    else if (a === "--coords") o.coords = val(i++);
    else if (a === "--mock") o.mock = val(i++);
    else if (a === "--new-ledger") o.newLedger = true;
    else if (a === "--raise-ceiling") { o.raiseCeiling = Number(val(i++)); }
    else if (a === "--print-frozen") o.printFrozen = true;
    else throw new PilotUsageError(`unknown flag ${a}`);
  }
  return o;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseArgs(process.argv.slice(2));
    if (o.printFrozen) {
      const m = JSON.parse(fs.readFileSync(path.resolve(o.manifest || "docs/atlas-pilot-2026-10/manifest.json"), "utf8"));
      console.log(JSON.stringify(await computeFrozenConfig(m.models), null, 2));
    } else {
      const s = await runPilot(o);
      console.log(`atlas-pilot: done. stopped=${s.stoppedBecause || "no"} settled=${Object.values(s.perModel).map((x) => x.settledMicroUsd).join("+")} micro-USD; outputs in ${o.out}`);
    }
  } catch (e) {
    console.error(`atlas-pilot: ${e.name === "PilotUsageError" ? "REFUSED" : "ERROR"} - ${e.message}`);
    process.exit(2);
  }
}
