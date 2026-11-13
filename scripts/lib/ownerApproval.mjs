// scripts/lib/ownerApproval.mjs — what counts as OWNER APPROVAL for an edit to
// an owner-only file, decided from GitHub-authenticated evidence only.
//
// WHY THIS EXISTS (2026-09-23). check-doc-ownership used to grant approval when
// a commit's author NAME was "Gabriel Pereira". Commit author and committer are
// plain text that anyone can set (`git commit --author=...`,
// GIT_AUTHOR_NAME=...), so any lane could satisfy the check by typing the
// owner's name. PR #1478 (the CLAUDE.md cleanup) hit the check and the only
// way through was to impersonate the owner, which is not approval at all.
//
// WHAT IS TRUSTED NOW. A pull-request comment whose author is an owner LOGIN
// (resolved by GitHub from the authenticated account that posted it, never
// from git metadata) with a line
//
//     /owner-approve <the full 40-character head commit sha>
//
// that names the PR's CURRENT head commit. The full sha, not a prefix: a short
// prefix can be matched by grinding a different commit, a full SHA-1 cannot. A new push changes the head, so an
// old approval stops matching: the owner approves exact bytes, not a branch.
// Only GitHub Actions can read that evidence (the "guards" check and the
// "owner-approval" check, which applies the BASE branch's copy of this file);
// a local run can never grant approval.
//
// CONTENT FINGERPRINT (2026-11-13). The owner approves protected CONTENT, not a
// transient commit. Besides the legacy 40-hex head sha, the command accepts a
// 64-hex fingerprint:
//
//     /owner-approve <sha256 fingerprint shown in the owner-approval check>
//
// The fingerprint (protectedFingerprint below) hashes the PR number and, for every
// changed owner-only path, the git blob at the merge base and at the head. So it
// SURVIVES a rebase, a merge of main, or any change outside the protected files,
// and it CHANGES (approval stops matching) when protected content changes, a
// protected file is added or removed, main edits the same protected file (its
// merge-base blob moves), or the approval is pasted on another PR.
//
// Pure module: no environment, filesystem, network or git access. The caller
// (scripts/check-doc-ownership.mjs) gathers evidence and passes it in, so every
// rule here is executable in hermetic tests.

import { createHash } from "node:crypto";

// Accounts allowed to approve: the login (compared case-insensitively, as GitHub
// does) AND the numeric account id, which never changes, so a renamed or released
// login that someone else registers later cannot approve.
export const OWNERS = Object.freeze([Object.freeze({ login: "wallstreethyena", id: 297334934 })]);
export const OWNER_LOGINS = Object.freeze(OWNERS.map((o) => o.login));

// Owner-only paths: rule-defining documents, plus the pieces that enforce this
// rule, so a pull request cannot quietly weaken its own gate. Case-insensitive:
// on a case-insensitive checkout (macOS) "claude.md" IS CLAUDE.md.
export const OWNER_ONLY = Object.freeze([
  /^AGENTS\.md$/i,
  /^CLAUDE\.md$/i,
  /^LOCKS\.md$/i,
  /^QUEUE\.md$/i,
  /^docs\/[^/]*-standard\.md$/i,
  /^scripts\/check-doc-ownership\.mjs$/i,
  /^scripts\/check-owner-approval-pr\.mjs$/i,
  /^scripts\/lib\/ownerApproval\.mjs$/i,
  /^scripts\/lib\/githubPullEvidence\.mjs$/i,
  /^scripts\/test-owner-approval\.mjs$/i,
  /^scripts\/owner-approval-gate\.mjs$/i,
  /^scripts\/lib\/githubAppAuth\.mjs$/i,
  /^scripts\/test-owner-approval-gate\.mjs$/i,
  /^scripts\/owner-gate-setup-check\.mjs$/i,
  // Everything under .github/: every workflow, CODEOWNERS, and anything added
  // later. A workflow can report a check under any name and can read repository
  // secrets, so adding or editing one is an owner decision (2026-09-24).
  /^\.github\//i,
]);

export const APPROVAL_COMMAND = "/owner-approve";
// 64 hex = content fingerprint (sha256), 40 hex = legacy head commit sha.
const APPROVAL_LINE = /^\/owner-approve[ \t]+([0-9a-fA-F]{64}|[0-9a-fA-F]{40})[ \t]*$/gm;
const SHA40 = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
export const FINGERPRINT_VERSION = "wayfind-owner-approval-fingerprint/v1";

/**
 * Content fingerprint of a pull request's protected change.
 * entries: [{ path, base, head }] with base/head = 40-hex git blob sha at the
 * merge base / head, or null when the file is absent there. Returns 64-hex, or
 * null when the input cannot be fingerprinted (never a guess).
 */
export function protectedFingerprint(number, entries) {
  if (!Number.isInteger(number) || number < 1 || !Array.isArray(entries) || !entries.length) return null;
  const rows = [];
  const seen = new Set();
  for (const e of entries) {
    if (!e || typeof e.path !== "string" || !e.path || seen.has(e.path)) return null;
    for (const side of [e.base, e.head]) if (side !== null && !(typeof side === "string" && SHA40.test(side))) return null;
    if (e.base === e.head) return null; // listed as changed but identical: evidence is wrong
    seen.add(e.path);
    rows.push(`${e.path}\t${e.base || "-"}\t${e.head || "-"}`);
  }
  rows.sort();
  return createHash("sha256").update(`${FINGERPRINT_VERSION}\npr ${number}\n${rows.join("\n")}\n`).digest("hex");
}

