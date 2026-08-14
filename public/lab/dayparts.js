// lib/dayparts.js
//
// The hour decides what LEADS. It never decides what EXISTS.
//
// Every rail renders in every daypart — an off-peak card is parked on the right,
// one swipe away, never removed. Hiding a card the user came for is worse than
// showing it late. `orderFor()` enforces that: the band's priority list first,
// then everything else in its canonical order, deduped.
//
// Extracted verbatim from the rail prototype (public/lab/menu.html) so the V8
// rail and the prototype cannot drift. Pure functions, no imports, no DOM —
// safe to call from a server component, a client component, or a test.

/** Daypart bands. `to` is exclusive; `night` wraps midnight. */
export const DAYPARTS = {
  morning: {
    label: 'Morning', from: 5, to: 11,
    why: 'Immediate intent first: the day, then food. A drive still fits.',
    order: ['season', 'today', 'trending', 'eat', 'best', 'beach', 'family', 'drive', 'gems', 'locals', 'break', 'datenight', 'tonight', 'events', 'blog'],
  },
  lunch: {
    label: 'Lunch', from: 11, to: 14,
    why: 'Food leads. Nothing that needs an evening.',
    order: ['season', 'eat', 'trending', 'break', 'best', 'locals', 'gems', 'today', 'family', 'beach', 'tonight', 'datenight', 'drive', 'events', 'blog'],
  },
  afternoon: {
    label: 'Afternoon', from: 14, to: 17,
    why: 'Now first, then tonight becomes the question.',
    order: ['season', 'today', 'trending', 'best', 'eat', 'beach', 'family', 'locals', 'gems', 'drive', 'tonight', 'datenight', 'events', 'break', 'blog'],
  },
  night: {
    label: 'Night', from: 17, to: 5,
    why: 'Tonight, with dinner right behind it.',
    order: ['season', 'tonight', 'trending', 'eat', 'datenight', 'events', 'best', 'locals', 'gems', 'drive', 'family', 'today', 'beach', 'break', 'blog'],
  },
};

export const DAYPART_IDS = ['morning', 'lunch', 'afternoon', 'night'];

/**
 * Which band a given hour falls in. Night wraps: 17:00 → 04:59.
 * @param {number} h 0-23
 */
export function partForHour(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return 'afternoon';
  const hh = ((Math.floor(n) % 24) + 24) % 24;
  if (hh >= 5 && hh < 11) return 'morning';
  if (hh >= 11 && hh < 14) return 'lunch';
  if (hh >= 14 && hh < 17) return 'afternoon';
  return 'night';
}

/**
 * Full rail order for a band. The band's priority list first, then every
 * remaining rail in canonical order. Nothing is ever dropped.
 *
 * @param {string} part          daypart id
 * @param {string[]} allRailIds  every rail that exists, in canonical order
 * @returns {string[]}           complete ordered list, deduped
 */
export function orderFor(part, allRailIds) {
  const dp = DAYPARTS[part] || DAYPARTS.afternoon;
  const all = Array.isArray(allRailIds) ? allRailIds : [];
  const known = new Set(all);
  const seen = new Set();
  const out = [];
  // Priority list, but only ids that actually exist — a stale id must not
  // render a card that isn't there.
  for (const id of dp.order) {
    if (known.has(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  }
  // Everything else, canonical order.
  for (const id of all) {
    if (!seen.has(id)) { seen.add(id); out.push(id); }
  }
  return out;
}

/** Convenience: order straight from an hour. */
export function orderForHour(h, allRailIds) {
  return orderFor(partForHour(h), allRailIds);
}

// ── Regional card art ────────────────────────────────────────────────────────
// Some rails ship different artwork by region. Bounds are generous rectangles,
// checked most-specific first.

const ORLANDO = { latMin: 28.20, latMax: 28.85, lngMin: -81.75, lngMax: -80.95 };
const FLORIDA = { latMin: 24.40, latMax: 31.05, lngMin: -87.70, lngMax: -79.90 };

const inBox = (lat, lng, b) =>
  lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax;

/**
 * 'orlando' | 'fl' | 'other'. Returns 'other' for missing/invalid coords so a
 * card always has art to render.
 */
export function regionFor(lat, lng) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return 'other';
  if (inBox(la, ln, ORLANDO)) return 'orlando';
  if (inBox(la, ln, FLORIDA)) return 'fl';
  return 'other';
}

/** Metro slug for routes that have no index page (e.g. /best-beaches/[metro]). */
export const METRO_FOR_REGION = {
  orlando: 'orlando',
  fl: 'sarasota-bradenton',
  other: 'sarasota-bradenton',
};

export function metroFor(region) {
  return METRO_FOR_REGION[region] || METRO_FOR_REGION.other;
}

/**
 * Resolve a rail's destination. `/best-beaches` has no index route — only
 * `[metro]` — so a bare href would 404. Any route needing a segment goes here.
 */
export function railHref(rail, region) {
  if (!rail || !rail.href) return null;
  if (rail.href === '/best-beaches') return `/best-beaches/${metroFor(region)}`;
  return rail.href;
}

// ── Analytics ────────────────────────────────────────────────────────────────
// The hero swipe rail these cards replace fires these names today. Keep emitting
// them alongside `rail_open` for one release so existing dashboards and funnels
// don't flatline at cutover. Delete this map once the new series has history.
export const LEGACY_HERO_EVENT = {
  beach: 'beach_hero_open',
  gems: 'hidden_gems_hero_open',
  datenight: 'datenight_hero_open',
  family: 'family_hero_open',
  trending: 'buzz_hero_open',
  season: 'seasonal_hero_open',
  locals: 'creator_video_hero_open',
  today: 'discovery_hero_open',
};
