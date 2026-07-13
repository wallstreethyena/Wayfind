// test-seed — the pure seeder core (lib/seedPlaces.js). Fixtures are shaped like
// the REAL searchNearby output verified via the v6.06 probe: Walmart comes back
// under the "food" net (primaryType department_store), Siesta Beach has no beach
// type, Mote is a research_institute. The rules under test are the owner's:
// re-classify by the place's OWN types (not the fetch group), flag name-recovered
// and non-operational rows for review, force anchor categories, and report every
// unclassifiable place as a full failure rather than a count.
import { buildInventoryRow, reconcile, computeDiff, metroGrid, categoryCounts, extractPlaceFields, METRO_BOUNDS } from "../lib/seedPlaces.js";

const NOW = "2026-07-13T00:00:00.000Z";
const M = "manatee-sarasota";
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; if (!c) console.log("FAIL " + n); };

const P = (over) => ({ id: "g_" + (over.name || "x"), displayName: { text: over.name }, location: { latitude: 27.4, longitude: -82.5 }, rating: 4.5, userRatingCount: 1000, businessStatus: "OPERATIONAL", types: [], ...over, displayName: { text: over.name } });

// ── re-classification: a place found under the FOOD net but typed department_store
// must land in SHOPPING (the group is only a discovery net). ──
{
  const r = buildInventoryRow(P({ name: "Walmart Supercenter", primaryType: "department_store", types: ["department_store", "grocery_store"] }), M, { nowIso: NOW });
  ok("Walmart (found under food) -> shopping, not food", r.row && r.row.category === "shopping");
  ok("Walmart via primaryType, not flagged", r.row && r.row.via === "primaryType" && r.row.needs_review === false && r.row.last_verified_at === NOW);
}

// ── Selby: real types -> attractions, verified (not review). ──
{
  const r = buildInventoryRow(P({ name: "Marie Selby Botanical Gardens", primaryType: "botanical_garden", types: ["botanical_garden", "tourist_attraction", "museum"] }), M, { nowIso: NOW });
  ok("Selby -> attractions, verified", r.row && r.row.category === "attractions" && r.row.needs_review === false && r.row.last_verified_at === NOW);
  ok("Selby tag outdoors present", r.row && r.row.tags.includes("outdoors"));
}

// ── Siesta Beach: recovered by NAME -> beach BUT flagged for review, unverified. ──
{
  const r = buildInventoryRow(P({ name: "Siesta Beach", primaryType: null, types: ["point_of_interest", "establishment"] }), M, { nowIso: NOW });
  ok("Siesta -> beach via name", r.row && r.row.category === "beach" && r.row.via === "name");
  ok("Siesta name-recovered => needs_review + last_verified_at null (flags, never decides)", r.row && r.row.needs_review === true && r.row.last_verified_at === null);
}

// ── anchor forces category the mapper could never derive (Mote = research_institute). ──
{
  const r = buildInventoryRow(P({ name: "Mote Marine Laboratory & Aquarium", primaryType: "research_institute", types: ["research_institute"] }), M, { anchor: { category: "attractions", tags: ["family"] }, nowIso: NOW });
  ok("Mote anchor -> forced attractions (mapper would return null)", r.row && r.row.category === "attractions" && r.row.anchor === true);
  ok("Mote anchor verified, not review", r.row && r.row.needs_review === false && r.row.last_verified_at === NOW && r.row.via === "anchor");
}

// ── non-operational is never silently seeded: flagged + surfaced. ──
{
  const r = buildInventoryRow(P({ name: "Old City Island Mote", primaryType: "aquarium", types: ["aquarium"], businessStatus: "CLOSED_PERMANENTLY" }), M, { nowIso: NOW });
  ok("closed place -> needs_review + unverified + nonOperational flag", r.row && r.row.needs_review === true && r.row.last_verified_at === null && r.nonOperational === true);
}

