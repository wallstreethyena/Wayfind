// The curated event page is ISR, while eventPairings reads current inventory
// through cache: "no-store". Keep that live read inside a Data Cache boundary:
// otherwise Next can pre-render the page and then reject the same read on an
// ISR miss as a static-to-dynamic change.
import { unstable_cache } from "next/cache.js";
import { eventPairings } from "./eventPairings.js";

export const EVENT_PAIRINGS_CACHE_KEY = "event-pairings-v1";
export const EVENT_PAIRINGS_REVALIDATE_SECONDS = 3600;

export function createCachedEventPairings({ cache = unstable_cache, load = eventPairings } = {}) {
  const cachedByIdentity = cache(
    async (lat, lng, city, placeId) => load({
      lat,
      lng,
      city,
      place_id: placeId,
    }),
    [EVENT_PAIRINGS_CACHE_KEY],
    { revalidate: EVENT_PAIRINGS_REVALIDATE_SECONDS },
  );

  return (event) => cachedByIdentity(
    event?.lat,
    event?.lng,
    event?.city || null,
    event?.place_id || event?.placeId || null,
  );
}

export const cachedEventPairings = createCachedEventPairings();
