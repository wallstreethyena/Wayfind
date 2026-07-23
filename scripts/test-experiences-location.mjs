// scripts/test-experiences-location.mjs — locks "experiences follow the user's
// location": a far-away user is NEVER served Florida tours (destsWithin returns
// empty past ~150mi), and the rail then fetches LIVE for their real city.
import { readFileSync } from "fs";
import { destsWithin } from "../lib/experiencesData.js";

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
ok(/function BookableExpRail\(\{ sub, lat, lng, onSave, city, region \}\)/.test(home), "BookableExpRail takes the user's city + region");
ok(/if \(!arr\.length && city\)/.test(home) && /\/api\/viator\/tours\?q=" \+ encodeURIComponent\(city\)/.test(home), "when the Florida inventory is dark, it fetches tours LIVE for the user's actual city");
ok(/&region=" \+ encodeURIComponent\(region \|\| city\)/.test(home), "the live search passes the REGION (state) — required, or the anti-foreign filter returns 0 tours");
ok(/<BookableExpRail[^>]*city=\{locName \? locName\.split\(","\)\[0\] : ""\}/.test(home), "the rail is passed the current location's city");
ok(/never fall back to Florida/.test(home), "the intent is documented at the fallback");

console.log(`test-experiences-location: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
