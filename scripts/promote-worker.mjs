#!/usr/bin/env node
// scripts/promote-worker.mjs — drain wf_promotion_queue into wf_inventory NOW.
//
// THE SAME JOB AS /api/cron/promote-index, run from a terminal. The cron drains
// at ~600 places/day and only starts after a deploy; the initial backlog is
// 4,732 places across the four served metros, so this exists to clear it in one
// sitting and then let the hourly cron keep up with the trickle.
//
// NOT A SECOND IMPLEMENTATION. Same claim RPC, same decidePromotion() verdict,
// same idempotent merge-duplicates upsert, same queue settlement — it imports
// lib/promoteIndex.js exactly as the route does. Two write paths with two
// validators is how a bad row gets in.
//
// USAGE
//   vercel env pull .env.local          # the key must be current; see below
//   node scripts/promote-worker.mjs --metro manatee-sarasota --limit 2000
//
//   --metro <key>       any ACTIVE metro in wf_promote_metros (default: all).
//                        Fetched live at run start; falls back to the static
//                        PROMOTE_METROS four (manatee-sarasota, tampa,
//                        st-pete, orlando) only if that fetch fails.
//   --limit <n>         max places THIS run (default 100). Cost = n x $0.017.
//   --batch <n>         claim size per cycle. Clamped to the LIVE wf_promote_config
//                        batch_limit (default: that value, currently self-tuned
//                        5..50 by the cron — see lib/promoteThrottle.js); falls
//                        back to a static 25 if the config table is unreachable.
//   --concurrency <n>   parallel Place Details calls, <=10 (default 6)
//
// IDEMPOTENT AND RESUMABLE. Places are claimed under a 15-minute lease with
// FOR UPDATE SKIP LOCKED, so Ctrl-C is safe: whatever was in flight returns to
// pending when the lease expires, and a rerun picks up where this stopped. It
// never deletes and never writes a place twice.
//
// CREDENTIALS. Reads .env.local and never prints a value. If SUPABASE_SERVICE_ROLE_KEY
// is a legacy JWT (eyJ...) every call 401s — those keys were disabled on this
// project 2026-07-16. scripts/check-supabase-key-live.mjs catches that at build
// time; `vercel env pull .env.local` is the fix.
import { readFileSync, appendFileSync } from "node:fs";
import { decidePromotion, dedupeById, PROMOTE_METROS, metrosFromRows } from "../lib/promoteIndex.js";
import { clampBatchLimit } from "../lib/promoteThrottle.js";
import { CORE_DETAILS_MASK, PROMOTE_SKU, withIndexSignals } from "../lib/promoteDetails.js";

// ── env (never logged) ──────────────────────────────────────────────────────
const ENV = {};
for (const line of readFileSync(process.env.WF_ENV_FILE || new URL("../.env.local", import.meta.url).pathname, "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m) ENV[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const SB_URL = (ENV.SUPABASE_URL || ENV.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SB_KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
const G_KEY = ENV.GOOGLE_MAPS_SERVER_KEY;
for (const [k, v] of [["SUPABASE_URL", SB_URL], ["SUPABASE_SERVICE_ROLE_KEY", SB_KEY], ["GOOGLE_MAPS_SERVER_KEY", G_KEY]]) {
  if (!v) { console.error(`missing ${k}`); process.exit(1); }
}
// PREFLIGHT. A legacy JWT service_role key is PRESENT, well-formed, and dead —
// Supabase disabled those on this project 2026-07-16, and every call returns a
// bare 401 whose cause is not obvious from the stack trace. Say it here, once,
// before spending anything at Google. (scripts/check-supabase-key-live.mjs is
// the build-time half of the same check.)
if (/^\[?SENSITIVE\]?$/i.test(SB_KEY.trim())) {
  console.error('SUPABASE_SERVICE_ROLE_KEY is the literal string "[SENSITIVE]", not a key.');
  console.error("The var is flagged Sensitive in Vercel, so `vercel env pull` cannot read it back");
  console.error("and writes that placeholder instead — pulling again will never fix it.");
  console.error("Fix: Supabase -> Settings -> API Keys -> create an sb_secret_ key, then set");
  console.error("SUPABASE_SERVICE_ROLE_KEY locally and in Vercel (all environments).");
  process.exit(1);
}
if (/^eyJ[A-Za-z0-9_-]/.test(SB_KEY)) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is a LEGACY JWT key. Legacy anon/service_role keys were");
  console.error("disabled on this Supabase project on 2026-07-16 — every request will 401.");
  console.error("Fix: `vercel env pull .env.local`, or mint a new sb_secret_ key in");
  console.error("Supabase Settings -> API Keys and set it in Vercel and locally.");
  process.exit(1);
}

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const METRO = argOf("--metro", null);
const TOTAL = Math.max(1, parseInt(argOf("--limit", "100"), 10));
const BATCH_ARG = argOf("--batch", null); // clamped against the live config below, once fetched
const CONC = Math.max(1, Math.min(parseInt(argOf("--concurrency", "6"), 10), 10));
const AUDIT = argOf("--audit", "/home/claude/wf-worker/audit.jsonl");
const COST_PER = 0.017;

// The SAME Pro-tier core mask as the cron — see lib/promoteDetails.js.
const DETAILS_MASK = CORE_DETAILS_MASK;

// THE MONEY GUARD, shared with the cron. lib/spendGate.js reads process.env, and
// this script deliberately loads .env.local into ENV (never process.env) so a
// value can never leak into a child process or a stack trace — so hand the gate
// exactly the two names it needs, then import it. WAYFIND_GATE is left as
// whatever the shell has: locally that is normally unset ("open"), which means
// wf_promote_config.month_cap IS the ceiling, counted down in the same
// wf_spend_ledger row the cron uses. Two writers, one budget.
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]) if (!process.env[k]) process.env[k] = k === "SUPABASE_URL" ? SB_URL : SB_KEY;
const { spendAllowCapped } = await import("../lib/spendGate.js");

