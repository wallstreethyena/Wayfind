// lib/editorialSource.js — ONE name for the editorial source, so the rule that
// governs it can be CALLED rather than grepped.
//
// 2026-09-05. Every serving path must read the gated view
// wf_editorial_servable, never the raw wf_editorial table: the view re-checks
// on every read that the place still has an OPERATIONAL wf_inventory row, so a
// venue that closes AFTER its editorial was published stops serving instantly.
//
// The name lived as a bare string in seven call sites. Writing the fix, a
// hand-written list of six of them missed a seventh — which is the argument for
// a constant rather than a convention. It is also what lets
// scripts/check-editorial-read-gate.mjs assert on a RETURNED VALUE instead of
// only walking source text (check-guard-honesty flagged the walk-only version,
// correctly).
//
// Pure: no fetches, no env, no fs.

/** The ONLY editorial relation a serving path may read. */
export const EDITORIAL_SERVING_SOURCE = "wf_editorial_servable";

/** The raw table. Writes and crons only — never a serving read. */
export const EDITORIAL_RAW_TABLE = "wf_editorial";

/**
 * Is `name` an acceptable source for a path that will show editorial to a
 * reader? Only the gated view is. The raw table is not, and neither is anything
 * that merely starts with it — "wf_editorial_backup" must not slip through on a
 * prefix match.
 */
export function isServingSource(name) {
  return String(name || "").trim() === EDITORIAL_SERVING_SOURCE;
}

/**
 * The PostgREST path for a serving read, so a caller cannot typo the relation.
 * @param {string} query  the query string WITHOUT a leading "?"
 */
export function servingPath(query) {
  const q = String(query || "").replace(/^\?/, "");
  return `${EDITORIAL_SERVING_SOURCE}${q ? "?" + q : ""}`;
}
