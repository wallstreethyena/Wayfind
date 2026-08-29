#!/usr/bin/env node
// scripts/test-landing-card-photo.mjs — landing list cards never wear a neighbor.
//
// THE LIVE BUG (2026-08-29, owner iPhone, /nightlife/parrish ~6:14pm ET):
// Pangea Alchemy Lab rendered a real oval Shamrock City Pub Est. 2008 sign.
// Root cause: landingPhoto() cycled a city+category Pexels pool (lib/stockPhoto.js)
// by card index. Inventory rows had photoRef stripped to null, so every card
// got another venue's (or a stock venue sign's) photo.
//
// Law: a card may only show a photo that belongs to THAT place (stored Atlas /
// inventory / owned upload / owned Google photo_ref). Empty/placeholder if we
// do not hold that place's photo. Never another venue. Never a shared pool.
// Zero Places / Place Details / photo backfill in this matcher.
//
// Asserted ON THE CALL (CLAUDE.md): landingCardPhotoSrc / isLandingCardImageAllowed
// / invPlaceToLanding. A regex over landing.js would pass while Pangea still
// rendered Shamrock.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  isForbiddenLandingStock,
  isLandingCardImageAllowed,
  isLandingHeroImageAllowed,
  isPlaceOwnedPhotoUrl,
  landingCardPhotoSrc,
  landingHeroSrc,
  photoRefOwnedByPlace,
} from "../lib/placePhoto.js";
import { invPlaceToLanding } from "../lib/landingInventory.js";
import { invRowToPlace } from "../lib/inventoryServe.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
const fail = (m) => { console.error("test-landing-card-photo: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const read = (rel) => {
  const src = readFileSync(path.join(ROOT, rel), "utf8");
  if (!src) fail(rel + " is empty — this lock is anchored to a file that must exist");
  return src;
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

const PANGEA = "ChIJPangeaAlchemyLab";
const SHAMROCK = "ChIJShamrockCityPub";
const PANGEA_REF = "places/" + PANGEA + "/photos/OwnLab1";
const SHAMROCK_REF = "places/" + SHAMROCK + "/photos/OvalSign2008";
const PEXELS = "https://images.pexels.com/photos/4120665/pexels-photo-4120665.jpeg";
const OWNED_URL = "https://lh3.googleusercontent.com/p/pangea-own";

ok(photoRefOwnedByPlace(PANGEA_REF, PANGEA) === true,
  "positive control: Pangea's own photo_ref belongs to Pangea");
ok(photoRefOwnedByPlace(SHAMROCK_REF, PANGEA) === false,
  "Shamrock City's photo_ref does not belong to Pangea");
ok(isPlaceOwnedPhotoUrl(OWNED_URL) === true,
  "a googleusercontent URI is a place-owned photo URL");
ok(isPlaceOwnedPhotoUrl(PEXELS) === false,
  "a Pexels URL is never a place-owned photo");

ok(landingCardPhotoSrc({ id: PANGEA, name: "Pangea Alchemy Lab", photoRef: PANGEA_REF })
    === "/api/photo?ref=" + encodeURIComponent(PANGEA_REF) + "&w=1200",
  "Pangea with its own photo_ref emits /api/photo for THAT ref");
ok(landingCardPhotoSrc({ id: PANGEA, name: "Pangea Alchemy Lab", photoRef: SHAMROCK_REF }) === "",
  "Pangea + Shamrock City photo_ref is empty — never the oval pub sign");
ok(landingCardPhotoSrc({ id: PANGEA, name: "Pangea Alchemy Lab" }) === "",
  "Pangea with no owned photo is empty/placeholder — not a category pool");
ok(landingCardPhotoSrc({
    id: PANGEA, name: "Pangea Alchemy Lab",
    photo_url: PEXELS, photoRef: SHAMROCK_REF,
  }) === "",
  "stock URL + neighbor ref still empty");
ok(landingCardPhotoSrc({ id: PANGEA, name: "Pangea Alchemy Lab", photo_url: OWNED_URL }) === OWNED_URL,
  "Pangea's stored inventory photo_url is displayed");

{
  // Owner browser, live /nightlife/parrish: these files ARE other venues.
  const LIVE = [
    { name: "Pangea Alchemy Lab", id: PANGEA, url: "https://images.pexels.com/photos/16408140/pexels-photo-16408140.jpeg", note: "Shamrock City Pub Est. 2008 oval sign" },
    { name: "Jaxx Wing Co.", id: "ChIJJaxxWingCoXX", url: "https://images.pexels.com/photos/12103056/pexels-photo-12103056.jpeg", note: "PHO THIN 17 storefront" },
    { name: "Oscura", id: "ChIJOscuraXXXXXX", url: "https://images.pexels.com/photos/2599246/pexels-photo-2599246.jpeg", note: "generic neon BAR sign" },
  ];
  const BRETTOS = "https://images.pexels.com/photos/14698219/pexels-photo-14698219.jpeg";
  for (const row of LIVE) {
    ok(isForbiddenLandingStock(row.url) === true, row.note + " is forbidden nightlife stock");
    ok(landingCardPhotoSrc({ id: row.id, name: row.name, photo_url: row.url }) === "",
      row.name + " + " + row.note + " is blank — not treated as a real picture");
    ok(isLandingCardImageAllowed(row.url, row.id) === false,
      row.name + " must not be allowed to render " + row.note);
  }
  ok(isForbiddenLandingStock(BRETTOS) === true, "Brettos Athens (pexels 14698219) is forbidden hero stock");
  ok(isLandingHeroImageAllowed(BRETTOS) === false,
    "Parrish nightlife hero must not be Brettos bar in Athens");
  const hero = landingHeroSrc("nightlife");
  ok(hero === "/cards/tonight-alfonso-scarpa-unsplash.jpg",
    "nightlife hero is owner concert-crowd chrome (got " + hero + ")");
  ok(isLandingHeroImageAllowed(hero) === true, "owner concert-crowd chrome is a legal hero");
  ok(!/pexels/i.test(hero), "nightlife hero is not Pexels");
}
ok(landingCardPhotoSrc({
    id: PANGEA, name: "Pangea Alchemy Lab",
    photo_url: OWNED_URL,
    photo: PEXELS,
    photoRef: SHAMROCK_REF,
  }) === OWNED_URL,
  "Pexels / neighbor ref must not override a stored real photo_url");
ok(!/pexels/i.test(landingCardPhotoSrc({
    id: PANGEA, name: "Pangea Alchemy Lab",
    photo: PEXELS, photoUrl: PEXELS,
  })),
  "a stuffed Pexels photo field never becomes the card src");

{
  // Runtime inventory shape (wf_inventory row → invRowToPlace → landing).
  // This is the path rankedFor actually runs. Confirm photo_url / photo_ref
  // survive. Zero Places.
  const row = invRowToPlace({
    place_id: PANGEA,
    name: "Pangea Alchemy Lab",
    lat: 27.336, lng: -82.531,
    status: "OPERATIONAL",
    google_types: ["bar"],
    photo_ref: PANGEA_REF,
    photo_url: OWNED_URL,
    signals: { rating: 4.6, reviews: 752 },
  });
  ok(row && row.id === PANGEA && row.photo_url === OWNED_URL,
    "invRowToPlace KEEPS wf_inventory.photo_url at runtime");
  ok(row.photo_ref === PANGEA_REF && row.photos && row.photos[0] && row.photos[0].name === PANGEA_REF,
    "invRowToPlace KEEPS wf_inventory.photo_ref at runtime");
  const mapped = invPlaceToLanding(row);
  ok(mapped && mapped.photo_url === OWNED_URL && mapped.photoRef === PANGEA_REF,
    "invPlaceToLanding does not discard a confirmed inventory photo");
  ok(landingCardPhotoSrc(mapped) === OWNED_URL,
    "runtime inventory photo_url is what the landing card displays");
  const pexelsRow = invRowToPlace({
    place_id: PANGEA, name: "Pangea Alchemy Lab",
    lat: 27.336, lng: -82.531, status: "OPERATIONAL",
    google_types: ["bar"], photo_url: PEXELS,
    signals: { rating: 4.6, reviews: 752 },
  });
  ok(landingCardPhotoSrc(invPlaceToLanding(pexelsRow)) === "",
    "a Pexels URL stored as photo_url is stripped — never a pub-sign stand-in");
}

ok(isLandingCardImageAllowed("", PANGEA) === true, "empty src is allowed (placeholder)");
ok(isLandingCardImageAllowed("/wf-photo-fallback.svg", PANGEA) === true,
  "the branded SVG is the empty fallback, not a neighbor");
ok(isLandingCardImageAllowed(PEXELS, PANGEA) === false,
  "a Pexels src is never allowed on a landing card");
ok(isLandingCardImageAllowed("/api/market-photo?q=nightlife+parrish", PANGEA) === false,
  "a category+metro market-photo URL is the shared-pool leak");
ok(isLandingCardImageAllowed("/api/photo?ref=" + encodeURIComponent(PANGEA_REF) + "&w=1200", PANGEA) === true,
  "src place id matching the card place id is allowed");
ok(isLandingCardImageAllowed("/api/photo?ref=" + encodeURIComponent(SHAMROCK_REF) + "&w=1200", PANGEA) === false,
  "src place id Shamrock + card place id Pangea is FORBIDDEN");

{
  const mapped = invPlaceToLanding({
    id: PANGEA,
    name: "Pangea Alchemy Lab",
    photos: [{ name: SHAMROCK_REF }],
  });
  ok(mapped && mapped.id === PANGEA, "invPlaceToLanding produced a Pangea row");
  ok(mapped.photoRef == null, "inventory mapper strips a neighbor photo_ref");
  ok(landingCardPhotoSrc(mapped) === "",
    "mapped Pangea + Shamrock ref cannot render a photo");
}
{
  const mapped = invPlaceToLanding({
    id: PANGEA,
    name: "Pangea Alchemy Lab",
    photos: [{ name: PANGEA_REF }],
    photo_url: OWNED_URL,
  });
  ok(mapped.photoRef === PANGEA_REF, "inventory mapper keeps Pangea's own ref");
  ok(landingCardPhotoSrc(mapped) === OWNED_URL,
    "owned photo_url wins over the ref (already stored, no Places call)");
}

{
  const land = strip(read("lib/landing.js"));
  ok(land.length > 500, "positive control: landing.js has a body after comment-strip");
  ok(/landingCardPhotoSrc\(/.test(land),
    "LandingPage CALLS landingCardPhotoSrc — a mention is the substring trap");
  ok(/landingHeroSrc\(catSlug\)/.test(land),
    "LandingPage CALLS landingHeroSrc(catSlug) — hero is not fromPool");
  ok(!/\bstockPhotoPool\b/.test(land),
    "landing.js must not call stockPhotoPool — that pool painted Shamrock on Pangea");
  ok(!/\bfromPool\b/.test(land),
    "landing.js must not pick from a shared stock pool");
  ok(!/\blandingPhotoQuery\b/.test(land),
    "city+category photo query stays deleted from landing cards");
  ok(!/images\.pexels\.com/.test(land),
    "landing.js does not hardcode a Pexels card URL");
}

{
  const eat = read("app/eat/[metro]/[cuisine]/page.js");
  ok(eat.length > 200, "positive control: /eat cuisine page is readable");
  ok(!/\bstockPhotoPool\b/.test(eat) && !/\bfromPool\b/.test(eat),
    "/eat cuisine list must not grow the city+category photo pool");
}

console.log(`test-landing-card-photo: OK — ${pass} assertions (Pangea cannot render Shamrock; src place id must match card; empty is allowed; no stock pool)`);
