// lib/metroRegions.js - the ONE place that says which wf_inventory.metro LABELS
// a coverage key reads. Pure, zero dependencies (node-testable, safe in any bundle).
//
// WHY. `wf_inventory.metro` was doing double duty: a place's accurate label AND
// the key a surface reads for coverage. 227 places labeled 'tampa' are really in
// St. Petersburg. Labels and discovery coverage must be separate: the 'tampa'
// COVERAGE KEY is the Tampa Bay region, so a surface keyed 'tampa' reads
// ['tampa','st-pete'] and is titled "Tampa Bay", never "Tampa". Relabeling a
// St. Pete place to 'st-pete' then loses no coverage and no St. Pete place is
// ever called Tampa.
//
// NOT here (on purpose): Tampa CITY landing pages (lib/landingInventory.js) are
// distance-only (17 mi, widening to 30 mi) and never read the metro column. Do not
// route them through this module; a region read there would bypass those caps.
//
// SQL TWIN: public.wf_metro_members(text) in
// supabase/migrations/20261009120000_wf_tampa_bay_region_readers.sql. Keep the
// member lists identical; scripts/check-tampa-bay-region.mjs fails on drift.

export const REGION_MEMBERS = Object.freeze({
  tampa: Object.freeze(["tampa", "st-pete"]),
});

const REGION_LABELS = Object.freeze({
  tampa: "Tampa Bay",
});

/** Labels a coverage key reads. A key with no region reads only itself. */
export function metroMembers(key) {
  const m = REGION_MEMBERS[key];
  return m ? [...m] : [key];
}

/** Visible name of a region coverage key ("Tampa Bay"); null for plain metros. */
export function regionLabel(key) {
  return REGION_LABELS[key] || null;
}

/** True when a row labeled `rowMetro` is covered by coverage key `key`. */
export function metroCovers(key, rowMetro) {
  return metroMembers(key).includes(rowMetro);
}

/** PostgREST value for a `metro` filter: `metro=${postgrestMetroFilter(key)}`. */
export function postgrestMetroFilter(key) {
  const m = metroMembers(key);
  return m.length === 1 ? `eq.${encodeURIComponent(m[0])}` : `in.(${m.map(encodeURIComponent).join(",")})`;
}
