// scripts/test-card-photo-fallback.mjs — home/browse PlaceCard photo ladder
// (owner, 2026-09-28: "a lot of the places don't have pictures").
// A Google-id row with no ref, or whose ref dies, falls back to the SAME
// place-scoped /api/photo?place=<id> rung landing cards use — never to another
// place's photo, never for a non-Google id.
import { readFileSync } from "node:fs";
import { ownedPlacePhotoSrc, cardImageSrc } from "../lib/placePhoto.js";

let pass = 0;
const fail = (m) => { console.error("test-card-photo-fallback: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const gid = "ChIJN1t_tDeuEmsRUsoyG83frY4";
ok(ownedPlacePhotoSrc(gid) === "/api/photo?place=" + gid + "&g=2&w=640", "Google id → place-scoped photo route");
ok(ownedPlacePhotoSrc("fsq:4b5f0c2af964a520") === "", "Foursquare id never guesses a Google photo route");
ok(ownedPlacePhotoSrc("some-internal-slug") === "", "internal slug keeps its monogram");
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
ok(/wf-place-card-monogram/.test(body), "the monogram remains the honest last resort");

console.log(`test-card-photo-fallback: OK — ${pass} assertions (Google-id cards fall back to their own place photo; non-Google ids and slugs never guess)`);
