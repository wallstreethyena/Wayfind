// scripts/test-coverage-gap-feed.mjs — an empty browse OUTSIDE coverage must
// offer Florida city options, never the dead "try a bigger city nearby" line.
//
// WHY (2026-11-02, Command Center "Empty-result searches are spiking"):
// measured against live public.events, 112 of 114 places_none events in 15
// days came from centers outside coverage (England, Ottawa, Frankfurt,
// Wilmington NC, Park City UT...). Free mode serves only places Wayfind owns,
// so those readers could never get a result, yet the empty state told them to
// try another category or a bigger city nearby. 40 visitors hit that wall.
//
// Two layers: BEHAVIOURAL (the real coverage law decides gap / no gap for real
// coordinates) and STRUCTURAL scoped to the exact code positions in home.js
// (the file is an 11k-line client component; rendering it here would need a
// huge mock surface — same reasoning as test-coverage-waitlist.mjs).
import { readFileSync } from "fs";
import { coverageGap, coverageButtonText } from "../app/components/booCoverage.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };

// ── 1. Behaviour: the coverage law on the coordinates from the incident.
const OUTSIDE = [
  ["Stevenage area, England", 51.9736, -0.2058],
  ["Ottawa, Canada", 45.378, -75.7028],
  ["Frankfurt, Germany", 50.1567, 8.667],
  ["Wilmington, NC", 34.2257, -77.9447],
  ["Park City, UT", 40.6461, -111.498],
];
const INSIDE = [
  ["Sarasota, FL", 27.3364, -82.5307],
  ["Tampa, FL", 27.9506, -82.4572],
  ["Orlando, FL", 28.5384, -81.3789],
  ["Parrish, FL", 27.5689, -82.4393],
];
for (const [name, lat, lng] of OUTSIDE) {
  const g = coverageGap({ lat, lng, loc: name });
  ok(g && g.near && g.options.length >= 2, `${name} must be a coverage gap with Florida options`);
  if (g) {
    ok(g.options.every((o) => Number.isFinite(o.lat) && Number.isFinite(o.lng) && o.label), `${name}: every option carries real coordinates + a label`);
    ok(new Set(g.options.map((o) => o.slug)).size === g.options.length, `${name}: options are unique`);
    for (const [i, o] of g.options.entries()) ok(!/[–—]| - /.test(coverageButtonText(o, i === 0)), `${name}: button text has no dashes (owner rule)`);
  }
}
for (const [name, lat, lng] of INSIDE) ok(coverageGap({ lat, lng, loc: name }) === null, `${name} is covered: the normal feed and empty state must apply`);
ok(coverageGap(null) === null, "an unknown location is never a gap (never guess a location)");

// ── 2. Structure, scoped to role, not whole-file substrings.
const h = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/const loadBooCoverage = \(\) => import\("\.\/components\/booCoverage\.js"\);/.test(h), "home.js uses the SAME coverage law as Boo (booCoverage.js), loaded on demand (homepage bundle budget)");
const STATIC_IMPORT = /^import [^\n]*booCoverage/m;
ok(!STATIC_IMPORT.test(h), "booCoverage must not be statically imported into the homepage client (it would eat the last of the 501KB gz budget)");
ok(STATIC_IMPORT.test('x\nimport { coverageGap } from "./components/booCoverage.js";\ny'), "positive control: STATIC_IMPORT detects a static booCoverage import when present");
ok(/const _gapP = loadBooCoverage\(\)\.then\(/.test(h) && h.indexOf("const _gapP = loadBooCoverage()") < h.indexOf("let results = await _fetchAt(_startM);"), "the coverage check starts BEFORE the first fetch so it runs in parallel (covered readers wait on nothing new)");
ok(/bc\.coverageButtonText\(o, i === 0\)/.test(h), "button text comes from Boo's own coverageButtonText");
ok(/\}, \(\) => null\);/.test(h.slice(h.indexOf("const _gapP"), h.indexOf("const _gapP") + 600)), "a failed chunk load degrades to the normal path (gap = null), never blocks browsing");
ok(/setFeedGap\(_gap\); setPlaces\(results\);/.test(h), "the gap is committed in the SAME update as the places it explains");

