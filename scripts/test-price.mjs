// v5.50 audit remediation, Phase 2 — price rendering (prebuild).
// The bug: the old meter painted 4 "$" and encoded the tier only in color,
// so a black-box reviewer read "$$$$" next to "Inexpensive"/"Moderate".
// priceGlyphs must render the ACTUAL count.
import { priceGlyphs, avgCostForTwo } from "../lib/dining.js";

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

// v5.84 (B-spec honesty rule): avgCostForTwo shows a "for two" figure ONLY when
// it is backed by OBSERVED price data (Google priceRange dollars), never the
// coarse 1-4 tier heuristic — and hidden unless >=2 places have real prices.
const realPriced = (u) => ({ priceRange: { startUsd: u, endUsd: u } });   // real observed dollars
const tierOnly = (n) => ({ priceNum: n });                                 // tier guess, NOT observed
// <2 real prices -> hidden (null), even if many places have a tier guess.
eq(avgCostForTwo([]), null, "empty list -> no estimate");
eq(avgCostForTwo([realPriced(40)]), null, "one real price -> hidden (an average of 1 isn't meaningful)");
eq(avgCostForTwo([tierOnly(1), tierOnly(2), tierOnly(3), tierOnly(4)]), null, "tier-only places NEVER back an estimate (heuristic, not observed)");
eq(avgCostForTwo([realPriced(40), tierOnly(2)]), null, "one real + one tier guess -> still hidden (needs 2 REAL)");
// >=2 real prices -> a truthful estimate, backed and explained.
{
  const a = avgCostForTwo([realPriced(30), realPriced(50), tierOnly(4)]);
  if (!a) fail("two real prices should produce an estimate");
  else {
    eq(a.n, 2, "counts only the 2 real-priced places, not the tier guess");
    if (!/for two: about \$\d+/.test(a.text)) fail("estimate copy must be the clear 'for two: about $X' form: " + a.text);
    if (/\bEst\.|~\$/.test(a.text)) fail("dropped the vague 'Est. ~$' wording: " + a.text);
    if (!a.explain || !/price ranges|didn't list/.test(a.explain)) fail("estimate must carry an accessible explanation of coverage: " + a.explain);
  }
}

if (failures) process.exit(1);
console.log("test-price: OK — $ count matches the tier; avgCostForTwo is observed-price-only, hidden without >=2 real prices");
