// scripts/lib/ownerApproval.mjs — what counts as OWNER APPROVAL for an edit to
// an owner-only file, decided from GitHub-authenticated evidence only.
//
// WHY THIS EXISTS (2026-09-23). check-doc-ownership used to grant approval when
// a commit's author NAME was "Gabriel Pereira". Commit author and committer are
// plain text that anyone can set, so any lane could satisfy the check by typing
// the owner's name. Commit metadata is never evidence here.
//
// OWNER APPROVAL V2 (owner directive, 2026-11-13). The owner approves the normal
// GitHub way: he opens the pull request and clicks Review changes → Approve. That
// review is authenticated by GitHub (its author is the account that submitted it)
// and is bound to the commit it was submitted on. What the owner approves is the
// PROTECTED CONTENT, not a commit hash:
//
//   protected diff = for every owner-only path that differs between the merge
//   base with main and the commit: [path, base entry, proposed entry], where an
//   entry is the git mode, type and blob sha (exact bytes) or null when absent.
//   fingerprint    = sha256 of that list, sorted by path.
//
// The approval is valid while the fingerprint at the current head equals the
// fingerprint at the reviewed commit. So a rebase, main moving, unrelated code,
// generated registries or migration receipts never cost a new approval, while
// one changed byte in a protected file, an added or removed protected file, or a
// change to this gate's own code does. The owner's most recent decisive review
// rules: a later "Request changes" withdraws an earlier approval, and a
// dismissed review no longer counts.
//
// LEGACY. The old "/owner-approve <full head sha>" comment is still read so pull
// requests approved that way keep working during the change-over. It is never
// requested: refusals ask for a GitHub review.
//
// Only GitHub Actions can read this evidence (the "guards" check, and the
// "owner-approval" check, which applies the BASE branch's copy of this file);
// a local run can never grant approval.
//
// Pure module: no environment, filesystem, network or git access. Callers gather
// the evidence (scripts/lib/githubPullEvidence.mjs) and pass it in, so every rule
// here is executable in hermetic tests.
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
  /^docs\/OWNER_APPROVAL\.md$/i,
  /^scripts\/check-doc-ownership\.mjs$/i,
  /^scripts\/check-owner-approval-pr\.mjs$/i,
  /^scripts\/lib\/ownerApproval\.mjs$/i,
  /^scripts\/lib\/githubPullEvidence\.mjs$/i,
  /^scripts\/test-owner-approval\.mjs$/i,
  /^scripts\/owner-approval-gate\.mjs$/i,
  /^scripts\/lib\/githubAppAuth\.mjs$/i,
  /^scripts\/test-owner-approval-gate\.mjs$/i,
  /^scripts\/owner-gate-setup-check\.mjs$/i,
  /^scripts\/owner-approval-recheck\.mjs$/i,
  /^scripts\/test-owner-approval-v2\.mjs$/i,
  // Everything under .github/: every workflow, CODEOWNERS, and anything added
  // later. A workflow can report a check under any name and can read repository
  // secrets, so adding or editing one is an owner decision (2026-09-24).
  /^\.github\//i,
]);

// Every owner-only path lives at the repository root or under one of these
// directories (compared case-insensitively). The fingerprint reader walks only
// these trees; test-owner-approval-v2 fails if a pattern above escapes them.
export const OWNER_ONLY_DIRS = Object.freeze(["docs", "scripts", "scripts/lib", ".github"]);
export const OWNER_ONLY_RECURSIVE_DIRS = Object.freeze([".github"]);

// Legacy command (read, never requested).
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

// DISMISSED counts as decisive: dismissing the owner's "Request changes" must
// never bring an older approval back (Fable audit, 2026-11-13).
const DECISIVE = new Set(["APPROVED", "CHANGES_REQUESTED", "DISMISSED"]);

