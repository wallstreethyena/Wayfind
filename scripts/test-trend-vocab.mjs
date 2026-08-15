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
// 2026-08-08: the beach-only popularity chip is FOLDED INTO the unified trend
// chip (lib/trendSignal.js). Same doctrine, enforced at the SOURCE: the chip
// renders the signal's own reason, and the popularity reason must stay a
// LEVEL claim — asserted by executing the module, not by grepping a literal.
ok(/p\.trending && p\.trend_reason && \(/.test(home), "the unified trend chip renders off the row's flag + reason");
const { TREND_REASONS } = await import("../lib/trendSignal.js");
ok(/^Popular\b/.test(TREND_REASONS.popularity), "the popularity-source reason is level-honest ('Popular...', never a velocity claim)");
for (const re of BANNED) ok(!re.test(Object.values(TREND_REASONS).join(" ")), `no trend reason may claim ${re}`);
ok(!/^Trending/.test(TREND_REASONS.popularity), "level-only data may not be captioned 'Trending'");

// v8 (2026-08-15): the buzz hero slide and its two fallback LINES are gone —
// see scripts/test-buzz.mjs for what replaced them. The vocabulary rule they
// enforced applies to the trending RAIL now, and it applies harder: the rail
// prints no line of its own at all. A card there carries the row's own
// `trend_reason`, which comes from TREND_REASONS above and is already asserted
// level-honest three lines up. When nothing clears the threshold the rail is
// EMPTY, which is the only caption that can never overclaim.
{
  const rails = readFileSync(new URL("../lib/rails.js", import.meta.url), "utf8");
  ok(!/buzzPick/.test(home.replace(/\/\/[^\n]*/g, "")), "the buzz slide's fallback lines are back in app/home.js");
  const trendingRail = (rails.match(/\{ id: "trending"[\s\S]*?\},/) || [""])[0];
  ok(trendingRail.length > 0, "PROBE: the trending rail exists");
  for (const re of BANNED) ok(!re.test(trendingRail), `the trending rail's own copy may not claim ${re}`);
}

console.log(`test-trend-vocab: OK — ${pass} assertions (no velocity/freshness claim on level-only data)`);
