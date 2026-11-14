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
// HARDENING (2026-11-14, v2 fingerprint):
//   - the PR's BASE REF NAME is hashed in, so retargeting the PR (main -> another
//     branch or back) voids the approval;
//   - renames count on both names (GitHub's previous_filename / git --no-renames),
//     deletions and additions hash as "-" on the missing side, and an executable
//     bit change (100644 <-> 100755) changes the row;
//   - SEMANTIC PROTECTED ASPECTS. The guard runner's control path is owner-only
//     (scripts/run-guards.mjs and every local module it imports, guards-serial.txt),
//     but two shared files cannot be owner-only without blocking every ordinary PR:
//       scripts/guards.txt  ADDING a guard stays free; REMOVING (or rewriting) any
//                           command line present at the merge base is protected,
//                           pseudo-path "scripts/guards.txt#removed";
//       package.json        the scripts npm runs around install and build
//                           (BUILD_LIFECYCLE_SCRIPTS: prebuild/build/postbuild/
//                           vercel-build and the install hooks npm ci runs before
//                           the guard runner) are protected, pseudo-path
//                           "package.json#build-scripts"; other fields stay free;
//       vercel.json         buildCommand/installCommand/ignoreCommand/builds/framework/outputDirectory, "vercel.json#build-command".
//     The base-trusted gate (owner-approval, the merge queue) reads both sides from
//     git and asks semanticAspect() what changed. A protected aspect is a protected
//     change like an owner-only file: it needs approval and its hash is a
//     fingerprint row. A changed source whose aspect evidence is missing fails
//     closed on the merge gate.
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
  // The merge queue runs from main with a WRITE token and posts the required
  // owner-approval check (2026-11-13), so its code is owner-only like the gate's.
  /^scripts\/merge-queue\.mjs$/i,
  /^scripts\/lib\/mergeQueue\.mjs$/i,
  /^scripts\/test-merge-queue\.mjs$/i,
  // The guard runner is the verifier's control path: a PR that edits it to exit 0
  // turned the required "guards" check and Vercel's prebuild green with a failing
  // guard (reproduced 2026-11-14). The runner, every local module it imports
  // (test-owner-approval resolves the imports and fails if one is missing here)
  // and its serial list are owner-only.
  /^scripts\/run-guards\.mjs$/i,
  /^scripts\/lib\/guardShards\.mjs$/i,
  /^scripts\/lib\/guardEnv\.mjs$/i,
  /^scripts\/guards-serial\.txt$/i,
  // npm reads .npmrc: "ignore-scripts=true" makes `npm run build` skip prebuild.
  /^\.npmrc$/i,
  // Runs from main with an actions:write token (re-runs the approval checks).
  /^scripts\/owner-approval-recheck\.mjs$/i,
  /^scripts\/test-owner-approval-recheck\.mjs$/i,
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
export const FINGERPRINT_VERSION = "wayfind-owner-approval-fingerprint/v2";

// ── Semantic protected aspects (see header) ────────────────────────────────
// Every root lifecycle script `npm ci` / `npm run build` executes (npm 10: preinstall, install,
// postinstall, prepublish, preprepare, prepare, postprepare; verifier finding 2026-11-14).
export const BUILD_LIFECYCLE_SCRIPTS = Object.freeze(["preinstall", "install", "postinstall", "prepublish", "preprepare", "prepare", "postprepare", "prebuild", "build", "postbuild", "vercel-build"]);
// Anything that changes what Vercel builds or whether it builds at all (ignoreCommand can
// skip a build; builds/framework can bypass `npm run build`).
export const VERCEL_BUILD_KEYS = Object.freeze(["buildCommand", "installCommand", "ignoreCommand", "builds", "framework", "outputDirectory"]);
export const SEMANTIC_ASPECTS = Object.freeze({
  "scripts/guards.txt": "scripts/guards.txt#removed",
  "package.json": "package.json#build-scripts",
  "vercel.json": "vercel.json#build-command",
});
export const SEMANTIC_SOURCES = Object.freeze(Object.keys(SEMANTIC_ASPECTS));
const ASPECT_PATHS = new Set(Object.values(SEMANTIC_ASPECTS));
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/** Changed paths that are semantic sources (exact, case-sensitive like git). */
export function semanticSourcesIn(paths) {
  return [...new Set((Array.isArray(paths) ? paths : []).filter((p) => SEMANTIC_SOURCES.includes(p)))];
}

