// lib/christmasCards.js: SERVER ONLY. One merged Christmas event row -> the
// card the rails, the statewide browse and the API send. Shared so every
// surface shows the same facts, photo and honesty labels.
import { eventOutboundUrl } from "./curatedEvents.js";
import { fallWhenLabel, fallScheduleChip } from "./fallPool.js";
import { nextFallOccurrence } from "./fallIntentRails.js";
import { fallEventCardImageSrc, eventImageIsVenue } from "./fallEventImage.js";
import { eventPlaceholder } from "./eventPlaceholder.js";
import { eventSocialPosts } from "./eventSocial.js";
import { christmasEventRail } from "./christmasIntentRails.js";
import { christmasEventTicket } from "./christmasPool.js";
import { christmasWhenBadge, christmasPriceLabel, christmasCopy } from "./christmasCardCopy.js";
import { isDbClaimedResearchId } from "./christmasResearch.js";
import { christmasStaticPhotos } from "./christmasPlacePhotos.js";

// A research-only listing has its own event page through the fallback in
// app/florida-events/[slug]/page.js; a wf_events row has its page when its slug is live.
export function christmasDetailHref(e, pageSlugs = new Set()) {
  if (!e?.slug) return null;
  if (pageSlugs.has(e.slug)) return "/florida-events/" + e.slug;
  return e.christmas_research_id && e.christmas_research_id === e.event_id && !isDbClaimedResearchId(e.event_id) ? "/florida-events/" + e.slug : null;
}

export function christmasEventCard(e, { today, inventory = null, pageSlugs = new Set(), byDealId = new Map() } = {}) {
  const owned = fallEventCardImageSrc(e, 640, inventory);
  // A licensed /events/christmas photo stays on the browse card with its credit.
  // The gallery still fills the ticket strip and the event page.
  const staticShots = String(owned || "").startsWith("/events/christmas/") ? [] : christmasStaticPhotos(e.event_id, e.venue || e.event_name);
  const staticCover = (staticShots.length ? staticShots : (String(owned || "").startsWith("/events/christmas/") ? [] : christmasStaticPhotos(e.slug, e.venue || e.event_name)))[0] || null;
  const image = staticCover ? staticCover.src : owned;
  const detailHref = christmasDetailHref(e, pageSlugs);
  const ticket = christmasEventTicket(e.event_id, byDealId);
  const creatorReels = detailHref ? eventSocialPosts(e.event_id)
    .filter((post) => post.platform === "instagram" && /instagram\.com\/reels?\/[\w-]+\/?(?:[?#].*)?$/.test(post.url))
    .map((post) => ({ platform: post.platform, creator: post.creator })) : [];
  const next = e.occurrence_dates?.length ? nextFallOccurrence(e, today) : null;
  const rail = christmasEventRail(e);
  return {
    ...e,
    kind: "event",
    id: e.event_id,
    title: e.short_title || e.event_name,
    name: e.event_name,
    city: e.city, state: e.state || "FL",
    // A corrected listing names its viewing spot and street ("Public viewing:
    // Cove Park, 540 McNabb Pkwy"), the same words its page and directions use.
    venue: christmasCopy(e.viewing_label || e.venue) || null,
    lat: e.lat, lng: e.lng, place_id: e.place_id || null,
    start_date: e.start_date || null, end_date: e.end_date || null,
    // An undated season never borrows a date: "2026 season / Dates TBA".
    when: christmasWhenBadge(e) || (next ? fallWhenLabel({ ...e, start_date: next, end_date: next }, today) : fallWhenLabel(e, today)),
    select_nights: e.select_nights,
    schedule: e.season_undated ? null : fallScheduleChip(e),
    schedule_note: christmasCopy(e.schedule_note) || null,
    start_time: e.start_time || null, end_time: e.end_time || null,
    slug: e.slug || null,
    detailHref,
    hook: christmasCopy(e.card_hook),
    take: christmasCopy(e.editorial_summary) || null,
    image: image || null,
    ...(Array.isArray(inventory?.signals?.photos) && inventory.signals.photos.length ? { venuePhotos: inventory.signals.photos } : {}),
    // No verified photo of the event or its venue: the owner approved
    // designed tile (lib/eventPlaceholder.js), never stock, never dropped.
    placeholder: image ? null : eventPlaceholder("community", { name: e.event_name, title: e.short_title, tags: e.tags, christmasRail: rail }),
    imageIsVenue: staticCover ? false : eventImageIsVenue(e, image),
    photoAttr: staticCover ? staticCover.credit.replace(/^Photo by /i, "") : (e.photoAttr || null),
    photoAttrHref: staticCover ? staticCover.creditHref : (e.photoAttrHref || null),
    url: eventOutboundUrl(e) || null,
    is_free: e.is_free === true ? true : (e.is_free === false ? false : null),
    price_band: e.is_free === true ? (e.price_band || "free") : (e.price_band === "free" ? null : e.price_band || null),
    price_label: christmasPriceLabel(e),
    christmasRail: rail,
    tags: e.tags || [],
    creatorReels,
    ticket,
  };
}
