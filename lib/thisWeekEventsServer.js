// lib/thisWeekEventsServer.js - SERVER-ONLY cached read for the homepage "This week in Florida" strip.
// The filtering and card shape are in lib/thisWeekEvents.js (pure, guard-tested).
import { unstable_cache } from "next/cache";
import { fetchCuratedEvents } from "./curatedEvents.js";
import { thisWeekEventCards } from "./thisWeekEvents.js";
import { siteTodayStr } from "./siteTime.js";

const cachedUpcoming = unstable_cache(
  async (today) => fetchCuratedEvents({ fresh: true, upcomingFrom: today, signal: AbortSignal.timeout(8000) }),
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
