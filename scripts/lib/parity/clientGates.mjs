// scripts/lib/parity/clientGates.mjs — THE REAL CLIENT-SIDE RENDER GATES,
// called rather than restated (2026-09-23, WS2 surface-parity follow-up).
//
// A place the API served that the browser did not render can be a real bug,
// OR the CLIENT itself can legitimately drop it before paint. app/home.js's
// browse/category feed runs eligible candidates through, in order:
//
//   1. mealGate/placeAllowed          (identical to chipIdentity for the
//                                      sentinel key this audit drives —
//                                      already covered by ground truth, see
//                                      below; not modeled here)
//   2. _distFiltered                  the DISPLAY RADIUS CUT: sliderMi>=60 ||
//                                      distMi==null || distMi<=sliderMi
//                                      (default sliderMi = DEFAULT_RADIUS_MI
//                                      = 17, lib/google.js)
//   3. dedupePlaces(view, true)       brand-collapse dedupe (collapseBrand
//                                      true in the browse-chip case)
//   4. .filter(cardComplete)          id + non-empty name + hasScoreSignal
//
// This module reuses the REAL functions for (2)-(4) — lib/placeDedupe.js's
// dedupePlaces/normName (itself extracted VERBATIM from app/home.js) and
// lib/score.js's cardComplete — rather than re-encoding the rule a second
// time, which is exactly how a diagnostic and the product it audits drift
// apart. mealGate is NOT modeled: for food:cafes, chipIdentity("food","cafes")
// resolves to isCafePlace(p) = placeAllowed("food","cafes",p), the SAME call
// mealGate makes — ground truth (scripts/lib/parity/eligibility.mjs) already
// runs chipIdentity, so any row reaching this module already cleared the
// identical gate mealGate would apply. If this module is ever pointed at a
// key where that identity does NOT hold, mealGate would need its own reason
// here — left as a documented gap, not silently assumed away.
import { normName, dedupePlaces } from "../../../lib/placeDedupe.js";
import { cardComplete } from "../../../lib/score.js";
import { wayfindScore } from "../../../lib/wayfindScore.js";
import { milesBetween } from "./eligibility.mjs";

export const SLIDER_MI_DEFAULT = 17; // DEFAULT_RADIUS_MI, lib/google.js — the app's default "Within X mi" opening value

/** Ground-truth place (Google-Places-(New) shape, invRowToPlace()'s output or
 * a live Google normalize()'d result) -> the APP-shaped candidate
 * app/home.js's mapInventoryRow(x, center) produces, computed from a given
 * origin. Same fields dedupePlaces/betterPlace/cardComplete read: id, name,
 * distMi, rating, reviews, wfScore, photo, openNow. `distMi` uses
 * eligibility.mjs's milesBetween (itself lib/ownedPool.js's own formula) —
 * numerically equivalent to lib/google.js's distMeters/1609.34 to well under
 * a hundredth of a mile, immaterial at the mile-scale slider threshold this
 * gate applies. */
export function toAppShape(p, originLat, originLng) {
  const lat = p && p.location ? p.location.latitude : null;
  const lng = p && p.location ? p.location.longitude : null;
  const rating = typeof (p && p.rating) === "number" ? p.rating : null;
  const reviews = (p && p.userRatingCount) || 0;
  const photoRef = p && Array.isArray(p.photos) && p.photos[0] && p.photos[0].name;
  const name = (p && p.displayName && p.displayName.text) || (p && p.name) || "";
  return {
    id: p && p.id,
    name,
    distMi: (lat != null && lng != null) ? milesBetween(originLat, originLng, lat, lng) : null,
    rating,
    reviews,
    wfScore: wayfindScore(rating || 0, reviews || 0),
    photo: photoRef ? "photo" : null, // presence-only; betterPlace only checks truthiness
    openNow: null, // mapInventoryRow always sets this null for inventory-sourced rows
  };
}

/** The REAL _distFiltered predicate (app/home.js), applied to app-shaped candidates. */
export function passesDisplayRadius(candidate, sliderMi) {
  return sliderMi >= 60 || candidate.distMi == null || candidate.distMi <= sliderMi;
}

/**
 * For every eligible ground-truth place, decide whether its ABSENCE from a
 * rendered surface is explained by the display-radius cut or the brand
 * dedupe — by actually RUNNING those real gates over the full eligible pool
 * from the given origin, never by asserting a reason and hoping it holds.
 *
 * Returns Map<place_id, { reason: string|null, distMi: number|null,
 * winnerId: string|null, cardIncomplete: boolean }>. `reason` is one of
 * `outside_display_radius:<mi>`, `brand_collapse:<winner_id>`, or null
 * (nothing here legitimately explains an absence — a genuine candidate for
 * api_included_ui_omitted). `cardIncomplete: true` flags a candidate that
 * failed cardComplete despite being eligible under ground truth — this
 * should never happen (ground truth already requires rating>0 via
 * isServableRow, a strictly stronger gate than cardComplete's rating>0 OR
 * reviews>0), so a caller sees it as a genuine finding, not a silently
 * assumed-safe reason.
 */
export function classifyClientOmissions(groundPlaces, { originLat, originLng, sliderMi = SLIDER_MI_DEFAULT }) {
  const appShaped = (groundPlaces || []).map((p) => ({ ...toAppShape(p, originLat, originLng), _srcId: p.id }));
  const byId = new Map(appShaped.map((c) => [c.id, c]));

  const distFiltered = appShaped.filter((c) => passesDisplayRadius(c, sliderMi));
  const distFilteredIds = new Set(distFiltered.map((c) => c.id));

  // THE REAL RULE — imported, not restated.
  const afterDedupe = dedupePlaces(distFiltered, true);
  const winnerIds = new Set(afterDedupe.map((w) => w.id));
  const winnerIdByNorm = new Map();
  for (const w of afterDedupe) {
    const k = normName(w.name);
    if (k && !winnerIdByNorm.has(k)) winnerIdByNorm.set(k, w.id);
  }

  const out = new Map();
  for (const c of appShaped) {
    if (!distFilteredIds.has(c.id)) {
      out.set(c.id, { reason: `outside_display_radius:${c.distMi != null ? c.distMi.toFixed(2) : "?"}`, distMi: c.distMi, winnerId: null, cardIncomplete: false });
      continue;
    }
    if (!winnerIds.has(c.id)) {
      const k = normName(c.name);
      const winnerId = k ? winnerIdByNorm.get(k) : null;
      if (winnerId && winnerId !== c.id) {
        out.set(c.id, { reason: `brand_collapse:${winnerId}`, distMi: c.distMi, winnerId, cardIncomplete: false });
        continue;
      }
      // Passed the distance cut, absent from dedupe's winners, but its
      // normName does not map to a DIFFERENT winner -- dedupePlaces can only
      // ever drop a candidate by collapsing it into a same-normName winner,
      // so this branch should be unreachable; leave unexplained rather than
      // guessing.
      out.set(c.id, { reason: null, distMi: c.distMi, winnerId: null, cardIncomplete: false });
      continue;
    }
    const complete = cardComplete(c);
    out.set(c.id, { reason: null, distMi: c.distMi, winnerId: null, cardIncomplete: !complete });
  }
  return out;
}
