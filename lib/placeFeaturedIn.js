// lib/placeFeaturedIn.js — SERVER-ONLY, pure, JSX-free. Builds the "On
// Wayfind" section for a durable /places/{id} page: real, verified internal
// connections to other things Wayfind already holds, so a page that Google
// currently treats as an orphan (nothing links to it but a guide, nothing on
// it links to a peer) gets honest outbound links too.
//
// Every fact here comes from an in-memory registry or a fail-soft in-memory
// read another module already owns. ZERO Google calls, ZERO new Supabase
// reads, ZERO invented facts — see each section below for its exact source.
// This file stays JSX-free, same split as lib/placeData.js, so the logic is
// unit-testable without a React runtime; lib/placePage.js renders its output.
//
// PLAIN-NODE IMPORTABLE ON PURPOSE. lib/landing.js and lib/placeData.js both
// contain things plain `node` cannot execute — landing.js has real JSX (its
// own route bodies) and placeData.js imports `cache` from "react" plus
// Next's extensionless relative-import style (a bare "./site"); either one
// crashes a plain-node import of that file before a single assertion runs
// (confirmed against scripts/census-parity.mjs, which already hits the exact
// same landing.js SyntaxError under plain node). This file's
// own hermetic guard, scripts/check-place-featured-in.mjs, needs to import
// it directly and run real assertions — so this module never imports either
// file. LANDING_CITIES comes from lib/landingCities.js instead (zero
// imports, zero React, built for exactly this reason — see its own header);
// LANDING_CATS has no such split file, so its four labels are mirrored
// below and locked to lib/landing.js's real source text by the guard, the
// same "substring-lock" technique scripts/test-guide-place-indexability.mjs
// already uses for lib/placeData.js's isIndexable(). `cityOf` is likewise
// not imported from lib/placeData.js — its caller (lib/placePage.js, which
// already needs Next's bundler for its own JSX) computes the city once and
// passes it in.
import { creatorVideosFor, hasCreatorPage } from "./creatorVideos.js";
import { CULTURE } from "./cultureCorpus.js";
import { TOWN_HUBS } from "./cultureHubs.js";
import { LANDING_CITIES } from "./landingCities.js";
import { guidePlaceFor } from "./guidePlaceIndex.js";
import { listPrerenderIds } from "./placeIndex.js";
import { haversineMi } from "./localEdit.js";

// EVENTS AT THIS VENUE — deliberately NOT a section here. The task this file
// was written for said: wire it in only if an existing server helper already
// queries wf_events by place_id. lib/curatedEvents.js's wf_events reader
// (fetchCuratedEvents) has no place_id filter at all — it fetches every
// displayable row — and fetchCuratedEventBySlug filters on `slug`, not
// `place_id`. Wiring a new `.eq("place_id", …)` query would be inventing a
// new query shape rather than reusing one, which is exactly what was ruled
// out. So this page carries no events section; add one only alongside a real
// place_id-keyed events helper, not here.

// ── 1. Creator videos featuring this place ──────────────────────────────────
// lib/creatorVideos.js's registry (CURATED) matches a place two ways: an EXACT
// Google place_id (PASS 1), or a name(+city) guess (PASS 2, for hand-curated
// entries with no id yet). This surface must never guess — a wrong name match
// here would credit a creator's video to the wrong venue on an indexable page,
// not just a noindex sheet. Passing an object with an `id` and NO `name`
// exercises PASS 1 alone: creatorVideosFor() bails out before PASS 2 the
// moment `place.name` is empty (see its own `if (!nm) return [];`), so this
// can structurally never fall through to the fuzzy pass.
export function creatorsFeaturing(p) {
  if (!p || !p.id) return [];
  let videos;
  try {
    videos = creatorVideosFor({ id: p.id });
  } catch {
    videos = [];
  }
  if (!Array.isArray(videos) || !videos.length) return [];
  const seen = new Set();
  const out = [];
  for (const v of videos) {
    const handle = v && v.creator;
    if (!handle) continue;
    const key = handle.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    // Only a creator who has cleared their own indexable /creators/{handle}
    // page (lib/creatorPages.js MIN_SPOTS) — linking to a handle with no page
    // would be a dead end, exactly what lib/creatorVideos.js's own
    // hasCreatorPage() exists to keep other surfaces (sheets/SocialFind.js)
    // from doing.
    if (!hasCreatorPage(handle)) continue;
    out.push({ handle });
  }
  return out;
}

// ── 2. Culture hub mentions ─────────────────────────────────────────────────
// lib/cultureCorpus.js CULTURE[metro] carries hand-written `eat`/`do`/`see`
// items; a small number name the exact Google placeId of the spot they
// describe (e.g. Tampa's "Shell Key Preserve"). Scanned generically over
// every array field on a metro's record (not just `see`) so a future item in
// `eat`/`do` that gains a placeId is picked up without an edit here — items
// with no `placeId` field simply never match.
export function cultureMentions(p) {
  if (!p || !p.id) return [];
  const out = [];
  for (const [metro, c] of Object.entries(CULTURE)) {
    if (!c) continue;
    let hit = false;
    for (const key of Object.keys(c)) {
      const arr = c[key];
      if (!Array.isArray(arr)) continue;
      if (arr.some((item) => item && item.placeId === p.id)) {
        hit = true;
        break;
      }
    }
    if (hit) out.push({ metro, title: c.title || metro });
  }
  return out;
}

// ── 4. City hub link ─────────────────────────────────────────────────────────
// Pure navigation to an existing indexable hub — never a ranking claim about
// this specific place (that belongs to the ranked list on the hub itself).
const slugifyCity = (s) =>
  String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const wordsCity = (s) => String(s || "").trim().toLowerCase();

