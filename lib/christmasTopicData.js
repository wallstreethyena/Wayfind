// lib/christmasTopicData.js: the statewide Christmas directory and the partner
// ticket deals, read the same way /christmas-in-florida reads them
// (lib/christmasPageData.js), for the topic pages (lib/christmasTopicPages.js).
//
//   * building (next build): ZERO network. The research listings that ship in
//     the repo render; the first background refresh replaces them.
//   * a background refresh: the live reads. A failed read throws, so the last
//     good page keeps serving rather than an empty list.
import { isSsgBuild } from "./landingInventory.js";
import { siteTodayStr } from "./siteTime.js";
import { fetchCuratedEvents } from "./curatedEvents.js";
import { christmasBrowseCached, christmasBrowseListings, parseChristmasBrowseQuery } from "./christmasBrowse.js";
import { readChristmasTicketDeals } from "./christmasTickets.js";

export async function christmasTopicData({
  building = isSsgBuild(),
  today = siteTodayStr(),
  browse = christmasBrowseCached,
  readDeals = readChristmasTicketDeals,
} = {}) {
  if (building) return { today, listings: christmasBrowseListings([], today), dealsById: new Map(), building: true };
  const [found, dealRead] = await Promise.all([
    browse(parseChristmasBrowseQuery({}), today, () => fetchCuratedEvents({ signal: AbortSignal.timeout(4000) })),
    readDeals(),
  ]);
  if (!found || !Array.isArray(found.listings)) throw new Error("Christmas listings unavailable");
  if (!dealRead || dealRead.ok !== true) throw new Error("Christmas ticket deals unavailable");
  return { today, listings: found.listings, dealsById: dealRead.deals, building: false };
}
