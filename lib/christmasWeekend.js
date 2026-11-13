// lib/christmasWeekend.js: the "This weekend" row on /christmas-in-florida.
// PURE (no network, no clock): the caller passes the listings and the Eastern
// date (lib/siteTime.siteTodayStr). Owner rules: options, never a single pick
// (top 3 per category); only categories that have something; at most 4.
//
// The window is the existing "weekend" date filter (christmasDateWindow): the
// coming Friday to Sunday, or today to Sunday when today is already Friday,
// Saturday or Sunday. Listings are filtered with the same date rules as the
// list (explicit nights, day rules, undated season listings never qualify),
// ranked with sortChristmasBrowse (best rated, then trending, in 20 mile rings
// when a location is known) and one place card per brand is kept.
import {
  CHRISTMAS_BROWSE_PILLS, christmasDateWindow, filterChristmasBrowse, sortChristmasBrowse,
  collapseBrowseBrands, christmasBrowseCardJson, ratingRank,
} from "./christmasBrowse.js";

export const CHRISTMAS_WEEKEND_PER_GROUP = 3;
export const CHRISTMAS_WEEKEND_MAX_GROUPS = 4;

export function christmasWeekendWindow(today) {
  return christmasDateWindow("weekend", today);
}

// groups: [{ id, label, cards: [slim browse card x up to 3] }]. A listing shows
// in one group only (the first it ranks into), so a card is never repeated.
export function christmasWeekendGroups(listings, today, { lat = null, lng = null } = {}) {
  const window = christmasWeekendWindow(today);
  const located = Number.isFinite(lat) && Number.isFinite(lng);
  const base = { when: "weekend", lat: located ? lat : null, lng: located ? lng : null };
  const built = [];
  CHRISTMAS_BROWSE_PILLS.forEach((pill, order) => {
    if (pill.audience) return; // "Family friendly" is an audience, not a category
    const found = filterChristmasBrowse(listings || [], { ...base, category: pill.id }, today);
    const ranked = collapseBrowseBrands(sortChristmasBrowse(found, base, today), located);
    if (ranked.length) built.push({ id: pill.id, label: pill.label, order, ranked });
  });
  // The groups with the best rated lead card come first (ties: menu order).
  built.sort((a, b) => ratingRank(b.ranked[0]) - ratingRank(a.ranked[0]) || a.order - b.order);
  const used = new Set();
  const groups = [];
  for (const g of built) {
    if (groups.length >= CHRISTMAS_WEEKEND_MAX_GROUPS) break;
    const cards = [];
    for (const card of g.ranked) {
      if (cards.length >= CHRISTMAS_WEEKEND_PER_GROUP) break;
      if (used.has(card.id)) continue;
      cards.push(card);
    }
    if (!cards.length) continue;
    cards.forEach((c) => used.add(c.id));
    groups.push({ id: g.id, label: g.label, cards: cards.map(christmasBrowseCardJson) });
  }
  return { window, located, groups };
}
