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
import { isOwnerOnly, latestOwnerReview, protectedDiff, protectedFingerprint, OWNER_ONLY_DIRS, OWNER_ONLY_RECURSIVE_DIRS } from "./ownerApproval.mjs";

export const MAX_COMMENT_PAGES = 20; // 2,000 comments
export const MAX_FILE_PAGES = 30;    // 3,000 files: the most GitHub lists for one pull request
export const MAX_REVIEW_PAGES = 10;  // 1,000 reviews

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
export async function fetchPullEvidence(ctx, { withFiles = false, withReviews = false, fetchImpl = globalThis.fetch } = {}) {
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
  const reviews = withReviews ? await paged(`/pulls/${ctx.number}/reviews`, MAX_REVIEW_PAGES, "reviews") : null;
  const second = await call(`/pulls/${ctx.number}`);
  if (headOf(first) !== headOf(second)) {
    throw new Error(`the pull request head moved from ${headOf(first).slice(0, 12) || "nothing"} to ${headOf(second).slice(0, 12) || "nothing"} while its evidence was being read; the run for the new head decides`);
  }
  return { liveHeadSha: headOf(second), baseRef: String((second && second.base && second.base.ref) || ""), comments, reviews, files };
}

const SHA40 = /^[0-9a-f]{40}$/;

/**
 * The protected diff of `commit` against its merge base with `baseRef`, read
 * from GitHub's git data API (never from a checkout): every owner-only entry
 * (mode, type, blob sha = exact bytes) at both commits, walking only the root
 * and the directories owner-only paths can live in. Returns
 * { mergeBase, rows, paths, fingerprint }. Throws on any API problem or a
 * truncated tree: nothing incomplete is ever fingerprinted.
 */
export async function fetchProtectedFingerprint(ctx, commit, { baseRef = "main", fetchImpl = globalThis.fetch } = {}) {
  const sha = String(commit || "").toLowerCase();
  if (!SHA40.test(sha)) throw new Error(`cannot fingerprint "${commit}": not a full commit sha`);
  const call = async (path) => {
    const response = await fetchImpl(`${ctx.api}/repos/${ctx.repo}${path}`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response || !response.ok) throw new Error(`GitHub API ${path.split("?")[0]} answered HTTP ${response ? response.status : "nothing"}`);
    return response.json();
  };
  const compared = await call(`/compare/${encodeURIComponent(baseRef)}...${sha}?per_page=1`);
  const mergeBase = String((compared && compared.merge_base_commit && compared.merge_base_commit.sha) || "").toLowerCase();
  const behindBy = compared && Number.isSafeInteger(compared.behind_by) && compared.behind_by >= 0 ? compared.behind_by : null;
  if (!SHA40.test(mergeBase)) throw new Error(`GitHub gave no merge base for ${sha.slice(0, 12)} against ${baseRef}`);
  const dirs = new Set(OWNER_ONLY_DIRS.map((d) => d.toLowerCase()));
  const deep = new Set(OWNER_ONLY_RECURSIVE_DIRS.map((d) => d.toLowerCase()));
  const tree = async (treeSha, recursive) => {
    const t = await call(`/git/trees/${treeSha}${recursive ? "?recursive=1" : ""}`);
    if (!t || !Array.isArray(t.tree)) throw new Error(`GitHub returned no tree for ${String(treeSha).slice(0, 12)}`);
    if (t.truncated) throw new Error(`GitHub truncated tree ${String(treeSha).slice(0, 12)}; refusing to fingerprint an incomplete tree`);
    return t.tree;
  };
  const snapshot = async (commitSha) => {
    const c = await call(`/git/commits/${commitSha}`);
    const rootSha = String((c && c.tree && c.tree.sha) || "");
    if (!SHA40.test(rootSha)) throw new Error(`GitHub returned no root tree for ${commitSha.slice(0, 12)}`);
    const entries = {};
    const walk = async (treeSha, prefix, recursive) => {
      for (const e of await tree(treeSha, recursive)) {
        if (!e || typeof e.path !== "string" || !e.path) throw new Error("GitHub returned a tree entry with no path");
        const path = prefix ? `${prefix}/${e.path}` : e.path;
        if (e.type === "tree") {
          if (recursive) continue; // a recursive listing already includes the subtree's entries
          const lc = path.toLowerCase();
          if (deep.has(lc)) await walk(e.sha, path, true);
          else if (dirs.has(lc)) await walk(e.sha, path, false);
          continue;
        }
        if (isOwnerOnly(path)) entries[path] = { mode: e.mode, type: e.type, sha: e.sha };
      }
    };
    await walk(rootSha, "", false);
    return entries;
  };
  const rows = protectedDiff(await snapshot(mergeBase), await snapshot(sha));
  return { mergeBase, behindBy, rows, paths: rows.map((r) => r[0]), fingerprint: protectedFingerprint(rows) };
}

