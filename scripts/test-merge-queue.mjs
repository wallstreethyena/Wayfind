#!/usr/bin/env node
/**
 * test-merge-queue — hermetic tests for the serial merge queue worker
 * (scripts/merge-queue.mjs + scripts/lib/mergeQueue.mjs). No network: a stateful
 * fake of the GitHub REST API is injected as `fetch`, and time is a fake clock, so
 * a 45 minute timeout takes microseconds.
 *
 * The fake is faithful where it matters to a merge queue: a pull request is "behind"
 * once main has moved, update-branch is pinned to expected_head_sha, merge is pinned
 * to sha and refused (405) when the base moved, a dispatched run only completes after
 * polling, and the squash commit's tree is the tested head's tree unless a test
 * deliberately corrupts it.
 *
 * Hermetic: every environment the worker sees is an explicit object built here; the
 * only process.env use is spreading it into a child process, as the guards allow.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runQueue, runCli, TreeMismatchError, RefusedError, MAX_MERGE_ATTEMPTS, POST_MERGE_PATH_WORKFLOWS } from "./merge-queue.mjs";
import { readFileSync } from "node:fs";
import { protectedFingerprint } from "./lib/ownerApproval.mjs";
import {
  pickNext, classify, STATES, pickGuardsCheck, pickDispatchedRun, treesEqual,
  readConfig, refuseUnlessMainOnActions, buildComment, isQueueable, guardsRunMismatch, isGuardsWorkflowRun,
} from "./lib/mergeQueue.mjs";

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

const API = "https://api.example.test";
const REPO = "o/r";
const OWNER = { login: "wallstreethyena", id: 297334934, type: "User" };
const ENV = Object.freeze({
  GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/main", GITHUB_TOKEN: "t",
  GITHUB_REPOSITORY: REPO, GITHUB_API_URL: API,
});
const FAST = { pollMs: 30_000, maxWaitMs: 45 * 60_000, locatePollMs: 5_000, locateMaxMs: 60_000, updatePollMs: 1_000, mergeablePollMs: 1_000 };

// ---- a fake GitHub ----------------------------------------------------------------
class FakeGitHub {
  constructor() {
    this.n = 0; this.clock = Date.UTC(2026, 10, 13, 12, 0, 0);
    this.commits = new Map(); this.prs = new Map(); this.runs = []; this.checkRuns = [];
    this.calls = []; this.logs = []; this.runSeq = 1000; this.mergeTreeOverride = null;
    this.haltIssues = []; this.haltAtCheck = 0; this.haltChecks = 0; this.suiteSeq = 5000;
    this.main = this.sha(); this.commits.set(this.main, { tree: this.sha() });
  }
  sha() { return (++this.n).toString(16).padStart(40, "0"); }
  iso() { return new Date(this.clock).toISOString(); }
  externalPush() { this.main = this.sha(); this.commits.set(this.main, { tree: this.sha() }); }
  addPr(number, o = {}) {
    const head = this.sha();
    this.commits.set(head, { tree: this.sha() });
    const pr = {
      number, state: "open", draft: false, base: "main", labels: ["merge-queue"], files: ["a.js"], comments: [],
      conflict: false, updateConflict: false, ci: "success", mergeFailures: 0, headSha: head, baseSha: this.main,
      headRef: `lane-${number}`, merged: false, ...o,
    };
    this.prs.set(number, pr);
    return pr;
  }
  behind(pr) { return pr.baseSha !== this.main; }
  pullObj(pr) {
    return {
      number: pr.number, state: pr.state, draft: pr.draft, base: { ref: pr.base },
      head: { sha: pr.headSha, ref: pr.headRef, repo: { full_name: REPO } },
      labels: pr.labels.map((name) => ({ name })), changed_files: pr.files.length,
      mergeable: pr.conflict ? false : true, mergeable_state: pr.conflict ? "dirty" : this.behind(pr) ? "behind" : "clean",
    };
  }
  byHead(sha) { return [...this.prs.values()].find((p) => p.headSha === sha); }
  mutating() { return this.calls.filter((c) => c.method !== "GET"); }
  find(method, re) { return this.calls.filter((c) => c.method === method && re.test(c.path)); }

  now = () => this.clock;
  sleep = async (ms) => { this.clock += ms; };
  log = (line) => { this.logs.push(line); };

  fetch = async (url, init = {}) => {
    const method = init.method || "GET";
    const full = String(url);
    const prefix = `${API}/repos/${REPO}`;
    if (!full.startsWith(prefix)) throw new Error(`fake GitHub: unexpected URL ${full}`);
    const p = full.slice(prefix.length);
    const body = init.body ? JSON.parse(init.body) : undefined;
    this.calls.push({ method, path: p, body });
    const reply = (status, data = null) => ({ status, ok: status >= 200 && status < 300, json: async () => data });
    let m;
    if (method === "GET" && (m = p.match(/^\/issues\?labels=([^&]+)/))) {
      const label = decodeURIComponent(m[1]);
      if (label === "merge-queue-halt") {
        this.haltChecks++;
        if (this.haltUnreadable) return reply(503, { message: "unavailable" });
        const raised = this.haltAtCheck > 0 && this.haltChecks >= this.haltAtCheck;
        return reply(200, [...this.haltIssues, ...(raised ? [{ number: 9999 }] : [])]);
      }
      return reply(200, [...this.prs.values()].filter((x) => x.state === "open" && x.labels.includes(label)).map((x) => ({ number: x.number, pull_request: {} })));
    }
    if (method === "GET" && (m = p.match(/^\/pulls\/(\d+)$/))) {
      const pr = this.prs.get(Number(m[1]));
      if (pr && pr.getFail) { if (pr.getFail === "throw") throw new Error("The operation was aborted due to timeout"); return reply(pr.getFail, { message: "unavailable" }); }
      return pr ? reply(200, this.pullObj(pr)) : reply(404, { message: "Not Found" });
    }
    if (method === "GET" && (m = p.match(/^\/pulls\/(\d+)\/files\?.*page=(\d+)/))) {
      const pr = this.prs.get(Number(m[1]));
      return reply(200, m[2] === "1" ? pr.files.map((filename) => ({ filename })) : []);
    }
    if (method === "GET" && (m = p.match(/^\/issues\/(\d+)\/comments\?.*page=(\d+)/))) {
      return reply(200, m[2] === "1" ? this.prs.get(Number(m[1])).comments : []);
    }
    if (method === "GET" && (m = p.match(/^\/compare\/main\.\.\.([0-9a-f]{40})$/))) {
      const pr = this.byHead(m[1]);
      return pr ? reply(200, { behind_by: this.behind(pr) ? 1 : 0, merge_base_commit: { sha: pr.baseSha } }) : reply(404, { message: "no such commit" });
    }
    // Protected-content evidence (git trees): a PR's files live at the root; their
    // blob is 1111… at the merge base and 2222… on any head.
    if (method === "GET" && (m = p.match(/^\/git\/commits\/([0-9a-f]{40})$/))) return reply(200, { tree: { sha: `t${m[1]}` } });
    if (method === "GET" && (m = p.match(/^\/git\/trees\/t([0-9a-f]{40})$/))) {
      const pr = [...this.prs.values()].find((x) => x.baseSha === m[1] || x.headSha === m[1]);
      const isBase = pr && pr.baseSha === m[1];
      return reply(200, { truncated: false, tree: (pr ? pr.files : []).map((f) => ({ path: f, type: "blob", mode: "100644", sha: (isBase ? "1" : "2").repeat(40) })) });
    }
    if (method === "PUT" && (m = p.match(/^\/pulls\/(\d+)\/update-branch$/))) {
      const pr = this.prs.get(Number(m[1]));
      if (body.expected_head_sha !== pr.headSha) return reply(422, { message: "expected head sha didn't match" });
      if (pr.updateConflict) return reply(422, { message: "merge conflict between base and head" });
      if (pr.updateError) return reply(pr.updateError, { message: "boom" });
      pr.headSha = this.sha(); this.commits.set(pr.headSha, { tree: this.sha() }); pr.baseSha = this.main;
      return reply(202, { message: "Updating pull request branch." });
    }
    if (method === "POST" && (m = p.match(/^\/actions\/workflows\/([\w.-]+)\/dispatches$/))) {
      if (m[1] !== "guards.yml") return reply(404, { message: "workflow not found" });
      if (body.ref === "main") { this.runs.push({ id: ++this.runSeq, check_suite_id: ++this.suiteSeq, path: ".github/workflows/guards.yml", head_sha: this.main, branch: "main", event: "workflow_dispatch", status: "queued", plan: null, polls: 0, created_at: this.iso(), html_url: "u" }); return reply(204); }
      const pr = [...this.prs.values()].find((x) => x.headRef === body.ref);
      if (!pr) return reply(422, { message: "no such ref" });
      if (pr.dispatchFail) return reply(pr.dispatchFail, { message: "bad gateway" });
      this.runs.push({ id: ++this.runSeq, check_suite_id: ++this.suiteSeq, path: ".github/workflows/guards.yml", head_sha: pr.headSha, branch: pr.headRef, event: "workflow_dispatch", status: "queued", conclusion: null, plan: pr.ci, polls: 0, created_at: this.iso(), html_url: `https://example.test/runs/${this.runSeq}`, inputs: body.inputs });
      if (pr.onDispatch) { const hook = pr.onDispatch; pr.onDispatch = null; hook(this, pr); }
      return reply(204);
    }
    if (method === "GET" && (m = p.match(/^\/actions\/workflows\/guards\.yml\/runs\?.*branch=([^&]+)/))) {
      const branch = decodeURIComponent(m[1]);
      return reply(200, { workflow_runs: this.runs.filter((r) => r.branch === branch).map((r) => ({ ...r })) });
    }
    if (method === "GET" && (m = p.match(/^\/actions\/runs\/(\d+)$/))) {
      const run = this.runs.find((r) => r.id === Number(m[1]));
      run.polls++;
      if (run.plan && run.plan !== "hang" && run.polls >= 2 && run.status !== "completed") {
        run.status = "completed"; run.conclusion = run.plan;
        const owner = this.byHead(run.head_sha);
        if (!(owner && owner.suppressGuardsCheck)) this.checkRuns.push({ id: ++this.runSeq, name: "guards", head_sha: run.head_sha, status: "completed", conclusion: run.plan, started_at: this.iso(), app: { id: 15368 }, check_suite: { id: run.check_suite_id } });
      }
      return reply(200, { ...run, ...(run.override || {}) });
    }
    if (method === "GET" && (m = p.match(/^\/commits\/([0-9a-f]{40})\/check-runs/))) {
      return reply(200, { check_runs: this.checkRuns.filter((c) => c.head_sha === m[1]) });
    }
    if (method === "POST" && p === "/check-runs") {
      this.checkRuns.push({ id: ++this.runSeq, ...body, started_at: this.iso(), app: { id: 15368 }, check_suite: { id: 1 } });
      const pr = this.byHead(body.head_sha);
      if (pr && pr.onCheckRun) { const hook = pr.onCheckRun; pr.onCheckRun = null; hook(this, pr); }
      return reply(201, {});
    }
    if (method === "PUT" && (m = p.match(/^\/pulls\/(\d+)\/merge$/))) {
      const pr = this.prs.get(Number(m[1]));
      if (pr.mergeFailures > 0) { pr.mergeFailures--; return reply(405, { message: "Base branch was modified. Review and try the merge again." }); }
      if (body.sha !== pr.headSha) return reply(409, { message: "Head branch was modified." });
      if (this.behind(pr)) return reply(405, { message: "Head branch is out of date." });
      const tree = this.mergeTreeOverride || this.commits.get(pr.headSha).tree;
      this.main = this.sha(); this.commits.set(this.main, { tree });
      pr.state = "closed"; pr.merged = true;
      const mergedAt = this.main;
      if (pr.afterMerge) pr.afterMerge(this, pr);
      return reply(200, { merged: true, sha: mergedAt });
    }
    if (method === "GET" && p === "/commits/main") return reply(200, { sha: this.main, commit: { tree: { sha: this.commits.get(this.main).tree } } });
    if (method === "GET" && (m = p.match(/^\/commits\/([0-9a-f]{40})$/))) {
      const c = this.commits.get(m[1]);
      return c ? reply(200, { sha: m[1], commit: { tree: { sha: c.tree } } }) : reply(404, { message: "no commit" });
    }
    if (method === "POST" && (m = p.match(/^\/issues\/(\d+)\/comments$/))) {
      this.prs.get(Number(m[1])).comments.push({ id: ++this.runSeq, body: body.body, user: { login: "github-actions[bot]", id: 41898282, type: "Bot" }, created_at: this.iso(), updated_at: this.iso() });
      return reply(201, {});
    }
    if (method === "DELETE" && (m = p.match(/^\/issues\/(\d+)\/labels\/(.+)$/))) {
      const pr = this.prs.get(Number(m[1])); const l = decodeURIComponent(m[2]);
      pr.labels = pr.labels.filter((x) => x !== l);
      return reply(200, []);
    }
    throw new Error(`fake GitHub: unhandled ${method} ${p}`);
  };
}

const drain = (gh, extraEnv = {}, opts = {}) =>
  runQueue({ env: { ...ENV, ...extraEnv }, fetchImpl: gh.fetch, sleep: gh.sleep, now: gh.now, log: gh.log, timing: FAST, ...opts });
const botComments = (pr) => pr.comments.filter((c) => c.user.type === "Bot").map((c) => c.body);

// ---- pure logic ---------------------------------------------------------------------
{
  const pr = (number, o = {}) => ({ number, state: "open", draft: false, base: { ref: "main" }, labels: [{ name: "merge-queue" }], ...o });
  ok(pickNext([pr(9), pr(3), pr(5)]).number === 3, "pickNext: oldest (lowest number) first");
  ok(pickNext([pr(1, { draft: true }), pr(2, { base: { ref: "dev" } }), pr(3, { labels: [] }), pr(4, { state: "closed" })]) === null, "pickNext: draft / other base / unlabelled / closed are never picked");
  ok(pickNext([pr(3), pr(5)], { skip: new Set([3]) }).number === 5, "pickNext: skip set honoured");
  ok(pickNext([pr(3, { labels: [{ name: "other" }] })], { label: "other" }).number === 3, "pickNext: custom label");
  ok(isQueueable(pr(1)) && !isQueueable(null), "isQueueable basics");

  ok(classify({ pr: { mergeable: false }, behindBy: 0 }) === STATES.CONFLICT, "classify: conflict");
  ok(classify({ pr: { mergeable_state: "dirty" }, behindBy: 0 }) === STATES.CONFLICT, "classify: dirty is a conflict");
  ok(classify({ pr: { mergeable: true }, behindBy: 2 }) === STATES.NEEDS_UPDATE, "classify: behind needs update");
  ok(classify({ pr: { mergeable: true }, behindBy: null }) === STATES.NEEDS_UPDATE, "classify: unknown behind-ness is not up to date");
  ok(classify({ pr: { mergeable: true }, behindBy: 0 }) === STATES.AWAITING_CI, "classify: no guards result yet");
  ok(classify({ pr: { mergeable: true }, behindBy: 0, guards: { conclusion: "failure" } }) === STATES.CI_FAILED, "classify: failed ci");
  ok(classify({ pr: { mergeable: true }, behindBy: 0, guards: { conclusion: "cancelled" } }) === STATES.CI_FAILED, "classify: anything but success is a failure");
  ok(classify({ pr: { mergeable: true }, behindBy: 0, guards: { conclusion: "success" }, approval: { ok: false } }) === STATES.APPROVAL_MISSING, "classify: approval missing");
  ok(classify({ pr: { mergeable: true }, behindBy: 0, guards: { conclusion: "success" }, approval: { ok: true } }) === STATES.READY, "classify: ready");

  const H = "a".repeat(40);
  const chk = (o) => ({ name: "guards", status: "completed", conclusion: "success", started_at: "2026-11-13T00:00:00Z", app: { id: 15368 }, id: 1, head_sha: H, check_suite: { id: 77 }, ...o });
  const pick = (list) => pickGuardsCheck(list, { checkSuiteId: 77, headSha: H });
  ok(pick([chk({ name: "guards (node 20)" })]) === null, "pickGuardsCheck: exact name only");
  ok(pick([chk({ app: { id: 999 } })]) === null, "pickGuardsCheck: only GitHub Actions' check counts");
  ok(pick([chk({ status: "in_progress" })]) === null, "pickGuardsCheck: unfinished is not a result");
  ok(pick([chk({ id: 1 }), chk({ id: 2, started_at: "2026-11-13T01:00:00Z", conclusion: "failure" })]).conclusion === "failure", "pickGuardsCheck: newest wins");
  ok(pick([chk({ check_suite: { id: 78 } })]) === null, "pickGuardsCheck: a same-named check from another run's check suite does not count");
  ok(pick([chk({ check_suite: undefined })]) === null, "pickGuardsCheck: a check with no check suite does not count");
  ok(pick([chk({ head_sha: "b".repeat(40) })]) === null, "pickGuardsCheck: a check on another sha does not count");
  ok(pick([chk({ check_suite: { id: 78 }, id: 5, started_at: "2026-11-13T09:00:00Z", conclusion: "failure" }), chk()]).conclusion === "success", "pickGuardsCheck: a newer decoy from another suite does not displace the real check");
  ok(pickGuardsCheck([chk()], { headSha: H }) === null && pickGuardsCheck([chk()], { checkSuiteId: 77 }) === null, "pickGuardsCheck: without a suite id and a head sha nothing can match");

  const run = (o) => ({ id: 1, event: "workflow_dispatch", path: ".github/workflows/guards.yml", check_suite_id: 77, head_sha: "a".repeat(40), created_at: "2026-11-13T12:00:10Z", ...o });
  const t0 = Date.parse("2026-11-13T12:00:00Z");
  ok(pickDispatchedRun([run({ path: ".github/workflows/other.yml" })], { headSha: "a".repeat(40), notBeforeMs: t0 }) === null, "pickDispatchedRun: workflow path must be the guards workflow");
  ok(pickDispatchedRun([run({ path: ".github/workflows/guards.yml@refs/heads/x" })], { headSha: "a".repeat(40), notBeforeMs: t0 }) !== null && !isGuardsWorkflowRun({ path: ".github/workflows/guards.yml.evil" }), "pickDispatchedRun: an @ref suffix is tolerated, a look-alike file is not");
  const gm = (o) => guardsRunMismatch(run(o), { headSha: "a".repeat(40), notBeforeMs: t0 });
  ok(gm({}) === null && gm({ path: "x" }) && gm({ event: "push" }) && gm({ head_sha: "b".repeat(40) }) && gm({ created_at: "2026-11-13T11:00:00Z" }) && gm({ check_suite_id: undefined }), "guardsRunMismatch: exact identity passes, every other path/event/sha/time/suite fails");
  ok(pickDispatchedRun([run({ event: "push" })], { headSha: "a".repeat(40), notBeforeMs: t0 }) === null, "pickDispatchedRun: only workflow_dispatch");
  ok(pickDispatchedRun([run({ head_sha: "b".repeat(40) })], { headSha: "a".repeat(40), notBeforeMs: t0 }) === null, "pickDispatchedRun: head sha must match");
  ok(pickDispatchedRun([run({ created_at: "2026-11-13T11:00:00Z" })], { headSha: "a".repeat(40), notBeforeMs: t0 }) === null, "pickDispatchedRun: must be created after the dispatch");
  ok(pickDispatchedRun([run({ id: 7 })], { headSha: "a".repeat(40), notBeforeMs: t0, knownIds: new Set([7]) }) === null, "pickDispatchedRun: pre-existing run ids are excluded");
  ok(pickDispatchedRun([run({ id: 7 }), run({ id: 8 })], { headSha: "a".repeat(40), notBeforeMs: t0 }).id === 8, "pickDispatchedRun: newest matching run");

  const t = "1".repeat(40);
  ok(treesEqual(t, t) && !treesEqual(t, "2".repeat(40)) && !treesEqual(undefined, undefined) && !treesEqual("x", "x"), "treesEqual: equal full shas only");

  ok(refuseUnlessMainOnActions({}) !== null, "refusal: no GITHUB_ACTIONS");
  ok(refuseUnlessMainOnActions({ GITHUB_ACTIONS: "true", GITHUB_REF: "refs/pull/1/merge" }) !== null, "refusal: not main");
  ok(refuseUnlessMainOnActions({ GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/main" }) === null, "refusal: Actions on main is allowed");
  const cfg = readConfig({ GITHUB_TOKEN: "t", GITHUB_REPOSITORY: REPO });
  ok(cfg.error === null && cfg.label === "merge-queue" && cfg.guardsFile === "guards.yml" && cfg.dryRun === false && cfg.api === "https://api.github.com", "readConfig: defaults");
  ok(readConfig({ ...ENV, MERGE_QUEUE_DRY_RUN: "1", MERGE_QUEUE_LABEL: "q", GUARDS_WORKFLOW_FILE: "g.yml" }).dryRun === true, "readConfig: dry run, label, workflow overrides");
  ok(readConfig({ ...ENV, GITHUB_TOKEN: "" }).error && readConfig({ ...ENV, GITHUB_REPOSITORY: "x" }).error && readConfig({ ...ENV, GITHUB_API_URL: "http://x" }).error && readConfig({ ...ENV, GUARDS_WORKFLOW_FILE: "../x" }).error, "readConfig: missing/malformed inputs are errors");
  ok(buildComment("conflict") === "Merge queue: conflicts with main; restack and re-label.", "buildComment: exact conflict text");
  ok(/runs\/9/.test(buildComment("ci-failed", { head: "a".repeat(40), runUrl: "https://x/runs/9" })), "buildComment: ci-failed carries the run URL");
}

// ---- happy path: label-less / draft / other-base PRs are untouched ------------------------
{
  const gh = new FakeGitHub();
  const p5 = gh.addPr(5);
  const p6 = gh.addPr(6, { draft: true });
  const p7 = gh.addPr(7, { labels: [] });
  const p9 = gh.addPr(9, { base: "dev" });
  const head5 = p5.headSha;
  const r = await drain(gh);
  ok(r.merged.length === 1 && r.merged[0].number === 5 && r.dropped.length === 0, "happy: exactly #5 merged");
  ok(p5.merged && !p6.merged && !p7.merged && !p9.merged, "happy: draft, unlabelled and other-base PRs not merged");
  const touched = gh.mutating().filter((c) => /\/(6|7|9)(\/|$)/.test(c.path) || (c.body && ["lane-6", "lane-7", "lane-9"].includes(c.body.ref)));
  ok(touched.length === 0, "happy: no write call touched #6, #7 or #9 (labels, comments and merges all untouched)");
  ok(gh.find("PUT", /update-branch/).length === 0, "happy: an up-to-date PR is not updated");
  const merge = gh.find("PUT", /\/pulls\/5\/merge/);
  ok(merge.length === 1 && merge[0].body.merge_method === "squash" && merge[0].body.sha === head5 && !("commit_message" in merge[0].body) && !("commit_title" in merge[0].body), "happy: squash merge pinned to the tested head, GitHub's default message kept (Lane: trailers survive)");
  const dispatches = gh.find("POST", /dispatches/);
  ok(dispatches.length === 2 && dispatches[0].body.ref === "lane-5" && dispatches[0].body.inputs.pr === "5" && dispatches[1].body.ref === "main" && !dispatches[1].body.inputs, "happy: guards dispatched on the branch with pr input, then on main after the merge");
  const cr = gh.find("POST", /\/check-runs$/);
  ok(cr.length === 1 && cr[0].body.name === "owner-approval" && cr[0].body.head_sha === head5 && cr[0].body.status === "completed" && cr[0].body.conclusion === "success" && /no owner-only files/.test(cr[0].body.output.summary), "happy: owner-approval check-run posted success on the tested head");
  const idx = (re, method) => gh.calls.findIndex((c) => c.method === method && re.test(c.path));
  ok(idx(/dispatches/, "POST") < idx(/check-runs$/, "POST") && idx(/check-runs$/, "POST") < idx(/merge$/, "PUT") && idx(/merge$/, "PUT") < gh.calls.findLastIndex((c) => /dispatches/.test(c.path)), "happy: order is guards, approval, merge, main guards");
  ok(p5.labels.length === 0 && p6.labels.length === 1 && p7.labels.length === 0 && p9.labels.length === 1, "happy: label removed from the merged PR only");
  ok(gh.logs.some((l) => new RegExp(`merged #5 sha=${gh.main} tree-proof=PASS`).test(l)), "happy: one log line 'merged #n sha=... tree-proof=PASS'");
  ok(!gh.calls.some((c) => c.method === "DELETE" && !/\/labels\//.test(c.path)) && !gh.calls.some((c) => /git\/refs|force/.test(c.path)), "happy: never deletes a branch or touches refs");
}

// ---- empty queue --------------------------------------------------------------------------
{
  const gh = new FakeGitHub();
  const r = await drain(gh);
  ok(r.merged.length === 0 && r.dropped.length === 0 && gh.mutating().length === 0, "empty queue: exits cleanly doing nothing");
}

// ---- serial order, and the second PR is updated because main moved -----------------------
{
  const gh = new FakeGitHub();
  const p12 = gh.addPr(12);
  const p8 = gh.addPr(8);
  const old12 = p12.headSha;
  const r = await drain(gh);
  ok(r.merged.map((x) => x.number).join() === "8,12", "serial: merged oldest (#8) first, then #12");
  const upd = gh.find("PUT", /update-branch/);
  ok(upd.length === 1 && /pulls\/12\//.test(upd[0].path) && upd[0].body.expected_head_sha === old12, "serial: #12 is updated after #8 landed, pinned to the head it read");
  const m12 = gh.find("PUT", /pulls\/12\/merge/)[0];
  ok(m12.body.sha === p12.headSha && p12.headSha !== old12, "serial: #12 merged at its NEW (tested) head");
  const run12 = gh.runs.filter((x) => x.branch === "lane-12").pop();
  ok(run12.head_sha === p12.headSha, "serial: guards ran on the updated head, not the stale one");
  ok(p8.merged && p12.merged, "serial: both merged");
}

// ---- behind -> update -> test the new head ------------------------------------------------
{
  const gh = new FakeGitHub();
  const p = gh.addPr(21);
  gh.externalPush();
  const old = p.headSha;
  const r = await drain(gh);
  ok(r.merged.length === 1, "behind: merged after update");
  const upd = gh.find("PUT", /update-branch/);
  ok(upd.length === 1 && upd[0].body.expected_head_sha === old, "behind: update-branch pinned to expected_head_sha");
  ok(gh.runs[0].head_sha === p.headSha && gh.runs[0].head_sha !== old, "behind: guards dispatched against the post-update head");
}

// ---- conflict ------------------------------------------------------------------------------
{
  const gh = new FakeGitHub();
  const bad = gh.addPr(30, { conflict: true });
  const good = gh.addPr(31);
  const r = await drain(gh);
  ok(r.dropped.length === 1 && r.dropped[0].number === 30 && r.merged.map((x) => x.number).join() === "31", "conflict: #30 dropped, queue continues to #31");
  ok(botComments(bad).length === 1 && botComments(bad)[0] === "Merge queue: conflicts with main; restack and re-label.", "conflict: exactly one comment with the exact text");
  ok(bad.labels.length === 0 && good.merged, "conflict: label removed from #30");
  ok(!gh.runs.some((x) => x.branch === "lane-30") && gh.find("PUT", /pulls\/30\//).length === 0, "conflict: no guards dispatch, update or merge for #30");
}
{
  const gh = new FakeGitHub();
  const p = gh.addPr(32, { updateConflict: true });
  gh.externalPush();
  const r = await drain(gh);
  ok(r.dropped.length === 1 && botComments(p).length === 1 && /conflicts with main/.test(botComments(p)[0]) && p.labels.length === 0 && !p.merged, "conflict via update-branch 422: dropped with the conflict comment");
}

// ---- an unexpected API error on one PR drops it and never starves the queue (review M2) ----
{
  const gh = new FakeGitHub();
  const bad = gh.addPr(60, { updateError: 500 });
  const good = gh.addPr(61);
  gh.externalPush();
  const r = await drain(gh);
  ok(r.dropped.length === 1 && r.dropped[0].number === 60 && r.merged.map((x) => x.number).join() === "61", `error isolation: #60 (HTTP 500 on update) dropped, #61 still merged (${JSON.stringify(r.dropped)})`);
  ok(botComments(bad).length === 1 && /unexpected problem/.test(botComments(bad)[0]) && bad.labels.length === 0 && good.merged, "error isolation: #60 gets one 'unexpected problem' comment and loses the label");
}
// ---- CI failure ----------------------------------------------------------------------------
{
  const gh = new FakeGitHub();
  const bad = gh.addPr(40, { ci: "failure" });
  const good = gh.addPr(41);
  const r = await drain(gh);
  ok(r.dropped.length === 1 && r.dropped[0].number === 40 && good.merged && !bad.merged, "ci fail: #40 dropped, #41 merged");
  ok(bad.labels.length === 0 && botComments(bad).length === 1 && /guards/.test(botComments(bad)[0]) && /example\.test\/runs\/\d+/.test(botComments(bad)[0]), "ci fail: label removed, comment names guards and links the run");
  ok(!gh.checkRuns.some((c) => c.name === "owner-approval" && c.head_sha === bad.headSha) && gh.find("PUT", /pulls\/40\/merge/).length === 0, "ci fail: no owner-approval check and no merge for the failed PR");
}

// ---- a stale earlier run on the same head is never mistaken for ours -----------------------
{
  const gh = new FakeGitHub();
  const p = gh.addPr(50, { ci: "failure" });
  gh.runs.push({ id: 7, head_sha: p.headSha, branch: p.headRef, event: "workflow_dispatch", status: "completed", conclusion: "success", plan: null, polls: 0, created_at: gh.iso(), html_url: "old" });
  gh.checkRuns.push({ id: 8, name: "guards", head_sha: p.headSha, status: "completed", conclusion: "success", started_at: gh.iso(), app: { id: 15368 } });
  const r = await drain(gh);
  ok(r.dropped.length === 1 && !p.merged, "stale run: an earlier successful dispatch on the same head does not rescue a failing new run");
}

// ---- main moved while CI ran -> update again and retest ------------------------------------
{
  const gh = new FakeGitHub();
  const p = gh.addPr(60);
  const first = p.headSha;
  p.onDispatch = (g) => g.externalPush();
  const r = await drain(gh);
  ok(r.merged.length === 1 && p.merged, "main moved: eventually merged");
  ok(gh.find("POST", /dispatches/).filter((c) => c.body.ref === "lane-60").length === 2, "main moved: guards dispatched twice on the branch");
  ok(gh.find("PUT", /update-branch/).length === 1 && gh.find("PUT", /update-branch/)[0].body.expected_head_sha === first, "main moved: branch updated once, pinned to the old head");
  const merges = gh.find("PUT", /pulls\/60\/merge/);
  ok(merges.length === 1 && merges[0].body.sha === p.headSha && p.headSha !== first, "main moved: only the re-tested head was ever merged");
  ok(gh.checkRuns.filter((c) => c.name === "owner-approval").length === 1 && gh.checkRuns.find((c) => c.name === "owner-approval").head_sha === p.headSha, "main moved: owner-approval posted once, for the re-tested head");
}
{
  const gh = new FakeGitHub();
  const p = gh.addPr(61);
  p.onDispatch = function hook(g, pr) { g.externalPush(); pr.onDispatch = hook; }; // main moves on EVERY run
  const r = await drain(gh);
  ok(r.dropped.length === 1 && !p.merged && /moved/.test(botComments(p)[0]) && p.labels.length === 0, "main moved forever: bounded, dropped with a comment");
}

// ---- owner approval ------------------------------------------------------------------------
{
  const gh = new FakeGitHub();
  const p = gh.addPr(70, { files: ["CLAUDE.md"] });
  const next = gh.addPr(71);
  const r = await drain(gh);
  ok(r.dropped.length === 1 && r.dropped[0].number === 70 && !p.merged && next.merged, "approval missing: #70 dropped, #71 merged");
  const cr = gh.checkRuns.find((c) => c.name === "owner-approval" && c.head_sha === p.headSha);
  ok(cr && cr.conclusion === "failure" && /CLAUDE\.md/.test(cr.output.summary) && /owner-approve/.test(cr.output.summary), "approval missing: owner-approval check-run FAILS with the verdict's reason");
  ok(botComments(p).length === 1 && /CLAUDE\.md/.test(botComments(p)[0]) && p.labels.length === 0, "approval missing: one comment with the reason, label removed");
  ok(gh.find("PUT", /pulls\/70\/merge/).length === 0, "approval missing: never merged");
}
{
  const gh = new FakeGitHub();
  const p = gh.addPr(72, { files: ["CLAUDE.md"] });
  p.comments.push({ id: 1, body: `/owner-approve ${p.headSha}`, user: OWNER, created_at: "2026-11-13T10:00:00Z", updated_at: "2026-11-13T10:00:00Z" });
  const r = await drain(gh);
  const cr = gh.checkRuns.find((c) => c.name === "owner-approval");
  ok(r.merged.length === 1 && cr.conclusion === "success" && /approved by @wallstreethyena/.test(cr.output.summary), "approval present: an owner-only change merges with a success check naming the approver");
}
{
  // Content-fingerprint approval survives the queue's own update-branch (the point
  // of the 2026-11-13 redesign); a head-sha approval of the pre-update head does not.
  const gh = new FakeGitHub();
  const fp = protectedFingerprint(74, [{ path: "CLAUDE.md", base: "1".repeat(40), head: "2".repeat(40) }]);
  const a = gh.addPr(74, { files: ["CLAUDE.md"] });
  a.comments.push({ id: 2, body: `/owner-approve ${fp}`, user: OWNER, created_at: "2026-11-13T10:00:00Z", updated_at: "2026-11-13T10:00:00Z" });
  const b = gh.addPr(75, { files: ["CLAUDE.md"] });
  b.comments.push({ id: 3, body: `/owner-approve ${b.headSha}`, user: OWNER, created_at: "2026-11-13T10:00:00Z", updated_at: "2026-11-13T10:00:00Z" });
  gh.externalPush();
  const r = await drain(gh);
  ok(a.merged && gh.find("PUT", /pulls\/74\/update-branch/).length === 1, "fingerprint: an approved protected change is updated with main and still merges, no second approval");
  ok(!b.merged && r.dropped.some((d) => d.number === 75), "fingerprint: a legacy head-sha approval dies when the queue updates the branch (expected; the fingerprint form is the fix)");
}
{
  const gh = new FakeGitHub();
  const p = gh.addPr(73, { files: ["CLAUDE.md"] });
  p.comments.push({ id: 1, body: `/owner-approve ${"f".repeat(40)}`, user: OWNER, created_at: "2026-11-13T10:00:00Z", updated_at: "2026-11-13T10:00:00Z" });
  const r = await drain(gh);
  ok(r.dropped.length === 1 && !p.merged, "approval for a different sha does not count");
}

// ---- merge refused (405/409): bounded retry ------------------------------------------------
{
  const gh = new FakeGitHub();
  const p = gh.addPr(80, { mergeFailures: 99 });
  const r = await drain(gh);
  ok(MAX_MERGE_ATTEMPTS === 3, "merge retry cap constant is 3");
  ok(gh.find("PUT", /pulls\/80\/merge/).length === 3, "merge 405: attempted exactly 3 times");
  ok(r.dropped.length === 1 && !p.merged && p.labels.length === 0 && botComments(p).length === 1 && /merge/.test(botComments(p)[0]) && /405/.test(botComments(p)[0]), "merge 405: dropped after the cap with one comment, label removed");
  ok(gh.find("POST", /dispatches/).filter((c) => c.body.ref === "lane-80").length === 3, "merge 405: each retry re-tests the PR");
}
{
  const gh = new FakeGitHub();
  const p = gh.addPr(81, { mergeFailures: 1 });
  const r = await drain(gh);
  ok(r.merged.length === 1 && p.merged && gh.find("PUT", /pulls\/81\/merge/).length === 2, "merge 405 once: the retry merges it");
}

// ---- tree mismatch: loud failure, no revert ------------------------------------------------
{
  const gh = new FakeGitHub();
  const p = gh.addPr(90);
  const later = gh.addPr(91);
  gh.mergeTreeOverride = "e".repeat(40);
  let thrown = null;
  try { await drain(gh); } catch (e) { thrown = e; }
  ok(thrown instanceof TreeMismatchError && /UNION PROOF FAILED for #90/.test(thrown.message), "tree mismatch: throws TreeMismatchError naming the PR");
  ok(!later.merged && gh.find("PUT", /pulls\/91\/merge/).length === 0, "tree mismatch: the queue stops; the next PR is not merged");
  ok(p.merged && !gh.calls.some((c) => c.method !== "GET" && /revert|git\/refs|branches/.test(c.path)), "tree mismatch: nothing is reverted or reset");
  ok(p.labels.length === 0 && botComments(p).some((b) => /UNION PROOF FAILED/.test(b)), "tree mismatch: label removed (it did merge) and a loud comment left");
  ok(!gh.logs.some((l) => /tree-proof=PASS/.test(l)), "tree mismatch: never logs tree-proof=PASS");
}

// ---- CI timeout ----------------------------------------------------------------------------
{
  const gh = new FakeGitHub();
  const p = gh.addPr(100, { ci: "hang" });
  const t0 = gh.clock;
  const r = await drain(gh);
  ok(r.dropped.length === 1 && !p.merged && /45 minutes/.test(botComments(p)[0]), "timeout: a run that never finishes is dropped after 45 minutes");
  ok(gh.clock - t0 >= 45 * 60_000, "timeout: waited the full 45 minutes of (fake) time");
}

// ---- dry run -------------------------------------------------------------------------------
{
  const gh = new FakeGitHub();
  const a = gh.addPr(110);
  const b = gh.addPr(111, { conflict: true });
  gh.externalPush();
  const r = await drain(gh, { MERGE_QUEUE_DRY_RUN: "1" });
  ok(gh.mutating().length === 0, "dry run: not one write call (no label, comment, dispatch, update or merge)");
  ok(!a.merged && !b.merged && a.labels.length === 1 && b.labels.length === 1 && r.merged.length === 0, "dry run: nothing changed");
  ok(gh.logs.some((l) => /DRY RUN would update-branch #110/.test(l)) && gh.logs.some((l) => /DRY RUN would comment on #111/.test(l)), "dry run: planned actions are logged");
}

// ---- refusal outside Actions / main --------------------------------------------------------
{
  const gh = new FakeGitHub();
  gh.addPr(120);
  for (const [name, env] of [["no GITHUB_ACTIONS", { GITHUB_ACTIONS: "" }], ["GITHUB_ACTIONS=false", { GITHUB_ACTIONS: "false" }], ["pull request ref", { GITHUB_REF: "refs/pull/1/merge" }], ["feature branch", { GITHUB_REF: "refs/heads/lane-x" }], ["no token", { GITHUB_TOKEN: "" }]]) {
    let thrown = null;
    try { await drain(gh, env); } catch (e) { thrown = e; }
    ok(thrown instanceof RefusedError, `refusal: ${name} is refused`);
  }
  ok(gh.calls.length === 0, "refusal: a refused run makes no API call at all");

  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "merge-queue.mjs");
  const cli = (env) => spawnSync(process.execPath, [script], { env: { ...process.env, ...env }, encoding: "utf8", timeout: 20000 });
  const a = cli({ GITHUB_ACTIONS: "false", GITHUB_REF: "refs/heads/main", GITHUB_TOKEN: "t", GITHUB_REPOSITORY: REPO });
  ok(a.status === 1 && /GitHub Actions/.test(a.stderr), "CLI: exits 1 outside GitHub Actions");
  const b = cli({ GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/feature", GITHUB_TOKEN: "t", GITHUB_REPOSITORY: REPO });
  ok(b.status === 1 && /main/.test(b.stderr), "CLI: exits 1 when not run from main");
}

// Post-merge path workflows mirror each workflow's own on.push.paths (a GITHUB_TOKEN
// merge fires no push event, so the queue must dispatch them itself).
{
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const w of POST_MERGE_PATH_WORKFLOWS) {
    const yml = readFileSync(path.join(repoRoot, ".github", "workflows", w.file), "utf8");
    const push = yml.split(/\n(?=  [a-z_]+:)/).find((b) => /^\s*push:/m.test(b) && /branches:\s*\[main\]/.test(b)) || "";
    const globs = [...push.matchAll(/^\s*-\s*'([^']+)'/gm), ...[...(push.match(/paths:\s*\[([^\]]+)\]/) || [, ""])[1].matchAll(/'([^']+)'/g)]].map((m) => m[1]);
    ok(globs.length > 0, `${w.file}: push-to-main paths found (positive control)`);
    for (const g of globs) {
      const sample = g.replace("/**", "/sub/x.js").replace("*", "Sample");
      ok(w.match(sample), `${w.file}: a change to ${g} (e.g. ${sample}) triggers the post-merge dispatch`);
    }
    ok(!w.match("lib/unrelated.js") && !w.match("app/page.js"), `${w.file}: unrelated changes do not dispatch it`);
  }
}


// =====================================================================================
// Hardening round (2026-11-14): run/app identity, pre-merge revalidation, tree proof by
// sha, isolation of unavailable PRs, the halt switch, events, trusted-code-only.
// =====================================================================================
const mutCalls = (gh) => gh.calls.map((c, i) => ({ ...c, i })).filter((c) => c.method !== "GET" && !/\/comments$/.test(c.path) && !(c.method === "DELETE" && /\/labels\//.test(c.path)));
const isHaltCheck = (c) => c.method === "GET" && /labels=merge-queue-halt/.test(c.path);
const newHead = (gh, pr) => { pr.headSha = gh.sha(); gh.commits.set(pr.headSha, { tree: gh.sha() }); };

// ---- 1. identity of the guards result ---------------------------------------------------
{
  // decoy check-runs (other app, other suite, other sha), all newer and green, while the real run's check never appears
  const gh = new FakeGitHub();
  const p = gh.addPr(200, { suppressGuardsCheck: true });
  const decoy = (o) => ({ id: ++gh.runSeq, name: "guards", head_sha: p.headSha, status: "completed", conclusion: "success", started_at: "2027-01-01T00:00:00Z", app: { id: 15368 }, check_suite: { id: 424242 }, ...o });
  gh.checkRuns.push(decoy({ app: { id: 999 }, check_suite: { id: 5001 } }), decoy({}), decoy({ head_sha: "9".repeat(40), check_suite: { id: 5001 } }));
  const r = await drain(gh);
  ok(!p.merged && r.dropped.length === 1 && /no `guards` check-run/.test(botComments(p)[0] || ""), "identity: green same-named checks from another app, another run's suite or another sha never count; no real check means dropped, not merged");
}
{
  // the real check is green and a NEWER failing decoy from another suite exists: the real one decides
  const gh = new FakeGitHub();
  const p = gh.addPr(201);
  p.onDispatch = (g, pr) => g.checkRuns.push({ id: ++g.runSeq, name: "guards", head_sha: pr.headSha, status: "completed", conclusion: "failure", started_at: "2027-01-01T00:00:00Z", app: { id: 15368 }, check_suite: { id: 424242 } });
  const r = await drain(gh);
  ok(r.merged.length === 1 && p.merged, "identity: a newer failing check from a different suite does not veto the dispatched run's own green check");
}
{
  // a decoy run (other workflow file / other event) with a higher id, same head, created after the dispatch
  const gh = new FakeGitHub();
  const p = gh.addPr(202);
  p.onDispatch = (g, pr) => {
    for (const o of [{ path: ".github/workflows/other.yml" }, { event: "push" }]) {
      g.runs.push({ id: ++g.runSeq + 100, check_suite_id: ++g.suiteSeq, path: ".github/workflows/guards.yml", head_sha: pr.headSha, branch: pr.headRef, event: "workflow_dispatch", status: "completed", conclusion: "failure", plan: null, polls: 0, created_at: g.iso(), html_url: "decoy", ...o });
    }
  };
  const r = await drain(gh);
  ok(r.merged.length === 1 && p.merged && !botComments(p).length, "identity: newer runs of another workflow file or another event on the same head are never taken for ours");
}
{
  // the run read back by id is not what the list said (path changed): refuse to use its result
  const gh = new FakeGitHub();
  const p = gh.addPr(203);
  p.onDispatch = (g) => { g.runs[g.runs.length - 1].override = { path: ".github/workflows/other.yml" }; };
  const r = await drain(gh);
  ok(!p.merged && r.dropped.length === 1 && /could not be identified as ours/.test(botComments(p)[0] || ""), "identity: a run that fails the read-back identity check is not used");
}

// ---- 2. revalidate immediately before merge ---------------------------------------------
{
  const gh = new FakeGitHub();
  const p = gh.addPr(210);
  const stale = p.headSha;
  p.onCheckRun = (g, pr) => newHead(g, pr);
  const r = await drain(gh);
  const merges = gh.find("PUT", /pulls\/210\/merge/);
  ok(r.merged.length === 1 && merges.length === 1 && merges[0].body.sha === p.headSha && p.headSha !== stale, "revalidate: head changed after approval was posted, so the stale head is never sent to merge; the new head is re-tested and merged once");
  ok(gh.find("POST", /dispatches/).filter((c) => c.body.ref === "lane-210").length === 2, "revalidate: head change re-loops the PR (guards run again)");
}
{
  const gh = new FakeGitHub();
  const p = gh.addPr(211);
  p.onCheckRun = (g, pr) => g.externalPush();
  const r = await drain(gh);
  ok(r.merged.length === 1 && gh.find("PUT", /pulls\/211\/merge/).length === 1, "revalidate: main moved after approval, so no merge was attempted on stale evidence (not even a refused one)");
  ok(gh.find("POST", /dispatches/).filter((c) => c.body.ref === "lane-211").length === 2 && gh.find("PUT", /pulls\/211\/update-branch/).length === 1, "revalidate: main moving re-loops the PR (update-branch, guards again)");
}
for (const [what, hook] of [
  ["label removed", (g, pr) => { pr.labels = []; }],
  ["PR closed", (g, pr) => { pr.state = "closed"; }],
  ["PR retargeted off main", (g, pr) => { pr.base = "dev"; }],
]) {
  const gh = new FakeGitHub();
  const p = gh.addPr(212);
  p.onCheckRun = hook;
  const r = await drain(gh);
  ok(gh.find("PUT", /pulls\/212\/merge/).length === 0 && !p.merged && r.merged.length === 0 && botComments(p).length === 0, `revalidate: ${what} between approval and merge, so it is not merged and not commented on`);
}
{
  const gh = new FakeGitHub();
  const p = gh.addPr(213, { files: ["CLAUDE.md"] });
  p.comments.push({ id: 1, body: `/owner-approve ${p.headSha}`, user: OWNER, created_at: "2026-11-13T10:00:00Z", updated_at: "2026-11-13T10:00:00Z" });
  p.onCheckRun = (g, pr) => { pr.comments = pr.comments.filter((c) => c.user.type === "Bot"); }; // approval withdrawn after it was judged
  const r = await drain(gh);
  const approvals = gh.checkRuns.filter((c) => c.name === "owner-approval" && c.head_sha === p.headSha);
  ok(!p.merged && gh.find("PUT", /pulls\/213\/merge/).length === 0 && r.dropped.length === 1 && approvals.length === 2 && approvals[1].conclusion === "failure", "revalidate: owner approval is re-decided on live evidence; a withdrawn approval blocks the merge and posts a failing owner-approval check");
}

// ---- 3. tree proof is against the merge commit's sha, never a later main -----------------
{
  const gh = new FakeGitHub();
  const p = gh.addPr(220);
  p.afterMerge = (g) => g.externalPush();   // somebody else lands on main right after our merge
  let late = null; let r = { merged: [] };
  try { r = await drain(gh); } catch (e) { late = e; }
  ok(late === null, `tree proof: another merge landing after ours must not throw (${late && late.name})`);
  ok(r.merged.length === 1 && gh.logs.some((l) => /merged #220 .* tree-proof=PASS/.test(l)), "tree proof: another merge landing after ours is not a false mismatch");
  ok(gh.find("GET", /\/commits\/[0-9a-f]{40}$/).some((c) => c.path === `/commits/${r.merged[0].sha}`) && !gh.find("GET", /\/commits\/main$/).length, "tree proof: the merge commit is fetched by the sha the merge API returned");
}
{
  const gh = new FakeGitHub();
  const p = gh.addPr(221);
  gh.mergeTreeOverride = "e".repeat(40);
  let thrown = null;
  try { await drain(gh); } catch (e) { thrown = e; }
  ok(thrown instanceof TreeMismatchError && botComments(p).length === 1 && /UNION PROOF FAILED/.test(botComments(p)[0]), "tree proof: a real mismatch posts exactly one visible comment on the PR");
  const lines = []; const code = await (async () => {
    const g2 = new FakeGitHub(); g2.addPr(222); g2.mergeTreeOverride = "e".repeat(40);
    return runCli({ env: ENV, fetchImpl: g2.fetch, sleep: g2.sleep, now: g2.now, log: g2.log, timing: FAST, errorLog: (l) => lines.push(l) });
  })();
  ok(code === 1 && /UNION PROOF FAILED/.test(lines.join()), "tree proof: the CLI exits non-zero on a mismatch");
}

// ---- 4. isolation: unavailable PRs never block the ones behind them -----------------------
for (const [what, opts] of [["GET answers 503", { getFail: 503 }], ["GET times out (fetch throws)", { getFail: "throw" }], ["dispatch answers 502", { dispatchFail: 502 }]]) {
  const gh = new FakeGitHub();
  const bad = gh.addPr(230, opts);
  const good = gh.addPr(231);
  const r = await drain(gh);
  ok(good.merged && !bad.merged && r.dropped.map((d) => d.number).join() === "230" && !r.halted, `isolation: #230 unavailable (${what}) does not stop #231 merging`);
  ok(botComments(bad).length === 1 && /unexpected problem/.test(botComments(bad)[0]) && bad.labels.length === 0, `isolation: #230 (${what}) gets exactly one comment and loses the label`);
}

// ---- 5. the halt switch -------------------------------------------------------------------
{
  const gh = new FakeGitHub();
  const conflicted = gh.addPr(240, { conflict: true });
  const ready = gh.addPr(241);
  gh.haltIssues.push({ number: 9000 });   // an open issue (not even a PR) carries merge-queue-halt
  const r = await drain(gh);
  ok(r.halted === true && gh.logs.some((l) => /halted/.test(l)) && mutCalls(gh).length === 0 && gh.find("POST", /comments/).length === 0, "halt: a halt label stops the drain before any write (no update, dispatch, check, merge, comment)");
  ok(conflicted.labels.length === 1 && ready.labels.length === 1 && !ready.merged && botComments(conflicted).length === 0, "halt: labelled PRs are left untouched (not even a conflict drop)");
  ok(await runCli({ env: ENV, fetchImpl: gh.fetch, sleep: gh.sleep, now: gh.now, log: gh.log, timing: FAST }) === 0, "halt: the CLI exits 0 when halted");
}
{
  const gh = new FakeGitHub();
  gh.addPr(242); gh.haltUnreadable = true;
  const r = await drain(gh);
  ok(r.halted === true && mutCalls(gh).length === 0, "halt: an unreadable halt switch counts as halted (fail closed)");
}
{
  // structure: every mutation is preceded by a halt check, and halting at ANY check stops all later mutations
  const scenario = (haltAt) => {
    const gh = new FakeGitHub();
    gh.addPr(250);                                   // needs update-branch (main moves below)
    gh.addPr(251, { files: ["CLAUDE.md"] });        // fails approval -> approval check + drop
    gh.externalPush();
    gh.haltAtCheck = haltAt;
    return gh;
  };
  const base = scenario(0);
  const br = await drain(base);
  const muts = mutCalls(base);
  const kinds = new Set(muts.map((c) => (/update-branch/.test(c.path) ? "update-branch" : /dispatches/.test(c.path) ? "dispatch" : /check-runs/.test(c.path) ? "check" : /merge$/.test(c.path) ? "merge" : "other")));
  ok(["update-branch", "dispatch", "check", "merge"].every((k) => kinds.has(k)) && !kinds.has("other") && br.merged.length === 1, `halt: the scenario exercises update-branch, dispatch, check post and merge (${[...kinds]})`);
  let prev = -1; let unguarded = 0;
  for (const c of muts) { if (!base.calls.slice(prev + 1, c.i).some(isHaltCheck)) unguarded++; prev = c.i; }
  ok(unguarded === 0, `halt: every mutation is immediately preceded by a halt check (${unguarded} unguarded of ${muts.length})`);
  const total = base.haltChecks;
  let leaks = 0;
  for (let k = 1; k <= total; k++) {
    const gh = scenario(k);
    const rr = await drain(gh);
    let seen = 0; let idx = -1;
    gh.calls.forEach((c, i) => { if (isHaltCheck(c) && ++seen === k) idx = i; });
    const after = mutCalls(gh).filter((c) => c.i > idx);
    if (!rr.halted || after.length) leaks++;
  }
  ok(total >= 8 && leaks === 0, `halt: raising the halt label at each of the ${total} checks stops every later mutation (${leaks} leaks)`);
}
{
  // halt raised right after our merge: the merge stands, nothing else is dispatched, the next PR is untouched
  const gh = new FakeGitHub();
  const a = gh.addPr(260);
  const b = gh.addPr(261);
  a.afterMerge = (g) => g.haltIssues.push({ number: 9001 });
  const r = await drain(gh);
  ok(a.merged && !b.merged && r.halted && r.merged.length === 1 && gh.find("POST", /dispatches/).filter((c) => c.body.ref === "main").length === 0, "halt: halted right after a merge keeps that merge, skips the post-merge dispatch and stops");
  ok(b.labels.length === 1 && !gh.calls.some((c) => /\/(261)(\/|$)/.test(c.path) && c.method !== "GET") && !gh.runs.some((x) => x.branch === "lane-261"), "halt: the PR queued behind is untouched");
}

// ---- 6/7. events and trusted code ----------------------------------------------------------
{
  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const raw = readFileSync(path.join(repoRoot, ".github", "workflows", "merge-queue.yml"), "utf8");
  const yml = raw.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const lines = yml.split("\n");
  const at = (re) => lines.findIndex((l) => re.test(l));
  ok(/pull_request_target:\s*\n\s*types:\s*\[labeled\]/.test(yml) && /^\s{2}push:\s*\n\s*branches:\s*\[main\]/m.test(yml) && /^\s{2}workflow_dispatch:/m.test(yml) && /^\s{2}schedule:\s*\n\s*- cron: "\d+ \* \* \* \*"/m.test(yml), "events: labeled, push to main, manual dispatch and an hourly sweep");
  ok(!/^\s*pull_request:/m.test(yml) && !/^concurrency:/m.test(yml), "events: no pull_request trigger, and no workflow-level concurrency that unrelated label events could use to displace a drain");
  const iJob = at(/^\s{2}drain:/); const iIf = at(/^\s{4}if: .*merge-queue'/); const iConc = at(/^\s{4}concurrency:/);
  ok(iJob > 0 && iIf > iJob && iConc > iIf && /group:\s*merge-queue\s*$/m.test(lines.slice(iConc, iConc + 3).join("\n")) && /cancel-in-progress:\s*false/.test(lines.slice(iConc, iConc + 3).join("\n")), "events: concurrency sits on the job, after the label filter, group merge-queue, cancel-in-progress false");
  ok(/merge-queue-halt/.test(raw) && /does not cancel/i.test(raw) && /cancel(l?ing)? the running workflow run/i.test(raw), "events: the workflow header documents that removing the PR label does not cancel an in-flight step and that the effective stop is the halt label plus cancelling the run");
  ok(/ref:\s*main\s*$/m.test(yml) && /persist-credentials:\s*false/.test(yml) && !/\b(npm|npx|yarn|pnpm)\b/.test(yml) && ![...yml.matchAll(/\$\{\{\s*([^}]*?)\s*\}\}/g)].some((m) => m[1] !== "github.token"), "trusted: checks out main only, persists no credentials, installs nothing, no event text in any expression");
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const risky = /child_process|\beval\s*\(|new\s+Function\b|\bexecSync\b|\bspawn(Sync)?\b|GITHUB_EVENT_PATH|process\.env\.GITHUB_(HEAD|BASE)_REF|import\s*\(\s*[^"']/;
  const probe = strip(readFileSync(fileURLToPath(import.meta.url), "utf8"));
  ok(risky.test(probe), "trusted: the probe finds a known positive (this file spawns a child process)");
  for (const f of ["scripts/merge-queue.mjs", "scripts/lib/mergeQueue.mjs"]) {
    ok(!risky.test(strip(readFileSync(path.join(repoRoot, f), "utf8"))), `trusted: ${f} runs no subprocess, no eval, no dynamic import and reads no event payload; pull requests are API data only`);
  }
}

if (fails.length) {
  console.error(`test-merge-queue: FAIL (${fails.length} of ${pass + fails.length})`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`test-merge-queue: OK — ${pass} assertions: ordering, update-branch pinning, conflict/CI/approval drops, main-moved retests, merge retry cap, tree proof, dry run, refusal`);
