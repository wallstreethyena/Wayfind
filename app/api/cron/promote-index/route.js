import { gateShut, spendAllow } from "../../../../lib/spendGate";
// app/api/cron/promote-index/route.js — drains wf_promotion_queue: index places
// (wf_place_ids) become owned cards (wf_inventory), a bounded batch at a time.
//
// WHY THIS EXISTS. scripts/promote-index.mjs does this job correctly and has to
// be run by hand. Nobody ran it. Measured 2026-08-13 within 10 miles of Parrish:
// 364 places known, 62 promoted. The owner's report — "everything on the main
// page is more than 9 miles out" — was that gap, not a ranking bug. A hand-run
// tool that closes a gap which reopens every day is not a pipeline.
//
// THE ARCHITECTURE RULE THIS OBEYS (owner, non-negotiable): sparse local
// inventory is NEVER solved by calling Google when a user opens the app. Nothing
// here runs in a request path. The queue fills from a Postgres trigger, this
// route drains it on a schedule, and the app reads owned inventory only.
//
// WHY IT IS NOT PURE SQL. wf_place_ids legally cannot hold what wf_inventory
// needs. check-census-tos-boundary keeps Google place CONTENT (types[], rating,
// businessStatus, priceLevel) in wf_places_cache under a 30-day cap; the
// permanent index carries place_id + a minimal skeleton. But classifyPlace()
// needs types[] and primaryType to pick a category, and a card must never be
// written for a permanently-closed place. So promotion has to re-fetch Details.
// A SQL-only copy would produce rows with an unknown category and an unknown
// status — cards the read path (lib/inventoryServe CATS) can never serve.
//
// EVERY ROW GOES THROUGH THE SAME CORE AS THE HAND-RUN TOOL — buildInventoryRow,
// toWriteRow, validateInventoryRow, dedupeById from lib/promoteIndex.js. A card
// promoted by this cron is byte-identical to one promoted at the terminal. That
// is deliberate: two write paths with two validators is how a bad row gets in.
//
// THE atlas-build LESSON (#438) IS LOAD-BEARING HERE. That job returned HTTP 200
// on every invocation for five days while publishing nothing, and each failure
// permanently removed a place from its own future queue. So:
//   * a transient failure returns the place to 'pending' with backoff — it is
//     never deleted and never silently dropped,
//   * recordPulse fires on EVERY path including the early returns, so
//     /api/cron/job-watch sees "attempted 10, succeeded 0" instead of a green 200,
//   * the response body reports rejects by reason, not just a count.
//
// COST AND CADENCE (2026-09-01). The DETAILS_MASK below mixes an Enterprise
// field (rating, userRatingCount, priceLevel, businessStatus) with an
// Atmosphere field (editorialSummary). Google bills the HIGHEST tier any
// requested field belongs to for the WHOLE call, so this is genuinely a
// Details (New) Enterprise+Atmosphere call at ~$0.025/record (verified
// against Google's pricing page 2026-09-01), not the plain-Enterprise
// ~$0.017 an earlier version of this file assumed — that earlier constant
// undercounted true spend by ~47% in every estimate below and in the
// response body. batch_limit is no longer a hardcoded 25 — it is read live
// from public.wf_promote_config (migration 20260901_wf_promote_config.sql)
// and self-tunes between runs (lib/promoteThrottle.js), clamped to [1, 50];
// a config read/parse failure falls back to the static 25 it replaced, never
// to 0 (silent stop) or unbounded. vercel.json now fires this every 5
// minutes (12x/hour) rather than four times an hour: at the claim RPC's own
// 50-row cap that is a ~600/hour ceiling (12 x $1.25 = ~$15/hour worst case,
// only ever reached if every run earns the +25% step by staying under the 5%
// error bar with a full queue) with a self-imposed floor of 5/run the moment
// error rate climbs past 20% or Google returns a 429. The job idles at $0
// the moment the queue is empty either way.
//
// THE SPEND GATE (2026-09-01 fix, #see spendGate.js). Every Details fetch
// since 2026-08-13 was un-ledgered: this file imported gateShut() but never
// called spendAllow(), so WAYFIND_GATE=free did not protect this drain the
// way it protects lib/placeDetails.js. details() below now takes one
// spendAllow("details_enterprise_atmosphere") grant per place BEFORE the
// Google fetch, fail-closed — a denial (over the free-tier cap, gate shut,
// or the ledger being unreachable) never calls Google and is settled as a
// RETRY, not a reject: running out of budget this run is not a verdict about
// the place, and the row must come back on a future run once budget frees
// up. Ledger denials feed nextBatchLimit's ledgerDenials input below so the
// adaptive throttle backs the batch size off under ledger pressure exactly
// like it backs off under Google error/429 pressure.
import { sbEnv } from "../../../../lib/serverCache";
import { recordPulse } from "../../../../lib/jobPulse";
import { decidePromotion, dedupeById, PROMOTE_METROS, metrosFromRows } from "../../../../lib/promoteIndex";
import { clampBatchLimit, nextBatchLimit } from "../../../../lib/promoteThrottle";
import { jobFailed } from "../../../../lib/jobFail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// force-no-store, AND cache:"no-store" on every fetch below. Belt AND braces,
// because the first production run without them cost a whole cycle — see the
// note above rpc(). lib/inventoryServe.js already sets no-store on every call
// for the same reason; this route just failed to copy that.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// EXACTLY the fields buildInventoryRow consumes — same mask as
// scripts/promote-index.mjs. Adding an atmosphere field here would raise the SKU
// tier for data inventory does not store.
const DETAILS_MASK = [
  "id", "displayName", "location", "types", "primaryType",
  "rating", "userRatingCount", "priceLevel", "businessStatus", "editorialSummary", "photos",
].join(",");

