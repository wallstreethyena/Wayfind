#!/usr/bin/env node
// Locks the /halloween-in-florida photo strip: at most 14 photos per card, no repeat
// of the same picture (by URL or by source picture), every Google photo carries its
// author credit, nothing unrelated, and a missing or failing store row fails closed.
import assert from "node:assert/strict";
import { halloweenHauntModel } from "../lib/halloweenHauntVault.js";
import {
  HAUNT_GOOGLE_PLACE,
  HAUNT_PHOTO_BLOCK,
  MAX_HAUNT_PHOTOS,
  hauntPhotoBlocked,
  dedupeVaultEntries,
  googleStripPhoto,
  vaultStripPhoto,
  withHauntPhotos,
} from "../lib/halloweenHauntPhotos.js";

const model = halloweenHauntModel({ now: "2026-10-29T12:00:00-04:00" });
const V = "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJabcdefghij/";
const vault = (n, ref = "File:Venue " + n + ".jpg") => ({ url: V + "p" + n + ".jpg", attribution_text: "Someone " + n + " CC BY, via Wikimedia Commons", source_ref: ref, width: 1280, height: 853 });
const hash = (c) => c.repeat(64);
const google = (id, author) => ({
  source: "google", src: "/api/photo/stored/" + id + "?v=" + hash("a"), width: 1280, height: 720,
  credit: { name: author, authors: [{ name: author, uri: "https://maps.google.com/x" }], mapsUri: "https://maps.google.com/y" },
});
let checks = 0;
const ok = (c, m) => { checks++; assert.ok(c, m); };

// 1. dedupe: the same source picture stored under two URLs shows once
const d = dedupeVaultEntries([vault(1, "File:A.jpg"), { ...vault(2, "File:A.jpg") }, vault(3, "File:B.jpg"), vault(3, "File:C.jpg")]);
assert.equal(d.length, 2); checks++;
assert.deepEqual(dedupeVaultEntries(null), []); checks++;
const taggedCopy = dedupeVaultEntries([vault(1, "File:Shared.jpg"), { ...vault(9, "File:Shared.jpg"), haunt_key: "howlOrlando" }]);
assert.equal(taggedCopy.length, 2); checks++;
assert.equal(taggedCopy[1].haunt_key, "howlOrlando"); checks++;

// 2. unrelated pictures are skipped, venue pictures kept
const row = model.haunts.find((h) => h.id === "hhn");
for (const bad of ["File:Big Fire American Fare.jpg", "File:Fat Tuesday - Universal CityWalk.jpg", "File:Venue logo.png", "File:Park map.jpg", "File:Menu board.jpg", "File:My selfie.jpg", "File:Christmas tree.jpg"]) {
  assert.equal(vaultStripPhoto(row, vault(1, bad)), null, bad); checks++;
}
ok(vaultStripPhoto(row, vault(1, "File:Busch Gardens Tampa coaster.jpg")), "venue photo kept");
assert.equal(vaultStripPhoto(row, { ...vault(1), attribution_text: "" }), null); checks++; // no credit, no photo
assert.equal(vaultStripPhoto(row, { ...vault(1), url: "https://evil.example/x.jpg" }), null); checks++;

// 3. google photo needs author credit
assert.equal(googleStripPhoto(row, { ...google("ChIJabcdefghij", "X"), credit: { name: "", authors: [] } }), null); checks++;
const g = googleStripPhoto(row, google("ChIJabcdefghij", "Jane"));
ok(g && /^Photo by Jane on Google Maps$/.test(g.credit) && g.source === "google", "google credit");

// 4. full pipeline: max 5, no repeated src, google credit, owned photo first
const placeId = (id) => HAUNT_GOOGLE_PLACE[id];
const many = await withHauntPhotos(model, {
  read: async (id) => google(id, "Jane"),
  readVault: async () => Array.from({ length: MAX_HAUNT_PHOTOS + 6 }, (_, n) => vault(n + 1)),
});
for (const h of many.haunts) {
  const photos = h.photos;
  ok(photos.length <= MAX_HAUNT_PHOTOS, h.id + " has " + photos.length + " photos");
  ok(new Set(photos.map((p) => p.src)).size === photos.length, h.id + " repeats a src");
  for (const p of photos) if (p.source === "google") ok(/^Photo by .+ on Google Maps$/.test(p.credit), h.id + " google photo without credit");
  if (h.photo) ok(photos[0].src === h.photo.src, h.id + " owned photo not first");
}
ok(many.haunts.some((h) => h.photos.length === MAX_HAUNT_PHOTOS), "some card reaches the cap");
ok(MAX_HAUNT_PHOTOS === 14, "cap is 14");

