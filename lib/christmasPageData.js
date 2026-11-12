// lib/christmasPageData.js: everything /christmas-in-florida renders, in one
// place, so the page itself reads nothing from the request.
//
// Why: the page is the landing page for paid ads, and every ad click carries a
// unique ?fbclid=. While the page read the URL, each visit was a fresh server
// render (0.9 to 2.8 s before the first byte). It is now one cached copy,
// refreshed in the background.
//
// Two modes:
//   * building (next build): ZERO network. The first cached-page attempt
//     (#2408) ran every live read during the build prerender and went past
//     Next's 60 s per page limit three times (reverted in #2414). The build
//     now renders the research listings that ship in the repo, with no deals
//     and no photo passes. The first background refresh replaces it.
//   * a background refresh (runtime): the full live reads. A failed browse or
//     deals read throws, so the last good page keeps serving. Each photo pass
//     gets a fixed budget and falls back to the cards without the extra
//     photos, so a slow photo store can never stall or fail a refresh.
import { isSsgBuild } from "./landingInventory.js";
import { siteTodayStr } from "./siteTime.js";
import { fetchCuratedEvents } from "./curatedEvents.js";
import { christmasBrowseCached, christmasBrowseListings, christmasBrowsePage, parseChristmasBrowseQuery } from "./christmasBrowse.js";
import { attachBrowseTickets, withBrowseTicketPhotos, christmasTicketsModel, readChristmasTicketDeals, withChristmasTicketPhotos } from "./christmasTickets.js";

export const CHRISTMAS_PHOTO_BUDGET_MS = 6000;

// Resolves with `fallback` when the work fails or runs past the budget.
function within(work, ms, fallback) {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); });
  return Promise.race([Promise.resolve().then(work).catch(() => fallback), late]).finally(() => clearTimeout(timer));
}

export async function christmasPageData({
  building = isSsgBuild(),
  today = siteTodayStr(),
  photoBudgetMs = CHRISTMAS_PHOTO_BUDGET_MS,
  browse = christmasBrowseCached,
  readDeals = readChristmasTicketDeals,
  ticketPhotos = withChristmasTicketPhotos,
  browsePhotos = withBrowseTicketPhotos,
} = {}) {
  const query = parseChristmasBrowseQuery({});
  if (building) {
    const noDeals = new Map();
    const listings = christmasBrowseListings([], today);
    return {
      today, listings, building: true,
      first: attachBrowseTickets(christmasBrowsePage(listings, query, today), listings, today, noDeals),
      tickets: christmasTicketsModel(listings, today, { dealsById: noDeals }),
    };
  }
  // The browse and the deals are independent reads, so they run side by side.
  const [found, dealRead] = await Promise.all([
    browse(query, today, () => fetchCuratedEvents({ signal: AbortSignal.timeout(4000) })),
    readDeals(),
  ]);
  if (!found || !Array.isArray(found.listings) || !found.page) throw new Error("Christmas listings unavailable");
  if (!dealRead || dealRead.ok !== true) throw new Error("Christmas ticket deals unavailable");
  const { listings } = found;
  const dealsById = dealRead.deals;
  const plainTickets = christmasTicketsModel(listings, today, { dealsById });
  const plainFirst = attachBrowseTickets(found.page, listings, today, dealsById);
  // The two photo passes are independent too. Each has its own budget.
  const [tickets, first] = await Promise.all([
    within(() => ticketPhotos(plainTickets), photoBudgetMs, plainTickets),
    within(() => browsePhotos(plainFirst, listings, today, dealsById), photoBudgetMs, plainFirst),
  ]);
  return { today, listings, first, tickets, building: false };
}
