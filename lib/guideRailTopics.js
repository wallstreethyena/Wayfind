// lib/guideRailTopics.js: WHICH GUIDE MAY RIDE WHICH RAIL.
//
// OWNER DECISION (2026-10-13): "A shared restaurant alone should not qualify a
// guide for an unrelated rail. Preserve the third card rule while requiring a
// relevant guide." Live misses: "26 Birthday Freebies in Bradenton & Sarasota"
// on the Breakfast rail and "10 Best Things to Do in Parrish" on the Eat rail,
// each only because one restaurant sat in both lists.
//
// THE RULE: a guide qualifies for a rail only when (1) the guide's TOPIC is on
// that rail's accepted list below AND (2) the guide covers one of the rail's
// leading places (lib/guideDiscovery.js keeps that exact-venue test). Where no
// guide qualifies the third slot stays EMPTY. The 2026-10-08 third-card rule
// (lib/railGuideSlot.js) says WHERE a guide goes, never that a rail must have
// one; a rail with no relevant guide shows only places (no filler).
//
// Explicit tables, no fuzzy word matching at selection time:
//   1. GUIDE_KINDS_BY_SLUG  every current guide, hand classified.
//   2. KIND_PATTERNS        only a fallback for a NEW slug that follows the
//                           naming convention. A guide that matches neither has
//                           no kinds and rides no rail (fail closed), and
//                           scripts/check-guide-rail-relevance.mjs goes red until
//                           someone classifies it.
//   3. RAIL_GUIDE_TOPICS    rail id -> accepted kinds, weight 2 (the rail's own
//                           subject) or 1 (adjacent). Weight is the topical fit.
//
// Decisions worth knowing:
//   - A "things to do in <city>" guide is a `destination` guide. It fits
//     today / drive and never a food rail, even when it lists a restaurant.
//   - A restaurants guide is `dining`: eat (2), breakfast / break / datenight /
//     tonight (1). Birthday freebies are `birthday`: birthday rail only. They
//     are Starbucks, Sephora and AMC as much as food, so no food rail takes them.
//   - Seasonal kinds (`fall`, `winter`) only ride the matching seasonal rails
//     (halloween, augtober, christmas) plus events-style rails.
//   - Rails with no topic of their own (trending, locals, cindy, blog) take no
//     guide. A rail id this table does not know takes none either.
// Pure data and pure functions: no clock, no randomness.

export const GUIDE_KINDS_BY_SLUG = Object.freeze({
  'florida-winter-beaches-2026': ['beach', 'winter'],
  'florida-theme-park-christmas-2026': ['themepark', 'winter'],
  'florida-holiday-nights-out-2026': ['events', 'winter'],
  'florida-manatee-season-2026': ['nature', 'winter'],
  'florida-christmas-boat-parades-2026': ['events', 'winter'],
  'things-to-do-in-bradenton-florida': ['destination'],
  'things-to-do-in-miami-florida': ['destination'],
  'things-to-do-in-ellenton-florida': ['destination'],
  'things-to-do-in-palmetto-florida': ['destination'],
  'things-to-do-in-lakewood-ranch-florida': ['destination'],
  'things-to-do-in-cortez-florida': ['destination'],
  'things-to-do-in-longboat-key-florida': ['destination', 'beach'],
  'things-to-do-in-venice-florida': ['destination', 'beach'],
  'things-to-do-in-tampa-florida': ['destination'],
  'things-to-do-in-parrish-florida': ['destination'],
  'things-to-do-in-sarasota-florida': ['destination'],
  'things-to-do-sarasota': ['destination'],
  'things-to-do-orlando-not-theme-parks': ['destination'],
  'sarasota-restaurants': ['dining'],
  'tampa-restaurants': ['dining'],
  'st-pete-restaurants': ['dining'],
  'orlando-restaurants': ['dining'],
  'miami-restaurants': ['dining'],
  'st-armands-circle-restaurants': ['dining'],
  'best-restaurants-disney-springs': ['dining'],
  'best-cuban-sandwich-tampa': ['dining'],
  'sarasota-half-price-dining': ['dining'],
  'gulf-coast-brunch-and-date-night': ['brunch', 'datenight', 'dining'],
  // Ended guides (lib/guideLifecycle.js endsOn) stay classified so the guard
  // can demand a kind for every guide in the corpus.
  'magical-dining-orlando-2026': ['dining'],
  'tonights-move-tampa-september-12-2026': ['events'],
  'red-bull-dance-your-style-tampa-2026': ['events'],
  'pintos-farm-miami-2026': ['fall', 'family'],
  'florida-lovebug-season': ['fall'],
  'trending-in-florida-this-week-oct-19-2026': ['events'],
  'gulf-coast-world-series-week-2026': ['events'],
  'tampa-bay-rays-game-day-tropicana-field': ['events'],
  'fall-events-orlando-2026': ['fall', 'events'],
  'orlando-halloween-food-2026': ['fall', 'dining'],
  'birthday-freebies-bradenton-sarasota': ['birthday'],
  'swim-with-manatees-crystal-river': ['nature', 'daytrip'],
  'bioluminescence-kayak-tour-space-coast': ['nature', 'daytrip'],
  'florida-scalloping-crystal-river-homosassa': ['nature', 'daytrip'],
  'weeki-wachee-kayak-mermaids-guide': ['nature', 'daytrip'],
  'myakka-river-state-park-guide': ['nature'],
  'de-soto-national-memorial-bradenton': ['nature'],
  'robinson-preserve-bradenton': ['nature'],
  'anna-maria-island-day-trip': ['beach', 'daytrip'],
  'siesta-key-vs-lido-key': ['beach'],
  'siesta-key-drum-circle': ['beach', 'events'],
  'orlando-in-the-rain': ['rainy', 'destination'],
  'best-hotels-near-magic-kingdom': ['lodging', 'family', 'themepark'],
  'gatorland-vs-wild-florida': ['family', 'nature'],
  'ybor-city-tampa-guide': ['destination'],
  'tampa-riverwalk-guide': ['destination'],
  'pinecraft-sarasota-amish-village': ['destination'],
  'winter-park-scenic-boat-tour': ['destination'],
});

