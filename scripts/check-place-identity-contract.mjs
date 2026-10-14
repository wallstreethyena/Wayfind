#!/usr/bin/env node
// scripts/check-place-identity-contract.mjs - locks lib/placeIdentity.js, the
// rule set that keeps a place's real city (locality, county) separate from its
// coverage key (metro). Calls the real function with the real box function
// (lib/promoteIndex.js bucketMetro) on fixtures shaped like production rows,
// and checks the canary actually runs it against production.
//
// Statewide audit 2026-10-14: 227 St. Petersburg places were labeled 'tampa',
// two used an unknown 'st-petersburg' label. Production data is checked every
// 30 minutes by scripts/check-inventory-integrity.mjs (canary workflow), which
// calls the same function; this file proves the function itself is right.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { placeIdentityIssues, NON_CANONICAL_METRO_LABELS } from "../lib/placeIdentity.js";
import { bucketMetro, PROMOTE_METROS } from "../lib/promoteIndex.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0; const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };

// Real box function, real coordinates (from production rows).
const dali = { place_id: "a", name: "The Dali Museum", metro: "tampa", lat: 27.765909, lng: -82.631579, locality: "St. Petersburg", county: "Pinellas" };
const daliFixed = { ...dali, metro: "st-pete" };
const tampaReal = { place_id: "b", name: "NAREE", metro: "tampa", lat: 27.9506, lng: -82.4572, locality: "Tampa", county: "Hillsborough" };
const oddLabel = { place_id: "c", name: "Forbici", metro: "st-petersburg", lat: 27.773678, lng: -82.63521, locality: "St. Petersburg", county: "Pinellas" };
const slugLocality = { place_id: "d", name: "X", metro: "florida", lat: 27.66, lng: -81.51, locality: "avon-park-fl", county: "Polk" };
const suffixCounty = { place_id: "e", name: "Y", metro: "florida", lat: 27.66, lng: -81.51, locality: null, county: "Polk County" };

ok(bucketMetro(dali.lat, dali.lng) === "st-pete", "PROBE: the real box function puts the Dali Museum in the st-pete box");
ok(bucketMetro(tampaReal.lat, tampaReal.lng) === "tampa", "PROBE: the real box function puts downtown Tampa in the tampa box");

const bad = placeIdentityIssues([dali, oddLabel, slugLocality, suffixCounty], bucketMetro);
ok(bad.tampaLabelInStPeteBox.length === 1 && bad.tampaLabelInStPeteBox[0].place_id === "a", "POSITIVE: a St. Pete place labeled tampa is caught");
ok(bad.nonCanonicalLabel.length === 1 && bad.nonCanonicalLabel[0].place_id === "c", "POSITIVE: the 'st-petersburg' label is caught");
ok(bad.localityIsSlug.length === 1 && bad.localityIsSlug[0].place_id === "d", "POSITIVE: a slug used as a city name is caught");
ok(bad.countyHasSuffix.length === 1 && bad.countyHasSuffix[0].place_id === "e", "POSITIVE: 'Polk County' (suffix) is caught; counties are stored as 'Polk'");

// Box overlap: Fort De Soto buckets to 'tampa' by nearest center, so only the
// county catches it. North Pinellas (Palm Harbor) is outside the st-pete box
// and keeps 'tampa' (Tampa Bay coverage) legitimately.
const OPTS = { stPeteMaxLat: PROMOTE_METROS["st-pete"].maxLat };
const deSoto = { place_id: "f", name: "Fort De Soto", metro: "tampa", lat: 27.6156, lng: -82.7359, locality: null, county: "Pinellas" };
const palmHarbor = { place_id: "g", name: "Palm Harbor Museum", metro: "tampa", lat: 28.0491, lng: -82.7475, locality: "Palm Harbor", county: "Pinellas" };
const westchase = { place_id: "h", name: "Westchase", metro: "tampa", lat: 28.0591, lng: -82.6426, locality: "Westchase", county: "Hillsborough" };
ok(OPTS.stPeteMaxLat === 27.98, `PROBE: the st-pete box north edge read from PROMOTE_METROS is 27.98 (got ${OPTS.stPeteMaxLat})`);
ok(bucketMetro(deSoto.lat, deSoto.lng) !== "st-pete", "PROBE: Fort De Soto does NOT bucket to st-pete (the overlap this rule exists for)");
const sp = placeIdentityIssues([deSoto, palmHarbor, westchase], bucketMetro, OPTS);
ok(sp.tampaLabelInSouthPinellas.length === 1 && sp.tampaLabelInSouthPinellas[0].place_id === "f", `POSITIVE: Fort De Soto labeled tampa (Pinellas, south of the box edge) is caught; Palm Harbor and Westchase are not (got ${sp.tampaLabelInSouthPinellas.map((r) => r.name).join(",")})`);
ok(placeIdentityIssues([deSoto], bucketMetro).tampaLabelInSouthPinellas.length === 0, "NEGATIVE: without the box edge the county rule stays silent (no guessed boundary)");
ok(placeIdentityIssues([{ ...deSoto, metro: "st-pete" }], bucketMetro, OPTS).tampaLabelInSouthPinellas.length === 0, "NEGATIVE: Fort De Soto labeled st-pete raises nothing");

const good = placeIdentityIssues([daliFixed, tampaReal, { ...oddLabel, metro: "st-pete" }], bucketMetro);
ok(Object.values(good).every((a) => a.length === 0), `NEGATIVE: correctly labeled rows raise nothing (got ${JSON.stringify(Object.fromEntries(Object.entries(good).map(([k, v]) => [k, v.length])))})`);
ok(placeIdentityIssues([], bucketMetro).tampaLabelInStPeteBox.length === 0 && placeIdentityIssues(null, bucketMetro).nonCanonicalLabel.length === 0, "NEGATIVE: empty or missing input raises nothing and does not throw");
ok(NON_CANONICAL_METRO_LABELS["st-petersburg"] === "st-pete" && Object.isFrozen(NON_CANONICAL_METRO_LABELS), "the non-canonical label map names st-pete as the canonical label and is frozen");

// The canary must call this on production (wired, not just present).
const canary = readFileSync(path.join(ROOT, "scripts/check-inventory-integrity.mjs"), "utf8");
ok(/import\s*\{[^}]*\bplaceIdentityIssues\b[^}]*\}\s*from\s*"\.\.\/lib\/placeIdentity\.js"/.test(canary), "the production canary imports placeIdentityIssues");
ok(/placeIdentityIssues\(\s*rows\s*,\s*bucketMetro\s*,\s*\{\s*stPeteMaxLat:\s*PROMOTE_METROS\["st-pete"\]\.maxLat\s*\}\s*\)/.test(canary), "the production canary calls placeIdentityIssues(rows, bucketMetro, { stPeteMaxLat }) on the live rows");
ok(/id\.tampaLabelInSouthPinellas\.length\s*===\s*0/.test(canary), "the production canary asserts the south-Pinellas county rule");
ok(/select=[^`]*\blocality\b[^`]*\bcounty\b/.test(canary), "the canary's inventory read selects locality and county");
const wf = readFileSync(path.join(ROOT, ".github/workflows/canary.yml"), "utf8");
ok(/node scripts\/check-inventory-integrity\.mjs/.test(wf), "the canary workflow runs check-inventory-integrity.mjs");

if (fails.length) { console.error(`check-place-identity-contract: FAIL (${fails.length} of ${n})`); for (const f of fails) console.error("  x " + f); process.exit(1); }
console.log(`check-place-identity-contract: OK - ${n} assertions (real bucketMetro on production coordinates, positive and negative controls, canary wired to production)`);
