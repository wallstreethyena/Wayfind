// lib/thisWeekEventsServer.js - SERVER-ONLY cached read for the homepage "This week in Florida" strip.
// The filtering and card shape are in lib/thisWeekEvents.js (pure, guard-tested).
import { unstable_cache } from "next/cache";
import { fetchCuratedEvents } from "./curatedEvents.js";
import { thisWeekEventCards } from "./thisWeekEvents.js";
import { siteTodayStr } from "./siteTime.js";
import { DB_DEADLINE_MS } from "./fetchDeadline.js";

const cachedUpcoming = unstable_cache(
  // Page awaits this optional strip before returning its shell. Keep a cold
  // database read inside the homepage's 6s probe budget; every SDK attempt
  // shares this one deadline. A failed read still throws out of the cache.
  async (today) => fetchCuratedEvents({ fresh: true, upcomingFrom: today, signal: AbortSignal.timeout(DB_DEADLINE_MS) }),
  ["this-week-events-v1"],
  { revalidate: 3600, tags: ["curated-events"] },
);

/** Server entry for app/page.js. Never throws: an outage or a build-time skip renders no strip. */
export async function thisWeekEventsForHome(today = siteTodayStr()) {
  try {
    return thisWeekEventCards(await cachedUpcoming(today), today, { now: new Date() });
  } catch (error) {
    return [];
  }
}
