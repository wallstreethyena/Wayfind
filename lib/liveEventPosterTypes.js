// lib/liveEventPosterTypes.js
//
// The only mapping a caller of <LiveEventPoster type="..."> needs to know
// about. Deliberately a thin, plain (non-JSX) file so it can be imported
// both by the component and by plain-node tests without a JSX transpiler.
//
// Both entries reuse EXISTING, already-shipped, real-Ticketmaster-
// classification buckets from lib/posterEvents.js -- nothing new was added
// there for this feature:
//   sports   -> mode "summer-sports" -> byRail.sports    (segment: sport)
//   concerts -> mode "date-night"    -> byRail.livemusic (segment: music;
//               posterEventBucket() explicitly excludes comedy from this
//               bucket, see lib/posterEvents.js)
// "date-night" is a pre-existing, unrelated intent-page label elsewhere in
// the app (app/date-night/page.js, DateNightRails.js); reusing it here only
// shares the event-classification logic, nothing else.
export const LIVE_POSTER_TYPE_CONFIG = Object.freeze({
  sports: Object.freeze({ mode: "summer-sports", bucketKey: "sports", label: "Sporting Events" }),
  concerts: Object.freeze({ mode: "date-night", bucketKey: "livemusic", label: "Concerts" }),
});
