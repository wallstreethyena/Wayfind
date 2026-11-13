#!/usr/bin/env node
// test-merge-train — the merge train's queue decision and the owner approval
// carry it relies on (2026-11-13). Hermetic: no network, no git.
import { readFileSync } from "node:fs";
import { planTrain, checkState } from "./lib/mergeTrain.mjs";
import { carriedApproval, decideOwnerApproval, ownChangeFingerprint, ownerApprovedShas, OWNERS } from "./lib/ownerApproval.mjs";
import { readPullContext } from "./lib/githubPullEvidence.mjs";

let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { console.error(`test-merge-train: FAIL — ${msg}`); process.exit(1); } };

const pass = { status: "completed", conclusion: "success" };
const fail = { status: "completed", conclusion: "failure" };
const running = { status: "in_progress", conclusion: null };
const cancelled = { status: "completed", conclusion: "cancelled" };

// --- check states
ok(checkState(undefined) === "missing" && checkState(running) === "running" && checkState(pass) === "passed" && checkState(fail) === "failed" && checkState(cancelled) === "missing", "check states: missing, running, passed, failed, cancelled means run again");

// --- the queue
let p = planTrain([]);
ok(p.type === "idle", "empty queue is idle");
p = planTrain([{ number: 5, behindBy: 2, mergeable: true, checks: { guards: pass, "owner-approval": pass } }, { number: 7, behindBy: 1, mergeable: true, checks: {} }]);
ok(p.type === "update" && p.number === 5, "oldest behind pull request is brought up to date first");
p = planTrain([{ number: 5, behindBy: 2, mergeable: true, checks: {} }, { number: 7, behindBy: 0, mergeable: true, checks: { guards: running, "owner-approval": pass } }]);
ok(p.type === "wait" && p.number === 7 && p.need.length === 0, "a current car with checks running holds the line: nothing else is updated (no race)");
p = planTrain([{ number: 7, behindBy: 0, mergeable: true, checks: { guards: cancelled } }]);
ok(p.type === "wait" && p.need.includes("guards") && p.need.includes("owner-approval"), "a current car with no live guards run gets guards dispatched and owner approval evaluated");
p = planTrain([{ number: 7, behindBy: 0, mergeable: true, checks: { guards: fail, "owner-approval": pass } }, { number: 9, behindBy: 3, mergeable: true, checks: {} }]);
ok(p.type === "update" && p.number === 9 && p.skipped.some((s) => s.number === 7), "a car whose guards failed on the merged result is stopped and leaves the queue; the next car moves");
p = planTrain([{ number: 7, behindBy: 4, mergeable: true, checks: { guards: fail } }, { number: 9, behindBy: 3, mergeable: false, checks: {} }, { number: 11, behindBy: 1, mergeable: true, checks: {} }]);
ok(p.type === "update" && p.number === 11 && p.skipped.length === 2, "failed and conflicting pull requests are skipped, not retried in a loop");
p = planTrain([{ number: 7, behindBy: 0, mergeable: true, checks: { guards: pass, "owner-approval": fail } }, { number: 9, behindBy: 3, mergeable: true, checks: {} }]);
ok(p.type === "update" && p.number === 9 && p.skipped.some((s) => s.number === 7 && s.recheck), "a car waiting for an owner approval is rechecked every pass but does not block the line");

// --- owner approval carry across integration
const OWNER = OWNERS[0];
const T = { created_at: "2026-11-13T01:00:00Z", updated_at: "2026-11-13T01:00:00Z" };
const A = "a".repeat(40), H = "b".repeat(40), X = "c".repeat(40);
const approve = (sha, login = OWNER.login, id = OWNER.id, extra = {}) => ({ id: 9, ...T, ...extra, user: { login, id, type: "User" }, body: `/owner-approve ${sha}` });
const file = (patch, extra = {}) => ({ filename: "CLAUDE.md", status: "modified", patch, ...extra });
const fpApproved = ownChangeFingerprint([file("@@ -10,3 +10,4 @@ rules\n keep\n+new rule\n keep2")]);
const fpShifted = ownChangeFingerprint([file("@@ -40,3 +40,4 @@ other\n keep\n+new rule\n keep2")]);
const fpEdited = ownChangeFingerprint([file("@@ -40,3 +40,4 @@\n keep\n+new rule, weakened\n keep2")]);
const fpMoved = ownChangeFingerprint([file("@@ -80,3 +80,4 @@\n elsewhere\n+new rule\n keep2")]);
ok(fpApproved && fpApproved === fpShifted, "main moving the lines (new line numbers only) keeps the same own change");
ok(fpEdited !== fpApproved && fpMoved !== fpApproved, "editing the approved lines or moving them elsewhere changes the own change");
ok(ownChangeFingerprint([{ filename: "logo.png", status: "modified" }]) === null && ownChangeFingerprint([]) === null, "incomplete evidence never fingerprints (fails closed)");
ok(ownChangeFingerprint([{ filename: "logo.png", status: "modified", sha: "d".repeat(40) }]) !== null, "a binary file is compared by its blob id");

