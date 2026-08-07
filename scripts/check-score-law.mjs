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
import { governedWayfindScore, wayfindScore, CREATOR_VIDEO_BONUS, FAR_MILES, FAR_PENALTY } from "../lib/wayfindScore.js";
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

console.log(`check-score-law: OK — ${pass} assertions (the governing rule: +0.7 creator video, −0.2 past 17mi, shown == sorted, null stays null, ties-only diversity)`);
