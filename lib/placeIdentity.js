// lib/placeIdentity.js - a place's IDENTITY is not its COVERAGE (2026-10-14).
//
// wf_inventory carries two different things that used to share one column:
//   metro            the coverage key a surface reads ("tampa" is the Tampa Bay
//                    region: lib/metroRegions.js reads tampa + st-pete)
//   locality, county where the place actually is (Census place and county)
//
// The statewide audit found 227 St. Petersburg places labeled metro='tampa',
// two labeled 'st-petersburg' (a third spelling no reader knows), and seed-grid
// labels shown to readers as if they were a city. These are the rules that
// keep that from quietly coming back. Pure and zero-dependency: the prebuild
// guard (scripts/check-place-identity-contract.mjs) calls it on fixtures and
// the canary (scripts/check-inventory-integrity.mjs) calls it on production.

// The labels a St. Pete place may carry. 'st-petersburg' is not one of them.
export const NON_CANONICAL_METRO_LABELS = Object.freeze({
  "st-petersburg": "st-pete",
});

const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

// rows: [{ place_id, name, metro, lat, lng, locality, county }]
// bucket: (lat, lng) -> metro box key or null (lib/promoteIndex.js bucketMetro)
export function placeIdentityIssues(rows, bucket) {
  const out = { tampaLabelInStPeteBox: [], nonCanonicalLabel: [], localityIsSlug: [], countyHasSuffix: [] };
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r) continue;
    const box = typeof bucket === "function" && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng))
      ? bucket(Number(r.lat), Number(r.lng)) : null;
    if (r.metro === "tampa" && box === "st-pete") out.tampaLabelInStPeteBox.push(r);
    if (Object.prototype.hasOwnProperty.call(NON_CANONICAL_METRO_LABELS, r.metro)) out.nonCanonicalLabel.push(r);
    if (typeof r.locality === "string" && SLUG_RX.test(r.locality)) out.localityIsSlug.push(r);
    if (typeof r.county === "string" && /\bcounty\s*$/i.test(r.county)) out.countyHasSuffix.push(r);
  }
  return out;
}
