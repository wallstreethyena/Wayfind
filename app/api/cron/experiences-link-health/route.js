// app/api/cron/experiences-link-health/route.js — the nightly wf_experiences
// destination sweep. Walks the catalogue oldest-checked-first, asks Viator's
// own product endpoint whether each product still exists and is ACTIVE, and
// writes link_ok / fail_count / last_checked_at. Serving paths and
// /api/commerce/go refuse link_ok=false rows, so a product Viator retires
// stops being offered within a sweep cycle instead of 302ing users to
// Viator's "similar experiences" search page (the 2026-08-26 owner report).
//
// Fail-CLOSED auth (same contract as cron/experiences). Provider uncertainty
// never marks a product dead, but a run that cannot establish any health
// verdict fails loudly and records a pulse instead of looking successful.
import { sbEnv } from "../../../../lib/serverCache.js";
import { describeProductProbe, nextHealthState, parseRetryAfter, runPoliteProbes } from "../../../../lib/experienceLinkHealth.js";
import { credential } from "../../../../lib/envPlaceholder.js";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail.js";
import { recordPulse as recordPulseOnce } from "../../../../lib/jobPulse.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = () => credential(process.env["VIATOR_API_KEY"]);
const VH = () => ({ "exp-api-key": KEY(), "Accept": "application/json;version=2.0", "Accept-Language": "en-US" });
const JOB = "experiences-link-health";
// Time budget inside maxDuration (60s): probes stop at 30s (a probe in flight
// adds <=6s), then the PATCHes (8s cap each), and the watchdog answers at 48s.
const PROBE_BUDGET_MS = 30000;
const WATCHDOG_MS = 48000;

async function probe(code) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const r = await fetch("https://api.viator.com/partner/products/" + encodeURIComponent(code), {
      cache: "no-store", signal: ctrl.signal, headers: VH(),
    });
    let body = null;
    if (r.status === 200) {
      try { body = await r.json(); }
      catch (error) {
        return { verdict: "unknown", reason: ctrl.signal.aborted || error?.name === "AbortError" ? "timeout" : error?.name === "SyntaxError" ? "invalid_json" : "network_error" };
      }
    }
    const d = describeProductProbe(r.status, body);
    return r.status === 429 ? { ...d, retryAfterMs: parseRetryAfter(r.headers && r.headers.get ? r.headers.get("retry-after") : null) } : d;
  } catch {
    return { verdict: "unknown", reason: ctrl.signal.aborted ? "timeout" : "network_error" };
  } finally { clearTimeout(timer); }
}

