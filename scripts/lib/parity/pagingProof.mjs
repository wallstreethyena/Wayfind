// scripts/lib/parity/pagingProof.mjs — the exhaustive offset-page walk's own
// HONESTY bookkeeping (item 1/6, PR #1495 fix round: "an API hasMore:true
// with a missing offset page FAILS", not silently passes).
//
// Factored out of surface-parity-audit.mjs's fetchProdMembership so
// scripts/check-surface-parity-hermetic.mjs can drive the EXACT SAME walk
// against a fake server (no network) and prove it red/green, rather than
// re-implementing a shadow copy of the loop that could silently drift from
// what production actually runs.
//
// THE RULE THIS EXISTS TO ENFORCE: `hasMore: true` is a claim, not a proof.
// A walk is honestly "exhausted" only when it stops because the server
// itself said hasMore is no longer true (or handed back a short/empty page)
// -- never because the CALLER merely stopped asking (hit its own page cap)
// or because a page fetch failed outright. Both of the latter leave the true
// membership UNPROVEN, and unproven must never be silently reported the same
// as "confirmed absent".

/**
 * Walk `fetchPage(offset, page)` from offset 0 until the server reports
 * hasMore !== true, a page comes back empty, `maxPages` is reached, or a
 * fetch itself fails. `fetchPage` must never throw -- a failed fetch is
 * reported as `{ ok: false }` (matching fetchProdJSON's own shape), exactly
 * like a real HTTP failure the caller already caught.
 *
 * @param {{ maxPages: number, pageSize: number, fetchPage: (offset:number, page:number) => Promise<{ok:boolean, json:any}> }} args
 */
import { nextPageOffset } from "../../../lib/inventoryPaging.js";

export async function walkPagesToExhaustion({ maxPages, fetchPage }) {
  const ids = [];
  const idSet = new Set();
  const page0Ids = new Set();
  let offset = 0;
  let page = 0;
  let lastJson = null;
  let exhaustedCleanly = false;
  let stoppedByFailedFetch = false;
  for (; page < maxPages; page++) {
    const r = await fetchPage(offset, page);
    if (!r || !r.ok || !r.json || !Array.isArray(r.json.places)) { stoppedByFailedFetch = true; break; }
    lastJson = r.json;
    for (const p of r.json.places) {
      const id = p && (p.id || p.place_id);
      if (id && !idSet.has(id)) { idSet.add(id); ids.push(id); }
      if (page === 0 && id) page0Ids.add(id);
    }
    if (r.json.hasMore !== true) { exhaustedCleanly = true; break; }
    if (!r.json.places.length) { exhaustedCleanly = true; break; }
    // Same rule as the client continuation (lib/inventoryPaging.js): follow the
    // route's nextOffset, never the count of rows received, with the shared
    // overlap for ranking drift between page reads.
    offset = nextPageOffset(r.json, offset, r.json.places.length);
  }
  // Ran out of OUR OWN page budget while the server was still promising
  // more, and no fetch actually failed -- an audit-side limitation, still
  // unproven either way (never conflate with a clean exhaustion).
  const cutOffByMaxPages = !exhaustedCleanly && !stoppedByFailedFetch;
  return {
    ids, idSet, page0Ids, pages: page + 1,
    total: lastJson ? lastJson.total : null,
    hasMore: lastJson ? !!lastJson.hasMore : null,
    truncated: lastJson ? !!lastJson.truncated : null,
    source: lastJson ? lastJson.source : null,
    supportsPaging: lastJson ? Object.prototype.hasOwnProperty.call(lastJson, "hasMore") : false,
    exhaustedCleanly, stoppedByFailedFetch, cutOffByMaxPages,
  };
}

/**
 * The pair-level api_next_page_reachable fact (item 1): proven true ONLY
 * when the walk exhausted CLEANLY (see above) AND its id union covers every
 * ground-truth eligible id -- never inferred from the hasMore flag alone,
 * which is exactly what the pre-fix `supportsPaging && hasMore === true`
 * computation did and why it was almost always vacuously wrong (see
 * surface-parity-audit.mjs's fetchProdMembership doc comment).
 */
export function computeApiNextPageReachable(walk, eligibleIds) {
  if (!walk || walk.exhaustedCleanly !== true) return false;
  for (const id of eligibleIds || []) {
    if (!walk.idSet.has(id)) return false;
  }
  return true;
}
