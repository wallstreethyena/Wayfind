// The venue-photo rung for a curated event's own page and the events hub card.
//
// WHY (owner, 2026-10-01, on /florida-events/ananda-farm-fall-festival-2026):
// "this place has a picture on the place card but when I click on it the page
// does not have anything." The Fall rail card resolves its image through
// fallEventCardImageSrc — the row's hero, else the venue's OWN photo by exact
// place_id (/api/photo?place=…), with the registry place_id merged in at read
// time — while the event page only knew owned event photography and the stored
// hero_image column. A live sweep found 33 of the 110 rail cards that link to
// /florida-events/<slug> landing on an initials panel this way.
//
// This is that same ladder, not a second one: the registry merge
// (mergeFallDiscoveryRows, which also applies withFallVenueIdentity) and the
// card law (fallEventCardImageSrc — image holds, collection poster rejected,
// exact place_id only, never a neighbour's photo) are reused as-is. Width 640
// on purpose: it is byte-for-byte the URL the card already loaded, so the page
// reuses the cached photo instead of asking /api/photo for a new size.
import { fallEventCardImageSrc, mergeFallDiscoveryRows } from "./fallEventImage.js";
import { FALL_DISCOVERIES_2026 } from "./fallDiscoveries2026.js";
import { FALL_FEATURED_FESTIVALS_2026 } from "./fallFeaturedFestivals2026.js";
import { FALL_GAP_FILL_2026_10_07 } from "./fallGapFill20261007.js";
import { FALL_FOOD_GAP_2026_10_08 } from "./fallFoodGap20261008.js";
import { FALL_TAMPA_PICKS_2026_10_08 } from "./fallTampaPicks20261008.js";

export const EVENT_VENUE_PHOTO_WIDTH = 640;

const REGISTRY_BY_ID = new Map(
  // Every checked-in registry the card merges (2026-10-08: the gap fills and
  // the Tampa pass were missing, so their pages lost the card's venue photo).
  [...FALL_DISCOVERIES_2026, ...FALL_FEATURED_FESTIVALS_2026, ...FALL_GAP_FILL_2026_10_07, ...FALL_FOOD_GAP_2026_10_08, ...FALL_TAMPA_PICKS_2026_10_08]
    .filter((row) => row?.event_id)
    .map((row) => [row.event_id, row]),
);

/**
 * The image the event's card shows, or "" when there is honestly none.
 * Image fields only — the merged row is never used for copy on the page.
 */
export function eventVenueImageSrc(row, w = EVENT_VENUE_PHOTO_WIDTH) {
  if (!row || !row.event_id) return "";
  const source = REGISTRY_BY_ID.get(row.event_id);
  const [resolved] = mergeFallDiscoveryRows([row], source ? [source] : []);
  return fallEventCardImageSrc(resolved, w) || "";
}

const TAMPA_PASS_BY_ID = new Map(FALL_TAMPA_PICKS_2026_10_08.map((row) => [row.event_id, row]));

/**
 * The Tampa pass's verified facts win on its own event pages, exactly as they
 * win on the card (mergeFallDiscoveryRows: registry identity and copy over the
 * stored row, the stored row's link-health verdicts kept). Owner, 2026-10-08:
 * "confirm the card, detail page, guide, and calendar agree." Scoped to the
 * Tampa pass so no other event page changes its copy here.
 */
export function withTampaPassFacts(row) {
  if (!row || !row.event_id) return row;
  const source = TAMPA_PASS_BY_ID.get(row.event_id);
  if (!source) return row;
  const [merged] = mergeFallDiscoveryRows([row], [source]);
  return merged || row;
}
