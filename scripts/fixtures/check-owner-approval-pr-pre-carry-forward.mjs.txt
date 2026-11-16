#!/usr/bin/env node
/**
 * check-owner-approval-pr — the "owner-approval" check (2026-09-23).
 *
 * Owner-only files (the list is OWNER_ONLY in scripts/lib/ownerApproval.mjs) change
 * only with an "/owner-approve <head sha>" pull-request comment by an owner GitHub
 * login. scripts/check-doc-ownership.mjs enforces that inside the "guards" check,
 * but "guards" runs on pull_request, which executes the pull request's OWN copy of
 * the guard: a pull request that deletes CLAUDE.md from OWNER_ONLY, or rewrites the
 * guard to print OK, is judged by its own edit.
 *
 * This file runs from .github/workflows/owner-approval.yml on pull_request_target,
 * so GitHub executes the BASE branch's workflow and the BASE branch's copy of this
 * script and of ownerApproval.mjs. The pull request is read only as data from the
 * GitHub API (changed file names, comments, head commit), never checked out or run.
 * A pull request therefore cannot change the rule that judges it.
 *
 * Fails closed: outside GitHub Actions, on any other event, without a token, on any
 * API error, on an incomplete file list, or when the head moves mid-read.
 */
import { decideOwnerApproval } from "./lib/ownerApproval.mjs";
import { fetchPullEvidence, readPullContext } from "./lib/githubPullEvidence.mjs";

const refuse = (reason) => {
  console.error(`check-owner-approval-pr: FAIL — ${reason}.`);
  console.error("  How to approve: docs/OWNER_APPROVAL.md.");
  process.exit(1);
};

if (process.env.GITHUB_ACTIONS !== "true") {
  refuse("this is the GitHub Actions \"owner-approval\" check; a local run cannot see or grant owner approval");
}
const ctx = readPullContext(process.env, ["pull_request_target"]);
if (ctx.error) refuse(`owner approval cannot be evaluated: ${ctx.error}`);

let live;
try {
  live = await fetchPullEvidence(ctx, { withFiles: true });
} catch (e) {
  refuse(`owner approval cannot be evaluated: ${(e && e.message) || e}`);
}

// The file list is the LIVE head's, so it only describes this run's commit when the
// head has not moved. Otherwise a stale run could mark an old commit green from a
// newer commit's files. Refuse; the run for the new head decides.
if (ctx.eventHeadSha !== live.liveHeadSha) {
  refuse(`PR #${ctx.number} moved from ${ctx.eventHeadSha.slice(0, 12) || "nothing"} to ${live.liveHeadSha.slice(0, 12)} after this run started; the run for the new head decides`);
}

const verdict = decideOwnerApproval({
  changedPaths: live.files,
  mergeGate: true,
  pr: { number: ctx.number, eventHeadSha: ctx.eventHeadSha, liveHeadSha: live.liveHeadSha },
  comments: live.comments,
  error: null,
});
if (!verdict.ok) refuse(verdict.reason);
console.log(`check-owner-approval-pr: OK — ${verdict.reason} (${live.files.length} changed path(s) read from the GitHub API and judged by the base branch's rules)`);
