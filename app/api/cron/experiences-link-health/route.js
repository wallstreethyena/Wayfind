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
import { jobCannotRun } from "../../../../lib/jobFail.js";
import { recordPulse as recordPulseOnce } from "../../../../lib/jobPulse.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KEY = () => credential(process.env["VIATOR_API_KEY"]);
const VH = () => ({ "exp-api-key": KEY(), "Accept": "application/json;version=2.0", "Accept-Language": "en-US" });
const JOB = "experiences-link-health";
// One clock includes the worklist read: probes stop starting at 30s, work
// (including ALL serial PATCHes) ends by 42s, and the watchdog fires at 48s.
// This leaves room to record a pulse before maxDuration (60s).
const PROBE_BUDGET_MS = 30000;
const WATCHDOG_MS = 48000;
const WORK_BUDGET_MS = 42000;

// Race as well as abort: an uncooperative fetch/body must not strand the run.
// The linked signal also prevents a timed-out sweep from starting later writes.
async function bounded(operation, timeoutMs, parentSignal) {
  const ctrl = new AbortController();
  let timer, onAbort;
  const stopped = new Promise((_, reject) => {
    onAbort = () => {
      ctrl.abort();
      const error = new Error("link-health budget exhausted");
      error.name = "AbortError";
      reject(error);
    };
    if (parentSignal?.aborted || timeoutMs <= 0) onAbort();
    else {
      parentSignal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(onAbort, timeoutMs);
    }
  });
  try {
    if (ctrl.signal.aborted) return await stopped;
    return await Promise.race([operation(ctrl.signal), stopped]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onAbort);
  }
}

async function probe(code, signal) {
  try {
    return await bounded(async (probeSignal) => {
      const r = await fetch("https://api.viator.com/partner/products/" + encodeURIComponent(code), {
        cache: "no-store", signal: probeSignal, headers: VH(),
      });
      let body = null;
      if (r.status === 200) {
        try { body = await r.json(); }
        catch (error) {
          return { verdict: "unknown", reason: probeSignal.aborted || error?.name === "AbortError" ? "timeout" : error?.name === "SyntaxError" ? "invalid_json" : "network_error" };
        }
      }
      const d = describeProductProbe(r.status, body);
      return r.status === 429 ? { ...d, retryAfterMs: parseRetryAfter(r.headers && r.headers.get ? r.headers.get("retry-after") : null) } : d;
    }, 6000, signal);
  } catch (error) {
    return { verdict: "unknown", reason: error?.name === "AbortError" ? "timeout" : "network_error" };
  }
}

// Polite pacing for the one provider host (api.viator.com). Defaults keep a
// normal sweep inside the 60s function budget; unstarted rows remain queued.
// Env overrides exist so the guard can run the real route with zero waits.
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

  const startedAt = Date.now();
  const controller = new AbortController();
  const watchdogMs = Math.min(num("LINK_HEALTH_WATCHDOG_MS", WATCHDOG_MS), WATCHDOG_MS);
  const context = {
    signal: controller.signal,
    probeDeadlineAt: startedAt + Math.min(num("LINK_HEALTH_PROBE_BUDGET_MS", PROBE_BUDGET_MS), PROBE_BUDGET_MS, watchdogMs),
    workDeadlineAt: startedAt + Math.min(WORK_BUDGET_MS, watchdogMs),
    attempted: 0,
  };
  let pulseWrite = null;
  const recordPulse = (job, row) => {
    if (pulseWrite) return pulseWrite;
    pulseWrite = bounded(() => recordPulseOnce(job, row), 5000).catch(() => false);
    return pulseWrite;
  };
  const failed = async (reason) => {
    // If the watchdog already aborted the sweep, this failure IS a watchdog
    // cancellation, whichever pulse lands first — name it that way. Without
    // this, a slow runner lets the read fail (and record its pulse) before
    // the watchdog timer fires, and the recorded cause is timing luck.
    // "Already aborted" is judged by the CLOCK as well as the signal: a
    // budget armed from startedAt (the worklist read: min(6000, workDeadlineAt
    // - now)) shares the watchdog's deadline but is armed LATER than the
    // watchdog timer, so on a loaded runner it can fire first while the signal
    // is still un-aborted. That race failed Vercel production builds #1912
    // (10-21) and #1962 (10-24) in check-experiences-link-health, and
    // reproduced locally 2/48 runs under 16-way parallel load.
    const pastWatchdog = controller.signal.aborted || Date.now() >= startedAt + watchdogMs;
    const note = pastWatchdog ? `watchdog: sweep cancelled (${reason})` : reason;
    await recordPulse(JOB, { attempted: context.attempted, succeeded: 0, failed: 1, note });
    return Response.json({ ok: false, job: JOB, error: reason, ranWork: true }, { status: 500, headers: { "cache-control": "no-store" } });
  };
  let timer, watchdogExpired = false;
  const watchdog = new Promise((resolve) => {
    timer = setTimeout(async () => {
      watchdogExpired = true;
      controller.abort();
      await recordPulse(JOB, { attempted: context.attempted, succeeded: 0, failed: 1, note: `watchdog: sweep still running after ${Math.round(watchdogMs / 1000)}s; cancelled` });
      resolve(Response.json({ ok: false, job: JOB, error: "watchdog: sweep exceeded its time budget" }, { status: 500, headers: { "cache-control": "no-store" } }));
    }, watchdogMs);
  });
  let res = null, crashed = null;
  try { res = await Promise.race([sweep(sp, s, h, (row) => recordPulse(JOB, row), failed, context), watchdog]); } catch (e) { crashed = e; }
  clearTimeout(timer);
  controller.abort();
  // Safety net: a no-op when the sweep or the watchdog already pulsed; records
  // a failed pulse if the sweep crashed or returned without writing one.
  await recordPulse(JOB, { attempted: 0, succeeded: 0, failed: 1, note: (crashed ? "unhandled: " + String((crashed && crashed.message) || crashed) : "sweep ended without recording a pulse").slice(0, 200) });
  if (watchdogExpired) res = Response.json({ ok: false, job: JOB, error: "watchdog: sweep exceeded its time budget" }, { status: 500, headers: { "cache-control": "no-store" } });
  else if (crashed) res = Response.json({ ok: false, job: JOB, error: "unhandled sweep error" }, { status: 500, headers: { "cache-control": "no-store" } });
  return res;
}