/** The guard command lines of a guards.txt text, as the runner reads them. */
export function guardCommands(text) {
  const out = new Set();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const cmd = line.trim();
    if (cmd && !cmd.startsWith("#")) out.add(cmd);
  }
  return out;
}

function pickJson(text, keys, nested) {
  if (text === null) return { absent: true };
  let doc;
  try { doc = JSON.parse(String(text)); } catch { return { unparsable: sha256(String(text)) }; }
  const from = nested ? (doc && typeof doc === "object" ? doc[nested] : undefined) : doc;
  const picked = {};
  for (const k of keys) {
    const v = from && typeof from === "object" && Object.prototype.hasOwnProperty.call(from, k) ? from[k] : undefined;
    picked[k] = v === undefined ? null : v;
  }
  return picked;
}

/**
 * What a change to a semantic source means for the guard runner.
 * baseText/headText: the file at the merge base / head (null = absent).
 * Returns { path: <aspect pseudo-path>, aspect: <64-hex> | null }: null means the
 * change is free (only additions to guards.txt, only other package.json fields);
 * a hash means a protected change, and the hash is its fingerprint value.
 */
export function semanticAspect(source, baseText, headText) {
  const path = SEMANTIC_ASPECTS[source];
  if (!path) throw new Error(`${source} is not a semantic source`);
  if (source === "scripts/guards.txt") {
    if (baseText === null) return { path, aspect: null }; // nothing at the base to remove
    const kept = guardCommands(headText);
    const removed = [...guardCommands(baseText)].filter((c) => !kept.has(c)).sort();
    return { path, aspect: removed.length ? sha256(`guards-removed\n${removed.join("\n")}\n`) : null };
  }
  const [keys, nested] = source === "package.json" ? [BUILD_LIFECYCLE_SCRIPTS, "scripts"] : [VERCEL_BUILD_KEYS, null];
  const before = JSON.stringify(pickJson(baseText, keys, nested));
  const after = JSON.stringify(pickJson(headText, keys, nested));
  return { path, aspect: before === after ? null : sha256(`${source}\nbase ${before}\nhead ${after}\n`) };
}

const isAspectEntry = (e) => !!e && typeof e.path === "string" && ASPECT_PATHS.has(e.path);

/**
 * Content fingerprint of a pull request's protected change.
 * entries: [{ path, base, head, baseMode, headMode }] with base/head = 40-hex git
 * blob sha at the merge base / head (null when absent there) and the git file
 * mode (100644/100755; anything else, e.g. a symlink, cannot be fingerprinted),
 * and semantic aspect entries [{ path: "<source>#<aspect>", aspect: <64-hex> }].
 * baseRef: the name of the branch the PR targets (bound into the hash, so a
 * retarget voids the approval). Defaults to "main", the only base the gates judge;
 * decideOwnerApproval never relies on the default, it passes the evidence's ref.
 * Every entry that carries baseRef must agree with it.
 * Returns 64-hex, or null when the input cannot be fingerprinted (never a guess).
 */
