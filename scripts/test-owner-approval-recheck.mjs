#!/usr/bin/env node
/**
 * test-owner-approval-recheck — locks scripts/owner-approval-recheck.mjs and its
 * workflow (2026-11-14). Hermetic: the real recheck() is driven with a fake fetch
 * that records every call; no network, no git.
 *
 * Proves: an owner approval comment on a PR re-runs exactly the latest
 * non-successful owner-approval.yml and guards.yml runs of the PR's CURRENT head
 * (never an older head's, never a successful or in-progress run); comments by
 * anyone else, by a bot carrying the owner's login, by the owner login on another
 * account id, without an exact approval line, edits, and issue (non-PR) comments
 * re-run nothing; missing context and API errors fail closed (exit 1, nothing
 * re-run). And the workflow: issue_comment created only, from main, owner-gated
 * `if`, pinned actions, minimal permissions, no PR checkout, no event text in a
 * shell.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { recheck, RECHECK_WORKFLOWS } from "./owner-approval-recheck.mjs";
import { OWNERS, isOwnerOnly } from "./lib/ownerApproval.mjs";

const REPO = process.cwd();
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

const HEAD = "a".repeat(40);
const OLD = "b".repeat(40);
const OWNER = { login: OWNERS[0].login, id: OWNERS[0].id, type: "User" };
const ENV = { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "issue_comment", GITHUB_REF: "refs/heads/main", GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.fixture.invalid" };
const FP = "c".repeat(64);
const ev = (o = {}) => ({ action: "created", issue: { number: 2499, pull_request: { url: "x" } }, comment: { user: OWNER, body: `looks right\n/owner-approve ${FP}\n` }, ...o });

function fakeGitHub({ pull = { state: "open", head: { sha: HEAD } }, runs = {}, status = {} } = {}) {
  const calls = [];
  const reply = (code, body) => ({ ok: code >= 200 && code < 300, status: code, json: async () => body });
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/repos\/wallstreethyena\/Wayfind/, "");
    calls.push(`${init.method || "GET"} ${path}${u.search}`);
    if (!String((init.headers || {}).Authorization || "").startsWith("Bearer ")) throw new Error("no token sent");
    for (const [rx, code] of Object.entries(status)) if (new RegExp(rx).test(path)) return reply(code, {});
    if (/^\/pulls\/2499$/.test(path)) return reply(200, pull);
    let m;
    if ((m = path.match(/^\/actions\/workflows\/([\w.-]+)\/runs$/))) {
      if (u.searchParams.get("head_sha") !== HEAD) return reply(200, { workflow_runs: [] });
      return reply(200, { workflow_runs: runs[m[1]] || [] });
    }
    if ((m = path.match(/^\/actions\/runs\/(\d+)\/rerun-failed-jobs$/)) && init.method === "POST") return reply(201, null);
    return reply(404, {});
  };
  return { calls, fetchImpl };
}
const run = (id, o = {}) => ({ id, head_sha: HEAD, status: "completed", conclusion: "failure", created_at: `2026-11-14T00:00:${String(id % 60).padStart(2, "0")}Z`, ...o });
const go = async (o = {}) => {
  const gh = fakeGitHub(o.gh);
  const r = await recheck({ env: { ...ENV, ...(o.env || {}) }, event: o.event === undefined ? ev() : o.event, fetchImpl: gh.fetchImpl });
  return { ...r, calls: gh.calls, posts: gh.calls.filter((c) => c.startsWith("POST")) };
};

// 1. The happy path: latest failed run of each workflow for the current head is re-run.
{
  const r = await go({ gh: { runs: {
    "owner-approval.yml": [run(11, { created_at: "2026-11-14T00:00:01Z" }), run(12, { created_at: "2026-11-14T00:00:05Z" }), run(9, { head_sha: OLD, created_at: "2026-11-14T00:01:00Z" })],
    "guards.yml": [run(21, { conclusion: "cancelled" })],
  } } });
  ok(r.code === 0 && JSON.stringify(r.posts) === JSON.stringify(["POST /actions/runs/12/rerun-failed-jobs", "POST /actions/runs/21/rerun-failed-jobs"]),
    `owner comment re-runs the LATEST non-successful run of each workflow for the current head (got ${JSON.stringify(r.posts)})`);
  ok(r.calls.some((c) => c === `GET /actions/workflows/owner-approval.yml/runs?head_sha=${HEAD}&per_page=50`) && JSON.stringify(RECHECK_WORKFLOWS) === JSON.stringify(["owner-approval.yml", "guards.yml"]),
    "runs are listed by the PR's live head sha, for owner-approval.yml and guards.yml only");
}
// 2. Nothing to re-run.
{
  let r = await go({ gh: { runs: { "owner-approval.yml": [run(12, { conclusion: "success" })], "guards.yml": [run(21, { status: "in_progress", conclusion: null })] } } });
  ok(r.code === 0 && r.posts.length === 0, "a successful or still-running run is never re-run");
  r = await go({ gh: { runs: { "owner-approval.yml": [run(12, { head_sha: OLD })] } } });
  ok(r.code === 0 && r.posts.length === 0, "a run for an older head is never re-run (current head only)");
  r = await go({ gh: { pull: { state: "closed", head: { sha: HEAD } }, runs: { "guards.yml": [run(21)] } } });
  ok(r.code === 0 && r.posts.length === 0, "a closed pull request is left alone");
}
// 3. Not the owner's approval: re-run nothing, call nothing.
{
  const cases = {
    "another login": ev({ comment: { user: { login: "wayfind-agent", id: 7, type: "User" }, body: `/owner-approve ${FP}` } }),
    "a bot with the owner's login": ev({ comment: { user: { ...OWNER, type: "Bot" }, body: `/owner-approve ${FP}` } }),
    "the owner login on another account id": ev({ comment: { user: { ...OWNER, id: OWNER.id + 1 }, body: `/owner-approve ${FP}` } }),
    "a mid-line mention": ev({ comment: { user: OWNER, body: `please /owner-approve ${FP}` } }),
    "a short prefix": ev({ comment: { user: OWNER, body: `/owner-approve ${FP.slice(0, 12)}` } }),
    "an edited comment": ev({ action: "edited" }),
    "an issue, not a pull request": ev({ issue: { number: 2499 } }),
  };
  for (const [label, event] of Object.entries(cases)) {
    const r = await go({ event, gh: { runs: { "guards.yml": [run(21)] } } });
    ok(r.code === 0 && r.calls.length === 0, `${label}: nothing is read or re-run (${r.calls.length} calls)`);
  }
}
// 4. Fail closed: missing context or API errors exit 1 and re-run nothing.
{
  for (const [label, env] of [["outside Actions", { GITHUB_ACTIONS: "" }], ["another event", { GITHUB_EVENT_NAME: "pull_request_target" }], ["not main's context", { GITHUB_REF: "refs/pull/2499/merge" }], ["no token", { GITHUB_TOKEN: "" }], ["bad API URL", { GITHUB_API_URL: "http://x" }]]) {
    const r = await go({ env, gh: { runs: { "guards.yml": [run(21)] } } });
    ok(r.code === 1 && r.calls.length === 0, `fails closed ${label}`);
  }
  let r = await go({ event: null });
  ok(r.code === 1 && r.calls.length === 0, "fails closed without an event payload");
  r = await go({ gh: { status: { "^/pulls/2499$": 502 } } });
  ok(r.code === 1 && r.posts.length === 0 && /HTTP 502/.test(r.lines.join("\n")), "an API error reading the pull request fails closed");
  r = await go({ gh: { pull: { state: "open", head: { sha: "nope" } } } });
  ok(r.code === 1 && r.posts.length === 0, "an unreadable head fails closed");
  r = await go({ gh: { runs: { "owner-approval.yml": [run(12)], "guards.yml": [run(21)] }, status: { "/actions/runs/12/rerun-failed-jobs$": 403 } } });
  ok(r.code === 1 && r.posts.length === 1 && /HTTP 403/.test(r.lines.join("\n")), "a refused re-run fails the job visibly");
}
// 5. The workflow.
{
  const wf = readFileSync(join(REPO, ".github", "workflows", "owner-approval-recheck.yml"), "utf8");
  const code = wf.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  ok(/^on:\n  issue_comment:\n    types: \[created\]\n(?!\s)/m.test(code) && !/pull_request(_target|_review)?:/.test(code) && !/workflow_run:/.test(code),
    "recheck triggers on issue_comment created only");
  ok(/^permissions:\n  actions: write\n  contents: read\n  pull-requests: read\n(?!\s)/m.test(code) && (code.match(/:\s*write/g) || []).length === 1 && !/write-all/.test(code),
    "recheck holds exactly actions: write, contents: read, pull-requests: read");
  ok(/if: github\.event\.issue\.pull_request && github\.event\.comment\.user\.login == 'wallstreethyena' && github\.event\.comment\.user\.type == 'User' && contains\(github\.event\.comment\.body, '\/owner-approve'\)/.test(code)
    && OWNERS.length === 1 && OWNERS[0].login === "wallstreethyena", "the job runs only for the owner login's (User) /owner-approve comments on pull requests");
  const uses = [...code.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  ok(uses.length === 2 && uses.every((u) => /@[0-9a-f]{40}$/.test(u)) && /persist-credentials:\s*false/.test(code) && !/^\s*ref:/m.test(code) && !/repository:/.test(code)
    && !/github\.event\.pull_request\.head/.test(code) && !/\b(npm|npx|yarn|pnpm)\b/.test(code), "pinned actions, main checkout only, nothing installed, no PR code");
  const runLines = [...code.matchAll(/run:\s*(.*)$/gm)].map((m) => m[1].trim());
  const envExpr = [...code.matchAll(/^\s+[A-Z_]+:\s*\$\{\{([^}]*)\}\}/gm)].map((m) => m[1].trim());
  ok(JSON.stringify(runLines) === JSON.stringify(["node scripts/owner-approval-recheck.mjs"]) && !runLines.some((l) => l.includes("${{")) && JSON.stringify(envExpr) === JSON.stringify(["github.token"]),
    `the only shell command is the script and no event text reaches a shell (run: ${JSON.stringify(runLines)}, env: ${JSON.stringify(envExpr)})`);
  ok(isOwnerOnly(".github/workflows/owner-approval-recheck.yml") && isOwnerOnly("scripts/owner-approval-recheck.mjs") && isOwnerOnly("scripts/test-owner-approval-recheck.mjs"),
    "the recheck workflow, script and this test are owner-only");
  const guards = readFileSync(join(REPO, "scripts", "guards.txt"), "utf8").split("\n").map((l) => l.trim());
  ok(guards.includes("node scripts/test-owner-approval-recheck.mjs"), "this test is wired into scripts/guards.txt");
}

const EXPECTED = 28;
if (checks !== EXPECTED) {
  console.error(`test-owner-approval-recheck: FAIL — ran ${checks} assertions, expected exactly ${EXPECTED}.`);
  process.exit(1);
}
console.log(`test-owner-approval-recheck: OK — ${checks} assertions: an owner approval comment re-runs only the latest non-successful owner-approval/guards runs of the PR's current head; non-owner, bot, re-registered-login, mid-line, prefix, edited and issue comments re-run nothing; missing context and API errors fail closed; the workflow is issue_comment-only, owner-gated, pinned, least-privilege and never runs PR code`);
