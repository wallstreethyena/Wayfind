#!/usr/bin/env node
// The place detail rail uses the same photo list as the Halloween card:
// cover first, vault + galleries deduped, event tags kept apart on a shared
// place, and a stored Google photo allowed on the detail gallery.
import assert from "node:assert/strict";
import { halloweenHauntModel, hauntDetailSeedById } from "../lib/halloweenHauntVault.js";
import {
  HAUNT_GOOGLE_PLACE,
  withHauntPhotos,
} from "../lib/halloweenHauntPhotos.js";
import { assemblePlaceDetailPhotos, detailGalleryFetch, loadEventDetailPhotos, loadPlaceDetailPhotos } from "../lib/placeDetailGallery.js";
import { detailGalleryPhotos } from "../lib/livePhoto.js";
import { isStoredPlacePhotoUrl } from "../lib/placePhoto.js";

const V = "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJabcdefghij/";
const vault = (n, extra = {}) => ({
  url: V + "p" + n + ".jpg",
  attribution_text: "Someone " + n + " CC BY, via Wikimedia Commons",
  source_ref: extra.source_ref || ("File:Venue " + n + ".jpg"),
  width: 1280,
  height: 853,
  ...extra,
});
const hash = "ab".repeat(32);
const google = (id) => ({
  source: "google",
  src: "/api/photo/stored/" + id + "?v=" + hash,
  width: 1280,
  height: 720,
  credit: { name: "Jane", authors: [{ name: "Jane", uri: "https://maps.google.com/x" }], mapsUri: "https://maps.google.com/y" },
});

let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };

const model = halloweenHauntModel({ now: "2026-10-29T12:00:00-04:00" });
const mickeyId = HAUNT_GOOGLE_PLACE.mickey;
const seaId = HAUNT_GOOGLE_PLACE.howlOrlando;
ok(mickeyId && seaId && mickeyId !== seaId, "fixture place ids exist");

const mickeySeed = hauntDetailSeedById("mickey");
ok(mickeySeed && mickeySeed.photo && mickeySeed.photo.src, "mickey seed keeps the card cover");
const many = Array.from({ length: 6 }, (_, n) => vault(n + 1));
const card = await withHauntPhotos({ haunts: [mickeySeed] }, {
  read: async () => google(mickeyId),
  readVault: async () => many,
});
const detail = await loadPlaceDetailPhotos(mickeyId, {
  hauntSeed: mickeySeed,
  deps: { read: async () => google(mickeyId), readVault: async () => many },
});
ok(detail.map((p) => p.src).join("\n") === card.haunts[0].photos.map((p) => p.src).join("\n"),
  "a one-haunt place detail lists the same photos as its card, in the same order");
ok(detail[0].src === mickeySeed.photo.src, "the cover stays first");
ok(detail.some((p) => p.src === google(mickeyId).src), "the stored Google photo is on the detail list");
ok(isStoredPlacePhotoUrl(google(mickeyId).src), "stored photo url shape");

const howlSeed = hauntDetailSeedById("howlOrlando");
const spookySeed = hauntDetailSeedById("spooktacular");
const tagged = [
  { ...vault(1), haunt_key: "howlOrlando" },
  { ...vault(2), haunt_key: "spooktacular" },
  vault(3),
];
const howl = await loadPlaceDetailPhotos(seaId, {
  hauntId: "howlOrlando",
  hauntSeed: howlSeed,
  deps: { read: async () => google(seaId), readVault: async () => tagged },
});
const spooky = await loadEventDetailPhotos(spookySeed.eventHref, {
  hauntSeed: spookySeed,
  deps: { read: async () => google(seaId), readVault: async () => tagged },
});
ok(howl.some((p) => p.src.endsWith("/p1.jpg")) && howl.every((p) => !p.src.endsWith("/p2.jpg") && !p.src.endsWith("/p3.jpg") && p.source !== "google"),
  "Howl-O-Scream detail keeps only its tagged photos");
ok(spooky.some((p) => p.src.endsWith("/p2.jpg")) && spooky.every((p) => !p.src.endsWith("/p1.jpg") && !p.src.endsWith("/p3.jpg") && p.source !== "google"),
  "Spooktacular detail keeps only its tagged photos");
