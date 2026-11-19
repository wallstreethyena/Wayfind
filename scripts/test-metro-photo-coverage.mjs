// scripts/test-metro-photo-coverage.mjs — "this metro has photos" must mean a card can
// SERVE one, not that photo_ref is non-null.
//
// 2026-11-18: check-inventory-integrity counted photo_ref and printed "10 metros have
// ZERO photos". photo_ref is the places/<id>/photos/wfplacediscovery placeholder on
// 24,508 of 24,633 rows, so the count flagged nine one-row research venues and missed
// every large metro whose rows hold only the placeholder (Broward 19% servable).
// lib/metroPhotoCoverage.js is the corrected definition; this proves it by calling it,
// including the CONTROL the brief requires: a genuinely photoless market is flagged,
// and the old definition is shown to miss it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasOwnedPhoto, servablePlaceIds, metroPhotoCoverage, zeroPhotoMetros,
  overallCoverage, lowestCoverage, MARKET_MIN_ROWS, INTAKE_ONLY_MAX_ROWS,
} from "../lib/metroPhotoCoverage.js";

const PLACEHOLDER = (id) => `places/${id}/photos/wfplacediscovery`;
const gRows = (metro, n, prefix = "ChIJ") => Array.from({ length: n }, (_, i) => {
  const place_id = `${prefix}${metro}${i}`.padEnd(20, "x");
  return { place_id, metro, photo_ref: prefix === "wfadd_" ? null : PLACEHOLDER(place_id), signals: {} };
});
const ready = (row) => ({ place_id: row.place_id, state: "ready", storage_path: `${row.place_id}/x/y` });

// 1. CONTROL: a genuinely photoless market. Every row carries the placeholder ref, none has a stored photo.
const photoless = gRows("photolessville", MARKET_MIN_ROWS + 5);
const oldDefinitionPhotos = photoless.filter((r) => r.photo_ref).length;
assert.equal(oldDefinitionPhotos, photoless.length, "fixture: the OLD definition sees every row as having a photo (that is the defect being controlled)");
let cov = metroPhotoCoverage(photoless, servablePlaceIds([], []));
let zero = zeroPhotoMetros(cov);
assert.deepEqual(zero.market.map((m) => m.metro), ["photolessville"], "a photoless market must be flagged even though every row has a placeholder photo_ref");
assert.equal(cov[0].placeholderRef, photoless.length);
assert.equal(cov[0].servable, 0);

// 2. Same metro with one stored photo is not zero; a metro with real photos is silent.
const withStored = gRows("hasphotos", MARKET_MIN_ROWS + 5);
cov = metroPhotoCoverage(withStored, servablePlaceIds([ready(withStored[3])], []));
assert.equal(cov[0].servable, 1);
assert.equal(zeroPhotoMetros(cov).market.length, 0, "one servable photo takes a metro off the zero list");

// 3. Lane rules: only ready+path store rows and active, credited, file-backed free rows count.
const probe = gRows("lanes", 6);
const [a, b, c, d, e, f] = probe;
const ids = servablePlaceIds(
  [ready(a), { place_id: b.place_id, state: "pending", storage_path: "p" }, { place_id: c.place_id, state: "ready", storage_path: null }],
  [
    { place_id: d.place_id, status: "active", license: "CC BY 4.0", attribution_text: "A", attribution_url: "https://x.test", image_url: "https://x.test/i.jpg" },
    { place_id: e.place_id, status: "active", license: "CC BY 4.0", attribution_text: "", attribution_url: "https://x.test", image_url: "https://x.test/i.jpg" },
    { place_id: f.place_id, status: "rejected", license: "CC BY 4.0", attribution_text: "A", attribution_url: "https://x.test", image_url: "https://x.test/i.jpg" },
  ],
);
assert.deepEqual([...ids].sort(), [a.place_id, d.place_id].sort(), "ready store row and a fully credited active free row count; pending, pathless, uncredited and rejected do not");

// 4. Owned photos on the row count; the placeholder never does.
assert.equal(hasOwnedPhoto({ signals: { photos: [{ url: "/x.jpg" }] } }), true);
assert.equal(hasOwnedPhoto({ signals: { photo_gallery: [{}] } }), true);
assert.equal(hasOwnedPhoto({ photo_ref: PLACEHOLDER("ChIJabc"), signals: {} }), false, "photo_ref alone is not a photo");
assert.equal(hasOwnedPhoto({}), false);

// 5. Classification of the small keys the old check mislabelled as "metros with zero photos".
const intake = gRows("nampa-id", 1, "wfadd_");
const intake4 = gRows("dallas-fort-worth-tx", INTAKE_ONLY_MAX_ROWS - 1, "wfadd_");
const stray = gRows("pompano-beach-fl", 1);
const mixedSmall = [...gRows("mixed", 1, "wfadd_"), ...gRows("mixed", 1)];
zero = zeroPhotoMetros(metroPhotoCoverage([...intake, ...intake4, ...stray, ...mixedSmall], new Set()));
assert.deepEqual(zero.intake.map((m) => m.metro).sort(), ["dallas-fort-worth-tx", "nampa-id"], "wfadd_-only small keys are owner-intake research venues");
assert.deepEqual(zero.stray.map((m) => m.metro).sort(), ["mixed", "pompano-beach-fl"], "small keys holding a Google-id row are stray labels, not intake");
assert.equal(zero.market.length, 0);

// 6. Roll-ups and ordering.
const big = gRows("big", 200), small = gRows("small", 200);
cov = metroPhotoCoverage([...big, ...small], servablePlaceIds([...big.slice(0, 150), ...small.slice(0, 10)].map(ready), []));
assert.equal(overallCoverage(cov).servable, 160);
assert.equal(overallCoverage(cov).placeholderRef, 400, "placeholder refs are tallied separately from servable photos");
assert.deepEqual(lowestCoverage(cov).map((m) => m.metro), ["small", "big"], "lowest servable share first");

// 7. The live check actually uses it (calls, not mentions) and no longer counts photo_ref as a photo.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const check = strip(readFileSync(new URL("./check-inventory-integrity.mjs", import.meta.url), "utf8"));
assert.match(check, /import\s*\{[^}]*\bmetroPhotoCoverage\b[^}]*\}\s*from\s*"\.\.\/lib\/metroPhotoCoverage\.js"/, "check imports the coverage module");
for (const fn of ["metroPhotoCoverage", "servablePlaceIds", "zeroPhotoMetros"]) {
  assert.equal((check.match(new RegExp(`\\b${fn}\\(`, "g")) || []).length, 1, `${fn}( is called exactly once in the check`);
}
assert.doesNotMatch(check, /if\s*\(\s*r\.photo_ref\s*\)\s*m\.photos\+\+/, "the photo_ref-as-photo counter is gone");
assert.match(check, /wf_google_photo_store\?/, "the check reads the stored-photo lane");
assert.match(check, /wf_place_photo\?/, "the check reads the free-photo lane");

console.log("test-metro-photo-coverage: OK — control (placeholder-only market flagged; old definition sees 0 gaps), lane rules, owned photos, intake/stray split, roll-ups, and live-check wiring");
