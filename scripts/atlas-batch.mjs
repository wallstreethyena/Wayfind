#!/usr/bin/env node
// scripts/atlas-batch.mjs — OPERATOR-RUN Atlas editorial backfill via the
// Anthropic Batch API. NOT a cron (vercel.json never calls this) — the owner
// runs it by hand, on purpose, because it can spend real money.
//
// WO-D-atlas-cache-batch (owner, 2026-09-04): "Turn both on" — prompt caching
// AND the Batch API. This is the batch half. Five rules, all load-bearing:
//
//   1. THE NO-RE-BUY LAW (lib/ownedLibrary.js, docs/proposals/... this repo's
//      binding law as of 2026-09-03): `details_enterprise` sits at 950/950
//      until Oct 1 — Atlas cannot buy a single fresh Google Details call
//      until then. So the DEFAULT candidate set here is OWNED-DATA-ONLY:
//      wf_inventory already carries name, category, primary_type, rating and
//      reviews for every promoted place (lib/promoteDetails.hasIndexRating is
//      the exact predicate the promotion pipeline itself uses to decide
//      "do we already have a usable signal"). A place without an owned
//      rating cannot be written honestly from what we own — the standard
//      forbids inventing hours/address/website copy we never fetched — and
//      is reported separately as "must wait for Google" rather than forced
//      through with thin, generic prose. This file adds ZERO new Google
//      calls, ever — selection reads wf_inventory only, and the Google Maps
//      URL every card cites is CONSTRUCTED from place_id, never fetched.
//
//   2. THE CACHE IS SHARED, NOT RE-DERIVED. lib/atlasCache.js builds the same
//      [inlined atlas-590-v1 standard, JSON-shape/voice rules] system blocks
//      the interactive route sends, so this path and the trickle path can
//      never disagree about what "the standard" says. ATLAS_BATCH_MODEL
//      (default claude-sonnet-5) is a SEPARATE override from the trickle
//      path's ATLAS_MODEL (default claude-haiku-4-5) precisely so this path
//      can clear the 1,024-token cache minimum without changing what the
//      hourly cron does.
//
//   3. ZERO VALIDATION RELIEF. Every result — cached or not, owned-only or
//      not — is fed through the EXACT SAME lib/atlasVerify.verifyAtlasEditorial
//      + lib/atlasEditorial.editorialRow the live route uses (imported, not
//      re-implemented). An invented claim is rejected here exactly as it
//      would be on the trickle path. See validateBatchResult() below.
//
//   4. RESUMABLE, NEVER A DOUBLE-WRITE. Selection excludes any place_id that
//      already has a wf_editorial row (same predicate as wf_atlas_missing:
//      "no row at all", not "no PUBLISHED row" — a place mid-retry is a
//      different queue). The write step upserts with
//      Prefer: resolution=ignore-duplicates, on_conflict=place_id — the
//      SAME idempotent shape the live build path already uses, so re-running
//      this script (even against overlapping candidates, even re-processing
//      the same batch's results twice) can never overwrite an existing row.
//      In-flight batch state (batch id, submitted custom_ids) is persisted
//      to a local JSON file (--state, default .atlas-batch-state.<tag>.json)
//      so a crash between submit and poll does not orphan a paid batch —
//      `--resume <batch_id>` picks the poll back up without resubmitting.
//
//   5. NEVER SPENDS WITHOUT --confirm. Default invocation (no --confirm, no
//      --resume) selects candidates, builds real request bodies, computes a
//      REAL token-based cost estimate, prints it, and exits 0 having made
//      ZERO calls to api.anthropic.com. `--confirm` is required to submit;
//      `--resume <id>` is required to poll/write an already-submitted batch.
//      This session runs the DEFAULT (estimate-only) mode and stops there —
//      spending is the owner's call, not this script's or this run's.
//
// USAGE
//   node scripts/atlas-batch.mjs [--limit N] [--category C] [--metro M]
//     --limit     max candidates to submit (default 500, hard cap 5000/run —
//                 well under the Batch API's 100k-request/256MB ceiling; kept
//                 small deliberately so one run's cost estimate stays legible)
//     --category  restrict to one CATS entry (default: all six, owner order)
//     --metro     restrict to one METROS entry (default: all three)
//     --confirm   actually submit the batch (SPENDS MONEY). Refused without it.
//     --resume <batch_id>   poll + write results for an already-submitted batch
//     --state <path>        state file path (default .atlas-batch-state.<tag>.json)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { hasIndexRating } from "../lib/promoteDetails.js";
import { buildAtlasSystemBlocks, resolveAtlasBatchModel, RIDE_RX, estimateTokens } from "../lib/atlasCache.js";
import { verifyAtlasEditorial, corpusOf } from "../lib/atlasVerify.js";
import { editorialRow } from "../lib/atlasEditorial.js";
import { extractModelJson } from "../lib/atlasExtract.js";
import { isInsidePark } from "../lib/parkZones.js";

