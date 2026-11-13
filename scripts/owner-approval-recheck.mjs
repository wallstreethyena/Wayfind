#!/usr/bin/env node
/**
 * owner-approval-recheck — after the owner reviews a pull request, re-run the
 * checks that judge owner approval, so nobody has to (Owner Approval V2,
 * 2026-11-13).
 *
 * WHY. The required "owner-approval" check runs on pull_request_target, and
 * "guards" on pull_request. Neither fires when a review is submitted, and a
 * pull_request_review workflow runs from the pull request's own merge commit,
 * so it must never decide or post anything. The split:
 *   owner-review-observed.yml  (pull_request_review, no permissions, no code):
 *                              only marks that the owner reviewed
 *   owner-approval-recheck.yml (workflow_run of the above): GitHub runs it from
 *                              main, so this file is main's copy, never the
 *                              pull request's
 *
 * WHAT IT DOES. Reads the pull request live from the API, and for its CURRENT
 * head only, re-runs the latest "owner-approval" and "guards" workflow runs if
 * they did not succeed. It decides nothing: the re-run checks apply their own
 * rules to live evidence (scripts/lib/ownerApproval.mjs). A re-run can only turn
 * a check green when the owner's review really approves the protected content.
 *
 * Fails closed on any missing context; a failure here leaves the checks red,
 * never green.
 */
import { readFileSync } from "node:fs";

const RECHECK = Object.freeze(["owner-approval.yml", "guards.yml"]);
const env = process.env;
const say = (m) => console.log(`owner-approval-recheck: ${m}`);
const refuse = (m) => {
  console.error(`owner-approval-recheck: FAIL — ${m}.`);
  process.exit(1);
};

if (env.GITHUB_ACTIONS !== "true") refuse("this runs only in GitHub Actions");
if (env.GITHUB_EVENT_NAME !== "workflow_run") refuse(`expected a workflow_run event, got "${env.GITHUB_EVENT_NAME || "unknown"}"`);
if (env.GITHUB_REF !== "refs/heads/main") refuse(`this runs only in main's context (GITHUB_REF is "${env.GITHUB_REF || ""}")`);
const token = String(env.GITHUB_TOKEN || "").trim();
const repo = String(env.GITHUB_REPOSITORY || "").trim();
const api = String(env.GITHUB_API_URL || "").trim().replace(/\/+$/, "");
if (!token) refuse("GITHUB_TOKEN is not available");
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) refuse("GITHUB_REPOSITORY is missing or malformed");
if (!/^https:\/\/[^\s/]+/.test(api)) refuse("GITHUB_API_URL is missing or not an https URL");

let event;
try { event = JSON.parse(readFileSync(String(env.GITHUB_EVENT_PATH || ""), "utf8")); } catch (e) { refuse(`cannot read the event payload (${e.message})`); }
const prs = (event && event.workflow_run && Array.isArray(event.workflow_run.pull_requests)) ? event.workflow_run.pull_requests : [];
if (prs.length !== 1 || !Number.isInteger(prs[0].number)) {
  say(`the observed review names ${prs.length} pull requests; nothing to re-run`);
  process.exit(0);
}
const number = prs[0].number;

const call = async (path, init = {}) => {
  const response = await fetch(`${api}/repos/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(15000),
  }).catch((e) => ({ ok: false, status: String(e && e.message) }));
  if (!response.ok) refuse(`GitHub API ${init.method || "GET"} ${path.split("?")[0]} answered HTTP ${response.status}`);
  return response.status === 204 || response.status === 201 ? null : response.json();
};

const pull = await call(`/pulls/${number}`);
if (!pull || pull.state !== "open") { say(`PR #${number} is not open; nothing to re-run`); process.exit(0); }
if (!pull.base || pull.base.ref !== "main") { say(`PR #${number} does not target main; nothing to re-run`); process.exit(0); }
const head = String((pull.head && pull.head.sha) || "");
if (!/^[0-9a-f]{40}$/.test(head)) refuse(`PR #${number} has no readable head commit`);

for (const file of RECHECK) {
  const listed = await call(`/actions/workflows/${file}/runs?head_sha=${head}&per_page=20`);
  const runs = (listed && Array.isArray(listed.workflow_runs) ? listed.workflow_runs : [])
    .filter((r) => r && r.head_sha === head)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const latest = runs[0];
  if (!latest) { say(`${file}: no run for head ${head.slice(0, 12)} yet; a push or reopen starts one`); continue; }
  if (latest.status !== "completed") { say(`${file}: run ${latest.id} is ${latest.status}; it reads the review itself`); continue; }
  if (latest.conclusion === "success") { say(`${file}: run ${latest.id} already succeeded`); continue; }
  await call(`/actions/runs/${latest.id}/rerun-failed-jobs`, { method: "POST" });
  say(`${file}: re-running run ${latest.id} (${latest.conclusion}) for PR #${number} head ${head.slice(0, 12)}`);
}
