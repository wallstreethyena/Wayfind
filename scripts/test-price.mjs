// v5.50 audit remediation, Phase 2 — price rendering (prebuild).
// The bug: the old meter painted 4 "$" and encoded the tier only in color,
// so a black-box reviewer read "$$$$" next to "Inexpensive"/"Moderate".
// priceGlyphs must render the ACTUAL count.
import { priceGlyphs } from "../lib/dining.js";

let failures = 0;
const fail = (m) => { console.error("test-price: FAIL — " + m); failures++; };
const eq = (got, want, label) => { if (got !== want) fail(`${label}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`); };

// priceLevel 1 ("Inexpensive") -> one "$", NEVER four.
eq(priceGlyphs(1), "$", "level 1");
if (priceGlyphs(1) === "$$$$") fail("level 1 must never render $$$$");
eq(priceGlyphs(2), "$$", "level 2 (Moderate)");
eq(priceGlyphs(3), "$$$", "level 3");
eq(priceGlyphs(4), "$$$$", "level 4 (Very Expensive) — the only case that gets four");
eq(priceGlyphs(0), "Free", "level 0");
// Neither → show nothing.
eq(priceGlyphs(null), "", "null level");
eq(priceGlyphs(undefined), "", "undefined level");
// Out-of-range is clamped, not crashed.
eq(priceGlyphs(9), "$$$$", "clamp high");

if (failures) process.exit(1);
console.log("test-price: OK — $ count matches the tier; level 1 is $ not $$$$");