const carryOf = (atA, atH, extra = {}) => ({ fromSha: A, inPullCommits: true, ownChangeAtApproval: atA, ownChangeAtHead: atH, ...extra });
ok(carriedApproval([approve(A)], carryOf(fpApproved, fpShifted)), "an owner approval carries to an integration-only head");
ok(!carriedApproval([approve(A)], carryOf(fpApproved, fpEdited)), "a material change does not carry the approval");
ok(!carriedApproval([approve(A)], carryOf(fpApproved, fpShifted, { inPullCommits: false })), "an approved sha that is not a commit of this pull request does not carry");
ok(!carriedApproval([approve(A, "someone-else", 1)], carryOf(fpApproved, fpShifted)), "a non-owner approval never carries");
ok(!carriedApproval([approve(A, OWNER.login, OWNER.id, { updated_at: "2026-11-13T02:00:00Z" })], carryOf(fpApproved, fpShifted)), "an edited approval comment never carries");
ok(!carriedApproval([approve(A)], carryOf(null, null)) && !carriedApproval([approve(A)], null), "missing evidence never carries");

const ev = (carry) => ({ changedPaths: ["CLAUDE.md"], mergeGate: true, pr: { number: 1, eventHeadSha: H, liveHeadSha: H }, comments: [approve(A)], error: null, carry });
ok(decideOwnerApproval(ev(carryOf(fpApproved, fpShifted))).ok === true, "decision: approval of an earlier head passes after main is merged in, with no new approval");
ok(decideOwnerApproval(ev(carryOf(fpApproved, fpEdited))).ok === false, "decision: a material change after approval still needs a new approval");
ok(decideOwnerApproval(ev(null)).ok === false, "decision: no carry evidence keeps the exact-head rule");
ok(decideOwnerApproval({ ...ev(carryOf(fpApproved, fpShifted)), pr: { number: 1, eventHeadSha: X, liveHeadSha: H } }).ok === false, "decision: a moved head is still refused even with a carry");
ok(JSON.stringify(ownerApprovedShas([approve(A), approve(H, "someone-else", 1)])) === JSON.stringify([A]), "only owner approvals are carry candidates");

// --- train and dispatched-guards context
const base = { GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.com" };
let ctx = readPullContext({ ...base, GITHUB_EVENT_NAME: "merge-train", WF_PR_NUMBER: "2440", WF_PR_HEAD: H }, ["pull_request_target", "merge-train"]);
ok(!ctx.error && ctx.number === 2440 && ctx.eventHeadSha === H, "a train run names the pull request and the exact head it judges");
ctx = readPullContext({ ...base, GITHUB_EVENT_NAME: "merge-train", WF_PR_NUMBER: "2440", WF_PR_HEAD: "" }, ["merge-train"]);
ok(Boolean(ctx.error), "a train run without the judged head is refused");
ctx = readPullContext({ ...base, GITHUB_EVENT_NAME: "merge-train", WF_PR_NUMBER: "2440", WF_PR_HEAD: H }, ["pull_request_target"]);
ok(Boolean(ctx.error), "a caller that does not accept train runs still refuses them");
ctx = readPullContext({ ...base, GITHUB_EVENT_NAME: "workflow_dispatch", WF_PR_NUMBER: "", WF_PR_HEAD: H }, ["pull_request", "workflow_dispatch"]);
ok(Boolean(ctx.error), "a hand-dispatched guards run with no pull request named cannot find an approval");

// --- wiring
const wf = readFileSync(new URL("../.github/workflows/merge-train.yml", import.meta.url), "utf8");
ok(/sparse-checkout: scripts/.test(wf) && /ref: main/.test(wf) && !/pull_request/.test(wf) && /persist-credentials: false/.test(wf), "the train runs main's code only, never a pull request event or checkout");
ok(/cancel-in-progress: false/.test(wf) && /group: merge-train/.test(wf), "one train at a time");
const guardsWf = readFileSync(new URL("../.github/workflows/guards.yml", import.meta.url), "utf8");
ok(/WF_PR_NUMBER: \$\{\{ inputs\.pr \}\}/.test(guardsWf) && /WF_PR_HEAD: \$\{\{ github\.sha \}\}/.test(guardsWf), "dispatched guards runs name the pull request and judge their own commit");
const runner = readFileSync(new URL("./merge-train.mjs", import.meta.url), "utf8");
ok(!/\/merge["`]/.test(runner) && !/git push|checkout/.test(runner.replace(/never checks out/g, "")), "the train never merges or pushes itself; auto-merge merges");
const guardsTxt = readFileSync(new URL("./guards.txt", import.meta.url), "utf8");
ok(/node scripts\/test-merge-train\.mjs/.test(guardsTxt), "wired into guards.txt");

console.log(`test-merge-train: OK — ${checks} assertions: one car at a time, failed and conflicting cars leave the line, approval carries only across integration-only heads, material changes need a new approval, train runs judge an exact head, main-only wiring`);
