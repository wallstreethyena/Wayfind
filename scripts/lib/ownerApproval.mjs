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
// OWNER APPROVAL V2 (2026-11-13): THE OWNER APPROVES THE PROTECTED DIFF. Binding
// approval to the whole head commit made every rebase, every "Update branch" and
// every merge-train step void it, so the owner re-approved the same protected
// bytes again and again. The owner now approves a fingerprint of exactly the
// owner-only change (see protectedFingerprint below):
//
//     /owner-approve-diff <64-character fingerprint>
//
// The fingerprint covers the repository, the pull request number, every
// owner-only path the pull request touches, and the SHA-256 of each such file's
// content at the merge base (what main has) and at the head (what the pull
// request proposes). The base and head contents determine the protected diff
// exactly, so the fingerprint IS the protected diff. Unrelated code, a rebase,
// main moving, or generated files outside the owner-only list leave it unchanged
// and the approval stands. One byte of a protected file, a protected file added,
// removed or renamed, or main changing a protected file the pull request also
// touches changes it, and the owner approves again. This gate governs only the
// owner-only files; every other file is judged by the normal checks.
//
// LEGACY (kept for the transition): the original command below, bound to the
// exact head commit, still approves that one head.
//
// WHAT IS TRUSTED. A pull-request comment whose author is an owner LOGIN
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
// Pure module: no environment, filesystem, network or git access. The caller
// (scripts/check-doc-ownership.mjs) gathers evidence and passes it in, so every
// rule here is executable in hermetic tests.

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
  /^scripts\/test-owner-approval-v2\.mjs$/i,
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
export const DIFF_APPROVAL_COMMAND = "/owner-approve-diff";
export const FINGERPRINT_VERSION = "wayfind-owner-protected-diff/v2";
const DIFF_APPROVAL_LINE = /^\/owner-approve-diff[ \t]+([0-9a-fA-F]{64})[ \t]*$/gm;
const SHA256_HEX = /^[0-9a-f]{64}$/;
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

/**
 * Find an owner approval for exactly `fingerprint` (a protected-diff
 * fingerprint, 64 hex characters). Same authentication as findOwnerApproval:
 * a real User account whose login AND numeric id are an owner's, in a comment
 * that was never edited. Returns the approving comment or null.
 */
export function findOwnerDiffApproval(comments, fingerprint, owners = OWNERS) {
  const want = String(fingerprint || "").toLowerCase();
  if (!SHA256_HEX.test(want) || !Array.isArray(owners) || !owners.length) return null;
  for (const comment of Array.isArray(comments) ? comments : []) {
    const user = comment && comment.user;
    if (!user || user.type !== "User" || !isOwner(user, owners)) continue;
    if (!unedited(comment)) continue;
    const body = typeof comment.body === "string" ? comment.body : "";
    for (const match of body.matchAll(DIFF_APPROVAL_LINE)) {
      if (match[1].toLowerCase() === want) return comment;
    }
  }
  return null;
}

/** Every protected-diff fingerprint the owner approved on this PR (newest comment first). */
export function ownerApprovedFingerprints(comments, owners = OWNERS) {
  const list = (Array.isArray(comments) ? comments : []).slice()
    .sort((x, y) => String(y && y.created_at).localeCompare(String(x && x.created_at)));
  const out = [];
  for (const comment of list) {
    const body = comment && typeof comment.body === "string" ? comment.body : "";
    for (const match of body.matchAll(DIFF_APPROVAL_LINE)) {
      const fp = match[1].toLowerCase();
      if (!out.includes(fp) && findOwnerDiffApproval([comment], fp, owners)) out.push(fp);
    }
  }
  return out;
}

/**
 * The protected-diff fingerprint. entries: one per owner-only path the pull
 * request touches, { path, base, head }, where base / head are the lowercase
 * SHA-256 hex of the file's bytes at the merge base / at the head, or null when
 * the file does not exist there. Returns { fingerprint, manifest } or null when
 * the input is incomplete (never a fingerprint for evidence it did not see).
 * sha256 is passed in (node:crypto in the callers) so this module stays pure.
 */
