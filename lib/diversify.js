// lib/diversify.js — THE shared head-diversity rule, one implementation for
// every ranking sheet (owner directive 2026-08-07: the top of a sheet should
// be a mix, not three taco bars — but merit still dominates).
//
// The rule: in the visible head (top `head` rows), prefer a category mix —
// no two rows sharing a primary category — CONSTRAINED BY THE SCORE LAW
// (lib/wayfindScore.js): a row may only be promoted past another when their
// governed scores are EQUAL. Variety breaks ties; it never contradicts the
// number the reader compares. That constraint is what keeps "shown ==
// sorted" true on every sheet (scripts/check-score-law.mjs asserts the
// ranked output stays monotonic in the displayed score).
//
// Rows with no category are never displaced — an unknown type cannot be
// proven to collide. This started life as todaysBest's
// diversifyHeadScoreStable; it lives here so every sheet applies the SAME
// rule instead of growing per-surface variants that drift.

/**
 * @param {Array}  rows      sorted best-first; each row may carry
 *                           `governed_score` (the law's number) and a category
 * @param {number} [head=3]  how many visible head slots to diversify
 * @param {function} [categoryOf] row → primary category (default: primary_type)
 */
export function diversifyHeadScoreStable(rows, head = 3, categoryOf) {
  const catOf = typeof categoryOf === "function" ? categoryOf : (r) => r && r.primary_type;
  const out = [];
  const rest = (rows || []).slice();
  const seen = new Set();
  while (out.length < head && rest.length) {
    let i = rest.findIndex((r) => {
      const t = catOf(r);
      return !t || !seen.has(t);
    });
    if (i < 0) i = 0; // everything left collides — take the best of them
    // The law: promotion across a HIGHER governed score is forbidden. If the
    // first variety candidate scores below any row it would jump, take the
    // top row instead.
    if (i > 0) {
      const cand = rest[i];
      const jumped = rest.slice(0, i);
      const candScore = cand && cand.governed_score != null ? cand.governed_score : -Infinity;
      if (jumped.some((r) => (r && r.governed_score != null ? r.governed_score : -Infinity) > candScore)) i = 0;
    }
    const [picked] = rest.splice(i, 1);
    const t = catOf(picked);
    if (t) seen.add(t);
    out.push(picked);
  }
  return out.concat(rest);
}
