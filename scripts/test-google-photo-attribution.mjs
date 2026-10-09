#!/usr/bin/env node
// scripts/test-google-photo-attribution.mjs — a guide never shows a Google
// Places photo without Google's required visible credit (owner, 2026-09-30).
//
// Google's Places terms: a Places photo is shown with its author attribution
// (name + profile link) and a way to open the photo on Google Maps. The guide
// surfaces that CAN print that credit (GuideFigure) print it; every card that
// cannot (RailCard, IconicPlaceCard, EventVenueMap, ExploreBridge,
// IntentPartnerPick) drops Google photos under app/guides/layout.js's
// PhotoPolicyProvider and shows a licensed photo with its credit, or none.
//
// Everything below is EXECUTED: the real cards are rendered to HTML inside and
// outside the real provider, the real GuideFigure is rendered, and the real
// spot resolver and /api/licensed-photos handler are called. Each "no Google
// photo" assertion carries a positive control rendered the same way.
//
// RED-PROOF (2026-09-30): each of these, applied alone, turns this red:
//   * RailCard: `const shownPhoto = photo;` (no filter), or its same-place
//     /api/photo fallback left unfiltered
//   * IconicPlaceCard: drop photoSrcFilter() around photoUrl(place)
//   * GuideFigure: remove the googleCreditMissing() early return
//   * layout: render {children} outside <PhotoPolicyProvider>
//   * guideSpotPhotos: return the spot unchanged when it has a Google image
//   * guidePlaceFigureImage: accept a Google-hosted place.photo as editorial
//   * /api/licensed-photos: drop the isGooglePhotoSrc(free.url) refusal
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import { isGooglePhotoSrc, withoutGooglePhoto } from "../lib/googlePhotoSrc.js";
import { withAttributableSpotPhotos } from "../lib/guideSpotPhotos.js";
import { guidePlaceFigureImage } from "../lib/guidePlaceFigureImage.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };
const h = React.createElement;
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");
const GOOGLE_IMG_RX = /<img[^>]+src="[^"]*(?:\/api\/photo|googleusercontent\.com|googleapis\.com)/;
const CARD_REQUEST_RX = /data-card-photo-request="\/api\/photo\?place=[^"]*&amp;s=card&amp;fmt=json/;
const ANY_IMG_RX = /<img[^>]+src="/;

// 1. What counts as a Google photo (fail closed: every /api/photo src).
for (const s of [
  "/api/photo?place=ChIJ3SpvbYPhwogRS17En4FSzVI&g=2&w=800",
  "/api/photo?ref=places%2Fx%2Fphotos%2Fy&w=600",
  "https://www.gowayfind.com/api/photo?ref=x",
  "https://lh3.googleusercontent.com/place-photos/AG9N=s4800-w640",
  "https://places.googleapis.com/v1/places/x/photos/y/media",
  "https://lh5.ggpht.com/p/x",
]) ok(isGooglePhotoSrc(s), "Google photo: " + s);
for (const s of ["", null, "/guides/verified/myakka.webp", "/cards/family-fun.jpg", "https://upload.wikimedia.org/wikipedia/commons/a.jpg",
  "https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/place-photos/a.jpg", "https://aws-tiqets-cdn.imgix.net/images/a.jpg",
  "https://googleusercontent.com.evil.example/x.jpg", "/api/photos-gallery/x"]) ok(!isGooglePhotoSrc(s), "not Google: " + s);
ok(withoutGooglePhoto("/api/photo?ref=x") === "" && withoutGooglePhoto("/cards/a.jpg") === "/cards/a.jpg", "withoutGooglePhoto strips only Google");

// 2. The shared cards, rendered for real inside and outside the policy.
const fx = await loadComponent(path.join(ROOT, "scripts/fixtures/photo-policy/cards.js"), ROOT);
const PLACE = { id: "ChIJ3SpvbYPhwogRS17En4FSzVI", name: "Il Ritorno", rating: 4.8, reviews: 900, types: ["restaurant"], primaryType: "restaurant", lat: 27.77, lng: -82.64 };
const GOOGLE = "/api/photo?place=ChIJ3SpvbYPhwogRS17En4FSzVI&g=2&w=800";
const LICENSED = "https://gbhtoehdxkzjsmmkisgu.supabase.co/storage/v1/object/public/place-photos/fixture.jpg";

