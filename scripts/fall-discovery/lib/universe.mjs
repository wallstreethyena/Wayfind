// scripts/fall-discovery/lib/universe.mjs — the CANDIDATE UNIVERSE: live,
// OPERATIONAL, non-excluded wf_inventory rows in the covered metros that are
// plausibly seasonal. This module only READS wf_inventory (anon-readable —
// no service-role key required) and only DECIDES membership; it never edits
// lib/ files and never writes to Supabase.
import {
  isBarPlace, isBreakfastChip, isCafePlace, isDessertChip, isDinnerChip, isQuickBitePlace,
} from "../../../lib/chipIdentity.js";

// The metros the task brief names first, plus every other metro Wayfind's
// live inventory actually serves at meaningful volume (the `florida` bucket
// is the statewide catch-all many rows outside the named metro polygons use).
export const COVERED_METROS = Object.freeze([
  "tampa", "st-pete", "manatee-sarasota", "orlando", "miami-dade", "broward", "palm-beach", "florida",
]);

const FARM_HAUNT_RX = /\b(pumpkin\s*patch|corn\s*maze|hay\s*ride|orchard|haunt(?:ed)?|scream\s*park|fear\s*farm|ghost\s*tour)\b/i;
const FARM_TYPE_RX = /farm/i;
const BREWERY_RX = /\b(brewery|brewing|beer\s*garden|biergarten|cidery|meadery|distillery)\b/i;
const BAKERY_RX = /\b(bakery|bakeri|patisserie|donut|doughnut)\b/i;

function shapePlace(row) {
  return {
    name: row.name,
    types: Array.isArray(row.google_types) ? row.google_types : [],
    primaryType: row.primary_type,
    primary_type: row.primary_type,
    category: row.category,
  };
}

// Is this row PLAUSIBLY the kind of place that runs a fall/Halloween
// offering at all? This is a coarse, cheap gate — real acceptance still
// requires documented evidence via lib/fallEvidence.js. Uses the same chip
// identity used by the real product (lib/chipIdentity.js) for the food
// sub-types the task brief names, plus regex heuristics for the two
// identities Wayfind has no dedicated chip for (bars/breweries, farms/
// orchards/pumpkin patches/haunts — "attractions" has no farm sub-chip).
export function isPlausibleFallCandidate(row) {
  const hay = `${row.name || ""} ${(row.google_types || []).join(" ")} ${row.primary_type || ""}`;
  if (row.category === "food") {
    const shaped = shapePlace(row);
    return isCafePlace(shaped) || isBreakfastChip(shaped) || isDessertChip(shaped)
      || isDinnerChip(shaped) || isQuickBitePlace(shaped) || BAKERY_RX.test(hay);
  }
  if (row.category === "nightlife") {
    const shaped = shapePlace(row);
    return isBarPlace(shaped) || BREWERY_RX.test(hay);
  }
  if (row.category === "attractions") {
    return FARM_HAUNT_RX.test(hay) || (row.google_types || []).some((t) => FARM_TYPE_RX.test(String(t)));
  }
  return false;
}

const SELECT_COLUMNS = "place_id,name,lat,lng,category,secondary_categories,primary_type,google_types,metro,status,excluded";
const PAGE = 1000;

// Every OPERATIONAL, non-excluded row in the covered metros — paginated (see
// lib/curatedEvents.js's own comment on why a bare .limit() silently
// truncates once a table outgrows it; the same lesson applies here).
export async function fetchInventoryUniverse(supabase, { metros = COVERED_METROS } = {}) {
  let from = 0;
  const rows = [];
  for (;;) {
    const { data, error } = await supabase
      .from("wf_inventory")
      .select(SELECT_COLUMNS)
      .eq("status", "OPERATIONAL")
      .eq("excluded", false)
      .in("metro", metros)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`wf_inventory read failed: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

// A specific, small set of place_ids (the 17 registry members) regardless of
// metro/status/excluded — used for re-verification, where a CLOSED or
// EXCLUDED row is itself the finding (remove_closed), not something to
// filter out before we ever see it.
export async function fetchInventoryByIds(supabase, placeIds) {
  if (!placeIds || !placeIds.length) return [];
  const { data, error } = await supabase
    .from("wf_inventory")
    .select(SELECT_COLUMNS)
    .in("place_id", placeIds);
  if (error) throw new Error(`wf_inventory read-by-id failed: ${error.message}`);
  return data || [];
}
