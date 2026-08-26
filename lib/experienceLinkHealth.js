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
