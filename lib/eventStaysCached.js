// lib/eventStaysCached.js — THE ONE DATA-CACHE ENTRY FOR AN EVENT'S STAYS.
//
// app/components/EventStays.js (the server-rendered rail) and
// app/api/events/venue-nearby/route.js (the browser re-anchor after Apple moves
// a provider venue) both read stays for a point. They share this wrapper so one
// point costs one cache entry, whoever asks first: the same key, the same
// lifetime, the same eventStays({ lat, lng }) call. The inventory reads stay
// inside a Data Cache boundary so they cannot switch the parent ISR event page
// to dynamic rendering at runtime.
import { unstable_cache } from "next/cache.js";
import { eventStays } from "./eventStays.js";

export const EVENT_STAYS_CACHE_KEY = "event-stays-v4";
export const EVENT_STAYS_REVALIDATE_SECONDS = 3600;

export function createCachedEventStays({ cache = unstable_cache, load = eventStays } = {}) {
  return cache(
    async (lat, lng) => load({ lat, lng }),
    [EVENT_STAYS_CACHE_KEY],
    { revalidate: EVENT_STAYS_REVALIDATE_SECONDS },
  );
}

export const cachedEventStays = createCachedEventStays();