// Polite pacing for the one provider host (api.viator.com). Defaults keep a
// 150-row sweep inside the 60s function budget; env overrides exist so the
// guard can run the real route with zero waits.
const num = (k, d) => { const n = Number(process.env[k]); return Number.isFinite(n) && n >= 0 ? n : d; };

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const sp = new URL(req.url).searchParams;
  const manual = sp.get("key");
  if (!secret || (auth !== "Bearer " + secret && manual !== secret)) {
    return new Response("unauthorized", { status: 401 });
  }
  if (!KEY()) return jobCannotRun(JOB, "VIATOR_API_KEY is missing or unusable");
  const s = sbEnv();
  if (!s) return jobCannotRun(JOB, "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL is missing");
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  // 2026-10-14 06:35Z: the first run after the polite-pacing change (#1727) was
  // killed by "Vercel Runtime Timeout Error: Task timed out after 60 seconds"
  // and wrote NO pulse - a killed function cannot report, so the owner saw
  // silence, not failure. Two defences: (1) the sweep keeps its own time
  // budget well inside maxDuration (probes stop at PROBE_BUDGET_MS, every
  // Supabase PATCH is aborted after 8s), and (2) a WATCHDOG answers first: if
  // the sweep is still running at WATCHDOG_MS it records a failed pulse and
  // returns 500 while the platform can still run code. Exactly one pulse is
  // ever written per run (the `pulse` gate), whichever side finishes first.
  let pulsed = false;
  // Shadows the import on purpose: GET's exits all go through ONE gate so a run
  // writes exactly one pulse. jobFailed (the sweep's own failure exits) counts
  // as the pulse for that run.
  const recordPulse = async (row) => { if (pulsed) return false; pulsed = true; return recordPulseOnce(JOB, row); };
  const failed = (reason) => { pulsed = true; return jobFailed(JOB, reason); };
  const watchdogMs = num("LINK_HEALTH_WATCHDOG_MS", WATCHDOG_MS);
  let timer;
  const watchdog = new Promise((resolve) => {
    timer = setTimeout(async () => {
      await recordPulse({ attempted: 0, succeeded: 0, failed: 1, note: `watchdog: sweep still running after ${Math.round(watchdogMs / 1000)}s; aborted so the run is visible (see runtime logs)`.slice(0, 200) });
      resolve(Response.json({ ok: false, job: JOB, error: "watchdog: sweep exceeded its time budget" }, { status: 500, headers: { "cache-control": "no-store" } }));
    }, watchdogMs);
  });
  let res = null, crashed = null;
  try { res = await Promise.race([sweep(sp, s, h, recordPulse, failed), watchdog]); } catch (e) { crashed = e; }
  clearTimeout(timer);
  // Safety net: a no-op when the sweep or the watchdog already pulsed; records
  // a failed pulse if the sweep crashed or returned without writing one.
  await recordPulse({ attempted: 0, succeeded: 0, failed: 1, note: (crashed ? "unhandled: " + String((crashed && crashed.message) || crashed) : "sweep ended without recording a pulse").slice(0, 200) });
  return crashed ? Response.json({ ok: false, job: JOB, error: "unhandled sweep error" }, { status: 500, headers: { "cache-control": "no-store" } }) : res;
}

