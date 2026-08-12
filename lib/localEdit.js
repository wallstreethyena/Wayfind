// lib/localEdit.js — the pure half of "Read the local edit".
//
// WHY THIS FILE EXISTS (v7.29 PERF). app/components/LocalEdit.js used to
// `import { GUIDES } from "../../lib/guides"`. LocalEdit is rendered by
// app/home.js, which is a client component, so that one import dragged the
// ENTIRE guide corpus — every intro, every pick blurb, every tip, every FAQ
// answer — into the homepage's JavaScript bundle. Measured from the real build
// on 2026-08-12: lib/guides.js 28.6KB + lib/guidesSummer2026.js 24.2KB = 52.8KB
// of parsed JS in static/chunks/app/page-*.js, on a route that renders at most
// three guide TITLES.
//
// The component never needed the corpus. It needs six fields per guide, and the
// only reason it held the whole thing was `readMinutes`, which counts words in
// the body. So the body-reading stays here, runs ONCE on the server (app/page.js
// is a server component with `revalidate = 3600`), and the client receives a
// ~9KB index of exactly what it renders.
//
// Everything in this module is PURE and framework-free on purpose: the server
// index builder and the client geo-filter share one implementation, so the read
// time on screen and the read time in the article can never disagree.

// Region centroids for the regions lib/guides.js actually covers. Public city
// centres, used ONLY to decide whether a guide is near enough to call local —
// never shown, never presented as a venue's position.
export const REGION_COORDS = {
  Orlando: { lat: 28.5384, lng: -81.3789 },
  Tampa: { lat: 27.9506, lng: -82.4572 },
  Sarasota: { lat: 27.3364, lng: -82.5307 },
  Bradenton: { lat: 27.4989, lng: -82.5748 },
};

// How far "local" reaches. 60 miles is a day trip in Florida and roughly the
// gap between these regions, so a reader in Parrish gets Bradenton and Sarasota
// and does NOT get Orlando — which is exactly the call a person would make.
export const LOCAL_EDIT_RADIUS_MI = 60;
export const LOCAL_EDIT_MAX = 3;
export const WORDS_PER_MIN = 200;

export function haversineMi(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.7554;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Minutes to read, from the guide's REAL body: intro + every pick + every answer. */
export function readMinutes(g) {
  if (!g) return null;
  const parts = [g.intro || ""];
  for (const p of g.picks || []) parts.push(p.blurb || "", p.tip || "");
  for (const f of g.faq || []) parts.push(f.q || "", f.a || "");
  const words = parts.join(" ").trim().split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  return Math.max(1, Math.round(words / WORDS_PER_MIN));
}

/**
 * SERVER SIDE. The whole guide map in, the rows the client renders out.
 *
 * Guides whose region has no centroid are dropped here rather than shipped and
 * skipped in the browser — `localGuides` could never place them anyway, so
 * sending them would be dead bytes. Read time is resolved here, which is the
 * entire reason the corpus no longer has to reach the client.
 */
export function localEditIndex(guides) {
  const rows = [];
  for (const [slug, g] of Object.entries(guides || {})) {
    if (!g || !REGION_COORDS[g.region]) continue;
    rows.push({
      slug,
      region: g.region,
      title: g.title,
      teaser: g.teaser,
      updated: g.updated || "",
      mins: readMinutes(g),
    });
  }
  return rows;
}

/**
 * CLIENT SIDE. The guides worth showing at `center`, nearest region first,
 * newest first within a region. Empty when nothing is near — the caller renders
 * nothing rather than a "local" heading over guides from three hours away.
 */
export function localGuides(rows, center, max = LOCAL_EDIT_MAX) {
  if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return [];
  const near = [];
  for (const r of rows || []) {
    const rc = REGION_COORDS[r && r.region];
    if (!rc) continue;
    const distMi = haversineMi(center.lat, center.lng, rc.lat, rc.lng);
    if (distMi > LOCAL_EDIT_RADIUS_MI) continue;
    near.push({ ...r, distMi });
  }
  near.sort((a, b) => a.distMi - b.distMi || String(b.updated).localeCompare(String(a.updated)));
  return near.slice(0, max);
}