/**
 * Everything the owner-approval decision needs, read live: the pull request
 * (files, comments, reviews) and, when the owner has a decisive review, the
 * protected-content fingerprints of the live head and of the reviewed commit.
 * The head is read again at the very end; if it moved, this throws (a stale run
 * must never judge one commit with another commit's content).
 */
export async function gatherOwnerApprovalEvidence(ctx, { fetchImpl = globalThis.fetch } = {}) {
  const live = await fetchPullEvidence(ctx, { withFiles: true, withReviews: true, fetchImpl });
  const fingerprints = {};
  let baseChangedAt = null;
  const review = latestOwnerReview(live.reviews);
  if (review && review.state === "APPROVED" && (live.files || []).some(isOwnerOnly)) {
    const baseRef = live.baseRef || "main";
    // Retargeting the base after approval changes what the approved diff means
    // (Fable audit, 2026-11-13): read every base_ref_changed event.
    baseChangedAt = [];
    for (let page = 1; ; page++) {
      const r = await fetchImpl(`${ctx.api}/repos/${ctx.repo}/issues/${ctx.number}/events?per_page=100&page=${page}`, {
        headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        signal: AbortSignal.timeout(15000),
      });
      if (!r || !r.ok) throw new Error(`GitHub API /issues/${ctx.number}/events answered HTTP ${r ? r.status : "nothing"}`);
      const batch = await r.json();
      if (!Array.isArray(batch)) throw new Error("GitHub API returned a non-array events page");
      for (const e of batch) if (e && e.event === "base_ref_changed") baseChangedAt.push(String(e.created_at || ""));
      if (batch.length < 100) break;
      if (page >= MAX_REVIEW_PAGES) throw new Error(`more than ${MAX_REVIEW_PAGES * 100} pull request events; refusing to guess`);
    }
    fingerprints[live.liveHeadSha] = await fetchProtectedFingerprint(ctx, live.liveHeadSha, { baseRef, fetchImpl });
    const reviewed = String(review.commit_id).toLowerCase();
    fingerprints[reviewed] = reviewed === live.liveHeadSha ? fingerprints[live.liveHeadSha] : await fetchProtectedFingerprint(ctx, reviewed, { baseRef, fetchImpl });
    const again = await fetchImpl(`${ctx.api}/repos/${ctx.repo}/pulls/${ctx.number}`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(15000),
    });
    if (!again || !again.ok) throw new Error(`GitHub API /pulls/${ctx.number} answered HTTP ${again ? again.status : "nothing"}`);
    const head = String(((await again.json()) || {}).head?.sha || "");
    if (head !== live.liveHeadSha) throw new Error(`the pull request head moved from ${live.liveHeadSha.slice(0, 12)} to ${head.slice(0, 12) || "nothing"} while the protected content was being fingerprinted; the run for the new head decides`);
  }
  return { ...live, fingerprints, baseChangedAt };
}
