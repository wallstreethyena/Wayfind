// scripts/check-subfilter-experience-coverage.mjs
//
// v6.99 (owner: "spa and wellness links make no sense... i need affiliate
// links for the menu they belong to... this needs to be an universal rule").
// Root cause: SUBFILTERS.attractions (lib/google.js) had a "spa" chip with no
// matching entry in the chip->inventory map, so the map fell back to "all" and
// UnifiedBrowseCommerceRail served the generic all-attractions bookable rail
// (kayak/manatee/dolphin tours) under the Spa & Wellness tab.
//
// 2026-08-02 — REWRITTEN FROM TEXT-MATCHING TO CALLING. The previous version
// regexed `const SUB_TO_EXP = {...}` out of app/home.js and asserted that every
// chip id appeared as a key. That check ran, read real content, and answered
// the wrong question (CLAUDE.md, "the identifier must play its ROLE"): it went
// green on all three of the defects that were actually shipping, because a key
// being PRESENT says nothing about what it RESOLVES TO.
//
//   - `tours: "all"` was present and served the entire catalogue.
//   - `outdoors: "adventure"` was present and silently dropped the nature and
//     kayaking catalogues (35 + 37 Sarasota products the chip never showed).
//   - the live-search fallback reused the catalogue KEY as search text, so a
//     market with no theme-park inventory searched Viator for "Sarasota theme".
//
// The map now lives in lib/browseCommerceMap.js precisely so this guard can
// import and INVOKE it, and the chip filter is exported pure from
// lib/experiencesServe.js so the widening bug can be exercised against real row
// shapes rather than inferred from source.
import { readFileSync } from "fs";
import { CHIP_COMMERCE, chipCommerce, chipSearchQuery } from "../lib/browseCommerceMap.js";
import { filterByChip } from "../lib/experiencesServe.js";
import { CATEGORY_BY_KEY, SELLING_OUT_KEY } from "../lib/experiencesData.js";

