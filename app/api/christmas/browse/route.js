export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/christmas/browse: the statewide Christmas browse, paged (lead packet v4,
// 2026-10-13). Reads OWNED data only (wf_events + data/christmas-2026-research.json
// through lib/christmasBrowse.js); no metered provider call, so it is not a
// paid proxy and needs no apiGuard matcher entry. Photos are plain /api/photo
// URLs that the card resolves through CardPhoto (main #1715 to #1718).
// The same 10 minute cache as the page (christmasBrowseCached).
import { fetchCuratedEvents } from "../../../../lib/curatedEvents.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { christmasBrowseCached, parseChristmasBrowseQuery } from "../../../../lib/christmasBrowse.js";
import { christmasPlanItems } from "../../../../lib/christmasPlan.js";
import { christmasBrowseCardJson } from "../../../../lib/christmasBrowse.js";
import { christmasBrowsePins } from "../../../../lib/christmasMap.js";
import { christmasWeekendGroups } from "../../../../lib/christmasWeekend.js";
import { attachBrowseTickets, fetchChristmasTicketDeals, withBrowseTicketPhotos } from "../../../../lib/christmasTickets.js";

export async function GET(request) {
  const query = parseChristmasBrowseQuery(new URL(request.url).searchParams);
  const today = siteTodayStr();
  try {
    const params = new URL(request.url).searchParams;
    const { listings, page } = await christmasBrowseCached(query, today, () => fetchCuratedEvents({ signal: AbortSignal.timeout(4000) }));
    // Every result is the one ticket card (owner 2026-11-01), so each event
    // card carries its server built ticket fields. A failed deals read only
    // means fewer partner buttons (fetchChristmasTicketDeals never throws).
    // pins=1: every verified pin in the current result set (not paged), no ticket reads.
    if (params.get("pins") === "1") {
      const pins = christmasBrowsePins(listings, query, today);
      return Response.json({ today, total: pins.length, pins }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=86400" } });
    }
    const dealsById = await fetchChristmasTicketDeals();
    // ids=a,b,c: the visitor's saved plan. Untrusted ids are shaped, capped and
    // checked against the real listings (lib/christmasPlan.js): unknown ids are dropped.
    if (params.has("ids")) {
      const items = christmasPlanItems(listings, params.get("ids"));
      const planPage = { total: items.length, cards: items.map(christmasBrowseCardJson) };
      const withPlanTickets = await withBrowseTicketPhotos(attachBrowseTickets(planPage, listings, today, dealsById), listings, today, dealsById);
      return Response.json({ today, ids: items.map((c) => c.id), ...withPlanTickets }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=3600" } });
    }
    // group=weekend: the "This weekend" row, top 3 per category (lib/christmasWeekend.js),
    // the same card shape as the list.
    if (params.get("group") === "weekend") {
      const weekend = christmasWeekendGroups(listings, today, { lat: query.lat, lng: query.lng });
      const groups = await Promise.all(weekend.groups.map(async (g) => {
        const enriched = await withBrowseTicketPhotos(attachBrowseTickets({ cards: g.cards }, listings, today, dealsById), listings, today, dealsById);
        return { ...g, cards: enriched.cards };
      }));
      return Response.json({
        today, window: weekend.window, located: weekend.located,
        groups,
      }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=86400" } });
    }
    const withTickets = await withBrowseTicketPhotos(attachBrowseTickets(page, listings, today, dealsById), listings, today, dealsById);
    return Response.json({ today, ...withTickets }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("[api/christmas/browse] unavailable", { message: String(error?.message || error) });
    return Response.json({ error: "Christmas listings are temporarily unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
