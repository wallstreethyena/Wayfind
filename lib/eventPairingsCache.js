// The curated event page is ISR, while eventPairings reads current inventory
// through cache: "no-store". Keep that live read inside a Data Cache boundary:
// otherwise Next can pre-render the page and then reject the same read on an
// ISR miss as a static-to-dynamic change.
import { unstable_cache } from "next/cache.js";
import { eventPairings } from "./eventPairings.js";

export const EVENT_PAIRINGS_CACHE_KEY = "event-pairings-v2";
export const EVENT_PAIRINGS_REVALIDATE_SECONDS = 3600;

export function createCachedEventPairings({ cache = unstable_cache, load = eventPairings } = {}) {
  const cachedByIdentity = cache(
    async (lat, lng, city, placeId) => load({
      lat,
      lng,
      city,
      place_id: placeId,
    }, { requireComplete: true }),
    [EVENT_PAIRINGS_CACHE_KEY],
    { revalidate: EVENT_PAIRINGS_REVALIDATE_SECONDS },
  );

  return async (event) => {
    try {
      const places = await cachedByIdentity(
        event?.lat,
        event?.lng,
        event?.city || null,
        event?.place_id || event?.placeId || null,
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
