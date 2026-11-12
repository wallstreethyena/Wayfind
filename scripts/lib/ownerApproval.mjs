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
// Since 2026-11-12 an approval of an earlier head also counts when the pull
// request's own change is byte-for-byte the same change (see "APPROVAL
// CARRY-FORWARD" below): catching up with main does not void it, any edit does.
// Only GitHub Actions can read that evidence (the "guards" check and the
// "owner-approval" check, which applies the BASE branch's copy of this file);
// a local run can never grant approval.
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
  /^scripts\/test-owner-approval-carry-forward\.mjs$/i,
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
const APPROVAL_LINE = /^\/owner-approve[ \t]+([0-9a-fA-F]{40})[ \t]*$/gm;
const SHA40 = /^[0-9a-f]{40}$/;

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
export function findOwnerApproval(comments, headSha, owners = OWNERS) {
  const head = String(headSha || "").toLowerCase();
  if (!SHA40.test(head) || !Array.isArray(owners) || !owners.length) return null;
  for (const comment of Array.isArray(comments) ? comments : []) {
    const user = comment && comment.user;
    if (!user || user.type !== "User" || !isOwner(user, owners)) continue;
    if (!unedited(comment)) continue;
    const body = typeof comment.body === "string" ? comment.body : "";
    for (const match of body.matchAll(APPROVAL_LINE)) {
      if (match[1].toLowerCase() === head) return comment;
    }
  }
  return null;
}

// ── APPROVAL CARRY-FORWARD (2026-11-12) ──────────────────────────────────────
//
// WHY. Branch protection makes a pull request catch up with main before it can
// merge, and catching up makes a new head commit. An approval named the old
// head, so every catch-up voided it: on PRs #2175 and #2107 the owner approved
// the same change three times and it still could not merge, because main moved
// 18 commits between the approval and the merge attempt.
//
// THE RULE. The owner approves a CHANGE, recorded as the exact commit named in an
// "/owner-approve <sha>" comment (the evidence, unchanged). A later head inherits
// that approval only when the pull request's own change is the SAME change:
//
//   approved change = GitHub's diff  <base>...<approved sha>
//   current change  = GitHub's diff  <base>...<current head>
//
// (the three-dot diff runs from the merge base, so commits that came from main
// are not part of either side). The two are compared file by file:
//
//   - the same files, with the same status and rename source;
//   - every file's patch identical once hunk line NUMBERS are removed. Context
//     lines and the order of the hunks still count, so an edit that moved,
//     reformatted, or resolved a conflict differently is a change;
//   - two narrow allowlists, for files every catch-up or apply step touches
//     mechanically:
//       * the guard registries (MECHANICAL_REGISTRY_FILES): every pull request
//         appends rows, so a row's position shifts with each catch-up. Only the
//         multiset of added lines and of removed lines must match: a row may
//         move, but no row may be added, dropped, or altered.
//       * the migration apply log (MIGRATION_RECEIPT_LOG): applying an approved
//         migration appends a receipt. Extra ADDED lines are allowed only when
//         each one is an "applied" receipt for a migration file the approved
//         change already contains, unedited since approval
//         (scripts/check-migration-receipts.mjs separately checks the receipt's
//         sha256 against the file). Nothing may be removed.
//
// Anything else is a MATERIAL change and needs a fresh approval, and the
// verdict lists exactly what changed. A file GitHub cannot show a patch for
// (binary, or too large), or a diff of 300 files or more (the compare limit),
// is never carried forward. Like the rest of this module this is pure: the
// caller fetches the two diffs (scripts/lib/githubPullEvidence.mjs).
export const MECHANICAL_REGISTRY_FILES = Object.freeze([
  /^scripts\/guards\.txt$/,
  /^scripts\/lib\/guard-expectations\.tsv$/,
]);
export const MIGRATION_RECEIPT_LOG = "scripts/migration-apply-log.jsonl";
const MIGRATION_FILE = /^supabase\/migrations\/[^/]+\.sql$/;
// GitHub's compare API lists at most 300 files; a list that long may be cut.
export const COMPARE_FILE_LIMIT = 300;
// The newest distinct approved commits considered for carry-forward, to bound API reads.
export const MAX_CARRY_FORWARD_CANDIDATES = 3;

