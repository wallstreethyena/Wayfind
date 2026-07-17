// scripts/test-member-score.mjs — locks B14. Member likes must never manufacture
// a score on a place that has NO base wfScore. Coercing null via (p.wfScore || 0)
// turned likes into ~0.6-1.2 (0-100 scale) -> a red "0.1/10" badge that also
// defeated the wfScore==null "Score pending" self-heal. A null base stays null.
import { memberDelta } from "../lib/ranking.js";
import { toDisplayScore } from "../lib/score.js";
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-member-score: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// The trigger exists: member likes / reviews produce a positive delta.
ok(memberDelta({ likes: 5 }) > 0, "member likes produce a positive delta (the former 0.1/10 source)");
ok(memberDelta({ authors: 4 }) > 0, "member reviews produce a positive delta");

// The FIXED rule: a null base + a positive delta stays null (not 0 + delta).
const applyFixed = (base, d) => (base != null ? +((base + d).toFixed(2)) : base);
ok(applyFixed(null, memberDelta({ likes: 5 })) === null, "null base + member likes stays null (Score pending self-heals)");
ok(applyFixed(82, memberDelta({ likes: 5 })) > 82, "a REAL base score still gets the member nudge");

// null display score is null -> the self-heal condition holds.
ok(toDisplayScore(null) == null, "toDisplayScore(null) is null");

// Wiring: home.js only nudges a non-null base; the old (p.wfScore || 0) is gone.
const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
ok(/wfScore: p\.wfScore != null \? \+\(\(p\.wfScore \+ d\)\.toFixed\(2\)\) : p\.wfScore/.test(home),
  "withMemberSignal nudges only a non-null base (null stays null)");
ok(!/wfScore: \+\(\(\(p\.wfScore \|\| 0\) \+ d\)/.test(home),
  "the old (p.wfScore || 0) coercion (red 0.1/10 source) is removed");

console.log(`test-member-score: OK — ${pass} assertions (member likes never fabricate a 0.1/10 on a null base)`);
