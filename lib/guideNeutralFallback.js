// The honest last rung for a guide pick that has no approved photo of its own.
//
// Owner, 2026-11-04: "A disclaimer does not make an unrelated photograph a good
// venue image. Where an approved exact venue photo cannot be found, use
// Wayfind's established neutral fallback."
//
// Wayfind's established neutral fallback is the designed "no photo" tile
// (app/components/PhotoFallbackTile.js): a flat gradient with the map pin
// glyph and the words "Photo unavailable". It is not a photograph of any
// place. A guide opts in with `neutralPickFallback: true` on its record, so
// every other guide keeps the labelled context photo it has today.
//
// Pure: no I/O, no React. The page and the guard call the same function.
import { guideContextPhoto } from "./guideContextPhotos.js";

export function guideUsesNeutralFallback(guide) {
  return guide?.neutralPickFallback === true;
}

/** The neutral record for one pick. It never carries a src, credit or caption. */
export function guideNeutralFallback(pick = {}) {
  const name = String(pick.name || pick.title || "this place").trim();
  return {
    kind: "unavailable",
    neutral: true,
    src: null,
    name,
    reason: "No approved photograph of this exact place",
    label: "Photo unavailable",
  };
}

/**
 * The final rung, after the pick's own approved media is exhausted.
 * Returns { kind: "neutral", media } for a guide that opted in, otherwise
 * { kind: "context", media } with the labelled context photo, as before.
 */
export function guideFinalRung(slug, pick, guide, opts = {}) {
  if (guideUsesNeutralFallback(guide)) return { kind: "neutral", media: guideNeutralFallback(pick) };
  return { kind: "context", media: guideContextPhoto(slug, pick, guide, opts) };
}