// Fallback for a NEW slug only. Anchored on slug shape, never on title prose.
export const KIND_PATTERNS = Object.freeze([
  [/(^|-)restaurants$/, ['dining']],
  [/^things-to-do-/, ['destination']],
]);

export function guideKinds(slug) {
  const s = String(slug || '');
  if (Object.prototype.hasOwnProperty.call(GUIDE_KINDS_BY_SLUG, s)) return GUIDE_KINDS_BY_SLUG[s].slice();
  for (const [rx, kinds] of KIND_PATTERNS) if (rx.test(s)) return kinds.slice();
  return [];
}

// rail id -> { kind: weight }. 2 = the rail's own subject, 1 = adjacent.
export const RAIL_GUIDE_TOPICS = Object.freeze({
  eat: { dining: 2, brunch: 2 },
  breakfast: { brunch: 2, dining: 1 },
  break: { dining: 1 },
  lunchcity: { dining: 2 },
  chef: { dining: 2 },
  datenight: { datenight: 2, dining: 1 },
  tonight: { datenight: 2, events: 2, dining: 1 },
  events: { events: 2 },
  birthday: { birthday: 2 },
  beach: { beach: 2, daytrip: 1 },
  family: { family: 2, themepark: 1, nature: 1, rainy: 1 },
  drive: { daytrip: 2, nature: 2, destination: 1, beach: 1 },
  today: { destination: 2, nature: 1, beach: 1, family: 1, events: 1, rainy: 1 },
  season: { rainy: 2, beach: 2, family: 1, nature: 1 },
  halloween: { fall: 2, events: 1 },
  augtober: { fall: 2, events: 1 },
  christmas: { winter: 2 },
  // No topic of their own: trending, locals, cindy, blog.
});

// Topical fit of a guide for a rail: 0 = does not qualify, else the best weight.
// `guide.kinds` (stamped by guideDiscoveryIndex) wins; the slug is the fallback.
export function guideRailFit(guide, railId) {
  const table = Object.prototype.hasOwnProperty.call(RAIL_GUIDE_TOPICS, railId) ? RAIL_GUIDE_TOPICS[railId] : null;
  if (!table || !guide) return 0;
  const kinds = Array.isArray(guide.kinds) ? guide.kinds : guideKinds(guide.slug);
  let best = 0;
  for (const kind of kinds) best = Math.max(best, table[kind] || 0);
  return best;
}
