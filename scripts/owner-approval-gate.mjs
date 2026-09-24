#!/usr/bin/env node
/**
 * owner-approval-gate — posts the "owner-approval-gate" check as the Wayfind
 * Owner Gate GitHub App (2026-09-24).
 *
 * WHY. The "owner-approval" check is reported by GitHub Actions, and on a
 * repository owned by a personal account branch protection can only pin a
 * required check to an app, not to a workflow file. So a pull request that adds
 * its own workflow with a job called "owner-approval" could report a passing
 * check under the same name and app. A check run created with a GitHub App's
 * installation token is attributed to THAT App, and branch protection pins
 * "owner-approval-gate" to the Owner Gate App's id. Nothing a pull request adds
 * can post as that App:
 *   - its private key lives only in the "owner-gate" environment, whose
 *     deployment branch policy admits workflows running on main and nothing else;
 *   - this script runs from .github/workflows/owner-approval-gate.yml on
 *     pull_request_target and issue_comment, which GitHub always runs from main;
 *   - every file under .github/ is owner-only, so a pull request cannot change
 *     that workflow (or add another) without the owner's approval.
 *
 * WHAT IT DECIDES. Exactly what check-owner-approval-pr decides (the same
 * scripts/lib/ownerApproval.mjs): owner-only files may change only with an
 * "/owner-approve <full head sha>" comment from the owner's account. The pull
 * request is read only as API data with the read-only GITHUB_TOKEN; nothing from
 * it is checked out or run. The App token is used for one call: creating the
 * check run.
 *
 * Until the App exists (no OWNER_GATE_APP_ID and no key) it posts nothing and
 * exits 0: the check is not required yet, and a missing check can never pass a
 * rule that requires it. Half a configuration is an error.
 */
import { readFileSync } from "node:fs";
import { decideOwnerApproval } from "./lib/ownerApproval.mjs";
import { fetchPullEvidence } from "./lib/githubPullEvidence.mjs";
import { mintInstallationToken } from "./lib/githubAppAuth.mjs";

const CHECK_NAME = "owner-approval-gate";
const env = process.env;
const say = (message) => console.log(`owner-approval-gate: ${message}`);
const refuse = (reason) => {
  console.error(`owner-approval-gate: FAIL — ${reason}.`);
  process.exit(1);
};

const appId = String(env.OWNER_GATE_APP_ID || "").trim();
const privateKey = String(env.OWNER_GATE_PRIVATE_KEY || "");
if (!appId && !privateKey.trim()) {
  say("NOT CONFIGURED — the Owner Gate App id and key are not set, so no gate check was posted. See docs/OWNER_APPROVAL.md, \"Turning on the Owner Gate App\".");
  process.exit(0);
}
if (!appId || !privateKey.trim()) refuse("half configured: OWNER_GATE_APP_ID and OWNER_GATE_PRIVATE_KEY must both be set in the owner-gate environment");
if (env.GITHUB_ACTIONS !== "true") refuse("this runs only in GitHub Actions");
if (env.GITHUB_REF !== "refs/heads/main") refuse(`this runs only in main's context (GITHUB_REF is "${env.GITHUB_REF || ""}"), never on a pull request's own ref`);
// A re-run keeps its original GITHUB_SHA, so it would check out main as it was
// then and apply an older rule to today's head. Re-evaluation happens through
// new events (a push, or a comment), never through re-running an old run.
if (String(env.GITHUB_RUN_ATTEMPT || "") !== "1") refuse(`re-runs are not accepted (run attempt "${env.GITHUB_RUN_ATTEMPT || ""}"): push again or comment to re-evaluate, so main's current rule decides`);

const eventName = String(env.GITHUB_EVENT_NAME || "");
if (eventName !== "pull_request_target" && eventName !== "issue_comment") refuse(`the gate decides only on pull_request_target or issue_comment, not "${eventName || "unknown"}"`);
let event;
try { event = JSON.parse(readFileSync(String(env.GITHUB_EVENT_PATH || ""), "utf8")); } catch (e) { refuse(`cannot read the GitHub event payload (${e.message})`); }

let number;
let eventHeadSha = null;
if (eventName === "pull_request_target") {
  number = event && event.pull_request && event.pull_request.number;
  eventHeadSha = String((event.pull_request && event.pull_request.head && event.pull_request.head.sha) || "");
} else {
  if (!event || !event.issue || !event.issue.pull_request) {
    say("comment is on an issue, not a pull request; nothing to decide");
    process.exit(0);
  }
  number = event.issue.number;
}
if (!Number.isInteger(number) || number < 1) refuse("the event names no pull request number");

const token = String(env.GITHUB_TOKEN || "").trim();
const repo = String(env.GITHUB_REPOSITORY || "").trim();
const api = String(env.GITHUB_API_URL || "").trim().replace(/\/+$/, "");
if (!token) refuse("GITHUB_TOKEN is not available to read the pull request");
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) refuse("GITHUB_REPOSITORY is missing or malformed");
if (!/^https:\/\/[^\s/]+/.test(api)) refuse("GITHUB_API_URL is missing or not an https URL");

let live = null;
let evidenceError = null;
try {
  live = await fetchPullEvidence({ api, repo, token, number }, { withFiles: true });
} catch (e) {
  evidenceError = String((e && e.message) || e);
}

if (live && live.baseRef !== "main") {
  say(`PR #${number} targets "${live.baseRef}", not main; nothing to gate`);
  process.exit(0);
}
if (live && eventHeadSha && eventHeadSha !== live.liveHeadSha) {
  say(`PR #${number} moved from ${eventHeadSha.slice(0, 12)} to ${live.liveHeadSha.slice(0, 12)} after this run started; the run for the new head decides`);
  process.exit(0);
}
const headSha = live ? live.liveHeadSha : eventHeadSha;
if (!/^[0-9a-f]{40}$/.test(String(headSha || ""))) refuse(`no head commit to post the gate check on (${evidenceError || "unknown head"})`);

const verdict = evidenceError
  ? { ok: false, protectedPaths: [], reason: `owner approval could not be verified: ${evidenceError}` }
  : decideOwnerApproval({
    changedPaths: live.files,
    mergeGate: true,
    pr: { number, eventHeadSha: live.liveHeadSha, liveHeadSha: live.liveHeadSha },
    comments: live.comments,
    error: null,
  });

let appToken;
try {
  appToken = await mintInstallationToken({ api, repo, appId, privateKeyPem: privateKey, permissions: { checks: "write" } });
} catch (e) {
  refuse(`could not authenticate as the Owner Gate App: ${(e && e.message) || e}`);
}

const title = !verdict.ok
  ? (evidenceError ? "Owner approval could not be verified" : "Owner approval required")
  : (verdict.protectedPaths.length ? "Approved by the owner" : "No owner-only files changed");
const response = await fetch(`${api}/repos/${repo}/check-runs`, {
  method: "POST",
  headers: { Authorization: `Bearer ${appToken}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
  body: JSON.stringify({
    name: CHECK_NAME,
    head_sha: headSha,
    status: "completed",
    conclusion: verdict.ok ? "success" : "failure",
    output: { title, summary: String(verdict.reason).slice(0, 60000) },
  }),
  signal: AbortSignal.timeout(15000),
}).catch((e) => ({ ok: false, status: String(e && e.message) }));
if (!response.ok) refuse(`GitHub refused the gate check (HTTP ${response.status})`);

say(`${verdict.ok ? "PASS" : "BLOCK"} posted for PR #${number} head ${headSha.slice(0, 12)} — ${verdict.reason}`);
if (evidenceError) process.exit(1);
