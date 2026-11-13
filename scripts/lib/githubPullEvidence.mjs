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
import { createHash } from "node:crypto";
import { isOwnerOnly, ownerApprovedFingerprints, protectedFingerprint } from "./ownerApproval.mjs";

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
 *
 * withProtectedDiff: also computes the protected-diff fingerprint (owner
 * approval v2) for the head read FIRST, before the head is read again, so a
 * pull request that moves to another protected diff mid-run fails closed.
 */
export async function fetchPullEvidence(ctx, { withFiles = false, withProtectedDiff = false, fetchImpl = globalThis.fetch } = {}) {
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
  let listedEntries = null;
  if (withFiles || withProtectedDiff) {
    const listed = await paged(`/pulls/${ctx.number}/files`, MAX_FILE_PAGES, "changed files");
    const expected = first && first.changed_files;
    if (!Number.isInteger(expected) || listed.length !== expected) {
      throw new Error(`GitHub listed ${listed.length} changed file(s) but the pull request reports ${expected}; refusing to judge an incomplete list`);
    }
    listedEntries = listed;
    files = [];
    for (const entry of listed) {
      if (!entry || typeof entry.filename !== "string" || !entry.filename) throw new Error("GitHub returned a changed-file entry with no filename");
      files.push(entry.filename);
      // A rename is also a change to the old path: moving CLAUDE.md away is an owner-only change.
      if (typeof entry.previous_filename === "string" && entry.previous_filename) files.push(entry.previous_filename);
    }
    files = [...new Set(files)];
  }
  let protectedDiff = null;
  let protectedDiffError = null;
  if (withProtectedDiff) {
    try {
      protectedDiff = await protectedDiffFor(ctx, call, headOf(first), String((first.base && first.base.ref) || ""), listedEntries);
    } catch (e) {
      protectedDiffError = String((e && e.message) || e);
    }
  }
  const comments = await paged(`/issues/${ctx.number}/comments`, MAX_COMMENT_PAGES, "comments");
  const second = await call(`/pulls/${ctx.number}`);
  if (headOf(first) !== headOf(second)) {
    throw new Error(`the pull request head moved from ${headOf(first).slice(0, 12) || "nothing"} to ${headOf(second).slice(0, 12) || "nothing"} while its evidence was being read; the run for the new head decides`);
  }
  return { liveHeadSha: headOf(second), baseRef: String((second && second.base && second.base.ref) || ""), comments, files: withFiles ? files : null, protectedDiff, protectedDiffError };
}

// ---- owner approval v2: the protected-diff fingerprint --------------------------

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const gitBlobSha = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const encodePath = (path) => path.split("/").map(encodeURIComponent).join("/");

/** SHA-256 of a file's bytes at `ref`, or null when the file does not exist there. */
async function contentHash(call, path, ref) {
  let entry;
  try {
    entry = await call(`/contents/${encodePath(path)}?ref=${ref}`);
  } catch (e) {
    if (/HTTP 404\b/.test(String(e && e.message))) return null;
    throw e;
  }
  if (!entry || Array.isArray(entry) || entry.type !== "file" || typeof entry.sha !== "string") {
    throw new Error(`${path} at ${ref.slice(0, 12)} is not a plain file`);
  }
  let b64 = typeof entry.content === "string" ? entry.content : "";
  if (entry.encoding !== "base64" || (!b64 && entry.size > 0)) {
    const blob = await call(`/git/blobs/${entry.sha}`); // files over 1 MB
    if (!blob || blob.encoding !== "base64" || typeof blob.content !== "string") throw new Error(`cannot read ${path} at ${ref.slice(0, 12)}`);
    b64 = blob.content;
  }
  const bytes = Buffer.from(b64.replace(/\s+/g, ""), "base64");
  // The bytes must be exactly the blob GitHub names; anything else fails closed.
  if (gitBlobSha(bytes) !== entry.sha.toLowerCase()) throw new Error(`${path} at ${ref.slice(0, 12)}: content does not match its blob id`);
  return sha256(bytes);
}

