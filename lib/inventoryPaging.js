// lib/inventoryPaging.js — where the next inv=1 page starts. Shared by the
// client continuation (app/home.js) and the parity audit's page walk
// (scripts/lib/parity/pagingProof.mjs) so the two can never disagree.
//
// 2026-09-23 (post-deploy parity audit of #1495). Two ways a place fell
// between pages:
//   1. Counting the rows RECEIVED. The attractions/family discovery branch adds
//      up to six exact-ID candidates to page 0 on top of the 400 ranked rows,
//      so "offset += rows received" skipped the ranked row at 400 (measured:
//      The Escape Company, Orlando, Activities > All). The route now says
//      where the ranked read stopped (`nextOffset`) and that wins.
//   2. Ranking drift. Each page is a fresh ranked read, and the edge cache can
//      serve pages computed at different times. A rating or review count that
//      changes in between can move a place across the boundary. Starting each
//      later page INV_PAGE_OVERLAP rows early re-reads the edge; the client
//      already de-duplicates by id.
export const INV_PAGE_OVERLAP = 20;

export function nextPageOffset(json, requestedOffset, receivedCount) {
  const from = Math.max(0, Math.floor(Number(requestedOffset) || 0));
  const reported = json && Number.isFinite(Number(json.nextOffset)) ? Math.floor(Number(json.nextOffset)) : null;
  const next = reported != null ? reported : from + Math.max(0, Math.floor(Number(receivedCount) || 0));
  if (!(next > from)) return next; // no progress to overlap; the caller's hasMore check ends the walk
  return Math.max(from + 1, next - INV_PAGE_OVERLAP);
}
