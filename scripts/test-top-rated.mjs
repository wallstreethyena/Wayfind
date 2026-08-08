// scripts/test-top-rated.mjs — locks the ONE invariant behind the recurring
// "the list isn't sorted best-to-worst" bug: every "Top rated" sort in the app
// orders by the DISPLAYED Wayfind Score, best to worst, reviews break ties, and
// DISTANCE NEVER MATTERS. Uses the shared lib/ranking.byTopRated, and statically
// asserts no view reintroduces a divergent inline rated-sort (that drift is what
// kept bringing this back).
import { byTopRated } from "../lib/ranking.js";
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-top-rated: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── behavior ────────────────────────────────────────────────────────────────
//
// SCALE (v6.63). These fixtures were written on the /10 DISPLAY scale (9.4,
// 9.8). `wfScore` on a real row is the 0–100 INTERNAL scale — lib/score.js:
// "the app stores wfScore on 0–100; every user-facing surface divides by 10".
// It never mattered while the comparator was a bare subtraction of two
// same-scale numbers, and it matters now that byTopRated runs the governed law,
// whose terms (+7 video, −2 past 17mi, +6 trending) are 0–100 quantities: fed a
// 9.8, the −2 reads as −0.2 of the whole scale instead of −0.02. Fixtures are
// restated at ×10. Same assertions, correct units.
//
// DISTANCE (v6.63). The old wording was "distance NEVER matters" / "distance
// NEVER lifts a lower score above a higher one". Since the governing law
// (lib/wayfindScore.js, owner 2026-08-07) distance is worth a visible −0.2 past
// 17 miles and that term is INSIDE the displayed number. So the invariant is
// now stated exactly as this file's own title always claimed it: order by the
// DISPLAYED score. Distance may only move a row by moving the number the reader
// can see; it may never act as a hidden term on top of it. The assertions below
// pin both halves of that.
ok([{ wfScore: 94, reviews: 8000, distMi: 1 }, { wfScore: 98, reviews: 4000, distMi: 3 }].sort(byTopRated)[0].wfScore === 98,
  "higher Wayfind Score ranks first even when it's closer AND more-reviewed (the Ford's 9.4-over-Turmeric-9.8 bug)");
ok([{ wfScore: 80, reviews: 5, distMi: 0.1 }, { wfScore: 90, reviews: 5, distMi: 99 }].sort(byTopRated)[0].wfScore === 90,
  "distance NEVER lifts a lower score above a higher one — 90−2=88 still beats 80, because the law's deduction is 0.2 shown, not a per-mile decay");
ok([{ wfScore: 90, reviews: 10 }, { wfScore: 90, reviews: 50 }].sort(byTopRated)[0].reviews === 50,
  "equal score -> more reviews first (deterministic tiebreak)");
const seq = [{ wfScore: 70 }, { wfScore: 99 }, { wfScore: 40 }, { wfScore: 85 }].sort(byTopRated).map((p) => p.wfScore);
ok(seq.every((v, i) => i === 0 || seq[i - 1] >= v), "output is non-increasing by displayed score");
ok(byTopRated({}, {}) === 0 && Number.isFinite(byTopRated({ wfScore: 50 }, {})), "missing fields never throw");

// ── v6.63: the comparator IS the governing law, not the base score ──────────
// This is the assertion whose absence let the owner's 2026-08-08 screenshot
// happen. byTopRated used to key on the raw `wfScore`, so the +0.7 a creator
// video adds to the DISPLAYED number was invisible to every "Top rated" sort in
// the app, and a card reading 10.0 rendered under a card reading 9.3.
{
  const withVideo = { id: "v", wfScore: 93, reviews: 191, creator_video: true, governed_score: 100 };
  const plain = { id: "p", wfScore: 93, reviews: 739, governed_score: 93 };
  ok([plain, withVideo].sort(byTopRated)[0].id === "v",
    "a row whose governed score is higher leads, even with a fraction of the reviews — the exact American Honey (9.3, 739 reviews) vs Ryan's Coffee (10.0, 191 reviews) inversion");
  const far = { id: "far", wfScore: 92, distMi: 40, reviews: 100 };
  const near = { id: "near", wfScore: 91, distMi: 2, reviews: 100 };
  ok([far, near].sort(byTopRated)[0].id === "near",
    "the law's visible −0.2 past 17 miles DOES reorder (92−2=90 < 91) — because it is in the chip the reader compares, which is the whole point");
  const hot = { id: "hot", wfScore: 90, trending: true, reviews: 100 };
  const cool = { id: "cool", wfScore: 94, reviews: 100 };
  ok([cool, hot].sort(byTopRated)[0].id === "hot",
    "trending's disclosed +0.6 is in the key too (90+6=96 > 94) — every term in the shown number is in the sort, and nothing else is");
}

// ── anti-recurrence: no divergent inline rated-sort survives ──────────────────
const files = ["app/home.js", "app/components/sheets/HookDetail.js", "app/components/screens/Experience.js"];
for (const f of files) {
  const src = readFileSync(new URL("../" + f, import.meta.url), "utf8");
  ok(/byTopRated/.test(src), f + " uses the shared byTopRated comparator");
  for (const line of src.split("\n")) {
    if (/=== "rated"/.test(line) && /\.sort\(/.test(line)) {
      ok(/byTopRated/.test(line), f + ': an inline "rated" sort must delegate to byTopRated — a divergent one is exactly the bug that kept coming back');
    }
  }
}

console.log(`test-top-rated: OK — ${pass} assertions (one shared score-only comparator; distance never affects Top rated; every rated sort unified)`);
