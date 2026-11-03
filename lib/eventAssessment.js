// lib/eventAssessment.js - what a wf_events score of 0 means, in ONE place.
//
// wf_events.editorial_score, uniqueness_score and popularity_score all default to 0 in
// Postgres, and the publishers that land verified rows (scripts/festivals/publish.mjs,
// scripts/local-calendars) never write them: a score is only ever written by an editorial
// pass that also writes the summary, why_go and verdict (docs/editorial-standard.md: the
// score confirms what the words already made the reader feel). On 2026-11-03, 402 of the
// ~480 upcoming rows carried the default. So 0 and null mean NOT YET ASSESSED. They never
// mean "assessed as poor": no editorial pass has ever written a 0.
//
// Policy (owner follow up, 2026-11-03): ranking must keep "not yet assessed" distinct from
// "assessed low". An unassessed row ranks at a neutral prior, not at the bottom:
//   editorial  7.0  the bottom of the normal assessed band (assessed rows run 6 to 9.2, most
//                   at 7 or above), so a real 7.2 still beats it and a real 6 still loses
//   uniqueness 5.0  the middle of the 10 point scale (assessed rows run 5 to 8.5)
//   popularity 5.0  the middle of the 10 point scale (assessed rows run 5.5 to 8)
// Every ranking surface reads scores through assessedScore(); none reads the column raw.
export const ASSESSMENT_PRIORS = Object.freeze({ editorial_score: 7, uniqueness_score: 5, popularity_score: 5 });

/** True when the row carries a real assessment for `field` (a number above 0). */
export function isAssessed(row, field = "editorial_score") {
  const n = Number(row?.[field]);
  return Number.isFinite(n) && n > 0;
}

/** The assessed value for `field`, or that field's neutral prior when the row is unassessed. */
export function assessedScore(row, field = "editorial_score") {
  if (!(field in ASSESSMENT_PRIORS)) throw new Error("assessedScore: unknown field " + field);
  return isAssessed(row, field) ? Number(row[field]) : ASSESSMENT_PRIORS[field];
}
