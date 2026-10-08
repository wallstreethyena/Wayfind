// lib/editorialReconcile.js — the pure decision behind app/api/cron/editorial-reconcile.
//
// OWNER RULE (2026-10-07): "once it is written, it stays there." A verified
// editorial line is permanent. The only thing allowed to hide one is the place
// itself stopping being servable (closed, excluded) — and that hide must be
// REVERSIBLE: when the place is OPERATIONAL again, the same verified text comes
// back, without paying to research and write it a second time.
//
// Before this module the reconcile job only demoted (verified=false,
// issues=["not-servable-inventory"]). A place that was briefly marked closed and
// then reopened kept its line hidden forever. Measured 2026-10-07: 8 demoted
// rows, 1 of them already OPERATIONAL again and still hidden.
//
// Only rows whose ONLY issue is the reconcile marker are restored. A row that
// failed verification for any other reason never matches, so this can never
// publish unverified copy.
export const DEMOTE_MARKER = "not-servable-inventory";

/** True only for a row this job demoted itself and nothing else ever flagged. */
export function isReconcileDemoted(row) {
  return !!row && row.verified === false && Array.isArray(row.issues)
    && row.issues.length === 1 && row.issues[0] === DEMOTE_MARKER;
}

/**
 * @param {object} p
 * @param {string[]} p.published   place_ids with verified = true
 * @param {string[]} p.servable    place_ids in wf_editorial_servable
 * @param {{place_id:string, verified:boolean, issues:string[]|null}[]} p.demoted  candidate rows
 * @param {string[]} p.operational place_ids whose wf_inventory status is OPERATIONAL
 * @returns {{stale:string[], restore:string[]}}
 */
export function planReconcile({ published = [], servable = [], demoted = [], operational = [] } = {}) {
  const live = new Set(servable);
  const open = new Set(operational);
  const stale = published.filter((id) => !live.has(id));
  const restore = demoted.filter((r) => isReconcileDemoted(r) && open.has(r.place_id)).map((r) => r.place_id);
  return { stale, restore: [...new Set(restore)] };
}
