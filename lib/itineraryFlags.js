// lib/itineraryFlags.js — PostHog gates for Itinerary option B.
//
// Every new behavior is off until PostHog says the flag is exactly true.
// A missing SDK, a flag that has not loaded, or a thrown read all stay off.
// `itinerary_v2` is the kill switch: the specific flags do nothing without it.
// `itinerary_dates` and `itinerary_fill_day` are reserved (option C). This
// change does not build those screens.

export const ITINERARY_FLAG = {
  v2: "itinerary_v2",
  sync: "itinerary_sync",
  map: "itinerary_map",
  share: "itinerary_share",
  autoOrder: "itinerary_auto_order",
  dates: "itinerary_dates",
  fillDay: "itinerary_fill_day",
};

export const EMPTY_ITINERARY_FLAGS = Object.freeze({
  v2: false,
  sync: false,
  map: false,
  share: false,
  autoOrder: false,
  dates: false,
  fillDay: false,
});

function enabled(posthog, key) {
  try {
    if (!posthog || typeof posthog.isFeatureEnabled !== "function") return false;
    return posthog.isFeatureEnabled(key) === true;
  } catch (e) {
    return false;
  }
}

export function readItineraryFlags(posthog) {
  const v2 = enabled(posthog, ITINERARY_FLAG.v2);
  if (!v2) return { ...EMPTY_ITINERARY_FLAGS };
  return {
    v2: true,
    sync: enabled(posthog, ITINERARY_FLAG.sync),
    map: enabled(posthog, ITINERARY_FLAG.map),
    share: enabled(posthog, ITINERARY_FLAG.share),
    autoOrder: enabled(posthog, ITINERARY_FLAG.autoOrder),
    dates: enabled(posthog, ITINERARY_FLAG.dates),
    fillDay: enabled(posthog, ITINERARY_FLAG.fillDay),
  };
}
