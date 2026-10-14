import { guideDiscoveryHash, matchedGuidePlace } from './guideDiscovery.js';
import { guideRailFit } from './guideRailTopics.js';

// Actual place rows are the only evidence. Event venue IDs and tour products
// do NOT establish that a guide covers the event/date or the purchasable tour.
//
// Season fit (audit 2026-10-09): a shared venue is not enough on a SEASONAL
// collection. Marie Selby sits in both a winter holiday lights guide and a Fall
// photo rail, which put "Holiday Nights Out" third in a Fall rail. A seasonal
// collection (fall, summer) only takes guides of its own season or guides
// with no season. Year-round collections are unchanged: guide lifecycle
// (when a seasonal guide is live at all) is the caller's job, as before.
const SEASON_RULES = [
  ['winter', /\b(christmas|xmas|holidays?|santa|hanukkah|kwanzaa|new year'?s?|winter)\b/i],
  ['fall', /\b(fall|autumn|halloween|pumpkins?|haunt(?:ed|s)?|spooky|corn maze|oktoberfest)\b/i],
  ['summer', /\bsummer\b/i],
];
const COLLECTION_SEASON = { fall: 'fall', summer: 'summer' };

// The one season a guide belongs to, from its own slug and title; null when it
// names none (or names more than one, which reads as year-round).
export function guideSeason(guide) {
  // "Winter Park", "Winter Haven", "Winter Garden" and "Winter Springs" are
  // Florida cities, not a season.
  const text = `${guide?.slug || ''} ${guide?.title || ''}`.replace(/-/g, ' ')
    .replace(/\bwinter (park|haven|garden|springs)\b/gi, ' ');
  const hits = SEASON_RULES.filter(([, rx]) => rx.test(text)).map(([season]) => season);
  return hits.length === 1 ? hits[0] : null;
}

export function guideFitsCollectionSeason(guide, collectionId) {
  const want = COLLECTION_SEASON[collectionId] || null;
  if (!want) return true;
  const season = guideSeason(guide);
  return season === null || season === want;
}

// TOPIC RELEVANCE (owner decision 2026-10-13, same rule as guideForPlaceRail):
// a guide rides a collection rail only when its TOPIC is on that rail's accepted
// list in lib/guideRailTopics.js. This file only maps a menu-poster collection
// (and, where one collection mixes subjects, a rail inside it) to the topic
// table's rail key; it never restates the table. No key means no guide (fail
// closed): creator-picks has no subject of its own, and a collection or rail
// this map does not know takes none either. Collections that never mount
// GuideRailCollection (halloween, christmas) are not listed on purpose.
//   key = id of the rail in lib/rails.js whose poster the collection renders.
export const COLLECTION_RAIL_KEY = Object.freeze({
  'worth-eating': 'eat',      // cuisine rails (lib/worthEatingRails.js) are all Eat
  breakfast: 'breakfast',     // breakfast-restaurants, breakfast-cafes
  'lunch-break': 'break',
  'date-night': 'datenight',
  'night-out': 'tonight',
  birthday: 'birthday',
  summer: 'season',           // Summer Picks is the `season` tile (/summer-picks)
  fall: 'augtober',
  today: 'today',
  // 'creator-picks': no topic of its own, so deliberately absent.
});
// Today mixes subjects; these rails borrow the matching topic key instead.
export const COLLECTION_RAIL_OVERRIDES = Object.freeze({
  today: Object.freeze({ food: 'eat', beaches: 'beach' }),
});

export function collectionRailKey(collectionId, railId) {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const over = has(COLLECTION_RAIL_OVERRIDES, collectionId) ? COLLECTION_RAIL_OVERRIDES[collectionId] : null;
  if (over && has(over, railId)) return over[railId];
  return has(COLLECTION_RAIL_KEY, collectionId) ? COLLECTION_RAIL_KEY[collectionId] : null;
}

// Ranked best first: topical fit, then how many of the rail's places the guide
// covers, then the stable hash. Selection takes candidates[0] (or keeps the
// previous one while it still qualifies), so a better fit wins the slot.
export function guideRailCandidates(guides, rails, collectionId) {
  const candidates = [];
  for (const rail of rails || []) {
    if (!rail?.id) continue;
    const key = collectionRailKey(collectionId, rail.id);
    if (!key) continue; // no topic key: this rail takes no guide
    const rows = Array.isArray(rail.places) ? rail.places : Array.isArray(rail.cards) ? rail.cards : [];
    const places = rows.filter((row) => row && !row._sponsored && (!row.kind || row.kind === 'place')).slice(0, 8);
    const ids = new Set(places.map((row) => row.placeId || row.id).filter(Boolean));
    const seen = new Set();
    for (const guide of guides || []) {
      if (!guide?.slug || !guide.image?.src || seen.has(guide.slug)) continue;
      seen.add(guide.slug);
      if (!guideFitsCollectionSeason(guide, collectionId)) continue;
      const fit = guideRailFit(guide, key);
      if (!fit) continue; // off-topic for this rail: a shared venue is not enough
      const coverage = (guide.placeIds || []).filter((id) => ids.has(id)).length;
      if (coverage) candidates.push({ railId: rail.id, guide, matched: matchedGuidePlace(guide, places), fit, coverage });
    }
  }
  return candidates.sort((a, b) => b.fit - a.fit || b.coverage - a.coverage
    || guideDiscoveryHash(`${collectionId}:${a.railId}:${a.guide.slug}`) - guideDiscoveryHash(`${collectionId}:${b.railId}:${b.guide.slug}`)
    || a.railId.localeCompare(b.railId) || a.guide.slug.localeCompare(b.guide.slug));
}

// Keep a still-relevant selection in place as more cards/rails arrive. A city,
// filter or lifecycle change that removes its exact match releases the slot.
export function settleGuideRailSelection(candidates, previous) {
  return candidates.find((item) => item.railId === previous?.railId && item.guide.slug === previous?.guide?.slug) || candidates[0] || null;
}
