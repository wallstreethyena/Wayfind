// lib/guidePlaceIndex.js — SERVER-ONLY, pure, JSX-free. Third allowlist/content
// source for /places/{id}, alongside wf_place_ids (lib/placeIndex.js) and the
// Atlas editorial cards (lib/atlasPlaceAllowlist.js).
//
// Every GUIDES pick (lib/guides.js) that names a real Google placeId already
// carries hand-written editorial content — name, city, category, lat/lng, and
// a researched blurb — because that content already renders on the guide page
// and drives its map pins. None of that requires a Google or paid API call; it
// is data Wayfind already holds. This module just re-indexes it by placeId so
// loadPlace() (lib/placeData.js) can let a curated guide pick's own blurb
// satisfy the /places/[id] indexability bar when Google/Atlas have nothing.
//
// Fixes the 2026-09-23 defect: 47 of the 50 restaurant picks linked from the
// Sarasota/Tampa/St Pete/Orlando/Miami guides had a wf_place_ids skeleton row
// (name + lat/lng only, no address/description) and rendered noindex — thin
// per lib/placeData.isIndexable, even though the guide article right next to
// the link already has real, sourced copy about that exact place.
//
// INVARIANT: this module only ever returns a record for a placeId some GUIDES
// pick actually names. It must never be used to backfill "detail" for an
// arbitrary skeleton place — that would turn every thin autocomplete row into
// an indexable page, which is the doorway-page failure isIndexable() exists to
// prevent. scripts/test-guide-place-indexability.mjs red-proves both halves:
// a guide pick with no pd1 row goes indexable, and a NON-guide skeleton place
// stays noindex.
import { GUIDES } from "./guides.js";

// Below this length a blurb reads as a stub ("Great spot!") rather than real
// editorial content — the same bar a Google editorialSummary or Atlas knownFor
// line would need to clear before mergePlacePage() treats it as "detail".
// Every current GUIDES blurb clears this by a wide margin (they run 150-400+
// chars); this constant exists so a future one-line placeholder pick can't
// silently start indexing a page with nothing real to show a visitor.
export const GUIDE_DETAIL_MIN_BLURB_LEN = 80;

const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Build a placeId -> guide-pick record map from a GUIDES-shaped object.
 * Pure function of its input — no I/O, no module-level state — so a test can
 * pass a tiny fixture instead of depending on live guide content, and the real
 * singleton below is just this called once against the real GUIDES.
 *
 * The FIRST guide to name a given placeId wins (Object.entries preserves
 * GUIDES's own key order); a handful of ids are picked by more than one guide
 * (e.g. a Sarasota restaurant referenced from both a city guide and a Gulf
 * Coast roundup) and the /places page only needs one attribution, not a merge.
 */
export function buildGuidePlaceIndex(guides) {
  const byId = new Map();
  for (const [slug, guide] of Object.entries(guides || {})) {
    if (!guide || !Array.isArray(guide.picks)) continue;
    const guideTitle = str(guide.title);
    const guideRegion = str(guide.region);
    for (const pick of guide.picks) {
      const placeId = str(pick && pick.placeId);
      if (!placeId || byId.has(placeId)) continue;
      byId.set(placeId, {
        placeId,
        name: str(pick.name),
        description: str(pick.blurb),
        city: str(pick.city) || guideRegion,
        category: str(pick.category),
        lat: num(pick.lat),
        lng: num(pick.lng),
        guideSlug: slug,
        guideTitle,
      });
    }
  }
  return byId;
}

// Built once at import — GUIDES is a plain in-memory object literal (no fetch,
// no fs read), so this costs nothing per-request and is safe to share.
const GUIDE_PLACE_INDEX = buildGuidePlaceIndex(GUIDES);

/** The guide-pick record for a placeId, or null when no GUIDES pick names it. */
export function guidePlaceFor(id, index = GUIDE_PLACE_INDEX) {
  if (!id) return null;
  return index.get(String(id).trim()) || null;
}

/**
 * True only when the guide pick's own blurb is long enough to read as real
 * editorial content. This is the exact bar mergePlacePage() uses to let a
 * guide pick alone satisfy loadPlace()'s "hasDetails" — never a bare name.
 */
export function guidePlaceHasSubstantiveDetail(rec) {
  return !!(rec && typeof rec.description === "string" && rec.description.length >= GUIDE_DETAIL_MIN_BLURB_LEN);
}

/** Every placeId any GUIDES pick names, deduped — for the sitemap/static-params union. */
export function listGuidePlaceIds(index = GUIDE_PLACE_INDEX) {
  return Array.from(index.keys());
}