/** The fingerprint of the protected diff at `headSha` (see protectedFingerprint). */
async function protectedDiffFor(ctx, call, headSha, baseRef, listedEntries) {
  if (!/^[0-9a-f]{40}$/.test(headSha)) throw new Error("no head commit to fingerprint");
  if (!baseRef) throw new Error("no base branch to fingerprint against");
  const paths = new Set();
  for (const e of listedEntries || []) {
    if (e && isOwnerOnly(e.filename)) paths.add(e.filename);
    if (e && typeof e.previous_filename === "string" && isOwnerOnly(e.previous_filename)) paths.add(e.previous_filename);
  }
  if (!paths.size) return null;
  const cmp = await call(`/compare/${encodeURIComponent(baseRef)}...${headSha}?per_page=1`);
  const mergeBase = String((cmp && cmp.merge_base_commit && cmp.merge_base_commit.sha) || "");
  const baseTip = String((cmp && cmp.base_commit && cmp.base_commit.sha) || "");
  if (!/^[0-9a-f]{40}$/.test(mergeBase)) throw new Error("GitHub gave no merge base for the protected diff");
  if (!/^[0-9a-f]{40}$/.test(baseTip)) throw new Error("GitHub gave no base branch tip for the protected diff");
  const entries = [];
  for (const path of [...paths].sort()) {
    const base = await contentHash(call, path, mergeBase);
    // The approved bytes must be exactly what merging produces. If main changed a
    // protected file this pull request also touches after the branch's merge base,
    // the merge would blend in content nobody approved: fail closed until the
    // branch is brought up to date (then the base content, and the fingerprint,
    // reflect main's change and the owner reviews it).
    if (baseTip !== mergeBase && (await contentHash(call, path, baseTip)) !== base) {
      throw new Error(`main changed ${path} after this branch's merge base; bring the branch up to date first`);
    }
    entries.push({ path, base, head: await contentHash(call, path, headSha) });
  }
  const fp = protectedFingerprint({ repo: ctx.repo, number: ctx.number, entries }, sha256);
  if (!fp) throw new Error("the protected diff is incomplete");
  return { ...fp, headSha, mergeBase };
}

/**
 * Audit trail only (never grants approval): for owner-approved fingerprints that
 * no longer match, try to rebuild the approved manifest from this pull request's
 * most recent commits, so the gate can name which protected files changed.
 */
export async function fetchApprovedManifests(ctx, live, { fetchImpl = globalThis.fetch, maxCommits = 8 } = {}) {
  const wanted = ownerApprovedFingerprints(live.comments);
  if (!wanted.length) return {};
  const call = async (path) => {
    const response = await fetchImpl(`${ctx.api}/repos/${ctx.repo}${path}`, {
      headers: { Authorization: `Bearer ${ctx.token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(15000),
    });
    if (!response || !response.ok) throw new Error(`GitHub API ${path.split("?")[0]} answered HTTP ${response ? response.status : "nothing"}`);
    return response.json();
  };
  const found = {};
  try {
    const commits = await call(`/pulls/${ctx.number}/commits?per_page=100`);
    const recent = (Array.isArray(commits) ? commits : []).map((c) => String((c && c.sha) || "")).filter((s) => /^[0-9a-f]{40}$/.test(s)).reverse().slice(1, 1 + maxCommits);
    for (const sha of recent) {
      const cmp = await call(`/compare/${encodeURIComponent(live.baseRef || "main")}...${sha}?per_page=300`);
      const fp = await protectedDiffFor(ctx, call, sha, live.baseRef || "main", (cmp && cmp.files) || []);
      if (fp && wanted.includes(fp.fingerprint) && !found[fp.fingerprint]) found[fp.fingerprint] = fp.manifest;
      if (Object.keys(found).length === wanted.length) break;
    }
  } catch {
    // audit trail is best effort; the decision never depends on it
  }
  return found;
}