const COST_PER_RECORD = 0.025;
const GKEY = () => (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A 4xx that is not a rate limit is a VERDICT about this place (gone, bad id),
// not a transient fault. Retrying it three times buys the same answer three times.
function isTerminalStatus(status) {
  return status >= 400 && status < 500 && status !== 429;
}

async function details(key, placeId) {
  // FAIL-CLOSED SPEND GATE (2026-09-01). One ledger grant per place, taken
  // BEFORE any Google fetch. A denial — WAYFIND_GATE=shut, the free-tier cap
  // reached, or the ledger itself unreachable — never touches Google and is
  // reported as ledgerDenied so the caller settles the row as a RETRY, not a
  // reject: this is a statement about THIS run's budget, not about the place.
  if (!(await spendAllow("details_enterprise_atmosphere"))) {
    return { ok: false, terminal: false, ledgerDenied: true, error: "details: spend ledger denied (details_enterprise_atmosphere)" };
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      cache: "no-store", // a cached 200 here would mean promoting a place from a stale snapshot
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAILS_MASK },
    });
    if (r.ok) return { ok: true, place: await r.json() };
    const body = (await r.text()).slice(0, 160);
    if (isTerminalStatus(r.status)) return { ok: false, terminal: true, error: `details ${r.status}: ${body}` };
    if (attempt === 2) return { ok: false, terminal: false, error: `details ${r.status}: ${body}` };
    await sleep(500 * (attempt + 1));
  }
  return { ok: false, terminal: false, error: "details: exhausted retries" };
}

