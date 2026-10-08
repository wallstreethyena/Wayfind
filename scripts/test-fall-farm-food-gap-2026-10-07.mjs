// scripts/test-fall-farm-food-gap-2026-10-07.mjs
//
// Owner, 2026-10-07: "make sure we have more place cards on pumpkin patches and
// farms; fall drinks and seasonal bites are also light." Measured on production
// that day: Sarasota showed 3 farm cards, Venice/North Port/Fort Myers/Naples 1,
// Port Charlotte 0; Fort Myers and Naples showed no fall food at all. The owner
// kept his Sept 25 farm-festival picks on the Festivals shelf ("keep them but
// find more farms"), so this guard ALSO locks that those five did not move.
// It calls the real rail composer, not a registry grep.
import assert from "node:assert/strict";
import { FALL_DISCOVERIES_2026 } from "../lib/fallDiscoveries2026.js";
import { FALL_FEATURED_FESTIVALS_2026 } from "../lib/fallFeaturedFestivals2026.js";
import { FALL_GAP_FILL_2026_10_07 } from "../lib/fallGapFill20261007.js";
import { fallEventRail, composeFallIntentRails, hasUpcomingFallOccurrence } from "../lib/fallIntentRails.js";
import { isTrusted } from "../lib/curatedEvents.js";
import { fallEventLive, FALL_PLACE_IDS, FALL_PLACE_RAIL, FALL_OFFERING_SOURCES } from "../lib/fallPool.js";
import { fallPlaceEvidenceCurrent } from "../lib/fallPlaceEvidence.js";
import { fallEventCardImageSrc } from "../lib/fallEventImage.js";

let n = 0;
const check = (name, fn) => { fn(); n += 1; console.log("  OK  " + name); };
const TODAY = "2026-10-07";

const OWNER_FESTIVAL_PICKS = [
  "fruitville-grove-pumpkin-2026",
  "hunsader-pumpkin-2026",
  "dakin-harvest-festival-2026",
  "keel-farms-harvest-days-2026",
  "frrm-pumpkin-patch-express-2026",
];
const NEW_FARMS = [
  "lakes-park-pumpkin-patch-fort-myers-2026",
  "north-port-pumpkin-plunge-2026",
  "utc-pumpkin-patch-sarasota-2026",
  "harvestmoon-fun-farm-fall-2026",
];
const NEW_FOOD = {
  "ChIJZ8KadeNB24gRum3dpNMxw_o": "Green Cup Café, Fort Myers",
  "ChIJu3xYVa1Bw4gRVyOM-seQnAs": "Sarasota Bakehouse",
};

const featured = new Map(FALL_FEATURED_FESTIVALS_2026.map((row) => [row.event_id, row]));
const registry = new Map([...FALL_DISCOVERIES_2026, ...FALL_GAP_FILL_2026_10_07].map((row) => [row.event_id, row]));

check("the owner's five farm-festival picks stay on the Festivals shelf (fallEventRail called)", () => {
  for (const id of OWNER_FESTIVAL_PICKS) {
    const row = featured.get(id) || registry.get(id);
    assert.ok(row, `${id} must still exist in a source registry (positive control)`);
    assert.equal(fallEventRail(row), "festivals", `${id} classified by the live classifier`);
  }
});

check("the new patches are trusted, dated, live, image-backed farm cards", () => {
  for (const id of NEW_FARMS) {
    const row = registry.get(id);
    assert.ok(row, `${id} present`);
    assert.ok(isTrusted(row), `${id} passes isTrusted`);
    assert.ok(fallEventLive(row, TODAY) && hasUpcomingFallOccurrence(row, TODAY), `${id} live on ${TODAY}`);
    assert.equal(fallEventRail(row), "farms");
    assert.match(String(row.place_id), /^ChIJ/, `${id} carries an exact owned venue identity`);
    assert.ok(fallEventCardImageSrc(row, 640, null), `${id} resolves a card image`);
    assert.match(String(row.official_event_url), /^https:\/\//);
  }
});

check("the thin markets gain farm cards without duplicating the festival picks", () => {
  const rows = [...FALL_DISCOVERIES_2026, ...FALL_FEATURED_FESTIVALS_2026, ...FALL_GAP_FILL_2026_10_07];
  const now = new Date("2026-10-07T18:00:00-04:00");
  const shelf = (lat, lng, railId) => new Set(composeFallIntentRails(rows, [], { lat, lng, today: TODAY, now })
    .rails.find((rail) => rail.id === railId).cards.map((card) => card.event_id));
  const sarasotaFarms = shelf(27.3364, -82.5307, "farms");
  assert.ok(sarasotaFarms.has("utc-pumpkin-patch-sarasota-2026") && sarasotaFarms.has("north-port-pumpkin-plunge-2026"), "Sarasota farms shelf carries UTC and North Port");
  for (const id of OWNER_FESTIVAL_PICKS) assert.ok(!sarasotaFarms.has(id), `${id} not duplicated onto farms`);
  assert.ok(shelf(26.6406, -81.8723, "farms").has("lakes-park-pumpkin-patch-fort-myers-2026"), "Fort Myers farms shelf carries Lakes Park");
  assert.ok(shelf(27.9506, -82.4572, "farms").has("harvestmoon-fun-farm-fall-2026"), "Tampa farms shelf carries HarvestMoon");
});

check("the two new food places are pool members with current official evidence", () => {
  for (const [id, label] of Object.entries(NEW_FOOD)) {
    assert.ok(FALL_PLACE_IDS[id], `${label} has a card take`);
    assert.equal(FALL_PLACE_RAIL[id], "food", `${label} is on Fall Drinks & Seasonal Bites`);
    assert.match(String(FALL_OFFERING_SOURCES[id]?.source), /^https:\/\//, `${label} cites its own site`);
    assert.ok(fallPlaceEvidenceCurrent(id, TODAY), `${label} evidence is current-season`);
  }
});

console.log(`test-fall-farm-food-gap-2026-10-07: ${n} checks passed`);
