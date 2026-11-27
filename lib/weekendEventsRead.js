// lib/weekendEventsRead.js — the ONE cached read of curated events for a
// weekend window, shared by /events/<city>/this-weekend and the "this weekend"
// section of /things-to-do/<city> (2026-11-27). Same cache key for both, so a
// crawl of 20 city pages answers from one 15-minute entry instead of 20 reads.
import { unstable_cache } from "next/cache";
import { fetchCuratedEvents } from "./curatedEvents.js";
import { packForCache, unpackFromCache } from "./cachePack.js";

const readPacked = unstable_cache(
  async (start, end) => packForCache("regional-weekend", await fetchCuratedEvents({
    fresh: true, upcomingFrom: start, startsThrough: end,
  })),
  ["regional-weekend-events-v1"],
  { revalidate: 900, tags: ["curated-events"] },
);

/** Curated rows that may run in [start, end] (YMD). Throws on a failed read; callers fail soft. */
export async function readWeekendEvents(start, end) {
  return unpackFromCache(await readPacked(start, end));
}
