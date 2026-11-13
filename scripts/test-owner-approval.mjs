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
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findOwnerApproval, decideOwnerApproval, isOwnerOnly, protectedFingerprint, OWNERS, OWNER_LOGINS } from "./lib/ownerApproval.mjs";

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
const gitBlobSha1 = (buf) => createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");
const git = (cwd, args, env = {}) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }).trim();

// ── 1. Pure rules (no git, no network) ─────────────────────────────────────
{
  const head = "a".repeat(40);
  const owner = { type: "User", login: OWNER_LOGIN, id: OWNER_ID };
  ok(findOwnerApproval([{ id: 1, ...T, user: owner, body: `/owner-approve ${head}` }], head)?.id === 1, "owner comment naming the full head sha approves");
  ok(findOwnerApproval([{ id: 2, ...T, user: { ...owner, login: OWNER_LOGIN.toUpperCase() }, body: `/owner-approve ${head}` }], head)?.id === 2, "logins compare case-insensitively");
  ok(findOwnerApproval([{ id: 3, ...T, user: owner, body: `lgtm\n/owner-approve ${head.toUpperCase()}\nthanks` }], head)?.id === 3, "the command may sit on its own line inside a longer comment");
  ok(findOwnerApproval([{ id: 4, ...T, user: owner, body: `/owner-approve ${head.slice(0, 12)}` }], head) === null && findOwnerApproval([{ id: 4, ...T, user: owner, body: `/owner-approve ${head.slice(0, 39)}` }], head) === null,
    "a prefix never approves, only the full 40-character sha (a short prefix can be ground)");
  ok(findOwnerApproval([{ id: 5, ...T, user: owner, body: `/owner-approve ${"b".repeat(12)}` }], head) === null, "a different commit never approves");
  ok(findOwnerApproval([{ id: 6, ...T, user: owner, body: `please /owner-approve ${head.slice(0, 12)}` }], head) === null, "a mid-line mention is not the command");
  ok(findOwnerApproval([{ id: 7, ...T, user: { type: "User", login: "someone-else", id: 1 }, body: `/owner-approve ${head}` }], head) === null, "a non-owner login never approves");
  ok(findOwnerApproval([{ id: 8, ...T, user: { type: "Bot", login: OWNER_LOGIN, id: OWNER_ID }, body: `/owner-approve ${head}` }], head) === null, "a bot account never approves");
  ok(findOwnerApproval([{ id: 9, ...T, user: { type: "User", login: OWNER_LOGIN, id: OWNER_ID + 1 } , body: `/owner-approve ${head}` }], head) === null
    && findOwnerApproval([{ id: 9, ...T, user: { type: "User", login: OWNER_LOGIN }, body: `/owner-approve ${head}` }], head) === null,
    "the owner's login on a different (or missing) account id never approves: a re-registered login is not the owner");
  ok(findOwnerApproval([{ id: 9, ...T, user: owner, body: `/owner-approve ${head}` }], "not-a-sha") === null, "no valid head, no approval");
  ok(findOwnerApproval([{ id: 10, created_at: T.created_at, updated_at: "2026-09-24T00:05:00Z", user: owner, body: `/owner-approve ${head}` }], head) === null
    && findOwnerApproval([{ id: 11, user: owner, body: `/owner-approve ${head}` }], head) === null,
    "an EDITED comment never approves (anyone with write access can edit it), nor one without timestamps");
  ok(findOwnerApproval(null, head) === null && findOwnerApproval([null, { body: 1 }], head) === null, "malformed comment lists never approve or throw");
  ok(isOwnerOnly("CLAUDE.md") && isOwnerOnly("AGENTS.md") && isOwnerOnly("docs/card-standard.md") && isOwnerOnly("scripts/check-doc-ownership.mjs")
    && isOwnerOnly("scripts/lib/ownerApproval.mjs") && isOwnerOnly(".github/workflows/guards.yml") && isOwnerOnly(".github/workflows/owner-approval.yml")
    && isOwnerOnly("scripts/check-owner-approval-pr.mjs") && isOwnerOnly("scripts/lib/githubPullEvidence.mjs") && isOwnerOnly("scripts/test-owner-approval.mjs")
    && isOwnerOnly("claude.md") && isOwnerOnly("Agents.MD") && isOwnerOnly("docs/x-Standard.md")
    && isOwnerOnly(".github/workflows/canary.yml") && isOwnerOnly(".github/workflows/new-workflow.yml")
    && !isOwnerOnly("docs/history/x.md") && !isOwnerOnly("lib/x.js") && !isOwnerOnly("docs/github/x.md"),
  "owner-only set covers the rule files, the gates' own code and everything under .github/, case-insensitively, nothing else");
  const base = { changedPaths: ["CLAUDE.md"], mergeGate: true, pr: { number: 7, eventHeadSha: head, liveHeadSha: head }, comments: [], error: null };
  ok(decideOwnerApproval({ ...base, changedPaths: ["lib/x.js"] }).ok, "decision: ordinary change passes");
  ok(!decideOwnerApproval({ ...base, mergeGate: false, comments: [{ id: 1, ...T, user: owner, body: `/owner-approve ${head}` }] }).ok, "decision: off the merge gate even a real approval is not accepted");
  ok(!decideOwnerApproval({ ...base, error: "boom" }).ok && !decideOwnerApproval({ ...base, pr: null }).ok, "decision: missing evidence fails closed");
  ok(!decideOwnerApproval({ ...base, pr: { number: 7, eventHeadSha: head, liveHeadSha: "c".repeat(40) }, comments: [{ id: 1, ...T, user: owner, body: `/owner-approve ${"c".repeat(40)}` }] }).ok, "decision: a head that moved after the run started fails");
  ok(decideOwnerApproval({ ...base, comments: [{ id: 1, ...T, user: owner, body: `/owner-approve ${head}` }] }).ok, "decision: owner approval of the exact head passes");
  ok(decideOwnerApproval({ ...base, comments: [] }).reason.includes(`/owner-approve ${head}"`), "decision: the refusal prints the full sha to paste");
}

