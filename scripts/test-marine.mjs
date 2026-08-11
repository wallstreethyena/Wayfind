// scripts/test-marine.mjs — lock test for the Beach Intelligence scorer (lib/marine.js).
// Pure + deterministic (no network): pins the show/hide gates so a future edit can't
// silently start recommending unsafe or out-of-range beach days. Wire into prebuild.
import { scoreBeachDay, tideDateYmd } from "../lib/marine.js";
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.error("FAIL:", m); } };

ok(scoreBeachDay({ hasUnsafe: true, airTempMaxF: 85, precipProbMaxPct: 5 }, 5).show === false, "active water-safety alert hides the hero");
ok(scoreBeachDay({ airTempMaxF: 85 }, 999).status === "too_far", "beyond radius = too_far");
ok(scoreBeachDay({ airTempMaxF: 60, precipProbMaxPct: 0 }, 5).show === false, "cold day hides");
ok(scoreBeachDay({ airTempMaxF: 85, precipProbMaxPct: 80 }, 5).show === false, "high rain chance hides");
ok(scoreBeachDay({ airTempMaxF: 85, precipProbMaxPct: 5, uvIndexMax: 6, hasUnsafe: false }, 5).show === true, "clear warm day shows");
const uv = scoreBeachDay({ airTempMaxF: 85, precipProbMaxPct: 5, uvIndexMax: 11, hasUnsafe: false }, 5);
ok(uv.show === true && uv.status === "great_uv_caution", "extreme UV shows with caution");

// v6.97 — the NOAA tide window is the VENUE's (ET) calendar day, never the
// server's. On Vercel (UTC) the old local-parts read requested TOMORROW's
// tides every evening after ~8 PM ET. Deterministic: 01:30 UTC on Aug 12 is
// still Aug 11 in ET. Red-proven by restoring the local-parts version.
ok(tideDateYmd(new Date("2026-08-12T01:30:00Z")) === "20260811", "8/12 01:30 UTC is still 8/11 in ET — tide date must not roll early");
ok(tideDateYmd(new Date("2026-08-12T12:00:00Z")) === "20260812", "midday agrees in every timezone");
ok(tideDateYmd(new Date("2026-01-05T03:00:00Z")) === "20260104", "EST (winter) offset handled, not just EDT");

console.log(`test-marine: ${n - fail}/${n} passed`);
if (fail) process.exit(1);
