// check-landing-photos.mjs — landing cards never share a photo pool.
//
// THE INCIDENT (v6.57): every SSR city landing page rendered its hero AND
// every place card from ONE static image per CATEGORY. The "fix" cycled a
// city+category Pexels pool (lib/stockPhoto.js) per card index.
//
// THE FOLLOW-ON (2026-08-29, /nightlife/parrish): that pool painted a real
// Shamrock City Pub Est. 2008 sign on the Pangea Alchemy Lab card. A shared
// pool keyed by category, not place id, is the leak. Empty/placeholder is
// correct when we do not hold THAT place's photo.
//
// This guard CALLS the matcher (landingCardPhotoSrc / isLandingCardImageAllowed)
// and asserts landing.js no longer imports the pool for cards. Hero chrome may
// still use LANDING_HERO. stockPhoto.js may still exist for /api/market-photo.
import { readFileSync } from "fs";
import {
  isLandingCardImageAllowed,
  landingCardPhotoSrc,
} from "../lib/placePhoto.js";

const fail = (m) => { console.error("check-landing-photos: FAIL — " + m); process.exit(1); };
const landing = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
const code = landing.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

if (!/import\s*\{[^}]*\blandingCardPhotoSrc\b[^}]*\}\s*from\s*"\.\/placePhoto\.js"/.test(code)) {
  fail("lib/landing.js no longer imports landingCardPhotoSrc from ./placePhoto.js");
}
if (!/landingCardPhotoSrc\(p\)/.test(code) && !/landingPhoto\(p\)/.test(code)) {
  fail("place-card image no longer goes through landingCardPhotoSrc / landingPhoto(p)");
}
if (/\bstockPhotoPool\b/.test(code)) {
  fail("lib/landing.js still calls stockPhotoPool — that is the Shamrock-on-Pangea leak");
}
if (/\bfromPool\b/.test(code)) {
  fail("lib/landing.js still reads fromPool — cards would cycle a shared category pool");
}
if (!/LANDING_HERO\[catSlug\]/.test(code)) {
  fail("landing hero no longer uses the static LANDING_HERO map (chrome only, never a place card)");
}

const PANGEA = "ChIJPangeaAlchemyLab";
const SHAMROCK_REF = "places/ChIJShamrockCityPub/photos/OvalSign2008";
const PANGEA_REF = "places/" + PANGEA + "/photos/OwnLab1";
const leak = landingCardPhotoSrc({ id: PANGEA, name: "Pangea Alchemy Lab", photoRef: SHAMROCK_REF });
if (leak) fail("landingCardPhotoSrc(Pangea, Shamrock ref) returned a src — the matcher is decoration");
const own = landingCardPhotoSrc({ id: PANGEA, name: "Pangea Alchemy Lab", photoRef: PANGEA_REF });
if (!own || !own.includes(encodeURIComponent(PANGEA_REF))) {
  fail("landingCardPhotoSrc does not emit Pangea's own /api/photo ref (got " + own + ")");
}
if (!isLandingCardImageAllowed(own, PANGEA)) {
  fail("Pangea's own src failed isLandingCardImageAllowed — the guard cannot see a legal image");
}
if (isLandingCardImageAllowed("https://images.pexels.com/photos/1/x.jpg", PANGEA)) {
  fail("isLandingCardImageAllowed accepted a Pexels URL — shared-pool leak is legal again");
}
if (isLandingCardImageAllowed("/api/photo?ref=" + encodeURIComponent(SHAMROCK_REF), PANGEA)) {
  fail("isLandingCardImageAllowed accepted Shamrock's ref on Pangea's card");
}
if (!isLandingCardImageAllowed("", PANGEA)) {
  fail("empty src must be allowed — placeholder is the correct no-photo state");
}

console.log("check-landing-photos: OK — landing cards use per-place owned photos or empty; src place id must match card; no city+category pool");
