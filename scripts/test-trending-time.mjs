// scripts/test-trending-time.mjs — locks the hour-aware trending ranking: a
// late-night list leans to things you can do now (dining/nightlife) over
// daytime-only spots (museums/beaches), the descriptors stay HONEST (never a
// claimed "open now"), and TrendingNowClient applies it.
import { readFileSync } from "fs";
import { timeScore, timeFit, rankByHour } from "../lib/trendingTime.js";

let n = 0, failn = 0;
const ok = (c, m) => { n++; if (!c) { failn++; console.error("FAIL:", m); } };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── timeScore: night vs day ──
ok(timeScore("cocktail bar", 22) > timeScore("art museum", 22), "at 10pm a bar outranks a museum");
ok(timeScore("seafood restaurant", 20) > 1, "dinner spot boosted at 8pm");
ok(timeScore("beach park", 22) < 0.6, "an outdoor beach is damped at 10pm");
ok(timeScore("art museum", 11) > 1, "a museum is boosted midday");
ok(timeScore("nightclub", 11) < 0.6, "a nightclub is damped at 11am");
ok(timeScore("something unclassifiable", 11) === 1, "an unknown category stays neutral (never buried)");
ok(timeScore("brewery", 1) > 1, "nightlife window wraps past midnight (1am still active)");

// ── timeFit: honest, never a live open/closed claim ──
ok(timeFit("cocktail bar", 22) === "good right now", "in-window → 'good right now'");
ok(/^best at /.test(timeFit("art museum", 23)), "out-of-window → an honest 'best at …' hint");
ok(timeFit("unclassifiable", 11) === "", "unknown category → no hint");
for (const h of [0, 6, 12, 18, 23]) for (const c of ["bar", "museum", "beach", "restaurant"]) {
  ok(!/open now|is open|closed/i.test(timeFit(c, h)), `timeFit never claims a place is open/closed (${c}@${h})`);
}

// ── rankByHour: time-appropriate beats raw popularity, drive penalty applies ──
const picks = [
  { place_id: "m", name: "Museum", category: "art museum", popularity: 0.95, distance_mi: 2 },
  { place_id: "b", name: "Bar", category: "cocktail bar", popularity: 0.6, distance_mi: 2 },
];
const nightRanked = rankByHour(picks, 22);
ok(nightRanked[0].place_id === "b", "at 10pm the bar ranks above the more-popular museum");
const dayRanked = rankByHour(picks, 11);
ok(dayRanked[0].place_id === "m", "at 11am the museum ranks first");
ok(rankByHour(null, 12).length === 0 && rankByHour([], 12).length === 0, "empty input → empty (no crash)");
const far = rankByHour([{ place_id: "x", category: "z", popularity: 0.5, distance_mi: 40 }, { place_id: "y", category: "z", popularity: 0.5, distance_mi: 2 }], 12);
ok(far[0].place_id === "y", "the closer pick wins when popularity ties (drive penalty)");

// ── wired into the page ──
const c = read("app/components/TrendingNowClient.js");
ok(/from "\.\.\/\.\.\/lib\/trendingTime"/.test(c), "TrendingNowClient imports the time logic");
ok(/rankByHour\(picks, hour\)/.test(c) && /new Date\(\)\.getHours\(\)/.test(c), "it ranks the picks by the current local hour");
ok(/timeFit: timeFit\(p\.category, hour\)/.test(c) && /r\.timeFit/.test(c), "each row carries + renders its time-fit");

console.log(`test-trending-time: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
