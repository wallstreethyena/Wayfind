// lib/extraMiles.js — "Worth the Extra Miles": the long-distance tail of the
// homepage Worth the Drive rail. Lane E of the South Florida handoff.
//
// OWNER'S PRODUCT DECISION (2026-09-06/07), written here so nobody re-argues
// it in a diff: the Keys and the big South Florida parks are a DIFFERENT
// distance class from the 12–27 mile Worth the Drive rail. They render as a
// clearly separate tail AFTER the normal drive cards, under their own
// heading, and they never enter the ordinary distance scoring. The 27-mile
// rule does not move. This file is the whole data boundary: nothing in
// lib/railsData.js, lib/railSelect.js or buildDrivePool imports it, and it
// imports nothing from them. scripts/test-extra-miles.mjs proves both
// directions of that boundary and the band arithmetic.
//
// THE FIVE. A governed registry, not a search: exactly the five owned place
// ids the handoff approved. Each is OPERATIONAL in wf_inventory with an owned
// photo AND present in wf_place_ids, so /places/<id> is a real page (proof
// snapshot: scripts/fixtures/extra-miles-proof-2026-09-07.json, read from
// live tables 2026-09-07). No fuzzy matching, no opportunistic additions —
// adding a sixth means adding a proof row and clearing the guard. The copy
// is the reviewed Lane A editorial (docs/editorial/miami-fall-drive-2026-09-06/
// drive-park-editorial.json), never regenerated from a venue name.
//
// THE BAND is lib/worthTheDrive.js's DRIVE_BAND (30–180 mi). Anything ≤27 mi
// is the existing rail's business; 28–29 belongs to nobody (a deliberate gap
// — the two systems must never be able to claim the same row); 30 is admitted
// here; past 180 is rejected. Distances are measured from the READER.
import { DRIVE_BAND, haversineMi, driveLabel } from "./worthTheDrive.js";
import { cardImageSrc } from "./placePhoto.js";
import parkPack from "../docs/editorial/miami-fall-drive-2026-09-06/drive-park-editorial.json";

/** place_id → editorial id in the Lane A park pack. Frozen; exactly five. */
export const EXTRA_MILES_PLACE_IDS = Object.freeze({
  "ChIJM5Edegyx0IgRuF7SUFDyj5o": "everglades-coe",        // Ernest F. Coe Visitor Center
  "ChIJx_pUcNiK2YgR4JfT3ovTKIw": "everglades-shark-valley", // Shark Valley Visitor Center
  "ChIJK4Wkv7jb2YgRv7LTOSIRIRI": "biscayne-np",           // Biscayne National Park
  "ChIJrfjUyddl14gRpyfE65Uk9ug": "john-pennekamp",        // John Pennekamp Coral Reef State Park
  "ChIJxVcTIQ7i0IgRgYa6c5TNrgk": "bahia-honda",           // Bahia Honda State Park
});

export const EXTRA_MILES_BAND = Object.freeze({ minMi: DRIVE_BAND.nearMi, maxMi: DRIVE_BAND.farMi });
export const EXTRA_MILES_MAX_CARDS = 5;
export const EXTRA_MILES_TITLE = "Worth the Extra Miles";
export const EXTRA_MILES_SUB = "Farther than a day-trip rail should reach — and the reason to go anyway.";

const PACK = new Map((parkPack && Array.isArray(parkPack.parks) ? parkPack.parks : []).map((p) => [p.id, p]));

/** The reviewed editorial for one of the five, or null (never a made-up line). */
export function extraMilesEditorial(placeId) {
  const editorialId = EXTRA_MILES_PLACE_IDS[placeId];
  const p = editorialId ? PACK.get(editorialId) : null;
  if (!p) return null;
  return Object.freeze({
    name: p.name, hook: p.hook, whyGo: p.whyGo, knownFor: p.knownFor, funFact: p.funFact,
    officialWebsite: p.officialWebsite,
  });
}

export function inExtraMilesBand(distMi) {
  return Number.isFinite(distMi) && distMi >= EXTRA_MILES_BAND.minMi && distMi <= EXTRA_MILES_BAND.maxMi;
}

/**
 * The selector. Pure. `rows` are owned wf_inventory rows (place_id, name, lat,
 * lng, photo_ref, status, excluded) — the caller reads them; this never does
 * I/O. `hasPlacePage(place_id)` is the caller's proof that /places/<id> exists
 * (wf_place_ids); a row without it is NOT eligible, whatever else is true.
 *
 * Admission, in order: registered id · operational, not excluded · owned
 * photo · real place page · coordinates · reader distance inside the band ·
 * seen once. Output is sorted nearest-first and capped.
 */
export function extraMilesFrom(origin, rows, hasPlacePage, opts = {}) {
  if (!origin || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return [];
  const max = Number.isFinite(opts.max) ? opts.max : EXTRA_MILES_MAX_CARDS;
  const pageOk = typeof hasPlacePage === "function" ? hasPlacePage : () => false;
  const seen = new Set();
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !r.place_id || !(r.place_id in EXTRA_MILES_PLACE_IDS)) continue;
    if (seen.has(r.place_id)) continue;
    if (r.status && r.status !== "OPERATIONAL") continue;
    if (r.excluded) continue;
    if (!r.photo_ref) continue;
    if (!pageOk(r.place_id)) continue;
    if (!Number.isFinite(r.lat) || !Number.isFinite(r.lng)) continue;
    const distMi = haversineMi(origin.lat, origin.lng, r.lat, r.lng);
    if (!inExtraMilesBand(distMi)) continue;
    const ed = extraMilesEditorial(r.place_id);
    if (!ed) continue;
    seen.add(r.place_id);
    out.push({
      kind: "extra-miles",
      id: r.place_id,
      name: r.name || ed.name,
      title: ed.name,
      hook: ed.hook,
      whyGo: ed.whyGo,
      officialWebsite: ed.officialWebsite,
      href: `/places/${encodeURIComponent(r.place_id)}`,
      // The OWNED photo_ref through the one image path every card uses
      // (lib/placePhoto.cardImageSrc → /api/photo?ref=…). Measured on the
      // Lane E preview: `?place=<id>` 404s for these rows; `?ref=` serves.
      image: cardImageSrc(r, 640),
      lat: r.lat, lng: r.lng,
      distMi: Math.round(distMi),
      drive: driveLabel(distMi),
    });
  }
  out.sort((a, b) => a.distMi - b.distMi);
  return out.slice(0, max);
}
