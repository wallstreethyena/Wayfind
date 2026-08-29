// scripts/test-member-score.mjs — locks B14. Member likes must never manufacture
// a score on a place that has NO base wfScore. Coercing null via (p.wfScore || 0)
// turned likes into ~0.6-1.2 (0-100 scale) -> a red "0.1/10" badge that also
// defeated the wfScore==null "Score pending" self-heal. A null base stays null.
import { memberDelta } from "../lib/ranking.js";
import { toDisplayScore } from "../lib/score.js";
import { withOwnerBump } from "../lib/ownerBump.js";
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
// v8.90 — RE-ANCHORED, and the invariant is now proven on BOTH layers instead
// of matched as one line. withMemberSignal grew a second step: the member nudge
// (`d`), then the owner's god bump (lib/ownerBump.js, +7 internal = +0.7 on the
// badge). A null base has to survive both, because either one coercing null to
// 0 produces the fake red "0.1/10" badge this whole file exists for — and the
// bump is the more dangerous of the two, since it is a flat +7 rather than a
// fractional nudge, i.e. a "0.7/10" on a place nobody has rated.
ok(/const nudged = p\.wfScore != null \? \+\(\(p\.wfScore \+ d\)\.toFixed\(2\)\) : p\.wfScore;/.test(home),
  "withMemberSignal nudges only a non-null base (null stays null)");
ok(/withOwnerBump\(nudged, g\.ownerPick === true\)/.test(home),
  "…and the owner bump is applied to THAT value, so it inherits the same null rule rather than re-deriving one");
// EXECUTED, not read: the bump layer's own null behaviour.
ok(withOwnerBump(null, true) === null,
  "the god bump on a null base stays null — a flat +7 on an unrated place would be a 0.7/10 badge, which is the same defect as the 0.1/10 this file was written for");
ok(withOwnerBump(82, true) === 89 && toDisplayScore(withOwnerBump(82, true)) === 8.9,
  "…and on a real base it is exactly +0.7 on the badge");
ok(!/wfScore: \+\(\(\(p\.wfScore \|\| 0\) \+ d\)/.test(home),
  "the old (p.wfScore || 0) coercion (red 0.1/10 source) is removed");

console.log(`test-member-score: OK — ${pass} assertions (member likes never fabricate a 0.1/10 on a null base)`);
