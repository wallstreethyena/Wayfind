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
 * is omitted by the editorial article: those picks now render only a figure.
 * Any other caller that also renders a card must pass its actual render
 * condition so it never repeats the identical photograph.
 */
export function guidePickPhoto(slug, pickName, opts = {}) {
  return selectGuidePickPhoto(GUIDE_PICK_PHOTOS, slug, pickName, opts);
}

// Card credit for the free Commons lane (wf_place_photo, lib/freePhoto.js).
// IconicPlaceCard shows, in order: a Google photo ref, an explicit `photo`,
// else /api/photo?place=, which serves cached/inventory Google photos BEFORE
// it ever falls through to the free lane. So a free-lane credit is only true
// when the card has no ref and no explicit photo, and even then only if the
// card is pointed at that exact free photo. This sets both together, so the
// photo and its credit can never disagree; a card with a Google photo is left
// exactly as it was (Google photos carry no stored author credit yet, the
// known gap in docs/GOOGLE_POLICY.md).
export async function attachFreePhotoCredit(places, deps = {}) {
  // Injected (page.js passes lib/freePhoto.js's findFreePhoto; the guard
  // passes a stub), so this module stays free of a Supabase import.
  const lookupFreePhoto = deps && deps.findFreePhoto;
  if (typeof lookupFreePhoto !== "function") return;
  const seen = new Set();
  await Promise.all(
    (Array.isArray(places) ? places : []).filter(Boolean).map(async (p) => {
      if (!p.id || seen.has(p)) return;
      seen.add(p);
      if (p.photoRef || p.photo_ref || (typeof p.photo === "string" && p.photo)) return;
      try {
        const free = await lookupFreePhoto({ placeId: p.id });
        if (free && free.url && free.attributionText && free.attributionUrl) {
          p.photo = free.url;
          p.photoAttr = free.attributionText;
          p.photoAttrHref = free.attributionUrl;
        }
      } catch {}
    })
  );
}
