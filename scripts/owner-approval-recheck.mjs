#!/usr/bin/env node
/**
 * owner-approval-recheck — after the owner posts an approval comment, re-run the
 * checks that judge owner approval, so nobody has to click "Re-run" (2026-11-14,
 * ported from #2494's recheck and re-pointed at the comment contract).
 *
 * WHY. The required "owner-approval" check runs on pull_request_target and
 * "guards" on pull_request: neither fires when a comment is posted, so an owner's
 * "/owner-approve <fingerprint>" comment left both red until someone re-ran them.
 *
 * HOW. .github/workflows/owner-approval-recheck.yml runs this on issue_comment
 * (created). GitHub runs issue_comment workflows from the default branch, so this
 * is main's copy, never the pull request's; nothing from the pull request is
 * checked out or executed. The workflow's `if` admits only comments on a pull
 * request by the owner login (user.type "User") whose body mentions
 * /owner-approve; this script re-checks all of it against the payload (login AND
 * numeric account id AND an exact approval line).
 *
 * WHAT IT DOES. Reads the pull request live from the API and, for its CURRENT head
 * only, re-runs the failed jobs of the latest owner-approval.yml and guards.yml
 * runs if they completed without success. IT DECIDES NOTHING: the re-run checks
 * apply their own rules to live evidence (scripts/lib/ownerApproval.mjs), so a
 * re-run can only turn green when the comment really approves the protected
 * content. A re-run of owner-approval refuses once main has moved past the run's
 * commit (scripts/check-owner-approval-pr.mjs); then a push decides.
 *
 * Fails closed: any missing context or API error exits 1 and leaves the checks
 * exactly as they were (never green). Hermetic test: scripts/test-owner-approval-recheck.mjs.
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { OWNERS } from "./lib/ownerApproval.mjs";

export const RECHECK_WORKFLOWS = Object.freeze(["owner-approval.yml", "guards.yml"]);
const APPROVAL_LINE = /^\/owner-approve[ \t]+(?:[0-9a-fA-F]{64}|[0-9a-fA-F]{40})[ \t]*$/m;
const SHA40 = /^[0-9a-f]{40}$/;

/**
 * Pure-ish core: env + parsed event + fetch in, { code, lines, reruns } out.
 * Never throws; never exits.
 */
export async function recheck({ env, event, fetchImpl }) {
  const lines = [];
  const reruns = [];
  const say = (m) => lines.push(`owner-approval-recheck: ${m}`);
  const refuse = (m) => { lines.push(`owner-approval-recheck: FAIL — ${m}.`); return { code: 1, lines, reruns }; };
  const done = () => ({ code: 0, lines, reruns });

  if (env.GITHUB_ACTIONS !== "true") return refuse("this runs only in GitHub Actions");
  if (env.GITHUB_EVENT_NAME !== "issue_comment") return refuse(`expected an issue_comment event, got "${env.GITHUB_EVENT_NAME || "unknown"}"`);
  if (env.GITHUB_REF !== "refs/heads/main") return refuse(`this runs only in main's context (GITHUB_REF is "${env.GITHUB_REF || ""}")`);
  const token = String(env.GITHUB_TOKEN || "").trim();
  const repo = String(env.GITHUB_REPOSITORY || "").trim();
  const api = String(env.GITHUB_API_URL || "").trim().replace(/\/+$/, "");
  if (!token) return refuse("GITHUB_TOKEN is not available");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return refuse("GITHUB_REPOSITORY is missing or malformed");
  if (!/^https:\/\/[^\s/]+/.test(api)) return refuse("GITHUB_API_URL is missing or not an https URL");
  if (!event || typeof event !== "object") return refuse("the event payload is missing");
  if (event.action !== "created") { say(`comment ${event.action || "event"} is not a new comment; nothing to re-run`); return done(); }
  if (!event.issue || !event.issue.pull_request) { say("the comment is on an issue, not a pull request; nothing to re-run"); return done(); }
  const number = event.issue.number;
  if (!Number.isInteger(number) || number < 1) return refuse("the event names no pull request number");
  const user = (event.comment && event.comment.user) || {};
  const owner = user.type === "User" && OWNERS.some((o) => o.id === user.id && typeof user.login === "string" && o.login.toLowerCase() === user.login.toLowerCase());
  if (!owner) { say(`comment by "${user.login || "unknown"}" is not the owner's; nothing to re-run`); return done(); }
  if (!APPROVAL_LINE.test(String((event.comment && event.comment.body) || ""))) { say("the owner's comment has no /owner-approve line; nothing to re-run"); return done(); }

  const call = async (method, path) => {
    let response;
    try {
      response = await fetchImpl(`${api}/repos/${repo}${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      throw new Error(`GitHub API ${method} ${path.split("?")[0]} failed (${(e && e.message) || e})`);
    }
    if (!response || !response.ok) throw new Error(`GitHub API ${method} ${path.split("?")[0]} answered HTTP ${response ? response.status : "nothing"}`);
    return response.status === 201 || response.status === 204 ? null : response.json();
  };

  try {
    const pull = await call("GET", `/pulls/${number}`);
    if (!pull || pull.state !== "open") { say(`PR #${number} is not open; nothing to re-run`); return done(); }
    const head = String((pull.head && pull.head.sha) || "");
    if (!SHA40.test(head)) return refuse(`PR #${number} has no readable head commit`);
    for (const file of RECHECK_WORKFLOWS) {
      const listed = await call("GET", `/actions/workflows/${file}/runs?head_sha=${head}&per_page=50`);
      if (!listed || !Array.isArray(listed.workflow_runs)) return refuse(`GitHub returned no run list for ${file}`);
      const latest = listed.workflow_runs
        .filter((r) => r && r.head_sha === head && Number.isSafeInteger(r.id))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      if (!latest) { say(`${file}: no run for head ${head.slice(0, 12)} yet; the next push starts one`); continue; }
      if (latest.status !== "completed") { say(`${file}: run ${latest.id} is ${latest.status}; it reads the comment itself`); continue; }
      if (latest.conclusion === "success") { say(`${file}: run ${latest.id} already succeeded`); continue; }
      await call("POST", `/actions/runs/${latest.id}/rerun-failed-jobs`);
      reruns.push({ file, id: latest.id });
      say(`${file}: re-running the failed jobs of run ${latest.id} (${latest.conclusion}) for PR #${number} head ${head.slice(0, 12)}`);
    }
  } catch (e) {
    return refuse(String((e && e.message) || e));
  }
  return done();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let event = null;
  try { event = JSON.parse(readFileSync(String(process.env.GITHUB_EVENT_PATH || ""), "utf8")); } catch { event = null; }
  const r = await recheck({ env: process.env, event, fetchImpl: globalThis.fetch });
  for (const l of r.lines) (r.code ? console.error : console.log)(l);
  process.exit(r.code);
}
