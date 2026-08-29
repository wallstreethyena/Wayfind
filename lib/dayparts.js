// lib/dayparts.js
//
// The hour decides what LEADS. It never decides what EXISTS.
//
// Every rail renders in every daypart — an off-peak card is parked on the right,
// one swipe away, never removed. Hiding a card the user came for is worse than
// showing it late. `orderFor()` enforces that: the band's priority list first,
// then everything else in its canonical order, deduped.
//
// Extracted from the rail prototype (public/lab/menu.html) so the V8 rail and
// the prototype cannot drift. Pure functions, no DOM — safe to call from a
// server component, a client component, or a test.
//
// THE HOUR COMES FROM lib/nowContext.js, ALWAYS. This module never reads a
// clock; callers pass the float hour in from siteHourFloat(now, tzForPoint(...)),
// which is venue-local and DST-aware. See scripts/check-one-clock.mjs for the
// incident that rule exists for: 38 private bucketings that all disagreed.
//
// AND THE FOUR BANDS ARE A REFINEMENT OF THE THREE CANONICAL BUCKETS, not a
// rival to them. nowContext's TIME_BUCKETS stay morning / afternoon / night.
// This module splits afternoon into lunch 11.5–13 and afternoon 13–17.5,
// because those windows order the FIRST poster differently (break vs tonight).
// From 13:00 the night poster leads in both remaining bands — afternoon
// (still the afternoon *bucket*) and night. Every `from`/`to` is asserted
// equal to BUCKET_EDGES in scripts/test-dayparts.mjs — no private hour.
// That file also proves BAND_TO_BUCKET for all 1,440 minutes of the day.

import { beachMetroForCity } from "./locationHonesty.js";

/** Which canonical nowContext bucket each band lives inside. */
export const BAND_TO_BUCKET = {
  morning: 'morning',
  lunch: 'afternoon',
  afternoon: 'afternoon',
  night: 'night',
};

/** Shared tonight-leads order. Afternoon (1pm–5:30) and night (5:30–6am)
 *  show the same first tile — owner, 2026-08-29 12:25 ET: the night poster
 *  takes over at 1pm. One list so the two bands cannot drift. */
const NIGHT_ORDER = ['tonight', 'trending', 'season', 'events', 'datenight', 'eat', 'augtober', 'chef', 'best', 'locals', 'gems', 'drive', 'birthday', 'family', 'today', 'beach', 'break', 'breakfast', 'cindy', 'blog'];

/** Daypart bands, in FLOAT hours. `to` is exclusive; `night` wraps midnight. */
export const DAYPARTS = {
  // THE TOP THREE ARE A TEMPLATE: [the band's own axis] [trending] [season].
  // Slot 1 is what a phone shows (~1.3 tiles). From 13:00 that slot is
  // tonight in both remaining bands — that is the 1pm instruction, not drift.
  //
  // v8.91 (owner, 2026-08-29, 12:25 ET): "Nonnight poster should takenover
  // at 1pm" — tonight FIRST from 13:00 through 06:00.
  //   morning  06:00–11:30  breakfast (yellow BEST BREAKFAST PICKS)
  //   lunch    11:30–13:00  the lunch poster (break), not breakfast, not tonight
  //   afternoon 13:00–17:30 tonight first (still the afternoon bucket)
  //   night    17:30–06:00  tonight first
  morning: {
    label: 'Morning', from: 6, to: 11.5,
    why: 'Breakfast first, then what is moving. A drive still fits.',
    order: ['breakfast', 'trending', 'season', 'eat', 'cindy', 'augtober', 'chef', 'today', 'best', 'beach', 'birthday', 'family', 'drive', 'gems', 'locals', 'break', 'datenight', 'tonight', 'events', 'blog'],
  },
  lunch: {
    label: 'Lunch', from: 11.5, to: 13,
    why: 'A thirty-minute lunch, then the beach if you have the afternoon.',
    order: ['break', 'trending', 'season', 'eat', 'beach', 'best', 'today', 'augtober', 'chef', 'cindy', 'family', 'birthday', 'gems', 'locals', 'drive', 'events', 'tonight', 'datenight', 'breakfast', 'blog'],
  },
  afternoon: {
    label: 'Afternoon', from: 13, to: 17.5,
    why: 'Tonight leads — the night is calling from one o\'clock.',
    order: NIGHT_ORDER,
  },
  night: {
    label: 'Night', from: 17.5, to: 6,
    why: 'Tonight leads, with dinner right behind it.',
    order: NIGHT_ORDER,
  },
};