/**
 * Commits the owner approved on this pull request, newest comment first, from the
 * same evidence findOwnerApproval trusts (owner account, User type, unedited
 * comment, full sha on its own line). Excludes `headSha`. Returns
 * [{ sha, comment }], at most MAX_CARRY_FORWARD_CANDIDATES.
 */
export function approvedCommitCandidates(comments, headSha, owners = OWNERS) {
  const head = String(headSha || "").toLowerCase();
  const found = [];
  const seen = new Set();
  const list = (Array.isArray(comments) ? comments : []).slice()
    .sort((a, b) => String((b && b.created_at) || "").localeCompare(String((a && a.created_at) || "")));
  for (const comment of list) {
    const user = comment && comment.user;
    if (!user || user.type !== "User" || !Array.isArray(owners) || !isOwner(user, owners)) continue;
    if (!unedited(comment)) continue;
    const body = typeof comment.body === "string" ? comment.body : "";
    for (const match of body.matchAll(APPROVAL_LINE)) {
      const sha = match[1].toLowerCase();
      if (sha === head || seen.has(sha)) continue;
      seen.add(sha);
      found.push({ sha, comment });
      if (found.length >= MAX_CARRY_FORWARD_CANDIDATES) return found;
    }
  }
  return found;
}

const isRegistryFile = (name) => MECHANICAL_REGISTRY_FILES.some((rx) => rx.test(name));

// Hunk headers carry line numbers (which shift whenever main edits earlier in the
// file) and an optional function name; keep only the fact that a hunk starts.
function normalizedPatch(patch) {
  return String(patch).split("\n").map((line) => (line.startsWith("@@") ? "@@" : line)).join("\n").replace(/\n+$/, "");
}

function changedLines(patch) {
  const added = [];
  const removed = [];
  for (const line of String(patch || "").split("\n")) {
    if (line.startsWith("+")) added.push(line.slice(1));
    else if (line.startsWith("-")) removed.push(line.slice(1));
  }
  return { added: added.sort(), removed: removed.sort() };
}
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// Lines in `big` that are not matched one for one in `small`, or null when
// `small` is not contained in `big`. Both sorted.
function extraLines(big, small) {
  const left = new Map();
  for (const x of big) left.set(x, (left.get(x) || 0) + 1);
  for (const x of small) {
    if (!left.get(x)) return null;
    left.set(x, left.get(x) - 1);
  }
  return [...left].flatMap(([x, k]) => Array(k).fill(x));
}

/**
 * A stable fingerprint of a change (GitHub compare "files"): sha256 over every
 * file's name, status, rename source and line-number-free patch, sorted by name.
 * Two changes with the same fingerprint are the same edits.
 */
export function changeFingerprint(files) {
  if (!Array.isArray(files)) return null;
  const rows = files.map((f) => [f && f.filename, f && f.status, (f && f.previous_filename) || "", typeof (f && f.patch) === "string" ? normalizedPatch(f.patch) : `<no patch:${f && f.changes}>`].join("\u0000"));
  return createHash("sha256").update(rows.sort().join("\u0001")).digest("hex");
}

/**
 * Is the current change the same change the owner approved?
 * approvedFiles / currentFiles: GitHub compare API "files" entries
 * ({ filename, status, previous_filename?, patch?, changes }).
 * Returns { same: boolean, material: string[], allowed: string[] } — material
 * lists, in plain words, every difference that needs a fresh approval; allowed
 * lists the mechanical differences that were accepted. Never throws on odd input.
 */
