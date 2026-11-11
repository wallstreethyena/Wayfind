// The homepage card that opens the Christmas in Florida hub.
//
// The Christmas poster (lib/rails.js id "christmas") already leads the homepage
// rail from Nov 1 and opens the in place collection. It is a poster, not a link
// to /christmas-in-florida. This card is that missing door. It rides the
// existing "This week in Florida" strip (the same card shape as the weekly
// trend guide), and only while the Christmas poster is on the track
// (lib/posterSeasons.js). No poster, no second card renderer.
//
// The picture is the reviewed photo the hub already shows for its lights
// section: editorial context key selby-holiday-lights (Selby Gardens, Sarasota).
// A missing or uncredited record returns null. The strip then renders without
// this card. It never invents a picture.

import { posterSeasonLive } from "./posterSeasons.js";
import { EDITORIAL_CONTEXT_PHOTOS } from "./editorialContextPhotos.js";

export const CHRISTMAS_HUB_HREF = "/christmas-in-florida";
export const CHRISTMAS_HUB_PHOTO_KEY = "selby-holiday-lights";
export const CHRISTMAS_HUB_ACCENT = "#F97316";

export function christmasHubStripCard(today) {
  if (typeof today !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  if (!posterSeasonLive("christmas", today)) return null;
  const photo = EDITORIAL_CONTEXT_PHOTOS.find((asset) => asset && asset.key === CHRISTMAS_HUB_PHOTO_KEY);
  if (!photo || !photo.src || !photo.credit || !photo.creditHref) return null;
  if (!(Array.isArray(photo.topics) && photo.topics.includes("holiday-lights"))) return null;
  if (photo.locationRestriction !== "Sarasota") return null;
  return {
    slug: "christmas-in-florida",
    href: CHRISTMAS_HUB_HREF,
    name: "Christmas in Florida",
    when: "Lights and parades",
    city: "Statewide",
    image: photo.src,
    position: photo.position || "50% 50%",
    credit: photo.credit,
    creditHref: photo.creditHref,
    accent: CHRISTMAS_HUB_ACCENT,
    hub: true,
  };
}