const railOpen = renderToStaticMarkup(h(fx.Rail, { strict: false, photo: GOOGLE, place: PLACE }));
ok(CARD_REQUEST_RX.test(railOpen) && !GOOGLE_IMG_RX.test(railOpen), "control: outside the policy RailCard mounts the credited lazy JSON request without an uncredited image");
const railStrict = renderToStaticMarkup(h(fx.Rail, { strict: true, photo: GOOGLE, place: PLACE }));
ok(!CARD_REQUEST_RX.test(railStrict) && !ANY_IMG_RX.test(railStrict) && /wf-place-card-monogram/.test(railStrict), "under the policy RailCard renders NO Google photo and NO Google fallback: monogram instead");
ok(!/data-fallback="\/api\/photo/.test(railStrict), "under the policy RailCard's same-place /api/photo fallback is gone too");
const railLicensed = renderToStaticMarkup(h(fx.Rail, { strict: true, photo: LICENSED, photoAttr: "Jane Doe (CC BY-SA 4.0)", photoAttrHref: "https://commons.wikimedia.org/wiki/File:x.jpg", place: PLACE }));
ok(railLicensed.includes('src="' + LICENSED + '"') && /wf-place-card-photo-attr/.test(railLicensed) && railLicensed.includes("Jane Doe (CC BY-SA 4.0)"), "under the policy a licensed photo renders with its licence credit");
ok(!/data-fallback="\/api\/photo/.test(railLicensed), "under the policy a licensed photo carries no Google fallback");
const railCreditNoPhoto = renderToStaticMarkup(h(fx.Rail, { strict: true, photo: GOOGLE, photoAttr: "Someone", photoAttrHref: "https://example.com", place: PLACE }));
ok(!/wf-place-card-photo-attr/.test(railCreditNoPhoto), "a credit badge never floats over a photo that was not shown");

const GPLACE = { ...PLACE, photoRef: "places/ChIJ3SpvbYPhwogRS17En4FSzVI/photos/AbC123" };
const iconicOpen = renderToStaticMarkup(h(fx.Iconic, { strict: false, place: GPLACE }));
ok(CARD_REQUEST_RX.test(iconicOpen) && !GOOGLE_IMG_RX.test(iconicOpen), "control: outside the policy IconicPlaceCard mounts the credited lazy JSON request");
const iconicStrict = renderToStaticMarkup(h(fx.Iconic, { strict: true, place: GPLACE }));
ok(!CARD_REQUEST_RX.test(iconicStrict) && !GOOGLE_IMG_RX.test(iconicStrict) && !/data-fallback="\/api\/photo/.test(iconicStrict) && /wf-place-card-monogram/.test(iconicStrict), "under the policy IconicPlaceCard renders no Google photo and no Google fallback");
const iconicLicensed = renderToStaticMarkup(h(fx.Iconic, { strict: true, place: { ...PLACE, photo: LICENSED }, photoAttr: "Jane Doe (CC BY 2.0)", photoAttrHref: "https://commons.wikimedia.org/wiki/File:y.jpg" }));
ok(iconicLicensed.includes('src="' + LICENSED + '"') && iconicLicensed.includes("Jane Doe (CC BY 2.0)"), "under the policy IconicPlaceCard shows a licensed photo with its credit");

// 3. GuideFigure — the one guide surface that prints Google's credit.
const GuideFigure = (await loadComponent(path.join(ROOT, "app/components/GuideFigure.js"), ROOT)).default;
const lh3 = "https://lh3.googleusercontent.com/place-photos/AG9Nfixture=s4800-w640";
const figNoCredit = renderToStaticMarkup(h(GuideFigure, { role: "pick", image: { src: lh3, alt: "x" } }));
ok(figNoCredit === "", "GuideFigure draws nothing for a Google photo with no credit");
const figNoMaps = renderToStaticMarkup(h(GuideFigure, { role: "pick", image: { src: lh3, alt: "x", credit: "Ana", creditHref: "https://maps.google.com/maps/contrib/1" } }));
ok(figNoMaps === "", "GuideFigure draws nothing for a Google photo with an author but no Google Maps link");
const figHidden = renderToStaticMarkup(h(GuideFigure, { role: "card", showCaption: false, image: { src: lh3, alt: "x", credit: "Ana", creditHref: "https://maps.google.com/maps/contrib/1", providerHref: "https://www.google.com/maps/place//data=x" } }));
ok(figHidden === "", "GuideFigure draws nothing for a credited Google photo whose caption is hidden");
const figApiPhoto = renderToStaticMarkup(h(GuideFigure, { role: "card", image: { src: "/api/photo?place=ChIJ3SpvbYPhwogRS17En4FSzVI&g=2&w=900", alt: "x" } }));
ok(figApiPhoto === "", "GuideFigure draws nothing for an uncredited /api/photo image");
const figCredited = renderToStaticMarkup(h(GuideFigure, { role: "pick", image: { src: lh3, alt: "x", credit: "Ana Author", creditHref: "https://maps.google.com/maps/contrib/1", providerHref: "https://www.google.com/maps/place//data=x" } }));
ok(figCredited.includes(lh3) && figCredited.includes("Photo: Ana Author") && figCredited.includes('href="https://www.google.com/maps/place//data=x"') && figCredited.includes(">Google Maps<"), "positive control: a credited Google photo renders with author and Google Maps link");
const figLocal = renderToStaticMarkup(h(GuideFigure, { role: "pick", image: { src: "/guides/verified/fixture.webp", alt: "x" } }));
ok(figLocal.includes("/guides/verified/fixture.webp"), "a local photo is unaffected");

// 4. The route tree is under the policy.
const layout = read("app/guides/layout.js").replace(/\/\/.*$/gm, "");
ok(/<PhotoPolicyProvider requireGoogleCredit>\{children\}<\/PhotoPolicyProvider>/.test(layout), "app/guides/layout.js renders every guide route inside <PhotoPolicyProvider requireGoogleCredit>");
// Structural only for the three client islands a static render cannot reach
// (they paint from client fetches or a map click); each must filter at the
// exact point it builds its <img>.
const strip = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
ok(/if \(!pick\.image \|\| !photoSrcFilter\(pick\.image\)\) return false;/.test(strip("app/components/IntentPartnerPick.js")), "IntentPartnerPick drops a pick whose only image is a Google photo (structural: client fetch)");
ok(/\{p\.photoRef && photoSrcFilter\("\/api\/photo\?ref="/.test(strip("app/components/ExploreBridge.js")), "ExploreBridge filters its thumbnail (structural: client island)");
ok(/\{photoSrcFilter\(thumb\(selected\)\) \? <img src=\{photoSrcFilter\(thumb\(selected\)\)\}/.test(strip("app/components/EventVenueMap.js")), "EventVenueMap filters its pin-card thumbnail (structural: needs a map click)");

// 5. Map-explorer spots: licensed photo with credit, else none; never Google.
const calls = [];
const fakeFree = async ({ placeId }) => { calls.push(placeId); return placeId === "ChIJlicensedAAAAAAAAAAAAAA" ? { url: LICENSED, attributionText: "Jane Doe", attributionUrl: "https://commons.wikimedia.org/wiki/File:x.jpg", license: "CC BY-SA 4.0", source: "wikimedia" } : null; };
const spots = await withAttributableSpotPhotos([
  { id: "ChIJlicensedAAAAAAAAAAAAAA", image: "/api/photo?place=ChIJlicensedAAAAAAAAAAAAAA&g=2&w=800" },
  { id: "ChIJgoogleonlyAAAAAAAAAAAA", image: "/api/photo?place=ChIJgoogleonlyAAAAAAAAAAAA&g=2&w=800" },
  { id: "event-slug", photoPlaceId: "ChIJlicensedAAAAAAAAAAAAAA", image: "/api/photo?place=ChIJlicensedAAAAAAAAAAAAAA&g=2&w=800" },
  { id: "ChIJlocalAAAAAAAAAAAAAAAAA", image: "/fall/local.webp" },
], { findFreePhoto: fakeFree });
ok(spots[0].image === LICENSED && spots[0].photoAttr === "Jane Doe (CC BY-SA 4.0)" && spots[0].photoAttrHref.startsWith("https://commons."), "a spot with a licensed photo gets it, with its credit");
ok(spots[1].image === null && !spots[1].photo && !spots[1].photoAttr, "a spot with only a Google photo gets no photo");
ok(spots[2].image === LICENSED, "an event spot uses its mapped venue id for the licensed lookup");
ok(spots[3].image === "/fall/local.webp" && !calls.includes("ChIJlocalAAAAAAAAAAAAAAAAA"), "a spot that already has a non-Google image is untouched (and not looked up)");
ok(spots.every((s) => !isGooglePhotoSrc(s.image) && !isGooglePhotoSrc(s.photo)), "no spot leaves the resolver with a Google image");
const thrown = await withAttributableSpotPhotos([{ id: "ChIJlicensedAAAAAAAAAAAAAA", image: GOOGLE }], { findFreePhoto: async () => { throw new Error("down"); } });
ok(thrown[0].image === null, "a failed lookup means no photo, never a Google photo and never a thrown page");

// 6. The editorial branch never accepts a Google-hosted URL as "Wayfind art".
const editorial = await guidePlaceFigureImage({ id: "ChIJ3SpvbYPhwogRS17En4FSzVI", name: "x", photo: lh3, photoAttr: "Some credit" }, { findFreePhoto: async () => null, findSamePlaceCachedPhoto: async () => null, findAlternative: async () => null });
ok(editorial === null, "a Google-hosted place.photo with credit text is not treated as an editorial photo");
const editorialLocal = await guidePlaceFigureImage({ id: "ChIJ3SpvbYPhwogRS17En4FSzVI", name: "x", photo: "/guides/verified/x.webp", photoAttr: "Wayfind" }, {});
ok(editorialLocal && editorialLocal.src === "/guides/verified/x.webp", "positive control: a local editorial photo still wins");

// 7. /api/licensed-photos, called for real with a stubbed wf_place_photo read.
{
  let src = read("app/api/licensed-photos/route.js");
  const imports = (src.match(/^import[^;]+;\n/gm) || []).length;
  src = src.replace(/^import[^;]+;\n/gm, "").replace(/^export const dynamic[^\n]*\n/m, "");
  globalThis.__LP = { isGooglePhotoSrc, findFreePhoto: async ({ placeId }) => ({
    ChIJlicensedAAAAAAAAAAAAAA: { url: LICENSED, attributionText: "Jane Doe", attributionUrl: "https://commons.wikimedia.org/wiki/File:x.jpg", license: "CC BY-SA 4.0", source: "wikimedia" },
    ChIJnolicenseAAAAAAAAAAAAA: { url: LICENSED, attributionText: "Jane Doe", attributionUrl: "https://commons.wikimedia.org/wiki/File:x.jpg", license: "" },
    ChIJgoogleurlAAAAAAAAAAAAA: { url: lh3, attributionText: "x", attributionUrl: "https://x.example", license: "CC BY 2.0" },
  })[placeId] || null };
  const prelude = "const NextResponse = { json: (body, init) => ({ body, init }) }; const { isGooglePhotoSrc, findFreePhoto } = globalThis.__LP;";
  const { GET } = await import("data:text/javascript," + encodeURIComponent(prelude + "\n" + src));
  ok(imports === 3 && typeof GET === "function", "loaded the real /api/licensed-photos handler");
  const res = await GET(new Request("https://www.gowayfind.com/api/licensed-photos?place=ChIJlicensedAAAAAAAAAAAAAA,ChIJnolicenseAAAAAAAAAAAAA,ChIJgoogleurlAAAAAAAAAAAAA,ChIJmissingAAAAAAAAAAAAAAA,bad!id"));
  const photos = res.body.photos;
  ok(photos.length === 1 && photos[0].place_id === "ChIJlicensedAAAAAAAAAAAAAA" && photos[0].license === "CC BY-SA 4.0" && photos[0].attributionUrl.startsWith("https://"), `only a complete, non-Google, credited licensed photo is returned (got ${photos.length})`);
  ok(!/googleapis|places:\/\/|maps\.googleapis/.test(src), "/api/licensed-photos has no Google endpoint");
}

console.log(`test-google-photo-attribution: OK — ${n} assertions; real RailCard/IconicPlaceCard/GuideFigure renders inside and outside the guides' PhotoPolicyProvider (each with a positive control), the spot resolver and /api/licensed-photos called for real; 3 client-island checks are structural and say so`);