/**
 * The owner's most recent DECISIVE review (APPROVED, CHANGES_REQUESTED or DISMISSED) among
 * GitHub pull-request reviews (REST shape: { id, state, commit_id, submitted_at,
 * user: { login, id, type } }). COMMENTED reviews neither grant nor withdraw.
 * A DISMISSED review is decisive and approves nothing, so dismissing the
 * owner's latest review leaves NO approval rather than reviving an older one. Bots and other accounts are ignored, so
 * they can neither approve nor withdraw. Returns the review or null.
 */
export function latestOwnerReview(reviews, owners = OWNERS) {
  if (!Array.isArray(owners) || !owners.length) return null;
  const mine = [];
  for (const review of Array.isArray(reviews) ? reviews : []) {
    const user = review && review.user;
    if (!user || user.type !== "User" || !isOwner(user, owners)) continue;
    if (!DECISIVE.has(review.state)) continue;
    if (!SHA40.test(String(review.commit_id || "").toLowerCase())) continue;
    if (typeof review.submitted_at !== "string" || !review.submitted_at) continue;
    mine.push(review);
  }
  mine.sort((a, b) => (a.submitted_at < b.submitted_at ? -1 : a.submitted_at > b.submitted_at ? 1 : (Number(a.id) || 0) - (Number(b.id) || 0)));
  return mine.length ? mine[mine.length - 1] : null;
}

/**
 * The protected diff between two snapshots of owner-only entries
 * ({ [path]: { mode, type, sha } }): one [path, base, head] row per path whose
 * entry differs, sorted by path. null means absent.
 */
export function protectedDiff(baseEntries, headEntries) {
  const norm = (e) => (e && typeof e === "object" ? { mode: String(e.mode || ""), type: String(e.type || ""), sha: String(e.sha || "").toLowerCase() } : null);
  const same = (a, b) => (a === null && b === null) || (a !== null && b !== null && a.mode === b.mode && a.type === b.type && a.sha === b.sha);
  const base = baseEntries && typeof baseEntries === "object" ? baseEntries : {};
  const head = headEntries && typeof headEntries === "object" ? headEntries : {};
  const rows = [];
  for (const path of [...new Set([...Object.keys(base), ...Object.keys(head)])].sort()) {
    if (!isOwnerOnly(path)) continue;
    const b = norm(base[path]);
    const h = norm(head[path]);
    if (!same(b, h)) rows.push([path, b, h]);
  }
  return rows;
}

/** sha256 of a protected diff (canonical JSON). Same rows, same fingerprint. */
export function protectedFingerprint(rows) {
  return createHash("sha256").update(JSON.stringify(Array.isArray(rows) ? rows : [])).digest("hex");
}

const HOW = (n) => `the owner opens PR #${n} and clicks Review changes → Approve`;

/**
 * The whole verdict, from gathered evidence. Author names are not an input;
 * there is deliberately no parameter through which they could matter.
 *
 * evidence = {
 *   changedPaths: string[]            net files changed by the branch vs its base
 *   mergeGate: boolean                running as a GitHub Actions merge gate
 *   pr: { number, eventHeadSha, liveHeadSha } | null
 *   reviews: array | null             PR reviews read from the GitHub API
 *   comments: array | null            PR comments (legacy approvals only)
 *   fingerprints: { [commitSha]: { fingerprint, paths, behindBy } } | null
 *                                     protected diff fingerprints, read from the
 *                                     GitHub API, for the live head and for the
 *                                     commit of the owner's latest review
 *   baseChangedAt: string[] | null    timestamps of base_ref_changed events
 *   error: string | null              why evidence could not be read
 * }
 * returns { ok, protectedPaths, reason }
 */
