// scripts/check-score-law.mjs — THE GOVERNING LAW, locked.
//
// Owner directive, verbatim (2026-08-07): "If there is an influencer video, I
// want that to add a zero point seven to the score… if the place is greater
// than seventeen miles away, I want a zero point two deduction… It needs to
// be the governing rule for the Wayfind score… everywhere that we're
// presenting options, it needs to be ranked by the Wayfind score."
//
// This guard exists so the law cannot rot the way its predecessors did: the
// 2026-08-07 Bradenton screenshot showed a chip reading 9.2 rendered BELOW
// two chips reading 9.0, because a hidden per-mile decay reordered the list
// against the number it printed. Every assertion here fails the build on the
// pattern, not the instance.
import { governedWayfindScore, wayfindScore, CREATOR_VIDEO_BONUS, FAR_MILES, FAR_PENALTY, TRENDING_BONUS, TRENDING_CAP } from "../lib/wayfindScore.js";
import { displayedWfScore } from "../lib/creatorBoost.js";
import { byVisibleScore } from "../lib/todaysBest.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0;
const fail = (m) => { console.error("check-score-law: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };
const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// ── 1. The constants are the owner's numbers, in one place ──────────────────
ok(CREATOR_VIDEO_BONUS === 7, "+0.7 shown: CREATOR_VIDEO_BONUS is 7 on the 0–100 scale");
ok(FAR_MILES === 17 && FAR_PENALTY === 2, "−0.2 shown strictly past 17 miles: FAR_MILES 17, FAR_PENALTY 2");

// ── 2. The arithmetic, on the owner's own examples ──────────────────────────
ok(governedWayfindScore(90, { hasCreatorVideo: true }) === 97, "a 9.0 with a video shows 9.7");
ok(governedWayfindScore(92, { distanceMi: 20 }) === 90, "a 9.2 past 17 miles shows 9.0");
ok(governedWayfindScore(92, { distanceMi: 17 }) === 92, "17.0 exactly is not past 17");
ok(governedWayfindScore(90, { hasCreatorVideo: true, distanceMi: 25 }) === 95, "terms stack: +7 − 2");
ok(governedWayfindScore(98, { hasCreatorVideo: true }) === 100, "clamped at 100");
ok(governedWayfindScore(null, { hasCreatorVideo: true }) === null, "unrated stays null");
ok(governedWayfindScore(90, { distanceMi: null }) === 90, "unknown distance takes no deduction");

// ── 2b. THE TRENDING COMPONENT (owner-approved 2026-08-07) ──────────────────
// +0.6 shown, from REAL demand data only (lib/trendSignal.js — its own guard,
// check-trend-signal.mjs, bans monetized inputs), bounded, and disclosed.
ok(TRENDING_BONUS === 6, "+0.6 shown: TRENDING_BONUS is 6 on the 0–100 scale");
ok(TRENDING_CAP === 99, "the trending term alone may not mint a 10.0 — capped at 99 internal / 9.9 shown");
ok(governedWayfindScore(90, { trending: true }) === 96, "the owner's example: a 9.0 trending shows 9.6");
ok(governedWayfindScore(95, { trending: true }) === 99, "bounded: 9.5 trending caps at 9.9, never 10.1");
ok(governedWayfindScore(96, { trending: false }) === 96, "not trending → no bump");
ok(governedWayfindScore(96, {}) === 96, "absent signal is identical to not trending (fail-soft)");
ok(governedWayfindScore(null, { trending: true }) === null, "unrated stays null — trending cannot invent a score");
ok(governedWayfindScore(98, { hasCreatorVideo: true, trending: true }) === 100,
  "the cap never SUBTRACTS: a 98+video already at 100 keeps 100 when it also trends");
ok(governedWayfindScore(90, { hasCreatorVideo: true, trending: true, distanceMi: 25 }) === 99,
  "terms stack: 90 +7 video −2 far = 95, then trending +6 caps at 99 — trending can never be the term that mints a 10.0");

// Shown == sorted WITH the trending term: byVisibleScore reads r.trending
// (attached by lib/trendSignal.js before the sort) into the same governed
// number the chip renders — a trending 9.0 (→9.6) must outrank a plain 9.4.
{
  const rows = [
    { id: "plain", name: "plain", rating: 4.8, reviews: 4000, distance_mi: 3 },
    { id: "hot", name: "hot", rating: 4.6, reviews: 3000, distance_mi: 3, trending: true, trend_reason: "Trending with locals" },
  ];
  const out = byVisibleScore(rows.map((r) => ({ ...r })));
  const hot = out.find((r) => r.id === "hot");
  ok(hot.governed_score === governedWayfindScore(wayfindScore(4.6, 3000), { trending: true }),
    "the carried governed_score includes the trending bump — the sort key IS the shown number");
  for (let i = 1; i < out.length; i++) {
    ok((out[i - 1].governed_score ?? -Infinity) >= (out[i].governed_score ?? -Infinity),
      "with trending in play the list stays monotonic in the displayed score");
  }
}

// ── 2c. THE DISCLOSURE (the condition the bump exists under) ────────────────
// Every surface that ranks through byVisibleScore renders the 🔥 reason when
// a row carries the bump. Assert the RENDER POSITION (role, not substring):
// a conditional on the row's trending flag emitting the reason.
{
  const bn = readFileSync(path.resolve("app/components/BestNearby.js"), "utf8");
  ok(/\{p\.trending \? <Flame reason=\{p\.trend_reason\} \/> : null\}/.test(bn) &&
     /\{r\.trending \? <Flame reason=\{r\.trend_reason\} \/> : null\}/.test(bn),
    "BestNearby: BOTH ranked row types (eat + todo) render the 🔥 flame off the row's own trending flag");
  ok((bn.match(/<TrendReason r=\{[pr]\} \/>/g) || []).length >= 2,
    "BestNearby: the visible reason renders beside the score chip on both row types");
  const ttd = readFileSync(path.resolve("app/components/ThingsToDoList.js"), "utf8");
  ok(/r\.trending && r\.trend_reason \?/.test(ttd), "ThingsToDoList: the reason chip renders off the row's trending flag");
  ok(/Number\.isFinite\(r\.governed_score\)\s*\n?\s*\? toDisplayScore\(r\.governed_score\)/.test(ttd),
    "ThingsToDoList: the badge shows governed_score — the number that sorted the row — not a re-derived base");
  const tb = readFileSync(path.resolve("app/components/TodaysBest.js"), "utf8");
  ok(/p\.trending && p\.trend_reason \?/.test(tb), "TodaysBest: the reason renders beside the chip");
  const tbl = readFileSync(path.resolve("lib/todaysBest.js"), "utf8");
  ok(/trending: !!r\.trending/.test(tbl), "byVisibleScore passes the row's trending flag into the governed score");
  ok((tbl.match(/await attachTrendSignals\(/g) || []).length >= 2,
    "BOTH fetchers (fetchTodaysBest + fetchThingsToDo) attach the unified signal BEFORE the sort — count, don't grep (one dropped call site must go red)");
}

// ── 3. Shown == sorted, end to end on the real list ─────────────────────────
{
  const rows = [
    { id: "far-great", rating: 4.9, reviews: 5000, distance_mi: 30, kind: "place" },
    { id: "near-good", rating: 4.6, reviews: 3000, distance_mi: 5, kind: "place" },
    { id: "mid", rating: 4.5, reviews: 5800, distance_mi: 10.5, kind: "place" },
  ];
  const sorted = byVisibleScore(rows);
  ok(sorted.every((r, i) => i === 0 || (sorted[i - 1].governed_score ?? -Infinity) >= (r.governed_score ?? -Infinity)),
    "byVisibleScore renders in governed-score order — a higher chip can never sit below a lower one");
  ok(sorted.every((r) => r.governed_score === governedWayfindScore(wayfindScore(r.rating, r.reviews), { hasCreatorVideo: !!r.creator_video, distanceMi: r.distance_mi })),
    "the carried governed_score IS the law applied to the row's own facts");
}

// ── 4. The display path applies the same law ────────────────────────────────
ok(displayedWfScore({ id: "g", name: "g", wfScore: 90, distMi: 20 }) === 88,
  "displayedWfScore carries the −2 past 17 miles — the chip admits the drive");
ok(displayedWfScore({ id: "g", name: "g", wfScore: 90, distMi: 10 }) === 90, "inside 17 miles the chip is the base");
ok(displayedWfScore({ id: "g", name: "g", wfScore: null }) === null, "'Score pending' contract intact");

// ── 5. The retired models stay retired, by source ───────────────────────────
const TB = readFileSync(path.join(REPO, "lib/todaysBest.js"), "utf8");
ok(!/PROXIMITY_PER_MI/.test(TB), "the per-mile decay is gone from todaysBest — the law's flat −0.2 replaced it");
ok(!/capCreatorHead\(/.test(TB), "no head cap reorders the answer-first list against the governed score");
const HOME = readFileSync(path.join(REPO, "app/home.js"), "utf8");
ok(!/\(_d - 4\) \* 1\.3/.test(HOME), "the v4.24 hidden 1.3/mi model is gone from the personalised feed");
ok((HOME.match(/hasCreatorVideoAt\(p\) \? CREATOR_VIDEO_BONUS : 0/g) || []).length >= 5,
  "every home.js ranking site applies the flat law term");
const LANDING = readFileSync(path.join(REPO, "lib/landing.js"), "utf8");
ok(!/Math\.min\(30, \(mi - 4\) \* 1\.3\)/.test(LANDING), "the landing pages' 1.3/mi model is gone");
ok(/governedWayfindScore\(/.test(LANDING), "…and the landing rank runs through the governed score");


// ── THE OWNER'S 2026-08-07 14:47Z SCREENSHOT, AS A FIXTURE ──────────────────
// Six real rows from his Bradenton feed, ratings/reviews/distances as shown:
// the pre-law bundle rendered 9.2s (Rocco's 3.7mi, Yard House 3.4mi) ABOVE
// 9.3s (Two Scoops 20mi, Small Town Creamery 18mi) — the hidden per-mile
// penalty. The law forbids that forever: run his exact case through the REAL
// byVisibleScore and assert the emitted order is monotonic in the displayed
// governed score. If this ever goes red, the inversion he reported is back.
{
  const { byVisibleScore } = await import(path.resolve("lib/todaysBest.js"));
  const shot = [
    { name: "American Honey Creamery", rating: 4.7, reviews: 737, distance_mi: 13 },
    { name: "Rocco's Tacos & Tequila Bar", rating: 4.6, reviews: 7055, distance_mi: 3.7 },
    { name: "Yard House", rating: 4.6, reviews: 2609, distance_mi: 3.4 },
    { name: "Two Scoops", rating: 4.7, reviews: 1477, distance_mi: 20 },
    { name: "Small Town Creamery", rating: 4.7, reviews: 602, distance_mi: 18 },
    { name: "Anna Maria Island Beach Cafe", rating: 4.5, reviews: 900, distance_mi: 18 },
  ];
  const out = byVisibleScore(shot.map((r) => ({ ...r })));
  ok(out.length === shot.length, "the screenshot fixture survives ranking intact (no row dropped)");
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1].governed_score, b = out[i].governed_score;
    ok(a >= b, `screenshot fixture stays monotonic: ${out[i - 1].name} (${a}) may not rank above a HIGHER-scored ${out[i].name} (${b})`);
  }
  const twoScoops = out.find((r) => r.name === "Two Scoops");
  const roccos = out.find((r) => r.name === "Rocco's Tacos & Tequila Bar");
  ok(out.indexOf(twoScoops) < out.indexOf(roccos) === (twoScoops.governed_score > roccos.governed_score),
    "the exact pair he circled (Two Scoops vs Rocco's) orders by the displayed number, whichever way the scores fall");
}

// ── THE CHIP MUST SHOW THE SORTED NUMBER (2026-08-07 root cause) ────────────
// BestNearby ranked every row by byVisibleScore (governed_score) then handed
// the score chip a STRIPPED { rating, reviews } with no distance, so the chip
// recomputed the BASE and a 9.3 base sat below a 9.2 governed. Two locks:
//
// 1. On the screenshot fixture, the DISPLAYED (rounded /10) governed number is
//    non-increasing down the sorted list — i.e. no visible inversion is
//    possible once the chip reads governed_score.
{
  const toDisp = (v) => (v == null ? null : Math.round((v / 10) * 10) / 10);
  const shot = [
    { name: "American Honey Creamery", rating: 4.7, reviews: 737, distance_mi: 13 },
    { name: "Rocco's Tacos & Tequila Bar", rating: 4.6, reviews: 7055, distance_mi: 3.7 },
    { name: "Yard House", rating: 4.6, reviews: 2609, distance_mi: 3.4 },
    { name: "Two Scoops", rating: 4.7, reviews: 1477, distance_mi: 20 },
    { name: "Small Town Creamery", rating: 4.7, reviews: 602, distance_mi: 18 },
  ];
  const out = byVisibleScore(shot.map((r) => ({ ...r })));
  for (let i = 1; i < out.length; i++) {
    const a = toDisp(out[i - 1].governed_score), b = toDisp(out[i].governed_score);
    ok(a >= b, `displayed chip is non-increasing down the sorted list: ${out[i-1].name} shows ${a} then ${out[i].name} shows ${b}`);
  }
}
// 2. The kit chip PREFERS governed_score, and BestNearby's ranked place rows
//    pass the FULL row (which carries it), never a stripped { rating, reviews }.
{
  const kit = readFileSync(path.resolve("app/components/kit.js"), "utf8");
  ok(/Number\.isFinite\(p\.governed_score\)\s*\?\s*p\.governed_score/.test(kit),
    "PlaceScoreChip prefers p.governed_score — the exact number the sort used — over a recompute that can drift from it");
  const bn = readFileSync(path.resolve("app/components/BestNearby.js"), "utf8");
  // The two RANKED place-row chips (eat + todo) must receive the whole row.
  ok((bn.match(/<PlaceScoreChip p=\{p\}/g) || []).length >= 1 && (bn.match(/<PlaceScoreChip p=\{r\}/g) || []).length >= 1,
    "BestNearby's ranked rows pass the full row object to the chip (carrying governed_score + distance), not a stripped pair");
  // The specific regression: a ranked place row must NOT feed the chip a bare
  // { rating: X.rating, reviews: X.reviews } — that strips distance and defeats
  // the governing law. (The Viator EXPERIENCE row legitimately has no wayfind
  // score/distance, so one stripped pair — r.rating/r.reviews on a tour — is
  // allowed; assert there is at most that one.)
  const stripped = (bn.match(/<PlaceScoreChip p=\{\{ rating:/g) || []).length;
  ok(stripped <= 1, `at most the one tour row strips the chip input (got ${stripped}) — a ranked place row that strips it recreates the shown!=sorted inversion`);
}

console.log(`check-score-law: OK — ${pass} assertions (the governing rule: +0.7 creator video, −0.2 past 17mi, shown == sorted, null stays null, ties-only diversity)`);
