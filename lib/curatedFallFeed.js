// lib/curatedFallFeed.js
//
// Plain (non-JSX, no Next imports) so plain-node tests can execute it.
import { curatedFeedEvents } from "./curatedEvents.js";
import { mergeFallDiscoveryRows, fallEventCardImageSrc } from "./fallEventImage.js";
import { isFallEvent } from "./fallPool.js";
import { FALL_DISCOVERIES_2026 } from "./fallDiscoveries2026.js";
import { FALL_FEATURED_FESTIVALS_2026 } from "./fallFeaturedFestivals2026.js";
import { FALL_GAP_FILL_2026_10_07 } from "./fallGapFill20261007.js";
import { FALL_FOOD_GAP_2026_10_08 } from "./fallFoodGap20261008.js";

// FALL ROWS GET THEIR OWN PHOTO (2026-10-06). The Events tab showed a stock
// smiling-woman community photo for Hunsader Farms' Pumpkin Festival because
// this feed built curated rows with hero_image NULL and never saw the checked-in
// fall registry that /api/events/fall already merges. Same registry, same
// merge, then the same image law (lib/fallEventImage.js): the row's own hero,
// else the venue's OWNED place photo (no paid Google lookup). A fall row is
// flagged isFall so the card never falls back to eventCategoryArt stock.
// CACHE VERSION: /api/events caches the merged feed for 21 days under a key
// that embeds this value. It is a content hash of the checked-in fall
// registries, so editing a registry changes the key by itself and rows cached
// before the merge existed (or before a registry edit) can never be served.
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
// FALL_DB_SEED_VERSION: bump this whenever a production wf_events seed adds fall
// rows that are NOT in a checked-in registry module (data/fall-2026-additions-*.json
// via scripts/seed-fall-additions-*.mjs). It is hashed into the key so the deploy
// that ships a DB seed also retires every cached /api/events payload computed
// before it, instead of waiting out the 21 day cache.
export const FALL_DB_SEED_VERSION = "2026-10-08-statewide-gap-fill-events-feed-paged";
export const FALL_FEED_CACHE_VERSION = fnv1a(JSON.stringify([FALL_DISCOVERIES_2026, FALL_FEATURED_FESTIVALS_2026, FALL_GAP_FILL_2026_10_07, FALL_FOOD_GAP_2026_10_08, FALL_DB_SEED_VERSION]));

// ONLY A REAL PAGE GETS AN INTERNAL LINK (2026-10-08). /florida-events/<slug>
// renders wf_events rows only. A registry-only fall row (checked in, never
// seeded) still carries a slug, so curatedToFeedEvent handed it curatedSlug and
// resolveDestination sent the Events-tab card to a 404 (Lakes Park, North Port,
// UTC, HarvestMoon on 2026-10-08). Same law /api/events/fall already applies
// (pageSlugs): keep curatedSlug only when a database row owns that exact slug;
// otherwise the card falls through to its validated official URL.
export function curatedFeedEventsWithFall(rows, opts) {
  const pageSlugs = new Set((Array.isArray(rows) ? rows : []).map((r) => r?.slug).filter(Boolean));
  const merged = mergeFallDiscoveryRows(rows, [...FALL_DISCOVERIES_2026, ...FALL_FEATURED_FESTIVALS_2026, ...FALL_GAP_FILL_2026_10_07, ...FALL_FOOD_GAP_2026_10_08]);
  const byEventId = new Map(merged.filter((r) => r?.event_id).map((r) => [r.event_id, r]));
  const seen = new Set();
  return curatedFeedEvents(merged, opts).filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  }).map((e) => {
    const linked = e.curatedSlug && !pageSlugs.has(e.curatedSlug) ? { ...e, curatedSlug: null } : e;
    const row = byEventId.get(String(e.id).replace(/^wfc:/, ""));
    if (!row || !isFallEvent(row)) return linked;
    const image = fallEventCardImageSrc(row, 640, null) || "";
    return { ...linked, isFall: true, image };
  });
}
