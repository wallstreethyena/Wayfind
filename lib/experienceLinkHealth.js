// lib/experienceLinkHealth.js — pure decision logic for the wf_experiences
// link-health sweep (app/api/cron/experiences-link-health).
//
// WHY THIS EXISTS (2026-08-26 affiliate deep-link audit). wf_experiences rows
// are created by the nightly ingest (top-50 per destination x tag). A product
// that Viator retires — or that merely falls out of its top-50 — simply stops
// being refreshed: its row keeps serving, /api/commerce/go keeps 302ing to its
// stored product_url, and Viator answers a retired product URL with a redirect
// to search/"similar experiences". That is the exact owner-reported symptom
// ("takes me to the search area with multiple other activities instead of the
// specific activity"): the click was attributed and the redirect was correct,
// but the DESTINATION had died. The columns for this (link_ok, last_checked_at,
// fail_count) already existed but were stamped exactly once (2026-08-22) and
// nothing refreshed them — a pipeline that ran once is indistinguishable from
// no pipeline.
//
// Lives in lib/ so scripts/check-experiences-link-health.mjs can CALL these
// functions against real inputs (CLAUDE.md: "assert on the CALL, not on the
// string") — a Next route module may only export the handler.

// Two consecutive probe failures (404/410) before a row is declared dead:
// a single CDN hiccup must not un-list a paying product overnight.
export const DEAD_AFTER_FAILS = 2;

/**
 * Classify one GET https://api.viator.com/partner/products/{code} probe.
 * The endpoint is already in production use (app/api/viator/curated liveCard),
 * so this adds no new API surface.
 *
 * - 200 + status ACTIVE            -> "alive"
 * - 200 + any other status value   -> "dead_confirmed" (Viator says INACTIVE —
 *                                     authoritative, no second opinion needed)
 * - 404 / 410                      -> "dead_probe" (unknown code; needs
 *                                     DEAD_AFTER_FAILS consecutive hits)
 * - anything else (401/403/429/5xx/network/no status field)
 *                                  -> "unknown" — OUR failure, never the
 *                                     product's. A rate-limit or key problem
 *                                     must not mass-kill the catalogue.
 */
export function classifyProductProbe(httpStatus, body) {
  if (httpStatus === 200) {
    const st = body && typeof body.status === "string" ? body.status.trim().toUpperCase() : "";
    if (st === "ACTIVE") return "alive";
    if (st) return "dead_confirmed";
    return "unknown";
  }
  if (httpStatus === 404 || httpStatus === 410) return "dead_probe";
  return "unknown";
}

// Fixed reason codes only: never persist provider bodies, URLs or exception
// messages. The compatibility classifier remains the sole health decision.
export function describeProductProbe(httpStatus, body) {
  const verdict = classifyProductProbe(httpStatus, body);
  let reason;
  if (httpStatus === 200) reason = verdict === "alive" ? "active" : verdict === "dead_confirmed" ? "inactive" : "missing_status";
  else if ([401, 403, 404, 410, 429].includes(httpStatus)) reason = `http_${httpStatus}`;
  else reason = httpStatus >= 500 && httpStatus < 600 ? "http_5xx" : "http_other";
  // `outcome` names WHY a verdict is unknown when the cause is the provider
  // throttling or blocking US (429 / 401 / 403). Those are "retry later"
  // outcomes: never dead, never a health write, never a fail_count bump.
  const outcome = httpStatus === 429 ? "rate_limited" : httpStatus === 401 || httpStatus === 403 ? "blocked" : verdict;
  return { verdict, reason, outcome };
}

/** 429 = rate_limited, 401/403 = blocked. Both are OUR problem, never the product's. */
export function isThrottleOutcome(outcome) { return outcome === "rate_limited" || outcome === "blocked"; }

/**
 * Retry-After header (delta-seconds or HTTP date) -> milliseconds, or null.
 * Clamped to [0, maxMs] so a hostile/buggy header cannot park the cron.
 */
export function parseRetryAfter(value, now = Date.now(), maxMs = 10000) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  let ms;
  if (/^\d+(\.\d+)?$/.test(raw)) ms = Number(raw) * 1000;
  else { const t = Date.parse(raw); if (!Number.isFinite(t)) return null; ms = t - now; }
  if (!Number.isFinite(ms)) return null;
  return Math.min(Math.max(ms, 0), maxMs);
}

/**
 * Polite probe runner for ONE provider host: a hard concurrency cap, a minimum
 * gap between request starts, and 429 handling that honours Retry-After (else
 * exponential backoff), pauses EVERY worker via a shared cooldown, and retries
 * a bounded number of times. A 429 that survives its retries comes back as
 * outcome "rate_limited" (verdict unknown) - it is never converted to dead.
 *
 * probeOnce(code) -> { verdict, reason, outcome, retryAfterMs? }.
 * Codes not started before `deadlineAt` resolve to null (not probed: leave the
 * row untouched so it stays at the front of the next sweep).
 */
export async function runPoliteProbes(codes, probeOnce, opts = {}) {
  const {
    concurrency = 2, minGapMs = 250, maxRetries = 2, backoffBaseMs = 1000, maxWaitMs = 10000,
    deadlineAt = Infinity, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => Date.now(),
  } = opts;
  const out = new Array(codes.length).fill(null);
  let next = 0, slot = 0, cooldownUntil = 0, retries = 0;
  const pace = async () => {
    const t = now();
    const start = Math.max(t, slot, cooldownUntil);
    slot = start + minGapMs;
    if (start > t) await sleep(start - t);
  };
  async function one(code) {
    let res = null;
    for (let attempt = 0; ; attempt++) {
      await pace();
      if (now() >= deadlineAt) return res;
      res = await probeOnce(code);
      if (res.outcome !== "rate_limited" || attempt >= maxRetries) return res;
      const wait = Math.min(maxWaitMs, res.retryAfterMs != null ? res.retryAfterMs : backoffBaseMs * 2 ** attempt);
      if (now() + wait >= deadlineAt) return res;
      cooldownUntil = Math.max(cooldownUntil, now() + wait);
      retries++;
    }
  }
  async function worker() { while (next < codes.length) { const i = next++; out[i] = await one(codes[i]); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, codes.length) }, worker));
  out.retries = retries;
  return out;
}

/**
 * Fold a probe verdict into the row's next health state.
 * @param {{link_ok?:boolean|null, fail_count?:number|null}} prev
 * @param {"alive"|"dead_confirmed"|"dead_probe"|"unknown"} verdict
 * @returns {{link_ok:boolean|null, fail_count:number}|null} null = only bump
 *   last_checked_at (verdict "unknown" — no evidence either way).
 */
export function nextHealthState(prev, verdict) {
  const fails = Number.isFinite(prev && prev.fail_count) ? prev.fail_count : 0;
  if (verdict === "alive") return { link_ok: true, fail_count: 0 };
  if (verdict === "dead_confirmed") return { link_ok: false, fail_count: fails + 1 };
  if (verdict === "dead_probe") {
    const n = fails + 1;
    const wasDead = !!(prev && prev.link_ok === false);
    return { link_ok: wasDead || n >= DEAD_AFTER_FAILS ? false : (prev && typeof prev.link_ok === "boolean" ? prev.link_ok : null), fail_count: n };
  }
  return null;
}

/**
 * The one serving-side filter every wf_experiences reader must apply:
 * a row proven dead is not an offer. null/undefined (never checked yet)
 * still serves — the sweep, not the reader, decides.
 */
export function dropDeadLinkRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((r) => r && r.link_ok !== false);
}
