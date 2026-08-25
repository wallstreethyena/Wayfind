#!/usr/bin/env node
/**
 * TreeUmph! Adventure Course — empty-slot lock.
 *
 * Owner-confirmed 2026-08-20 (live browser, no redirect):
 *   https://www.viator.com/tours/Sarasota/TreeUmph-Adventure-Course/d25738-22211P1
 *   H1 = "Sorry, this product is unavailable". No Book/price widget.
 *   Similar-experiences rail is other Sarasota tours — those must NOT be
 *   pinned onto TreeUmph.
 *
 * Until a live product page's H1/title names TreeUmph, the card stays
 * unpinned. Do not replace 22211P1 with a similar SKU.
 *
 * ASSERT ON THE CALL. Rank is untouched. Comments that name the dead SKU
 * are stripped before the absence check — otherwise the lock would fire
 * on the comment that records why the pin was removed.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PLACE_PARTNER_PICKS, placePartnerPick } from "../lib/placePartnerPicks.js";
import { SUMMER_UNIVERSE } from "../lib/summerUniverse.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEAD_SKU = "22211P1";
const TREEUMPH_NAME = "TreeUmph! Adventure Course";
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("  FAIL:", msg);
  }
}

function stripComments(src) {
  return String(src || "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const pick = placePartnerPick({ name: TREEUMPH_NAME });
assert(pick == null, `placePartnerPick({ name: "${TREEUMPH_NAME}" }) must be null (empty-slot); got ${JSON.stringify(pick)}`);
assert(
  placePartnerPick({ name: "TreeUmph Adventure Course" }) == null,
  "TreeUmph without bang is also empty — do not replace the dead SKU with a similar product",
);
assert(
  placePartnerPick({ name: "treeumph adventure course" }) == null,
  "TreeUmph case-fold is empty — exact-name matching is not a backdoor for 22211P1",
);

const src = readFileSync(join(ROOT, "lib/placePartnerPicks.js"), "utf8");
const code = stripComments(src);
assert(/\b173028P1\b/.test(code), "positive control: Shell Key 173028P1 is still a placePick offer id");
assert(
  !PLACE_PARTNER_PICKS.some((r) => String(r.offerId).toUpperCase() === DEAD_SKU),
  `${DEAD_SKU} is not a placePick offer id — that product is owner-confirmed unavailable`,
);
assert(
  !/placePick\(\s*"22211P1"/.test(code),
  `placePick("${DEAD_SKU}") must not appear in PLACE_PARTNER_PICKS`,
);

const entry = SUMMER_UNIVERSE.find((e) => e.key === "treeumph_zip");
assert(!!entry, "treeumph_zip remains an existing summer entry — we did not invent or delete the place");
assert(entry && entry.rank === 38, `treeumph_zip rank is still 38 (got ${entry && entry.rank}) — unpinning the hop must not change rank`);
assert(
  entry && entry.venue && entry.venue.name === TREEUMPH_NAME,
  `treeumph_zip venue name is still "${TREEUMPH_NAME}"`,
);

if (failed) {
  console.error(`FAIL test-treeumph-empty-slot (${failed})`);
  process.exit(1);
}
console.log("OK test-treeumph-empty-slot — TreeUmph empty-slot CALLED; 22211P1 not pinned; rank 38 untouched");