// 2a. ONE shared renderer for the city options (no second copy of the copy).
const rs = h.indexOf("  function renderCoverageGap() {");
ok(rs !== -1 && h.indexOf("function renderCoverageGap()", rs + 10) === -1, "exactly one renderCoverageGap definition");
const gapBlock = rs === -1 ? "" : h.slice(rs, h.indexOf("\n  }\n", rs));
ok(/const gap = feedGap;/.test(gapBlock) && /if \(!gap\) return null;/.test(gapBlock), "the renderer reads the verdict computed with the places on screen, and renders nothing when covered");
ok(/gap\.options\.map\(/.test(gapBlock) && /\{o\.text\}/.test(gapBlock), "one button per Florida option, with Boo's button text");
ok(/jumpToArea\(\{ name: o\.label, lat: o\.lat, lng: o\.lng \}\)/.test(gapBlock), "a city tap uses jumpToArea (manual pick, GPS never yanks it back)");
ok(/logEvent\("coverage_city_jump"/.test(gapBlock), "a city tap is attributed (coverage_city_jump)");
ok(/minHeight: 44/.test(gapBlock), "city buttons keep a 44px tap target");
ok(/data-coverage-gap="1"/.test(gapBlock), "the block is addressable for render checks");
const DEAD_END = /bigger city|another category|widen your search/;
ok(!DEAD_END.test(gapBlock), "the gap renderer must not repeat the dead-end advice");

// 2b. BOTH empty states route to it BEFORE their generic copy.
//   (i) explore list: "Nothing here yet"
const es = h.indexOf("{!loading && !err && view.length === 0 && (() => {");
ok(es !== -1, "the explore empty state is an IIFE that can branch on coverage");
const esBody = es === -1 ? "" : h.slice(es, h.indexOf("})()}", es));
ok(/if \(feedGap\) return renderCoverageGap\(\);/.test(esBody) && esBody.indexOf("renderCoverageGap()") < esBody.indexOf("Nothing here yet"), "explore list: city options come BEFORE 'Nothing here yet'");
//   (ii) in-place home browse (the screen the incident visitors actually saw): "Nothing here right now"
const hb = h.indexOf(") : view.length === 0 && feedGap ? (");
const hbBody = hb === -1 ? "" : h.slice(hb, hb + 900);
ok(hb !== -1 && /renderCoverageGap\(\)/.test(hbBody) && hbBody.indexOf("renderCoverageGap()") < hbBody.indexOf("Nothing here right now"), "home browse: city options come BEFORE 'Nothing here right now'");
// Positive controls: DEAD_END does find the advice in both covered fallbacks,
// so the absence in the renderer above means something.
ok(DEAD_END.test(esBody), "positive control: DEAD_END detects the explore list's covered fallback copy");
ok(DEAD_END.test(hbBody), "positive control: DEAD_END detects the home browse's covered fallback copy");

// 2b. Telemetry: coverage gaps are their own event; places_none stays for real search emptiness.
const cg = h.indexOf('logEvent("coverage_gap"');
const pn = h.indexOf('logEvent("places_none"');
ok(cg !== -1 && pn !== -1 && cg < pn, "coverage_gap is decided BEFORE places_none in the same result handler");
ok(/else if \(!results \|\| results\.length === 0\) logEvent\("places_none"/.test(h), "places_none still fires for every empty result INSIDE coverage");
ok(/coverageGapLoggedRef\.current\.has\(_gapKey\)/.test(h), "coverage_gap is de-duplicated per area + category (the old path logged twice per visit)");
const cgPayload = cg === -1 ? "" : h.slice(cg, h.indexOf("});", cg));
ok(/toFixed\(1\)/.test(cgPayload) && !/lat: center\.lat,/.test(cgPayload), "coverage_gap stores area-level coordinates only (1 decimal)");

// 2c. No guaranteed-empty widening outside coverage.
ok(/if \(!_gap && \(autoRadiusRef\.current \|\| _startM <= DEFAULT_RADIUS_M\)\)/.test(h), "the 17-30-45-60 widen ladder is skipped outside coverage");

// 2d. Positive control: the scoped extraction is real, not an empty string.
ok(esBody.length > 400 && esBody.length < 6000, `empty-state extraction looks wrong (${esBody.length} chars): the checks above would mean nothing`);

if (failn) { console.error(`test-coverage-gap-feed: ${failn}/${n} FAILED`); process.exit(1); }
console.log(`test-coverage-gap-feed: ${n}/${n} passed`);
