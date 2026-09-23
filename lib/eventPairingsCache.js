// The curated page is ISR, while eventPairings reads current inventory
// through cache: "no-store". Keep that live read inside a Data Cache boundary:
// otherwise Next can pre-render the page and then reject the same read on an
// ISR miss as a static-to-dynamic change.
//
// v3 (2026-09-22): the outing engine (lib/eventOuting.js) picks different
// places for the SAME venue depending on what's happening there — a food
// festival at an amphitheater wants no restaurant slot, a concert at the
// same amphitheater wants dinner before the show. classifyEvent(event) runs
// OUTSIDE unstable_cache, before the cache boundary, and its result is
// passed in as an extra cache-key argument — so a concert and a food
// festival at one venue land in separate Data Cache entries instead of one
// venue-keyed entry silently serving the wrong archetype's picks to
// whichever event asked second. The key bump to v3 also drops any
// pre-outing-engine entry that still holds a bare governed-score sort.
import { unstable_cache } from "next/cache.js";
import { eventPairings } from "./eventPairings.js";
import { classifyEvent } from "./eventOuting.js";

export const EVENT_PAIRINGS_CACHE_KEY = "event-pairings-v3";
export const EVENT_PAIRINGS_REVALIDATE_SECONDS = 3600;

export function createCachedEventPairings({ cache = unstable_cache, load = eventPairings } = {}) {
  const cachedByIdentity = cache(
    async (lat, lng, city, placeId, outingJson) => load({
      lat,
      lng,
      city,
      place_id: placeId,
      // Parsed back out of the cache key rather than re-classified, so the
      // cached entry and the classification that produced it can never drift.
      outing: outingJson ? JSON.parse(outingJson) : null,
    }, { requireComplete: true }),
    [EVENT_PAIRINGS_CACHE_KEY],
    { revalidate: EVENT_PAIRINGS_REVALIDATE_SECONDS },
  );

  return async (event) => {
    try {
      const ctx = classifyEvent(event || {});
      const places = await cachedByIdentity(
        event?.lat,
        event?.lng,
        event?.city || null,
        event?.place_id || event?.placeId || null,
        JSON.stringify(ctx),
      );
      return { places, unavailable: false };
    } catch (error) {
      // Keep the ISR page available, but catch outside unstable_cache so an
      // unavailable or incomplete result never enters the pairing Data Cache.
      // The parent page still owns its normal ISR lifetime.
      console.error("eventPairingsCache: pairing inventory unavailable", error);
      return { places: [], unavailable: true };
    }
  };
}

export const cachedEventPairings = createCachedEventPairings();
