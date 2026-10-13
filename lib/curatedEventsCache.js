// lib/curatedEventsCache.js — SERVER-ONLY. The one hourly-cached curated event
// list for pages that render the whole set (/florida-events, /go/florida).
// See lib/cachePack.js for why the entry is packed and scrubbed.
import { unstable_cache } from "next/cache";
import { fetchCuratedEvents } from "./curatedEvents";
import { packForCache, unpackFromCache } from "./cachePack.js";

export function cachedCuratedEventList(label, keyParts) {
  const read = unstable_cache(
    async () => packForCache(label, await fetchCuratedEvents({ fresh: true, signal: AbortSignal.timeout(8000) })),
    keyParts,
    { revalidate: 3600, tags: ["curated-events"] },
  );
  return async () => unpackFromCache(await read());
}
