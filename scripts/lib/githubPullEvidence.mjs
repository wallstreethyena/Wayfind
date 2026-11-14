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
import { semanticAspect, semanticSourcesIn } from "./ownerApproval.mjs";

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
  // workflow_dispatch (the merge queue re-running "guards" on a branch it just
  // updated, 2026-11-13): the pull request comes from the "pr" input and the head
  // from GITHUB_SHA, the commit the run checked out. fetchPullEvidence still reads
  // the live head from the API and the callers refuse when the two differ.
  let pr = event && event.pull_request;
  if (eventName === "workflow_dispatch") {
    const raw = String((event && event.inputs && event.inputs.pr) || "").trim();
    if (!/^[1-9][0-9]{0,8}$/.test(raw)) return { error: "this workflow_dispatch run names no pull request (input \"pr\")" };
    pr = { number: Number(raw), head: { sha: String(env.GITHUB_SHA || "") } };
  }
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
 * every changed file. The head AND the base ref are read again after everything
 * else; if either moved mid-read this throws, rather than judging comments or
 * files from one commit (or one base) against another. Throws on any API problem
 * or incomplete answer.
 *
 * protectedEntries (scripts/lib/ownerApproval.mjs) carries, for every changed
 * owner-only path, its blob+mode at the merge base and the head, and for every
 * changed semantic source (scripts/guards.txt, package.json, vercel.json; taken
 * from `semanticSources` when given, else from the API file list) one aspect entry
 * computed from both sides' content. Every entry carries the PR's baseRef.
 */
export async function fetchPullEvidence(ctx, { withFiles = false, protectedFilter = null, protectedPaths = null, semanticSources = null, fetchImpl = globalThis.fetch } = {}) {
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
  // Protected-content evidence for the fingerprint (scripts/lib/ownerApproval.mjs):
  // the git blob of each changed owner-only path at the merge base and at the head.
  // Paths come from the caller (git diff) or from the API file list filtered by
  // protectedFilter. Any doubt is an error, never a partial list.
  let protectedEntries = null;
  const wanted = Array.isArray(protectedPaths) ? [...new Set(protectedPaths)]
    : (files && typeof protectedFilter === "function" ? files.filter(protectedFilter) : []);
  const semantic = Array.isArray(semanticSources) ? semanticSourcesIn(semanticSources) : semanticSourcesIn(files);
  if (wanted.length || semantic.length) {
    const head = headOf(first);
    const baseRef = String((first && first.base && first.base.ref) || "");
    if (!/^[0-9a-f]{40}$/.test(head) || !baseRef) throw new Error("the pull request has no readable head or base");
    const cmp = await call(`/compare/${encodeURIComponent(baseRef)}...${head}`);
    const mergeBase = String((cmp && cmp.merge_base_commit && cmp.merge_base_commit.sha) || "");
    if (!/^[0-9a-f]{40}$/.test(mergeBase)) throw new Error("GitHub returned no merge base for the pull request");
    // Read each path from git TREES, not /contents: /contents follows a symlink and
    // reports the target's blob as a "file", so swapping an approved file for a
    // symlink to an unprotected copy would keep the fingerprint (2026-11-13 review).
    // The tree entry gives the real mode; symlinks and submodules are refused.
    const trees = new Map();
    const listTree = async (sha) => {
      if (!trees.has(sha)) {
        const t = await call(`/git/trees/${sha}`);
        if (!t || !Array.isArray(t.tree) || t.truncated) throw new Error("GitHub returned an incomplete git tree; refusing to judge");
        trees.set(sha, t.tree);
      }
      return trees.get(sha);
    };
    const roots = new Map();
    const blobAt = async (path, commit) => {
      if (!roots.has(commit)) {
        const c = await call(`/git/commits/${commit}`);
        const tree = String((c && c.tree && c.tree.sha) || "");
        if (!tree) throw new Error(`GitHub returned no tree for ${commit.slice(0, 12)}`);
        roots.set(commit, tree);
      }
      let tree = roots.get(commit);
      const parts = path.split("/");
      for (let i = 0; i < parts.length; i++) {
        const entry = (await listTree(tree)).find((e) => e && e.path === parts[i]);
        if (!entry) return { sha: null, mode: null };
        if (i < parts.length - 1) {
          if (entry.type !== "tree") return { sha: null, mode: null };
          tree = entry.sha;
          continue;
        }
        if (entry.type !== "blob" || !/^100(644|755)$/.test(String(entry.mode)) || !/^[0-9a-f]{40}$/.test(String(entry.sha || ""))) {
          throw new Error(`${path} is not a regular file at ${commit.slice(0, 12)} (mode ${entry.mode}, type ${entry.type}); symlinks and submodules cannot carry owner approval`);
        }
        return { sha: entry.sha, mode: String(entry.mode) };
      }
      return { sha: null, mode: null };
    };
    // Blob CONTENT for the semantic aspects (blobAt already refused symlinks).
    const textOf = async (sha) => {
      if (sha === null) return null;
      const b = await call(`/git/blobs/${sha}`);
      if (!b || b.encoding !== "base64" || typeof b.content !== "string") throw new Error(`GitHub returned blob ${sha.slice(0, 12)} without base64 content; refusing to judge`);
      return Buffer.from(b.content.replace(/\s+/g, ""), "base64").toString("utf8");
    };
    protectedEntries = [];
    for (const path of wanted) {
      const base = await blobAt(path, mergeBase);
      const tip = await blobAt(path, head);
      protectedEntries.push({ path, base: base.sha, head: tip.sha, baseMode: base.mode, headMode: tip.mode, baseRef });
    }
    for (const source of semantic) {
      const base = await blobAt(source, mergeBase);
      const tip = await blobAt(source, head);
      const { path, aspect } = semanticAspect(source, await textOf(base.sha), await textOf(tip.sha));
      protectedEntries.push({ path, aspect, baseRef });
    }
  }
  const comments = await paged(`/issues/${ctx.number}/comments`, MAX_COMMENT_PAGES, "comments");
  const second = await call(`/pulls/${ctx.number}`);
  if (headOf(first) !== headOf(second)) {
    throw new Error(`the pull request head moved from ${headOf(first).slice(0, 12) || "nothing"} to ${headOf(second).slice(0, 12) || "nothing"} while its evidence was being read; the run for the new head decides`);
  }
  const baseOf = (pull) => String((pull && pull.base && pull.base.ref) || "");
  if (baseOf(first) !== baseOf(second)) {
    throw new Error(`the pull request was retargeted from "${baseOf(first)}" to "${baseOf(second)}" while its evidence was being read; the run for the new base decides`);
  }
  return { liveHeadSha: headOf(second), baseRef: String((second && second.base && second.base.ref) || ""), comments, files, protectedEntries };
}
