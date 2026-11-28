// scripts/test-card-photo-fallback.mjs — home/browse PlaceCard photo ladder
// (owner, 2026-09-28: "a lot of the places don't have pictures").
// A Google-id row with no ref, or whose ref dies, falls back to the SAME
// place-scoped /api/photo?place=<id> rung landing cards use — never to another
// place's photo, never for a non-Google id.
import { readFileSync } from "node:fs";
import { ownedPlacePhotoSrc, cardImageSrc, isPlaceOwnedPhotoUrl } from "../lib/placePhoto.js";
import { isOwnedPhotoUrl } from "../lib/placePhotoServe.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

let pass = 0;
const fail = (m) => { console.error("test-card-photo-fallback: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const gid = "ChIJN1t_tDeuEmsRUsoyG83frY4";
ok(ownedPlacePhotoSrc(gid) === "/api/photo?place=" + gid + "&g=2&w=640", "Google id → place-scoped photo route");
ok(ownedPlacePhotoSrc("fsq:4b5f0c2af964a520") === "", "Foursquare id never guesses a Google photo route");
ok(ownedPlacePhotoSrc("some-internal-slug") === "", "internal slug never guesses a venue-photo URL");
ok(ownedPlacePhotoSrc(null) === "" && ownedPlacePhotoSrc(undefined) === "", "missing id is empty, never 'undefined'");
ok(cardImageSrc({ id: gid }) === ownedPlacePhotoSrc(gid), "the landing ladder and the home card agree on the place rung");

// Structural: inside PlaceCard, the place rung is computed from p.id and used as
// both the primary-of-last-resort and the error fallback of the SAME <FallbackImg>.
const src = readFileSync("app/home.js", "utf8");
const start = src.search(/\nfunction PlaceCard\(/);
ok(start > 0, "positive control: PlaceCard found");
const body = src.slice(start, start + 20000);
ok(/import \{ ownedPlacePhotoSrc \} from "\.\.\/lib\/placePhoto";/.test(src), "home.js imports ownedPlacePhotoSrc");
ok(/const cardPlaceSrc = ownedPlacePhotoSrc\(p && p\.id\);/.test(body), "PlaceCard derives the place rung from ITS OWN id");
ok(/const cardPrimarySrc = cardPhoto \|\| \(p && p\.photo\) \|\| cardPlaceSrc;/.test(body), "a card with no ref still gets the place rung");
ok(/<FallbackImg src=\{cardPrimarySrc\} fallbackSrc=\{cardPlaceSrc && cardPlaceSrc !== cardPrimarySrc \? cardPlaceSrc : undefined\}/.test(body), "a dead ref retries through the place rung");
ok(/placeFallback=\{<PlaceCardPhotoFallback name=\{p\.name\}\s*\/>/.test(body), "a place-card miss renders the shared unavailable-photo state");

const { loadComponent } = await import("./lib/jsxLoad.mjs");
const { resolve } = await import("node:path");
const { default: PlaceCardPhotoFallback, placeInitials } = await loadComponent(resolve("app/components/PlaceCardPhotoFallback.js"), process.cwd());
const restaurants = ["Restaurant iDalia", "OSAKA Sushi & Grill", "Mizu Sushi & Hibachi Express", "Michael John's"];
for (const [index, name] of restaurants.entries()) {
  const html = renderToStaticMarkup(React.createElement(PlaceCardPhotoFallback, { name }));
  ok(html.includes("wf-place-photo-unavailable") && html.includes(">Photo unavailable<"), name + " has an explicit unavailable-photo state");
  ok(html.includes('aria-hidden="true">' + ["RI", "OS", "MS", "MJ"][index] + "</span>"), name + " shows its own initials");
  ok(!/<img\b|<picture\b|\.webp|data-card-photo-request/.test(html), name + " cannot render a substitute photo");
}

ok(placeInitials() === "WF" && placeInitials("  Étoile  Bistro  ") === "ÉB", "monograms handle missing names, accents, and spaces");

for (const src of ["/place-photos/representative/food.webp", "https://www.gowayfind.com/place-photos/representative/dining.webp?v=1"]) {
  ok(!isPlaceOwnedPhotoUrl(src) && !isOwnedPhotoUrl(src), "a retired illustration is rejected by the client and server venue-photo selectors");
  ok(cardImageSrc({ id: gid, photo_url: src }) === ownedPlacePhotoSrc(gid), "an old illustration retries the same venue");
}
const exact = "/place-photos/venue-a.webp";
ok(isPlaceOwnedPhotoUrl(exact) && isOwnedPhotoUrl(exact) && cardImageSrc({ id: gid, photo_url: exact }) === exact,
  "an exact owned photo still takes precedence");
console.log(`test-card-photo-fallback: OK — ${pass} exact-source and unavailable-state assertions`);