// cache: "no-store" IS LOAD-BEARING, not hygiene. MEASURED IN PRODUCTION on the
// first two runs, 18:50 and 19:05 UTC on 2026-08-13:
//
//   pulse 18:50  attempted 25  succeeded 24     <- real
//   pulse 19:05  attempted 25  succeeded 24     <- identical, and a lie
//
// The queue was untouched by the second run: max(last_attempt_at) stayed 18:50
// and all 1,628 pending rows still had attempts = 0. But wf_inventory.refreshed_at
// on the same 24 rows moved to 19:05. So the second invocation re-ran, re-wrote
// the SAME places, and reported success — while promoting nothing.
//
// The cause is request-body identity. wf_promotion_claim is POSTed with the exact
// same body every run — {p_metro:null, p_limit:25, p_lease_minutes:15} — and so is
// every wf_promotion_complete for a given place. Those responses were served from
// cache, so the claim handed back the PREVIOUS run's 25 rows and the completes
// never executed. The upsert alone actually ran, because its body carries a fresh
// refreshed_at timestamp and is therefore unique per run.
//
// This is the atlas-build failure (#438) reproduced exactly: a job that attempts
// work, accomplishes none, and reports HTTP 200 with healthy-looking numbers. It
// would have spun forever on the same 25 places. scripts/check-cron-post-nostore.mjs
// now makes it impossible to ship again.
async function rpc(s, fn, body) {
  const r = await fetch(`${s.url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    cache: "no-store",
    headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (!r.ok) throw new Error(`rpc ${fn} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// fetchLiveMetros — the FIX for the 2026-09-01 outage. PROMOTE_METROS is a JS
// constant; public.wf_promote_metros (migration 20260813_wf_promote_metros.sql)
// is the table it was always supposed to mirror, and the two silently diverged
// on 2026-08-23 when miami-dade/broward/palm-beach/keys/florida were added to
// the table only. wf_bucket_metro() (the SQL twin, called by the enqueue
// trigger) picked the new rows up immediately; this route did not, so every
// place the queue correctly tagged with a new metro was rejected right back
// out by validateInventoryRow with "unknown metro: <name>" — ~1,467 places
// over nine days. Read fresh every run (cache:"no-store" — a cached read here
// is the same poisoned-cache class as the write-caching bug documented above
// rpc(), just on the read side) so a metro added to the table is honored on
// this run, not the next deploy. Returns null (never {}) on any failure or
// empty result, so the caller can tell "fetch failed, fall back" apart from
// "the table legitimately has zero active metros" — the two must never be
// treated the same, since the latter reading would reject everything.
async function fetchLiveMetros(s) {
  try {
    const r = await fetch(
      `${s.url}/rest/v1/wf_promote_metros?select=metro,min_lat,max_lat,min_lng,max_lng,active&active=is.true`,
      { cache: "no-store", headers: { apikey: s.key, authorization: "Bearer " + s.key } }
    );
    if (!r.ok) { console.warn(`[promote-index] wf_promote_metros lookup ${r.status} — falling back to PROMOTE_METROS`); return null; }
    const metros = metrosFromRows(await r.json());
    return Object.keys(metros).length ? metros : null;
  } catch (e) {
    console.warn(`[promote-index] wf_promote_metros unavailable this run, falling back to PROMOTE_METROS: ${String(e && e.message).slice(0, 120)}`);
    return null;
  }
}

// fetchPromoteConfig — the single wf_promote_config row (id=1). null on any
// failure (missing table pre-migration, unreachable, malformed) so the caller
// falls back through clampBatchLimit's own default (25) rather than crashing
// the drain over a throttle it can perfectly well run without.
async function fetchPromoteConfig(s) {
  try {
    const r = await fetch(
      `${s.url}/rest/v1/wf_promote_config?select=batch_limit,auto&id=eq.1`,
      { cache: "no-store", headers: { apikey: s.key, authorization: "Bearer " + s.key } }
    );
    if (!r.ok) { console.warn(`[promote-index] wf_promote_config lookup ${r.status} — falling back to the static batch size`); return null; }
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (e) {
    console.warn(`[promote-index] wf_promote_config unavailable this run, falling back to the static batch size: ${String(e && e.message).slice(0, 120)}`);
    return null;
  }
}

// writePromoteConfig — best-effort. A failed write leaves batch_limit exactly
// where it was for the NEXT run to read (never silently reset), and never
// blocks or fails the drain itself — same fail-soft posture as recordPulse.
async function writePromoteConfig(s, { batchLimit, promoted, rejected, errors }) {
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_promote_config?id=eq.1`, {
      method: "PATCH",
      cache: "no-store",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        batch_limit: batchLimit,
        last_run_promoted: promoted,
        last_run_rejected: rejected,
        last_run_errors: errors,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) console.warn(`[promote-index] wf_promote_config write-back ${r.status} — next run keeps the last saved batch_limit`);
  } catch (e) {
    console.warn(`[promote-index] wf_promote_config write-back failed: ${String(e && e.message).slice(0, 120)}`);
  }
}

export async function GET(req) {
  // COST GUARD (2026-08-25): WAYFIND_GATE=shut stops ALL metered Google spend.
  if (gateShut()) return Response.json({ skipped: "gate shut" });
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  if (!secret || (auth !== "Bearer " + secret && url.searchParams.get("key") !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const s = sbEnv();
  const gkey = GKEY();
  // Pulse the misconfiguration too. An unset key that returns a quiet {ok:false}
  // is precisely how atlas-build stayed invisible for five days.
  if (!s) {
    await recordPulse("promote-index", { attempted: 0, succeeded: 0, note: "no supabase service env" });
    return Response.json({ ok: false, error: "no supabase service env" });
  }
  if (!gkey) {
    await recordPulse("promote-index", { attempted: 0, succeeded: 0, note: "missing GOOGLE_MAPS_SERVER_KEY" });
    return Response.json({ ok: false, error: "missing GOOGLE_MAPS_SERVER_KEY" });
  }

  // Live metro geography (see fetchLiveMetros above). Falls back to the static
  // PROMOTE_METROS only when the table can't be reached — never silently to
  // "nothing is valid".
  const metros = (await fetchLiveMetros(s)) || PROMOTE_METROS;

  // Adaptive batch size (2026-09-01) — see lib/promoteThrottle.js. configRow is
  // null pre-migration/unreachable; clampBatchLimit's own fallback (25, the
  // static value this replaces) covers that with no special-casing here.
  const configRow = await fetchPromoteConfig(s);
  const configBatchLimit = clampBatchLimit(configRow && configRow.batch_limit);
  const autoTune = !configRow || configRow.auto !== false; // missing row/column reads as "auto" — the pre-migration default
  // ?limit= is still an operator override for manual/debug invocations, but it
  // can never exceed the current adaptive ceiling.
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "", 10) || configBatchLimit, configBatchLimit));
  const metroParam = (url.searchParams.get("metro") || "").trim();
  if (metroParam && !metros[metroParam]) {
    return Response.json({ ok: false, error: `unknown metro "${metroParam}"`, known: Object.keys(metros) });
  }
  const metro = metroParam || null;
  const nowIso = new Date().toISOString();

  let claimed = [];
  try {
    claimed = await rpc(s, "wf_promotion_claim", { p_metro: metro, p_limit: limit, p_lease_minutes: 15 });
  } catch (e) {
    await recordPulse("promote-index", { attempted: 0, succeeded: 0, note: `claim failed: ${String(e.message || e).slice(0, 120)}` });
    return jobFailed("promote-index", String(e.message || e));
  }

  if (!Array.isArray(claimed) || claimed.length === 0) {
    // attempted 0 is IDLE, not failure — job-watch must be able to tell the
    // difference between "nothing to do" and "tried everything, achieved nothing".
    await recordPulse("promote-index", { attempted: 0, succeeded: 0, note: "queue empty" });
    return Response.json({ ok: true, done: true, metro, claimed: 0, promoted: 0 });
  }

  // Scout verdicts for this batch (lib/scoutAdjudicate.js). An ACCEPTED verdict
  // supplies classify()'s ABSTENTION branch and nothing else — it cannot reach
  // an excluded place and cannot override a decided one. A batch with no
  // verdicts behaves exactly as it did before the scout existed, and that is
  // also the fallback whenever this lookup fails: adjudication is an
  // enhancement and must never be able to break the promoter.
  const adjudicated = new Map();
  try {
    const ids = claimed.map((c) => `"${c.place_id}"`).join(",");
    const r = await fetch(
      `${s.url}/rest/v1/wf_scout_verdicts?select=place_id,section&accepted=is.true&place_id=in.(${ids})`,
      { cache: "no-store", headers: { apikey: s.key, authorization: "Bearer " + s.key } });
    if (r.ok) for (const v of await r.json()) { if (v && v.section) adjudicated.set(v.place_id, v.section); }
    else console.warn(`[promote-index] scout verdict lookup ${r.status} — proceeding unadjudicated`);
  } catch (e) {
    console.warn(`[promote-index] scout verdicts unavailable this run: ${String(e && e.message).slice(0, 120)}`);
  }

  const writeRows = [];
  const okIds = [];
  const rejects = [];
  const retries = [];
  const ledgerDenied = [];

  for (const item of claimed) {
    const d = await details(gkey, item.place_id);
    if (!d.ok) {
      if (d.ledgerDenied) { ledgerDenied.push({ place_id: item.place_id, name: item.name, error: d.error }); continue; }
      (d.terminal ? rejects : retries).push({ place_id: item.place_id, name: item.name, error: d.error });
      continue;
    }
    // ONE decision, shared with the hand-run promoter and locked by
    // scripts/test-promote-decision.mjs. A "reject" is a verdict about the DATA
    // (unclassifiable, closed, out of bounds) — re-fetching buys the same answer,
    // so the queue must not retry it and pay Google again.
    const verdict = decidePromotion(d.place, item.metro, nowIso, adjudicated.get(item.place_id) || null, metros);
    if (verdict.action !== "promote") {
      rejects.push({ place_id: item.place_id, name: item.name, error: verdict.error });
      continue;
    }
    writeRows.push(verdict.row);
    okIds.push(item.place_id);
  }

  const { rows, dropped } = dedupeById(writeRows);

  let written = 0;
  let writeError = null;
  if (rows.length) {
    try {
      const r = await fetch(`${s.url}/rest/v1/wf_inventory`, {
        method: "POST",
        cache: "no-store",
        headers: {
          apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(rows),
      });
      if (!r.ok) throw new Error(`upsert → ${r.status}: ${(await r.text()).slice(0, 300)}`);
      written = rows.length;
    } catch (e) {
      writeError = String(e.message || e).slice(0, 300);
    }
  }

  // Settle the queue. A failed WRITE returns every row to pending with backoff —
  // the places were valid, the database was not, and losing them would be the
  // atlas-build defect exactly.
  const settle = [];
  if (writeError) {
    for (const id of okIds) settle.push(rpc(s, "wf_promotion_complete", { p_place_id: id, p_ok: false, p_error: writeError }));
  } else {
    for (const id of okIds) settle.push(rpc(s, "wf_promotion_complete", { p_place_id: id, p_ok: true }));
  }
  for (const x of rejects) settle.push(rpc(s, "wf_promotion_complete", { p_place_id: x.place_id, p_ok: false, p_error: x.error, p_reject: true }));
  for (const x of retries) settle.push(rpc(s, "wf_promotion_complete", { p_place_id: x.place_id, p_ok: false, p_error: x.error }));
  // ledgerDenied settles exactly like retries — no p_reject. Running out of
  // this run's spend budget is never a verdict about the place.
  for (const x of ledgerDenied) settle.push(rpc(s, "wf_promotion_complete", { p_place_id: x.place_id, p_ok: false, p_error: x.error }));
  await Promise.allSettled(settle);

  const succeeded = writeError ? 0 : written;
  const note = writeError
    ? `upsert failed: ${writeError.slice(0, 120)}`
    : (succeeded === 0 && claimed.length > 0 ? `0/${claimed.length} promoted; top reject: ${(rejects[0] && rejects[0].error) || "none"}`.slice(0, 200) : null);
  await recordPulse("promote-index", { attempted: claimed.length, succeeded, note });

  // Adaptive step (2026-09-01) — see lib/promoteThrottle.js. `errors` here is
  // OPERATIONAL distress (transient/retry fetch failures + a failed upsert),
  // never decidePromotion's own data verdicts — an unclassifiable or
  // out-of-bounds place is a correct reject and must not throttle the drain.
  // `queueNonEmpty` is a proxy (a full claim), not a fresh COUNT query — see
  // the comment on nextBatchLimit for why that tradeoff is deliberate.
  const errors = retries.length + (writeError ? okIds.length : 0);
  const sawRateLimit = retries.some((r) => /\b429\b/.test(r.error || ""));
  const queueNonEmpty = claimed.length >= limit;
  const nextLimit = autoTune
    ? nextBatchLimit(configBatchLimit, { attempted: claimed.length, errors, ledgerDenials: ledgerDenied.length, sawRateLimit, queueNonEmpty })
    : configBatchLimit; // auto=false is an operator pin — leave batch_limit exactly as configured
  await writePromoteConfig(s, { batchLimit: nextLimit, promoted: succeeded, rejected: rejects.length, errors });

  return Response.json({
    ok: !writeError,
    metro: metro || "(all)",
    claimed: claimed.length,
    promoted: succeeded,
    rejected: rejects.length,
    retrying: retries.length,
    ledgerDenied: ledgerDenied.length,
    deduped: dropped,
    // Only records that actually reached Google cost money — a ledger denial
    // is precisely a call that did NOT happen, so it is excluded here.
    estimatedSpendUSD: Math.round((claimed.length - ledgerDenied.length) * COST_PER_RECORD * 100) / 100,
    writeError,
    batchLimit: configBatchLimit,
    nextBatchLimit: nextLimit,
    // Full reasons, not counts. The whole point of #438 was that a count told
    // you nothing about WHICH service was failing.
    rejectSample: rejects.slice(0, 5),
    retrySample: retries.slice(0, 5),
    ledgerDeniedSample: ledgerDenied.slice(0, 5),
  });
}
