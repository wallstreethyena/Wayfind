// lib/categoryTiles.js — the photo behind each circle in the K3 category bar.
//
// WHERE THE PHOTO COMES FROM, and why not from wf_inventory directly. The work
// order says "photo_ref of the TOP-RANKED place in that category near the user".
// wf_inventory carries photo_ref but no rating and no review count, so a direct
// table read can only give you the NEAREST place, which is a different claim.
// wf_best_picks already ranks, vets beach distance and dedupes brands, so this
// asks it for one row per category and uses that row's photo. Same ranking the
// list below the bar uses — two surfaces on one screen cannot disagree about
// which place leads a category, which is the drift this codebase keeps fixing.
//
// WHY THERE ARE NO COUNTS HERE. The work order wants a real count under each
// label. It cannot be honest in Phase 1: wf_best_picks returns rows capped by
// p_limit, so its length is a floor, not a total — and the browse view a tap
// opens is served by a live Google search, a different universe from
// wf_inventory. A number that does not match the list it opens is worse than no
// number. Phase 2 keeps the ranked list mounted, and THEN the count comes off
// the rendered list for free, which is what the work order actually describes
// ("the headline count follows: 40 places -> 12 places").
//
// So: photo yes, count deliberately absent, and CategoryBar drops the count
// clause rather than rendering a guess.
// The two DECISIONS the bar makes — which circles may render, and whether a
// count is printable — live here rather than in the component, because a guard
// running under plain node cannot import a JSX file. Anything that can be
// asserted on a returned value belongs on this side of the line.
import { fetchTodaysBest, tbPhotoUrl } from "./todaysBest.js";
import { CATEGORY_TILES } from "./categories.js";

/** Slot geometry. The SLOT is the larger size so a selection never relayouts. */
export const CIRCLE_BASE = 48;
export const CIRCLE_SELECTED = 62;
export const CIRCLE_SCALE = CIRCLE_SELECTED / CIRCLE_BASE; // 1.2917

/**
 * Which categories may render.
 *
 * A KNOWN zero is dropped — "do not advertise an empty room". An UNKNOWN count
 * is kept: "we have not counted this yet" and "there is nothing here" are
 * different facts, and dropping on the first would empty the bar every time the
 * data is still in flight.
 */
export function visibleCats(cats) {
  return (Array.isArray(cats) ? cats : []).filter(
    (c) => c && c.id && !(typeof c.count === "number" && c.count <= 0)
  );
}

/**
 * The count under a label, or null to render nothing at all.
 *
 * `truncated` means the row list came back capped by a query limit, so its
 * length is a floor and not a total. Rendering it would be a guess wearing a
 * number's clothes, which is the one thing the work order forbids.
 */
export function countLabel(count, truncated) {
  if (truncated) return null;
  if (typeof count !== "number" || !isFinite(count) || count <= 0) return null;
  return String(count);
}

/**
 * CATEGORY_TILES ids -> wf_best_picks categories.
 *
 * `family` maps to NOTHING on purpose. wf_inventory has no family rows (checked
 * live: food 1316, attractions 1127, nightlife 441, shopping 394, hotels 269,
 * beach 46 — no family). The home browse serves Family from a live Google
 * search instead, so there is no ranked inventory row to take a photo from.
 * Rather than borrow an Activities photo and imply it is a family place, the
 * tile falls back to its glyph. An honest blank beats a plausible wrong photo.
 */
export const TILE_SOURCE = {
  food: "food",
  nightlife: "nightlife",
  attractions: "attractions",
  family: null,
  hotels: "hotels",
  shopping: "shopping",
};

/** The tile's display label, or null for an id that is not a tile. */
export function tileLabel(id) {
  const t = CATEGORY_TILES.find((x) => x.id === id);
  return t ? t.label : null;
}

/** Fallback glyph when a category has no ranked photo to show. */
export const TILE_GLYPH = {
  food: "🍽️", nightlife: "🍸", attractions: "🎡",
  family: "👨‍👩‍👧", hotels: "🏨", shopping: "🛍️", beach: "🏖️",
};

/**
 * Shape the bar's props from a map of category -> top row.
 *
 * PURE, so scripts/check-category-bar.mjs can assert on returned values rather
 * than on a render. `count` is intentionally never set — see the header.
 */
export function tilesFrom(topByCat) {
  const m = topByCat || {};
  return CATEGORY_TILES.map((t) => {
    const row = m[t.id];
    const ref = row && row.photo_ref;
    return {
      id: t.id,
      label: t.label,
      photoUrl: ref ? tbPhotoUrl(ref, 160) : null,
      glyph: TILE_GLYPH[t.id] || null,
    };
  });
}

/**
 * One ranked row per category, fetched in parallel. Any category that fails or
 * comes back empty simply has no photo — never a thrown error, never a retry
 * storm, and never a blocked render: the bar is decoration over a control that
 * works without it.
 */
export async function fetchCategoryTiles({ lat, lng, localHour, tempF, condition }) {
  const ids = CATEGORY_TILES.map((t) => t.id).filter((id) => TILE_SOURCE[id]);
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        const rows = await fetchTodaysBest({
          lat, lng, localHour, tempF, condition,
          category: TILE_SOURCE[id],
          limit: 1,
        });
        return [id, Array.isArray(rows) && rows.length ? rows[0] : null];
      } catch (e) {
        return [id, null];
      }
    })
  );
  const top = {};
  for (const [id, row] of results) if (row) top[id] = row;
  return tilesFrom(top);
}
