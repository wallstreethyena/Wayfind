// test-no-owner-comment-gate — locks the owner decision of 2026-11-14:
// "remove the rule to place comment, I NEVER request owner comment ever again."
// No file is owner-only, so no PR ever needs an /owner-approve comment. Asserts on the CALL
// (decideOwnerApproval / ownerOnlyChanges / isOwnerOnly), not on source text, with a positive
// control proving the probe still sees the paths that used to be locked.
import { OWNER_ONLY, isOwnerOnly, ownerOnlyChanges, decideOwnerApproval } from "./lib/ownerApproval.mjs";

let n = 0;
const fails = [];
const ok = (cond, msg) => { n++; if (!cond) fails.push(msg); };

const formerlyLocked = [
  "AGENTS.md", "agents.md", "CLAUDE.md", "LOCKS.md", "QUEUE.md", "docs/card-standard.md",
  "scripts/check-doc-ownership.mjs", "scripts/lib/ownerApproval.mjs", "scripts/owner-approval-gate.mjs",
  "scripts/check-owner-approval-pr.mjs", "scripts/lib/githubPullEvidence.mjs",
  ".github/workflows/guards.yml", ".github/workflows/owner-approval.yml", ".github/CODEOWNERS",
];

ok(Array.isArray(OWNER_ONLY) && OWNER_ONLY.length === 0, "OWNER_ONLY is empty: no path needs an owner comment (got " + OWNER_ONLY.length + " patterns)");
for (const p of formerlyLocked) ok(isOwnerOnly(p) === false, `${p} is not owner-only`);
ok(ownerOnlyChanges(formerlyLocked).length === 0, "a PR touching every formerly locked file has no owner-only changes");

// The gate decision: local run and merge-gate run, with no comments at all, both pass.
const local = decideOwnerApproval({ changedPaths: formerlyLocked, mergeGate: false, comments: [], pr: null, error: null });
ok(local.ok === true, "local run with formerly locked files passes without approval: " + local.reason);
const gate = decideOwnerApproval({ changedPaths: formerlyLocked, mergeGate: true, comments: [], pr: { number: 1, eventHeadSha: "a".repeat(40), liveHeadSha: "b".repeat(40) }, error: "evidence unreadable" });
ok(gate.ok === true && !/owner-approve/.test(gate.reason), "merge gate passes with no comments, a moved head and unreadable evidence; never asks for /owner-approve: " + gate.reason);

// Positive control: the probe really receives these paths (an empty input would pass trivially).
ok(formerlyLocked.length === 14 && formerlyLocked.includes(".github/workflows/guards.yml"), "positive control: the probe covers .github workflows and the gate code");

if (fails.length) { console.error("test-no-owner-comment-gate: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`test-no-owner-comment-gate: OK — ${n} assertions; ${formerlyLocked.length} formerly locked paths need no owner comment`);