const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rpc(fn, body) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(body || {}) });
  if (!r.ok) throw new Error(`rpc ${fn} -> ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// fetchLiveMetros — same fix as app/api/cron/promote-index/route.js, same
// reason: public.wf_promote_metros (migration 20260813_wf_promote_metros.sql)
// is the authoritative geography, PROMOTE_METROS is only its offline fallback,
// and the two silently diverged on 2026-08-23 (miami-dade/broward/palm-beach/
// keys/florida added to the table only). wf_bucket_metro() picked those up
// immediately for the enqueue trigger; decidePromotion() did not, so this
// worker rejected every place the queue had correctly tagged with a new metro.
// null (never {}) on any failure or empty result, so the caller can fall back
// to PROMOTE_METROS instead of reading "zero active metros" as real.
async function fetchLiveMetros() {
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/wf_promote_metros?select=metro,min_lat,max_lat,min_lng,max_lng,active&active=is.true`,
      { headers: H }
    );
    if (!r.ok) { console.warn(`wf_promote_metros lookup ${r.status} — falling back to PROMOTE_METROS`); return null; }
    const metros = metrosFromRows(await r.json());
    return Object.keys(metros).length ? metros : null;
  } catch (e) {
    console.warn(`wf_promote_metros unavailable, falling back to PROMOTE_METROS: ${String(e && e.message).slice(0, 120)}`);
    return null;
  }
}

