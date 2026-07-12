// v5.84 prebuild gate — the "Explore near you" menu ordering + copy contract.
// The 3:33 PM reorder is a product decision with an exact inclusive boundary;
// this locks it (and guards against the misleading-subline copy creeping back).
import { orderExploreMenu, EXPLORE_TILES, CUTOFF_MINUTES } from "../lib/exploreMenu.js";

let failures = 0;
const fail = (m) => { console.error("test-explore-menu: FAIL — " + m); failures++; };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); };

const DAY = ["today", "food", "shop", "stay", "night"];
const EVENING = ["today", "night", "food", "shop", "stay"];

// A Date at a given local wall-clock (device-tz path: tzOffset omitted).
const at = (h, m, s = 0) => new Date(2026, 6, 12, h, m, s);

// ── the exact boundary (product decision: 3:33 PM inclusive) ──
eq(orderExploreMenu(at(15, 32, 59)), DAY, "15:32:59 is still the daytime order");
eq(orderExploreMenu(at(15, 33, 0)), EVENING, "15:33:00 flips to the evening order (inclusive)");
eq(orderExploreMenu(at(15, 34)), EVENING, "15:34 is the evening order");
eq(orderExploreMenu(at(9, 0)), DAY, "morning is the daytime order");
eq(orderExploreMenu(at(23, 59)), EVENING, "late night is the evening order");
eq(orderExploreMenu(at(0, 0)), DAY, "midnight is the daytime order");

// ── never duplicate or drop a category during the reorder ──
for (const order of [orderExploreMenu(at(10, 0)), orderExploreMenu(at(18, 0))]) {
  if (order.length !== 5) fail("order must always have exactly 5 tiles: " + JSON.stringify(order));
  if (new Set(order).size !== 5) fail("order must not duplicate a tile: " + JSON.stringify(order));
  for (const k of DAY) if (!order.includes(k)) fail(`tile ${k} dropped from the order: ` + JSON.stringify(order));
  if (order[0] !== "today") fail("Today's Best must always be first: " + JSON.stringify(order));
}

// ── injected location offset drives the boundary, not the device clock ──
// now = 19:33 UTC. A location at UTC-4 reads 15:33 local -> evening (inclusive).
{
  const nowUtc = new Date(Date.UTC(2026, 6, 12, 19, 33, 0));
  eq(orderExploreMenu(nowUtc, -240), EVENING, "UTC-4 location at 15:33 local -> evening");
  const nowUtc2 = new Date(Date.UTC(2026, 6, 12, 19, 32, 0)); // 15:32 at UTC-4
  eq(orderExploreMenu(nowUtc2, -240), DAY, "UTC-4 location at 15:32 local -> daytime");
}

// ── the copy is benefit language, never a live/unverifiable claim ──
const BANNED = /\bstars?\b|\breviews?\b|open (right )?now|past midnight|miles? (out|away)|rated|\$\d/i;
for (const [k, t] of Object.entries(EXPLORE_TILES)) {
  if (!t.label || t.label.split(/\s+/).length !== 2) fail(`tile ${k} label must be two words: ${JSON.stringify(t.label)}`);
  if (!t.sub || BANNED.test(t.sub)) fail(`tile ${k} subline makes a live/unverifiable claim: ${JSON.stringify(t.sub)}`);
  if (!t.kind) fail(`tile ${k} missing an openCurated kind`);
}
if (CUTOFF_MINUTES !== 933) fail("cutoff must be 3:33 PM (933 minutes)");

if (failures) process.exit(1);
console.log("test-explore-menu: OK — 3:33 PM reorder is exact + inclusive, no dup/drop, copy is benefit-only");