async function sweep(sp, s, h, pulse, failed, context) {

  const limit = Math.min(Math.max(parseInt(sp.get("limit") || "150", 10) || 150, 1), 400);
  // Oldest-checked first, never-checked before everything: a full 3,400-row
  // catalogue completes a sweep in ~2 weeks at 250/night, and every row a
  // sweep touches restarts at the back of the queue.
  const sel = `${s.url}/rest/v1/wf_experiences?select=product_code,link_ok,fail_count&provider=eq.viator&order=last_checked_at.asc.nullsfirst&limit=${limit}`;
  let rows;
  try {
    const result = await bounded(async (signal) => {
      const r = await fetch(sel, { headers: h, cache: "no-store", signal });
      return { status: r.status, ok: r.ok, rows: r.ok ? await r.json() : null };
    }, Math.min(6000, context.workDeadlineAt - Date.now()), context.signal);
    if (!result.ok) return failed(`unavailable: wf_experiences read failed (HTTP ${result.status})`);
    rows = result.rows;
  } catch { return failed("unavailable: wf_experiences read did not complete"); }
  if (!Array.isArray(rows)) return failed("unavailable: wf_experiences returned a malformed worklist");
  if (!rows.length) {
    await pulse({ attempted: 0, succeeded: 0, failed: 0, note: "healthy idle: no experiences due for checking" });
    return Response.json({ ok: true, checked: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  if (context.signal.aborted) return failed("unavailable: sweep cancelled");
  const attemptedCodes = new Set();
  const raw = await runPoliteProbes(rows.map((row) => row.product_code), async (code) => {
    attemptedCodes.add(code);
    context.attempted = attemptedCodes.size;
    return probe(code, context.signal);
  }, {
    concurrency: num("LINK_HEALTH_CONCURRENCY", 2) || 1,
    minGapMs: num("LINK_HEALTH_PACE_MS", 250),
    backoffBaseMs: num("LINK_HEALTH_BACKOFF_MS", 1000),
    deadlineAt: context.probeDeadlineAt,
    signal: context.signal,
    sleep: (ms) => bounded((signal) => new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
    }), Math.max(0, context.probeDeadlineAt - Date.now()), context.signal).catch(() => {}),
  });
  // Rows never reached before the deadline stay untouched (still oldest-checked,
  // so tomorrow's sweep starts with them).
  const notReached = raw.filter((p) => p === null).length;
  const retries = raw.retries || 0;
  const probes = raw.filter((p) => p !== null);
  rows = rows.filter((_, i) => raw[i] !== null);
  if (!rows.length) {
    await pulse({ attempted: 0, succeeded: 0, failed: 1, note: `deadline hit before any probe ran; left=${notReached}` });
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
  const noteFor = (write) => JSON.stringify({ ...(write ? { write } : {}), ...(notReached ? { left: notReached } : {}), probes: pulseOutcomes });
  const probeNote = noteFor();

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
      const remaining = context.workDeadlineAt - Date.now();
      if (context.signal.aborted || remaining <= 0) return "patch-budget-exhausted";
      const r = await bounded((signal) => fetch(`${s.url}/rest/v1/wf_experiences?${filter}`, {
        method: "PATCH", headers: { ...h, Prefer: "return=minimal" }, body: JSON.stringify(body), cache: "no-store", signal,
      }), Math.min(8000, remaining), context.signal);
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
    // Keep the structured diagnosis intact and failure counters unchanged.
    const error = err ? `health-state persistence failed: ${err}` : "all provider probes were inconclusive";
    await pulse({ attempted: rows.length, succeeded: 0, failed: 1,
      note: noteFor(err) });
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