let pass = 0;
const fail = (m) => { console.error("check-subfilter-experience-coverage: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

// ── the chip list, still read from lib/google.js (its own source of truth) ──
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
const attrBlockMatch = google.match(/attractions:\s*\[([\s\S]*?)\n\s*\],\s*\n\s*beach:/);
ok(!!attrBlockMatch, "SUBFILTERS.attractions block is present and parseable in lib/google.js");
const attrIds = [...attrBlockMatch[1].matchAll(/\{\s*id:\s*"([a-z]+)"/g)].map((m) => m[1]);
ok(attrIds.length >= 8, `found a plausible number of attractions sub ids (got ${attrIds.length})`);
// POSITIVE CONTROL: a check that finds nothing reports clean, so prove the
// scrape actually located the chips we know exist before trusting any count.
for (const known of ["all", "museums", "spa", "tours"]) {
  ok(attrIds.includes(known), `positive control: the known "${known}" chip was found by the SUBFILTERS scrape`);
}

// ── 1. every chip resolves, and none resolves by accident ──────────────────
for (const id of attrIds) {
  const plan = chipCommerce(id);
  ok(plan.known, `SUBFILTERS.attractions id "${id}" has its own entry in CHIP_COMMERCE (an unknown chip falls back to the full catalogue, which is the spa bug)`);
  ok(typeof plan.query === "string" && plan.query.trim().length > 0, `chip "${id}" declares a live-search query`);
  // The fallback query must be human search text, never a catalogue key —
  // that is what made an empty market search Viator for "Sarasota theme".
  ok(!CATEGORY_BY_KEY[plan.query.trim()], `chip "${id}" search query is human text, not the catalogue key "${plan.query}"`);
  // catalogParam of "" would be read as "all" by app/api/experiences/route.js's
  // `sp.get("cat") || "all"` default — the exact silent widening this guards.
  ok(plan.catalogParam === null || (typeof plan.catalogParam === "string" && plan.catalogParam.length > 0),
     `chip "${id}" never emits an empty cat= (got ${JSON.stringify(plan.catalogParam)}), which the API route would widen back to "all"`);
}

// ── 2. serving the WHOLE catalogue must be declared, never inherited ───────
for (const id of Object.keys(CHIP_COMMERCE)) {
  const spec = CHIP_COMMERCE[id];
  const plan = chipCommerce(id);
  if (plan.fullCatalog) {
    ok(typeof spec.fullCatalogReason === "string" && spec.fullCatalogReason.length > 30,
       `chip "${id}" serves the FULL catalogue and must state why in fullCatalogReason (a chip showing everything is a product decision, not a default)`);
  } else {
    ok(!spec.fullCatalogReason, `chip "${id}" does not serve the full catalogue, so it must not carry a fullCatalogReason`);
  }
}

// ── 3. no catalogue key is silently dropped as a typo ─────────────────────
for (const id of Object.keys(CHIP_COMMERCE)) {
  const declared = CHIP_COMMERCE[id].catalogs;
  if (declared === null) continue;
  const plan = chipCommerce(id);
  ok(plan.catalogs.length === declared.length,
     `chip "${id}" names only real catalogues — "${declared.filter((k) => !CATEGORY_BY_KEY[k]).join(", ") || "(none)"}" is not in lib/experiencesData CATEGORIES, and a dropped key reads as "no local inventory", which is a lie this guard could not otherwise see`);
}

// ── 4. the filter itself, CALLED against real row shapes ──────────────────
const ROWS = [
  { product_code: "a", categories: ["nature"], selling_out: false },
  { product_code: "b", categories: ["kayaking", "adventure"], selling_out: true },
  { product_code: "c", categories: ["museums"], selling_out: false },
  { product_code: "d", categories: ["water"], selling_out: false },
];
ok(filterByChip(ROWS, "all").length === 4, "filterByChip: 'all' returns every row");
ok(filterByChip(ROWS, SELLING_OUT_KEY).length === 1, "filterByChip: the demand chip filters to selling_out rows");
ok(filterByChip(ROWS, "museums").length === 1, "filterByChip: a single catalogue key filters to that catalogue");
// THE SPA BUG, exercised rather than described.
ok(filterByChip(ROWS, "spa").length === 0, "filterByChip: an unknown key returns ZERO rows, not every row (the spa bug)");
ok(filterByChip(ROWS, "spa,wellness").length === 0, "filterByChip: a list of only-unknown keys returns zero rows");
// THE UNION, which the old single-key map could not express.
ok(filterByChip(ROWS, "nature,adventure,kayaking").length === 2, "filterByChip: a comma-joined list unions its catalogues");
ok(filterByChip(ROWS, "museums,water").length === 2, "filterByChip: union spans non-adjacent catalogues");
// A real key beside a junk key must still filter, not widen.
ok(filterByChip(ROWS, "museums,spa").length === 1, "filterByChip: a real key beside an unknown one filters to the real one and does not widen");

// ── 5. the outdoors regression, stated concretely ─────────────────────────
const outdoors = chipCommerce("outdoors");
ok(outdoors.catalogs.includes("nature") && outdoors.catalogs.includes("kayaking") && outdoors.catalogs.includes("adventure"),
   "the Outdoors chip covers nature + adventure + kayaking (mapping it to `adventure` alone hid 35 nature and 37 kayaking Sarasota products)");
ok(filterByChip(ROWS, outdoors.catalogParam).length === 2, "the Outdoors chip's own catalogParam, run through the filter, picks up both nature and kayaking rows");

// ── 6. spa goes to search, not to a near-miss catalogue ───────────────────
const spa = chipCommerce("spa");
ok(spa.catalogs.length === 0 && spa.catalogParam === null,
   "the Spa chip declares NO table inventory, so the rail skips the table read entirely rather than filtering to an adjacent catalogue");
ok(/spa/i.test(chipSearchQuery("spa", "Sarasota")) && /Sarasota/.test(chipSearchQuery("spa", "Sarasota")),
   "the Spa chip's live search asks for spa in the user's city");
ok(/theme parks/.test(chipSearchQuery("family", "Sarasota")),
   "the Family chip searches human text ('family attractions and theme parks'), not the bare catalogue key 'theme'");

// ── 7. negative control: the assertions above can actually fail ───────────
// If this probe cannot detect a broken map, none of the greens above mean
// anything (CLAUDE.md §4d — prove the probe finds a known positive first).
ok(chipCommerce("this-chip-does-not-exist").known === false,
   "negative control: an unregistered chip reports known:false so a forgotten chip cannot pass as configured");
ok(filterByChip(ROWS, "nature").length !== ROWS.length,
   "negative control: filtering by a real catalogue does NOT return every row (if it did, every assertion above would be vacuous)");

console.log(`check-subfilter-experience-coverage: OK — ${pass} assertions (${attrIds.length} attractions chips resolved by CALLING chipCommerce; filterByChip exercised against real rows for the spa-widening bug, the multi-catalogue union, and the typo'd-key case; full-catalogue chips must declare why)`);
