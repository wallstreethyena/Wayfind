export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/events/christmas: the Christmas in Florida poster, served (owner,
// 2026-10-08). Modeled on /api/events/fall.
//
// Reads OWNED data only (wf_events + wf_inventory), so there is no metered
// provider call anywhere in this path and the spend gate is not involved.
// Photos are plain /api/photo URLs built by the same helpers Fall uses
// (cardImageSrc / fallEventCardImageSrc); nothing here calls Google.
// Eight fixed rails (lib/christmasIntentRails.js), so paging only ever applies
// to ONE rail's cards via ?rail=&page=&size= (lib/railPage.js).
import { fetchCuratedEvents, isTrusted } from "../../../../lib/curatedEvents.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { supabase } from "../../../../lib/supabase.js";
import { wayfindScore } from "../../../../lib/wayfindScore.js";
import { cardImageSrc, hasStoredPlacePhoto } from "../../../../lib/placePhoto.js";
import { fastCachedRail, geoCell } from "../../../../lib/railFastCache.js";
import { composeChristmasIntentRails, christmasEventRail } from "../../../../lib/christmasIntentRails.js";
import { isFloridaVenue } from "../../../../lib/floridaVenue.js";
import { mergeChristmasResearch } from "../../../../lib/christmasResearch.js";
import { christmasEventCard } from "../../../../lib/christmasCards.js";
import { CHRISTMAS_PLACE_IDS, CHRISTMAS_PLACE_RAIL, CHRISTMAS_PLACE_TAKES, CHRISTMAS_PLACE_TITLES, CHRISTMAS_TICKET_DEAL_IDS, CHRISTMAS_VENUE_PLACE_IDS, enrichChristmasEvent } from "../../../../lib/christmasPool.js";
import { pageOneRail } from "../../../../lib/railPage.js";
import { windowRailAnswer } from "../../../../lib/railResponse.js";
import { isServableDeal } from "../../../../lib/eventTicketDeals.js";
import { seasonalHospitalityIds, seasonalHospitalityPlaces, mergeSeasonalHospitalityPlaces, reconcileSeasonalHospitalityEvents } from "../../../../lib/seasonalHospitality.js";
import { withChristmasGuides } from "../../../../lib/christmasGuides.js";

const CHRISTMAS_DB_DEADLINE_MS = 3500;
const PLACE_COLUMNS = "place_id,name,lat,lng,metro,category,primary_type,google_types,signals,editorial,photo_ref,status,excluded";

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
    // v5 (2026-10-09): eight rails, the verified 2026 registry merged at read
    //   time, the five location corrections, the distance group ordering law.
    // v6 (2026-10-13): the research data is the source (752 rows, watchlist
    //   never shown), one card per experience, honesty labels.
    // v8 (2026-10-19): eight confirmed Tampa Bay shows (Ruth Eckerd Hall,
    //   the Mahaffey Theater and MOSI) join the research file, so no v7
    //   payload outlives the deploy.
    const key = `christmas-intents:v8:${today}:${geoCell(lat)}:${geoCell(lng)}`;
    const cached = await fastCachedRail(key, async () => {
      if (!supabase) throw new Error("Supabase unavailable");
      const signal = AbortSignal.timeout(CHRISTMAS_DB_DEADLINE_MS);
      const [rows, placeResult, dealResult] = await Promise.all([
        fetchCuratedEvents({ signal, fresh: true }),
        supabase.from("wf_inventory").select(PLACE_COLUMNS).in("place_id", [...new Set([...CHRISTMAS_PLACE_IDS, ...CHRISTMAS_VENUE_PLACE_IDS, ...seasonalHospitalityIds("christmas", today)])]).abortSignal(signal),
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
      // The research data (lib/christmasResearch.js, data/christmas-2026-research.json)
      // merged at read time: one row per experience, each carrying its rail and
      // the five location corrections. Watchlist rows never enter. No DB write.
      const mergedRows = mergeChristmasResearch(rows || []);
      const inventoryById = new Map((placeResult.data || []).map((row) => [row.place_id, row]));
      // Fill the venue identity and coordinates the row lacks (never guessed: lib/christmasPool.js).
      const eligibleRows = mergedRows.filter((e) => isFloridaVenue(e) && isTrusted(e) && christmasEventRail(e)).map((e) => enrichChristmasEvent(e, inventoryById));

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

      let events = eligibleRows.map((e) => christmasEventCard(e, { today, inventory: inventoryById.get(e.place_id) || null, pageSlugs, byDealId })
      ).filter((event) => (event.image || event.placeholder) && (event.url || event.place_id || event.detailHref));

      let places = (placeResult.error ? [] : (placeResult.data || []))
        .filter((p) => hasStoredPlacePhoto(p))
        .filter((p) => (!p.status || p.status === "OPERATIONAL") && CHRISTMAS_PLACE_RAIL[p.place_id])
        .map((p) => {
          const rating = typeof p.signals?.rating === "number" ? p.signals.rating : null;
          return {
            kind: "place",
            id: p.place_id,
            title: CHRISTMAS_PLACE_TITLES[p.place_id] || p.name, name: p.name,
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
      places = mergeSeasonalHospitalityPlaces(places, seasonalHospitalityPlaces(placeResult.data || [], "christmas", today));
      places.sort((a, b) => (b.wfScore || 0) - (a.wfScore || 0));

      ({ events, places } = reconcileSeasonalHospitalityEvents(events, places));
      const composed = composeChristmasIntentRails(events, places, { lat, lng, today });
      return { today, rails: withChristmasGuides(composed.rails, today), sourceCount: events.length + places.length, sourceFailures };
    }, {
      name: "christmas-intent-rails",
      usable: (value) => value?.sourceFailures === 0
        && value?.rails?.length === 9 && Number(value?.sourceCount || 0) > 0,
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
