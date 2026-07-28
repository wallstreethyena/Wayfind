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
// v6.46 — `after(marker, 800)` was a proxy for "faveTier's own body", and it only
// held because 146 lines of curated DATA happened to sit between faveTier and the
// next function. Wave 2 of the decomposition moved that data to
// app/components/curatedData.js and the window immediately swallowed
// wayfindNotes(), which uses startsWith LEGITIMATELY (it fuzzy-matches note keys,
// where a false positive costs a wrong tip, not a wrong badge in another state).
// So the assertion is re-pointed, not relaxed: read the function's ACTUAL body,
// bounded by its own terminating "\n}", and fail loudly if the anchor ever moves.
function body(marker) {
  const i = home.indexOf(marker);
  if (i < 0) fail(`${marker} not found — this guardrail is anchored to code that no longer exists`);
  const end = home.indexOf("\n}", i);
  if (end < 0) fail(`${marker} has no terminating brace at column 0 — cannot bound the body`);
  return home.slice(i, end + 2);
}

// 1) the region predicate exists and fails CLOSED on unknown coords
ok(/const FIRST_PARTY_ANCHORS = \[/.test(home) && /function inCuratedRegion\(p\)/.test(home), "inCuratedRegion + FIRST_PARTY_ANCHORS are defined");
ok(/typeof p\.lat !== "number"[\s\S]{0,90}return false/.test(home), "inCuratedRegion fails CLOSED when coords are unknown");

// 2) every name-keyed booster geo-gates on it
// Both read the BODY, not a fixed byte window: a window that overruns the
// function can pass on a neighbour's code, which is the more dangerous failure —
// a guardrail that reports OK while asserting nothing about the thing it names.
ok(/inCuratedRegion\(p\)/.test(body("function faveTier(")), "faveTier() geo-gates");
ok(/inCuratedRegion\(p\)/.test(body("function featuredBoost(")), "featuredBoost() geo-gates");
ok(/const curatedFor = [^\n]*inCuratedRegion\(p\)/.test(home), "curatedFor() geo-gates");

// 3) the fuzzy substring branches (the nationwide false-positive source) are gone
ok(!/startsWith/.test(body("function faveTier(")), "faveTier drops the startsWith fuzzy match");
ok(!/for \(const k in WAYFIND_FEATURED\)/.test(home), "featuredBoost drops the WAYFIND_FEATURED fuzzy loop");

// 4) no call site passes a bare .name (that would bypass the coordinate gate)
ok(!/(faveTier|featuredBoost|isLocalFave|isBestOf)\([a-z]+\.name\)/.test(home), "every caller passes the PLACE (not .name) so the gate always has coords");

console.log(`check-geo-gated-boosts: OK — ${pass} assertions (Florida name-keyed boosts cannot leak out of region)`);
