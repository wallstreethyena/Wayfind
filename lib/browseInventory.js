// lib/browseInventory.js — HOME BROWSE CHIPS READ THE OWNED LIBRARY.
//
// THE DEFECT, live on gowayfind.com 2026-08-25 (owner, Parrish):
//   Food → Cafés   "That's all 1 food spot near Parrish."
//   Food → Lunch   two cards, #1 Keke's Breakfast Cafe tagged BREAKFAST.
//
// v8.49 already taught serveFromInventory to filter BEFORE rankInventory's
// cap, and _invAll already sends &sub=. Neither was on the Cafés/Lunch path.
// _fetchAt called searchPlaces() alone for every specific chip — Google Text
// Search, max 20, or a cache hit of whatever 20 (or 1 renderable) row last
// landed. Sparse-category then honestly printed "That's all 1". Honesty about
// a 1-card list is not a filled library.
//
// Same disease, fifth costume: identity ∩ anchor top-N is thin BY CONSTRUCTION
// because a Parrish café never cracks "best restaurants" top-20. Cured on the
// breakfast rail (v8.18) by buildIdentityPool over owned inventory. This module
// is that cure for the HOME MENU chips that have a membership contract.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//   · invent places, scrape Google into the library, or firehose atlas-build
//   · cap the cards (BROWSE_INVENTORY_N is a DB cost bound, not a shelf size)
//   · reorder by anything but the score the caller already applied
//   · widen chips with no contract (Delivery stays named debt in
//     check-sub-contracts — unioning unfiltered food would turn it into All)

import { SUB_ALLOW } from "./placeFilter.js";

/** Cost bound on the inventory read, matching nearbyPool's per-ring limit.
 *  Not a merchandising ceiling — every row that passes the identity competes. */
export const BROWSE_INVENTORY_N = 400;

/**
 * PURE. A specific chip with a SUB_ALLOW contract must widen from owned
 * inventory. "All" already unions _invAll. Chips declared category-wide
 * (no contract) must not, or they become a second All.
 */
export function browseChipUsesInventory(cat, sub) {
  const c = String(cat || "").toLowerCase();
  const s = String(sub || "").toLowerCase();
  if (!c || !s || s === "all") return false;
  return !!SUB_ALLOW[`${c}:${s}`];
}

/**
 * PURE. Inventory first, then any Google/FSQ rows the chip also fetched.
 * First writer wins on id, so a library row is never replaced by a lean
 * Google twin. No slice — the caller ranks.
 */
/** Activities → Beaches reads wf_inventory category=beach, not attractions. */
export function browseChipLibraryCat(cat, sub) {
  const c = String(cat || "").toLowerCase();
  const s = String(sub || "").toLowerCase();
  if ((c === "attractions" || c === "beach") && (s === "beaches" || (s === "all" && c === "beach"))) return "beach";
  return c;
}

export function mergeBrowseSources(inventoryRows, googleRows) {
  const seen = new Set();
  const out = [];
  for (const arr of [inventoryRows, googleRows]) {
    for (const p of arr || []) {
      if (!p || !p.id || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}
