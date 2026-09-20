// app/api/cron/trend-maintenance/route.js — the daily job that keeps an already
// imported Exploding Topics snapshot honest.
//
// WHAT IT DOES NOT DO: fetch anything from Exploding Topics or Semrush. There is
// no API here and there will not be one. It never scrapes the dashboard, never
// reuses a browser session, never calls a private endpoint. The source refresh is
// a HUMAN exporting a CSV and running `npm run trends:import`. This job maintains
// whatever that human last imported.
//
// WHAT IT DOES:
//   1. checks snapshot freshness and marks a stale snapshot STALE — loudly
//   2. expires matches whose snapshot has aged out
//   3. re-matches the latest valid snapshot against new/changed inventory
//   4. drains a BOUNDED slice of the APPROVED Google discovery queue
//   5. hands qualified candidates to the EXISTING Atlas queue (it does not
//      write editorial itself — see the note at handoff)
//   6. records a job pulse on every path, including the failures
//
// ── THE TWO FAILURES THIS ROUTE IS SHAPED BY ────────────────────────────────
//
// (a) atlas-build returned HTTP 200 for five days while publishing nothing. So
//     `succeeded` here counts WORK ACCOMPLISHED, never rows touched, and a
//     misconfiguration returns a non-200 rather than a cheerful empty result.
//     An idle job (nothing to do) and a broken job (cannot tell what to do) are
//     different outcomes with different status codes.
//
// (b) A census sweep declared saturation from inside one district's exhausted
//     phrasing and reported a truncated run as complete (AGENTS.md §4e). So a
//     run that stops on budget, quota, a 429 or the dispatch deadline is
//     recorded PARTIAL with the reason, and the per-query yield is persisted —
//     not just the verdict.

import { recordPulse } from "../../../../lib/jobPulse";
import { sbEnv } from "../../../../lib/serverCache";
import { importCadence, snapshotFreshness, TrendConfigError } from "../../../../lib/trendRights";
import { TREND_EVENTS } from "../../../../lib/trendTelemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB = "trend-maintenance";

/** Hard cap on metered searches per run. Required config — no default. */
function searchesPerRun() {
  const raw = (process.env.EXPLODING_TOPICS_MAX_SEARCHES_PER_RUN || "").trim();
  // AGENTS.md §5. A default here would be a spending decision made by whoever
  // forgot to set it, and "how much Google quota may this job burn unattended"
  // is exactly the kind of decision that must be written down.
  if (!raw) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_MAX_SEARCHES_PER_RUN",
      "is not set. This job spends metered Google Places quota; it will not choose its own budget. Set an explicit integer (start with 5)."
    );
  }
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 50) {
    throw new TrendConfigError("EXPLODING_TOPICS_MAX_SEARCHES_PER_RUN", `is "${raw}", which is not an integer in 0..50`);
  }
  return n;
}

