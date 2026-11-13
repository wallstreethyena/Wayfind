#!/usr/bin/env node
// test-merge-train — the merge train's queue decision and wiring (2026-11-13).
// Owner approval across train updates is tested in test-owner-approval-v2.mjs. Hermetic: no network, no git.
import { readFileSync } from "node:fs";
import { planTrain, checkState } from "./lib/mergeTrain.mjs";
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

// --- train and dispatched-guards context
const base = { GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.com" };
const H = "b".repeat(40);
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

console.log(`test-merge-train: OK — ${checks} assertions: one car at a time, failed and conflicting cars leave the line, train runs judge an exact head, main-only wiring`);