// ── unclassifiable non-anchor -> NO row, a reconciliation failure with a reason. ──
{
  const r = buildInventoryRow(P({ name: "Mote Marine Laboratory", primaryType: "research_institute", types: ["research_institute"] }), M, { nowIso: NOW });
  ok("research_institute (no anchor) -> no row", r.row === null);
  ok("failure carries a reason to print", typeof r.reason === "string" && r.reason.length > 0);
}

// ── reconcile: dedup by place_id, keep richer, union tags, collect failures + review. ──
{
  const dupA = buildInventoryRow(P({ name: "Dup", primaryType: "restaurant", types: ["restaurant", "bakery"], userRatingCount: 100 }), M, { nowIso: NOW });
  const dupB = buildInventoryRow(P({ name: "Dup", primaryType: "restaurant", types: ["restaurant"], userRatingCount: 900 }), M, { nowIso: NOW });
  const siesta = buildInventoryRow(P({ name: "Siesta Beach", types: ["point_of_interest"] }), M, { nowIso: NOW });
  const failrow = buildInventoryRow(P({ name: "Lab", primaryType: "research_institute", types: ["research_institute"] }), M, { nowIso: NOW });
  const { rows, failures, review } = reconcile([dupA, dupB, siesta, failrow]);
  ok("reconcile dedups the two Dup rows to one", rows.filter((r) => r.name === "Dup").length === 1);
  ok("reconcile keeps the higher-review copy (900)", rows.find((r) => r.name === "Dup").signals.reviews === 900);
  ok("reconcile unions tags across copies", rows.find((r) => r.name === "Dup").tags.includes("dessert"));
  ok("reconcile collects the unclassifiable as a FULL failure", failures.length === 1 && failures[0].reason);
  ok("reconcile surfaces the review queue (Siesta)", review.some((r) => r.name === "Siesta Beach"));
}

// ── computeDiff: add / update / unchanged vs the current table. ──
{
  const selby = buildInventoryRow(P({ name: "Selby", primaryType: "botanical_garden", types: ["botanical_garden"], userRatingCount: 4000 }), M, { nowIso: NOW }).row;
  const existing = new Map([[selby.place_id, { ...selby, signals: { ...selby.signals, reviews: 3000 } }]]);
  const newRow = buildInventoryRow(P({ name: "Cafe", primaryType: "cafe", types: ["cafe"] }), M, { nowIso: NOW }).row;
  const same = buildInventoryRow(P({ name: "Selby", primaryType: "botanical_garden", types: ["botanical_garden"], userRatingCount: 3000 }), M, { nowIso: NOW }).row;
  const d1 = computeDiff([selby, newRow], existing);
  ok("diff: new place is an ADD", d1.add.some((r) => r.name === "Cafe"));
  ok("diff: Selby with changed reviews is an UPDATE", d1.update.some((r) => r.name === "Selby"));
  const d2 = computeDiff([same], existing);
  ok("diff: identical row is UNCHANGED", d2.unchanged === 1 && d2.add.length === 0 && d2.update.length === 0);
}

// ── grid tiles the metro (multiple overlapping cells, all in-bounds). ──
{
  const cells = metroGrid(M, 15, 11000);
  const b = METRO_BOUNDS[M];
  ok("grid produces multiple cells (single wide circle wouldn't cover it)", cells.length >= 6);
  ok("every cell is in-bounds and carries a radius", cells.every((c) => c.lat >= b.minLat - 0.2 && c.lat <= b.maxLat + 0.2 && c.radius === 11000));
  const finer = metroGrid(M, 8, 6000);
  ok("finer spacing => more cells", finer.length > cells.length);
}

// ── categoryCounts: the coverage signal. ──
{
  const rows = [{ category: "hotels" }, { category: "hotels" }, { category: "attractions" }];
  const c = categoryCounts(rows);
  ok("categoryCounts tallies per category", c.hotels === 2 && c.attractions === 1);
}

console.log(`\ntest-seed: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
console.log("test-seed: OK — re-classification, name-recovery flagging, anchor override, non-operational gate, dedup, diff, and grid all hold");