// ── 2. The real guard, in real git repositories, with a stub GitHub API ────
const root = mkdtempSync(join(tmpdir(), "wf-owner-approval-"));
try {
  const origin = join(root, "origin");
  mkdirSync(origin);
  git(origin, ["init", "-q", "-b", "main"]);
  writeFileSync(join(origin, "CLAUDE.md"), "# rules\n\nkeep this\n");
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
    return { ok: true, status: 200, json: async () => ({ head: { sha }, base: { ref: "main" }, changed_files: cfg.changedFiles ?? (cfg.files || []).length }) };
  }
  // Protected-content evidence via git trees (2026-11-13): merge base is c…c.
  // Tree sha = "<ref>~<dir as base64url>"; each listing shows every known path's
  // child in that dir. Blob per path from cfg.blobs ({ path: { base, head, baseMode, headMode } }),
  // default base 1111…, head 2222…, mode 100644; null = absent.
  if (/\\/compare\\//.test(path)) return { ok: true, status: 200, json: async () => ({ merge_base_commit: { sha: "c".repeat(40) } }) };
  const gc = path.match(/\\/git\\/commits\\/([^/]+)$/);
  if (gc) return { ok: true, status: 200, json: async () => ({ tree: { sha: gc[1] + "~" } }) };
  const gt = path.match(/\\/git\\/trees\\/([^/]+)$/);
  if (gt) {
    const [ref, enc] = decodeURIComponent(gt[1]).split("~");
    const dir = enc ? Buffer.from(enc, "base64url").toString() : "";
    const known = new Set(["CLAUDE.md", "AGENTS.md", "scripts/check-doc-ownership.mjs", "scripts/lib/ownerApproval.mjs", "scripts/owner-approval-gate.mjs", ".github/workflows/fake-owner-approval.yml", ".github/workflows/owner-approval-gate.yml", ...Object.keys(cfg.blobs || {}), ...(cfg.files || []).flatMap((f) => [f.filename, f.previous_filename].filter(Boolean))]);
    const entries = new Map();
    for (const p of known) {
      if (dir && !p.startsWith(dir + "/")) continue;
      const rest = dir ? p.slice(dir.length + 1) : p;
      const [first, ...more] = rest.split("/");
      if (more.length) { entries.set(first, { path: first, type: "tree", mode: "040000", sha: ref + "~" + Buffer.from(dir ? dir + "/" + first : first).toString("base64url") }); continue; }
      const b = (cfg.blobs || {})[p] || {};
      const isBase = ref === "c".repeat(40);
      const sha = isBase ? ("base" in b ? b.base : "1".repeat(40)) : ("head" in b ? b.head : "2".repeat(40));
      if (sha === null) continue;
      entries.set(first, { path: first, type: (isBase ? b.baseType : b.headType) || "blob", mode: (isBase ? b.baseMode : b.headMode) || "100644", sha });
    }
    return { ok: true, status: 200, json: async () => ({ tree: [...entries.values()], truncated: false }) };
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

  let runN = 0;
  const run = ({ dir, script = GUARD, gate = false, event = "pull_request", eventHead, liveHead, liveHeadLater, comments = [], status = 200, token = "fixture-token", eventFile = true, files, changedFiles, pageSize, blobs }) => {
    const tag = ++runN;
    const log = join(root, `calls-${tag}.log`);
    writeFileSync(log, "");
    const cfgPath = join(root, `stub-${tag}.json`);
    writeFileSync(cfgPath, JSON.stringify({ liveHead, liveHeadLater, comments, status, files, changedFiles, pageSize, blobs }));
    const eventPath = join(root, `event-${tag}.json`);
    if (eventFile) writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 1478, head: { sha: eventHead } } }));
    const env = { ...process.env, GITHUB_ACTIONS: gate ? "true" : "", STUB_CONFIG: cfgPath, STUB_LOG: log };
    for (const k of ["GITHUB_TOKEN", "GITHUB_EVENT_NAME", "GITHUB_EVENT_PATH", "GITHUB_REPOSITORY", "GITHUB_API_URL"]) delete env[k];
    if (gate) Object.assign(env, { GITHUB_EVENT_NAME: event, GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.fixture.invalid" });
    if (gate && token) env.GITHUB_TOKEN = token;
    let code = 0, out = "";
    try { out = execFileSync(process.execPath, ["--import", preload, script], { cwd: dir, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { code = e.status ?? 1; out = `${e.stdout || ""}${e.stderr || ""}`; }
    return { code, out, calls: readFileSync(log, "utf8").split("\n").filter(Boolean) };
  };
  const approve = (sha, login = OWNER_LOGIN, type = "User", prefix = "") => ({ id: 100 + runN, ...T, user: { login, type, id: login === OWNER_LOGIN ? OWNER_ID : 4242 }, body: `${prefix}/owner-approve ${sha}` });

  // A. no owner-only change -> pass, locally and on the gate, with no API call.
  const plain = branch([["lib/thing.js", "export const a = 1;\n"]]);
  let r = run({ dir: plain.dir });
  ok(r.code === 0 && /OK/.test(r.out), `A local: ordinary change passes (${r.code}: ${r.out.trim()})`);
  r = run({ dir: plain.dir, gate: true, eventHead: plain.head, liveHead: plain.head });
  ok(r.code === 0 && r.calls.length === 0, `A gate: ordinary change passes without touching the API (${r.code}, ${r.calls.length} calls)`);

  // B. owner-only change, no approval -> fail.
  const edit = branch([["CLAUDE.md", "# rules\n\nkeep this\nnew rule\n"]]);
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, comments: [] });
  const FP_EDIT = protectedFingerprint(1478, [{ path: "CLAUDE.md", base: "1".repeat(40), head: "2".repeat(40) }]);
  ok(r.code === 1 && /no owner approval for this protected content/.test(r.out) && r.out.includes(`/owner-approve ${FP_EDIT}`), `B: unapproved CLAUDE.md change fails and names the exact command (${r.code}: ${r.out.trim()})`);

  // C. forged owner author/committer -> still fail, every way.
  const forged = branch([["CLAUDE.md", "# rules\n\nkeep this\nforged rule\n"]], FORGED_OWNER);
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

  // Self-protection and renames: the gate's own files are owner-only; moving CLAUDE.md is a change.
  const self = branch([["scripts/check-doc-ownership.mjs", "console.log('check-doc-ownership: OK');\n"]]);
  r = run({ dir: self.dir, gate: true, eventHead: self.head, liveHead: self.head, comments: [] });
  ok(r.code === 1 && /scripts\/check-doc-ownership\.mjs/.test(r.out), `self-protection: editing the guard itself needs owner approval (${r.code})`);
  const moved = branch([["CLAUDE.md", null], ["docs/CLAUDE-old.md", "# rules\n\nkeep this\n"]]);
  r = run({ dir: moved.dir, gate: true, eventHead: moved.head, liveHead: moved.head, comments: [] });
  ok(r.code === 1 && /CLAUDE\.md/.test(r.out), `a rename away from CLAUDE.md is still an owner-only change (${r.code})`);

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
  r = pr({ files: [file("CLAUDE.md")] });
  const FP = (o = {}) => protectedFingerprint(o.number || 1478, o.entries || [{ path: "CLAUDE.md", base: "1".repeat(40), head: "2".repeat(40) }]);
  ok(r.code === 1 && r.out.includes(`/owner-approve ${FP()}`) && !r.out.includes(`/owner-approve ${H}`), `P B: unapproved CLAUDE.md change fails and names the fingerprint command (${r.code}: ${r.out.trim()})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(H)] });
  ok(r.code === 0 && new RegExp(`approved by @${OWNER_LOGIN}`).test(r.out), `P D: owner approval of the exact head passes (${r.code}: ${r.out.trim()})`);
  const filler = Array.from({ length: 100 }, (_, i) => ({ id: i + 1, ...T, user: { login: "someone", type: "User", id: 7 }, body: "noise" }));
  r = pr({ files: [file("CLAUDE.md")], comments: [...filler, approve(H)], pageSize: 100 });
  ok(r.code === 0 && r.calls.some((c) => /\/issues\/1478\/comments\?per_page=100&page=2/.test(c)), `P D: an approval on the second page of comments is found (pagination read) (${r.code})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(H, "wayfind-agent"), approve(H, OWNER_LOGIN, "Bot")] });
  ok(r.code === 1, `P C: non-owner and bot approvals are refused (${r.code})`);
  r = pr({ files: [file("scripts/lib/ownerApproval.mjs"), file("scripts/check-doc-ownership.mjs"), file("CLAUDE.md")] });
  ok(r.code === 1 && /scripts\/lib\/ownerApproval\.mjs/.test(r.out) && /scripts\/check-doc-ownership\.mjs/.test(r.out), `P tamper: a PR that rewrites the guard is judged by the base rule and refused (${r.code})`);
  r = pr({ files: [file("docs/CLAUDE-old.md", "CLAUDE.md")] });
  ok(r.code === 1 && /CLAUDE\.md/.test(r.out), `P rename: moving CLAUDE.md away counts as an owner-only change (${r.code})`);
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
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(H)], liveHeadLater: "e".repeat(40) });
  ok(r.code === 1 && /moved/.test(r.out), `P D: an approval does not survive a push landing mid-read (${r.code})`);
  r = pr({ files: [file("lib/thing.js")], eventHead: "e".repeat(40) });
  ok(r.code === 1 && /moved/.test(r.out), `P D: a run for an older head refuses (${r.code})`);

  // FP. Content-fingerprint approval (2026-11-13): approve protected CONTENT once.
  const H2 = "9".repeat(40);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(FP())] });
  ok(r.code === 0 && /approved by @.* for protected content/.test(r.out), `FP: owner "/owner-approve <fingerprint>" passes (${r.code}: ${r.out.trim()})`);
  r = pr({ files: [file("CLAUDE.md"), file("lib/other.js")], eventHead: H2, liveHead: H2, comments: [approve(FP())] });
  ok(r.code === 0, `FP survive: same protected content on a new head (rebase, merge of main, unrelated app change) keeps the approval (${r.code}: ${r.out.trim()})`);
  r = pr({ files: [file("CLAUDE.md")], eventHead: H2, liveHead: H2, comments: [approve(H)] });
  ok(r.code === 1, `FP legacy: a head-sha approval still dies on a new head (${r.code})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(FP())], blobs: { "CLAUDE.md": { base: "1".repeat(40), head: "3".repeat(40) } } });
  ok(r.code === 1 && r.out.includes(`/owner-approve ${FP({ entries: [{ path: "CLAUDE.md", base: "1".repeat(40), head: "3".repeat(40) }] })}`), `FP invalidate: changed protected content needs a new approval (${r.code})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(FP())], blobs: { "CLAUDE.md": { base: "4".repeat(40), head: "2".repeat(40) } } });
  ok(r.code === 1, `FP invalidate: main changing the same protected file (new merge-base blob) needs a new approval (${r.code})`);
  r = pr({ files: [file("CLAUDE.md"), file("AGENTS.md")], comments: [approve(FP())] });
  ok(r.code === 1, `FP invalidate: adding another protected file needs a new approval (${r.code})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(FP())], blobs: { "CLAUDE.md": { base: "1".repeat(40), head: null } } });
  ok(r.code === 1, `FP invalidate: deleting the protected file needs a new approval (${r.code})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(FP({ number: 1479 }))] });
  ok(r.code === 1, `FP scope: a fingerprint approved on another pull request does not carry over (${r.code})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(FP(), "wayfind-agent"), approve(FP(), OWNER_LOGIN, "Bot"), { ...approve(FP()), updated_at: "2026-09-25T00:00:00Z" }] });
  ok(r.code === 1, `FP forged: non-owner, bot and edited fingerprint approvals are refused (${r.code})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(FP().slice(0, 40))] });
  ok(r.code === 1, `FP prefix: a 40-hex prefix of the fingerprint is not an approval (${r.code})`);
  r = run({ dir: edit.dir, gate: true, eventHead: edit.head, liveHead: edit.head, comments: [approve(FP_EDIT)] });
  ok(r.code === 0, `FP guards: check-doc-ownership (the guards check) accepts the same fingerprint (${r.code}: ${r.out.trim()})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(FP())], blobs: { "CLAUDE.md": { base: "1".repeat(40), head: "2".repeat(40), headMode: "120000" } } });
  ok(r.code === 1 && /symlinks and submodules cannot carry owner approval/.test(r.out), `FP symlink: an approved file swapped for a symlink (same target blob) fails closed (${r.code}: ${r.out.trim()})`);
  r = pr({ files: [file("CLAUDE.md")], comments: [approve(FP())], blobs: { "CLAUDE.md": { base: "1".repeat(40), head: "2".repeat(40), headMode: "100755" } } });
  ok(r.code === 1, `FP mode: making a protected file executable is a protected change that needs a new approval (${r.code})`);
  ok(protectedFingerprint(1478, []) === null && protectedFingerprint(1478, [{ path: "CLAUDE.md", base: "x", head: null }]) === null
    && protectedFingerprint(1478, [{ path: "CLAUDE.md", base: null, head: null }]) === null, "FP pure: malformed or empty evidence yields no fingerprint (never a pass)");
  ok(protectedFingerprint(1478, [{ path: "A", base: null, head: "2".repeat(40) }, { path: "B", base: "1".repeat(40), head: null }])
    === protectedFingerprint(1478, [{ path: "B", base: "1".repeat(40), head: null }, { path: "A", base: null, head: "2".repeat(40) }]), "FP pure: order of evidence does not matter");

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
  // Sharded gate (2026-11-13): the required "guards" job is an aggregator that is
  // green only when all four shards, rendered/audit and build succeeded.
  const wfCode = wf.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  ok(/shard:\s*\[1, 2, 3, 4\]/.test(wfCode) && /GUARD_SHARD:\s*\$\{\{\s*matrix\.shard\s*\}\}\/4/.test(wfCode)
    && /^  guards:\n    name: guards\n    if: always\(\)\n    needs: \[shard, rendered, build\]/m.test(wfCode)
    && /test "\$SHARD" = "success" && test "\$RENDERED" = "success" && test "\$BUILD" = "success"/.test(wfCode),
    "guards: four GUARD_SHARD jobs + rendered + build, and the required 'guards' job fails unless every part succeeded");
  // Merge queue code runs from main with a write token: it and everything it
  // imports from this repository must be owner-only (2026-11-13 review, C1).
  const queueFiles = ["scripts/merge-queue.mjs", "scripts/lib/mergeQueue.mjs", "scripts/test-merge-queue.mjs"];
  const queueImports = [];
  for (const f of ["scripts/merge-queue.mjs", "scripts/lib/mergeQueue.mjs"]) {
    const src = readFileSync(join(REPO, f), "utf8");
    for (const m of src.matchAll(/^\s*import\s[^;]*?from\s+"(\.{1,2}\/[^"]+)"/gm)) queueImports.push(join(f, "..", m[1]).replace(/\\/g, "/"));
  }
  ok(queueImports.length >= 3 && [...queueFiles, ...queueImports].every(isOwnerOnly),
    `merge queue code and its ${queueImports.length} local imports are owner-only (${[...new Set(queueImports)].join(", ")})`);
  // Merge queue (2026-11-13): holds a write token, so it must never run PR code.
  const mq = readFileSync(join(REPO, ".github", "workflows", "merge-queue.yml"), "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const mqUses = [...mq.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]);
  ok(/^\s*pull_request_target:\n\s*types: \[labeled\]/m.test(mq) && !/^\s*pull_request:/m.test(mq) && /ref:\s*main\s*$/m.test(mq) && /persist-credentials:\s*false/.test(mq)
    && !/github\.event\.pull_request\.head/.test(mq) && !/\b(npm|npx|yarn|pnpm)\b/.test(mq) && /run:\s*node scripts\/merge-queue\.mjs\s*$/m.test(mq)
    && mqUses.length === 2 && mqUses.every((u) => /@[0-9a-f]{40}$/.test(u)),
    `merge-queue checks out main only, runs only scripts/merge-queue.mjs, installs nothing and pins its actions (${mqUses.join(", ")})`);
  const mqExpr = [...mq.matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1].trim());
  ok(mqExpr.every((e) => e === "github.token") && /cancel-in-progress:\s*false/.test(mq) && /group:\s*merge-queue\s*$/m.test(mq),
    `merge-queue: no event text reaches a shell (only ${JSON.stringify([...new Set(mqExpr)])}) and one drainer is never cancelled mid-merge`);
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

const EXPECTED = 84;
if (checks !== EXPECTED) {
  console.error(`test-owner-approval: FAIL — ran ${checks} assertions, expected exactly ${EXPECTED}; a proof was skipped or added without review.`);
  process.exit(1);
}
console.log(`test-owner-approval: OK — ${checks} assertions: forged owner author refused locally and on the merge gate, authenticated head-bound owner approval accepted, fail-closed without GitHub context, ordinary changes unaffected, pre-fix guard red-proved (blob ${PRE_FIX_BLOB.slice(0, 12)}), the owner-approval check applies the base branch's rule and is pull_request_target-safe, wired into guards.txt and both workflows`);
