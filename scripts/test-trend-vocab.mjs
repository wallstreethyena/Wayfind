// scripts/test-trend-vocab.mjs — "than usual / more people looking / this week /
// heating up / selling fast" are VELOCITY or FRESHNESS claims. The data behind
// the buzz + beach surfaces (wf_buzz_picks, tier2_popularity) is a popularity
// LEVEL with no baseline and no time-series — so those words fabricate a trend
// the data can't support (audit F1–F3). This bans the fabricated phrases from any
// render string, and locks the beach chip to the honest "Popular" (a level), not
// "Trending" (a delta). The "Trending near you" buzz FEATURE label is a product
// name for the popularity page and is intentionally allowed — it's the CLAIMS,
// not the feature name, that must stay honest.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-trend-vocab: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const kit = readFileSync(new URL("../app/components/kit.js", import.meta.url), "utf8");

// Velocity / freshness fabrications — none of these are legitimate feature names.
const BANNED = [
  /than usual/i,
  /more people are (looking|searching|checking)/i,
  /signals this week/i,
  /heating up/i,
  /selling fast/i,
  /blowing up/i,
  /rising fast/i,
  /trending up/i,
];
for (const [label, src] of [["home.js", home], ["kit.js", kit]]) {
  for (const re of BANNED) ok(!re.test(src), `${label} must not claim ${re} — a velocity/freshness fabrication on level-only data`);
}

// The beach popularity chip is a LEVEL (tier2_popularity >= threshold) → labeled
// "Popular", never "Trending".
ok(!/🔥 Trending/.test(home), "the beach popularity chip says 'Popular', not 'Trending' (it's a level, not a period-over-period delta)");
ok(/🔥 Popular/.test(home), "the beach popularity chip is present as '🔥 Popular'");

// The buzz fallback lines are honest (level-based), not fabricated velocity.
ok(home.includes("On readers' radar near you"), "single-source buzz fallback is level-honest ('on the radar')");
ok(home.includes('"Popular across " + buzzPick.sources_count + " local signals'), "multi-source buzz fallback templates the real source count, no freshness claim");

console.log(`test-trend-vocab: OK — ${pass} assertions (no velocity/freshness claim on level-only data)`);
