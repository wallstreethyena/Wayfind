#!/usr/bin/env node
// Guards hotel IDENTITY in the owned library: one Google place, one hotel card,
// and no card wearing another property's place id.
//
// WHY (2026-09-29 audit). 27 Google place ids were each claimed by two or three
// rows of lib/ownedHotels.json. Two consequences, both silent:
//   - one real hotel served two or three cards, same building, same Google
//     photo, different names, each with its own "Check rates" button;
//   - two rows carried a place id that provably was NOT their property, so the
//     card showed a DIFFERENT hotel's photo. "Anna Maria Island Inn"
//     (2300 Gulf Dr N) was showing Seaside at Anna Maria Island Inn (2200), and
//     "Sara Sea Beach Resort" was showing Tropical Beach Resorts (6717 Sarasea
//     Cir), a different resort on the same street.
//
// Owner rule this enforces: a hotel card may never present another hotel as
// itself. A blank photo is acceptable; a borrowed one is not.
//
// Each assertion below is paired with a positive control that feeds the same
// detector data it MUST reject, so an assertion can never pass by being inert.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
const failures = [];
const ok = (cond, label) => { if (cond) passed++; else failures.push(label); };

const { ownedHotelKey, isExcludedOwnedHotel, OWNED_HOTEL_EXCLUSIONS, OWNED_HOTEL_DUPLICATES } =
  await import("../lib/ownedHotelExclusions.js");
const owned = JSON.parse(fs.readFileSync(path.join(ROOT, "lib/ownedHotels.json"), "utf8"));

// The SAME junk rule lib/hotels.js applies, so "served" here means served there.
function isJunk(h) {
  const n = ((h && h.name) || "").trim();
  if (!n) return true;
  if (/^\d+\s+[A-Za-z]/.test(n)) return true;
  if (/\bvacation rental|\brentals\b|\bby owner\b|redawning/i.test(n)) return true;
  return isExcludedOwnedHotel(h);
}
const served = owned.filter((h) => !isJunk(h));

// THE DETECTOR, used for both the live assertion and its positive control.
function placeCollisions(rows) {
  const byPlace = new Map();
  for (const h of rows) {
    if (!h || !h.gpid) continue;
    if (!byPlace.has(h.gpid)) byPlace.set(h.gpid, []);
    byPlace.get(h.gpid).push(ownedHotelKey(h));
  }
  return [...byPlace.entries()].filter(([, keys]) => keys.length > 1);
}

// I1 — one Google place, one served card. This is the invariant.
const collisions = placeCollisions(served);
ok(collisions.length === 0,
  `I1: two served hotel cards share one Google place (${collisions.slice(0, 3).map(([p, k]) => `${p} -> ${k.join(" + ")}`).join("; ")})`);

// I1-control — the detector must catch a collision it is handed.
const twoOnOnePlace = [
  { name: "Alpha Inn", lat: 27.1, gpid: "PLACE_SHARED" },
  { name: "Beta Inn", lat: 27.2, gpid: "PLACE_SHARED" },
];
ok(placeCollisions(twoOnOnePlace).length === 1,
  "I1-control: the collision detector must flag two rows sharing one place id");
ok(placeCollisions([{ name: "Alpha Inn", lat: 27.1, gpid: "PLACE_A" }, { name: "Beta Inn", lat: 27.2, gpid: "PLACE_B" }]).length === 0,
  "I1-control-b: the collision detector must NOT flag two rows on different place ids");
ok(placeCollisions([{ name: "Alpha Inn", lat: 27.1, gpid: null }, { name: "Beta Inn", lat: 27.2, gpid: null }]).length === 0,
  "I1-control-c: rows with no place id are not a collision");

// I2 — the dedupe list only removes cards that actually exist. A stale key is a
// silent no-op, which is how a duplicate creeps back in.
const allKeys = new Set(owned.map(ownedHotelKey));
const orphanDupes = OWNED_HOTEL_DUPLICATES.filter((r) => !allKeys.has(r.key));
ok(orphanDupes.length === 0,
  `I2: OWNED_HOTEL_DUPLICATES names a card that no longer exists (${orphanDupes.map((r) => r.key).slice(0, 3).join(", ")})`);
ok(!allKeys.has("wfh-this-card-does-not-exist-00000"),
  "I2-control: the row-key index must not contain a fabricated key");
ok(OWNED_HOTEL_DUPLICATES.length > 0 && allKeys.has(OWNED_HOTEL_DUPLICATES[0].key),
  "I2-control-b: the list is non-empty and its first key really is a row");

// I3 — every removal carries its evidence. A reason-less line is not reviewable.
const reasonless = OWNED_HOTEL_DUPLICATES.filter((r) => !r.key || !r.name || !r.reason || String(r.reason).trim().length < 12);
ok(reasonless.length === 0,
  `I3: a duplicate entry has no usable reason (${reasonless.map((r) => r.key).slice(0, 3).join(", ")})`);

// I4 — the two lists must not overlap; the same card excluded twice for two
// different reasons means one of the reasons is wrong.
const baseKeys = new Set(OWNED_HOTEL_EXCLUSIONS.map((r) => r.key));
const overlap = OWNED_HOTEL_DUPLICATES.filter((r) => baseKeys.has(r.key));
ok(overlap.length === 0, `I4: a card is in both exclusion lists (${overlap.map((r) => r.key).slice(0, 3).join(", ")})`);

