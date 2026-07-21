// scripts/test-marine.mjs — lock test for the Beach Intelligence scorer (lib/marine.js).
// Pure + deterministic (no network): pins the show/hide gates so a future edit can't
// silently start recommending unsafe or out-of-range beach days. Wire into prebuild.
import { scoreBeachDay } from "../lib/marine.js";
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };

ok(scoreBeachDay({ hasUnsafe: true, airTempMaxF: 85, precipProbMaxPct: 5 }, 5).show === false, "active water-safety alert hides the hero");
ok(scoreBeachDay({ airTempMaxF: 85 }, 999).status === "too_far", "beyond radius = too_far");
ok(scoreBeachDay({ airTempMaxF: 60, precipProbMaxPct: 0 }, 5).show === false, "cold day hides");
ok(scoreBeachDay({ airTempMaxF: 85, precipProbMaxPct: 80 }, 5).show === false, "high rain chance hides");
ok(scoreBeachDay({ airTempMaxF: 85, precipProbMaxPct: 5, uvIndexMax: 6, hasUnsafe: false }, 5).show === true, "clear warm day shows");
const uv = scoreBeachDay({ airTempMaxF: 85, precipProbMaxPct: 5, uvIndexMax: 11, hasUnsafe: false }, 5);
ok(uv.show === true && uv.status === "great_uv_caution", "extreme UV shows with caution");

console.log(`test-marine: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
