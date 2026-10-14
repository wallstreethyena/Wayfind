export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/christmas/browse: the statewide Christmas browse, paged (lead packet v4,
// 2026-10-13). Reads OWNED data only (wf_events + data/christmas-2026-research.json
// through lib/christmasBrowse.js); no metered provider call, so it is not a
// paid proxy and needs no apiGuard matcher entry. Photos are plain /api/photo
// URLs that the card resolves through CardPhoto (main #1715 to #1718).
import { fetchCuratedEvents } from "../../../../lib/curatedEvents.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { christmasBrowseListings, christmasBrowsePage, parseChristmasBrowseQuery } from "../../../../lib/christmasBrowse.js";

let memo = { day: "", at: 0, listings: null };
const MEMO_MS = 10 * 60 * 1000;

export async function GET(request) {
  const query = parseChristmasBrowseQuery(new URL(request.url).searchParams);
  const today = siteTodayStr();
  try {
    if (!memo.listings || memo.day !== today || Date.now() - memo.at > MEMO_MS) {
      const rows = await fetchCuratedEvents({ signal: AbortSignal.timeout(4000) });
      memo = { day: today, at: Date.now(), listings: christmasBrowseListings(rows, today) };
    }
    return Response.json({ today, ...christmasBrowsePage(memo.listings, query, today) }, { headers: { "cache-control": "public, s-maxage=600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("[api/christmas/browse] unavailable", { message: String(error?.message || error) });
    return Response.json({ error: "Christmas listings are temporarily unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