export function isOwnerOnly(path) {
  return typeof path === "string" && OWNER_ONLY.some((rx) => rx.test(path));
}

export function ownerOnlyChanges(paths) {
  return (Array.isArray(paths) ? paths : []).filter(isOwnerOnly);
}

function isOwner(user, owners) {
  return typeof user.login === "string" && Number.isSafeInteger(user.id)
    && owners.some((o) => o.id === user.id && o.login.toLowerCase() === user.login.toLowerCase());
}

// A comment's author never changes when its body is edited, and anyone with
// write access to the repository (including an App) can edit any comment. So an
// approval counts only as it was first posted: a comment edited after posting
// (updated_at differs from created_at) is never evidence, even if its author is
// the owner. To change an approval, post a new comment.
function unedited(comment) {
  return typeof comment.created_at === "string" && comment.created_at !== ""
    && comment.updated_at === comment.created_at;
}

/**
 * Find an owner approval for exactly `headSha` among GitHub issue comments
 * (REST shape: { id, body, user: { login, id, type }, created_at, updated_at }).
 * Returns the approving comment or null. Never throws on odd input.
 */
export function findOwnerApproval(comments, headSha, owners = OWNERS, fingerprint = null) {
  const head = String(headSha || "").toLowerCase();
  const print = SHA256.test(String(fingerprint || "")) ? String(fingerprint) : null;
  if (!SHA40.test(head) || !Array.isArray(owners) || !owners.length) return null;
  for (const comment of Array.isArray(comments) ? comments : []) {
    const user = comment && comment.user;
    if (!user || user.type !== "User" || !isOwner(user, owners)) continue;
    if (!unedited(comment)) continue;
    const body = typeof comment.body === "string" ? comment.body : "";
    for (const match of body.matchAll(APPROVAL_LINE)) {
      const named = match[1].toLowerCase();
      if (named === head || (print && named === print)) return comment;
    }
  }
  return null;
}

/**
 * The whole verdict, from gathered evidence. Author names are not an input;
 * there is deliberately no parameter through which they could matter.
 *
 * evidence = {
 *   changedPaths: string[]            net files changed by the branch vs its base
 *   mergeGate: boolean                running as the GitHub Actions merge gate
 *   pr: { number, eventHeadSha, liveHeadSha } | null
 *   comments: array | null            PR comments read from the GitHub API
 *   protectedEntries: array | null    [{ path, base, head }] blob shas of every
 *                                     changed owner-only path (see protectedFingerprint);
 *                                     optional: without it only the legacy head-sha
 *                                     approval can match
 *   error: string | null              why evidence could not be read
 * }
 * returns { ok, protectedPaths, reason }
 */
export function decideOwnerApproval(evidence) {
  const protectedPaths = ownerOnlyChanges(evidence && evidence.changedPaths);
  if (!protectedPaths.length) return { ok: true, protectedPaths, reason: "no owner-only files changed" };
  const list = protectedPaths.join(", ");
  if (!evidence.mergeGate) {
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}). Owner approval can only be verified by the GitHub Actions merge gate (the "guards" check) from an ${APPROVAL_COMMAND} comment by the owner; a local run cannot grant it, and commit author names are not evidence` };
  }
  if (evidence.error) return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) and owner approval could not be verified: ${evidence.error}` };
  const pr = evidence.pr;
  if (!pr || !Number.isInteger(pr.number) || !SHA40.test(String(pr.eventHeadSha || "")) || !SHA40.test(String(pr.liveHeadSha || ""))) {
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) but this run has no pull-request context to verify owner approval against` };
  }
  if (pr.eventHeadSha !== pr.liveHeadSha) {
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) but PR #${pr.number} moved from ${pr.eventHeadSha.slice(0, 12)} to ${pr.liveHeadSha.slice(0, 12)} after this run started; re-run on the new head` };
  }
  const fingerprint = fingerprintFor(pr.number, protectedPaths, evidence.protectedEntries);
  const approval = findOwnerApproval(evidence.comments, pr.liveHeadSha, OWNERS, fingerprint);
  if (!approval) {
    const how = fingerprint
      ? `"${APPROVAL_COMMAND} ${fingerprint}" (the protected-content fingerprint; it stays valid across rebases and unrelated changes until the protected content itself changes)`
      : `"${APPROVAL_COMMAND} ${pr.liveHeadSha}" (the full head sha)`;
    return { ok: false, protectedPaths, fingerprint, reason: `owner-only files changed (${list}) with no owner approval for this protected content. The owner (${OWNER_LOGINS.join(", ")}) approves once by commenting on PR #${pr.number}: ${how}` };
  }
  const named = fingerprint && String(approval.body || "").toLowerCase().includes(fingerprint) ? `protected content ${fingerprint.slice(0, 12)}` : `head ${pr.liveHeadSha.slice(0, 12)}`;
  return { ok: true, protectedPaths, fingerprint, reason: `owner-only files changed (${list}); approved by @${approval.user.login} for ${named} in comment ${approval.id}` };
}

// The fingerprint only when the evidence covers exactly the protected paths being
// judged; anything less falls back to the legacy head-sha match (never a pass).
function fingerprintFor(number, protectedPaths, entries) {
  if (!Array.isArray(entries) || entries.length !== protectedPaths.length) return null;
  const want = new Set(protectedPaths);
  if (!entries.every((e) => e && want.has(e.path))) return null;
  return protectedFingerprint(number, entries);
}
