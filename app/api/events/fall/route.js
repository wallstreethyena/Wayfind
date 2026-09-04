export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/events/fall — the AUGTOBER pool, served (owner, 2026-08-26: "all the
// fall themed bars, restaurants, cafes, events, pumpkins, anything that is
// fall themed and Halloween … in this rail card").
//
// Reads OWNED data only (wf_events + wf_inventory) — zero metered provider
// calls, so the spend gate is not in this path. Two groups, two laws
// (lib/fallPool.js): dated events retire at end_date; an open-run row
// (end_date null — the HHN Tribute Store, whose close Universal has not
// published) stays for OPEN_RUN_DAYS without ever claiming an end date; the
// vetted year-round spooky PLACES ride along as normal scored place rows.
import { fetchCuratedEvents, isTrusted, eventOutboundUrl } from "../../../../lib/curatedEvents.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { isFallTagged, fallEventLive, fallWhenLabel, fallScheduleChip, FALL_PLACE_IDS, FALL_PLACE_RAIL, FALL_EVENT_TICKET_DEALS } from "../../../../lib/fallPool.js";
import { eventTicketCta } from "../../../../lib/eventTicketDeals.js";
import { hasCjPid } from "../../../../lib/deals.js";
import { supabase } from "../../../../lib/supabase.js";
import { wayfindScore } from "../../../../lib/wayfindScore.js";
import { cardImageSrc } from "../../../../lib/placePhoto.js";
import { fastCachedRail, geoCell } from "../../../../lib/railFastCache.js";
import { composeFallIntentRails } from "../../../../lib/fallIntentRails.js";
import { pageOneRail } from "../../../../lib/railPage.js";
import { FALL_PHOTO_PLACE_IDS, FALL_PHOTO_SPOTS } from "../../../../lib/fallPhotoSpots.js";
import { FALL_DISCOVERIES_2026, FALL_DISCOVERY_RAIL, FALL_SEASONAL_PLACE_IDS } from "../../../../lib/fallDiscoveries2026.js";
import { windowRailAnswer } from "../../../../lib/railResponse.js";
import { FALL_COLLECTION_POSTER, FALL_EVENT_VENUE_PLACE_IDS, fallEventCardImageSrc, mergeFallDiscoveryRows } from "../../../../lib/fallEventImage.js";

const FALL_DB_DEADLINE_MS = 3500;

function json(body, status = 200, cache = "public, s-maxage=900, stale-while-revalidate=86400") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  const full = searchParams.get("full") === "1";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "lat and lng are required" }, 400, "no-store");
  // WO11 paging contract — see app/api/night-out/route.js. Fall Intent's ten
  // rails are a fixed curated set (`usable` below requires exactly 10), so
  // paging only ever applies to ONE rail's cards, never to how many rails
  // exist.
  const railId = searchParams.get("rail") || "";
  const page = searchParams.get("page");
  const size = searchParams.get("size");
  try {
    const today = siteTodayStr();
    // v6 invalidated payloads composed before verified registry identity won
    // over stale database duplicates. v7 (#1082) suppressed unresolved image
    // cards. v8 (2026-09-03, this lane): ticket hrefs moved from the raw CJ URL
    // to /api/commerce/go and cards gained schedule/detailHref. Both v7 shapes
    // shipped, so this is a THIRD epoch, not a re-use — a stale v7 would serve
    // the DOM-exposed affiliate link for 15 minutes after deploy. v9
    // (2026-09-03) retires every key computed BEFORE the live-read fix
    // (#1084): those entries were written from an hour-old Data Cache read and
    // hold a de-dated event plus none of that day's 21 new ones. The rail cache
    // keeps a good answer for an hour, so without this bump the owner's own
    // Parrish cell would have served the wrong set until it aged out.
    const key = `fall-intents:v10:${today}:${geoCell(lat)}:${geoCell(lng)}`;
    const cached = await fastCachedRail(key, async () => {
      if (!supabase) throw new Error("Supabase unavailable");
      const ids = [...new Set([
        ...Object.keys(FALL_PLACE_IDS),
        ...FALL_PHOTO_PLACE_IDS,
        ...FALL_DISCOVERIES_2026.map((row) => row.place_id).filter(Boolean),
        ...Object.values(FALL_EVENT_VENUE_PLACE_IDS),
      ])];
      const dealIds = [...new Set(Object.values(FALL_EVENT_TICKET_DEALS))];
      const signal = AbortSignal.timeout(FALL_DB_DEADLINE_MS);
      // All three reads are independent. Start them together so a cold cache
      // costs one Supabase round trip rather than a waterfall of three.
      const [rows, placeResult, dealResult] = await Promise.all([
        // fresh: the rail retires an event the moment its date passes, so it
        // must not read the ISR pages' hour-old cache entry (lib/supabase.js).
        fetchCuratedEvents({ signal, fresh: true }),
        supabase.from("wf_inventory")
          .select("place_id,name,lat,lng,metro,category,primary_type,google_types,signals,editorial,photo_ref,status")
          .in("place_id", ids).abortSignal(signal),
        dealIds.length
          ? supabase.from("wf_deals").select("id,affiliate_url,active,link_ok,provider").in("id", dealIds).abortSignal(signal)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const sourceFailures = Number(!!placeResult.error) + Number(!!dealResult.error);
      if (placeResult.error) console.error("[api/events/fall] place inventory degraded", { message: String(placeResult.error.message || placeResult.error) });

      const byDealId = new Map((dealResult.data || [])
        .filter((deal) => deal.active && deal.link_ok && hasCjPid(deal.affiliate_url))
        .map((deal) => [deal.id, deal]));
      // The owner-supplied discovery registry is publish-ready source data,
      // not merely a seed script. Merge it at read time so a missed/lagging
      // database seed cannot erase verified farms, cafes and spooky dates.
      const eventRows = mergeFallDiscoveryRows(rows, FALL_DISCOVERIES_2026);
      // /florida-events/<slug> is served from wf_events by slug. A registry row
      // whose database seed is lagging has no page yet, so it gets no
      // detailHref — the card falls back to the venue sheet / official page
      // rather than a 404 wearing the event's name.
      const pageSlugs = new Set((rows || []).map((row) => row?.slug).filter(Boolean));
      const eligibleRows = eventRows
      // isTrusted, NOT a second inline copy of the status check. The line this
      // replaced asked only about event_status and therefore skipped the
      // source_tier and confidence gates that lib/curatedEvents has always
      // applied — so a creator-discovered row could have DATED a card on the
      // rail the owner looks at most. The fall date law (fallEventLive, with
      // its open-run rule) stays here because it is genuinely this rail's own.
      .filter((e) => isTrusted(e) && isFallTagged(e.tags) && fallEventLive(e, today))
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
      const inventoryById = new Map((placeResult.data || []).map((row) => [row.place_id, row]));
      const events = eligibleRows
      .filter((e) => !FALL_SEASONAL_PLACE_IDS.has(e.event_id))
      .map((e) => {
        const dealId = FALL_EVENT_TICKET_DEALS[e.event_id];
        // liveDeal: undefined = no read attempted; null = the row failed the
        // active/link_ok/PID gate (or the read degraded) -> no CTA. The CTA
        // href is /api/commerce/go, never the raw affiliate URL (crawler
        // clicks on a DOM-exposed CJ link are the account risk documented in
        // lib/commerceProviders.js).
        const ticket = dealId ? eventTicketCta(e.event_id, { surface: "fall_intent_rail", liveDeal: byDealId.get(dealId) || null }) : null;
        const inventory = inventoryById.get(e.place_id) || null;
        const hasImageProof = (!!e.hero_image && e.hero_image !== FALL_COLLECTION_POSTER) || !!inventory?.photo_ref;
        const image = hasImageProof ? fallEventCardImageSrc(e, 640, inventory) : null;
        return ({
        ...e,
        kind: "event",
        id: e.event_id,
        title: e.short_title || e.event_name,
        name: e.event_name,
        city: e.city, state: e.state || "FL",
        venue: e.venue || null,
        lat: e.lat, lng: e.lng, place_id: e.place_id || null,
        start_date: e.start_date, end_date: e.end_date || null,
        when: fallWhenLabel(e, today),
        // The schedule the reader acts on: which days, what time, straight
        // from the row's clock columns and verified schedule_note.
        schedule: fallScheduleChip(e),
        schedule_note: e.schedule_note || null,
        start_time: e.start_time || null, end_time: e.end_time || null,
        // The event's OWN page (dates, hours, parking, why-go, JSON-LD) —
        // the card body opens this, not the venue's place sheet.
        slug: e.slug || null,
        detailHref: e.slug && pageSlugs.has(e.slug) ? "/florida-events/" + e.slug : null,
        hook: e.card_hook,
        take: e.editorial_summary || null,
        // Collection art belongs on the collection tile, never on a named
        // destination. The helper also rejects legacy DB rows that were seeded
        // with that poster and derives this venue's own photo from place_id.
        image: image || null,
        imageIsVenue: !!image && (!e.hero_image || e.hero_image === FALL_COLLECTION_POSTER),
        url: eventOutboundUrl(e) || null,   // 2026-09-02: link_ok + quarantine + safeUrl gated
        is_free: !!e.is_free, price_band: e.price_band || null,
        tags: e.tags || [],
        ticket,
      });
      })
      // A named destination never wears collection art and never ships with an
      // empty media well. Unresolved identity stays off the customer rail until
      // enrichment can prove a venue/photo; it is not papered over in the UI.
      .filter((event) => event.image && (event.url || event.place_id));

    // THE IMAGE, DERIVED — NOT BACKFILLED (owner, 2026-08-30, on four blank
    // AUGTOBER tiles: "these places are missing the pictures").
    //
    // hero_image is a STORED column that scripts/backfill-event-heroes ran ONCE
    // on 2026-08-26. It filled the rows that existed that day and nothing has
    // filled a row since, so every event added afterwards is born blank — three
    // Manatee Performing Arts Center shows and one Big Top Brewing night, all
    // four with a place_id whose venue is already in wf_inventory WITH a
    // photo_ref. The data to draw them has been sitting one join away the whole
    // time. A second backfill would fix these four and leave the fifth blank
    // row to be discovered by the owner again, so the derivation moves to serve
    // time, where it cannot go stale.
    //
    // ?place= (not ?ref=) is deliberate: /api/photo resolves the id against
    // wf_inventory itself, so this route never carries a ref, the ownership
    // rule stays in one place (lib/placePhoto photoRefOwnedByPlace — an event
    // can only ever wear ITS OWN venue's photo, never a neighbour's), and a
    // venue with no photo redirects to the branded fallback instead of a hole.
    // Costs nothing: cache and inventory are both ahead of the spend gate.
      // Seasonal menus, decor and make-and-take offerings are attributes of a
      // permanent business. They are not calendar events. Use the Google place
      // id as identity so taps, saves, photos and directions all belong to the
      // real venue; keep the discovery id only as provenance.
      const seasonalPlaces = eligibleRows
        .filter((row) => FALL_SEASONAL_PLACE_IDS.has(row.event_id) && row.place_id)
        .map((row) => {
          const inventory = inventoryById.get(row.place_id) || null;
          const signals = inventory?.signals || {};
          const rating = typeof signals.rating === "number" ? signals.rating : null;
          const reviews = Number(signals.reviews || 0);
          return {
            kind: "place",
            id: row.place_id,
            discoveryId: row.event_id,
            title: row.short_title || row.venue || row.event_name,
            name: row.venue || inventory?.name || row.event_name,
            city: row.city,
            lat: row.lat ?? inventory?.lat,
            lng: row.lng ?? inventory?.lng,
            metro: inventory?.metro || null,
            category: inventory?.category || row.subcategory || "seasonal-place",
            primaryType: inventory?.primary_type || null,
            types: inventory?.google_types || [],
            rating,
            reviews,
            wfScore: rating ? wayfindScore(rating, reviews) : null,
            take: row.editorial_summary || row.card_hook || null,
            hook: row.card_hook || null,
            image: inventory?.photo_ref ? fallEventCardImageSrc({ ...row, hero_image: null }, 640, inventory) : null,
            fallRail: FALL_DISCOVERY_RAIL[row.event_id],
            sourceUrl: row.source_url || null,
            seasonalThrough: row.end_date || null,
          };
        })
        .filter((place) => place.image);

      const seasonalPlaceIds = new Set(seasonalPlaces.map((place) => place.id));
      const places = [...seasonalPlaces, ...(placeResult.error ? [] : (placeResult.data || []))
        .filter((p) => !seasonalPlaceIds.has(p.place_id))
        .filter((p) => !!p.photo_ref)
        .filter((p) => (!p.status || p.status === "OPERATIONAL") && p.signals && typeof p.signals.rating === "number" && p.signals.rating > 0)
        .map((p) => ({
          kind: "place",
          id: p.place_id,
          title: p.name, name: p.name,
          lat: p.lat, lng: p.lng, metro: p.metro, category: p.category,
          rating: p.signals.rating, reviews: p.signals.reviews || 0,
          wfScore: wayfindScore(p.signals.rating, p.signals.reviews || 0),
          // This place is here because of its verified seasonal offering. The
          // generic inventory summary may still be useful elsewhere, but it
          // must never hide the evidence that earned this fall recommendation.
          take: FALL_PLACE_IDS[p.place_id] || FALL_PHOTO_SPOTS[p.place_id]?.visualProof || p.editorial || null,
          image: cardImageSrc({ place_id: p.place_id, photo_ref: p.photo_ref }, 640),
          fallRail: FALL_PLACE_RAIL[p.place_id] || (FALL_PHOTO_SPOTS[p.place_id] ? "photos" : null),
          ...(FALL_PHOTO_SPOTS[p.place_id] || {}),
        }))]
        // Seasonal rails promise a real image of the named destination. A
        // missing/refused photo is an enrichment task, not a blank card.
        .filter((place) => place.image)
        .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

      const composed = composeFallIntentRails(events, places, { lat, lng, today });
      return { today, ...composed, sourceCount: events.length + places.length, sourceFailures };
    }, {
      name: "fall-intent-rails",
      usable: (value) => value?.rails?.length === 10 && Number(value?.sourceCount || 0) > 0,
    });
    const headers = {
      "cache-control": "public, s-maxage=900, stale-while-revalidate=86400",
      "x-wayfind-fast-cache": cached.state,
    };
    if (railId) {
      const paged = pageOneRail(cached.value.rails, railId, { page, size });
      if (!paged) return Response.json({ error: "unknown rail" }, { status: 404, headers: { "cache-control": "no-store" } });
      return Response.json({ rail: railId, today: cached.value.today, phase: cached.value.phase, ...paged }, { headers });
    }
    return Response.json(windowRailAnswer(cached.value, full), { headers });
  } catch (error) {
    console.error("[api/events/fall] inventory unavailable", { message: String(error?.message || error) });
    return json({ error: "Fall inventory is temporarily unavailable" }, 503, "no-store");
  }
}
