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
import { runQueue, TreeMismatchError, RefusedError, MAX_MERGE_ATTEMPTS } from "./merge-queue.mjs";
import {
  pickNext, classify, STATES, pickGuardsCheck, pickDispatchedRun, treesEqual,
  readConfig, refuseUnlessMainOnActions, buildComment, isQueueable,
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
      return reply(200, [...this.prs.values()].filter((x) => x.state === "open" && x.labels.includes(label)).map((x) => ({ number: x.number, pull_request: {} })));
    }
    if (method === "GET" && (m = p.match(/^\/pulls\/(\d+)$/))) {
      const pr = this.prs.get(Number(m[1]));
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
      return pr ? reply(200, { behind_by: this.behind(pr) ? 1 : 0 }) : reply(404, { message: "no such commit" });
    }
    if (method === "PUT" && (m = p.match(/^\/pulls\/(\d+)\/update-branch$/))) {
      const pr = this.prs.get(Number(m[1]));
      if (body.expected_head_sha !== pr.headSha) return reply(422, { message: "expected head sha didn't match" });
      if (pr.updateConflict) return reply(422, { message: "merge conflict between base and head" });
      pr.headSha = this.sha(); this.commits.set(pr.headSha, { tree: this.sha() }); pr.baseSha = this.main;
      return reply(202, { message: "Updating pull request branch." });
    }
    if (method === "POST" && (m = p.match(/^\/actions\/workflows\/([\w.-]+)\/dispatches$/))) {
      if (m[1] !== "guards.yml") return reply(404, { message: "workflow not found" });
      if (body.ref === "main") { this.runs.push({ id: ++this.runSeq, head_sha: this.main, branch: "main", event: "workflow_dispatch", status: "queued", plan: null, polls: 0, created_at: this.iso(), html_url: "u" }); return reply(204); }
      const pr = [...this.prs.values()].find((x) => x.headRef === body.ref);
      if (!pr) return reply(422, { message: "no such ref" });
      this.runs.push({ id: ++this.runSeq, head_sha: pr.headSha, branch: pr.headRef, event: "workflow_dispatch", status: "queued", conclusion: null, plan: pr.ci, polls: 0, created_at: this.iso(), html_url: `https://example.test/runs/${this.runSeq}`, inputs: body.inputs });
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
        this.checkRuns.push({ id: ++this.runSeq, name: "guards", head_sha: run.head_sha, status: "completed", conclusion: run.plan, started_at: this.iso(), app: { id: 15368 } });
      }
      return reply(200, { ...run });
    }
    if (method === "GET" && (m = p.match(/^\/commits\/([0-9a-f]{40})\/check-runs/))) {
      return reply(200, { check_runs: this.checkRuns.filter((c) => c.head_sha === m[1]) });
    }
    if (method === "POST" && p === "/check-runs") {
      this.checkRuns.push({ id: ++this.runSeq, ...body, started_at: this.iso(), app: { id: 15368 } });
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
      return reply(200, { merged: true, sha: this.main });
    }
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

  const chk = (o) => ({ name: "guards", status: "completed", conclusion: "success", started_at: "2026-11-13T00:00:00Z", app: { id: 15368 }, id: 1, ...o });
  ok(pickGuardsCheck([chk({ name: "guards (node 20)" })]) === null, "pickGuardsCheck: exact name only");
  ok(pickGuardsCheck([chk({ app: { id: 999 } })]) === null, "pickGuardsCheck: only GitHub Actions' check counts");
  ok(pickGuardsCheck([chk({ status: "in_progress" })]) === null, "pickGuardsCheck: unfinished is not a result");
  ok(pickGuardsCheck([chk({ id: 1 }), chk({ id: 2, started_at: "2026-11-13T01:00:00Z", conclusion: "failure" })]).conclusion === "failure", "pickGuardsCheck: newest wins");

  const run = (o) => ({ id: 1, event: "workflow_dispatch", head_sha: "a".repeat(40), created_at: "2026-11-13T12:00:10Z", ...o });
  const t0 = Date.parse("2026-11-13T12:00:00Z");
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

if (fails.length) {
  console.error(`test-merge-queue: FAIL (${fails.length} of ${pass + fails.length})`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`test-merge-queue: OK — ${pass} assertions: ordering, update-branch pinning, conflict/CI/approval drops, main-moved retests, merge retry cap, tree proof, dry run, refusal`);
