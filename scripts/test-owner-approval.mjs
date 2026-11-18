#!/usr/bin/env node
/**
 * test-owner-approval — owner-only files change only with GitHub-authenticated
 * owner approval, never because a commit CLAIMS to be from the owner.
 *
 * The incident (2026-09-23): check-doc-ownership granted approval when the commit
 * author name was "Gabriel Pereira". That is free text. PR #1478 (a CLAUDE.md
 * cleanup the owner asked for) could only pass by impersonating him. This test
 * runs the REAL guard (scripts/check-doc-ownership.mjs) as a child process in
 * throwaway git repositories, with the GitHub API answered by a local stub, and
 * proves:
 *
 *   A  no owner-only change                      -> pass (and no API call at all)
 *   B  owner-only change, no approval            -> fail
 *   C  owner-only change with a FORGED owner git author/committer -> still fail
 *      (locally, on the merge gate, with a non-owner comment, with a bot comment)
 *   D  owner-only change + "/owner-approve <head sha>" by the owner login -> pass
 *      (and: stale sha, mid-line command, moved head -> fail)
 *   E  ordinary changes are unaffected (even with a forged author, even with no token)
 *   F  merge gate without the GitHub context it needs -> fail closed
 *   G  every refusal exits non-zero
 *
 * The same rule is applied a second time by scripts/check-owner-approval-pr.mjs,
 * the "owner-approval" check, which GitHub runs from the BASE branch on
 * pull_request_target and which reads the pull request only as API data. It is
 * proved here too (P cases), including that a pull request which edits the
 * guard itself is still refused by the base rule, and its workflow is checked for the
 * pull_request_target safety rules (base checkout only, read-only token, no
 * install, no event text in a shell command).
 *
 * Plus the RED proof: the pre-fix guard (committed fixture, pinned by git blob
 * SHA-1 so it runs on shallow checkouts too) PASSES the forged-author case. If
 * this test were pointed at that guard it would fail; that is the regression it
 * exists to catch. And wiring: the guard and this test are in scripts/guards.txt,
 * and the required "guards" workflow hands the guard a read-only token.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  findOwnerApproval as findOwnerApprovalRaw, decideOwnerApproval as decideOwnerApprovalRaw, approvedCommitCandidates,
  isOwnerOnly, OWNERS, OWNER_LOGINS, OWNER_SIGNING_KEYS, APPROVAL_NAMESPACE, APPROVAL_POLICY, OWNER_ONLY, approvalMessage,
} from "./lib/ownerApproval.mjs";
import { checkSshSignature, extractSshSignatureBlocks, parseOpenSshPublicKey, verifySshSignature } from "./lib/sshSignature.mjs";
import { approvalMessageLiteral, approvalSignature, armorOf, makeSigner, signedApprovalBody, skSign, sshSign, writeKeyInjectionPreload } from "./lib/ownerSigningTestkit.mjs";

const REPO = process.cwd();
const GUARD = join(REPO, "scripts", "check-doc-ownership.mjs");
const PR_CHECK = join(REPO, "scripts", "check-owner-approval-pr.mjs");
const PRE_FIX = join(REPO, "scripts", "fixtures", "check-doc-ownership-author-trust-at-a55ae1fb.mjs.txt");
const PRE_FIX_BLOB = "7ec3d0de23fb73db6413e2346b18853f1ea9de59";
const FORGED_OWNER = { GIT_AUTHOR_NAME: "Gabriel Pereira", GIT_AUTHOR_EMAIL: "gabrielpereira@me.com", GIT_COMMITTER_NAME: "Gabriel Pereira", GIT_COMMITTER_EMAIL: "gabrielpereira@me.com" };
const LANE = { GIT_AUTHOR_NAME: "claude.exe (Wayfind lane)", GIT_AUTHOR_EMAIL: "lane@example.com", GIT_COMMITTER_NAME: "claude.exe (Wayfind lane)", GIT_COMMITTER_EMAIL: "lane@example.com" };
const OWNER_LOGIN = OWNER_LOGINS[0];
const OWNER_ID = OWNERS[0].id;
// GitHub returns both timestamps; they are equal until the comment is edited.
const T = { created_at: "2026-09-24T00:00:00Z", updated_at: "2026-09-24T00:00:00Z" };

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };

// Throwaway keys for this run. OWNER_SIGNING_KEYS is the owner's FIDO security key
// (empty until he adds it), so every test passes its keys in: as an argument for
// pure calls, and through a module-loader hook for the real scripts run as child
// processes (scripts/lib/ownerSigningTestkit.mjs). Approval flows sign with
// synthetic security keys (flags 0x05: touch and PIN), as the owner policy requires;
// the PLAIN_* keys are made by ssh-keygen and must be refused for approval.
const keyDir = mkdtempSync(join(tmpdir(), "wf-owner-keys-"));
process.on("exit", () => rmSync(keyDir, { recursive: true, force: true }));
const OWNER_KEY = makeSigner(keyDir, "sk-ed25519");
const INTRUDER_KEY = makeSigner(keyDir, "sk-ed25519");
const ECDSA_KEY = makeSigner(keyDir, "sk-ecdsa");
const PLAIN_KEY = makeSigner(keyDir, "ed25519");
const PLAIN_ECDSA = makeSigner(keyDir, "ecdsa"); // OpenSSH has had ecdsa since 5.7; a missing one should fail loudly, not skip a proof
const KEYS = [OWNER_KEY.publicLine];
// Sections 1 and 2 test the account rules, which need a valid signature to reach.
const findOwnerApproval = (comments, sha, owners = OWNERS) => findOwnerApprovalRaw(comments, sha, owners, KEYS);
const decideOwnerApproval = (evidence) => decideOwnerApprovalRaw(evidence, KEYS);
const gitBlobSha1 = (buf) => createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
const git = (cwd, args, env = {}) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }).trim();

// ── 1. Pure rules (no git, no network) ─────────────────────────────────────
{
  const head = "a".repeat(40);
  const S = (text, sha = head) => `${text}\n${approvalSignature(OWNER_KEY, sha)}`;
  const owner = { type: "User", login: OWNER_LOGIN, id: OWNER_ID };
  ok(findOwnerApproval([{ id: 1, ...T, user: owner, body: S(`/owner-approve ${head}`) }], head)?.id === 1, "owner comment naming the full head sha approves");
  ok(findOwnerApproval([{ id: 2, ...T, user: { ...owner, login: OWNER_LOGIN.toUpperCase() }, body: S(`/owner-approve ${head}`) }], head)?.id === 2, "logins compare case-insensitively");
  ok(findOwnerApproval([{ id: 3, ...T, user: owner, body: S(`lgtm\n/owner-approve ${head.toUpperCase()}\nthanks`) }], head)?.id === 3, "the command may sit on its own line inside a longer comment");
  ok(findOwnerApproval([{ id: 4, ...T, user: owner, body: S(`/owner-approve ${head.slice(0, 12)}`) }], head) === null && findOwnerApproval([{ id: 4, ...T, user: owner, body: S(`/owner-approve ${head.slice(0, 39)}`) }], head) === null,
    "a prefix never approves, only the full 40-character sha (a short prefix can be ground)");
  ok(findOwnerApproval([{ id: 5, ...T, user: owner, body: S(`/owner-approve ${"b".repeat(12)}`) }], head) === null, "a different commit never approves");
  ok(findOwnerApproval([{ id: 6, ...T, user: owner, body: S(`please /owner-approve ${head.slice(0, 12)}`) }], head) === null, "a mid-line mention is not the command");
  ok(findOwnerApproval([{ id: 7, ...T, user: { type: "User", login: "someone-else", id: 1 }, body: S(`/owner-approve ${head}`) }], head) === null, "a non-owner login never approves");
  ok(findOwnerApproval([{ id: 81, ...T, user: owner, performed_via_github_app: { slug: "claude", id: 1 }, body: S(`/owner-approve ${head}`) }], head) === null, "an approval an App posted with the owner's token never approves (performed_via_github_app set)");
  ok(findOwnerApproval([{ id: 82, ...T, user: owner, performed_via_github_app: null, body: S(`/owner-approve ${head}`) }], head)?.id === 82, "the owner's own comment (performed_via_github_app null, as GitHub returns it) still approves");
  ok(findOwnerApproval([{ id: 83, ...T, user: owner, performed_via_github_app: { slug: "claude" }, body: S(`/owner-approve ${head}`) }, { id: 84, ...T, user: owner, body: S(`/owner-approve ${head}`) }], head)?.id === 84, "an App-posted approval is skipped, a person-posted one on the same head still counts");
  ok(findOwnerApproval([{ id: 8, ...T, user: { type: "Bot", login: OWNER_LOGIN, id: OWNER_ID }, body: S(`/owner-approve ${head}`) }], head) === null, "a bot account never approves");
  ok(findOwnerApproval([{ id: 9, ...T, user: { type: "User", login: OWNER_LOGIN, id: OWNER_ID + 1 } , body: S(`/owner-approve ${head}`) }], head) === null
    && findOwnerApproval([{ id: 9, ...T, user: { type: "User", login: OWNER_LOGIN }, body: S(`/owner-approve ${head}`) }], head) === null,
    "the owner's login on a different (or missing) account id never approves: a re-registered login is not the owner");
  ok(findOwnerApproval([{ id: 9, ...T, user: owner, body: S(`/owner-approve ${head}`) }], "not-a-sha") === null, "no valid head, no approval");
  ok(findOwnerApproval([{ id: 10, created_at: T.created_at, updated_at: "2026-09-24T00:05:00Z", user: owner, body: S(`/owner-approve ${head}`) }], head) === null
    && findOwnerApproval([{ id: 11, user: owner, body: S(`/owner-approve ${head}`) }], head) === null,
    "an EDITED comment never approves (anyone with write access can edit it), nor one without timestamps");
  ok(findOwnerApproval(null, head) === null && findOwnerApproval([null, { body: 1 }], head) === null, "malformed comment lists never approve or throw");
  ok(!isOwnerOnly("CLAUDE.md") && !isOwnerOnly("claude.md") && isOwnerOnly("AGENTS.md") && isOwnerOnly("docs/card-standard.md") && isOwnerOnly("scripts/check-doc-ownership.mjs")
    && isOwnerOnly("scripts/lib/ownerApproval.mjs") && isOwnerOnly(".github/workflows/guards.yml") && isOwnerOnly(".github/workflows/owner-approval.yml")
    && isOwnerOnly("scripts/check-owner-approval-pr.mjs") && isOwnerOnly("scripts/lib/githubPullEvidence.mjs") && isOwnerOnly("scripts/test-owner-approval.mjs")
    && isOwnerOnly("agents.md") && isOwnerOnly("Agents.MD") && isOwnerOnly("docs/x-Standard.md")
    && isOwnerOnly(".github/workflows/canary.yml") && isOwnerOnly(".github/workflows/new-workflow.yml")
    && !isOwnerOnly("docs/history/x.md") && !isOwnerOnly("lib/x.js") && !isOwnerOnly("docs/github/x.md"),
  "owner-only set covers the rule files (CLAUDE.md excluded since 2026-11-14 by owner decision), the gates' own code and everything under .github/, case-insensitively, nothing else");
  const base = { changedPaths: ["AGENTS.md"], mergeGate: true, pr: { number: 7, eventHeadSha: head, liveHeadSha: head }, comments: [], error: null };
  // The signature verifier, the test signer kit and the owner's signing helper decide what a signature is
  // and what the owner sees when he signs (2026-11-18 review): a PR that edits them needs his approval too.
  for (const p of ["scripts/lib/sshSignature.mjs", "scripts/lib/ownerSigningTestkit.mjs", "scripts/owner-sign-approval.mjs", "Scripts/Lib/SshSignature.mjs"]) {
    ok(isOwnerOnly(p) && OWNER_ONLY.some((rx) => rx.test(p)) && !decideOwnerApproval({ ...base, changedPaths: [p] }).ok, `${p} is owner-only: a change to it without the owner's signed approval is refused`);
  }
  ok(!isOwnerOnly("scripts/lib/sshSignature.mjs.bak") && !isOwnerOnly("scripts/lib/sshSignatureX.mjs") && !isOwnerOnly("scripts/owner-sign-approval.mjs.txt") && !isOwnerOnly("x/scripts/owner-sign-approval.mjs"),
    "the new owner-only entries are exact paths: look-alike names are not caught (and not needed)");
  ok(decideOwnerApproval({ ...base, changedPaths: ["lib/x.js"] }).ok, "decision: ordinary change passes");
  ok(!decideOwnerApproval({ ...base, mergeGate: false, comments: [{ id: 1, ...T, user: owner, body: S(`/owner-approve ${head}`) }] }).ok, "decision: off the merge gate even a real approval is not accepted");
  ok(!decideOwnerApproval({ ...base, error: "boom" }).ok && !decideOwnerApproval({ ...base, pr: null }).ok, "decision: missing evidence fails closed");
  ok(!decideOwnerApproval({ ...base, pr: { number: 7, eventHeadSha: head, liveHeadSha: "c".repeat(40) }, comments: [{ id: 1, ...T, user: owner, body: S(`/owner-approve ${"c".repeat(40)}`) }] }).ok, "decision: a head that moved after the run started fails");
  ok(decideOwnerApproval({ ...base, comments: [{ id: 1, ...T, user: owner, body: S(`/owner-approve ${head}`) }] }).ok, "decision: owner approval of the exact head passes");
  ok(decideOwnerApproval({ ...base, comments: [] }).reason.includes(`/owner-approve ${head}"`), "decision: the refusal prints the full sha to paste");
}

// ── 1b. Signed approval: real SSH signatures, real crypto ──────────────────
// An approval comment must carry an SSH signature, by an owner key, over
// "wayfind-owner-approve v1 / repo=... / sha=<head>". Comment metadata cannot tell
// the owner from an agent using his gh token (issue #2477), a hardware-key
// signature can.
{
  const head = "a1".repeat(20);
  const other = "b2".repeat(20);
  const owner = { type: "User", login: OWNER_LOGIN, id: OWNER_ID };
  const mk = (body, extra = {}) => ({ id: 5000, ...T, user: owner, body, ...extra });
  const find = (comments, sha = head, keys = KEYS) => findOwnerApprovalRaw(comments, sha, OWNERS, keys);
  const line = (sha) => `/owner-approve ${sha}`;
  const body = (signer, sha = head) => signedApprovalBody(signer, sha);
  const B64 = /-----BEGIN SSH SIGNATURE-----\r?\n([\s\S]*?)-----END SSH SIGNATURE-----/;
  const decode = (armored) => Buffer.from(B64.exec(armored)[1].replace(/\s+/g, ""), "base64");

  ok(approvalMessage(head) === `wayfind-owner-approve v1\nrepo=wallstreethyena/Wayfind\nsha=${head}` && approvalMessage(head) === approvalMessageLiteral(head) && APPROVAL_NAMESPACE === "wayfind-owner-approve",
    "the signed message is exactly 'wayfind-owner-approve v1', the repo and the 40-hex sha, no trailing newline, namespace wayfind-owner-approve");
  ok(find([mk(body(OWNER_KEY))])?.id === 5000, "sk-ssh-ed25519: a comment with the owner's security-key signature (touch and PIN) over this head's message is approved");
  ok(find([mk(body(OWNER_KEY))], head, [INTRUDER_KEY.publicLine, OWNER_KEY.publicLine])?.id === 5000, "any one of several configured owner keys may sign");
  ok(find([mk(body(ECDSA_KEY))], head, [ECDSA_KEY.publicLine])?.id === 5000 && find([mk(body(OWNER_KEY))], head, [ECDSA_KEY.publicLine]) === null,
    "sk-ecdsa-sha2-nistp256: approved with its own key, and an ed25519 signature does not match an ecdsa-only key list");
  // an independent oracle: OpenSSH itself accepts the signatures this verifier accepts (the synthetic
  // security key, under the approval policy, and a plain ssh-keygen key through the generic verifier)
  for (const [label, signer, policy] of [["sk-ed25519", OWNER_KEY, APPROVAL_POLICY], ["sk-ecdsa", ECDSA_KEY, APPROVAL_POLICY], ["plain ed25519", PLAIN_KEY, undefined]]) {
    const dir = join(keyDir, `oracle-${label.replace(/\W/g, "")}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "msg"), approvalMessageLiteral(head));
    writeFileSync(join(dir, "sig"), approvalSignature(signer, head));
    writeFileSync(join(dir, "allowed"), `owner namespaces="wayfind-owner-approve" ${signer.publicLine}\n`);
    let oracle = false;
    try { execFileSync("ssh-keygen", ["-Y", "verify", "-f", join(dir, "allowed"), "-I", "owner", "-n", "wayfind-owner-approve", "-s", join(dir, "sig")], { input: readFileSync(join(dir, "msg")), stdio: ["pipe", "pipe", "pipe"] }); oracle = true; } catch { /* rejected */ }
    ok(oracle && checkSshSignature({ armored: approvalSignature(signer, head), message: approvalMessageLiteral(head), namespace: APPROVAL_NAMESPACE, publicKeyLine: signer.publicLine, policy }).ok,
      `cross-check (${label}): ssh-keygen -Y verify and this verifier both accept the same signature`);
  }

  // Everything below must be REFUSED. Each carries an otherwise complete, valid-looking comment.
  ok(find([mk(line(head))]) === null, "no signature: the account checks alone no longer approve (an agent with the owner's gh token has no key)");
  ok(find([mk(`${line(head)}\n${approvalSignature(OWNER_KEY, other)}`)]) === null, "replay: a signature made for another commit does not approve this head");
  ok(find([mk(`${line(other)}\n${approvalSignature(OWNER_KEY, other)}`)], head) === null, "replay: an approval of an old head does not approve a new head");
  ok(find([mk(`${line(head)}\n${sshSign(OWNER_KEY, `wayfind-owner-approve v1\nrepo=attacker/Wayfind\nsha=${head}`)}`)]) === null, "a signature over a different repository string is refused");
  ok(find([mk(`${line(head)}\n${sshSign(OWNER_KEY, approvalMessageLiteral(head), "git")}`)]) === null, "a signature in the wrong namespace (e.g. a git signature) is refused");
  ok(find([mk(`${line(head)}\n${sshSign(OWNER_KEY, `${approvalMessageLiteral(head)}\n`)}`)]) === null && find([mk(`${line(head)}\n${sshSign(OWNER_KEY, approvalMessageLiteral(head).replace("v1", "v2"))}`)]) === null,
    "the message must be byte-exact: a trailing newline or another version is refused");
  ok(find([mk(body(INTRUDER_KEY))]) === null, "a signature by a key that is not an owner key is refused");
  // ssh-keygen wraps at 70 columns and can leave the base64 padding alone on the last line
  // ("=" or "==" by itself); a verifier that rejects that refuses a random one in three ecdsa signatures.
  {
    // ed25519 signatures have a fixed length, so ssh-keygen always ends this one with a lone "=" padding character
    const plain = approvalSignature(PLAIN_KEY, head);
    const verifies = (armored) => verifySshSignature({ armored, message: approvalMessageLiteral(head), namespace: APPROVAL_NAMESPACE, publicKeyLine: PLAIN_KEY.publicLine });
    ok(/[A-Za-z0-9+/]=\n-----END/.test(plain) && verifies(plain) && verifies(plain.replace(/=\n-----END/, "\n=\n-----END")),
      "a signature whose base64 padding sits alone on the last armor line (as ssh-keygen writes it) verifies");
  }
  ok(find([mk(body(OWNER_KEY))], head, []) === null && find([mk(body(OWNER_KEY))], head, ["not a key", "ssh-ed25519 AAAA"]) === null,
    "fail closed: an empty or unusable key list approves nothing");
  ok(OWNER_SIGNING_KEYS.length > 0 || findOwnerApprovalRaw([mk(body(OWNER_KEY))], head) === null,
    "fail closed: with the shipped OWNER_SIGNING_KEYS (empty until the owner adds his hardware key) nothing is approved");
  ok(Object.isFrozen(OWNER_SIGNING_KEYS) && Array.isArray(OWNER_SIGNING_KEYS) && OWNER_SIGNING_KEYS.every((l) => { try { parseOpenSshPublicKey(l); return true; } catch { return false; } }),
    "OWNER_SIGNING_KEYS is a frozen list of parseable OpenSSH public keys of a supported type");

  const sigText = approvalSignature(OWNER_KEY, head);
  const blob = decode(sigText);
  const flipped = (at) => { const c = Buffer.from(blob); c[at] ^= 0x01; return c; };
  ok(find([mk(`${line(head)}\n${armorOf(flipped(blob.length - 1))}`)]) === null, "a signature with one mutated byte in the signature data is refused");
  ok(find([mk(`${line(head)}\n${armorOf(flipped(30))}`)]) === null, "a signature with one mutated byte in the embedded public key is refused");
  ok(find([mk(`${line(head)}\n${armorOf(Buffer.concat([blob, Buffer.from([0, 0, 0, 0])]))}`)]) === null, "trailing garbage after the signature is refused");
  ok(find([mk(`${line(head)}\n${sigText.replace("-----END SSH SIGNATURE-----", "")}`)]) === null
    && find([mk(`${line(head)}\n${sigText.replace(/\n(?=[A-Za-z0-9+/=]+\n-----END)/, "\n!!")}`)]) === null
    && find([mk(`${line(head)}\n-----BEGIN SSH SIGNATURE-----\n-----END SSH SIGNATURE-----`)]) === null,
  "malformed armor (no end line, a non-base64 line, an empty block) is refused without throwing");
  ok(find([mk(body(OWNER_KEY), { updated_at: "2026-09-24T00:05:00Z" })]) === null, "an EDITED comment with a valid signature is still refused");
  ok(find([mk(body(OWNER_KEY), { performed_via_github_app: { slug: "claude", id: 1 } })]) === null, "an App-posted comment with a valid signature is still refused");
  ok(find([{ ...mk(body(OWNER_KEY)), user: { ...owner, type: "Bot" } }]) === null && find([{ ...mk(body(OWNER_KEY)), user: { type: "User", login: "someone-else", id: 1 } }]) === null,
    "a bot, or a non-owner account, posting a valid owner signature is refused");
  ok(find([mk(`${line(head)}\r\n${approvalSignature(OWNER_KEY, head).replace(/\n/g, "\r\n")}`)])?.id === 5000, "a comment typed on github.com (CRLF line endings) is approved");
  ok(find([mk(`I approve this.\n\n\`\`\`\n${line(head)}\n${approvalSignature(OWNER_KEY, head)}\`\`\`\n`)])?.id === 5000, "the command and signature pasted inside a code fence, with prose around them, are approved");

  // carry-forward candidates need the signature too
  const cands = approvedCommitCandidates([mk(body(OWNER_KEY, other))], head, OWNERS, KEYS);
  ok(cands.length === 1 && cands[0].sha === other && approvedCommitCandidates([mk(line(other))], head, OWNERS, KEYS).length === 0
    && approvedCommitCandidates([mk(body(INTRUDER_KEY, other))], head, OWNERS, KEYS).length === 0 && approvedCommitCandidates([mk(body(OWNER_KEY, other))], head, OWNERS, []).length === 0,
  "carry-forward candidates: only an owner-signed approval of an earlier head is considered");
  const verdictNoKeys = decideOwnerApprovalRaw({ changedPaths: ["AGENTS.md"], mergeGate: true, pr: { number: 7, eventHeadSha: head, liveHeadSha: head }, comments: [mk(body(OWNER_KEY))], error: null }, []);
  ok(!verdictNoKeys.ok && /OWNER_SIGNING_KEYS/.test(verdictNoKeys.reason) && decideOwnerApprovalRaw({ changedPaths: ["AGENTS.md"], mergeGate: true, pr: { number: 7, eventHeadSha: head, liveHeadSha: head }, comments: [mk(body(OWNER_KEY))], error: null }, KEYS).ok,
    "decision: with no key configured the refusal says so; with the owner's key the same comment approves");
  ok(extractSshSignatureBlocks(`a\n${sigText}\nb\n${sigText}`).length === 2 && extractSshSignatureBlocks(null).length === 0, "signature blocks are found anywhere in a comment, and odd input yields none");

  // The owner-run helper signs with `ssh-keygen -Y sign`, prints the comment to paste, and never posts anything.
  // It takes the sha the owner copied from github.com (--sha) and has no --pr: it must not look up "the head right now".
  {
    const helper = join(REPO, "scripts", "owner-sign-approval.mjs");
    const runHelper = (args) => {
      const r = spawnSync(process.execPath, [helper, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      return { code: r.status, out: r.stdout, err: r.stderr };
    };
    const signed = runHelper(["--sha", head.toUpperCase(), "--key", PLAIN_KEY.keyPath]);
    const printed = signed.out;
    ok(printed.startsWith(`/owner-approve ${head}\n-----BEGIN SSH SIGNATURE-----`)
      && verifySshSignature({ armored: extractSshSignatureBlocks(printed)[0], message: approvalMessageLiteral(head), namespace: APPROVAL_NAMESPACE, publicKeyLine: PLAIN_KEY.publicLine })
      && !verifySshSignature({ armored: extractSshSignatureBlocks(printed)[0], message: approvalMessageLiteral(other), namespace: APPROVAL_NAMESPACE, publicKeyLine: PLAIN_KEY.publicLine }),
    "owner-sign-approval.mjs --sha prints '/owner-approve <sha>' plus a signature block over the approval message for that sha only");
    ok(signed.err.includes(head) && signed.err.includes("wallstreethyena/Wayfind") && /compare/i.test(signed.err) && /github\.com/.test(signed.err) && signed.err.indexOf(head) < signed.err.indexOf("signed for sha"),
      "the helper prints the sha and the repository, and tells the owner to compare them with github.com, before the key signs");
    ok(find([mk(printed)], head, [PLAIN_KEY.publicLine]) === null,
      "a signature made with a plain ssh-keygen key (what this helper would produce with a key file) is refused for approval");
    const withPr = runHelper(["--pr", "2607"]);
    const noSha = runHelper([]);
    const shortSha = runHelper(["--sha", head.slice(0, 12), "--key", PLAIN_KEY.keyPath]);
    ok(withPr.code === 2 && /unknown argument --pr/.test(withPr.err) && noSha.code === 2 && /--sha is required/.test(noSha.err) && shortSha.code === 2 && shortSha.out === "",
      "the helper has no --pr (it would sign whatever the head is at that moment); a missing or short --sha is refused without signing");
    const src = readFileSync(helper, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    ok(!/fetch\(|"comment"|"api"|"issue"|"--method"|https?:\/\/|"gh"|"pr", "view"|--pr/.test(src),
      "the helper makes no network or gh call and has no code path that posts, edits or reads a pull request");
  }

  // Owner signing policy (2026-11-18 review): a security-key line, touch AND PIN.
  {
    const msg = approvalMessageLiteral(head);
    const plainCheck = (signer, policy) => checkSshSignature({ armored: approvalSignature(signer, head), message: msg, namespace: APPROVAL_NAMESPACE, publicKeyLine: signer.publicLine, policy });
    ok(find([mk(body(PLAIN_KEY))], head, [PLAIN_KEY.publicLine]) === null && find([mk(body(PLAIN_ECDSA))], head, [PLAIN_ECDSA.publicLine]) === null
      && find([mk(body(PLAIN_KEY))], head, [PLAIN_KEY.publicLine, OWNER_KEY.publicLine]) === null,
    "policy: a plain ed25519 or ecdsa owner key line with a perfectly valid signature is refused for approval (a key file cannot prove a person was present), even beside a real sk key");
    ok(plainCheck(PLAIN_KEY).ok && plainCheck(PLAIN_ECDSA).ok && /not a security key/.test(plainCheck(PLAIN_KEY, APPROVAL_POLICY).reason || "") && /not a security key/.test(plainCheck(PLAIN_ECDSA, { requireSecurityKey: true }).reason || ""),
      "policy: the generic verifier still accepts a plain key when no policy is passed, and with the policy refuses it with its own reason");
    ok(APPROVAL_POLICY.requireSecurityKey === true && APPROVAL_POLICY.requireUserVerification === true && Object.isFrozen(APPROVAL_POLICY), "policy: the approval policy requires a security key and user verification, and is frozen");
    for (const [label, signer] of [["sk-ed25519", OWNER_KEY], ["sk-ecdsa", ECDSA_KEY]]) {
      const keys = [signer.publicLine];
      const withFlags = (signedFlags, blobFlags) => mk(`${line(head)}\n${skSign(signer, { message: msg, signedFlags, blobFlags })}`);
      const checkFlags = (signedFlags, policy) => checkSshSignature({ armored: skSign(signer, { message: msg, signedFlags }), message: msg, namespace: APPROVAL_NAMESPACE, publicKeyLine: signer.publicLine, policy });
      ok(find([withFlags(0x05)], head, keys)?.id === 5000 && find([mk(body(signer))], head, keys)?.id === 5000, `policy (${label}): flags 0x05 (touch and PIN) are approved, and that is the kit's default`);
      ok(find([withFlags(0x01)], head, keys) === null && /without user verification/.test(checkFlags(0x01, APPROVAL_POLICY).reason || ""),
        `policy (${label}): touch only (flags 0x01, no PIN) is refused, with the user-verification reason`);
      ok(checkFlags(0x01).ok && checkFlags(0x01, { requireSecurityKey: true }).ok, `policy (${label}): the generic verifier accepts touch only when no UV is required`);
      ok(find([withFlags(0x04)], head, keys) === null && find([withFlags(0x00)], head, keys) === null && /no touch/.test(checkFlags(0x04, APPROVAL_POLICY).reason || ""),
        `policy (${label}): PIN without a touch (0x04) and no flags (0x00) are refused`);
      ok(find([withFlags(0x01, 0x05)], head, keys) === null && /does not verify/.test(checkSshSignature({ armored: skSign(signer, { message: msg, signedFlags: 0x01, blobFlags: 0x05 }), message: msg, namespace: APPROVAL_NAMESPACE, publicKeyLine: signer.publicLine, policy: APPROVAL_POLICY }).reason || ""),
        `policy (${label}): claiming user verification in the blob when the key signed without it breaks the signature (the flags are covered)`);
      ok(find([withFlags(0x0d)], head, keys)?.id === 5000, `policy (${label}): extra flag bits beside touch and PIN do not matter (0x0d)`);
    }
    ok(approvedCommitCandidates([mk(`${line(other)}\n${approvalSignature(OWNER_KEY, other, 0x01)}`)], head, OWNERS, KEYS).length === 0
      && approvedCommitCandidates([mk(`${line(other)}\n${approvalSignature(PLAIN_KEY, other)}`)], head, OWNERS, [PLAIN_KEY.publicLine]).length === 0
      && approvedCommitCandidates([mk(body(OWNER_KEY, other))], head, OWNERS, KEYS).length === 1,
    "policy: carry-forward candidates need the same security-key, touch-and-PIN signature");
    const noSk = decideOwnerApprovalRaw({ changedPaths: ["AGENTS.md"], mergeGate: true, pr: { number: 7, eventHeadSha: head, liveHeadSha: head }, comments: [mk(body(PLAIN_KEY))], error: null }, [PLAIN_KEY.publicLine]);
    ok(!noSk.ok && /security-key type/.test(noSk.reason), "policy: when no configured line is a security key, the refusal says only security keys can approve");
  }

  // Security-key (sk-*) signatures against the generic verifier (no policy), built with node:crypto per PROTOCOL.sshsig + PROTOCOL.u2f.
  for (const [kind, key] of [["ed", OWNER_KEY], ["ec", ECDSA_KEY]]) {
    const keys = [key.publicLine];
    const msg = approvalMessageLiteral(head);
    const cm = (armored) => mk(`${line(head)}\n${armored}`);
    const generic = (armored, extra = {}) => checkSshSignature({ armored, message: msg, namespace: APPROVAL_NAMESPACE, publicKeyLine: key.publicLine, ...extra });
    ok(generic(skSign(key, { message: msg, signedFlags: 1 })).ok && generic(skSign(key, { message: msg, signedFlags: 5 })).ok,
      `sk-${kind}: the generic verifier accepts a security-key signature with user presence (touch) set (flags 0x01, and 0x05 with user verification)`);
    ok(find([cm(skSign(key, { message: msg, signedFlags: 0 }))], head, keys) === null && /no touch/.test(generic(skSign(key, { message: msg, signedFlags: 0 })).reason || ""),
      `sk-${kind}: user presence NOT set (flags 0x00) is refused, with that reason`);
    ok(!generic(skSign(key, { message: msg, signedFlags: 0, blobFlags: 1 })).ok && !generic(skSign(key, { message: msg, signedFlags: 1, blobFlags: 0 })).ok,
      `sk-${kind}: flipping the presence flag in the signature blob breaks it (the flags are covered by the signature)`);
    ok(find([cm(skSign(key, { message: msg, counter: 7 }))], head, keys)?.id === 5000 && find([cm(skSign(key, { message: msg.replace(head, other) }))], head, keys) === null
      && find([cm(skSign(key, { message: msg, namespace: "not-the-approval-namespace" }))], head, keys) === null,
    `sk-${kind}: bound to the message and the namespace like any other signature`);
    ok(find([cm(skSign(key, { message: msg, hashAlg: "sha256" }))], head, keys)?.id === 5000 && find([cm(skSign(key, { message: msg, hashAlg: "sha1" }))], head, keys) === null,
      `sk-${kind}: sha256 and sha512 are accepted, any other hash algorithm is refused`);
  }
}

// ── 2. The real guard, in real git repositories, with a stub GitHub API ────
const root = mkdtempSync(join(tmpdir(), "wf-owner-approval-"));
try {
  const origin = join(root, "origin");
  mkdirSync(origin);
  git(origin, ["init", "-q", "-b", "main"]);
  writeFileSync(join(origin, "AGENTS.md"), "# rules\n\nkeep this\n");
  writeFileSync(join(origin, "README.md"), "hello\n");
  git(origin, ["add", "-A"]);
  git(origin, ["commit", "-q", "-m", "seed"], LANE);

  let n = 0;
  const branch = (edits, env = LANE) => {
    const dir = join(root, `clone-${++n}`);
    git(root, ["clone", "-q", `file://${origin}`, dir]);
    git(dir, ["checkout", "-q", "-b", "work"]);
    for (const [rel, body] of edits) {
      mkdirSync(join(dir, rel.split("/").slice(0, -1).join("/") || "."), { recursive: true });
      if (body === null) git(dir, ["rm", "-q", rel]); else writeFileSync(join(dir, rel), body);
      git(dir, ["add", "-A"]);
    }
    git(dir, ["commit", "-q", "-m", "change"], env);
    return { dir, head: git(dir, ["rev-parse", "HEAD"]) };
  };

  // fetch stub: answers /pulls/<n>, /pulls/<n>/files and /issues/<n>/comments from a
  // JSON file and logs every call. liveHeadLater (optional) is the head on the
  // SECOND read of /pulls/<n>, to simulate a push landing mid-read.
  const preload = join(root, "fetch-stub.mjs");
  writeFileSync(preload, `
import { readFileSync, appendFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(process.env.STUB_CONFIG, "utf8"));
let pullReads = 0;
globalThis.fetch = async (url, init = {}) => {
  appendFileSync(process.env.STUB_LOG, String(url) + "\\n");
  if (!String((init.headers || {}).Authorization || "").startsWith("Bearer ")) throw new Error("no token sent");
  if (cfg.status && cfg.status !== 200) return { ok: false, status: cfg.status, json: async () => ({}) };
  const path = new URL(url).pathname;
  if (/\\/pulls\\/\\d+$/.test(path)) {
    const sha = ++pullReads > 1 && cfg.liveHeadLater ? cfg.liveHeadLater : cfg.liveHead;
    return { ok: true, status: 200, json: async () => ({ head: { sha }, changed_files: cfg.changedFiles ?? (cfg.files || []).length }) };
  }
  if (/\\/pulls\\/\\d+\\/files$/.test(path)) return { ok: true, status: 200, json: async () => cfg.files || [] };
  if (/\\/issues\\/\\d+\\/comments$/.test(path)) {
    // cfg.pageSize simulates GitHub pagination: page n returns items [(n-1)*size, n*size).
    const page = Number(new URL(url).searchParams.get("page") || 1);
    const size = cfg.pageSize || 0;
    const body = size ? cfg.comments.slice((page - 1) * size, page * size) : cfg.comments;
    return { ok: true, status: 200, json: async () => body };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};`);

  const injectKeys = writeKeyInjectionPreload(root, KEYS);
  let runN = 0;
  const run = ({ dir, script = GUARD, gate = false, event = "pull_request", eventHead, liveHead, liveHeadLater, comments = [], status = 200, token = "fixture-token", eventFile = true, files, changedFiles, pageSize }) => {
    const tag = ++runN;
    const log = join(root, `calls-${tag}.log`);
    writeFileSync(log, "");
    const cfgPath = join(root, `stub-${tag}.json`);
    writeFileSync(cfgPath, JSON.stringify({ liveHead, liveHeadLater, comments, status, files, changedFiles, pageSize }));
    const eventPath = join(root, `event-${tag}.json`);
    if (eventFile) writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 1478, head: { sha: eventHead } } }));
    const env = { ...process.env, GITHUB_ACTIONS: gate ? "true" : "", STUB_CONFIG: cfgPath, STUB_LOG: log };
    for (const k of ["GITHUB_TOKEN", "GITHUB_EVENT_NAME", "GITHUB_EVENT_PATH", "GITHUB_REPOSITORY", "GITHUB_API_URL"]) delete env[k];
    if (gate) Object.assign(env, { GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.fixture.invalid" });
    if (gate && token) env.GITHUB_TOKEN = token;
    let code = 0, out = "";
    try { out = execFileSync(process.execPath, ["--import", preload, "--import", injectKeys, script], { cwd: dir, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { code = e.status ?? 1; out = `${e.stdout || ""}${e.stderr || ""}`; }
    return { code, out, calls: readFileSync(log, "utf8").split("\n").filter(Boolean) };
  };
  const approve = (sha, login = OWNER_LOGIN, type = "User", prefix = "") => ({ id: 100 + runN, ...T, user: { login, type, id: login === OWNER_LOGIN ? OWNER_ID : 4242 }, body: `${prefix}/owner-approve ${sha}\n${approvalSignature(OWNER_KEY, sha)}` });

  // A. no owner-only change -> pass, locally and on the gate, with no API call.
  const plain = branch([["lib/thing.js", "export const a = 1;\n"]]);
  let r = run({ dir: plain.dir });
  ok(r.code === 0 && /OK/.test(r.out), `A local: ordinary change passes (${r.code}: ${r.out.trim()})`);
  r = run({ dir: plain.dir, gate: true, eventHead: plain.head, liveHead: plain.head });
  ok(r.code === 0 && r.calls.length === 0, `A gate: ordinary change passes without touching the API (${r.code}, ${r.calls.length} calls)`);

  // B. owner-only change, no approval -> fail.
  const edit = branch([["AGENTS.md", "# rules\n\nkeep this\nnew rule\n"]]);
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, comments: [] });
  ok(r.code === 1 && /no owner approval for head/.test(r.out) && r.out.includes(`/owner-approve ${edit.head}`), `B: unapproved AGENTS.md change fails and names the exact command (${r.code}: ${r.out.trim()})`);

  // C. forged owner author/committer -> still fail, every way.
  const forged = branch([["AGENTS.md", "# rules\n\nkeep this\nforged rule\n"]], FORGED_OWNER);
  ok(git(forged.dir, ["log", "-1", "--format=%an|%cn"]) === "Gabriel Pereira|Gabriel Pereira", "C setup: the commit really claims the owner as author and committer");
  r = run({ dir: forged.dir });
  ok(r.code === 1 && /local run cannot grant it/.test(r.out), `C local: forged owner author is refused (${r.code}: ${r.out.trim()})`);
  r = run({ dir: forged.dir, gate: true, eventHead: forged.head, liveHead: forged.head, comments: [] });
  ok(r.code === 1, `C gate: forged owner author with no approval is refused (${r.code}: ${r.out.trim()})`);
  r = run({ dir: forged.dir, gate: true, eventHead: forged.head, liveHead: forged.head, comments: [approve(forged.head, "wayfind-agent")] });
  ok(r.code === 1, `C gate: an approval comment from a non-owner login is refused (${r.code})`);
  r = run({ dir: forged.dir, gate: true, eventHead: forged.head, liveHead: forged.head, comments: [approve(forged.head, OWNER_LOGIN, "Bot")] });
  ok(r.code === 1, `C gate: a bot account carrying the owner's login is refused (${r.code})`);

  // D. authenticated owner approval of the exact head -> pass; near misses fail.
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, comments: [approve(edit.head)] });
  ok(r.code === 0 && new RegExp(`approved by @${OWNER_LOGIN}`).test(r.out) && r.calls.length >= 2, `D: owner "/owner-approve <head>" passes, read from the API (${r.code}: ${r.out.trim()})`);
  const parent = git(edit.dir, ["rev-parse", "HEAD~1"]);
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, comments: [approve(parent)] });
  ok(r.code === 1, `D: an approval for an older commit does not carry over (${r.code})`);
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, comments: [approve(edit.head, OWNER_LOGIN, "User", "fine by me ")] });
  ok(r.code === 1, `D: a mid-line mention is not an approval (${r.code})`);
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: "d".repeat(40), comments: [approve(edit.head), approve("d".repeat(40))] });
  ok(r.code === 1 && /moved/.test(r.out), `D: a head that moved after the run started fails (${r.code}: ${r.out.trim()})`);
  r = run({ dir: forged.dir, gate: true, eventHead: forged.head, liveHead: forged.head, comments: [approve(forged.head)] });
  ok(r.code === 0, `D: the forged-author commit passes ONLY once the owner approves it on GitHub (${r.code})`);

  // Self-protection and renames: the gate's own files are owner-only; moving AGENTS.md is a change.
  const self = branch([["scripts/check-doc-ownership.mjs", "console.log('check-doc-ownership: OK');\n"]]);
  r = run({ dir: self.dir, gate: true, eventHead: self.head, liveHead: self.head, comments: [] });
  ok(r.code === 1 && /scripts\/check-doc-ownership\.mjs/.test(r.out), `self-protection: editing the guard itself needs owner approval (${r.code})`);
  const moved = branch([["AGENTS.md", null], ["docs/AGENTS-old.md", "# rules\n\nkeep this\n"]]);
  r = run({ dir: moved.dir, gate: true, eventHead: moved.head, liveHead: moved.head, comments: [] });
  ok(r.code === 1 && /AGENTS\.md/.test(r.out), `a rename away from AGENTS.md is still an owner-only change (${r.code})`);

  // E. ordinary changes unaffected, even with a forged author and even with no token at all.
  const forgedPlain = branch([["docs/history/note.md", "history\n"]], FORGED_OWNER);
  r = run({ dir: forgedPlain.dir, gate: true, eventHead: forgedPlain.head, liveHead: forgedPlain.head, token: null });
  ok(r.code === 0 && r.calls.length === 0, `E: ordinary change needs no token and no approval (${r.code}: ${r.out.trim()})`);

  // F. merge gate without the context it needs -> fail closed.
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, comments: [approve(edit.head)], token: null });
  ok(r.code === 1 && /GITHUB_TOKEN/.test(r.out), `F: no token on the gate fails closed (${r.code}: ${r.out.trim()})`);
  r = run({ dir: edit.dir, gate: true, event: "push", eventHead: edit.head, liveHead: edit.head, comments: [approve(edit.head)] });
  ok(r.code === 1 && /not a pull request/.test(r.out), `F: a non-PR trigger fails closed (${r.code})`);
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, comments: [approve(edit.head)], status: 500 });
  ok(r.code === 1 && /HTTP 500/.test(r.out), `F: a GitHub API error fails closed (${r.code})`);
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, comments: [approve(edit.head)], eventFile: false });
  ok(r.code === 1 && /event payload/.test(r.out), `F: an unreadable event payload fails closed (${r.code})`);

  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, liveHeadLater: "e".repeat(40), comments: [approve(edit.head)] });
  ok(r.code === 1 && /moved .* while its evidence was being read/.test(r.out), `F: a push landing while the evidence is read fails closed (${r.code}: ${r.out.trim()})`);

  // P. The "owner-approval" check (base branch code on pull_request_target, API data only).
  const H = "f".repeat(40);
  const file = (filename, previous_filename) => (previous_filename ? { filename, previous_filename, status: "renamed" } : { filename, status: "modified" });
  const pr = (o) => run({ dir: root, script: PR_CHECK, gate: true, event: "pull_request_target", eventHead: H, liveHead: H, ...o });
  r = pr({ files: [file("lib/thing.js"), file("docs/history/a.md")] });
  ok(r.code === 0 && /no owner-only files changed/.test(r.out) && r.calls.some((c) => /\/pulls\/1478\/files/.test(c)), `P ordinary: judged from the API file list and passes (${r.code}: ${r.out.trim()})`);
  r = pr({ files: [file("AGENTS.md")] });
  ok(r.code === 1 && r.out.includes(`/owner-approve ${H}`), `P B: unapproved AGENTS.md change fails and names the command (${r.code}: ${r.out.trim()})`);
  r = pr({ files: [file("AGENTS.md")], comments: [approve(H)] });
  ok(r.code === 0 && new RegExp(`approved by @${OWNER_LOGIN}`).test(r.out), `P D: owner approval of the exact head passes (${r.code}: ${r.out.trim()})`);
  const filler = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, ...T, user: { login: "someone", type: "User", id: 7 }, body: "noise" }));
  r = pr({ files: [file("AGENTS.md")], comments: [...filler, approve(H)], pageSize: 100 });
  ok(r.code === 0 && r.calls.some((c) => /\/issues\/1478\/comments\?per_page=100&page=2/.test(c)), `P D: an approval on the second page of comments is found (pagination read) (${r.code})`);
  r = pr({ files: [file("AGENTS.md")], comments: [approve(H, "wayfind-agent"), approve(H, OWNER_LOGIN, "Bot")] });
  ok(r.code === 1, `P C: non-owner and bot approvals are refused (${r.code})`);
  r = pr({ files: [file("scripts/lib/ownerApproval.mjs"), file("scripts/check-doc-ownership.mjs"), file("AGENTS.md")] });
  ok(r.code === 1 && /scripts\/lib\/ownerApproval\.mjs/.test(r.out) && /scripts\/check-doc-ownership\.mjs/.test(r.out), `P tamper: a PR that rewrites the guard is judged by the base rule and refused (${r.code})`);
  r = pr({ files: [file("docs/AGENTS-old.md", "AGENTS.md")] });
  ok(r.code === 1 && /AGENTS\.md/.test(r.out), `P rename: moving AGENTS.md away counts as an owner-only change (${r.code})`);
  r = pr({ files: [file("lib/thing.js")], changedFiles: 3 });
  ok(r.code === 1 && /incomplete list/.test(r.out), `P F: an incomplete file list fails closed (${r.code}: ${r.out.trim()})`);
  r = pr({ files: [file("lib/thing.js")], event: "pull_request" });
  ok(r.code === 1 && /not a pull request event this check accepts/.test(r.out), `P F: only pull_request_target (base code) may decide (${r.code})`);
  r = pr({ files: [file("lib/thing.js")], gate: false });
  ok(r.code === 1 && /local run cannot/.test(r.out), `P F: outside GitHub Actions it refuses even ordinary changes (${r.code})`);
  r = pr({ files: [file("lib/thing.js")], token: null });
  ok(r.code === 1 && /GITHUB_TOKEN/.test(r.out) && r.calls.length === 0, `P F: no token fails closed before any call (${r.code})`);
  r = pr({ files: [file("lib/thing.js")], status: 502 });
  ok(r.code === 1 && /HTTP 502/.test(r.out), `P F: an API error fails closed (${r.code})`);
  r = pr({ files: [file("AGENTS.md")], comments: [approve(H)], liveHeadLater: "e".repeat(40) });
  ok(r.code === 1 && /moved/.test(r.out), `P D: an approval does not survive a push landing mid-read (${r.code})`);
  r = pr({ files: [file("lib/thing.js")], eventHead: "e".repeat(40) });
  ok(r.code === 1 && /moved/.test(r.out), `P D: a run for an older head refuses (${r.code})`);

  // RED proof: the pre-fix guard accepted the forged author. Pinned by blob SHA-1.
  const preFix = readFileSync(PRE_FIX);
  ok(gitBlobSha1(preFix) === PRE_FIX_BLOB, `pre-fix fixture is byte-identical to the shipped guard at a55ae1fb (blob ${gitBlobSha1(preFix)})`);
  const oldGuard = join(forged.dir, "old-guard.mjs");
  writeFileSync(oldGuard, preFix);
  r = run({ dir: forged.dir, script: oldGuard });
  ok(r.code === 0 && /OK/.test(r.out), `RED: the pre-fix guard PASSED a forged owner author, the vulnerability this test catches (${r.code}: ${r.out.trim()})`);
} finally {
  rmSync(root, { recursive: true, force: true });
}

