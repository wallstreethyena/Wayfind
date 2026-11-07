// lib/eventAssessment.js - what a wf_events score of 0 means, in ONE place.
//
// wf_events.editorial_score, uniqueness_score and popularity_score all default to 0 in
// Postgres, and the publishers that land verified rows (scripts/festivals/publish.mjs,
// scripts/local-calendars) never write them: a score is written only by an editorial pass
// (docs/editorial-standard.md: the score confirms what the words already made the reader
// feel). Measured 2026-11-04 on the 579 upcoming, not cancelled rows: 497 carry editorial 0,
// 82 carry a written score (editorial 6 to 9.5, uniqueness 6 to 9.9, popularity 5 to 9.7),
// none is null and none is outside 0 to 10. 99 of the 0 rows do carry an editorial_summary
// (written by publishers and backfills, without a score), so text alone does not mean scored.
// The schema has no field that marks a row as assessed, so a deliberate assessed 0 cannot be
// told apart from the default; the rubric never writes one (lowest written score: 6). So:
//   "unassessed"  null, missing or 0 (the default)
//   "assessed"    a finite number above 0 and at most 10
//   "invalid"     anything else (negative, above 10, not a number): never shown, never
//                 trusted, ranked like an unassessed row and reported by assessmentState()
//
// Policy (owner follow up, 2026-11-03): ranking must keep "not yet assessed" distinct from
// "assessed low". An unassessed row ranks at a neutral prior, not at the bottom:
//   editorial  7.0  inside the assessed band (6 to 9.5), so a real 7.2 still beats it and a
//                   real 6 still loses
//   uniqueness 5.0  the middle of the 10 point scale
//   popularity 5.0  the middle of the 10 point scale
// The prior is a RANKING input only. No surface renders it as a rating (owner, 2026-11-04:
// "The neutral prior must never appear publicly as an earned editorial rating"); event
// scores are not rendered on any public page. Every ranking surface reads scores through
// assessedScore(); none reads the column raw (scripts/check-event-assessment-readers.mjs).
export const ASSESSMENT_PRIORS = Object.freeze({ editorial_score: 7, uniqueness_score: 5, popularity_score: 5 });

/** "unassessed" | "assessed" | "invalid" for `field` (see the header). */
export function assessmentState(row, field = "editorial_score") {
  const v = row?.[field];
  if (v == null || v === "") return "unassessed";
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*[+-]?(\d+(\.\d*)?|\.\d+)\s*$/.test(v) ? Number(v) : NaN;
  if (!Number.isFinite(n) || n < 0 || n > 10) return "invalid";
  return n === 0 ? "unassessed" : "assessed";
}

/** True when the row carries a real assessment for `field` (above 0, at most 10). */
export function isAssessed(row, field = "editorial_score") {
  return assessmentState(row, field) === "assessed";
}

/** The assessed value for `field`, or that field's neutral prior when the row is unassessed. */
export function assessedScore(row, field = "editorial_score") {
  if (!(field in ASSESSMENT_PRIORS)) throw new Error("assessedScore: unknown field " + field);
  return isAssessed(row, field) ? Number(row[field]) : ASSESSMENT_PRIORS[field];
}
