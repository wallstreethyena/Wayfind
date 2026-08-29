// check-landing-photos.mjs — landing cards never share a photo pool.
//
// THE INCIDENT (v6.57): every SSR city landing page rendered its hero AND
// every place card from ONE static image per CATEGORY. The "fix" cycled a
// city+category Pexels pool (lib/stockPhoto.js) per card index.
//
// THE FOLLOW-ON (2026-08-29, /nightlife/parrish, owner browser):
//   Pangea → pexels 16408140 Shamrock City Pub Est. 2008 oval sign
//   Jaxx Wing Co. → pexels 12103056 PHO THIN 17 storefront
//   Oscura → pexels 2599246 generic neon BAR sign
//   Page hero → pexels 14698219 Brettos bar in Athens (not Parrish)
// Pexels nightlife stock is not a "real picture" of the card. Owned
// inventory photo or empty. Hero is category chrome, never an unrelated city bar.
import { readFileSync } from "fs";
import {
  isForbiddenLandingStock,
  isLandingCardImageAllowed,
  isLandingHeroImageAllowed,
  landingCardPhotoSrc,
  landingHeroSrc,
} from "../lib/placePhoto.js";

const fail = (m) => { console.error("check-landing-photos: FAIL — " + m); process.exit(1); };
const landing = readFileSync(new URL("../lib/landing.js", import.meta.url), "utf8");
const code = landing.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

if (!/import\s*\{[^}]*\blandingCardPhotoSrc\b[^}]*\}\s*from\s*"\.\/placePhoto\.js"/.test(code)) {
  fail("lib/landing.js no longer imports landingCardPhotoSrc from ./placePhoto.js");
}
if (!/landingHeroSrc\(catSlug\)/.test(code)) {
  fail("landing hero no longer CALLS landingHeroSrc(catSlug)");
}
if (!/landingCardPhotoSrc\(p\)/.test(code) && !/landingPhoto\(p\)/.test(code)) {
  fail("place-card image no longer goes through landingCardPhotoSrc / landingPhoto(p)");
}
if (/\bstockPhotoPool\b/.test(code)) {
  fail("lib/landing.js still calls stockPhotoPool — that is the Shamrock/Pho Thin/Brettos leak");
}
if (/\bfromPool\b/.test(code)) {
  fail("lib/landing.js still reads fromPool — cards would cycle a shared category pool");
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

const LIVE_STOCK = [
  "https://images.pexels.com/photos/16408140/pexels-photo-16408140.jpeg",
  "https://images.pexels.com/photos/12103056/pexels-photo-12103056.jpeg",
  "https://images.pexels.com/photos/14698219/pexels-photo-14698219.jpeg",
  "https://images.pexels.com/photos/2599246/pexels-photo-2599246.jpeg",
];
for (const url of LIVE_STOCK) {
  if (!isForbiddenLandingStock(url)) fail("isForbiddenLandingStock missed live stock " + url);
  if (isLandingCardImageAllowed(url, PANGEA)) fail("card allowed live Pexels stock " + url);
  if (isLandingHeroImageAllowed(url)) fail("hero allowed live Pexels stock " + url);
}

const hero = landingHeroSrc("nightlife");
if (!hero) fail("nightlife landingHeroSrc is empty");
if (!isLandingHeroImageAllowed(hero)) fail("nightlife hero failed isLandingHeroImageAllowed (got " + hero + ")");
if (/pexels/i.test(hero) || hero.includes("14698219")) {
  fail("nightlife hero is still Pexels / Brettos Athens (got " + hero + ")");
}
if (!/tonight-alfonso-scarpa-unsplash/.test(hero)) {
  fail("nightlife hero must be the owner concert-crowd chrome, not a named bar (got " + hero + ")");
}
if (!isLandingCardImageAllowed("", PANGEA)) {
  fail("empty src must be allowed — placeholder is the correct no-photo state");
}

console.log("check-landing-photos: OK — owned photo or empty; hero is category chrome not Brettos; live Pexels ids banned");
