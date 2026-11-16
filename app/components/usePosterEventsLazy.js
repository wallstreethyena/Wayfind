"use client";

import { usePosterEventsWith } from "./posterEventsCore.js";

// The SAME shared feed and stale-response protection as usePosterEvents.js
// (posterEventsCore.js), with lib/posterEvents.js behind a dynamic import so
// the whole event pipeline stays out of the homepage's initial JS. Only the
// homepage live poster tile uses this: it reads one bucket (byRail[bucketKey])
// and already treats a missing bucket as empty and `pending` as "show nothing",
// so the shape before the selector has loaded ({}) changes nothing visible.
const EMPTY = Object.freeze({});
const adapter = {
  select: (events, options) => import("../../lib/posterEvents.js").then((m) => m.selectPosterEvents(events, options)),
  empty: () => EMPTY,
};

export function usePosterEvents(options) {
  return usePosterEventsWith(options || {}, adapter);
}
