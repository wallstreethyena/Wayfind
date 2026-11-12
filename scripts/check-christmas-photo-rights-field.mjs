#!/usr/bin/env node
// scripts/check-christmas-photo-rights-field.mjs: every Christmas card photo
// carries a rights_class (licensed / google_attributed / organizer_unverified /
// wayfind_owned / unknown), and a "licensed" photo always carries a licence and
// a source link. Asserts on the CALL: it runs photoRights, christmasStaticPhotos
// over every gallery id, the vault/tagged/google photo builders and
// christmasBrowseListings, then checks every photo they serve. Offline: the
// browse listings run on the seasonal catalog without database rows, so the
// event photo paths are covered through the gallery and builder calls.
import { photoRights, RIGHTS_CLASSES } from "../lib/photoRights.js";
import { christmasBrowseListings } from "../lib/christmasBrowse.js";
import { christmasStaticPhotos, christmasTaggedPhotos, CHRISTMAS_STATIC_GALLERY } from "../lib/christmasPlacePhotos.js";
import { christmasVaultPhoto, christmasGooglePhoto } from "../lib/christmasTickets.js";

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log("  FAIL:", m)); };
const ALLOWED = new Set(["licensed", "google_attributed", "organizer_unverified", "wayfind_owned", "unknown"]);
ok(RIGHTS_CLASSES.length === ALLOWED.size && RIGHTS_CLASSES.every((c) => ALLOWED.has(c)), "RIGHTS_CLASSES is exactly the five allowed classes");

// Controls on the pure function: each class is reachable, and the negatives hold.
const cls = (p) => photoRights(p).rights_class;
const HREF = "https://commons.wikimedia.org/wiki/File:X.jpg";
for (const lic of ["CC0", "CC BY 3.0", "CC BY 4.0", "CC BY-SA 3.0", "CC BY-SA 4.0", "PD", "Public Domain"]) {
  ok(cls({ src: "/place-photos/a.jpg", license: lic, credit: "Photo by A", creditHref: HREF }) === "licensed", `positive control: ${lic} with a source link is licensed`);
}
for (const lic of ["CC BY-NC 4.0", "CC BY-ND 2.0", "All rights reserved", "CC BY-NC-SA 3.0", ""]) {
  ok(cls({ src: "/place-photos/a.jpg", license: lic, credit: "Photo by A", creditHref: HREF }) !== "licensed", `negative control: "${lic}" is never licensed`);
}
ok(cls({ src: "/place-photos/a.jpg", license: "CC BY 4.0", credit: "Photo by A" }) === "organizer_unverified", "negative control: a licence with no source link is not licensed");
ok(cls({ src: "/api/photo/stored/abc?v=" + "a".repeat(64) }) === "google_attributed", "/api/photo URL is google_attributed");
ok(cls({ src: "/x.jpg", source: "google", credit: "Photo by B on Google Maps" }) === "google_attributed", "source google is google_attributed");
ok(cls({ src: "/place-photos/a.jpg", credit: "Photo by Organizer", source: "static" }) === "organizer_unverified", "credit without licence is organizer_unverified");
ok(cls({ src: "/events/christmas/a.jpg", source: "venue" }) === "wayfind_owned", "/events/ file is wayfind_owned");
ok(cls({ src: "/place-photos/a.jpg" }) === "unknown", "no credit, no licence, no source is unknown");
ok(cls(null) === "unknown" && cls(undefined) === "unknown" && cls("x") === "unknown", "non-object input is unknown, never a throw");

// Every served photo: class in the allowed set; licensed ones carry licence + source link.
let served = 0;
const byClass = {};
const check = (p, where) => {
  served++;
  ok(p && ALLOWED.has(p.rights_class), `${where}: rights_class "${p && p.rights_class}" is in the allowed set (${p && p.src})`);
  byClass[p && p.rights_class] = (byClass[p && p.rights_class] || 0) + 1;
  if (p && p.rights_class === "licensed") {
    const r = photoRights(p);
    ok(!!r.license && !!p.license, `${where}: licensed photo carries a license (${p.src})`);
    ok(/^https:\/\//.test(r.source_url || ""), `${where}: licensed photo carries a source_url (${p.src})`);
  }
};

const ids = Object.keys(CHRISTMAS_STATIC_GALLERY);
ok(ids.length > 100, `static gallery has ids to run (${ids.length})`);
for (const id of ids) {
  const photos = christmasStaticPhotos(id);
  ok(photos.length > 0, `christmasStaticPhotos(${id}) returned photos`);
  photos.forEach((p) => check(p, `static ${id}`));
}
ok((byClass.licensed || 0) > 0, "positive control: the static galleries serve at least one licensed photo");

// Builders for vault / tagged / google photos.
const row = { venue: "Venue", name: "Venue" };
const VAULT = "https://www.gowayfind.com/place-photos/batch-2026-11p/ev/xm_1.jpg";
const vault = christmasVaultPhoto(row, { url: VAULT, attribution_text: "Someone", attribution_url: HREF, license: "CC BY 4.0" });
ok(vault && vault.rights_class === "licensed", "vault photo with licence and source link is licensed");
check(vault, "vault");
const vaultPlain = christmasVaultPhoto(row, { url: VAULT, attribution_text: "Someone" });
ok(vaultPlain && vaultPlain.rights_class === "organizer_unverified", "vault photo without licence is organizer_unverified");
check(vaultPlain, "vault no licence");
const tagged = christmasTaggedPhotos("ev1", [{ christmas_keys: ["ev1"], url: VAULT, attribution_text: "Someone" }], "Venue");
ok(tagged.length === 1, "tagged builder returned the photo");
tagged.forEach((p) => check(p, "tagged"));
const google = christmasGooglePhoto(row, { source: "google", src: "/api/photo/stored/abc_1?v=" + "a".repeat(64), width: 800, height: 600, credit: { authors: [{ name: "Pat" }] } });
ok(google && google.rights_class === "google_attributed", "stored Google photo is google_attributed");
check(google, "google");

// Browse listings: every photo array entry and the image-only class.
const listings = christmasBrowseListings([], "2026-11-12");
ok(listings.length > 100, `christmasBrowseListings returned cards (${listings.length})`);
let withImage = 0;
for (const card of listings) {
  (card.photos || []).forEach((p) => check(p, `browse ${card.id}`));
  if (card.image) {
    withImage++;
    ok(ALLOWED.has(card.photo_rights_class), `browse ${card.id}: image carries photo_rights_class (${card.photo_rights_class})`);
  }
}
ok(withImage > 0, "browse listings include cards with an image to classify");
console.log(`check-christmas-photo-rights-field: ${served} photos and ${withImage} card images checked across ${ids.length} gallery ids + ${listings.length} listings; classes ${JSON.stringify(byClass)}; ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