export function compareApprovedChange(approvedFiles, currentFiles) {
  const material = [];
  const allowed = [];
  if (!Array.isArray(approvedFiles) || !Array.isArray(currentFiles)) {
    return { same: false, material: ["the approved change or the current change could not be read"], allowed };
  }
  if (approvedFiles.length >= COMPARE_FILE_LIMIT || currentFiles.length >= COMPARE_FILE_LIMIT) {
    return { same: false, material: [`the change lists ${COMPARE_FILE_LIMIT} or more files, too many to compare automatically`], allowed };
  }
  const index = (files, side) => {
    const map = new Map();
    for (const f of files) {
      const name = f && typeof f.filename === "string" ? f.filename : "";
      if (!name) { material.push(`the ${side} change has a file entry with no name`); continue; }
      map.set(name, f);
    }
    return map;
  };
  const before = index(approvedFiles, "approved");
  const after = index(currentFiles, "current");

  // Approved migrations that are byte-for-byte the same edit now: a receipt may name these.
  const unchangedMigrations = new Set();
  for (const [name, a] of before) {
    const b = after.get(name);
    if (MIGRATION_FILE.test(name) && b && a.status === b.status && typeof a.patch === "string" && typeof b.patch === "string"
      && normalizedPatch(a.patch) === normalizedPatch(b.patch)) unchangedMigrations.add(name);
  }
  const receiptDelta = (a, b) => {
    if ((a && typeof a.patch !== "string") || typeof b.patch !== "string") return `${MIGRATION_RECEIPT_LOG} has no line-by-line diff, so its receipts cannot be checked`;
    const x = changedLines(a && a.patch);
    const y = changedLines(b.patch);
    if (!sameList(x.removed, y.removed)) return `${MIGRATION_RECEIPT_LOG} removes different lines than the approved change`;
    const extra = extraLines(y.added, x.added);
    if (!extra) return `${MIGRATION_RECEIPT_LOG} no longer adds a line the approved change added`;
    for (const line of extra) {
      let receipt = null;
      try { receipt = JSON.parse(line); } catch { /* not JSON */ }
      if (!receipt || receipt.status !== "applied" || typeof receipt.file !== "string") return `${MIGRATION_RECEIPT_LOG} gained a line that is not an "applied" migration receipt`;
      if (!unchangedMigrations.has(receipt.file)) return `${MIGRATION_RECEIPT_LOG} gained a receipt for ${receipt.file}, which is not a migration in the approved change`;
    }
    if (extra.length) allowed.push(`${extra.length} migration receipt line(s) added to ${MIGRATION_RECEIPT_LOG} for approved, unedited migrations`);
    return null;
  };

  for (const name of after.keys()) {
    if (before.has(name)) continue;
    if (name === MIGRATION_RECEIPT_LOG) {
      const problem = receiptDelta(null, after.get(name));
      if (problem) material.push(problem);
      continue;
    }
    material.push(`${name} is part of the change now but was not in the approved change`);
  }
  for (const name of before.keys()) if (!after.has(name)) material.push(`${name} was in the approved change but is no longer changed`);
  for (const [name, a] of before) {
    const b = after.get(name);
    if (!b) continue;
    if (a.status !== b.status) { material.push(`${name} was ${a.status} when approved and is ${b.status} now`); continue; }
    if ((a.previous_filename || "") !== (b.previous_filename || "")) { material.push(`${name} is renamed from a different file than when approved`); continue; }
    const hasA = typeof a.patch === "string";
    const hasB = typeof b.patch === "string";
    if (!hasA || !hasB) {
      if (hasA || hasB || a.changes !== 0 || b.changes !== 0) material.push(`${name} has no line-by-line diff (binary or too large), so its content cannot be compared`);
      continue;
    }
    if (normalizedPatch(a.patch) === normalizedPatch(b.patch)) continue;
    if (isRegistryFile(name)) {
      const x = changedLines(a.patch);
      const y = changedLines(b.patch);
      if (!sameList(x.added, y.added) || !sameList(x.removed, y.removed)) material.push(`${name} adds or removes different registry rows than the approved change`);
      else allowed.push(`${name} rows moved by a catch-up (same rows added and removed)`);
      continue;
    }
    if (name === MIGRATION_RECEIPT_LOG) {
      const problem = receiptDelta(a, b);
      if (problem) material.push(problem);
      continue;
    }
    material.push(`${name} has different edits than the approved change`);
  }
  return { same: material.length === 0, material, allowed };
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
 *   error: string | null              why evidence could not be read
 *   carryForward: array | undefined   for owner-approved commits other than the
 *                                     head: { sha, approvedFiles, currentFiles,
 *                                     approvedBaseSha, currentBaseSha, error }
 *                                     (see compareApprovedChange)
 * }
 * returns { ok, protectedPaths, reason, audit? } — audit: one record per
 * earlier approval that was compared (PR, approved and current head and base,
 * change fingerprints, files, approval time, actor, decision and why).
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
  const approval = findOwnerApproval(evidence.comments, pr.liveHeadSha);
  if (approval) {
    return { ok: true, protectedPaths, reason: `owner-only files changed (${list}); approved by @${approval.user.login} for head ${pr.liveHeadSha.slice(0, 12)} in comment ${approval.id}` };
  }
  // Carry-forward: only commits this module itself recognises as owner-approved
  // (the caller's list is matched against the comments, never trusted on its own).
  const notes = [];
  const audits = [];
  const supplied = Array.isArray(evidence.carryForward) ? evidence.carryForward : [];
  for (const candidate of approvedCommitCandidates(evidence.comments, pr.liveHeadSha)) {
    const entry = supplied.find((c) => c && String(c.sha || "").toLowerCase() === candidate.sha);
    if (!entry) continue;
    if (entry.error) { notes.push(`the approval of ${candidate.sha.slice(0, 12)} could not be compared (${entry.error})`); continue; }
    const verdict = compareApprovedChange(entry.approvedFiles, entry.currentFiles);
    const audit = {
      pr: pr.number,
      decision: verdict.same ? "carried-forward" : "expired",
      approvedHeadSha: candidate.sha,
      approvedBaseSha: entry.approvedBaseSha || null,
      approvedFingerprint: changeFingerprint(entry.approvedFiles),
      currentHeadSha: pr.liveHeadSha,
      currentBaseSha: entry.currentBaseSha || null,
      currentFingerprint: changeFingerprint(entry.currentFiles),
      files: Array.isArray(entry.currentFiles) ? entry.currentFiles.map((f) => f && f.filename).filter(Boolean).sort() : [],
      approvedAt: candidate.comment.created_at,
      actor: { login: candidate.comment.user.login, id: candidate.comment.user.id },
      commentId: candidate.comment.id,
      why: verdict.same ? (verdict.allowed.length ? verdict.allowed : ["identical change; only main moved underneath it"]) : verdict.material,
    };
    audits.push(audit);
    if (verdict.same) {
      const extra = verdict.allowed.length ? ` (accepted as mechanical: ${verdict.allowed.join("; ")})` : "";
      return { ok: true, protectedPaths, audit: audits, reason: `owner-only files changed (${list}); approved by @${candidate.comment.user.login} for ${candidate.sha.slice(0, 12)} in comment ${candidate.comment.id}, carried forward to head ${pr.liveHeadSha.slice(0, 12)} because the pull request's own change is the same change${extra}` };
    }
    notes.push(`the approval of ${candidate.sha.slice(0, 12)} does not carry forward because ${verdict.material.join("; ")}`);
  }
  const why = notes.length ? `. ${notes.join(". ")}` : "";
  return { ok: false, protectedPaths, audit: audits, reason: `owner-only files changed (${list}) with no owner approval for head ${pr.liveHeadSha.slice(0, 12)}${why}. The owner (${OWNER_LOGINS.join(", ")}) approves by commenting on PR #${pr.number}: "${APPROVAL_COMMAND} ${pr.liveHeadSha}" (the full sha), then re-running the checks` };
}
