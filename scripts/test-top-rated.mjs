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
ok([{ wfScore: 9.4, reviews: 8000, distMi: 1 }, { wfScore: 9.8, reviews: 4000, distMi: 20 }].sort(byTopRated)[0].wfScore === 9.8,
  "higher Wayfind Score ranks first even when it's closer AND more-reviewed (the Ford's 9.4-over-Turmeric-9.8 bug)");
ok([{ wfScore: 8, reviews: 5, distMi: 0.1 }, { wfScore: 9, reviews: 5, distMi: 99 }].sort(byTopRated)[0].wfScore === 9,
  "distance NEVER lifts a lower score above a higher one");
ok([{ wfScore: 9, reviews: 10 }, { wfScore: 9, reviews: 50 }].sort(byTopRated)[0].reviews === 50,
  "equal score -> more reviews first (deterministic tiebreak)");
const seq = [{ wfScore: 7 }, { wfScore: 9.9 }, { wfScore: 4 }, { wfScore: 8.5 }].sort(byTopRated).map((p) => p.wfScore);
ok(seq.every((v, i) => i === 0 || seq[i - 1] >= v), "output is non-increasing by displayed score");
ok(byTopRated({}, {}) === 0 && Number.isFinite(byTopRated({ wfScore: 5 }, {})), "missing fields never throw");

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
