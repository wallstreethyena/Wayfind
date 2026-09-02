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
import { isFallTagged, fallEventLive, fallWhenLabel, FALL_PLACE_IDS, FALL_PLACE_RAIL, FALL_EVENT_TICKET_DEALS } from "../../../../lib/fallPool.js";
import { hasCjPid } from "../../../../lib/deals.js";
import { supabase } from "../../../../lib/supabase.js";
import { wayfindScore } from "../../../../lib/wayfindScore.js";
import { cardImageSrc } from "../../../../lib/placePhoto.js";
import { fastCachedRail, geoCell } from "../../../../lib/railFastCache.js";
import { composeFallIntentRails } from "../../../../lib/fallIntentRails.js";
import { FALL_PHOTO_PLACE_IDS, FALL_PHOTO_SPOTS } from "../../../../lib/fallPhotoSpots.js";
import { FALL_DISCOVERIES_2026 } from "../../../../lib/fallDiscoveries2026.js";
import { FALL_COLLECTION_POSTER, fallEventCardImageSrc } from "../../../../lib/fallEventImage.js";

const FALL_DB_DEADLINE_MS = 3500;

function json(body, status = 200, cache = "public, s-maxage=900, stale-while-revalidate=86400") {
  return Response.json(body, { status, headers: { "cache-control": cache } });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const lat = Number.parseFloat(searchParams.get("lat") || "");
  const lng = Number.parseFloat(searchParams.get("lng") || "");
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "lat and lng are required" }, 400, "no-store");
  try {
    const today = siteTodayStr();
    const key = `fall-intents:v5:${today}:${geoCell(lat)}:${geoCell(lng)}`;
    const cached = await fastCachedRail(key, async () => {
      if (!supabase) throw new Error("Supabase unavailable");
      const ids = [...new Set([...Object.keys(FALL_PLACE_IDS), ...FALL_PHOTO_PLACE_IDS])];
      const dealIds = [...new Set(Object.values(FALL_EVENT_TICKET_DEALS))];
      const signal = AbortSignal.timeout(FALL_DB_DEADLINE_MS);
      // All three reads are independent. Start them together so a cold cache
      // costs one Supabase round trip rather than a waterfall of three.
      const [rows, placeResult, dealResult] = await Promise.all([
        fetchCuratedEvents({ signal }),
        supabase.from("wf_inventory")
          .select("place_id,name,lat,lng,metro,category,signals,editorial,photo_ref,status")
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
      const eventRows = [...(rows || []), ...FALL_DISCOVERIES_2026]
        .filter((row, index, all) => all.findIndex((other) => other.event_id === row.event_id) === index);
      const events = eventRows
      // isTrusted, NOT a second inline copy of the status check. The line this
      // replaced asked only about event_status and therefore skipped the
      // source_tier and confidence gates that lib/curatedEvents has always
      // applied — so a creator-discovered row could have DATED a card on the
      // rail the owner looks at most. The fall date law (fallEventLive, with
      // its open-run rule) stays here because it is genuinely this rail's own.
      .filter((e) => isTrusted(e) && isFallTagged(e.tags) && fallEventLive(e, today))
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
      .map((e) => {
        const dealId = FALL_EVENT_TICKET_DEALS[e.event_id];
        const deal = dealId ? byDealId.get(dealId) : null;
        const image = fallEventCardImageSrc(e, 640);
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
        ticket: deal ? { href: deal.affiliate_url, via: "Undercover Tourist", deal_id: deal.id } : null,
      });
      })
      .filter((event) => event.url || event.place_id);

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
      const places = (placeResult.error ? [] : (placeResult.data || []))
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
        }))
        .sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

      const composed = composeFallIntentRails(events, places, { lat, lng, today });
      return { today, ...composed, sourceCount: events.length + places.length, sourceFailures };
    }, {
      name: "fall-intent-rails",
      usable: (value) => value?.rails?.length === 10 && Number(value?.sourceCount || 0) > 0,
    });
    return Response.json(cached.value, {
      headers: {
        "cache-control": "public, s-maxage=900, stale-while-revalidate=86400",
        "x-wayfind-fast-cache": cached.state,
      },
    });
  } catch (error) {
    console.error("[api/events/fall] inventory unavailable", { message: String(error?.message || error) });
    return json({ error: "Fall inventory is temporarily unavailable" }, 503, "no-store");
  }
}