export const DAYPART_IDS = ['morning', 'lunch', 'afternoon', 'night'];

/**
 * Which band a FLOAT hour falls in. Night wraps: 17:30 → 05:59.
 *
 * Takes a float, not getHours(), for the same reason bucketForHour does: an
 * integer hour cannot express 11:30, and several edges sit there.
 *
 * @param {number} h float hour, from siteHourFloat()
 */
export function partForHour(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return 'afternoon';
  const hh = ((n % 24) + 24) % 24;
  // Derived from DAYPARTS.from/to so a band edge cannot disagree with the
  // function that consumes it. Night wraps midnight (from > to).
  for (const id of DAYPART_IDS) {
    const { from, to } = DAYPARTS[id];
    const inside = from < to ? (hh >= from && hh < to) : (hh >= from || hh < to);
    if (inside) return id;
  }
  return 'afternoon';
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

/**
 * Some routes have NO index page — only a dynamic segment — so a bare href is a
 * soft-404, not a redirect. Verified against the route tree 2026-08-15:
 *
 *   /best-beaches  -> [metro], keys in lib/beaches.js BEACH_METROS
 *                     ("manatee-sarasota" | "tampa" | "orlando")
 *   /things-to-do  -> [city],  keys in lib/landing.js LANDING_CITIES
 *   /restaurants   -> [city],  same keys
 *
 * The beach map used to say "sarasota-bradenton", which is not a BEACH_METROS
 * key. app/best-beaches/[metro]/page.js documents exactly what an unknown metro
 * does: HTTP 200, indexable, canonical inherited from the layout ("/") — an
 * unbounded indexable URL space telling Google every one is a duplicate of the
 * homepage. A rail card pointed there would have shipped that from the homepage
 * itself, on the highest-traffic surface the site has.
 */
export const METRO_FOR_REGION = {
  orlando: 'orlando',
  fl: 'manatee-sarasota',
  other: 'manatee-sarasota',
};

/** Default LANDING_CITIES slug per region, used when no city is supplied. */
export const CITY_FOR_REGION = {
  orlando: 'orlando',
  fl: 'sarasota',
  other: 'sarasota',
};

export function metroFor(region) {
  return METRO_FOR_REGION[region] || METRO_FOR_REGION.other;
}

export function cityFor(region) {
  return CITY_FOR_REGION[region] || CITY_FOR_REGION.other;
}

/** Routes that cannot be linked bare. Value resolves the missing segment. */
const SEGMENTED = {
  '/best-beaches': (region) => metroFor(region),
  '/things-to-do': (region, citySlug) => citySlug || cityFor(region),
  '/restaurants': (region, citySlug) => citySlug || cityFor(region),
  // v8.3: the homepage category tabs navigate now, and Night out points here.
  // It shares the LANDING_CITIES key set with the two above, so it degrades the
  // same way — cityFor() is never null, which is what stops a bare /nightlife
  // (an indexable soft-404 canonicalised to "/", see check-rail-routes).
  '/nightlife': (region, citySlug) => citySlug || cityFor(region),
};

/** Every route a rail can point at, for the guard that proves none 404s. */
export const SEGMENTED_ROUTES = Object.keys(SEGMENTED);

/**
 * Resolve a rail's destination to a URL that actually exists.
 * @param {object} rail      a RAILS entry
 * @param {string} region    'orlando' | 'fl' | 'other'
 * @param {string} [citySlug] a LANDING_CITIES key the caller already ranked for
 */
export function railHref(rail, region, citySlug) {
  if (!rail || !rail.href) return null;
  const seg = SEGMENTED[rail.href];
  if (!seg) return rail.href;
  // Never invent a city. A missing slug used to fall through cityFor(region)
  // to Sarasota, so Boston / New York / unknown still emitted
  // /restaurants/sarasota and /best-beaches/manatee-sarasota.
  if (rail.href === "/best-beaches") {
    const metro = beachMetroForCity(citySlug);
    return metro ? `${rail.href}/${metro}` : null;
  }
  if (!citySlug) return null;
  return `${rail.href}/${citySlug}`;
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
