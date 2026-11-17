// scripts/lib/githubPullEvidence.mjs — read a pull request's owner-approval
// evidence from the GitHub REST API. Only meaningful inside GitHub Actions.
//
// Three callers:
//   scripts/check-doc-ownership.mjs    the "guards" check (pull_request): runs the
//                                      pull request's own copy of the rules
//   scripts/check-owner-approval-pr.mjs the "owner-approval" check
//                                      (pull_request_target): runs the BASE
//                                      branch's copy, so a pull request cannot
//                                      rewrite the rule that judges it
//   scripts/owner-approval-gate.mjs    the "owner-approval-gate" check, posted
//                                      as the Owner Gate GitHub App from main
//
// Nothing here decides approval (that is scripts/lib/ownerApproval.mjs). Every
// problem comes back as an error string or a thrown Error, and both callers turn
// any problem into a refusal. There is no default that could make a missing
// piece of context look like evidence.
import { readFileSync } from "node:fs";

export const MAX_COMMENT_PAGES = 20; // 2,000 comments
export const MAX_FILE_PAGES = 30;    // 3,000 files: the most GitHub lists for one pull request

/**
 * Pull-request context from the Actions environment.
 * Returns { error } or { error: null, api, repo, token, number, eventHeadSha }.
 */
export function readPullContext(env, allowedEvents) {
  const eventName = String(env.GITHUB_EVENT_NAME || "");
  if (!allowedEvents.includes(eventName)) {
    return { error: `the run was triggered by "${eventName || "unknown"}", not a pull request event this check accepts (${allowedEvents.join(", ")}), so there is no pull request to approve` };
  }
  let event;
  try { event = JSON.parse(readFileSync(String(env.GITHUB_EVENT_PATH || ""), "utf8")); }
  catch (e) { return { error: `cannot read the GitHub event payload (${e.message})` }; }
  const pr = event && event.pull_request;
  const number = pr && pr.number;
  if (!Number.isInteger(number) || number < 1) return { error: "the event payload names no pull request number" };
  const token = String(env.GITHUB_TOKEN || "").trim();
  if (!token) return { error: "GITHUB_TOKEN is not available to the guard step" };
  const repo = String(env.GITHUB_REPOSITORY || "").trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: "GITHUB_REPOSITORY is missing or malformed" };
  const api = String(env.GITHUB_API_URL || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+/.test(api)) return { error: "GITHUB_API_URL is missing or not an https URL" };
  return { error: null, api, repo, token, number, eventHeadSha: String((pr.head && pr.head.sha) || "") };
}

/**
 * Live evidence for ctx.number: the head commit, every PR comment, and (withFiles)
 * every changed file. The head is read again after everything else; if it moved
 * mid-read this throws, rather than judging comments or files from one commit
 * against another. Throws on any API problem or incomplete answer.
 */
export async function fetchPullEvidence(ctx, { withFiles = false, fetchImpl = globalThis.fetch } = {}) {
  const call = async (path) => {
    const response = await fetchImpl(`${ctx.api}/repos/${ctx.repo}${path}`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response || !response.ok) throw new Error(`GitHub API ${path.split("?")[0]} answered HTTP ${response ? response.status : "nothing"}`);
    return response.json();
  };
  const paged = async (path, maxPages, label) => {
    const all = [];
    for (let page = 1; ; page++) {
      const batch = await call(`${path}?per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error(`GitHub API returned a non-array ${label} page`);
      all.push(...batch);
      if (batch.length < 100) return all;
      if (page >= maxPages) throw new Error(`more than ${maxPages * 100} ${label}; refusing to guess`);
    }
  };
  const headOf = (pull) => String((pull && pull.head && pull.head.sha) || "");

  const first = await call(`/pulls/${ctx.number}`);
  let files = null;
  if (withFiles) {
    const listed = await paged(`/pulls/${ctx.number}/files`, MAX_FILE_PAGES, "changed files");
    const expected = first && first.changed_files;
    if (!Number.isInteger(expected) || listed.length !== expected) {
      throw new Error(`GitHub listed ${listed.length} changed file(s) but the pull request reports ${expected}; refusing to judge an incomplete list`);
    }
    files = [];
    for (const entry of listed) {
      if (!entry || typeof entry.filename !== "string" || !entry.filename) throw new Error("GitHub returned a changed-file entry with no filename");
      files.push(entry.filename);
      // A rename is also a change to the old path: moving CLAUDE.md away is an owner-only change.
      if (typeof entry.previous_filename === "string" && entry.previous_filename) files.push(entry.previous_filename);
    }
    files = [...new Set(files)];
  }
  const comments = await paged(`/issues/${ctx.number}/comments`, MAX_COMMENT_PAGES, "comments");
  const second = await call(`/pulls/${ctx.number}`);
  if (headOf(first) !== headOf(second)) {
    throw new Error(`the pull request head moved from ${headOf(first).slice(0, 12) || "nothing"} to ${headOf(second).slice(0, 12) || "nothing"} while its evidence was being read; the run for the new head decides`);
  }
  return { liveHeadSha: headOf(second), baseRef: String((second && second.base && second.base.ref) || ""), comments, files };
}
