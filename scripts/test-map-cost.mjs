// scripts/test-map-cost.mjs — v6.41 THE MAP BILL guardrails.
//
// THE LESSON (July 2026 Google bill, owner-reported): the desktop sidebar
// mounted the REAL Google Map on every home visit — one billed Dynamic Maps
// load per visitor who never asked for a map — and reverse geocoding paid a
// call per visit for a city name that never changes. Paid SDK surfaces must
// be (1) mounted only on explicit user intent and (2) cached when the answer
// is stable. These asserts make regressing that a build failure.
import { readFileSync, existsSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-map-cost: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
// The desktop preview is optional: removing it is also a zero-cost outcome.
// What must never return is an automatically mounted, billed Google Map.
ok(!/<MapView places=\{_pins\}/.test(home), "desktop sidebar does NOT mount the billed Google Map (the July bill)");
ok(!/<MapPreview places=\{_pins\}/.test(home), "Visual Release 01 keeps the desktop discovery surface map-free");
// v8.2 — RE-POINTED, AND STRICTLY STRONGER. `setScreen(s.id)` was the bottom
// bar's inline onClick body; the destinations now render in TWO bars (the lab's
// top nav row and the mobile bottom bar) and both call one shared
// goDestination(), so the literal moved there. Following the code rather than
// deleting the assertion.
//
// The old form was also weaker than it read: `setScreen(s.id)` appearing
// ANYWHERE in a 10k-line file satisfied it — including from an effect, which is
// the exact "mounted without user intent" failure that produced the July bill.
// What replaces it names the rule: Map is a declared destination, the shared
// handler opens the real screen, and every call site of that handler is a click.
ok(/\{ id: "map",[\s\S]{0,90}label: "Map"/.test(home), "the Map destination is still declared in WF_DESTINATIONS");
// v8.3 — COMMENTS STRIPPED FIRST. The v8.2 form scanned RAW source, so when
// the bottom bar was removed and a JSX comment was left explaining that
// "goDestination() is still the one handler", the guard read that prose as a
// call site outside an onClick and went red on correct code. That is the
// exact failure CLAUDE.md records five separate guards hitting on 2026-07-30.
// Narrow JSX-comment strip only: a greedy /* */ sweep over app/home.js once
// deleted 158KB of live code, because regex literals contain "/*".
const homeCode = home.replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const goDest = homeCode.slice(homeCode.indexOf("const goDestination = ("), homeCode.indexOf("const railMenuBand"));
ok(goDest.length > 200, `PROBE: goDestination's body was located (${goDest.length} chars) — without this the assertions below read nothing`);
ok(/setScreen\(id\)/.test(goDest), "the shared nav handler opens the real screen for a non-home destination — explicit user intent still reaches the map");
// A map that mounts from anything other than a tap is the July bill again.
//
// EVERY call site, not all-but-the-first. The first draft of this loop skipped
// index 0 on the assumption that it was the declaration — it is not, because
// `const goDestination = (` has a space the /goDestination\(/ pattern does not
// match. A red-prove that injected `useEffect(() => { goDestination("map") })`
// above the first real call site therefore went GREEN. The declaration is
// asserted on its own line above; here every match is a call and every call is
// checked.
ok(/const goDestination = \(/.test(homeCode), "goDestination is declared exactly where the two bars can share it");
const goCalls = [...homeCode.matchAll(/goDestination\(/g)];
// v8.3: ONE nav bar now. The bottom bar was removed as duplication, so
// requiring two call sites fires on correct code. What must hold is that the
// handler is REACHED — from a tap and only from a tap — which the loop below
// proves for every site that exists. That is the billing rule; the count was
// only ever a proxy for "both bars go through the shared handler".
ok(goCalls.length >= 1, `goDestination is reached from the nav (found ${goCalls.length} call sites, expected at least 1)`);
for (const c of goCalls) {
  const before = homeCode.slice(Math.max(0, c.index - 240), c.index);
  ok(/onClick=\{/.test(before), `a goDestination call at index ${c.index} is not inside an onClick — a nav handler reached from an effect or a render mounts the billed map for a visitor who never asked for one`);
}

ok(existsSync(new URL("../app/components/MapPreview.js", import.meta.url)), "MapPreview component exists");
const prev = readFileSync(new URL("../app/components/MapPreview.js", import.meta.url), "utf8");
ok(!/googlemaps|google\.maps|importLibrary|js-api-loader/.test(prev), "MapPreview touches NO Google SDK — zero billed loads");

const gg = readFileSync(new URL("../lib/google.js", import.meta.url), "utf8");
ok(/wf_revgeo\|/.test(gg), "reverseGeocode caches by rounded coordinate cell");
ok(/_reverseGeocodeUncached/.test(gg), "reverseGeocode wraps the paid call behind the cache");
ok(/30 \* 86400000/.test(gg), "reverse-geocode cache holds for 30 days");

console.log(`test-map-cost: OK — ${pass} assertions (no billed map loads without user intent; geocoding cached)`);