export function decideOwnerApproval(evidence) {
  const protectedPaths = ownerOnlyChanges(evidence && evidence.changedPaths);
  if (!protectedPaths.length) return { ok: true, protectedPaths, reason: "no owner-only files changed" };
  const list = protectedPaths.join(", ");
  if (!evidence.mergeGate) {
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}). Owner approval is the owner's GitHub review (Review changes → Approve) and only the GitHub Actions merge gate can verify it; a local run cannot grant it, and commit author names are not evidence` };
  }
  if (evidence.error) return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) and owner approval could not be verified: ${evidence.error}` };
  const pr = evidence.pr;
  if (!pr || !Number.isInteger(pr.number) || !SHA40.test(String(pr.eventHeadSha || "")) || !SHA40.test(String(pr.liveHeadSha || ""))) {
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) but this run has no pull-request context to verify owner approval against` };
  }
  if (pr.eventHeadSha !== pr.liveHeadSha) {
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) but PR #${pr.number} moved from ${pr.eventHeadSha.slice(0, 12)} to ${pr.liveHeadSha.slice(0, 12)} after this run started; the run for the new head decides` };
  }

  const review = latestOwnerReview(evidence.reviews);
  if (review && review.state === "APPROVED") {
    const fps = evidence.fingerprints && typeof evidence.fingerprints === "object" ? evidence.fingerprints : {};
    const now = fps[pr.liveHeadSha];
    const then = fps[String(review.commit_id).toLowerCase()];
    if (!Array.isArray(evidence.baseChangedAt)) {
      return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) but the pull request's base-branch history could not be read; failing closed` };
    }
    if (evidence.baseChangedAt.some((t) => typeof t !== "string" || !t || t >= String(review.submitted_at))) {
      return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) and the pull request's base branch changed after the owner's review ${review.id}; the approved diff was against a different base. Fresh owner review needed: ${HOW(pr.number)}` };
    }
    if (!now || !then || !/^[0-9a-f]{64}$/.test(String(now.fingerprint)) || !/^[0-9a-f]{64}$/.test(String(then.fingerprint))) {
      return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) and the protected content of the owner's review could not be compared with the current head; failing closed` };
    }
    // The fingerprint must cover exactly the protected paths GitHub lists as
    // changed. A tree-walk miss of any kind (a path outside the walked
    // directories, an odd entry type) would otherwise leave a protected change
    // out of BOTH fingerprints and let it ride on an old approval.
    const want = [...new Set(protectedPaths)].sort();
    const got = [...new Set(Array.isArray(now.paths) ? now.paths.map(String) : [])].sort();
    if (now.behindBy !== 0) {
      return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) but the head is ${Number.isInteger(now.behindBy) ? now.behindBy : "an unknown number of"} commit(s) behind the base branch, so the protected diff is not the one that would merge; update the branch and the run for the new head decides` };
    }
    if (JSON.stringify(want) !== JSON.stringify(got)) {
      return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) but the protected-content fingerprint covers ${got.join(", ") || "nothing"}; the evidence disagrees, failing closed` };
    }
    if (now.fingerprint === then.fingerprint) {
      return { ok: true, protectedPaths, reason: `owner-only files changed (${list}); approved by @${review.user.login} in review ${review.id} on ${String(review.commit_id).slice(0, 12)}, and the protected content is unchanged since (fingerprint ${now.fingerprint.slice(0, 12)})` };
    }
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) and the protected content changed after the owner's approval (review ${review.id}: ${then.fingerprint.slice(0, 12)} → now ${now.fingerprint.slice(0, 12)}). Fresh owner review needed: ${HOW(pr.number)}` };
  }
  if (review && review.state === "DISMISSED") {
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) and the owner's latest review (${review.id}) was dismissed, so nothing is approved; ${HOW(pr.number)}` };
  }
  if (review && review.state === "CHANGES_REQUESTED") {
    return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) and the owner's latest review (${review.id}) requested changes; ${HOW(pr.number)} when ready` };
  }
  const legacy = findOwnerApproval(evidence.comments, pr.liveHeadSha);
  if (legacy) {
    return { ok: true, protectedPaths, reason: `owner-only files changed (${list}); approved by @${legacy.user.login} for head ${pr.liveHeadSha.slice(0, 12)} in legacy comment ${legacy.id}` };
  }
  return { ok: false, protectedPaths, reason: `owner-only files changed (${list}) with no owner approval yet: ${HOW(pr.number)}` };
}
