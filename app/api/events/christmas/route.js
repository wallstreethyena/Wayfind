export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/events/christmas: the Christmas in Florida poster, served (owner,
// 2026-10-08). Modeled on /api/events/fall.
//
// Reads OWNED data only (wf_events + wf_inventory), so there is no metered
// provider call anywhere in this path and the spend gate is not involved.
// Photos are plain /api/photo URLs built by the same helpers Fall uses
// (cardImageSrc / fallEventCardImageSrc); nothing here calls Google.
// Five fixed rails (lib/christmasIntentRails.js), so paging only ever applies
// to ONE rail's cards via ?rail=&page=&size= (lib/railPage.js).
import { fetchCuratedEvents, isTrusted, eventOutboundUrl } from "../../../../lib/curatedEvents.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { fallWhenLabel, fallScheduleChip } from "../../../../lib/fallPool.js";
import { supabase } from "../../../../lib/supabase.js";
import { wayfindScore } from "../../../../lib/wayfindScore.js";
import { cardImageSrc, hasStoredPlacePhoto } from "../../../../lib/placePhoto.js";
import { fastCachedRail, geoCell } from "../../../../lib/railFastCache.js";
import { composeChristmasIntentRails, christmasEventRail } from "../../../../lib/christmasIntentRails.js";
import { CHRISTMAS_PLACE_IDS, CHRISTMAS_PLACE_RAIL, CHRISTMAS_PLACE_TAKES, CHRISTMAS_TICKET_DEAL_IDS, CHRISTMAS_VENUE_PLACE_IDS, enrichChristmasEvent, christmasEventTicket } from "../../../../lib/christmasPool.js";
import { nextFallOccurrence } from "../../../../lib/fallIntentRails.js";
import { pageOneRail } from "../../../../lib/railPage.js";
import { windowRailAnswer } from "../../../../lib/railResponse.js";
import { fallEventCardImageSrc, eventImageIsVenue } from "../../../../lib/fallEventImage.js";
import { eventPlaceholder } from "../../../../lib/eventPlaceholder.js";
import { isServableDeal } from "../../../../lib/eventTicketDeals.js";
import { withChristmasGuides } from "../../../../lib/christmasGuides.js";
import { eventSocialPosts } from "../../../../lib/eventSocial.js";

const CHRISTMAS_DB_DEADLINE_MS = 3500;
const PLACE_COLUMNS = "place_id,name,lat,lng,metro,category,primary_type,google_types,signals,editorial,photo_ref,status";

function json(body, status = 200, cache = "public, s-maxage=900, stale-while-revalidate=86400") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  const full = searchParams.get("full") === "1";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "lat and lng are required" }, 400, "no-store");
  const railId = searchParams.get("rail") || "";
  const page = searchParams.get("page");
  const size = searchParams.get("size");
  try {
    const today = siteTodayStr();
    // v1 (2026-10-08): first publish of the Christmas collection.
    // v2 (2026-10-08): each rail carries its own guide (server projected).
    // v3 (2026-10-08): events missing place_id or coordinates are enriched from their venue.
    // v4 (2026-10-08): rails topped up to 8, every theme park statewide, designed tiles
    //   for events with no photo, deeper place pool.
    const key = `christmas-intents:v4:${today}:${geoCell(lat)}:${geoCell(lng)}`;
    const cached = await fastCachedRail(key, async () => {
      if (!supabase) throw new Error("Supabase unavailable");
      const signal = AbortSignal.timeout(CHRISTMAS_DB_DEADLINE_MS);
      const [rows, placeResult, dealResult] = await Promise.all([
        fetchCuratedEvents({ signal, fresh: true }),
        supabase.from("wf_inventory").select(PLACE_COLUMNS).in("place_id", [...new Set([...CHRISTMAS_PLACE_IDS, ...CHRISTMAS_VENUE_PLACE_IDS])]).abortSignal(signal),
        // wf_deals health for Undercover Tourist entries; owned read, no paid call.
        CHRISTMAS_TICKET_DEAL_IDS.length
          ? supabase.from("wf_deals").select("id,affiliate_url,active,link_ok,provider").in("id", CHRISTMAS_TICKET_DEAL_IDS).abortSignal(signal)
          : Promise.resolve({ data: [], error: null }),
      ]);
      let sourceFailures = Number(!!placeResult.error) + Number(!!dealResult.error);
      // isServableDeal, not an inline link_ok check: only link_ok === false is dead.
      const byDealId = new Map((dealResult.data || []).filter((deal) => isServableDeal(deal)).map((deal) => [deal.id, deal]));
      if (placeResult.error) console.error("[api/events/christmas] place inventory degraded", { message: String(placeResult.error.message || placeResult.error) });

      const pageSlugs = new Set((rows || []).map((row) => row?.slug).filter(Boolean));
      const inventoryById = new Map((placeResult.data || []).map((row) => [row.place_id, row]));
      // Fill the venue identity and coordinates the row lacks (never guessed: lib/christmasPool.js).
      const eligibleRows = (rows || []).filter((e) => isTrusted(e) && christmasEventRail(e)).map((e) => enrichChristmasEvent(e, inventoryById));

      // Venue photos for the events: one more owned read for the venues the
      // pool above did not already cover. An event with no resolvable venue
      // photo is dropped below, never shown with an empty media well.
      const extraIds = [...new Set(eligibleRows.map((e) => e.place_id).filter((id) => id && !inventoryById.has(id)))];
      if (extraIds.length) {
        const extra = await supabase.from("wf_inventory").select(PLACE_COLUMNS).in("place_id", extraIds).abortSignal(signal);
        if (extra.error) {
          sourceFailures += 1;
          console.error("[api/events/christmas] venue inventory degraded", { message: String(extra.error.message || extra.error) });
        }
        for (const row of extra.data || []) inventoryById.set(row.place_id, row);
      }

      const events = eligibleRows.map((e) => {
        const inventory = inventoryById.get(e.place_id) || null;
        const image = fallEventCardImageSrc(e, 640, inventory);
        const detailHref = e.slug && pageSlugs.has(e.slug) ? "/florida-events/" + e.slug : null;
        const ticket = christmasEventTicket(e.event_id, byDealId);
        // The card marker promises a video one tap away: only when our event page exists, canonical reels only.
        const creatorReels = detailHref ? eventSocialPosts(e.event_id)
          .filter((post) => post.platform === "instagram" && /instagram\.com\/reels?\/[\w-]+\/?(?:[?#].*)?$/.test(post.url))
          .map((post) => ({ platform: post.platform, creator: post.creator })) : [];
        const next = e.occurrence_dates?.length ? nextFallOccurrence(e, today) : null;
        return {
          ...e,
          kind: "event",
          id: e.event_id,
          title: e.short_title || e.event_name,
          name: e.event_name,
          city: e.city, state: e.state || "FL",
          venue: e.venue || null,
          lat: e.lat, lng: e.lng, place_id: e.place_id || null,
          start_date: e.start_date, end_date: e.end_date || null,
          when: next ? fallWhenLabel({ ...e, start_date: next, end_date: next }, today) : fallWhenLabel(e, today),
          select_nights: e.select_nights,
          schedule: fallScheduleChip(e),
          schedule_note: e.schedule_note || null,
          start_time: e.start_time || null, end_time: e.end_time || null,
          slug: e.slug || null,
          detailHref,
          hook: e.card_hook,
          take: e.editorial_summary || null,
          image: image || null,
          // No verified photo of the event or its venue: the owner approved
          // designed tile (lib/eventPlaceholder.js), never stock, never dropped.
          placeholder: image ? null : eventPlaceholder("community", { name: e.event_name, title: e.short_title, tags: e.tags }),
          imageIsVenue: eventImageIsVenue(e, image),
          photoAttr: e.photoAttr || null,
          photoAttrHref: e.photoAttrHref || null,
          url: eventOutboundUrl(e) || null,
          is_free: e.is_free, price_band: e.price_band || null,
          tags: e.tags || [],
          creatorReels,
          ticket,
        };
      }).filter((event) => (event.image || event.placeholder) && (event.url || event.place_id || event.detailHref));

      const places = (placeResult.error ? [] : (placeResult.data || []))
        .filter((p) => hasStoredPlacePhoto(p))
        .filter((p) => (!p.status || p.status === "OPERATIONAL") && CHRISTMAS_PLACE_RAIL[p.place_id])
        .map((p) => {
          const rating = typeof p.signals?.rating === "number" ? p.signals.rating : null;
          return {
            kind: "place",
            id: p.place_id,
            title: p.name, name: p.name,
            lat: p.lat, lng: p.lng, metro: p.metro, category: p.category,
            rating,
            reviews: p.signals?.reviews || 0,
            wfScore: rating && rating > 0 ? wayfindScore(rating, p.signals.reviews || 0) : null,
            take: CHRISTMAS_PLACE_TAKES[p.place_id] || null,
            image: cardImageSrc({ place_id: p.place_id, photo_ref: p.photo_ref, photo_url: p.photo_url, signals: p.signals }, 640),
            christmasRail: CHRISTMAS_PLACE_RAIL[p.place_id],
          };
        })
        .filter((place) => place.image);
      places.sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

      const composed = composeChristmasIntentRails(events, places, { lat, lng, today });
      return { today, rails: withChristmasGuides(composed.rails, today), sourceCount: events.length + places.length, sourceFailures };
    }, {
      name: "christmas-intent-rails",
      usable: (value) => value?.sourceFailures === 0
        && value?.rails?.length === 5 && Number(value?.sourceCount || 0) > 0,
    });
    const complete = cached.value?.sourceFailures === 0;
    const headers = {
      "cache-control": complete ? "public, s-maxage=900, stale-while-revalidate=86400" : "no-store",
      "x-wayfind-fast-cache": cached.state,
    };
    if (railId) {
      const paged = pageOneRail(cached.value.rails, railId, { page, size });
      if (!paged) return Response.json({ error: "unknown rail" }, { status: 404, headers: { "cache-control": "no-store" } });
      return Response.json({ rail: railId, today: cached.value.today,
        sourceFailures: cached.value.sourceFailures, ...paged }, { headers });
    }
    return Response.json(windowRailAnswer(cached.value, full), { headers });
  } catch (error) {
    console.error("[api/events/christmas] inventory unavailable", { message: String(error?.message || error) });
    return json({ error: "Christmas inventory is temporarily unavailable" }, 503, "no-store");
  }
}
