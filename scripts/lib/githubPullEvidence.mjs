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
import { ownChangeFingerprint, ownerApprovedShas } from "./ownerApproval.mjs";

// Events that are not pull request events but judge one named pull request:
// "workflow_dispatch" (a guards run the merge train dispatched on the branch)
// and "merge-train" (the train itself, from main, evaluating owner approval).
export const TRAIN_EVENTS = new Set(["workflow_dispatch", "merge-train"]);

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
  let number, eventHeadSha;
  if (TRAIN_EVENTS.has(eventName)) {
    // Not a pull request event: the merge train (from main) or a guards run it
    // dispatched names the pull request and the exact head it is judging. The
    // head must still equal the live head (checked by every caller), so naming
    // another PR's number cannot borrow that PR's approval.
    number = Number(String(env.WF_PR_NUMBER || "").trim());
    eventHeadSha = String(env.WF_PR_HEAD || "").trim().toLowerCase();
    if (!Number.isInteger(number) || number < 1) return { error: `a ${eventName} run must name the pull request in WF_PR_NUMBER` };
    if (!/^[0-9a-f]{40}$/.test(eventHeadSha)) return { error: `a ${eventName} run must name the judged head in WF_PR_HEAD` };
  } else {
    let event;
    try { event = JSON.parse(readFileSync(String(env.GITHUB_EVENT_PATH || ""), "utf8")); }
    catch (e) { return { error: `cannot read the GitHub event payload (${e.message})` }; }
    const pr = event && event.pull_request;
    number = pr && pr.number;
    if (!Number.isInteger(number) || number < 1) return { error: "the event payload names no pull request number" };
    eventHeadSha = String((pr.head && pr.head.sha) || "");
  }
  const token = String(env.GITHUB_TOKEN || "").trim();
  if (!token) return { error: "GITHUB_TOKEN is not available to the guard step" };
  const repo = String(env.GITHUB_REPOSITORY || "").trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return { error: "GITHUB_REPOSITORY is missing or malformed" };
  const api = String(env.GITHUB_API_URL || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^\s/]+/.test(api)) return { error: "GITHUB_API_URL is missing or not an https URL" };
  return { error: null, api, repo, token, number, eventHeadSha };
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

/**
 * Evidence that an earlier owner-approved head of this pull request carries to
 * the live head (see carriedApproval in ownerApproval.mjs). Returns null when no
 * earlier approval exists or when the evidence cannot be read completely.
 */
export async function fetchApprovalCarry(ctx, live, { fetchImpl = globalThis.fetch } = {}) {
  const shas = ownerApprovedShas(live.comments).filter((s) => s !== String(live.liveHeadSha).toLowerCase());
  if (!shas.length) return null;
  const call = async (path) => {
    const response = await fetchImpl(`${ctx.api}/repos/${ctx.repo}${path}`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response || !response.ok) throw new Error(`GitHub API ${path.split("?")[0]} answered HTTP ${response ? response.status : "nothing"}`);
    return response.json();
  };
  try {
    const commits = [];
    for (let page = 1; page <= 3; page++) {
      const batch = await call(`/pulls/${ctx.number}/commits?per_page=100&page=${page}`);
      if (!Array.isArray(batch)) return null;
      commits.push(...batch.map((c) => String((c && c.sha) || "").toLowerCase()));
      if (batch.length < 100) break;
      if (page === 3) return null;
    }
    const base = encodeURIComponent(live.baseRef || "main");
    const own = async (sha) => {
      const cmp = await call(`/compare/${base}...${sha}?per_page=300`);
      return ownChangeFingerprint(cmp && cmp.files);
    };
    const atHead = await own(live.liveHeadSha);
    if (!atHead) return null;
    for (const fromSha of shas) {
      if (!commits.includes(fromSha)) continue;
      const atApproval = await own(fromSha);
      if (atApproval && atApproval === atHead) return { fromSha, inPullCommits: true, ownChangeAtApproval: atApproval, ownChangeAtHead: atHead };
    }
  } catch {
    return null;
  }
  return null;
}
