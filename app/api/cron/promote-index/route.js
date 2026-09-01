import { gateShut, spendAllowCapped } from "../../../../lib/spendGate";
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
// SPEND (2026-09-01, second pass). Every Details call below is preceded by ONE
// atomic ledger grant — spendAllowCapped(PROMOTE_SKU, month_cap) — exactly like
// every other metered path in this repo (places/search, photo, placeDetails).
// The first pass of this cron only asked "is the gate shut?" once per run; at
// the 600/hour ceiling that was an unbounded bill. Now the budget is a number
// in wf_promote_config.month_cap (default 4,800 = Google's Pro free tier, so
// the default is $0), counted down in wf_spend_ledger. When the ledger says
// no, the rest of the claimed batch is RELEASED (wf_promotion_release) — back
// to pending, attempt refunded, parked one hour — never marked failed. A
// budget refusal is not a fact about the place.
//
// SKU (same pass). The mask is CORE_DETAILS_MASK from lib/promoteDetails.js —
// Pro tier, 5,000 free/month — not the Enterprise+Atmosphere mask this cron
// shipped with (editorialSummary + rating/userRatingCount/priceLevel; 1,000
// free/month, 950 of which were gone 12 hours into September). Rating and
// review count come from the index (wf_place_ids.signals), which every queued
// place already carries; price and editorial are on-demand enrichment via
// lib/placeDetails.js and never gate a card's existence.
//
// COST AND CADENCE (2026-09-01). Place Details (New) at ~$0.017/record.
// batch_limit is no longer a hardcoded 25 — it is read live from
// public.wf_promote_config (migration 20260901_wf_promote_config.sql) and
// self-tunes between runs (lib/promoteThrottle.js), clamped to [1, 50]; a
// config read/parse failure falls back to the static 25 it replaced, never to
// 0 (silent stop) or unbounded. vercel.json now fires this every 5 minutes
// (12x/hour) rather than four times an hour: at the claim RPC's own 50-row
// cap that is a ~600/hour ceiling (12 x $0.85 = ~$10.20/hour worst case, only
// ever reached if every run earns the +25% step by staying under the 5% error
// bar with a full queue) with a self-imposed floor of 5/run the moment error
// rate climbs past 20% or Google returns a 429. The job idles at $0 the
// moment the queue is empty either way.
import { sbEnv } from "../../../../lib/serverCache";
import { recordPulse } from "../../../../lib/jobPulse";
import { decidePromotion, dedupeById, PROMOTE_METROS, metrosFromRows } from "../../../../lib/promoteIndex";
import { clampBatchLimit, nextBatchLimit } from "../../../../lib/promoteThrottle";
import { CORE_DETAILS_MASK, PROMOTE_SKU, withIndexSignals } from "../../../../lib/promoteDetails";
import { jobFailed } from "../../../../lib/jobFail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// force-no-store, AND cache:"no-store" on every fetch below. Belt AND braces,
// because the first production run without them cost a whole cycle — see the
// note above rpc(). lib/inventoryServe.js already sets no-store on every call
// for the same reason; this route just failed to copy that.
export const fetchCache = "force-no-store";
export const maxDuration = 60;

// The CORE mask (Pro tier) — see lib/promoteDetails.js for why it is not the
// full mask buildInventoryRow can consume. Shared with scripts/promote-worker.mjs
// so both write paths buy the same thing.
const DETAILS_MASK = CORE_DETAILS_MASK;

// A ledger refusal parks the rest of the batch for this long. One hour: long
// enough that an exhausted month does not cost 12 empty claim cycles an hour,
// short enough that a raised month_cap is picked up the same day.
const RELEASE_DELAY_MINUTES = 60;

