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
import { CONCEPTS } from "../lib/experienceConcepts.js";
import { filterByChip } from "../lib/experiencesServe.js";
import { CATEGORY_BY_KEY, SELLING_OUT_KEY } from "../lib/experiencesData.js";

let pass = 0;
const fail = (m) => { console.error("check-subfilter-experience-coverage: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

// ── the chip list, still read from lib/google.js (its own source of truth) ──
const google = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
// 2026-08-04 — scrapes EVERY category, not just attractions. The map used to
// cover the ten attractions sub-chips and nothing else, so Food, Nightlife,
// Shopping and Beach had no bookable rail at all and this guard could not see
// that they were missing: it only ever asked about the one category it knew.
const block = google.match(/export const SUBFILTERS = \{([\s\S]*?)\n\};/);
ok(!!block, "the SUBFILTERS object is present and parseable in lib/google.js");
const CHIPS = {};
{
  let current = null;
  for (const line of block[1].split("\n")) {
    const cat = line.match(/^\s{2}([a-z]+):\s*\[/);
    if (cat) { current = cat[1]; CHIPS[current] = []; continue; }
    const id = line.match(/\{\s*id:\s*"([a-z]+)"/);
    if (id && current) CHIPS[current].push(id[1]);
  }
}
const CATS = Object.keys(CHIPS);
ok(CATS.length >= 6, `found the browse categories (got ${CATS.length}: ${CATS.join(", ")})`);
// POSITIVE CONTROL: a scrape that finds nothing reports clean, so prove it
// located categories and chips we know exist before trusting any count.
for (const c of ["food", "nightlife", "attractions", "shopping"]) {
  ok(CATS.includes(c), `positive control: the known "${c}" category was found by the SUBFILTERS scrape`);
}
for (const [c, id] of [["attractions", "spa"], ["food", "dinner"], ["nightlife", "bars"]]) {
  ok((CHIPS[c] || []).includes(id), `positive control: "${c}:${id}" was found by the scrape`);
}
const attrIds = CHIPS.attractions || [];

// ── 1. every chip resolves, and none resolves by accident ──────────────────
for (const cat of CATS) for (const id of CHIPS[cat]) {
  const plan = chipCommerce(cat, id);
  ok(plan.known, `SUBFILTERS chip "${cat}:${id}" has its own entry in CHIP_COMMERCE (an unknown chip falls back to the full catalogue, which is the spa bug)`);
  ok(typeof plan.query === "string" && plan.query.trim().length > 0, `chip "${cat}:${id}" declares a live-search query`);
  // The fallback query must be human search text, never a catalogue key —
  // that is what made an empty market search Viator for "Sarasota theme".
  ok(!CATEGORY_BY_KEY[plan.query.trim()], `chip "${cat}:${id}" search query is human text, not a catalogue key ("${plan.query}")`);
  // catalogParam of "" would be read as "all" by app/api/experiences/route.js's
  // `sp.get("cat") || "all"` default — the exact silent widening this guards.
  ok(plan.catalogParam === null || (typeof plan.catalogParam === "string" && plan.catalogParam.length > 0),
     `chip "${cat}:${id}" never emits an empty cat= (got ${JSON.stringify(plan.catalogParam)}), which the API route would widen back to "all"`);
}

// ── 2. serving the WHOLE catalogue must be declared, never inherited ───────
for (const id of Object.keys(CHIP_COMMERCE)) {
  const spec = CHIP_COMMERCE[id];
  const [kc, ks] = id.split(":");
  const plan = chipCommerce(kc, ks);
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
  const [kc, ks] = id.split(":");
  const plan = chipCommerce(kc, ks);
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
const outdoors = chipCommerce("attractions", "outdoors");
ok(outdoors.catalogs.includes("nature") && outdoors.catalogs.includes("kayaking") && outdoors.catalogs.includes("adventure"),
   "the Outdoors chip covers nature + adventure + kayaking (mapping it to `adventure` alone hid 35 nature and 37 kayaking Sarasota products)");
ok(filterByChip(ROWS, outdoors.catalogParam).length === 2, "the Outdoors chip's own catalogParam, run through the filter, picks up both nature and kayaking rows");

// ── 6. spa goes to search, not to a near-miss catalogue ───────────────────
const spa = chipCommerce("attractions", "spa");
ok(spa.catalogs.length === 0 && spa.catalogParam === null,
   "the Spa chip declares NO table inventory, so the rail skips the table read entirely rather than filtering to an adjacent catalogue");
ok(/spa/i.test(chipSearchQuery("attractions", "spa", "Sarasota")) && /Sarasota/.test(chipSearchQuery("attractions", "spa", "Sarasota")),
   "the Spa chip's live search asks for spa in the user's city");
ok(/theme parks/.test(chipSearchQuery("attractions", "family", "Sarasota")),
   "the Family chip searches human text ('family attractions and theme parks'), not the bare catalogue key 'theme'");

// ── 7. negative control: the assertions above can actually fail ───────────
// If this probe cannot detect a broken map, none of the greens above mean
// anything (CLAUDE.md §4d — prove the probe finds a known positive first).
ok(chipCommerce("attractions", "this-chip-does-not-exist").known === false,
   "negative control: an unregistered chip reports known:false so a forgotten chip cannot pass as configured");
ok(filterByChip(ROWS, "nature").length !== ROWS.length,
   "negative control: filtering by a real catalogue does NOT return every row (if it did, every assertion above would be vacuous)");

// ── 8. CONCEPTS: the food fix, asserted on real behaviour ────────────────
// The owner ask: "if it's for food give me food tours". Viator has no food TAG,
// so this rides the derived concept — and the assertion has to prove the
// derived path actually selects food, not merely that a key exists.
const CROWS = [
  { product_code: "f1", title: "Sarasota Kayak and Food Tour", categories: ["kayaking"] },
  { product_code: "f2", title: "VIP Full Day Wineries Tour", categories: ["private"] },
  { product_code: "n1", title: "Haunted Pub Crawl Downtown", categories: ["historical"] },
  { product_code: "w1", title: "Clear Kayak Ecotour", categories: ["kayaking"] },
  { product_code: "w2", title: "Beer Can Island Boat Tour", categories: ["water"] },
];
const food = chipCommerce("food", "all");
ok(food.known, "the Food category has its own commerce plan");
ok(food.concepts.includes("food"), "the Food chip rides the derived `food` concept — Viator publishes no food tag");
ok(food.catalogParam === "concept:food", `the Food chip asks the serve layer for the food concept (got ${food.catalogParam})`);
const foodRows = filterByChip(CROWS, food.catalogParam);
ok(foodRows.length === 2, `the Food chip selects the food tours and nothing else (got ${foodRows.map((r) => r.product_code).join(",") || "none"})`);
ok(foodRows.every((r) => /Food Tour|Wineries/.test(r.title)), "every row the Food chip selects is genuinely a food tour");
// THE TRAP: "Beer Can Island" is a sandbar, not a brewery.
ok(!foodRows.some((r) => r.product_code === "w2"), "\"Beer Can Island Boat Tour\" is NOT served as food — a bare beer token would have matched it");
ok(!foodRows.some((r) => r.product_code === "w1"), "a kayak ecotour is not served as food");
const night = chipCommerce("nightlife", "bars");
ok(night.catalogParam === "concept:nightlife", "the Nightlife chips ride the nightlife concept");
ok(filterByChip(CROWS, night.catalogParam).map((r) => r.product_code).join(",") === "n1", "the Nightlife chip selects the pub crawl only");
// Every concept a chip names must be REAL, or it silently filters to zero and
// reads as "no local inventory" — a lie this guard could not otherwise see.
for (const id of Object.keys(CHIP_COMMERCE)) {
  for (const c of CHIP_COMMERCE[id].concepts || []) {
    ok(!!CONCEPTS[c], `chip "${id}" names a real concept ("${c}" is not in lib/experienceConcepts)`);
  }
}
// Every browse category must be reachable — this is the "everywhere" half.
for (const cat of CATS) {
  const plan = chipCommerce(cat, "all");
  ok(plan.known, `category "${cat}" has an "all" plan, so its rail can mount`);
  ok(typeof plan.query === "string" && plan.query.length > 3, `category "${cat}" has honest live-search text`);
}

const wired = Object.keys(CHIP_COMMERCE).length;
const withConcepts = Object.keys(CHIP_COMMERCE).filter((k) => (CHIP_COMMERCE[k].concepts || []).length).length;
console.log(`check-subfilter-experience-coverage: OK — ${pass} assertions (${CATS.length} browse categories, ${wired} chips wired, ${withConcepts} riding derived concepts; filterByChip exercised against real rows for the spa-widening bug, the multi-catalogue union, the typo'd-key case, and the food-concept path incl. the "Beer Can Island" trap)`);
