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
import { attachBrowseTickets, fetchChristmasTicketDeals, withBrowseTicketPhotos } from "../../../../lib/christmasTickets.js";

export async function GET(request) {
  const query = parseChristmasBrowseQuery(new URL(request.url).searchParams);
  const today = siteTodayStr();
  try {
    const { listings, page } = await christmasBrowseCached(query, today, () => fetchCuratedEvents({ signal: AbortSignal.timeout(4000) }));
    // Every result is the one ticket card (owner 2026-11-01), so each event
    // card carries its server built ticket fields. A failed deals read only
    // means fewer partner buttons (fetchChristmasTicketDeals never throws).
    const dealsById = await fetchChristmasTicketDeals();
    const withTickets = await withBrowseTicketPhotos(attachBrowseTickets(page, listings, today, dealsById), listings, today, dealsById);
    return Response.json({ today, ...withTickets }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("[api/christmas/browse] unavailable", { message: String(error?.message || error) });
    return Response.json({ error: "Christmas listings are temporarily unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
