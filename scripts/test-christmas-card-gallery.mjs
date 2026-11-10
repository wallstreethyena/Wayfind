#!/usr/bin/env node
// Locks the homepage Christmas card photo connection: christmasEventCard()
// reads the venue row's signals.christmas_photo_gallery (photos tagged with the
// card's own event id or slug) before it falls back to the venue's Google photo.
// Exact tag match only. Asserts on the CALL (card returned), not on source text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { christmasEventCard } from "../lib/christmasCards.js";
import { christmasTaggedPhotos } from "../lib/christmasPlacePhotos.js";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const BASE = "https://abcdefgh.supabase.co/storage/v1/object/public/place-photos/";
const shot = (name, keys, extra = {}) => ({ url: BASE + "ChIJtest123/" + name + ".jpg", christmas_keys: keys, attribution_text: "Test Credit", attribution_url: "https://example.com/c", width: 1280, height: 853, ...extra });
const GOOGLE = "https://places.googleapis.com/v1/places/ChIJtest123/photos/ref/media";
const today = "2026-11-04";
const row = (id, over = {}) => ({ event_id: id, slug: id, event_name: "Test Event", venue: "Test Venue", city: "Orlando", state: "FL", place_id: "ChIJtest123", start_date: "2026-11-20", end_date: "2026-12-30", ...over });
const inv = (gallery) => ({ place_id: "ChIJtest123", signals: { photos: [{ url: GOOGLE }], christmas_photo_gallery: gallery } });

// Positive: tagged with the event's own id, cover wins, Google URL unused.
{
  const card = christmasEventCard(row("ev-own-2026"), { today, inventory: inv([shot("a", ["ev-own-2026"]), shot("b", ["ev-own-2026"], { cover: true })]) });
  ok(card.image === BASE + "ChIJtest123/b.jpg", "the gallery cover is the card image, got " + card.image);
  ok(!String(card.image).includes("googleapis"), "the Google venue photo is NOT the card image");
  ok(Array.isArray(card.photos) && card.photos.length === 2 && card.photos[0].src === card.image, "photos carries the tagged list, cover first");
  ok(card.imageIsVenue === false, "a tagged event photo is not a venue photo");
  ok(card.photoAttr === "Test Credit" && card.photoAttrHref === "https://example.com/c", "credit and credit link ride along");
}
// Negative control: a gallery tagged with a different event id is ignored.
{
  const card = christmasEventCard(row("ev-own-2026"), { today, inventory: inv([shot("x", ["some-other-event-2026"], { cover: true })]) });
  ok(!String(card.image || "").includes("place-photos/ChIJtest123/x.jpg"), "a photo tagged for another event never shows");
  ok(!card.photos, "no photos list from another event's tags");
}
// Name similarity is never a match.
{
  const card = christmasEventCard(row("ev-own-2026", { event_name: "Other Event" }), { today, inventory: inv([shot("y", ["ev-own-2026-extra"])]) });
  ok(!card.photos, "near-miss tag is not a match");
}
// Slug match.
{
  const card = christmasEventCard(row("ev-id-2026", { slug: "ev-slug-2026" }), { today, inventory: inv([shot("s", ["ev-slug-2026"])]) });
  ok(card.image.endsWith("/s.jpg"), "a photo tagged with the page slug is found");
}
// Aliases: every homepage event id resolves its gallery key(s), exact pairs only.
const PAIRS = {
  "christmas-town-2026": "busch-gardens-christmas-town-2026",
  "seaworld-orlando-christmas-2026": "seaworld-orlando-christmas-celebration-2026",
  "jollywood-nights-2026": "disney-jollywood-nights-2026",
  "mvmcp-2026": "mickeys-very-merry-christmas-party-2026",
  "enchant-stpete-2026": "enchant-christmas-st-petersburg-2026",
  "dazzling-nights-leu-2026": "dazzling-nights-leu-gardens-2026",
  "naples-night-lights-2026": "naples-botanical-garden-night-lights-2026",
};
for (const id of ["universal-orlando-holidays-2026", "ripleys-christmas-park-hialeah-2026", "christmas-wonderland-at-tropical-park-2026", "pirate-water-taxi-boat-parade-cruise-2026", "frrm-north-pole-express-2026", "van-wezel-dave-koz-and-friends-christmas-tour-2026", "christmas-at-gaylord-palms-2026"]) PAIRS[id] = id;
for (const [id, key] of Object.entries(PAIRS)) {
  ok(christmasTaggedPhotos(id, [shot("k", [key])]).length === 1, id + " reads photos tagged " + key);
  ok(christmasTaggedPhotos(id, [shot("k", ["unrelated-2026"])]).length === 0, id + " ignores unrelated tags");
}
ok(christmasTaggedPhotos("mvmcp-2026", [shot("k", ["mvmcp-2026"])]).length === 1 && christmasTaggedPhotos("jollywood-nights-2026", [shot("k", ["mvmcp-2026"])]).length === 0, "Mickey's party tags never leak into JOLLYWOOD");
// Route cache key bumped (payload shape changed).
const route = readFileSync("app/api/events/christmas/route.js", "utf8").replace(/\/\/.*$/gm, "");
ok(/`christmas-intents:v15:/.test(route) && !/christmas-intents:v1[234]:/.test(route), "the fast cache key is v15");
console.log("test-christmas-card-gallery: OK, " + checks + " assertions");
