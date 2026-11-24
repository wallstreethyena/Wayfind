// Guard: a hospitality place held for a sign only photo never renders a card
// (owner, 23 Nov 2026: empty beats a sign).
import assert from "node:assert/strict";
import { seasonalHospitalityPlaces, HOSPITALITY_SIGN_PHOTO_HOLDS } from "../lib/seasonalHospitality.js";
import { SEASONAL_HOSPITALITY_2026 } from "../lib/seasonalHospitalityCatalog2026.js";

const id = "ChIJQwikKNrjwogR734UinU6wVs";
assert.ok(HOSPITALITY_SIGN_PHOTO_HOLDS.has(id), "Bar Mezzo is held");
const entries = SEASONAL_HOSPITALITY_2026.filter((e) => e.place_id === id);
assert.ok(entries.length > 0, "Bar Mezzo is in the catalog");
const row = { place_id: id, name: "Bar Mezzo", lat: 27.77133, lng: -82.64946, status: "OPERATIONAL", photo_ref: "places/ChIJQwikKNrjwogR734UinU6wVs/photos/AbC123", signals: {} };
for (const today of ["2026-11-23", "2026-12-15"]) {
  const out = seasonalHospitalityPlaces([row], "christmas", today, entries, new Date(`${today}T12:00:00-05:00`));
  assert.equal(out.filter((c) => c.place_id === id).length, 0, `no Bar Mezzo card on ${today}`);
}
console.log("check-hospitality-sign-photo-holds: ok");
