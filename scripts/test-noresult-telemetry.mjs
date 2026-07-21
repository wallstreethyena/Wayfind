// Guardrail: a "no results" event must say WHY there were no results.
//
// THE PROBLEM (verified against live public.events, 2026-07-21): places_none
// carried only {loc, cat, lat, lng}. With 182 such events across 44 devices,
// that payload could not distinguish the two explanations that demand opposite
// fixes:
//
//   1. genuine coverage gap  -> widen radius / grow inventory
//   2. a Google call FAILED  -> fix the outage; widening does nothing
//
// (2) was invisible by construction: every search in the "all" branch ends in
// `.catch(() => [])`, so a quota error, a referrer-restricted key, or a dropped
// connection all produce an empty array that reads exactly like an empty town.
//
// Two further facts made the old payload actively misleading:
//   - the adaptive ladder (17->30->45->60mi, RADIUS_LADDER_M) ALREADY runs
//     before the event fires, so "just widen the radius" was often already done
//     and had already failed. Without radiusMi that was unknowable.
//   - 46% of the events carried an empty `loc`, which the original triage never
//     saw because it grouped by location name.
//
// If any of these fields disappear, the no-result data goes back to being
// undiagnosable — so this fails the build.
import { readFileSync } from "node:fs";

let passed = 0;
const fail = (m) => { console.error("test-noresult-telemetry: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); passed++; };

const src = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");

const i = src.indexOf('logEvent("places_none"');
ok(i !== -1, "the places_none event is gone — the no-result signal must keep firing");
const payload = src.slice(i, src.indexOf("});", i));

// 1. The fields that make a no-result actionable.
for (const [field, why] of [
  ["cat", "category"],
  ["sub", "sub-filter — a category can be fine while one sub-filter is empty"],
  ["lat", "latitude"],
  ["lng", "longitude"],
  ["radiusMi", "the radius ACTUALLY searched after auto-widening — without it, 'widen the radius' cannot be evaluated"],
  ["startRadiusMi", "the radius the search started at"],
  ["widened", "whether the 17->30->45->60mi ladder ran before giving up"],
  ["fetchErrs", "count of SWALLOWED api failures — this is what separates an outage from a coverage gap"],
  ["locState", "whether the reverse geocode had resolved (46% of events had an empty loc)"],
]) {
  // accept both `field: value` and ES6 shorthand `field,`
  ok(new RegExp(`\\b${field}\\s*[:,]`).test(payload), `places_none payload lost \`${field}\` — ${why}`);
}

// 2. THE CORE RULE: no search failure may be swallowed without being counted.
//    A bare `.catch(() => [])` on a search re-creates the exact blind spot.
const effect = src.slice(Math.max(0, i - 9000), i);
const bare = effect.match(/\.catch\(\(\)\s*=>\s*\[\]\)/g) || [];
ok(bare.length === 0,
  `found ${bare.length} bare \`.catch(() => [])\` on the no-result search path — every swallowed failure must increment _fetchErrs, or an API outage will again be logged as "nothing here"`);
ok(/let _fetchErrs = 0;/.test(effect), "_fetchErrs counter is missing");
const incs = (effect.match(/_fetchErrs\+\+/g) || []).length;
ok(incs >= 3, `_fetchErrs is incremented in only ${incs} place(s); every swallowed catch on the search path must count (expected >=3: two searchPlaces calls + the inventory join)`);

// 3. radiusMi must be derived from the radius actually used, not the requested
//    one — reporting the starting radius would hide that widening already failed.
ok(/radiusMi: Math\.round\(_usedM \/ 1609\.34\)/.test(payload),
  "radiusMi must be computed from _usedM (the radius after auto-widening), not _startM");
ok(/widened: _usedM > _startM/.test(payload), "widened must compare the used radius against the starting radius");

// 4. The ladder this data is meant to evaluate must still exist.
ok(/const RADIUS_LADDER_M = \[/.test(src), "RADIUS_LADDER_M is gone — radiusMi/widened would be meaningless");
ok(/const ADAPT_MIN = \d+/.test(src), "ADAPT_MIN is gone — the auto-widen trigger");

// 5. Instrumentation must never break browsing: the event stays inside the
//    fail-soft logEvent path and must not introduce its own throw.
ok(/if \(!results \|\| results\.length === 0\) logEvent\("places_none"/.test(src),
  "places_none must still fire only on a genuinely empty result set");

console.log(`test-noresult-telemetry: OK — ${passed} assertions (no-result events carry radius, widening, swallowed-error count and geocode state; no search failure is silently swallowed)`);
