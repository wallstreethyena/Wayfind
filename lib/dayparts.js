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
// rival to them. nowContext's BUCKET_EDGES are morning 6–11.5, afternoon
// 11.5–17.5, night 17.5–6. This module splits that afternoon in two — lunch
// 11.5–14, afternoon 14–17.5 — because "what should we eat" and "what should we
// do with the rest of the day" order the rail differently, and leaves the other
// two edges exactly where nowContext puts them. BAND_TO_BUCKET states the
// mapping and scripts/test-dayparts.mjs proves it holds for all 1,440 minutes
// of the day. A rail that said "morning" while the rest of the page said
// "afternoon" would be the very bug check-one-clock was written to stop.

import { beachMetroForCity } from "./locationHonesty.js";

/** Which canonical nowContext bucket each band lives inside. */
export const BAND_TO_BUCKET = {
  morning: 'morning',
  lunch: 'afternoon',
  afternoon: 'afternoon',
  night: 'night',
};

/** Daypart bands, in FLOAT hours. `to` is exclusive; `night` wraps midnight. */
export const DAYPARTS = {
  // v8.15 — two rails join the bands (owner, 2026-08-18). `breakfast` leads
  // the morning right behind season — it IS the morning question — and parks
  // at the back everywhere else (still one swipe away, never removed).
  // `birthday` is a daytime PLANNING card ("make sure it is placed during the
  // day into the placement where it needs to be as we previously organized"):
  // prominent through morning/lunch/afternoon, late in the night band.
  // v8.23.2 — SEASON NO LONGER LEADS EVERY BAND (owner, 2026-08-19: "the
  // placement of the cards are not getting updated based on the time of day
  // can you check to see if it is broken?").
  //
  // It was not broken. It was INVISIBLE, which is worse, because everything
  // downstream measured fine: the clock resolved, the band flipped at the right
  // hour, and fifteen of the seventeen rails genuinely moved. But 'season' sat
  // at index 0 in all four arrays, and a phone shows about 1.3 tiles
  // (--wf8-tw: min(76vw,340px)). So the reader saw ONE card, and it was Summer
  // Picks at 8am, at noon, at 4pm and at 7pm. The whole feature was happening
  // off-screen to the right.
  //
  // The tell that this was drift rather than a decision: every band's `why`
  // string — which is RENDERED to the reader in the daypart bar — described the
  // order it would have had WITHOUT the pin. The lunch band said "Food leads."
  // over a rail led by Summer Picks. The v8.15 note two lines up says breakfast
  // "IS the morning question" and then placed it second.
  //
  // So each band leads with its own axis, and season keeps a strong third —
  // still inside the first swipe on desktop, still carrying its expiry urgency,
  // no longer eating the one slot a phone reader can see.
  //
  // THE TOP THREE ARE A TEMPLATE, deliberately: [the band's own axis]
  // [trending] [season]. It is the only arrangement satisfying all three
  // standing rules at once — this one, the top-3 slot 'trending' has held since
  // v8.17 (test-dayparts), and season's strong-but-never-first placement. Slot 1
  // is what rotates, and slot 1 is what a phone shows.
  // scripts/check-daypart-rotation.mjs asserts the first tile differs across all
  // four bands AND that each `why` still describes the rail it actually leads.
  morning: {
    label: 'Morning', from: 6, to: 11.5,
    why: 'Breakfast first, then what is moving. A drive still fits.',
    // v8.33 — `cindy` is a café shelf, so morning is the hour it earns: the
    // FOURTH slot, the first one after the standing top-three template. It
    // cannot go higher: slot 1 is the band's own axis and is what rotates,
    // slot 2 has been `trending` since v8.17, and `season` holds slot 3 in
    // every band (test-seasonal-picks fails the build on any of those moving).
    order: ['breakfast', 'trending', 'season', 'cindy', 'today', 'eat', 'best', 'birthday', 'beach', 'family', 'drive', 'gems', 'locals', 'break', 'datenight', 'tonight', 'events', 'blog'],
  },
  lunch: {
    label: 'Lunch', from: 11.5, to: 14,
    why: 'Food leads. Nothing that needs an evening.',
    order: ['eat', 'trending', 'season', 'break', 'cindy', 'best', 'birthday', 'locals', 'gems', 'today', 'family', 'beach', 'tonight', 'datenight', 'drive', 'events', 'breakfast', 'blog'],
  },
  afternoon: {
    label: 'Afternoon', from: 14, to: 17.5,
    why: 'Now first, then tonight becomes the question.',
    order: ['today', 'trending', 'season', 'best', 'cindy', 'birthday', 'eat', 'beach', 'family', 'locals', 'gems', 'drive', 'tonight', 'datenight', 'events', 'break', 'breakfast', 'blog'],
  },
  night: {
    label: 'Night', from: 17.5, to: 6,
    why: 'Tonight leads, with dinner right behind it.',
    order: ['tonight', 'trending', 'season', 'eat', 'datenight', 'events', 'best', 'locals', 'gems', 'drive', 'birthday', 'family', 'today', 'beach', 'break', 'breakfast', 'cindy', 'blog'],
  },
};

export const DAYPART_IDS = ['morning', 'lunch', 'afternoon', 'night'];

/**
 * Which band a FLOAT hour falls in. Night wraps: 17:30 → 05:59.
 *
 * Takes a float, not getHours(), for the same reason bucketForHour does: an
 * integer hour cannot express 11:30, and two of the four edges sit there.
 *
 * @param {number} h float hour, from siteHourFloat()
 */
export function partForHour(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return 'afternoon';
  const hh = ((n % 24) + 24) % 24;
  if (hh >= 6 && hh < 11.5) return 'morning';
  if (hh >= 11.5 && hh < 14) return 'lunch';
  if (hh >= 14 && hh < 17.5) return 'afternoon';
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