// fetchPromoteConfig — read-only here. The WORKER never writes wf_promote_config
// or runs the adaptive step (lib/promoteThrottle.js nextBatchLimit) — that is
// the automated cron's job (app/api/cron/promote-index/route.js), which runs
// far more often and actually observes a run's error rate. This is a manual,
// human-invoked tool: it only HONORS the current batch_limit as a ceiling on
// --batch, via the same clampBatchLimit both call sites share, so a hand run
// can never spend faster than the adaptive system currently trusts.
async function fetchPromoteConfig() {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/wf_promote_config?select=batch_limit,month_cap&id=eq.1`, { headers: H });
    if (!r.ok) { console.warn(`wf_promote_config lookup ${r.status} — falling back to the static batch size`); return null; }
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (e) {
    console.warn(`wf_promote_config unavailable, falling back to the static batch size: ${String(e && e.message).slice(0, 120)}`);
    return null;
  }
}

// A 4xx that is not a rate limit is a VERDICT about this place (gone, bad id),
// not a transient fault. Retrying buys the same answer three times.
const isTerminal = (s) => s >= 400 && s < 500 && s !== 429;

async function details(placeId) {
  for (let a = 0; a < 3; a++) {
    let r;
    try {
      r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
        headers: { "X-Goog-Api-Key": G_KEY, "X-Goog-FieldMask": DETAILS_MASK },
      });
    } catch (e) {
      if (a === 2) return { ok: false, terminal: false, error: `details network: ${String(e.message || e).slice(0, 120)}` };
      await sleep(500 * (a + 1)); continue;
    }
    if (r.ok) return { ok: true, place: await r.json() };
    const body = (await r.text()).slice(0, 160);
    if (isTerminal(r.status)) return { ok: false, terminal: true, error: `details ${r.status}: ${body}` };
    if (a === 2) return { ok: false, terminal: false, error: `details ${r.status}: ${body}` };
    await sleep(800 * (a + 1));
  }
  return { ok: false, terminal: false, error: "details: exhausted retries" };
}

// Bounded-concurrency map. Keeps Google requests in flight without a burst that
// trips the per-minute quota and turns good places into retries.
async function pmap(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const k = i++;
      if (k >= items.length) return;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

const liveMetros = await fetchLiveMetros();
const METROS = liveMetros || PROMOTE_METROS;
console.log(liveMetros
  ? `metros: ${Object.keys(METROS).length} active from wf_promote_metros (${Object.keys(METROS).join(", ")})`
  : `metros: FALLBACK to static PROMOTE_METROS (${Object.keys(METROS).join(", ")}) — wf_promote_metros unreachable this run`);

// batch_limit (2026-09-01) — see lib/promoteThrottle.js. cfgRow is null
// pre-migration/unreachable; clampBatchLimit's own fallback (25) covers that.
const cfgRow = await fetchPromoteConfig();
const configBatchLimit = clampBatchLimit(cfgRow && cfgRow.batch_limit);
const BATCH = Math.max(1, Math.min(parseInt(BATCH_ARG, 10) || configBatchLimit, configBatchLimit));
console.log(cfgRow
  ? `batch: ${BATCH} (config batch_limit ${configBatchLimit}${BATCH_ARG ? `, --batch ${BATCH_ARG} clamped to it` : ""})`
  : `batch: ${BATCH} (FALLBACK — wf_promote_config unreachable, static default clamp)`);
// The monthly budget. Missing row/column reads as the free tier, never unlimited
// (spendAllowCapped also fails closed on anything that is not a positive number).
const MONTH_CAP = cfgRow && cfgRow.month_cap != null ? Number(cfgRow.month_cap) : 4800;
console.log(`budget: ${PROMOTE_SKU} month_cap ${MONTH_CAP} (wf_promote_config.month_cap; WAYFIND_GATE ${process.env.WAYFIND_GATE ? "set" : "unset -> open: month_cap is the ceiling"})`);

// fetchIndexSignals — rating/reviews for a batch, from wf_place_ids (the index),
// which is where they come from now instead of the Details call. Same fallback
// as the cron: on failure the card is promoted without stars (rating null).
async function fetchIndexSignals(placeIds) {
  const out = new Map();
  if (!placeIds.length) return out;
  try {
    const ids = placeIds.map((id) => `"${id}"`).join(",");
    const r = await fetch(`${SB_URL}/rest/v1/wf_place_ids?select=place_id,signals&place_id=in.(${ids})`, { headers: H });
    if (!r.ok) { console.warn(`wf_place_ids signals lookup ${r.status} — promoting without index rating/reviews`); return out; }
    for (const row of await r.json()) if (row && row.place_id) out.set(row.place_id, row.signals || null);
  } catch (e) {
    console.warn(`wf_place_ids signals unavailable: ${String(e && e.message).slice(0, 120)}`);
  }
  return out;
}

const T = { claimed: 0, promoted: 0, rejected: 0, retried: 0, released: 0, batches: 0, spend: 0 };
const rejectReasons = new Map();
const started = Date.now();

while (T.claimed < TOTAL) {
  const want = Math.min(BATCH, TOTAL - T.claimed);
  const claimed = await rpc("wf_promotion_claim", { p_metro: METRO, p_limit: want, p_lease_minutes: 15 });
  if (!Array.isArray(claimed) || claimed.length === 0) { console.log("queue empty — done"); break; }
  T.claimed += claimed.length;
  T.batches++;

  const indexSignals = await fetchIndexSignals(claimed.map((c) => c.place_id));
  let budgetExhausted = false;
  const results = await pmap(claimed, CONC, async (item) => {
    // THE MONEY GUARD — one atomic ledger grant per Google call, before it.
    // The first refusal is the month's budget running out; stop asking.
    if (budgetExhausted || !(await spendAllowCapped(PROMOTE_SKU, MONTH_CAP))) {
      budgetExhausted = true;
      return { item, kind: "release" };
    }
    const d = await details(item.place_id);
    if (!d.ok) return { item, kind: d.terminal ? "reject" : "retry", error: d.error };
    const place = withIndexSignals(d.place, indexSignals.get(item.place_id));
    const v = decidePromotion(place, item.metro, new Date().toISOString(), null, METROS);
    if (v.action !== "promote") return { item, kind: "reject", error: v.error };
    return { item, kind: "promote", row: v.row };
  });
  const bought = results.filter((r) => r.kind !== "release").length;
  T.spend += bought * COST_PER;

  const promote = results.filter((r) => r.kind === "promote");
  const { rows } = dedupeById(promote.map((r) => r.row));

  let writeError = null;
  if (rows.length) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/wf_inventory`, {
        method: "POST",
        headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      if (!r.ok) throw new Error(`upsert -> ${r.status}: ${(await r.text()).slice(0, 300)}`);
    } catch (e) { writeError = String(e.message || e).slice(0, 300); }
  }

  // Settle. A failed WRITE returns every row to pending with backoff: the places
  // were valid, the database was not, and losing them would be the atlas-build
  // defect exactly.
  const settle = [];
  for (const r of results) {
    if (r.kind === "promote") {
      settle.push(rpc("wf_promotion_complete", writeError
        ? { p_place_id: r.item.place_id, p_ok: false, p_error: writeError }
        : { p_place_id: r.item.place_id, p_ok: true }));
    } else if (r.kind === "reject") {
      settle.push(rpc("wf_promotion_complete", { p_place_id: r.item.place_id, p_ok: false, p_error: r.error, p_reject: true }));
      const key = String(r.error).split(":")[0].slice(0, 60);
      rejectReasons.set(key, (rejectReasons.get(key) || 0) + 1);
    } else if (r.kind === "release") {
      // Budget refusal: back to pending, attempt refunded, parked — never a
      // failure against the place (see wf_promotion_release in the migration).
      settle.push(rpc("wf_promotion_release", { p_place_id: r.item.place_id, p_delay_minutes: 60, p_note: `spend ledger: ${PROMOTE_SKU} month_cap ${MONTH_CAP} reached` }));
    } else {
      settle.push(rpc("wf_promotion_complete", { p_place_id: r.item.place_id, p_ok: false, p_error: r.error }));
    }
  }
  await Promise.allSettled(settle);

  if (writeError) { console.error(`  batch ${T.batches}: UPSERT FAILED — ${writeError}`); }
  else T.promoted += rows.length;
  T.rejected += results.filter((r) => r.kind === "reject").length;
  T.retried += results.filter((r) => r.kind === "retry").length;
  T.released += results.filter((r) => r.kind === "release").length;

  try {
    appendFileSync(AUDIT, JSON.stringify({
      ts: new Date().toISOString(), batch: T.batches, metro: METRO,
      claimed: claimed.length, promoted: writeError ? 0 : rows.length,
      rejected: results.filter((r) => r.kind === "reject").length,
      retried: results.filter((r) => r.kind === "retry").length,
      writeError,
      sample: promote.slice(0, 3).map((r) => `${r.row.name} (${r.row.category})`),
    }) + "\n");
  } catch {}

  const el = Math.round((Date.now() - started) / 1000);
  console.log(`  batch ${String(T.batches).padStart(3)} | claimed ${String(T.claimed).padStart(5)} | promoted ${String(T.promoted).padStart(5)} | rejected ${String(T.rejected).padStart(4)} | retry ${T.retried} | $${T.spend.toFixed(2)} | ${el}s`);
}

console.log("\n" + "-".repeat(70));
console.log(`claimed ${T.claimed} | promoted ${T.promoted} | rejected ${T.rejected} | retrying ${T.retried}`);
console.log(`estimated Place Details spend: $${T.spend.toFixed(2)}`);
if (rejectReasons.size) {
  console.log("reject reasons:");
  for (const [k, v] of [...rejectReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(v).padStart(5)}  ${k}`);
}