// Mirrors lib/landing.js LANDING_CATS' keys + `label` field only (the one
// field this module reads) — see this file's header for why LANDING_CATS
// itself is not imported. scripts/check-place-featured-in.mjs locks these
// four labels to lib/landing.js's real source text so they cannot drift.
export const LANDING_CAT_LABELS = {
  "things-to-do": "Things to Do",
  "restaurants": "Restaurants",
  "beaches": "Beaches",
  "nightlife": "Nightlife",
};

// Both vocabularies a merged place's `category` can carry: Google's own
// coarse label (lib/placeDetails.js catFromTypes — "Food"/"Nightlife"/
// "Shopping"/"Hotels"/"Activities") and the lowercase Atlas/GUIDES taxonomy
// (data/atlas/editorial-cards.json / lib/guidesFoodCities2026.js's
// "food"/"nightlife"/"shopping"/"hotels"/"attractions"/"beaches" — see
// lib/atlasCards.js parseAtlas590 and lib/guidePlaceIndex.js). Lowercased
// before lookup so either vocabulary resolves through the same table.
// "hotels" and "shopping" have no LANDING_CATS hub (lib/landing.js only
// covers things-to-do/restaurants/beaches/nightlife) and are left unmapped
// on purpose — no invented destination for those two categories.
const CATEGORY_TO_LANDING_CAT = {
  food: "restaurants",
  restaurant: "restaurants",
  restaurants: "restaurants",
  nightlife: "nightlife",
  beach: "beaches",
  beaches: "beaches",
  attractions: "things-to-do",
  activities: "things-to-do",
  "things-to-do": "things-to-do",
};

/**
 * @param {string|null} city   cityOf(p.address) || p.guideCity — computed by
 *                              the caller (lib/placePage.js already needs
 *                              lib/placeData.js's cityOf for its own render).
 * @param {string|null} category  p.category, as mergePlacePage sets it.
 */
export function cityHubLinks(city, category) {
  if (!city) return null;

  const catKey = CATEGORY_TO_LANDING_CAT[String(category || "").toLowerCase()] || null;
  const citySlug = slugifyCity(city);
  const landingCity = LANDING_CITIES[citySlug] || null;
  const catLabel = catKey ? LANDING_CAT_LABELS[catKey] : null;
  const landing = landingCity && catLabel
    ? { href: `/${catKey}/${citySlug}`, label: `More ${catLabel} in ${landingCity.name}` }
    : null;

  const townSlug = TOWN_HUBS[wordsCity(city)] || null;
  const florida = townSlug ? { href: `/florida/${townSlug}`, label: `${city} on Wayfind` } : null;

  if (!landing && !florida) return null;
  return { landing, florida };
}

// ── 5. Nearby on Wayfind ─────────────────────────────────────────────────────
// Built once, at module load, from a PURE in-memory scan — no fetch, no
// Supabase, no Google. listPrerenderIds() (lib/placeIndex.js) is the curated
// Atlas ∪ GUIDES id set, already narrowed to durably eligible ids. Atlas
// cards carry no coordinates at all (lib/atlasPlaceAllowlist.js
// atlasPlaceFields never sets lat/lng — see lib/atlasCards.js parseAtlas590's
// {category,name,address,place_id} row shape), so only the GUIDES half of
// that set — which does carry real lat/lng (lib/guidePlaceIndex.js) — can
// ever appear as a NEARBY candidate. That is a real narrowing of the pool,
// not a bug: an id without coordinates has no honest distance to report.
let NEARBY_POOL = null;
function defaultNearbyPool() {
  if (NEARBY_POOL) return NEARBY_POOL;
  const out = [];
  for (const id of listPrerenderIds()) {
    const guide = guidePlaceFor(id);
    if (guide && guide.name && typeof guide.lat === "number" && typeof guide.lng === "number") {
      out.push({ id, name: guide.name, category: guide.category || null, lat: guide.lat, lng: guide.lng });
    }
  }
  NEARBY_POOL = out;
  return out;
}

export const NEARBY_RADIUS_MI = 10;
export const NEARBY_LIMIT = 6;

// `pool` is a test-only injection point (same pattern as
// lib/curatedEvents.js's `db` override and lib/nearbyPool.js's `fetchImpl`)
// so the guard can exercise the sort/radius/self-exclusion contract against
// a small fixture instead of the full live GUIDES corpus.
export function nearbyOnWayfind(p, { limit = NEARBY_LIMIT, radiusMi = NEARBY_RADIUS_MI, pool } = {}) {
  if (!p || p.lat == null || p.lng == null) return [];
  const candidates = pool || defaultNearbyPool();
  const out = [];
  for (const cand of candidates) {
    if (cand.id === p.id) continue; // never the place itself
    const distMi = haversineMi(p.lat, p.lng, cand.lat, cand.lng);
    if (distMi <= radiusMi) out.push({ ...cand, distMi });
  }
  out.sort((a, b) => a.distMi - b.distMi);
  return out.slice(0, limit);
}

// ── Assembly ─────────────────────────────────────────────────────────────────
// One call for lib/placePage.js. `city` is cityOf(p.address) || p.guideCity,
// computed by the caller — see this file's header for why. Returns null when
// nothing real is held for this place, so no empty "On Wayfind" heading ever
// renders over blank sections.
export function featuredInFor(p, { city } = {}) {
  const creators = creatorsFeaturing(p);
  const culture = cultureMentions(p);
  const cityLinks = cityHubLinks(city || null, p && p.category);
  const nearby = nearbyOnWayfind(p);
  if (!creators.length && !culture.length && !cityLinks && !nearby.length) return null;
  return { creators, culture, city: cityLinks, nearby };
}
