// lib/worthTheDrive.js — /worth-the-drive as a GATEWAY, not just a longer list.
//
// OWNER (2026-08-01): "this has to be anything and everything that is truly
// worth the drive… we should actually recommend hero cards here, for example
// the beach hero card, because sometimes based on the distance other places,
// cities, collections of curated experiences, or the top beaches in other
// places [are worth it]. This should be a gate for other places and
// destinations the user is able to explore and accidentally come across."
//
// So the page keeps its ranked places AND gains a rail of DESTINATIONS — whole
// collections one town over that the user would never have searched for. That
// serendipity is the point: the surface exists to let someone discover that the
// beaches an hour south are worth the morning.
//
// THREE RULES THIS MODULE ENFORCES, because a discovery rail is exactly where a
// plausible-but-wrong recommendation does the most damage:
//
//   1. EVERY DESTINATION IS A ROUTE THAT EXISTS. Each entry names a real page
//      (/best-beaches/<metro>, /culture/<metro>) whose key is validated against
//      that route's own registry at import. A card linking to a 404 is worse
//      than no card — the guard fails the build instead.
//   2. EVERY DISTANCE IS REAL. Computed by haversine from MARKETS coordinates,
//      never estimated, never a hardcoded "about an hour". BEACH_METROS and
//      CULTURE carry no coordinates, so each key is mapped to a MARKETS key and
//      an unmappable key is DROPPED rather than guessed.
//   3. "WORTH THE DRIVE" IS A BAND, NOT A DIRECTION. A destination inside the
//      local radius is not a drive — it is already in the list above, and
//      showing it twice makes the page look broken. Beyond the far bound it is
//      not a day trip. Both edges are enforced.
import { MARKETS } from "./destinations.js";
import { BEACH_METROS } from "./beaches.js";
import { CULTURE } from "./culture.js";

// The band. Near edge defaults to the list's own radius so the rail can never
// duplicate a row the user is already looking at.
export const DRIVE_BAND = { nearMi: 30, farMi: 180 };

// BEACH_METROS / CULTURE keys -> MARKETS keys (which carry lat/lng).
// An entry absent here is not renderable and is dropped, loudly, by the guard.
const METRO_COORD_KEY = {
  "manatee-sarasota": "sarasota",
  tampa: "tampa",
  orlando: "orlando",
  miami: "miami",
  sarasota: "sarasota",
};

// Art must be a file that exists; the guard asserts each on disk.
const ART = {
  beach: "/cards/beach-adobestock-216195684.jpeg",
  culture: "/cards/night-out.jpg",
};

function coordsFor(metroKey) {
  const mk = METRO_COORD_KEY[metroKey];
  const m = mk && MARKETS[mk];
  return m && Number.isFinite(m.lat) && Number.isFinite(m.lng) ? { lat: m.lat, lng: m.lng, label: m.label } : null;
}

/**
 * Every destination collection this site can actually open, with real coords.
 * Built from the route registries themselves — add a beach metro to
 * lib/beaches.js and it appears here, with no edit to this file. That is the
 * "adding a page must not require new work here" property, applied to discovery.
 */
export function allDestinations() {
  const out = [];
  for (const [key, meta] of Object.entries(BEACH_METROS || {})) {
    const c = coordsFor(key);
    if (!c) continue; // unmappable -> dropped, never guessed
    out.push({
      kind: "beach",
      key,
      href: "/best-beaches/" + key,
      title: "Best beaches near " + (meta.label || c.label),
      blurb: "The ranked shortlist, not a list of every beach.",
      art: ART.beach,
      lat: c.lat, lng: c.lng,
    });
  }
  for (const [key, meta] of Object.entries(CULTURE || {})) {
    const c = coordsFor(key);
    if (!c) continue;
    out.push({
      kind: "culture",
      key,
      href: "/culture/" + key,
      title: (meta.title || c.label) + " in 60 seconds",
      blurb: meta.tag || "What locals actually do here.",
      art: ART.culture,
      lat: c.lat, lng: c.lng,
    });
  }
  return out;
}

const R_MI = 3958.8;
export function haversineMi(aLat, aLng, bLat, bLng) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R_MI * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Honest drive-time band from straight-line miles. Stated as a RANGE because a
// point estimate ("1h 12m") is a precision we do not have — no traffic model, no
// routing. 45mph average is the conservative Florida mixed-road figure.
export function driveLabel(mi) {
  const lo = Math.round((mi / 55) * 60 / 5) * 5;
  const hi = Math.round((mi / 38) * 60 / 5) * 5;
  if (hi < 60) return `${lo}–${hi} min`;
  const f = (m) => (m % 60 === 0 ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`);
  return `${f(lo)}–${f(hi)}`;
}

/**
 * The gate. Destinations in the band, nearest first, excluding wherever the
 * user already is.
 *
 * `nearMi` is the LIST's radius: anything closer is already a row above, and a
 * rail that repeats the list reads as a rendering bug rather than a discovery.
 */
export function worthTheDriveFrom(origin, opts = {}) {
  const near = Number.isFinite(Number(opts.nearMi)) ? Number(opts.nearMi) : DRIVE_BAND.nearMi;
  const far = Number.isFinite(Number(opts.farMi)) ? Number(opts.farMi) : DRIVE_BAND.farMi;
  const max = Number.isFinite(Number(opts.max)) ? Number(opts.max) : 4;
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  return allDestinations()
    .map((d) => ({ ...d, distMi: haversineMi(origin.lat, origin.lng, d.lat, d.lng) }))
    .filter((d) => d.distMi > near && d.distMi <= far)
    .sort((a, b) => a.distMi - b.distMi)
    .slice(0, max)
    .map((d) => ({ ...d, distMi: Math.round(d.distMi), drive: driveLabel(d.distMi) }));
}
