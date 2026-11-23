// A guide pick with no registered photo must not ship.
//
// Owner, 2026-11-23: no guide ships without a real photo for every pick, and
// a pick must not render "Photo unavailable". Picture Scrapper adds the
// photos. Until then the pick stays in the record and off the page, and a
// guide whose every pick is waiting is left out of current listings. Nothing
// is deleted. The URL stays.
//
// A registered photo is the pick's own manifest photo, an inline pick.image,
// or a reviewed photo of the same place reused from another guide. A guide
// that did not opt into the neutral tile still has its labelled context
// photo, so those picks are not "Photo unavailable".

import { guideHero } from "./guideHero.js";
import { guideUsesNeutralFallback } from "./guideNeutralFallback.js";
import { guidePhotoForPlace, guidePickPhoto, placePhotoReuseAllowed } from "./guidePickPhotos.js";

export function registeredGuidePickPhoto(slug, pick) {
  const own = guidePickPhoto(slug, pick?.name);
  if (own?.src) return own;
  const inline = pick?.image;
  if (inline && typeof inline === "object" && inline.src) return inline;
  if (typeof inline === "string" && inline) return { src: inline };
  if (placePhotoReuseAllowed(pick)) {
    const reused = guidePhotoForPlace(pick?.placeId);
    if (reused?.src) return reused;
  }
  return null;
}

/** True when the pick would render the neutral "Photo unavailable" tile. */
export function guidePickAwaitingPhoto(slug, pick, guide) {
  if (!pick || !guideUsesNeutralFallback(guide)) return false;
  return !registeredGuidePickPhoto(slug, pick);
}

/** True when every pick is waiting on a photo. A pick-less guide is not waiting. */
export function guideAwaitingPhotos(slug, guide) {
  const picks = Array.isArray(guide?.picks) ? guide.picks : [];
  if (!picks.length) return false;
  return picks.every((pick) => guidePickAwaitingPhoto(slug, pick, guide));
}

export function guideHeroReady(slug) {
  const hero = guideHero(slug);
  return Boolean(hero?.src && hero.kind !== "unavailable");
}
