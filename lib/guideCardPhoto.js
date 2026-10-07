// lib/guideCardPhoto.js — the photo ladder for the guide card.
//
// A guide card must never show a blank monogram tile when we own a real picture
// for that guide. Rungs, first hit wins:
//   1. the guide's reviewed DOCUMENTARY hero image (credited)
//   2. the first curated, licensed pick photo for that guide (credited)
//   2b. an ILLUSTRATIVE hero (a stock scene, flagged "Illustrative photo" on the
//      guide page): used only when the guide has no pick photo, so a real photo
//      of a real pick always outranks it, and it is still better than a blank tile
//   3. the matched / first pick's own no-spend place photo (/api/photo, noSpend)
//   4. nothing: RailCard draws the monogram (last resort only)
// Rungs 1-2b are self-hosted files with a visible credit, so they are legal in a
// guide photo-policy context. Rung 3 is a Google-backed route: RailCard already
// runs `photo` through usePhotoSrcFilter, which blanks it inside a
// PhotoPolicyProvider (no room for the required Google credit there).
import { GUIDE_CARD_PHOTOS } from "./guideCardPhotoIndex.js";
import { ownedPlacePhotoSrc } from "./placePhoto.js";

export function guideCardPhoto(guide, matched = null, index = GUIDE_CARD_PHOTOS) {
  const slug = guide && guide.slug ? String(guide.slug) : "";
  const entry = (slug && index[slug]) || null;
  let art = null;
  let rung = "";
  if (entry) {
    const hero = entry.hero || null;
    const pick = entry.pick || null;
    if (hero && hero.kind !== "illustrative") { art = hero; rung = "hero"; }
    else if (pick) { art = pick; rung = "pick"; }
    else if (hero) { art = hero; rung = "illustrative-hero"; }
  }
  if (art) {
    return { src: art.src, credit: art.credit || undefined, creditHref: art.href || undefined, position: art.position || "50% 50%", rung };
  }
  const placeId = (matched && matched.id) || ((guide && guide.placeIds) || [])[0] || "";
  const owned = ownedPlacePhotoSrc(placeId, 640, true);
  if (owned) return { src: owned, credit: undefined, creditHref: undefined, position: "50% 50%", rung: "place" };
  return { src: undefined, credit: undefined, creditHref: undefined, position: "50% 50%", rung: "monogram" };
}
