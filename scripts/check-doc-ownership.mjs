#!/usr/bin/env node
/**
 * check-doc-ownership — owner-only files change only with GitHub-authenticated owner approval.
 *
 * Measured 2026-07-31: 11 of 29 branch-vs-main conflicts (38%) were on coordination
 * documents, not code. AGENTS.md conflicted on 3 branches, CLAUDE.md on 3,
 * docs/KIMI_QUEUE.md on 3. Rules cannot stabilise while the rules are a merge target.
 *
 * 2026-09-23: this check used to accept an owner-only edit when the COMMIT AUTHOR NAME
 * was "Gabriel Pereira". Author and committer are free text anyone can set, so the
 * check could be satisfied by impersonation (and PR #1478 could only pass that way).
 * Approval is now decided by scripts/lib/ownerApproval.mjs from evidence GitHub
 * authenticates: an "/owner-approve <head sha>" comment on the pull request by an
 * owner login, naming the PR's current head commit. Commit metadata is not read at all.
 *
 * GitHub Actions is the only authority. This file is the "guards" check's copy of
 * the rule, and "guards" runs on pull_request, i.e. the pull request's OWN copy of
 * this file. The "owner-approval" check (scripts/check-owner-approval-pr.mjs, on
 * pull_request_target) applies the same rule from the BASE branch, so a pull request
 * that edits this file is still judged by the unedited rule. Off GitHub Actions an
 * owner-only change always fails: a local run cannot see or grant approval, and
 * must never look like it did. Ordinary changes are unaffected everywhere and need
 * no network.
 *
 * Lane state belongs in docs/lanes/<lane>.md — one file per lane, so two lanes can
 * never collide. Rule changes go to docs/proposals/<lane>-<topic>.md, or to a PR the
 * owner approves. How to approve: docs/OWNER_APPROVAL.md.
 */
import { execFileSync } from "node:child_process";
import { decideOwnerApproval, ownerOnlyChanges } from "./lib/ownerApproval.mjs";
import { fetchPullEvidence, readPullContext } from "./lib/githubPullEvidence.mjs";
const git = (...args) => {
  try {
    return { ok: true, out: execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    return { ok: false, out: "", error: String(error && (error.stderr || error.message) || error).trim() };
  }
};
// 2026-09-09: this guard reported SKIP on the hosted run that gates merge, because
// actions/checkout used the default depth 1 and origin/main was unreadable. Run
// 34390086158 on head b3cc9a48 printed "SKIP — confirmed shallow checkout does not
// contain origin/main" and then "592/592 guards green"; PR #1197 merged an AGENTS.md
// edit by a lane two minutes later. A guard that cannot reach its evidence must not
// answer OK on the run that decides a merge.
//
// Vercel runs this same suite through `prebuild` on its own shallow clone, and a
// Vercel build is not the merge gate, so it keeps the skip. GitHub Actions is the
// required `guards` check, so there an unreadable base is a hard failure. The
// companion change sets fetch-depth: 0, which means this branch should never be
// reached again; it stays as the backstop for the day someone removes it.
const IS_MERGE_GATE = process.env.GITHUB_ACTIONS === "true";

const fail = (message) => {
  console.error(`check-doc-ownership: FAIL — ${message}`);
  process.exit(1);
};

const shallowFail = (detail) =>
  fail(`ownership cannot be verified on the merge gate: ${detail}. ` +
       "actions/checkout must set fetch-depth: 0 so origin/main and the merge base are readable.");

const inside = git("rev-parse", "--is-inside-work-tree");
if (!inside.ok || inside.out !== "true") {
  fail(`git is unavailable or the checkout is not a Git worktree${inside.error ? ` (${inside.error})` : ""}`);
}

const shallowResult = git("rev-parse", "--is-shallow-repository");
if (!shallowResult.ok || !/^(?:true|false)$/.test(shallowResult.out)) {
  fail(`cannot determine whether the checkout is shallow (${shallowResult.error || shallowResult.out || "no answer"})`);
}
const isShallow = shallowResult.out === "true";

const headResult = git("rev-parse", "--verify", "HEAD^{commit}");
if (!headResult.ok || !headResult.out) fail(`HEAD is not a readable commit (${headResult.error || "no object"})`);

const upstreamResult = git("rev-parse", "--verify", "origin/main^{commit}");
if (!upstreamResult.ok || !upstreamResult.out) {
  if (isShallow) {
    if (IS_MERGE_GATE) shallowFail("shallow checkout does not contain origin/main");
    console.log("check-doc-ownership: SKIP — confirmed shallow checkout does not contain origin/main");
    process.exit(0);
  }
  fail(`origin/main is not a readable commit in a non-shallow checkout (${upstreamResult.error || "no object"})`);
}

const baseResult = git("merge-base", "origin/main", "HEAD");
if (!baseResult.ok || !baseResult.out) {
  if (isShallow) {
    if (IS_MERGE_GATE) shallowFail("readable HEAD and origin/main histories are truncated before their merge base");
    console.log("check-doc-ownership: SKIP — readable HEAD and origin/main histories are truncated before their merge base");
    process.exit(0);
  }
  fail(`origin/main merge base is unavailable in a non-shallow checkout${baseResult.error ? ` (${baseResult.error})` : ""}`);
}
const base = baseResult.out;

// Net change of the branch against its base. Renames are split into a delete and
// an add so moving an owner-only file is still an owner-only change.
const diffResult = git("diff", "--name-only", "--no-renames", base, "HEAD");
if (!diffResult.ok) fail(`cannot list changed files against ${base.slice(0, 8)} (${diffResult.error})`);
const changedPaths = diffResult.out.split("\n").filter(Boolean);

if (!ownerOnlyChanges(changedPaths).length) {
  console.log(`check-doc-ownership: OK — ${changedPaths.length} changed file(s), no owner-only files touched`);
  process.exit(0);
}

// Owner-only files changed. Gather GitHub-authenticated evidence (merge gate only).
// The files come from git (the net diff above); the approval comes from the API.
async function gatherPullRequestEvidence() {
  const ctx = readPullContext(process.env, ["pull_request", "pull_request_target"]);
  if (ctx.error) return { pr: null, comments: null, error: ctx.error };
  try {
    const live = await fetchPullEvidence(ctx);
    return { pr: { number: ctx.number, eventHeadSha: ctx.eventHeadSha, liveHeadSha: live.liveHeadSha }, comments: live.comments, error: null };
  } catch (e) {
    return { pr: null, comments: null, error: String((e && e.message) || e) };
  }
}

const evidence = IS_MERGE_GATE
  ? { changedPaths, mergeGate: true, ...(await gatherPullRequestEvidence()) }
  : { changedPaths, mergeGate: false, pr: null, comments: null, error: null };
const verdict = decideOwnerApproval(evidence);
if (!verdict.ok) {
  console.error(`check-doc-ownership: FAIL — ${verdict.reason}.`);
  console.error("  Lane state goes in docs/lanes/<lane>.md; rule proposals in docs/proposals/<lane>-<topic>.md. See docs/OWNER_APPROVAL.md.");
  process.exit(1);
}
console.log(`check-doc-ownership: OK — ${verdict.reason}`);
