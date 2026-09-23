// lib/guidePickPhotos.js — SERVER-ONLY loader over the generated
// lib/guidePickPhotoManifest.js (data/guide-pick-photos/<slug>.json is the
// source of truth; scripts/build-guide-pick-photos.mjs derives the manifest,
// scripts/check-guide-pick-photos.mjs is the guard that keeps them in sync
// and every entry legal).
//
// SERVER-ONLY BY TOPOLOGY, not by a runtime guard: this module (and the
// manifest it imports) is reachable only from app/guides/[slug]/page.js,
// which carries no "use client" — see that file's own header — so nothing
// here can reach a browser bundle. scripts/check-guide-pick-photos.mjs
// verifies this by grepping every importer for "use client" AND by checking
// the actual `next build` client chunks contain neither the manifest's
// export name nor a Commons URL from it (see this repo's verification step
// for that build).
//
import { GUIDE_PICK_PHOTOS } from "./guidePickPhotoManifest.js";

// selectGuidePickPhoto is a PURE selector (no import of the real manifest) —
// same DI shape as lib/freePhoto.js's selectFreePhotoRow — so a guard can
// exercise every branch (found / not-found / the sameAsCardPhoto dedupe)
// with a hand-built manifest object and zero I/O.
export function selectGuidePickPhoto(manifest, slug, pickName, { cardWillRender = false } = {}) {
  const guide = manifest && typeof manifest === "object" ? manifest[slug] : null;
  const entry = guide && guide.picks ? guide.picks[pickName] : null;
  if (!entry) return null;
  // A pick's card and its GuideFigure must never show the IDENTICAL photo
  // twice in one pick. The card is the more specific, closer-to-the-place
  // render, so when both would render for the same photo, the card wins and
  // the figure degrades to null (the pick's own text still renders — see
  // GVS-5, "no photo" is always a clean typographic block, never a hole).
  if (entry.sameAsCardPhoto === true && cardWillRender === true) return null;
  return entry;
}

/**
 * guidePickPhoto(slug, pickName, { cardWillRender }) -> ENTRY | null
 *
 * A FALLBACK, never an override: the caller (app/guides/[slug]/GuideEditorial
 * .js's guidePickImage, wired from app/guides/[slug]/page.js) only reaches
 * this when the pick's own inline `pick.image` is absent. `cardWillRender`
 * must reflect whether THIS pick's GuidePlaceCard is actually about to
 * render on the page for this exact request (page.js already computes this
 * as `Boolean(pickPlaces[i])` before the dedupe-aware render) — passing a
 * constant here would silently defeat the dedupe rule above.
 */
export function guidePickPhoto(slug, pickName, opts = {}) {
  return selectGuidePickPhoto(GUIDE_PICK_PHOTOS, slug, pickName, opts);
}
