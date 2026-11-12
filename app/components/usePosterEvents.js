"use client";

import { selectPosterEvents } from "../../lib/posterEvents.js";
import { usePosterEventsWith, posterEventsKey, isSettledCurrent } from "./posterEventsCore.js";

export { posterEventsKey, isSettledCurrent };

const adapter = {
  select: selectPosterEvents,
  empty: (mode) => selectPosterEvents([], { mode, center: null }),
};

/** Bounded event fallback for standalone poster pages. Homepage drops disable
 * this hook and consume home.js's already-loaded, fully interactive cards. */
export function usePosterEvents(options) {
  return usePosterEventsWith(options || {}, adapter);
}
