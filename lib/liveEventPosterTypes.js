// lib/liveEventPosterTypes.js
//
// The only mapping a caller of <LiveEventPoster type="..."> needs to know
// about. Deliberately a thin, plain (non-JSX) file so it can be imported
// both by the component and by plain-node tests without a JSX transpiler.
//
// The only live poster type is sports. The Concerts ("LIVE TONIGHT") live
// poster was removed by owner direction 2026-10-06 and must not come back
// (scripts/check-live-event-poster-laws.mjs locks it).
//   sports -> mode "summer-sports" -> byRail.sports (segment: sport)
export const LIVE_POSTER_TYPE_CONFIG = Object.freeze({
  sports: Object.freeze({ mode: "summer-sports", bucketKey: "sports", label: "Sporting Events" }),
});