// Same universe the live route works, in the same owner order (lib/atlasCache
// does not own this list — it is a ROLLOUT SCHEDULE, not a shared constant,
// and the two paths are allowed to pick different subsets of it via --category).
export const CATS = ["food", "attractions", "beach", "nightlife", "hotels", "shopping"];
export const METROS = ["tampa", "orlando", "manatee-sarasota"];

// The metro itself is OWNED (it's Wayfind's own regional bucket for the row,
// not a fetched fact), so an owned-only card is allowed to state it. Same
// display strings as lib/trendTaxonomy.js's (private) METRO_QUERY_NAME —
// duplicated rather than imported so this file never depends on a module
// that makes its own Google Places calls elsewhere.
export const METRO_LABEL = { tampa: "Tampa, Florida", orlando: "Orlando, Florida", "manatee-sarasota": "Sarasota, Florida" };

export const DEFAULT_LIMIT = 500;
export const HARD_LIMIT = 5000; // this script's own ceiling, well under Batch API's 100k/256MB

// ── credentials ──────────────────────────────────────────────────────────
// Same fallback shape as scripts/report-editorial-coverage.mjs: env first,
// then .env.local (so a local run doesn't need the vars exported by hand).
function readDotEnvLocal(key) {
  try {
    const f = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const g = (k) => (f.match(new RegExp("^" + k + "=(.*)$", "m")) || [])[1]?.trim().replace(/^["']|["']$/g, "") || "";
    return g(key);
  } catch (e) { return ""; }
}
export function dbEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || readDotEnvLocal("NEXT_PUBLIC_SUPABASE_URL") || readDotEnvLocal("SUPABASE_URL");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || readDotEnvLocal("SUPABASE_SERVICE_ROLE_KEY") || readDotEnvLocal("SUPABASE_SERVICE_KEY");
  return url && key ? { url: String(url).replace(/\/+$/, ""), key } : null;
}
export function anthropicKey() {
  return (process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY || readDotEnvLocal("ANTHROPIC_API_KEY") || "").trim();
}

// ── CLI ──────────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const out = { limit: DEFAULT_LIMIT, category: "", metro: "", confirm: false, resume: null, state: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = Math.max(1, Math.min(HARD_LIMIT, parseInt(argv[++i], 10) || DEFAULT_LIMIT));
    else if (a === "--category") out.category = String(argv[++i] || "").trim();
    else if (a === "--metro") out.metro = String(argv[++i] || "").trim();
    else if (a === "--confirm") out.confirm = true;
    else if (a === "--resume") out.resume = String(argv[++i] || "").trim();
    else if (a === "--state") out.state = String(argv[++i] || "").trim();
  }
  return out;
}

/** No --confirm, no spend. The one gate this whole script exists to enforce. */
export function mayProceed(args) { return !!(args && args.confirm === true); }

function stateFilePath(args) {
  if (args.state) return path.resolve(args.state);
  const tag = [args.category || "all", args.metro || "all"].join("-");
  return path.resolve(`.atlas-batch-state.${tag}.json`);
}

// ── candidate selection (owned-data-only, per the no-re-buy law) ──────────

/**
 * Is a wf_inventory row writable from OWNED data alone, per this file's
 * definition? Reuses lib/promoteDetails.hasIndexRating — the SAME predicate
 * promotion itself uses to decide "do we already own a usable signal" —
 * rather than inventing a second threshold. A place with no owned rating has
 * nothing numeric to translate (editorial-standard.md's core law: "translate
 * the numbers, never recite them") and no address/hours/website to draw a
 * grounded why_here from; it goes in the must-wait-for-Google bucket.
 */
