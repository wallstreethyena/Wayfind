#!/usr/bin/env node
/**
 * check-owner-approval-pr — the "owner-approval" check (2026-09-23).
 *
 * Owner-only files (the list is OWNER_ONLY in scripts/lib/ownerApproval.mjs) change
 * only with the owner's GitHub pull-request review (Review changes → Approve), valid
 * while the protected content it approved is unchanged (Owner Approval V2,
 * 2026-11-13; see scripts/lib/ownerApproval.mjs). scripts/check-doc-ownership.mjs enforces that inside the "guards" check,
 * but "guards" runs on pull_request, which executes the pull request's OWN copy of
 * the guard: a pull request that deletes CLAUDE.md from OWNER_ONLY, or rewrites the
 * guard to print OK, is judged by its own edit.
 *
 * This file runs from .github/workflows/owner-approval.yml on pull_request_target,
 * so GitHub executes the BASE branch's workflow and the BASE branch's copy of this
 * script and of ownerApproval.mjs. The pull request is read only as data from the
 * GitHub API (changed file names, reviews, comments, head commit, git trees), never checked
 * out or run.
 * A pull request therefore cannot change the rule that judges it.
 *
 * Fails closed: outside GitHub Actions, on any other event, without a token, on any
 * API error, on an incomplete file list, or when the head moves mid-read.
 */
import { decideOwnerApproval } from "./lib/ownerApproval.mjs";
import { gatherOwnerApprovalEvidence, readPullContext } from "./lib/githubPullEvidence.mjs";

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

// A re-run keeps the original run's base commit, i.e. the rule as it was then.
// Only re-judge with the rule main has NOW (Fable audit, 2026-11-13).
// GitHub always sets GITHUB_RUN_ATTEMPT; anything but "1" (missing included) is
// treated as a re-run and must prove it is judging with main's current rule.
if ((process.env.GITHUB_RUN_ATTEMPT || "") !== "1") {
  try {
    const r = await fetch(`${ctx.api}/repos/${ctx.repo}/git/ref/heads/main`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r || !r.ok) throw new Error(`GitHub API /git/ref/heads/main answered HTTP ${r ? r.status : "nothing"}`);
    const tip = String(((await r.json()) || {}).object?.sha || "");
    if (!/^[0-9a-f]{40}$/.test(tip) || tip !== String(process.env.GITHUB_SHA || "")) {
      refuse(`this is a re-run of a run that started on main ${String(process.env.GITHUB_SHA || "").slice(0, 12) || "?"}, but main is now ${tip.slice(0, 12) || "unknown"}; an older rule never re-judges. Update the branch and the run for the new head decides`);
    }
  } catch (e) {
    refuse(`owner approval cannot be evaluated: ${(e && e.message) || e}`);
  }
}

let live;
try {
  live = await gatherOwnerApprovalEvidence(ctx);
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
  reviews: live.reviews,
  comments: live.comments,
  fingerprints: live.fingerprints,
  baseChangedAt: live.baseChangedAt,
  error: null,
});
if (!verdict.ok) refuse(verdict.reason);
console.log(`check-owner-approval-pr: OK — ${verdict.reason} (${live.files.length} changed path(s) read from the GitHub API and judged by the base branch's rules)`);