export function protectedFingerprint(number, entries, baseRef = "main") {
  if (!Number.isInteger(number) || number < 1 || !Array.isArray(entries) || !entries.length) return null;
  if (typeof baseRef !== "string" || !/^[\w./-]{1,255}$/.test(baseRef)) return null;
  const rows = [];
  const seen = new Set();
  for (const e of entries) {
    if (!e || typeof e.path !== "string" || !e.path || seen.has(e.path)) return null;
    if (e.baseRef !== undefined && e.baseRef !== baseRef) return null;
    if (isAspectEntry(e)) {
      if (!SHA256.test(String(e.aspect || ""))) return null; // an unprotected aspect is not a protected change
      seen.add(e.path);
      rows.push(`${e.path}\taspect\t${e.aspect}`);
      continue;
    }
    if (e.path.includes("#")) return null; // unknown pseudo-path
    for (const side of [e.base, e.head]) if (side !== null && !(typeof side === "string" && SHA40.test(side))) return null;
    const baseMode = e.base === null ? "-" : String(e.baseMode ?? "100644");
    const headMode = e.head === null ? "-" : String(e.headMode ?? "100644");
    if (![baseMode, headMode].every((m) => m === "-" || /^100(644|755)$/.test(m))) return null; // only regular files
    if (e.base === e.head && baseMode === headMode) return null; // listed as changed but identical: evidence is wrong
    seen.add(e.path);
    rows.push(`${e.path}\t${e.base || "-"}\t${baseMode}\t${e.head || "-"}\t${headMode}`);
  }
  rows.sort();
  return sha256(`${FINGERPRINT_VERSION}\npr ${number}\nbase ${baseRef}\n${rows.join("\n")}\n`);
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
 *   protectedEntries: array | null    [{ path, base, head, baseMode, headMode, baseRef }]
 *                                     blob shas of every changed owner-only path, plus
 *                                     one aspect entry { path, aspect, baseRef } for every
 *                                     changed semantic source (aspect null = free change);
 *                                     see protectedFingerprint. Without regular entries
 *                                     only the legacy head-sha approval can match;
 *                                     without an aspect entry for a changed semantic
 *                                     source the merge gate fails closed
 *   error: string | null              why evidence could not be read
 * }
 * returns { ok, protectedPaths, reason }
 */
export function decideOwnerApproval(evidence) {
  const changed = evidence && evidence.changedPaths;
  const entries = evidence && Array.isArray(evidence.protectedEntries) ? evidence.protectedEntries : [];
  const aspects = entries.filter(isAspectEntry);
  const protectedPaths = [...ownerOnlyChanges(changed), ...aspects.filter((e) => e.aspect !== null && e.aspect !== undefined).map((e) => e.path)];
  // A changed guards.txt / package.json / vercel.json whose aspect was never
  // judged: the evidence cannot say whether a guard or a build hook was removed.
  const unjudged = semanticSourcesIn(changed).filter((src) => !aspects.some((e) => e.path === SEMANTIC_ASPECTS[src]));
  if (unjudged.length && evidence.mergeGate) {
    return { ok: false, protectedPaths, reason: `${unjudged.join(", ")} changed but the evidence does not say whether the change removes a guard or alters a build/install script (protected aspects); refusing to guess` };
  }
  if (!protectedPaths.length) return { ok: true, protectedPaths, reason: unjudged.length ? `no owner-only files changed (${unjudged.join(", ")} not judged off the merge gate)` : "no owner-only files changed" };
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
  const fingerprint = fingerprintFor(pr.number, protectedPaths, entries);
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
// judged, every entry names the same base ref, and that ref is present; anything
// less falls back to the legacy head-sha match (never a pass).
function fingerprintFor(number, protectedPaths, entries) {
  const used = entries.filter((e) => !(isAspectEntry(e) && (e.aspect === null || e.aspect === undefined)));
  if (used.length !== protectedPaths.length) return null;
  const want = new Set(protectedPaths);
  if (!used.every((e) => e && want.has(e.path))) return null;
  const refs = new Set(entries.map((e) => e && e.baseRef));
  if (refs.size !== 1) return null;
  const [baseRef] = refs;
  if (typeof baseRef !== "string" || !baseRef) return null;
  return protectedFingerprint(number, used, baseRef);
}
