// scripts/test-experiences-location.mjs — locks "experiences follow the user's
// location": a far-away user is NEVER served Florida tours (destsWithin returns
// empty past ~150mi), and the rail then fetches LIVE for their real city.
import { readFileSync } from "fs";
import { destsWithin, CATEGORY_BY_KEY } from "../lib/experiencesData.js";
import { chipSearchQuery } from "../lib/browseCommerceMap.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── destsWithin: no Florida for out-of-region users ──
ok(destsWithin({ lat: 32.7765, lng: -79.9311 }, 60).length === 0, "Charleston SC (~350mi) → NO Florida markets (empty)");
ok(destsWithin({ lat: 40.7128, lng: -74.006 }, 60).length === 0, "New York → NO Florida markets");
ok(destsWithin({ lat: 34.0007, lng: -81.0348 }, 90).length === 0, "Columbia SC → NO Florida markets");
// ── but Florida + immediate surroundings still resolve (no regression) ──
ok(destsWithin({ lat: 27.336, lng: -82.531 }, 30).length === 1, "Sarasota still gets its home market");
ok(destsWithin({ lat: 27.336, lng: -82.531 }, 120).includes("663"), "Sarasota at 120mi still reaches Orlando");
ok(destsWithin({ lat: 28.9, lng: -81.3 }, 30).length >= 1, "a near-Florida user (Ocala, ~55mi) still gets the nearest market via the bounded fallback");
ok(destsWithin(null, 60).length === 5, "no location → all markets (unchanged)");

// ── the rail fetches live for the user's city when the pre-pull is dark ──
const home = read("app/home.js");
ok(/function UnifiedBrowseCommerceRail\(\{ sub,[^)]*city, region \}\)/.test(home), "the unified rail takes the user's city + region");
// 2026-08-02 — these two used to pin the fallback's exact SYNTAX: the literal
// `if (!rows.length && city)` and the template `${city} ${cat}`. Both went red
// when the fallback was extracted into liveSearch() and the search text became
// the chip's own human query instead of a catalogue key — a refactor that
// STRENGTHENED the behaviour they exist to protect. That is the CLAUDE.md
// "assert the invariant, not the file path" trap, and its dangerous half is the
// inverse: pinned to `${city} ${cat}`, they would have gone GREEN on a version
// that dropped the city from the query entirely, as long as the template
// survived. So they now assert the three things that actually matter.
//
// 1. There IS a live fallback, and it runs only when the local read is empty.
ok(/if \(!rows\.length\) rows = await liveSearch\(\);/.test(home), "when local inventory is dark, the rail falls back to a LIVE tours search");
// 2. That fallback is gated on a known city, which is what stops an
//    out-of-region visitor being served Florida inventory.
ok(/const liveSearch = async \(\) => \{[\s\S]{0,600}?if \(!city\) return \[\];/.test(home), "the live search refuses to run without a known city — the out-of-region guard");
ok(/never fall back to Florida markets for an out-of-region visitor/.test(home), "the intent is documented at the fallback");
// 3. The query is city-scoped and is HUMAN text, proven by CALLING the
//    resolver rather than by matching the template that builds it.
ok(/encodeURIComponent\(searchText\)/.test(home) && /const searchText = chipSearchQuery\(sub \|\| "all", city\)/.test(home), "the live search asks for the chip's own query text, built from the user's city");
for (const [chip, city] of [["spa", "Sarasota"], ["family", "Tampa"], ["museums", "Orlando"]]) {
  const q = chipSearchQuery(chip, city);
  ok(q.startsWith(city + " "), `chipSearchQuery("${chip}") is scoped to the user's city (got "${q}")`);
  ok(!CATEGORY_BY_KEY[q.replace(city + " ", "")], `chipSearchQuery("${chip}") is human search text, not a bare catalogue key (got "${q}")`);
}
ok(/&region=" \+ encodeURIComponent\(region \|\| city\)/.test(home), "the live search passes the REGION (state) — required, or the anti-foreign filter returns 0 tours");
ok(/<UnifiedBrowseCommerceRail[^>]*city=\{locName \? locName\.split\(","\)\[0\] : ""\}/.test(home), "the rail is passed the current location's city");

console.log(`test-experiences-location: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