// ── 3. Wiring: a test that never runs protects nothing ─────────────────────
{
  const guards = readFileSync(join(REPO, "scripts", "guards.txt"), "utf8").split("\n").map((l) => l.trim());
  ok(guards.includes("node scripts/check-doc-ownership.mjs") && guards.includes("node scripts/test-owner-approval.mjs"), "guard and this test are both in scripts/guards.txt (run by the required guards check)");
  const wf = readFileSync(join(REPO, ".github", "workflows", "guards.yml"), "utf8");
  ok(/^\s+name:\s*guards\s*$/m.test(wf) && /pull_request:/.test(wf), "the guards workflow runs on pull requests under the job name the branch rule requires");
  ok(/GITHUB_TOKEN:\s*\$\{\{\s*github\.token\s*\}\}/.test(wf) && /pull-requests:\s*read/.test(wf) && /issues:\s*read/.test(wf) && !/:\s*write/.test(wf), "the guard suite gets a read-only token that can read PR comments");
  ok(existsSync(join(REPO, "docs", "OWNER_APPROVAL.md")), "the approval procedure is documented");
  const oa = readFileSync(join(REPO, ".github", "workflows", "owner-approval.yml"), "utf8");
  const oaCode = oa.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  ok(/^\s*pull_request_target:/m.test(oaCode) && !/^\s*pull_request:/m.test(oaCode) && /^\s+name:\s*owner-approval\s*$/m.test(oaCode)
    && /run:\s*node scripts\/check-owner-approval-pr\.mjs\s*$/m.test(oaCode), "the owner-approval job runs the base-branch check on pull_request_target only");
  ok(/pull-requests:\s*read/.test(oaCode) && /issues:\s*read/.test(oaCode) && /contents:\s*read/.test(oaCode) && !/:\s*write/.test(oaCode) && !/write-all/.test(oaCode),
    "owner-approval has a read-only token");
  ok(/persist-credentials:\s*false/.test(oaCode) && !/^\s*ref:/m.test(oaCode) && !/github\.event\.pull_request\.head/.test(oaCode) && !/\b(npm|npx|yarn|pnpm)\b/.test(oaCode)
    && !/repository:/.test(oaCode), "owner-approval never checks out, installs or runs pull request code");
  const expressions = [...oaCode.matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1].trim()).sort();
  ok(JSON.stringify(expressions) === JSON.stringify(["github.event.pull_request.number", "github.token"]) && !/run:\s*[|>]/.test(oaCode),
    `owner-approval evaluates only the PR number (concurrency) and its token, and has no multi-line shell block: no event text can reach a shell (${expressions.join(", ")})`);
  const uses = [...oaCode.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  ok(uses.length === 2 && uses.every((u) => /@[0-9a-f]{40}$/.test(u)), `owner-approval pins every action to a full commit sha (${uses.join(", ")})`);
}

const EXPECTED = 135;
if (checks !== EXPECTED) {
  console.error(`test-owner-approval: FAIL — ran ${checks} assertions, expected exactly ${EXPECTED}; a proof was skipped or added without review.`);
  process.exit(1);
}
console.log(`test-owner-approval: OK — ${checks} assertions: forged owner author refused locally and on the merge gate, authenticated head-bound owner approval accepted, fail-closed without GitHub context, ordinary changes unaffected, pre-fix guard red-proved (blob ${PRE_FIX_BLOB.slice(0, 12)}), the owner-approval check applies the base branch's rule and is pull_request_target-safe, wired into guards.txt and both workflows`);
