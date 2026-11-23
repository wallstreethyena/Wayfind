// lib/christmasWeekend.js: the "This weekend" row on /christmas-in-florida.
// PURE (no network, no clock): the caller passes the listings and the Eastern
// date (lib/siteTime.siteTodayStr). Options, never a single pick: up to 10
// cards in each category that has something this weekend. Family friendly is
// an audience filter, not a row. Every other pill can be its own row.
//
// The window is the existing "weekend" date filter (christmasDateWindow): the
// coming Friday to Sunday, or today to Sunday when today is already Friday,
// Saturday or Sunday. Listings are filtered with the same date rules as the
// list (explicit nights, day rules, undated season listings never qualify),
// ranked by rating and proximity (20 mile rings when a location is known).
// A partner ticket never changes that order. One place card per brand is kept.
// A card with no real photo is skipped, and the next ranked card fills its spot.
import {
  CHRISTMAS_BROWSE_PILLS, christmasDateWindow, filterChristmasBrowse, sortChristmasBrowse,
  collapseBrowseBrands, christmasBrowseCardJson, ratingRank,
} from "./christmasBrowse.js";
import { weekendCardPhoto } from "./christmasWeekendTile.js";

export const CHRISTMAS_WEEKEND_PER_GROUP = 10;
export const CHRISTMAS_WEEKEND_MAX_GROUPS = CHRISTMAS_BROWSE_PILLS.filter((pill) => !pill.audience).length;

export function christmasWeekendWindow(today) {
  return christmasDateWindow("weekend", today);
}

// groups: [{ id, label, cards: [slim browse card, up to 10 with a real photo] }].
// A listing shows in one group only (the first it ranks into), so a card is never repeated.
export function christmasWeekendGroups(listings, today, { lat = null, lng = null } = {}) {
  const window = christmasWeekendWindow(today);
  const located = Number.isFinite(lat) && Number.isFinite(lng);
  const base = { when: "weekend", lat: located ? lat : null, lng: located ? lng : null };
  const built = [];
  CHRISTMAS_BROWSE_PILLS.forEach((pill, order) => {
    if (pill.audience) return; // "Family friendly" is an audience, not a category
    const found = filterChristmasBrowse(listings || [], { ...base, category: pill.id }, today);
    const ranked = collapseBrowseBrands(
      sortChristmasBrowse(found, { ...base, rank: "rated" }, today).filter((card) => weekendCardPhoto(card)),
      located,
    );
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
      if (used.has(card.id) || !weekendCardPhoto(card)) continue;
      cards.push(card);
    }
    if (!cards.length) continue;
    cards.forEach((c) => used.add(c.id));
    groups.push({ id: g.id, label: g.label, cards: cards.map(christmasBrowseCardJson) });
  }
  return { window, located, groups };
}
