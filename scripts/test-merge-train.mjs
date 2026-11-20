#!/usr/bin/env node
// test-merge-train — the merge train's queue decision and wiring (2026-11-13).
// Hermetic: no network, no git. The owner approval check was retired 2026-11-18.
import { readFileSync } from "node:fs";
import { planTrain, checkState, REQUIRED_CHECKS } from "./lib/mergeTrain.mjs";

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
p = planTrain([{ number: 5, behindBy: 2, mergeable: true, checks: { guards: pass } }, { number: 7, behindBy: 1, mergeable: true, checks: {} }]);
ok(p.type === "update" && p.number === 5, "oldest behind pull request is brought up to date first");
p = planTrain([{ number: 5, behindBy: 2, mergeable: true, checks: {} }, { number: 7, behindBy: 0, mergeable: true, checks: { guards: running } }]);
ok(p.type === "wait" && p.number === 7 && p.need.length === 0, "a current car with checks running holds the line: nothing else is updated (no race)");
p = planTrain([{ number: 7, behindBy: 0, mergeable: true, checks: { guards: cancelled } }]);
ok(p.type === "wait" && JSON.stringify(p.need) === '["guards"]', "a current car with no live guards run gets guards dispatched, and nothing else");
p = planTrain([{ number: 7, behindBy: 0, mergeable: true, checks: { guards: fail } }, { number: 9, behindBy: 3, mergeable: true, checks: {} }]);
ok(p.type === "update" && p.number === 9 && p.skipped.some((s) => s.number === 7), "a car whose guards failed on the merged result is stopped and leaves the queue; the next car moves");
p = planTrain([{ number: 7, behindBy: 4, mergeable: true, checks: { guards: fail } }, { number: 9, behindBy: 3, mergeable: false, checks: {} }, { number: 11, behindBy: 1, mergeable: true, checks: {} }]);
ok(p.type === "update" && p.number === 11 && p.skipped.length === 2, "failed and conflicting pull requests are skipped, not retried in a loop");
ok(JSON.stringify(REQUIRED_CHECKS) === '["guards"]', "guards is the only required check (owner approval retired 2026-11-18)");
p = planTrain([{ number: 7, behindBy: 0, mergeable: true, checks: { guards: pass, "owner-approval": fail } }]);
ok(p.type === "wait" && p.number === 7 && p.need.length === 0 && p.skipped.length === 0, "a stale owner-approval result never holds or skips a car with green guards");

// --- wiring
const wf = readFileSync(new URL("../.github/workflows/merge-train.yml", import.meta.url), "utf8");
ok(/sparse-checkout: scripts/.test(wf) && /ref: main/.test(wf) && !/pull_request/.test(wf) && /persist-credentials: false/.test(wf), "the train runs main's code only, never a pull request event or checkout");
ok(/cancel-in-progress: false/.test(wf) && /group: merge-train/.test(wf), "one train at a time");
const runner = readFileSync(new URL("./merge-train.mjs", import.meta.url), "utf8");
const guardsWf = readFileSync(new URL("../.github/workflows/guards.yml", import.meta.url), "utf8");
ok(/inputs\.pr/.test(guardsWf) && /GITHUB_EVENT_NAME=pull_request/.test(guardsWf) && /github\.sha/.test(guardsWf), "a train-dispatched guards run judges its own commit as that pull request (synthetic pull_request payload)");
ok(!/owner-approval|check-owner-approval-pr|\/check-runs"/.test(runner) && !/checks: write/.test(wf), "the train neither evaluates nor posts an owner-approval check, and has no checks-write permission");
ok(!/\/merge["`]/.test(runner) && !/git push|checkout/.test(runner.replace(/never checks out/g, "")), "the train never merges or pushes itself; auto-merge merges");
ok(/actions\/workflows\/guards\.yml\/runs\?head_sha=/.test(runner) && /"queued", "in_progress", "waiting", "requested", "pending"/.test(runner), "a guards run that is queued, in_progress, waiting, requested, or pending for the car's commit counts as running (no double dispatch)");
ok(/must\("POST", "\/actions\/workflows\/guards\.yml\/dispatches"/.test(runner) && /\/branches\/\$\{encodeURIComponent\(car\.ref\)\}/.test(runner), "dispatchGuards verifies branch tip matches car.head and fails loudly via must() if GitHub rejects workflow_dispatch");
const guardsTxt = readFileSync(new URL("./guards.txt", import.meta.url), "utf8");
ok(/node scripts\/test-merge-train\.mjs/.test(guardsTxt), "wired into guards.txt");

console.log(`test-merge-train: OK — ${checks} assertions: one car at a time, failed and conflicting cars leave the line, main-only wiring`);