async function sweep(sp, s, h, pulse, failed) {

  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "150", 10) || 150, 1), 400);
  // Oldest-checked first, never-checked before everything: a full 3,400-row
  // catalogue completes a sweep in ~2 weeks at 250/night, and every row a
  // sweep touches restarts at the back of the queue.
  const sel = `${s.url}/rest/v1/wf_experiences?select=product_code,link_ok,fail_count&provider=eq.viator&order=last_checked_at.asc.nullsfirst&limit=${limit}`;
  let rows;
  try {
    const r = await fetch(sel, { headers: h, cache: "no-store" });
    if (!r.ok) return failed(`unavailable: wf_experiences read failed (HTTP ${r.status})`);
    rows = await r.json();
  } catch { return failed("unavailable: wf_experiences read did not complete"); }
  if (!Array.isArray(rows)) return failed("unavailable: wf_experiences returned a malformed worklist");
  if (!rows.length) {
    await pulse({ attempted: 0, succeeded: 0, failed: 0, note: "healthy idle: no experiences due for checking" });
    return Response.json({ ok: true, checked: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  const started = Date.now();
  const raw = await runPoliteProbes(rows.map((row) => row.product_code), probe, {
    concurrency: num("LINK_HEALTH_CONCURRENCY", 2) || 1,
    minGapMs: num("LINK_HEALTH_PACE_MS", 250),
    backoffBaseMs: num("LINK_HEALTH_BACKOFF_MS", 1000),
    deadlineAt: started + num("LINK_HEALTH_PROBE_BUDGET_MS", PROBE_BUDGET_MS),
  });
  // Rows never reached before the deadline stay untouched (still oldest-checked,
  // so tomorrow's sweep starts with them).
  const notReached = raw.filter((p) => p === null).length;
  const retries = raw.retries || 0;
  const probes = raw.filter((p) => p !== null);
  rows = rows.filter((_, i) => raw[i] !== null);
  if (!rows.length) {
    await pulse({ attempted: 0, succeeded: 0, failed: 1, note: "deadline hit before any probe ran" });
    return Response.json({ ok: false, job: JOB, error: "deadline hit before any probe ran" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
  const verdicts = probes.map((p) => p.verdict);
  const probeOutcomes = {}, unknownOutcomes = {};
  for (const { verdict, reason } of probes) {
    probeOutcomes[reason] = (probeOutcomes[reason] || 0) + 1;
    if (verdict === "unknown") unknownOutcomes[reason] = (unknownOutcomes[reason] || 0) + 1;
  }
  // The pulse's 200-character budget holds all nine fixed unknown codes even
  // at the 400-row cap. Full outcomes remain in the authenticated response.
  const pulseOutcomes = Object.keys(unknownOutcomes).length ? unknownOutcomes : probeOutcomes;
  const probeNote = JSON.stringify({ probes: pulseOutcomes });

  const nowIso = new Date().toISOString();
  const buckets = { alive: [], dead: [], unknown: [], deferred: [] }; // arrays of product_code
  const perRow = []; // rows needing an individual fail_count write
  rows.forEach((row, i) => {
    const next = nextHealthState(row, verdicts[i]);
    if (!next) {
      // 429 (rate_limited) = retry later: NO write, so the row keeps its place
      // at the front of the queue. 401/403 (blocked) and other unknowns only
      // advance last_checked_at. None touches link_ok or fail_count.
      if (probes[i].outcome === "rate_limited") buckets.deferred.push(row.product_code);
      else buckets.unknown.push(row.product_code);
      return;
    }
    // Only an actually-alive verdict belongs in the bulk reset bucket. A
    // first 404 deliberately keeps link_ok=true but increments fail_count;
    // bulk-resetting that row to fail_count=0 made the second-strike threshold
    // unreachable and allowed retired products to serve forever.
    if (verdicts[i] === "alive") buckets.alive.push(row.product_code);
    else perRow.push({ code: row.product_code, next });
    if (next.link_ok === false) buckets.dead.push(row.product_code);
  });

  const inList = (codes) => codes.map((c) => `"${String(c).replace(/["\\]/g, "")}"`).join(",");
  const patch = async (filter, body) => {
    try {
      const r = await fetch(`${s.url}/rest/v1/wf_experiences?${filter}`, {
        method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      return r.ok ? null : `patch-${r.status}`;
    } catch {
      return "patch-fetch-error";
    }
  };

  let err = null;
  if (buckets.alive.length) err = err || await patch(`product_code=in.(${encodeURIComponent(inList(buckets.alive))})`, { link_ok: true, fail_count: 0, last_checked_at: nowIso });
  for (const { code, next } of perRow) {
    err = err || await patch(`product_code=eq.${encodeURIComponent(code)}`, { link_ok: next.link_ok, fail_count: next.fail_count, last_checked_at: nowIso });
  }
  if (buckets.unknown.length) err = err || await patch(`product_code=in.(${encodeURIComponent(inList(buckets.unknown))})`, { last_checked_at: nowIso });

  const stats = {
    checked: rows.length,
    alive: buckets.alive.length,
    newly_or_still_dead: buckets.dead.length,
    unknown: buckets.unknown.length + buckets.deferred.length,
    rate_limited_deferred: buckets.deferred.length,
    not_reached: notReached,
    probe_retries: retries,
    probe_outcomes: probeOutcomes,
  };
  const definitive = buckets.alive.length + perRow.length;
  if (err || definitive === 0) {
    // jobFailed truncates its prose reason to 180 chars. Keep the structured
    // diagnosis intact and the existing failure status/counters unchanged.
    const error = err ? `health-state persistence failed: ${err}` : "all provider probes were inconclusive";
    await pulse({ attempted: rows.length, succeeded: 0, failed: 1,
      note: JSON.stringify({ ...(err ? { write: err } : {}), probes: pulseOutcomes }) });
    return Response.json({ ok: false, job: JOB, error, ranWork: true, attempted: rows.length, succeeded: 0, ...stats },
      { status: 500, headers: { "cache-control": "no-store" } });
  }

  await pulse({
    attempted: rows.length,
    succeeded: definitive,
    failed: buckets.unknown.length + buckets.deferred.length,
    note: probeNote,
  });
  return Response.json({ ok: true, error: null, ...stats }, { headers: { "Cache-Control": "no-store" } });
}
