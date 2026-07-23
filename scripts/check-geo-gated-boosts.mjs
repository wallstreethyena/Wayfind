// scripts/check-geo-gated-boosts.mjs — first-party, NAME-KEYED data (curated
// picks, best-of / local-fave lists, featured, gems) must NEVER apply a Florida
// badge, boost, or blurb to a SAME-NAMED place outside the curated region.
//
// The audit found the whole class: a Denver "Chart House" inheriting a Sarasota
// "★ Wayfind Pick" + rank boost + "on Sarasota Bay" blurb, and a Greenville
// "Columbia Restaurant" relabeled "Best of Greenville" (name collision, no geo
// gate). This guard locks the fix: every name-keyed booster geo-gates on
// inCuratedRegion(place), the fuzzy substring matches are gone, and no call site
// passes a bare .name (which would bypass the coordinate gate).
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("check-geo-gated-boosts: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const after = (marker, n = 600) => { const i = home.indexOf(marker); return i < 0 ? "" : home.slice(i, i + n); };

// 1) the region predicate exists and fails CLOSED on unknown coords
ok(/const FIRST_PARTY_ANCHORS = \[/.test(home) && /function inCuratedRegion\(p\)/.test(home), "inCuratedRegion + FIRST_PARTY_ANCHORS are defined");
ok(/typeof p\.lat !== "number"[\s\S]{0,90}return false/.test(home), "inCuratedRegion fails CLOSED when coords are unknown");

// 2) every name-keyed booster geo-gates on it
ok(/inCuratedRegion\(p\)/.test(after("function faveTier(")), "faveTier() geo-gates");
ok(/inCuratedRegion\(p\)/.test(after("function featuredBoost(")), "featuredBoost() geo-gates");
ok(/const curatedFor = [^\n]*inCuratedRegion\(p\)/.test(home), "curatedFor() geo-gates");

// 3) the fuzzy substring branches (the nationwide false-positive source) are gone
ok(!/startsWith/.test(after("function faveTier(", 800)), "faveTier drops the startsWith fuzzy match");
ok(!/for \(const k in WAYFIND_FEATURED\)/.test(home), "featuredBoost drops the WAYFIND_FEATURED fuzzy loop");

// 4) no call site passes a bare .name (that would bypass the coordinate gate)
ok(!/(faveTier|featuredBoost|isLocalFave|isBestOf)\([a-z]+\.name\)/.test(home), "every caller passes the PLACE (not .name) so the gate always has coords");

console.log(`check-geo-gated-boosts: OK — ${pass} assertions (Florida name-keyed boosts cannot leak out of region)`);
