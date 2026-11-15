// lib/eventSeriesHubs.js
//
// A multi-date tour can have a Wayfind hub page that compares every Florida
// date (owner, 2026-11-12: Cosmic Baseball). Each event page in the series
// links to its hub, and the hub links back to every event page, so a reader
// who lands on one date can choose the right one.
//
// Matching is by the exact event_series_id prefix we wrote for that tour,
// never by title text, so an unrelated "cosmic" event can never pick it up.

export const EVENT_SERIES_HUBS = Object.freeze([
  Object.freeze({
    seriesPrefix: "cosmic-baseball-",
    href: "/cosmic-baseball-florida",
    label: "Compare every Florida Cosmic Baseball date",
  }),
]);

/** The hub for this event's series, or null. */
export function seriesHubFor(e) {
  const id = String(e?.event_series_id || "");
  if (!id) return null;
  return EVENT_SERIES_HUBS.find((h) => id.startsWith(h.seriesPrefix)) || null;
}
