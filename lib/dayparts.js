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
// AND THE FIVE BANDS ARE A REFINEMENT OF THE THREE CANONICAL BUCKETS, not a
// rival to them. nowContext's TIME_BUCKETS stay morning / afternoon / night.
// This module splits afternoon into lunch 11.5–14 and afternoon 14–17.5, and
// splits night into evening 17.5–22 and night 22–6, because those windows
// order the FIRST poster differently. Every `from`/`to` is asserted equal
// to BUCKET_EDGES in scripts/test-dayparts.mjs — no private hour. That
// file also proves BAND_TO_BUCKET for all 1,440 minutes of the day.
// A rail that said "morning" while the rest of the page said "afternoon"
// would be the very bug check-one-clock was written to stop.

import { beachMetroForCity } from "./locationHonesty.js";

/** Which canonical nowContext bucket each band lives inside. */
export const BAND_TO_BUCKET = {
  morning: 'morning',
  lunch: 'afternoon',
  afternoon: 'afternoon',
  evening: 'night',
  night: 'night',
};

/** Shared night-window order. Evening is this list with `eat` pulled first. */
const NIGHT_ORDER = ['tonight', 'trending', 'season', 'events', 'datenight', 'eat', 'augtober', 'chef', 'best', 'locals', 'gems', 'drive', 'birthday', 'family', 'today', 'beach', 'break', 'breakfast', 'cindy', 'blog'];

/** Daypart bands, in FLOAT hours. `to` is exclusive; `night` wraps midnight. */
export const DAYPARTS = {
  // THE TOP THREE ARE A TEMPLATE: [the band's own axis] [trending] [season].
  // Slot 1 is what rotates, and slot 1 is what a phone shows (~1.3 tiles).
  // scripts/check-daypart-rotation.mjs asserts the first tile differs across
  // every band AND that each `why` still describes the rail it actually leads.
  //
  // v8.91 (owner, 2026-08-29, 11:35 ET, Parrish): the FIRST poster was the
  // generic eat tile at an hour that is still lunch on the clock, and tonight
  // was leading from 17:30 — hours before anyone is picking a night out.
  // The five windows below are that instruction, read off BUCKET_EDGES so
  // they cannot become a private clock:
  //   morning  06:00–11:30  breakfast (yellow BEST BREAKFAST PICKS)
  //   lunch    11:30–14:00  the lunch poster (break), not breakfast, not tonight
  //   afternoon 14:00–17:30 today / season / activities — not night
  //   evening  17:30–22:00  dinner/eat leads; tonight nearby, not first
  //   night    22:00–06:00  tonight first
  morning: {
    label: 'Morning', from: 6, to: 11.5,
    why: 'Breakfast first, then what is moving. A drive still fits.',
    // breakfast IS the morning question. eat sits fourth — the first slot
    // after the locked template — so "places to eat" is one swipe behind
    // the yellow coffee-cup poster, never in front of it.
    order: ['breakfast', 'trending', 'season', 'eat', 'cindy', 'augtober', 'chef', 'today', 'best', 'beach', 'birthday', 'family', 'drive', 'gems', 'locals', 'break', 'datenight', 'tonight', 'events', 'blog'],
  },
  lunch: {
    label: 'Lunch', from: 11.5, to: 14,
    why: 'A thirty-minute lunch, then the beach if you have the afternoon.',
    // The lunch poster leads — `break` is "Lunch break. Handled." — so a
    // phone at 11:35 does not see breakfast (the morning is over) and does
    // not see tonight. eat stays right behind the template.
    order: ['break', 'trending', 'season', 'eat', 'beach', 'best', 'today', 'augtober', 'chef', 'cindy', 'family', 'birthday', 'gems', 'locals', 'drive', 'events', 'tonight', 'datenight', 'breakfast', 'blog'],
  },
  afternoon: {
    label: 'Afternoon', from: 14, to: 17.5,
    why: 'The day is still open — a plan, then what is moving.',
    // today / season / activities. tonight and events park behind the plan
    // rails: this window is not night, and leading with them here is what
    // made 2pm look like 10pm.
    order: ['today', 'trending', 'season', 'best', 'beach', 'family', 'drive', 'augtober', 'chef', 'gems', 'locals', 'eat', 'cindy', 'birthday', 'events', 'datenight', 'tonight', 'break', 'breakfast', 'blog'],
  },
  evening: {
    label: 'Evening', from: 17.5, to: 22,
    why: 'Dinner leads, and tonight is one swipe away.',
    // 17:30–22:00 is when people eat. tonight sits fourth — nearby, not
    // first. Built from NIGHT_ORDER so the two bands cannot drift apart
    // and the homepage does not ship a second 20-id list.
    order: ['eat', 'trending', 'season', ...NIGHT_ORDER.filter((id) => id !== 'eat' && id !== 'trending' && id !== 'season')],
  },
  night: {
    label: 'Night', from: 22, to: 6,
    why: 'Tonight leads, with dinner right behind it.',
    order: NIGHT_ORDER,
  },
};

export const DAYPART_IDS = ['morning', 'lunch', 'afternoon', 'evening', 'night'];

/**
 * Which band a FLOAT hour falls in. Night wraps: 22:00 → 05:59.
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