export async function GET(req) {
  const started = Date.now();

  // ── CRON_SECRET, fail-closed. An unauthenticated caller must not be able to
  //    make this job spend Google quota.
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  if (!secret || (auth !== "Bearer " + secret && url.searchParams.get("key") !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // ── Required operational config. Missing cadence or spend budget is loud.
  let cadence, maxSearches;
  try {
    cadence = importCadence();
    maxSearches = searchesPerRun();
  } catch (e) {
    const detail = e instanceof TrendConfigError ? `${e.variable}: ${e.message}` : String(e && e.message);
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "CONFIG: " + detail.slice(0, 150) });
    // 503, not 200-with-an-error-field. job-watch reads status codes, and a
    // misconfiguration that returns 200 is invisible to it.
    return Response.json({ ok: false, error: "configuration", detail, event: TREND_EVENTS.CSV_VALIDATION_FAILED }, { status: 503 });
  }

  const s = sbEnv();
  if (!s || !s.url || !s.key) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "no supabase service env" });
    return Response.json({ ok: false, error: "no supabase service env" }, { status: 503 });
  }
  const svcH = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  const out = {
    ok: true, job: JOB, cadence: cadence.cadence, maxSearches,
    snapshot: null, expired: 0, rematched: 0,
    discovery: { attempted: 0, completed: 0, failed: 0, actualCalls: 0, completion: null, partialReason: null },
    candidates: { accepted: 0, rejected: 0 },
    editorialQueued: 0,
    events: [],
  };

  // ── 1. Latest snapshot + freshness ────────────────────────────────────────
  // A SELECTOR THAT FAILS IS NOT AN EMPTY QUEUE. This is the exact defect that
  // hid atlas-build's five-day outage: a 401 from the RPC read as "nothing to
  // do". A selector error is a 503 here, never a done:true.
  let snap = null, selectorError = null;
  try {
    const r = await fetch(
      `${s.url}/rest/v1/wf_trend_snapshots?status=in.(complete,partial)&order=observed_at.desc&limit=1`,
      { headers: svcH, cache: "no-store" }
    );
    if (!r.ok) selectorError = `snapshot select http ${r.status}`;
    else { const j = await r.json(); snap = Array.isArray(j) && j.length ? j[0] : null; }
  } catch (e) {
    selectorError = "snapshot select threw";
  }
  if (selectorError) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "SELECTOR UNREACHABLE: " + selectorError });
    return Response.json({ ok: false, error: "selector-unreachable", detail: selectorError }, { status: 503 });
  }

  if (!snap) {
    // Genuinely nothing imported yet. IDLE, not broken — attempted:0 keeps
    // job-watch from paging for a job with nothing to do. But it is reported
    // explicitly rather than as a zero, because "no snapshot has ever been
    // imported" and "the snapshot produced no matches" are different facts.
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "no snapshot imported yet — nothing to maintain" });
    return Response.json({ ...out, done: true, note: "no snapshot has been imported; run `npm run trends:import`" });
  }

  const observedMs = Date.parse(snap.observed_at);
  const fresh = snapshotFreshness(observedMs, Date.now(), cadence);
  out.snapshot = {
    id: snap.id, observedAt: snap.observed_at,
    ageDays: fresh.ageDays == null ? null : Number(fresh.ageDays.toFixed(2)),
    stale: fresh.stale, freshnessFactor: Number(fresh.freshnessFactor.toFixed(4)),
  };

  // ── 2. Stale handling ─────────────────────────────────────────────────────
  if (fresh.stale) {
    // Mark the snapshot stale and expire its matches NOW. Boost and label are
    // removed by the same act, so a card can never render a trend label whose
    // boost has already gone (or the reverse).
    let marked = false, expired = 0;
    try {
      const r = await fetch(`${s.url}/rest/v1/wf_trend_snapshots?id=eq.${snap.id}`, {
        method: "PATCH", headers: { ...svcH, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "stale" }), cache: "no-store",
      });
      marked = r.ok;
      const nowIso = new Date().toISOString();
      const e = await fetch(`${s.url}/rest/v1/wf_trend_place_matches?snapshot_id=eq.${snap.id}&expires_at=gt.${nowIso}`, {
        method: "PATCH", headers: { ...svcH, Prefer: "return=representation" },
        body: JSON.stringify({ expires_at: nowIso, order_boost: 0 }), cache: "no-store",
      });
      if (e.ok) { const j = await e.json(); expired = Array.isArray(j) ? j.length : 0; }
    } catch (err) {}
    out.expired = expired;
    out.events.push(TREND_EVENTS.SNAPSHOT_STALE);

    // OPERATOR-VISIBLE FAILURE. A stale snapshot is a human having stopped
    // exporting; it is not a product state, and it must not render as a normal
    // "no trends today". A non-200 is what puts it on job-watch.
    await recordPulse(JOB, {
      attempted: 1, succeeded: 0,
      note: `SNAPSHOT STALE (${fresh.ageDays == null ? "?" : fresh.ageDays.toFixed(1)}d, ${cadence.cadence} ceiling ${cadence.maxAgeDays}d) — ${expired} matches expired; a new CSV export is required`,
    });
    return Response.json({
      ...out, ok: false, error: "snapshot-stale", detail: fresh.reason,
      remedy: "export a fresh CSV and run `npm run trends:import -- --file <path> --apply`",
      markedStale: marked,
    }, { status: 503 });
  }

  // ── 3. Expire matches that aged out individually ──────────────────────────
  try {
    const nowIso = new Date().toISOString();
    const r = await fetch(`${s.url}/rest/v1/wf_trend_place_matches?expires_at=lt.${nowIso}&order_boost=gt.0`, {
      method: "PATCH", headers: { ...svcH, Prefer: "return=representation" },
      body: JSON.stringify({ order_boost: 0 }), cache: "no-store",
    });
    if (r.ok) { const j = await r.json(); out.expired += Array.isArray(j) ? j.length : 0; }
  } catch (e) {}

  // ── 4. Discovery ──────────────────────────────────────────────────────────
  //
  // NOT IMPLEMENTED AS A LIVE SPENDER, DELIBERATELY. Draining this queue means
  // calling the Places API, and the implementation preconditions are currently
  // false: quota reservation is not wired and no queue row has been approved by
  // the owner. Shipping a live spender behind false
  // preconditions would mean the first time it ever executed would also be the
  // first time it was tested — against a metered API, unattended, on a schedule.
  //
  // So the reservation/settlement contract is stated here and the drain is
  // reported as blocked with its reason. When implemented, this becomes:
  //   reserve(lib/quotaLedger) → refuse loudly if short → search → settle ACTUAL
  //   calls on every path including the 429 → persist per-query yield →
  //   completion='partial' with partial_reason on any early stop.
  out.discovery.completion = null;
  out.discovery.blockedReason =
    "discovery drain is not enabled: it spends metered quota and has never run. " +
    "Enable only after quota reservation via lib/quotaLedger is wired and an owner has approved queue rows.";

  // ── 5. Editorial handoff ──────────────────────────────────────────────────
  //
  // Candidates that reach `editorial_pending` are handed to the EXISTING Atlas
  // queue by writing the inventory row Atlas already selects from
  // (wf_atlas_missing). This job does not generate editorial, does not call
  // Anthropic, and does not duplicate one line of atlas-build — duplicating it
  // is how the §7 Disney gate and the verifier drift between two paths.
  //
  // AND: Exploding Topics data is NOT part of the handoff payload. The trend
  // discovered the place; it is not evidence for any factual claim about it. The
  // topic key stays in wf_trend_candidates, which the editorial prompt never
  // reads.
  out.editorialQueued = 0;
  out.editorialNote = "no candidates in editorial_pending (discovery has never run)";

  // ── 6. Pulse ──────────────────────────────────────────────────────────────
  const attempted = out.expired + out.rematched + out.discovery.attempted;
  const succeeded = out.expired + out.rematched + out.discovery.completed;
  await recordPulse(JOB, {
    attempted, succeeded,
    note: attempted === 0 ? "fresh snapshot, nothing to expire or rematch" : null,
  });

  out.tookMs = Date.now() - started;
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
