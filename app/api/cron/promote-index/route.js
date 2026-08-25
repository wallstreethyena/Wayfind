import { gateShut } from "../../../../lib/spendGate";
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
// COST AND CADENCE. Place Details (New) at ~$0.017/record. ?limit is hard-capped
// at 25, so a single invocation can never spend more than ~$0.43 no matter what
// calls it. vercel.json fires this four times an hour (:05 :20 :35 :50) rather
// than hourly: the initial backlog is 4,732 places, and at 25/hour that is eight
// days of a visibly thin map. At 100/hour the home market clears in about 16
// hours and the whole backlog in two days, then the queue is only ever the
// trickle the enqueue trigger adds — a handful an hour — so the steady-state
// spend collapses to near zero on its own. The ceiling is bounded either way:
// four fires x $0.43 = $1.72/hour worst case, and the job idles at $0 the moment
// the queue is empty.
import { sbEnv } from "../../../../lib/serverCache";
import { recordPulse } from "../../../../lib/jobPulse";
import { decidePromotion, dedupeById, PROMOTE_METROS } from "../../../../lib/promoteIndex";
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

const HARD_LIMIT = 25;              // per invocation, ~$0.43 ceiling
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

export async function GET(req) {
  // COST GUARD (2026-08-25): WAYFIND_GATE=shut stops ALL metered Google spend.
  if (gateShut()) return NextResponse.json({ skipped: "gate shut" });
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

  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "10", 10) || 10, HARD_LIMIT));
  const metroParam = (url.searchParams.get("metro") || "").trim();
  if (metroParam && !PROMOTE_METROS[metroParam]) {
    return Response.json({ ok: false, error: `unknown metro "${metroParam}"`, known: Object.keys(PROMOTE_METROS) });
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

  for (const item of claimed) {
    const d = await details(gkey, item.place_id);
    if (!d.ok) {
      (d.terminal ? rejects : retries).push({ place_id: item.place_id, name: item.name, error: d.error });
      continue;
    }
    // ONE decision, shared with the hand-run promoter and locked by
    // scripts/test-promote-decision.mjs. A "reject" is a verdict about the DATA
    // (unclassifiable, closed, out of bounds) — re-fetching buys the same answer,
    // so the queue must not retry it and pay Google again.
    const verdict = decidePromotion(d.place, item.metro, nowIso, adjudicated.get(item.place_id) || null);
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
  await Promise.allSettled(settle);

  const succeeded = writeError ? 0 : written;
  const note = writeError
    ? `upsert failed: ${writeError.slice(0, 120)}`
    : (succeeded === 0 && claimed.length > 0 ? `0/${claimed.length} promoted; top reject: ${(rejects[0] && rejects[0].error) || "none"}`.slice(0, 200) : null);
  await recordPulse("promote-index", { attempted: claimed.length, succeeded, note });

  return Response.json({
    ok: !writeError,
    metro: metro || "(all)",
    claimed: claimed.length,
    promoted: succeeded,
    rejected: rejects.length,
    retrying: retries.length,
    deduped: dropped,
    estimatedSpendUSD: Math.round(claimed.length * COST_PER_RECORD * 100) / 100,
    writeError,
    // Full reasons, not counts. The whole point of #438 was that a count told
    // you nothing about WHICH service was failing.
    rejectSample: rejects.slice(0, 5),
    retrySample: retries.slice(0, 5),
  });
}