export function protectedFingerprint({ repo, number, entries }, sha256) {
  if (typeof repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  if (!Number.isInteger(number) || number < 1 || typeof sha256 !== "function") return null;
  if (!Array.isArray(entries) || !entries.length) return null;
  const files = [];
  const seen = new Set();
  for (const e of entries) {
    if (!e || typeof e.path !== "string" || !isOwnerOnly(e.path) || seen.has(e.path)) return null;
    const okHash = (h) => h === null || (typeof h === "string" && SHA256_HEX.test(h));
    if (!okHash(e.base) || !okHash(e.head) || (e.base === null && e.head === null)) return null;
    seen.add(e.path);
    files.push({ path: e.path, base: e.base, head: e.head });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifest = { v: FINGERPRINT_VERSION, repo: repo.toLowerCase(), pr: number, files };
  const fingerprint = String(sha256(JSON.stringify(manifest))).toLowerCase();
  return SHA256_HEX.test(fingerprint) ? { fingerprint, manifest } : null;
}

/** Paths whose protected content differs between two manifests (audit trail). */
export function changedProtectedPaths(before, after) {
  const index = (m) => new Map(((m && m.files) || []).map((f) => [f.path, `${f.base}|${f.head}`]));
  const a = index(before), b = index(after);
  return [...new Set([...a.keys(), ...b.keys()])].filter((p) => a.get(p) !== b.get(p)).sort();
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
 *   protectedDiff: { fingerprint, manifest, headSha } | null
 *                                     the protected-diff fingerprint computed
 *                                     from the GitHub API for headSha (the gate
 *                                     computes it; see protectedFingerprint)
 *   protectedDiffError: string | null why it could not be computed
 *   approvedManifests: { [fingerprint]: manifest }  optional, for the audit
 *                                     trail: manifests of earlier approved
 *                                     fingerprints the gate could reproduce
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
  const audit = (lines) => lines.filter(Boolean).join("\n    ");
  // Legacy: an approval naming this exact head commit.
  const legacy = findOwnerApproval(evidence.comments, pr.liveHeadSha);
  if (legacy) {
    return { ok: true, protectedPaths, reason: `owner-only files changed (${list}); approved by @${legacy.user.login} for head ${pr.liveHeadSha.slice(0, 12)} in comment ${legacy.id} (legacy head approval)` };
  }
  // V2: an approval of the protected diff itself.
  const diff = evidence.protectedDiff;
  const diffOk = diff && typeof diff.fingerprint === "string" && SHA256_HEX.test(diff.fingerprint)
    && diff.manifest && diff.manifest.pr === pr.number && diff.headSha === pr.liveHeadSha;
  if (!diffOk) {
    const why = evidence.protectedDiffError || (diff && diff.headSha !== pr.liveHeadSha ? `it was read for ${String(diff.headSha).slice(0, 12)}, not the live head` : "it was not computed");
    return { ok: false, protectedPaths, reason: audit([
      `owner-only files changed (${list}) and the protected diff could not be fingerprinted (${why}); failing closed.`,
      "Owner approval: INVALID",
      `The owner can still approve this exact head: "${APPROVAL_COMMAND} ${pr.liveHeadSha}"`,
    ]) };
  }
  const covered = new Set(diff.manifest.files.map((f) => f.path));
  const uncovered = protectedPaths.filter((p) => !covered.has(p));
  if (uncovered.length) {
    return { ok: false, protectedPaths, reason: audit([
      `owner-only files changed (${list}) but the protected diff fingerprint does not cover ${uncovered.join(", ")}; failing closed.`,
      "Owner approval: INVALID",
    ]) };
  }
  const current = diff.fingerprint;
  const approved = findOwnerDiffApproval(evidence.comments, current);
  if (approved) {
    return { ok: true, protectedPaths, reason: audit([
      `owner-only files changed (${list}); approved by @${approved.user.login} in comment ${approved.id}.`,
      "Owner approval: VALID",
      `Approved protected fingerprint: ${current}`,
      `Current protected fingerprint: ${current}`,
      "Protected content changed since approval: NO",
    ]) };
  }
  const earlier = ownerApprovedFingerprints(evidence.comments)[0] || null;
  const earlierManifest = earlier && evidence.approvedManifests ? evidence.approvedManifests[earlier] : null;
  const changed = earlierManifest ? changedProtectedPaths(earlierManifest, diff.manifest) : null;
  return { ok: false, protectedPaths, reason: audit([
    `owner-only files changed (${list}) with no owner approval for this protected diff.`,
    "Owner approval: INVALID",
    earlier ? `Approved protected fingerprint: ${earlier}` : "Approved protected fingerprint: none",
    `Current protected fingerprint: ${current}`,
    earlier ? `Changed protected files: ${changed ? changed.join(", ") || "(none listed; the base or the set of files moved)" : "unknown (the approved version is not one of this pull request's recent heads)"}` : "",
    `The owner (${OWNER_LOGINS.join(", ")}) approves by commenting on PR #${pr.number}: "${DIFF_APPROVAL_COMMAND} ${current}". It stays valid through rebases and unrelated changes, and stops matching if any owner-only content changes. Then re-run the checks (the merge train re-checks queued pull requests by itself).`,
  ]) };
}
