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
//   --limit <n>         max places THIS run (default 100). Cost = n x $0.025
//                        (Details New Enterprise+Atmosphere — see COST_PER
//                        below), minus whatever the spend ledger denies.
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
import { spendAllow } from "../lib/spendGate.js";

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
// Bridge into process.env for lib/spendGate.js (2026-09-01 fix). spendGate.js
// reads process.env.SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / WAYFIND_GATE
// directly, Vercel-style — this script instead parses .env.local into the
// local ENV object above and never touches process.env. Without this bridge
// every spendAllow() call below would see an EMPTY environment (no url, no
// key) and fail closed on every single place, indistinguishable from the
// ledger genuinely being exhausted. Never overwrite a value already set in
// the real process environment.
process.env.SUPABASE_URL = process.env.SUPABASE_URL || SB_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || SB_KEY;
if (ENV.WAYFIND_GATE !== undefined) process.env.WAYFIND_GATE = process.env.WAYFIND_GATE || ENV.WAYFIND_GATE;

const args = process.argv.slice(2);
const argOf = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const METRO = argOf("--metro", null);
const TOTAL = Math.max(1, parseInt(argOf("--limit", "100"), 10));
const BATCH_ARG = argOf("--batch", null); // clamped against the live config below, once fetched
const CONC = Math.max(1, Math.min(parseInt(argOf("--concurrency", "6"), 10), 10));
const AUDIT = argOf("--audit", "/home/claude/wf-worker/audit.jsonl");
// $0.025/record (2026-09-01, corrected): DETAILS_MASK below mixes an
// Enterprise field with editorialSummary (Atmosphere), so Google bills this
// as Details (New) Enterprise+Atmosphere, not plain Enterprise — the
// previous $0.017 here undercounted true spend by ~47%.
const COST_PER = 0.025;

const DETAILS_MASK = [
  "id", "displayName", "location", "types", "primaryType",
  "rating", "userRatingCount", "priceLevel", "businessStatus", "editorialSummary", "photos",
].join(",");

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
    const r = await fetch(`${SB_URL}/rest/v1/wf_promote_config?select=batch_limit&id=eq.1`, { headers: H });
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
  // FAIL-CLOSED SPEND GATE (2026-09-01). Same fix, same reason, as
  // app/api/cron/promote-index/route.js: one spendAllow() grant per place
  // BEFORE any Google fetch. A denial never calls Google and is reported as
  // ledgerDenied so the caller settles the row as a RETRY — running out of
  // budget this run is not a verdict about the place.
  if (!(await spendAllow("details_enterprise_atmosphere"))) {
    return { ok: false, terminal: false, ledgerDenied: true, error: "details: spend ledger denied (details_enterprise_atmosphere)" };
  }
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

const T = { claimed: 0, promoted: 0, rejected: 0, retried: 0, ledgerDenied: 0, batches: 0, spend: 0 };
const rejectReasons = new Map();
const started = Date.now();

while (T.claimed < TOTAL) {
  const want = Math.min(BATCH, TOTAL - T.claimed);
  const claimed = await rpc("wf_promotion_claim", { p_metro: METRO, p_limit: want, p_lease_minutes: 15 });
  if (!Array.isArray(claimed) || claimed.length === 0) { console.log("queue empty — done"); break; }
  T.claimed += claimed.length;
  T.batches++;

  const results = await pmap(claimed, CONC, async (item) => {
    const d = await details(item.place_id);
    if (!d.ok) return { item, kind: d.ledgerDenied ? "ledgerDenied" : (d.terminal ? "reject" : "retry"), error: d.error };
    const v = decidePromotion(d.place, item.metro, new Date().toISOString(), null, METROS);
    if (v.action !== "promote") return { item, kind: "reject", error: v.error };
    return { item, kind: "promote", row: v.row };
  });
  const ledgerDeniedCount = results.filter((r) => r.kind === "ledgerDenied").length;
  // Only records that actually reached Google cost money — a ledger denial is
  // precisely a call that did NOT happen.
  T.spend += (claimed.length - ledgerDeniedCount) * COST_PER;

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
    } else {
      // "retry" and "ledgerDenied" both settle the same way — no p_reject.
      // Neither is a verdict about the place.
      settle.push(rpc("wf_promotion_complete", { p_place_id: r.item.place_id, p_ok: false, p_error: r.error }));
    }
  }
  await Promise.allSettled(settle);

  if (writeError) { console.error(`  batch ${T.batches}: UPSERT FAILED — ${writeError}`); }
  else T.promoted += rows.length;
  T.rejected += results.filter((r) => r.kind === "reject").length;
  T.retried += results.filter((r) => r.kind === "retry").length;
  T.ledgerDenied += ledgerDeniedCount;

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
  console.log(`  batch ${String(T.batches).padStart(3)} | claimed ${String(T.claimed).padStart(5)} | promoted ${String(T.promoted).padStart(5)} | rejected ${String(T.rejected).padStart(4)} | retry ${T.retried} | ledger-denied ${T.ledgerDenied} | $${T.spend.toFixed(2)} | ${el}s`);
}

console.log("\n" + "-".repeat(70));
console.log(`claimed ${T.claimed} | promoted ${T.promoted} | rejected ${T.rejected} | retrying ${T.retried} | ledger-denied ${T.ledgerDenied}`);
if (T.ledgerDenied) console.log(`${T.ledgerDenied} place(s) were skipped by the spend ledger (WAYFIND_GATE=free cap, or gate shut) and returned to pending for a future run.`);
console.log(`estimated Place Details spend: $${T.spend.toFixed(2)}`);
if (rejectReasons.size) {
  console.log("reject reasons:");
  for (const [k, v] of [...rejectReasons.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(v).padStart(5)}  ${k}`);
}