const COST_PER_RECORD = 0.017;
const GKEY = () => (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A 4xx that is not a rate limit is a VERDICT about this place (gone, bad id),
// not a transient fault. Retrying it three times buys the same answer three times.
function isTerminalStatus(status) {
  return status >= 400 && status < 500 && status !== 429;
}

async function details(key, placeId) {
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
      `${s.url}/rest/v1/wf_promote_config?select=batch_limit,auto,month_cap&id=eq.1`,
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

// fetchIndexSignals — {place_id -> signals} for the claimed batch, from the
// index (wf_place_ids). This is where rating/reviews now come from instead of
// the Details call (see lib/promoteDetails.js). Failure returns an empty map,
// which is what the promoter sees for a place Google has no rating for
// (rating null, reviews 0) — the card still exists, it just has no stars yet.
async function fetchIndexSignals(s, placeIds) {
  const out = new Map();
  if (!placeIds.length) return out;
  try {
    const ids = placeIds.map((id) => `"${id}"`).join(",");
    const r = await fetch(
      `${s.url}/rest/v1/wf_place_ids?select=place_id,signals&place_id=in.(${ids})`,
      { cache: "no-store", headers: { apikey: s.key, authorization: "Bearer " + s.key } }
    );
    if (!r.ok) { console.warn(`[promote-index] wf_place_ids signals lookup ${r.status} — promoting without index rating/reviews`); return out; }
    for (const row of await r.json()) if (row && row.place_id) out.set(row.place_id, row.signals || null);
  } catch (e) {
    console.warn(`[promote-index] wf_place_ids signals unavailable this run: ${String(e && e.message).slice(0, 120)}`);
  }
  return out;
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
  // Monthly budget (migration 20260901_wf_promote_spend_cap_and_release.sql).
  // A missing row/column reads as the free tier (4,800), never as unlimited —
  // spendAllowCapped fails closed on anything that is not a positive number.
  const monthCap = configRow && configRow.month_cap != null ? Number(configRow.month_cap) : 4800;
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

  // Rating + review count for the batch, from the index — see fetchIndexSignals.
  const indexSignals = await fetchIndexSignals(s, claimed.map((c) => c.place_id));

  const writeRows = [];
  const okIds = [];
  const rejects = [];
  const retries = [];
  const released = [];

  let budgetExhausted = false;
  for (const item of claimed) {
    // THE MONEY GUARD. One atomic ledger grant per Google call, before the call.
    // The first refusal means the month's budget is gone — every later place in
    // this batch would be refused too, so stop asking and hand them all back.
    if (budgetExhausted || !(await spendAllowCapped(PROMOTE_SKU, monthCap))) {
      budgetExhausted = true;
      released.push(item.place_id);
      continue;
    }
    const d = await details(gkey, item.place_id);
    if (!d.ok) {
      (d.terminal ? rejects : retries).push({ place_id: item.place_id, name: item.name, error: d.error });
      continue;
    }
    // ONE decision, shared with the hand-run promoter and locked by
    // scripts/test-promote-decision.mjs. A "reject" is a verdict about the DATA
    // (unclassifiable, closed, out of bounds) — re-fetching buys the same answer,
    // so the queue must not retry it and pay Google again.
    const place = withIndexSignals(d.place, indexSignals.get(item.place_id));
    const verdict = decidePromotion(place, item.metro, nowIso, adjudicated.get(item.place_id) || null, metros);
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
  // Budget refusals: back to pending, attempt refunded, parked — see the
  // migration. Deliberately NOT wf_promotion_complete(p_ok:false): that path
  // burns an attempt and would reject a good place after three empty months.
  for (const id of released) settle.push(rpc(s, "wf_promotion_release", { p_place_id: id, p_delay_minutes: RELEASE_DELAY_MINUTES, p_note: `spend ledger: ${PROMOTE_SKU} month_cap ${monthCap} reached` }));
  await Promise.allSettled(settle);

  const attempted = claimed.length - released.length; // places we actually paid to look at
  const succeeded = writeError ? 0 : written;
  const note = writeError
    ? `upsert failed: ${writeError.slice(0, 120)}`
    : budgetExhausted
      ? `budget: ${PROMOTE_SKU} month_cap ${monthCap} reached; released ${released.length}/${claimed.length}`.slice(0, 200)
      : (succeeded === 0 && attempted > 0 ? `0/${attempted} promoted; top reject: ${(rejects[0] && rejects[0].error) || "none"}`.slice(0, 200) : null);
  // attempted counts only what was bought. A run that released its whole batch
  // pulses as attempted 0 with the budget note, so job-watch reads it as IDLE
  // (budget), never as "tried everything, achieved nothing".
  await recordPulse("promote-index", { attempted, succeeded, note });

  // Adaptive step (2026-09-01) — see lib/promoteThrottle.js. `errors` here is
  // OPERATIONAL distress (transient/retry fetch failures + a failed upsert),
  // never decidePromotion's own data verdicts — an unclassifiable or
  // out-of-bounds place is a correct reject and must not throttle the drain.
  // `queueNonEmpty` is a proxy (a full claim), not a fresh COUNT query — see
  // the comment on nextBatchLimit for why that tradeoff is deliberate.
  const errors = retries.length + (writeError ? okIds.length : 0);
  const sawRateLimit = retries.some((r) => /\b429\b/.test(r.error || ""));
  const queueNonEmpty = claimed.length >= limit;
  // ledgerDenials is the throttle's own input for budget refusals: a batch that
  // was mostly released halves the NEXT claim, so an exhausted month costs a
  // handful of claim/release round trips an hour instead of fifty.
  const nextLimit = autoTune
    ? nextBatchLimit(configBatchLimit, { attempted: claimed.length, errors, ledgerDenials: released.length, sawRateLimit, queueNonEmpty })
    : configBatchLimit; // auto=false is an operator pin — leave batch_limit exactly as configured
  await writePromoteConfig(s, { batchLimit: nextLimit, promoted: succeeded, rejected: rejects.length, errors });

  return Response.json({
    ok: !writeError,
    metro: metro || "(all)",
    claimed: claimed.length,
    promoted: succeeded,
    rejected: rejects.length,
    retrying: retries.length,
    released: released.length,
    budgetExhausted,
    monthCap,
    deduped: dropped,
    estimatedSpendUSD: Math.round(attempted * COST_PER_RECORD * 100) / 100,
    writeError,
    batchLimit: configBatchLimit,
    nextBatchLimit: nextLimit,
    // Full reasons, not counts. The whole point of #438 was that a count told
    // you nothing about WHICH service was failing.
    rejectSample: rejects.slice(0, 5),
    retrySample: retries.slice(0, 5),
  });
}