const sharedPlace = await loadPlaceDetailPhotos(seaId, {
  deps: {
    read: async () => { throw new Error("shared place must not read the Google photo"); },
    readVault: async () => tagged,
  },
});
ok(sharedPlace.every((p) => !p.src.endsWith("/p1.jpg") && !p.src.endsWith("/p2.jpg")),
  "SeaWorld place detail without an event does not mix the two cards");
ok(sharedPlace.some((p) => p.src.endsWith("/p3.jpg")), "untagged venue photo still shows on the shared place");
const mixedSignals = assemblePlaceDetailPhotos({
  placeId: seaId,
  name: "SeaWorld Orlando",
  signals: { photos: [V + "p1.jpg", "https://cdn.wayfind.test/venue-only.jpg"] },
  vaultEntries: tagged,
});
ok(!mixedSignals.some((p) => p.src.endsWith("/p1.jpg") || p.src.endsWith("/p2.jpg")) && mixedSignals.some((p) => p.src === "https://cdn.wayfind.test/venue-only.jpg"),
  "a shared place keeps an untagged signals.photos url and drops one that belongs to a tagged event");

const otherId = "ChIJnotahauntplace0001";
const assembled = assemblePlaceDetailPhotos({
  placeId: otherId,
  name: "Cafe",
  coverSrc: "https://cdn.wayfind.test/cover.jpg",
  signals: {
    photos: ["https://cdn.wayfind.test/cover.jpg", "https://cdn.wayfind.test/signal.jpg", "/api/photo?place=" + otherId],
    photo_gallery: [vault(4), vault(4), { ...vault(5), source_ref: "File:Venue 4.jpg" }],
  },
  vaultEntries: [vault(4)],
  googleStored: google(otherId),
});
ok(assembled[0].src === "https://cdn.wayfind.test/cover.jpg", "explicit cover leads");
ok(assembled.filter((p) => p.src.endsWith("/p4.jpg")).length === 1, "the same vault photo is kept once");
ok(assembled.filter((p) => /Venue 4/.test(p.src) || p.src.endsWith("/p5.jpg")).length === 0, "a second URL of the same source picture is dropped");
ok(assembled.some((p) => p.src === "https://cdn.wayfind.test/signal.jpg"), "signals.photos is on a place that is not shared");
ok(!assembled.some((p) => p.src.includes("/api/photo?place=")), "a live place proxy is not a gallery photo");
ok(assembled.some((p) => p.source === "google"), "a non-shared place keeps its stored Google photo");

const gallery = detailGalleryPhotos({
  photo: "https://cdn.wayfind.test/cover.jpg",
  photos: [google(otherId).src, "https://cdn.wayfind.test/cover.jpg", "/api/photo?place=" + otherId],
});
ok(gallery[0] === "https://cdn.wayfind.test/cover.jpg" && gallery.includes(google(otherId).src) && !gallery.some((s) => s.includes("/api/photo?place=")),
  "the detail sheet keeps the cover, the stored photo, and drops the live proxy; got " + JSON.stringify(gallery));

const blocked = assemblePlaceDetailPhotos({
  placeId: HAUNT_GOOGLE_PLACE.hhn,
  hauntId: "hhn",
  name: "Halloween Horror Nights",
  vaultEntries: [
    vault(1, { url: "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJvRBCrN9-54gRGZuuaCLGrQE/30ea7656d2b58f51f6fb855e.jpg", source_ref: "File:Universal ok.jpg" }),
    vault(2, { url: "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJvRBCrN9-54gRGZuuaCLGrQE/6715e50305d5a16b.jpg" }),
  ],
});
ok(!blocked.some((p) => /30ea7656/.test(p.src)) && blocked.some((p) => /6715e50305d5a16b/.test(p.src)),
  "a blocked haunt photo stays off the detail list");

ok(model.haunts.some((h) => h.id === "mickey"), "positive control: the haunt model still has Mickey");
const originalFetch = globalThis.fetch;
let seenInit = null;
globalThis.fetch = async (_url, init) => { seenInit = init; return { ok: false, json: async () => [] }; };
await detailGalleryFetch(600)("https://example.test/photos", { cache: "no-store", headers: { apikey: "x" } });
globalThis.fetch = originalFetch;
ok(seenInit && !("cache" in seenInit) && seenInit.next && seenInit.next.revalidate === 600 && seenInit.headers.apikey === "x",
  "a static page photo read is cached, not no-store");
console.log("test-place-detail-gallery: " + checks + " checks passed");