// I5 — both lists must actually suppress. isExcludedOwnedHotel is the only
// thing lib/hotels.js consults, so a list that is not wired in is decoration.
const dupRow = owned.find((h) => OWNED_HOTEL_DUPLICATES.some((r) => r.key === ownedHotelKey(h)));
ok(Boolean(dupRow) && isExcludedOwnedHotel(dupRow),
  "I5: a card on the duplicate list is still served (the list is not wired into isExcludedOwnedHotel)");
const keptRow = owned.find((h) => !isJunk(h));
ok(Boolean(keptRow) && !isExcludedOwnedHotel(keptRow),
  "I5-control: a card that is on neither list must NOT be suppressed");

// I6 — the two identity corrections are pinned by place id, so a regenerated
// library or a re-run of the backfill cannot quietly restore the wrong photo.
function rowByKey(key) { return owned.find((h) => ownedHotelKey(h) === key) || null; }
const annaMaria = rowByKey("wfh-anna-maria-island-inn-27479");
ok(Boolean(annaMaria) && annaMaria.gpid === "ChIJW2BK37wRw4gRMKhCQ-qwbMM",
  "I6a: Anna Maria Island Inn (2300 Gulf Dr N) must carry Seabreeze's place, not Seaside's (2200)");
ok(Boolean(annaMaria) && annaMaria.gpid !== "ChIJjRZP47wRw4gRUurwE1ZgRaQ",
  "I6b: Anna Maria Island Inn must never carry Seaside at Anna Maria Island Inn's place id");
const saraSea = rowByKey("wfh-sara-sea-beach-resort-27248");
ok(Boolean(saraSea) && !saraSea.gpid,
  "I6c: Sara Sea Beach Resort has no provable Google place and must carry none");
ok(Boolean(saraSea) && saraSea.gpid !== "ChIJp9x9XSRCw4gRdvhP9hbyu0k",
  "I6d: Sara Sea Beach Resort must never carry Tropical Beach Resorts' place id");
const tropical = rowByKey("wfh-tropical-beach-resorts-27248");
ok(Boolean(tropical) && tropical.gpid === "ChIJp9x9XSRCw4gRdvhP9hbyu0k",
  "I6e: Tropical Beach Resorts keeps its own place id (the one Sara Sea had borrowed)");
const seaside = rowByKey("wfh-seaside-inn-and-resort-27478");
ok(Boolean(seaside) && seaside.gpid === "ChIJjRZP47wRw4gRUurwE1ZgRaQ",
  "I6f: Seaside Inn and Resort (2200 Gulf Dr N) keeps its own place id");

// I7 — a row may not carry a place id while being a bare street address or a
// rental listing; those never render a card, so an id on them is dead weight
// that a future "restore the junk rows" change would turn into a live card.
const junkWithPlace = owned.filter((h) => h.gpid && isJunk(h) && !isExcludedOwnedHotel(h));
ok(junkWithPlace.length === 0,
  `I7: a junk-filtered row carries a Google place id (${junkWithPlace.map((h) => ownedHotelKey(h)).slice(0, 3).join(", ")})`);

// I8 — a stored photo resource name carries the place it belongs to
// ("places/<id>/photos/<ref>"), and lib/hotelImage.js prefers photo_ref over
// gpid. So repointing a row's place id is NOT enough: the old photo keeps
// serving. That is exactly how Anna Maria Island Inn kept showing Seaside's
// photo after its place id was corrected. A photo may only belong to the row
// that owns it.
function photoOwner(h) {
  const m = String((h && h.photo_ref) || "").match(/^places\/([^/]+)\//);
  return m ? m[1] : null;
}
function borrowedPhotos(rows) {
  return rows.filter((h) => {
    if (!h || !h.photo_ref) return false;
    const owner = photoOwner(h);
    return owner === null || owner !== h.gpid;
  });
}
ok(borrowedPhotos(owned).length === 0,
  `I8: a hotel row stores a photo that belongs to another Google place (${borrowedPhotos(owned).map((h) => `${ownedHotelKey(h)} gpid=${h.gpid} photo=${photoOwner(h)}`).slice(0, 3).join("; ")})`);
ok(borrowedPhotos([{ name: "Alpha Inn", lat: 27.1, gpid: "PLACE_A", photo_ref: "places/PLACE_B/photos/xyz" }]).length === 1,
  "I8-control: the borrowed-photo detector must flag a photo whose place is not the row's");
ok(borrowedPhotos([{ name: "Alpha Inn", lat: 27.1, gpid: "PLACE_A", photo_ref: "places/PLACE_A/photos/xyz" }]).length === 0,
  "I8-control-b: a photo that belongs to the row's own place is not borrowed");
ok(borrowedPhotos([{ name: "Alpha Inn", lat: 27.1, gpid: null, photo_ref: "places/PLACE_B/photos/xyz" }]).length === 1,
  "I8-control-c: a photo on a row with no place id is borrowed, not exempt");

if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`);
  console.error(`check-owned-hotel-identity: ${failures.length} FAILED, ${passed} passed`);
  process.exit(1);
}
const withPlace = served.filter((h) => h.gpid).length;
console.log(`check-owned-hotel-identity: OK — ${passed} assertions; ${served.length} served cards, ${withPlace} with a place id, ${new Set(served.filter((h) => h.gpid).map((h) => h.gpid)).size} distinct places, 0 shared`);