export function classifyCandidate(row) {
  const signals = row && row.signals;
  if (hasIndexRating(signals)) return { ownedOnly: true, reason: null };
  return { ownedOnly: false, reason: "no owned rating/review signal — needs a Google Details call" };
}

/** Ride-level / in-park rows never get their own card, owned-only or not. */
export function isRideOrParkRow(row) {
  if (!row) return false;
  if (RIDE_RX.test(String(row.name || ""))) return true;
  if (typeof row.lat === "number" && typeof row.lng === "number" && isInsidePark(row.lat, row.lng, row.name)) return true;
  return false;
}

/**
 * A Google Maps deep link BUILT from place_id — Google's documented
 * "Place ID" URL scheme, zero API calls. This is the only "source" an
 * owned-only card can cite; every number it backs (rating/reviews) is data
 * we already own, not a claim about content we never fetched.
 */
export function mapsUrlForPlaceId(place_id, name) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name || "")}&query_place_id=${encodeURIComponent(place_id)}`;
}

/**
 * The per-place ctx for an OWNED-ONLY call — same field NAMES the live path
 * uses (so corpusOf/verifyAtlasEditorial behave identically), with every
 * field the promotion pipeline never bought (a street address, website,
 * hours, google_summary, official_page_text) left null — the standard
 * already says omit rather than invent, and leaving these null is that rule
 * applied at the context-assembly layer, not just the model's. `address` is
 * the one exception: it carries the METRO label only ("Tampa, Florida"),
 * never a street address — the metro is Wayfind's own regional bucket for
 * the row, genuinely owned, not fetched, and giving the model a sourced way
 * to say WHERE a place is (without a specific street it does not have) is
 * the difference between a card that can pass verifyAtlasEditorial's
 * unsourced-entity check on the city name and one that cannot mention its
 * own city at all.
 */
export function buildOwnedCtx(row) {
  const sig = row.signals || {};
  return {
    name: row.name,
    category: row.category,
    address: METRO_LABEL[row.metro] || null,
    website: null,
    google_maps_url: mapsUrlForPlaceId(row.place_id, row.name),
    rating: typeof sig.rating === "number" ? sig.rating : null,
    reviews: typeof sig.reviews === "number" ? sig.reviews : null,
    hours: null,
    google_summary: null,
    types: [row.primary_type, row.category].filter(Boolean),
    price_level: typeof sig.priceNum === "number" ? sig.priceNum : null,
    official_page_text: null,
  };
}

const USER_INSTRUCTION = "Write the atlas-590-v1 editorial for this place. Source every claim from the website or Google Maps URL provided; invent nothing.\n\n";

/** One Anthropic Batch API request object for `row`. Pure — no network. */
export function buildBatchRequestParams(row, model, systemBlocks) {
  const ctx = buildOwnedCtx(row);
  return {
    custom_id: row.place_id,
    params: {
      model, max_tokens: 700, temperature: 0.4, system: systemBlocks,
      messages: [{ role: "user", content: USER_INSTRUCTION + JSON.stringify(ctx) }],
    },
  };
}

/** Token accounting for one built request — real numbers, not a guess. */
export function estimateRequestTokens(reqParams) {
  const systemText = (Array.isArray(reqParams.system) ? reqParams.system : [{ text: String(reqParams.system || "") }])
    .map((b) => b.text).join("\n\n");
  const userText = reqParams.messages.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n");
  return { systemTokens: estimateTokens(systemText), userTokens: estimateTokens(userText) };
}

// ── cost estimate ───────────────────────────────────────────────────────
// Rates are NOT a verified fact of this session (WO-D-atlas-cache-batch gave
// token-cache economics — write 2x/read 0.1x/batch 50% — but no live $/MTok
// figure) — env-overridable, defaulted to the long-standing Sonnet-class
// anchor ($3 in / $15 out per MTok), and the estimate says so loudly so a
// stale default is never mistaken for a verified price.
const DEFAULT_INPUT_RATE_PER_MTOK = Number(process.env.ATLAS_BATCH_INPUT_RATE_PER_MTOK || 3);
const DEFAULT_OUTPUT_RATE_PER_MTOK = Number(process.env.ATLAS_BATCH_OUTPUT_RATE_PER_MTOK || 15);

/**
 * @param {object} p
 * @param {number} p.count           number of requests in the batch
 * @param {number} p.systemTokens    the shared, byte-identical prefix's token count
 * @param {number} p.userTokensTotal sum of every request's unique user-message tokens
 * @param {number} p.maxTokens       max_tokens per request (an UPPER BOUND on output)
 * @param {boolean} p.cacheEligible  whether cache_control is actually attached
 * @param {{inputPerMTok:number, outputPerMTok:number}} [p.rates]
 */
export function estimateBatchCost({ count, systemTokens, userTokensTotal, maxTokens, cacheEligible, rates }) {
  const inputRate = (rates && rates.inputPerMTok) ?? DEFAULT_INPUT_RATE_PER_MTOK;
  const outputRate = (rates && rates.outputPerMTok) ?? DEFAULT_OUTPUT_RATE_PER_MTOK;
  // System-prefix billing, best-effort cache hits (WO-verified: writes 2x
  // base, reads 0.1x base; caching + batch discounts STACK):
  //   eligible:    1 write (2x) + (count-1) reads (0.1x)
  //   ineligible:  `count` ordinary reads (1x) — cache_control is not attached at all
  const systemTokenCostUnits = cacheEligible
    ? systemTokens * 2 + systemTokens * 0.1 * Math.max(0, count - 1)
    : systemTokens * count;
  const inputTokenUnitsBeforeBatch = systemTokenCostUnits + userTokensTotal;
  const outputTokenUnitsBeforeBatch = maxTokens * count;
  // Batch API: 50% off whatever the token-class rate would otherwise be.
  const inputCost = 0.5 * (inputTokenUnitsBeforeBatch / 1_000_000) * inputRate;
  const outputCostUpperBound = 0.5 * (outputTokenUnitsBeforeBatch / 1_000_000) * outputRate;
  return {
    count, systemTokens, userTokensTotal, maxTokens, cacheEligible,
    inputRate, outputRate,
    inputTokenUnitsBeforeBatch, outputTokenUnitsBeforeBatch,
    inputCostUsd: inputCost, outputCostUsdUpperBound: outputCostUpperBound,
    totalCostUsdUpperBound: inputCost + outputCostUpperBound,
  };
}

// ── validation (ZERO relief — the same functions the live path calls) ────

/**
 * Run one batch result through the EXACT SAME honesty gate the interactive
 * route uses. No batch-specific bypass exists anywhere in this file — this
 * function IS lib/atlasVerify.verifyAtlasEditorial, called with the corpus
 * built the same way (lib/atlasVerify.corpusOf), on the allowed-source list
 * this row actually had available (the constructed Google Maps URL, and
 * nothing else, for an owned-only row).
 */
export function validateBatchResult(parsed, ctx, allowedUrls) {
  const corpus = corpusOf(ctx, []);
  return verifyAtlasEditorial(parsed, corpus, allowedUrls);
}

// ── main (real I/O — not exercised by the guard) ──────────────────────────

async function fetchAllInventory(env, metros) {
  const r = await fetch(`${env.url}/rest/v1/wf_inventory?metro=in.(${metros.join(",")})&select=place_id,name,category,primary_type,metro,status,lat,lng,signals&limit=50000`, {
    headers: { apikey: env.key, authorization: "Bearer " + env.key, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`wf_inventory select ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function fetchAllEditorialIds(env) {
  const r = await fetch(`${env.url}/rest/v1/wf_editorial?select=place_id&limit=50000`, {
    headers: { apikey: env.key, authorization: "Bearer " + env.key, accept: "application/json" },
  });
  if (!r.ok) throw new Error(`wf_editorial select ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/**
 * The full split: missing-editorial rows in the target universe, partitioned
 * into owned-only-writable vs must-wait-for-Google, ride/park rows counted
 * separately (never either bucket). Real DB read, zero writes, zero spend.
 */
export async function selectCandidates(env, { category, metro } = {}) {
  const cats = category ? [category] : CATS;
  const metros = metro ? [metro] : METROS;
  const [inv, eds] = await Promise.all([fetchAllInventory(env, metros), fetchAllEditorialIds(env)]);
  const hasEditorial = new Set(eds.map((e) => e.place_id));
  const missing = inv.filter((r) => r.status === "OPERATIONAL" && cats.includes(r.category) && !hasEditorial.has(r.place_id));
  const rides = missing.filter(isRideOrParkRow);
  const real = missing.filter((r) => !isRideOrParkRow(r));
  const ownedOnly = real.filter((r) => classifyCandidate(r).ownedOnly);
  const needsGoogle = real.filter((r) => !classifyCandidate(r).ownedOnly);
  return { totalMissing: missing.length, rides: rides.length, ownedOnly, needsGoogle };
}

function printEstimate(sel, model, sysInfo, limit, scope) {
  const chosen = sel.ownedOnly.slice(0, limit);
  console.log(`\natlas-batch — candidate universe (${scope || "category=all metro=all"})`);
  console.log(`  missing-editorial (operational, in-scope):      ${sel.totalMissing}`);
  console.log(`    ride/park-level (skipped, never either bucket): ${sel.rides}`);
  console.log(`    writable OWNED-ONLY (no Google call needed):    ${sel.ownedOnly.length}`);
  console.log(`    must WAIT FOR GOOGLE (no owned rating signal):  ${sel.needsGoogle.length}`);
  console.log(`  this run would submit: ${chosen.length} of ${sel.ownedOnly.length} owned-only candidates (--limit ${limit})\n`);

  console.log(`model: ${model}  cacheEligible=${sysInfo.eligible}  prefix_tokens=${sysInfo.tokens}  model_minimum=${sysInfo.min}`);
  if (sysInfo.reason) console.log(`  ${sysInfo.reason}`);

  if (!chosen.length) {
    console.log("\nno owned-only candidates to estimate — nothing would be submitted.");
    return null;
  }
  const reqs = chosen.map((row) => buildBatchRequestParams(row, model, sysInfo.blocks));
  const tokenCounts = reqs.map(estimateRequestTokens);
  const userTokensTotal = tokenCounts.reduce((s, t) => s + t.userTokens, 0);
  const systemTokens = tokenCounts[0].systemTokens; // byte-identical across every request — see lib/atlasCache
  const cost = estimateBatchCost({
    count: chosen.length, systemTokens, userTokensTotal, maxTokens: 700, cacheEligible: sysInfo.eligible,
  });
  console.log(`\ntoken math (real, from ${chosen.length} constructed requests):`);
  console.log(`  shared system prefix:        ${cost.systemTokens} tokens (byte-identical every request)`);
  console.log(`  per-place user messages sum: ${cost.userTokensTotal} tokens (avg ${(cost.userTokensTotal / chosen.length).toFixed(1)}/request)`);
  console.log(`  output cap (max_tokens):     700/request x ${chosen.length} = ${cost.outputTokenUnitsBeforeBatch} tokens (UPPER BOUND, not an average)`);
  console.log(`  cache billing: ${cost.cacheEligible ? "1 write (2x) + " + (chosen.length - 1) + " best-effort reads (0.1x)" : "NOT attached — every request pays the plain input rate"}`);
  console.log(`  batch discount: 50% off every component above (stacks with caching, per Anthropic docs)\n`);
  console.log(`cost estimate (rates ASSUMED at $${cost.inputRate}/MTok in, $${cost.outputRate}/MTok out — NOT independently verified this session; VERIFY against https://www.anthropic.com/pricing before trusting the dollar figure; the token counts above are exact):`);
  console.log(`  input:  $${cost.inputCostUsd.toFixed(4)}`);
  console.log(`  output: $${cost.outputCostUsdUpperBound.toFixed(4)} (upper bound)`);
  console.log(`  TOTAL:  $${cost.totalCostUsdUpperBound.toFixed(4)} (upper bound)\n`);
  return { chosen, reqs, cost };
}

async function submitBatch(reqs) {
  const key = anthropicKey();
  if (!key) throw new Error("ANTHROPIC_API_KEY (or LLM_API_KEY) not set — cannot submit");
  const body = { requests: reqs };
  const r = await fetch("https://api.anthropic.com/v1/messages/batches", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`batch submit ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

async function pollBatch(batchId) {
  const key = anthropicKey();
  if (!key) throw new Error("ANTHROPIC_API_KEY (or LLM_API_KEY) not set — cannot poll");
  for (;;) {
    const r = await fetch(`https://api.anthropic.com/v1/messages/batches/${encodeURIComponent(batchId)}`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (!r.ok) throw new Error(`batch poll ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    console.log(`[atlas-batch] ${batchId}: ${j.processing_status} — ${JSON.stringify(j.request_counts || {})}`);
    if (j.processing_status === "ended") return j;
    await new Promise((res) => setTimeout(res, 30000));
  }
}

async function writeResults(env, batchJson, byId) {
  const key = anthropicKey();
  const r = await fetch(batchJson.results_url, { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } });
  if (!r.ok) throw new Error(`results fetch ${r.status}`);
  const text = await r.text();
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rows = [];
  let ok = 0, rejected = 0, errored = 0;
  const nowIso = new Date().toISOString();
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch (e) { continue; }
    const row = byId.get(rec.custom_id);
    if (!row) continue;
    if (!rec.result || rec.result.type !== "succeeded") { errored++; continue; }
    const txt = (rec.result.message && rec.result.message.content && rec.result.message.content[0] && rec.result.message.content[0].text) || "";
    const ext = extractModelJson(txt);
    if (!ext || !ext.value || ext.value.pending === true || !ext.value.hook) { rejected++; continue; }
    const ctx = buildOwnedCtx(row);
    const problems = validateBatchResult(ext.value, ctx, [ctx.google_maps_url]);
    if (problems.length) { rejected++; continue; }
    ok++;
    rows.push(editorialRow({ place_id: row.place_id }, ext.value, nowIso, null));
  }
  if (rows.length) {
    const h = { apikey: env.key, Authorization: `Bearer ${env.key}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" };
    const wr = await fetch(`${env.url}/rest/v1/wf_editorial?on_conflict=place_id`, { method: "POST", headers: h, body: JSON.stringify(rows) });
    if (!wr.ok) throw new Error(`upsert ${wr.status}: ${(await wr.text()).slice(0, 200)}`);
  }
  return { ok, rejected, errored, written: rows.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const model = resolveAtlasBatchModel();
  const sysInfo = buildAtlasSystemBlocks(model);

  if (args.resume) {
    const env = dbEnv();
    if (!env) { console.error("atlas-batch: no Supabase credentials — cannot write results."); process.exit(2); }
    const statePath = stateFilePath(args);
    if (!existsSync(statePath)) { console.error(`atlas-batch: no state file at ${statePath} — cannot reconcile custom_ids for ${args.resume}`); process.exit(2); }
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    const byId = new Map(state.rows.map((r) => [r.place_id, r]));
    const batchJson = await pollBatch(args.resume);
    if (batchJson.processing_status !== "ended" || !batchJson.results_url) {
      console.log("atlas-batch: batch ended without a results_url — nothing to write."); return;
    }
    const summary = await writeResults(env, batchJson, byId);
    console.log(`atlas-batch: resume complete — published=${summary.ok} rejected=${summary.rejected} errored=${summary.errored} written=${summary.written}`);
    return;
  }

  const env = dbEnv();
  if (!env) {
    console.error("atlas-batch: no Supabase credentials (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) — cannot select candidates.");
    console.error("Refusing to print an estimate built on data I could not read.");
    process.exit(2);
  }
  const sel = await selectCandidates(env, { category: args.category, metro: args.metro });
  const scope = `category=${args.category || "all"} metro=${args.metro || "all"}`;
  const est = printEstimate(sel, model, sysInfo, args.limit, scope);

  if (!mayProceed(args)) {
    console.log("atlas-batch: dry run only (no --confirm) — nothing submitted, $0 spent.");
    return;
  }
  if (!est || !est.chosen.length) {
    console.log("atlas-batch: --confirm given but nothing to submit."); return;
  }
  console.log(`atlas-batch: --confirm given — submitting ${est.reqs.length} requests…`);
  const batchJson = await submitBatch(est.reqs);
  const statePath = stateFilePath(args);
  writeFileSync(statePath, JSON.stringify({ batchId: batchJson.id, submittedAt: new Date().toISOString(), rows: est.chosen }, null, 2));
  console.log(`atlas-batch: submitted ${batchJson.id} — state saved to ${statePath}`);
  console.log(`atlas-batch: resume with: node scripts/atlas-batch.mjs --resume ${batchJson.id} --state ${statePath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error("atlas-batch: FAILED —", e && e.message); process.exit(1); });
}
