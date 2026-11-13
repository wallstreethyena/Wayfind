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
 *   carry: { fromSha, inPullCommits, ownChangeAtApproval, ownChangeAtHead } | null
 *                                     optional: an earlier approved head of
 *                                     this PR and the PR's own change at that
 *                                     head and at the current head (see
 *                                     carriedApproval below)
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
  const approval = findOwnerApproval(evidence.comments, pr.liveHeadSha);
  if (!approval) {
    const carried = carriedApproval(evidence.comments, evidence.carry);
    if (carried) {
      return { ok: true, protectedPaths, reason: `owner-only files changed (${list}); approved by @${carried.user.login} for ${evidence.carry.fromSha.slice(0, 12)} in comment ${carried.id}, and head ${pr.liveHeadSha.slice(0, 12)} only brings main in: the pull request's own change is byte-for-byte the one the owner approved` };
    }
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) with no owner approval for head ${pr.liveHeadSha.slice(0, 12)}. The owner (${OWNER_LOGINS.join(", ")}) approves by commenting on PR #${pr.number}: "${APPROVAL_COMMAND} ${pr.liveHeadSha}" (the full sha), then re-running the checks` };
  }
  return { ok: true, protectedPaths, reason: `owner-only files changed (${list}); approved by @${approval.user.login} for head ${pr.liveHeadSha.slice(0, 12)} in comment ${approval.id}` };
}

// APPROVAL CARRIES ACROSS INTEGRATION (2026-11-13). Owner rule (2026-11-12): the
// owner approves a scope, not a hash, and must never be asked again only because
// main moved. Keeping a pull request current with main (GitHub "Update branch",
// the merge train) creates a new head whose OWN change is unchanged. An approval
// for an earlier head carries to the current head only when ALL of these hold:
//   - the approval is a genuine owner approval for exactly that earlier head
//     (findOwnerApproval: owner login AND id, unedited comment, full sha);
//   - that earlier head is a commit of this pull request;
//   - the pull request's own change (every changed file, diffed against its merge
//     base with main, patch text with line numbers removed, or the file's blob id
//     when GitHub gives no patch) is identical at both heads.
// Any edit by the branch, any conflict resolution that touches its lines, or any
// main change close enough to alter the diff context makes the fingerprints
// differ, and the owner approves again. It fails closed: a missing piece of
// evidence is never a carry.
export function carriedApproval(comments, carry) {
  if (!carry || typeof carry !== "object") return null;
  const from = String(carry.fromSha || "").toLowerCase();
  if (!SHA40.test(from) || carry.inPullCommits !== true) return null;
  const a = carry.ownChangeAtApproval, b = carry.ownChangeAtHead;
  if (typeof a !== "string" || typeof b !== "string" || !a || a !== b) return null;
  return findOwnerApproval(comments, from);
}

/** Every distinct head sha the owner approved on this PR, newest comment first. */
export function ownerApprovedShas(comments, owners = OWNERS) {
  const list = (Array.isArray(comments) ? comments : []).slice()
    .sort((x, y) => String(y && y.created_at).localeCompare(String(x && x.created_at)));
  const seen = [];
  for (const comment of list) {
    const body = comment && typeof comment.body === "string" ? comment.body : "";
    for (const match of body.matchAll(APPROVAL_LINE)) {
      const sha = match[1].toLowerCase();
      if (!seen.includes(sha) && findOwnerApproval([comment], sha, owners)) seen.push(sha);
    }
  }
  return seen;
}

/**
 * Fingerprint of a pull request's own change from GitHub compare "files"
 * entries ({ filename, previous_filename, status, patch, sha }). Hunk headers
 * (line numbers) are dropped; every +, - and context line is kept, so moving
 * an edit to another place changes the fingerprint. Returns null (no carry)
 * on anything incomplete.
 */
export function ownChangeFingerprint(files) {
  if (!Array.isArray(files) || !files.length || files.length >= 300) return null;
  const parts = [];
  for (const f of files) {
    if (!f || typeof f.filename !== "string" || !f.filename) return null;
    let body;
    if (typeof f.patch === "string" && f.patch) {
      body = f.patch.split("\n").map((line) => (line.startsWith("@@") ? "@@" : line)).join("\n");
    } else if (typeof f.sha === "string" && /^[0-9a-f]{40}$/.test(f.sha)) {
      body = `blob:${f.sha}`;
    } else if (f.status === "removed") {
      body = "removed";
    } else {
      return null;
    }
    parts.push(`${f.status || ""}\u0000${f.previous_filename || ""}\u0000${f.filename}\u0000${body}`);
  }
  parts.sort();
  return parts.join("\u0001");
}
