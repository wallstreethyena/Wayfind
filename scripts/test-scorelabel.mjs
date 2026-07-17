// scripts/test-scorelabel.mjs — locks B15. scoreLabel must agree with the badge's
// "Score pending" edge (null / 0 / negative -> null) instead of rendering "0.0" or
// "-0.0". It derives the display via toDisplayScore, so we prove that primitive's
// edge behavior (behavioral) and that scoreLabel is wired to it (static — kit.js is
// a JSX client component and can't be node-imported directly).
import { toDisplayScore } from "../lib/score.js";
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-scorelabel: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// The primitive scoreLabel now relies on: null on the pending edge, scaled otherwise.
ok(toDisplayScore(0) == null, "toDisplayScore(0) is null (Score pending)");
ok(toDisplayScore(-0.1) == null, "toDisplayScore(negative) is null");
ok(toDisplayScore(null) == null, "toDisplayScore(null) is null");
ok(toDisplayScore(68) === 6.8, "toDisplayScore(68) scales to 6.8");
ok(toDisplayScore(95) === 9.5, "toDisplayScore(95) scales to 9.5");

// Wiring: scoreLabel derives via toDisplayScore and returns null when it's null.
const kit = readFileSync(new URL("../app/components/kit.js", import.meta.url), "utf8");
ok(/export function scoreLabel\(wf\) \{[\s\S]{0,400}const d = toDisplayScore\(wf\);[\s\S]{0,80}if \(d == null\) return null;/.test(kit),
  "scoreLabel routes through toDisplayScore and returns null on the pending edge");
ok(!/if \(wf == null\) return null;\s*\n\s*const s = \(wf \/ 10\)\.toFixed\(1\);/.test(kit),
  "the old (wf/10).toFixed(1) with only a null-guard is gone (no 0.0 / -0.0 render)");

console.log(`test-scorelabel: OK — ${pass} assertions (scoreLabel agrees with the Score-pending edge)`);