const swModel = { haunts: model.haunts.filter((h) => h.id === "howlOrlando" || h.id === "spooktacular") };
let googleReads = 0;
const sw = await withHauntPhotos(swModel, {
  read: async () => { googleReads += 1; return google(HAUNT_GOOGLE_PLACE.howlOrlando, "Jane"); },
  readVault: async () => [
    { ...vault(1), haunt_key: "howlOrlando" },
    { ...vault(2), haunt_key: "spooktacular" },
    vault(3),
  ],
});
const howl = sw.haunts.find((h) => h.id === "howlOrlando");
const spooky = sw.haunts.find((h) => h.id === "spooktacular");
ok(googleReads === 0, "shared SeaWorld place does not read the shared Google photo");
ok(howl.photos.some((p) => p.src.endsWith("/p1.jpg")) && howl.photos.every((p) => !p.src.endsWith("/p2.jpg") && !p.src.endsWith("/p3.jpg") && p.source !== "google"), "Howl O Scream keeps only its tagged photos");
ok(spooky.photos.some((p) => p.src.endsWith("/p2.jpg")) && spooky.photos.every((p) => !p.src.endsWith("/p1.jpg") && !p.src.endsWith("/p3.jpg") && p.source !== "google"), "Spooktacular keeps only its tagged photos");

// 5. fail closed: missing store row, throwing store, unmapped haunt
const none = await withHauntPhotos(model, { read: async () => null, readVault: async () => [] });
for (const h of none.haunts) ok(h.photos.length === (h.photo ? 1 : 0), h.id + " got a photo from nowhere");
const boom = await withHauntPhotos(model, { read: async () => { throw new Error("store down"); }, readVault: async () => { throw new Error("vault down"); } });
for (const h of boom.haunts) ok(h.photos.length === (h.photo ? 1 : 0), h.id + " store failure leaked a photo");
const unmapped = await withHauntPhotos({ haunts: [{ id: "notMapped", name: "X", photo: null }] }, { read: async () => google("ChIJabcdefghij", "Jane"), readVault: async () => [vault(1)] });
ok(unmapped.haunts[0].photos.length === 0, "unmapped haunt never borrows a photo");

// 6. exact venue: every mapped place id is a well formed Google id and the passed id is the mapped one
const seenIds = [];
await withHauntPhotos(model, { read: async (id) => { seenIds.push(id); return null; }, readVault: async () => [] });
ok(seenIds.every((id) => Object.values(HAUNT_GOOGLE_PLACE).includes(id)), "reads only mapped place ids");
ok(placeId("howlTampa") === "ChIJhRo4DU_GwogRUgjhMAj-pag", "Busch Gardens id unchanged");

// 7. 2026-10-29 photo truth: restaurant and wrong park shots never reach a card
const hhnVault = (id) => ({ url: "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJvRBCrN9-54gRGZuuaCLGrQE/" + id + ".jpg", attribution_text: "Someone, CC BY", source_ref: "File:Universal " + id + ".jpg", width: 1280, height: 853 });
const restaurants = [
  vault(21, "File:Big Fire restaurant CityWalk.jpg"), vault(22, "Fat Tuesday daiquiri bar.jpg"), vault(23, "Rock the Universe karaoke night.jpg"), vault(24, "CityWalk plaza.jpg"), vault(25, "Islands of Adventure Hulk.jpg"),
];
for (const r of restaurants) ok(vaultStripPhoto({ name: "Halloween Horror Nights" }, r) === null, "a restaurant or other park picture is refused by its source name: " + r.source_ref);
ok(vaultStripPhoto({ name: "Halloween Horror Nights" }, vault(26, "File:Terrifier house.jpg")) !== null, "control: a normal haunt picture is kept");
ok(HAUNT_PHOTO_BLOCK.hhn.length === 2 && hauntPhotoBlocked("hhn", "https://abc.supabase.co/storage/v1/object/public/place-photos/ChIJvRBCrN9-54gRGZuuaCLGrQE/30ea7656d2b58f51f6fb855e.jpg") && hauntPhotoBlocked("hhn", "https://abc.supabase.co/x/17665bfac0bb5abe4505e5ff.jpg?v=1"), "the two viewed HHN pictures (CityWalk storefronts, Islands of Adventure) are blocked by file id");
ok(!hauntPhotoBlocked("howlTampa", "https://abc.supabase.co/x/30ea7656d2b58f51f6fb855e.jpg") && !hauntPhotoBlocked("hhn", "https://abc.supabase.co/x/6715e50305d5a16b.jpg"), "control: the block is per card and per file");
const hhnRun = await withHauntPhotos(model, { read: async () => null, readVault: async (id) => (id === HAUNT_GOOGLE_PLACE.hhn ? [hhnVault("30ea7656d2b58f51f6fb855e"), hhnVault("17665bfac0bb5abe4505e5ff"), hhnVault("6715e50305d5a16b")] : []) });
const hhnPhotos = hhnRun.haunts.find((h) => h.id === "hhn").photos;
ok(hhnPhotos.length === 2 && !hhnPhotos.some((p) => /30ea7656|17665bfa/.test(p.src)) && hhnPhotos.some((p) => /6715e50305d5a16b/.test(p.src)), "HHN keeps the owned photo plus the good vault photo, drops the blocked two");
ok(!("sideshowObscura" in HAUNT_GOOGLE_PLACE) && !model.haunts.some((h) => h.id === "sideshowObscura"), "the Sideshow Obscura store has no card and no photo map entry");

console.log("test-haunt-photos: " + checks + " checks passed");
