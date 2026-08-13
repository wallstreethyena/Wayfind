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
//   --metro <key>       manatee-sarasota | tampa | st-pete | orlando (default: all)
//   --limit <n>         max places THIS run (default 100). Cost = n x $0.017.
//   --batch <n>         claim size per cycle, <=50 (default 25)
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
import { decidePromotion, dedupeById } from "../lib/promoteIndex.js";

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
const BATCH = Math.max(1, Math.min(parseInt(argOf("--batch", "25"), 10), 50));
const CONC = Math.max(1, Math.min(parseInt(argOf("--concurrency", "6"), 10), 10));
const AUDIT = argOf("--audit", "/home/claude/wf-worker/audit.jsonl");
const COST_PER = 0.017;

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

const T = { claimed: 0, promoted: 0, rejected: 0, retried: 0, batches: 0, spend: 0 };
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
    if (!d.ok) return { item, kind: d.terminal ? "reject" : "retry", error: d.error };
    const v = decidePromotion(d.place, item.metro, new Date().toISOString());
    if (v.action !== "promote") return { item, kind: "reject", error: v.error };
    return { item, kind: "promote", row: v.row };
  });
  T.spend += claimed.length * COST_PER;

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
      settle.push(rpc("wf_promotion_complete", { p_place_id: r.item.place_id, p_ok: false, p_error: r.error }));
    }
  }
  await Promise.allSettled(settle);

  if (writeError) { console.error(`  batch ${T.batches}: UPSERT FAILED — ${writeError}`); }
  else T.promoted += rows.length;
  T.rejected += results.filter((r) => r.kind === "reject").length;
  T.retried += results.filter((r) => r.kind === "retry").length;

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
