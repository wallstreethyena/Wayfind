// lib/thisWeekEventsServer.js - SERVER-ONLY cached read for the homepage "This week in Florida" strip.
// The filtering and card shape are in lib/thisWeekEvents.js (pure, guard-tested).
import { unstable_cache } from "next/cache";
import { fetchCuratedEvents } from "./curatedEvents.js";
import { addDaysStr, THIS_WEEK_WINDOW_DAYS, thisWeekEventCards } from "./thisWeekEvents.js";
import { siteTodayStr } from "./siteTime.js";
import { DB_DEADLINE_MS } from "./fetchDeadline.js";
import { isSsgBuild } from "./landingInventory.js";

const cachedUpcoming = unstable_cache(
  // Page awaits this optional strip before returning its shell. Keep a cold
  // database read inside the homepage's 6s probe budget; every SDK attempt
  // shares this one deadline. A failed read still throws out of the cache.
  async (today) => fetchCuratedEvents({ fresh: true, upcomingFrom: today, startsThrough: addDaysStr(today, THIS_WEEK_WINDOW_DAYS), signal: AbortSignal.timeout(DB_DEADLINE_MS) }),
  ["this-week-events-v1"],
  { revalidate: 3600, tags: ["curated-events"] },
);

/** Server entry for app/page.js. Never throws: an outage or a build-time skip renders no strip. */
export async function thisWeekEventsForHome(today = siteTodayStr()) {
  // `next build` skips the database (fetchCuratedEvents returns [] under
  // isSsgBuild). That skip used to run INSIDE unstable_cache, so every deploy
  // stored an hour-long "no events" entry for today's key: the prerendered
  // homepage shipped with an empty strip, and the first regeneration an hour
  // later read that same stale [] again (stale-while-revalidate). Skip here,
  // outside the cache, so a build never writes an empty success. The client
  // fills the strip from /api/events/this-week until the page regenerates.
  if (isSsgBuild()) return [];
  try {
    return thisWeekEventCards(await cachedUpcoming(today), today, { now: new Date() });
  } catch (error) {
    return [];
  }
}
