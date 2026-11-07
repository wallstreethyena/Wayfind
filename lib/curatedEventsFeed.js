// Server-only projection: the Events tab must see the same confirmed holiday
// research and licensed photography as the Christmas collection and detail pages.
import { mergeChristmasResearch, CHRISTMAS_DB_RESEARCH_IDS, CHRISTMAS_RESEARCH_ALIASES } from "./christmasResearch.js";
import { enrichChristmasEvent } from "./christmasPool.js";
import { supabase } from "./supabase.js";
import { christmasStaticPhotos, christmasPlaceFor, christmasTaggedPhotos } from "./christmasPlacePhotos.js";
import { FALL_EVENT_IMAGE_HOLDS } from "./fallEventImage.js";
import { curatedFeedEventsWithFall } from "./curatedFallFeed.js";

export function currentCuratedFeed(rows, opts) {
  const merged = mergeChristmasResearch(rows).filter((row) => !row.christmas_excluded && !row.season_undated)
    .map((row) => row.christmas_research_id ? enrichChristmasEvent(row) : row);
  const byId = new Map(merged.map((row) => [row.event_id, row]));
  return curatedFeedEventsWithFall(merged, opts).map((event) => {
    const row = byId.get(event.id.replace(/^wfc:/, ""));
    const christmas = !!row?.christmas_research_id || row?.tags?.includes("christmas") === true;
    const cover = christmas ? (christmasStaticPhotos(row.event_id, row.event_name)[0] || christmasStaticPhotos(row.slug, row.event_name)[0]) : null;
    if (!cover) return { ...event, christmas, imageBlocked: FALL_EVENT_IMAGE_HOLDS.has(row?.event_id) };
    const imageIsVenue = cover.context === "venue";
    return { ...event, christmas, image: cover.src, imageIsVenue,
      photoAttr: cover.credit.replace(/^Photo by /i, ""), photoAttrHref: cover.creditHref,
      visitFacts: { ...event.visitFacts, hero_image: cover.src, hero_image_kind: imageIsVenue ? "venue" : "event", image_is_venue: imageIsVenue, photoAttr: cover.credit.replace(/^Photo by /i, ""), photoAttrHref: cover.creditHref } };
  });
}

// A successful owned read replaces, rather than appends to, the cached curated
// subset. Removed/unconfirmed events must not survive a healthy refresh.
export function replaceCachedCurated(cached, fresh) {
  const previous = new Map((cached || []).filter((event) => event.curated).map((event) => [event.id, event]));
  const current = (fresh || []).map((event) => {
    const old = previous.get(event.id);
    // A healthy refresh updates facts/removals. Keep only the exact same
    // show's provider artwork that dedup already absorbed into the cache.
    // Otherwise replacing the curated subset would erase its photo on hit #2.
    if (event.image || event.imageBlocked || !old?.imageProvider || !old.image
      || event.date !== old.date || event.venue !== old.venue || event.name !== old.name) return event;
    return { ...event, image: old.image, thumb: old.thumb, imageProvider: old.imageProvider,
      imageIsVenue: old.imageIsVenue, photoAttr: old.photoAttr, photoAttrHref: old.photoAttrHref,
      visitFacts: event.visitFacts ? { ...event.visitFacts, hero_image: old.image,
        hero_image_kind: old.imageIsVenue ? "venue" : "event", image_is_venue: old.imageIsVenue === true,
        photoAttr: old.photoAttr, photoAttrHref: old.photoAttrHref } : event.visitFacts };
  });
  return [...(cached || []).filter((event) => !event.curated), ...current];
}


// One bounded, free owned-inventory read: tagged event photos stay attached to
// their exact Christmas event, rather than falling through to a generic venue
// photo/Google quota. A different event at the same venue is never a donor.
function photoEventKeys(event) {
  const id = event.id.replace(/^wfc:/, "");
  const canonical = (key) => {
    const research = CHRISTMAS_DB_RESEARCH_IDS[key] || key;
    return CHRISTMAS_RESEARCH_ALIASES[research] || research;
  };
  return [...new Set([id, canonical(id), ...Object.keys({ ...CHRISTMAS_DB_RESEARCH_IDS, ...CHRISTMAS_RESEARCH_ALIASES }).filter((key) => canonical(key) === canonical(id))])];
}
export async function withCuratedEventPhotos(events, { db = supabase, deadlineMs = 3000 } = {}) {
  const list = Array.isArray(events) ? events : [];
  const identity = (event) => christmasPlaceFor(event.id.replace(/^wfc:/, ""), event.visitFacts?.place_id);
  const ids = [...new Set(list.filter((event) => event.christmas && !event.imageBlocked).map(identity).filter(Boolean))];
  if (!db || !ids.length || deadlineMs <= 0) return list;
  try {
    const { data, error } = await db.from("wf_inventory").select("place_id,signals").in("place_id", ids).abortSignal(AbortSignal.timeout(Math.min(3000, deadlineMs)));
    if (error) throw new Error("owned holiday photo read failed");
    const byId = new Map((data || []).map((row) => [row.place_id, row]));
    return list.map((event) => {
      if (!event.christmas || event.imageBlocked) return event;
      const gallery = byId.get(identity(event))?.signals?.christmas_photo_gallery;
      const cover = photoEventKeys(event).flatMap((key) => christmasTaggedPhotos(key, gallery, event.name))[0];
      if (!cover) return event;
      const photoAttr = cover.credit.replace(/^Photo by /i, "");
      return { ...event, image: cover.src, thumb: cover.src, imageIsVenue: false, imageProvider: null,
        photoAttr, photoAttrHref: cover.creditHref,
        visitFacts: { ...event.visitFacts, hero_image: cover.src, hero_image_kind: "event", image_is_venue: false, photoAttr, photoAttrHref: cover.creditHref } };
    });
  } catch {
    console.error("[events] owned holiday photo read degraded; keeping verified fallback photos");
    return list;
  }
}
