// Gate: Wayfind Score band boundaries are exact and gap-free (v6.25 spec).
// Copies lib/score.js to a temp .mjs (repo package.json has no "type":
// "module") and asserts every documented transition — same pattern as
// check-libs.mjs. Exit 1 on any mismatch.
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmp = mkdtempSync(join(tmpdir(), "wf-score-"));
copyFileSync("lib/score.js", join(tmp, "score.mjs"));
const { getScoreBand, isValidScore, toDisplayScore, pickEligibleByScore, BAND_COLOR, SCORE_TOKENS, pinGlyphColor } = await import(join(tmp, "score.mjs"));

let fails = 0;
const expect = (actual, want, msg) => {
  if (actual !== want) { console.error(`test-score-band: FAIL — ${msg}: got ${JSON.stringify(actual)}, want ${JSON.stringify(want)}`); fails++; }
};

// Exact boundary transitions (spec table, all inclusive edges).
expect(getScoreBand(10), "excellent", "10.0 → green");
expect(getScoreBand(8.5), "excellent", "8.5 → green");
expect(getScoreBand(8.49), "strong", "8.49 → orange");
expect(getScoreBand(7.9), "strong", "7.9 → orange");
expect(getScoreBand(7.89), "fair", "7.89 → yellow");
expect(getScoreBand(7.0), "fair", "7.0 → yellow");
expect(getScoreBand(6.99), "low", "6.99 → red");
expect(getScoreBand(0), "low", "0.0 → red");

// Validation at the data boundary — invalid never renders.
expect(isValidScore(10), true, "10 valid");
expect(isValidScore(0), true, "0 valid");
expect(isValidScore(10.1), false, ">10 rejected");
expect(isValidScore(-0.1), false, "negative rejected");
expect(isValidScore(NaN), false, "NaN rejected");
expect(isValidScore(Infinity), false, "Infinity rejected");
expect(isValidScore("8.5"), false, "string rejected");
expect(isValidScore(null), false, "null rejected");
expect(isValidScore(undefined), false, "undefined rejected");

// wfScore (0–100) → display conversion; missing never becomes zero.
expect(toDisplayScore(85), 8.5, "wf 85 → 8.5");
expect(toDisplayScore(79), 7.9, "wf 79 → 7.9");
expect(toDisplayScore(100), 10, "wf 100 → 10");
expect(toDisplayScore(null), null, "null wf → null (never 0)");
expect(toDisplayScore(undefined), null, "missing wf → null (never 0)");
expect(toDisplayScore(NaN), null, "NaN wf → null");
expect(toDisplayScore(120), null, "wf 120 → null (out of range)");

// Every band maps to the correct token.
expect(BAND_COLOR.excellent, SCORE_TOKENS.green, "excellent → green token");
expect(BAND_COLOR.strong, SCORE_TOKENS.orange, "strong → orange token");
expect(BAND_COLOR.fair, SCORE_TOKENS.yellow, "fair → yellow token");
expect(BAND_COLOR.low, SCORE_TOKENS.red, "low → red token");

// Yellow uses the dark glyph; others white.
expect(pinGlyphColor("fair"), SCORE_TOKENS.bg, "yellow band → dark pin glyph");
expect(pinGlyphColor("excellent"), "#FFFFFF", "green band → white pin glyph");

// Wayfind Pick never on yellow/red.
expect(pickEligibleByScore(8.5), true, "pick allowed at 8.5");
expect(pickEligibleByScore(7.9), true, "pick allowed at 7.9 (orange)");
expect(pickEligibleByScore(7.8), false, "pick blocked on yellow");
expect(pickEligibleByScore(6.0), false, "pick blocked on red");
expect(pickEligibleByScore(NaN), false, "pick blocked on invalid");

if (fails) { console.error(`test-score-band: ${fails} failure(s)`); process.exit(1); }
console.log("test-score-band: OK — 8 boundary transitions exact, validation rejects corrupt scores, tokens + pick gate verified (33 assertions)");
