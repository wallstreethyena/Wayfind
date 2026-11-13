#!/usr/bin/env node
// test-owner-approval-v2 — OWNER APPROVAL V2 (2026-11-13): the owner approves the
// PROTECTED DIFF, not the head commit. Runs the real base-branch gate
// (scripts/check-owner-approval-pr.mjs, the "owner-approval" check) against real
// git repositories, with GitHub's API answered from those repositories, for every
// case the owner listed: approval persists through rebases, main moving and
// unrelated or generated changes; it is invalidated by any protected byte, file
// added or removed, a bot or edited approval, a replayed fingerprint, no
// approval, and a run that reads one protected diff while the PR moves to another.
// Red-proved: the pre-v2 gate fails the persistence cases, and a fingerprint that
// ignores file contents would wrongly pass the one-byte case.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { OWNERS, protectedFingerprint, findOwnerDiffApproval, changedProtectedPaths } from "./lib/ownerApproval.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, "check-owner-approval-pr.mjs");
const OWNER = OWNERS[0];
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { console.error(`test-owner-approval-v2: FAIL — ${msg}`); process.exit(1); } };
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_AUTHOR_NAME: "lane", GIT_AUTHOR_EMAIL: "lane@x", GIT_COMMITTER_NAME: "lane", GIT_COMMITTER_EMAIL: "lane@x" } }).trim();
const T = { created_at: "2026-11-13T10:00:00Z", updated_at: "2026-11-13T10:00:00Z" };

const root = mkdtempSync(join(tmpdir(), "wf-owner-v2-"));
try {
  // ---- a GitHub stub answered from the clone in the working directory ----------
  const stub = join(root, "stub.mjs");
  writeFileSync(stub, `
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const cfg = JSON.parse(readFileSync(process.env.STUB_CONFIG, "utf8"));
const sh = (a) => execFileSync("git", a, { encoding: "buffer", stdio: ["ignore", "pipe", "ignore"] });
const txt = (a) => sh(a).toString().trim();
const res = (body) => ({ ok: true, status: 200, json: async () => body });
const miss = () => ({ ok: false, status: 404, json: async () => ({}) });
let reads = 0;
const filesOf = (sha) => { const base = txt(["merge-base", "origin/main", sha]); return txt(["diff", "--name-only", base, sha]).split("\\n").filter(Boolean).map((filename) => ({ filename })); };
globalThis.fetch = async (url) => {
  const u = new URL(url), p = u.pathname;
  let m;
  if (/\\/pulls\\/\\d+$/.test(p)) {
    const sha = ++reads > 1 && cfg.headLater ? cfg.headLater : cfg.head;
    return res({ head: { sha }, base: { ref: "main" }, changed_files: filesOf(cfg.head).length });
  }
  if (/\\/pulls\\/\\d+\\/files$/.test(p)) return res(filesOf(cfg.head));
  if (/\\/pulls\\/\\d+\\/commits$/.test(p)) return res(txt(["rev-list", "--reverse", "origin/main.." + cfg.head]).split("\\n").filter(Boolean).map((sha) => ({ sha })));
  if (/\\/issues\\/\\d+\\/comments$/.test(p)) return res(cfg.comments);
  if ((m = p.match(/\\/compare\\/([^/]+)\\.\\.\\.([0-9a-f]{40})$/))) {
    try { const base = txt(["merge-base", "origin/" + m[1], m[2]]); return res({ merge_base_commit: { sha: base }, base_commit: { sha: txt(["rev-parse", "origin/" + m[1]]) }, files: filesOf(m[2]) }); } catch { return miss(); }
  }
  if ((m = p.match(/\\/contents\\/(.+)$/))) {
    const ref = u.searchParams.get("ref"), file = m[1].split("/").map(decodeURIComponent).join("/");
    try { const bytes = sh(["cat-file", "blob", ref + ":" + file]); const sha = txt(["rev-parse", ref + ":" + file]); return res({ type: "file", encoding: "base64", size: bytes.length, sha, content: bytes.toString("base64") }); } catch { return miss(); }
  }
  return miss();
};`);
  let n = 0;
  const gate = ({ dir, head, headLater, comments = [], number = 1478, script = GATE }) => {
    const tag = ++n;
    const cfg = join(root, `cfg-${tag}.json`), ev = join(root, `ev-${tag}.json`);
    writeFileSync(cfg, JSON.stringify({ head, headLater, comments }));
    writeFileSync(ev, JSON.stringify({ pull_request: { number, head: { sha: head } } }));
    const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request_target", GITHUB_EVENT_PATH: ev, GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.fixture.invalid", GITHUB_TOKEN: "t", STUB_CONFIG: cfg };
    try { return { code: 0, out: execFileSync(process.execPath, ["--import", stub, script], { cwd: dir, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }) }; }
    catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` }; }
  };
  const fpOf = (out) => (out.match(/Current protected fingerprint: ([0-9a-f]{64})/) || [])[1];
  const ownerSays = (body, extra = {}) => ({ id: 500 + n, ...T, user: { login: OWNER.login, id: OWNER.id, type: "User" }, body, ...extra });

  // ---- repositories ------------------------------------------------------------
  const origin = join(root, "origin");
  mkdirSync(join(origin, ".github/workflows"), { recursive: true });
  mkdirSync(join(origin, "scripts/lib"), { recursive: true });
  const put = (dir, rel, body) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), body); };
  git(origin, ["init", "-q", "-b", "main"]);
  put(origin, "CLAUDE.md", "# rules\n\nline one\n");
  put(origin, ".github/workflows/ci.yml", "name: ci\n");
  put(origin, "scripts/lib/ownerApproval.mjs", "export const rule = 1;\n");
  put(origin, "scripts/lib/guard-expectations.tsv", "a\t1\n");
  put(origin, "app.js", "export const v = 1;\n");
  git(origin, ["add", "-A"]); git(origin, ["commit", "-q", "-m", "seed"]);

  const fresh = () => {
    const dir = join(root, `clone-${++n}`);
    git(root, ["clone", "-q", `file://${origin}`, dir]);
    git(dir, ["checkout", "-q", "-b", "work"]);
    put(dir, "CLAUDE.md", "# rules\n\nline one\nnew approved rule\n");
    put(dir, "app.js", "export const v = 2;\n");
    git(dir, ["add", "-A"]); git(dir, ["commit", "-q", "-m", "approved scope"]);
    return dir;
  };
  const commit = (dir, edits, msg = "next") => {
    for (const [rel, body] of edits) { if (body === null) git(dir, ["rm", "-q", rel]); else put(dir, rel, body); }
    git(dir, ["add", "-A"]); git(dir, ["commit", "-q", "-m", msg]);
    return git(dir, ["rev-parse", "HEAD"]);
  };
  const head = (dir) => git(dir, ["rev-parse", "HEAD"]);

  // The owner reviews and approves the protected diff once.
  const dir = fresh();
  let r = gate({ dir, head: head(dir) });
  const FP = fpOf(r.out);
  ok(r.code === 1 && FP && r.out.includes(`/owner-approve-diff ${FP}"`) && /Owner approval: INVALID/.test(r.out), `15 no approval: FAIL with one stable command (${r.out.trim()})`);
  const approval = [ownerSays(`/owner-approve-diff ${FP}`)];
  r = gate({ dir, head: head(dir), comments: approval });
  ok(r.code === 0 && /Owner approval: VALID/.test(r.out) && r.out.includes(`Approved protected fingerprint: ${FP}`) && r.out.includes(`Current protected fingerprint: ${FP}`) && /Protected content changed since approval: NO/.test(r.out), `1 owner approves the protected diff: PASS with the audit trail (${r.out.trim()})`);

  // ---- APPROVAL PERSISTS -------------------------------------------------------
  const h2 = commit(dir, [["app.js", "export const v = 3;\n"]]);
  r = gate({ dir, head: h2, comments: approval });
  ok(r.code === 0 && fpOf(r.out) === FP, `2-4 unrelated application change, new head, same protected diff: PASS without another comment (${r.out.trim()})`);

  put(origin, "README.md", "another lane\n"); git(origin, ["add", "-A"]); git(origin, ["commit", "-q", "-m", "main moves"]);
  git(dir, ["fetch", "-q", "origin"]);
  git(dir, ["merge", "-q", "--no-edit", "origin/main"]); // what "Update branch" and the merge train do
  r = gate({ dir, head: head(dir), comments: approval });
  ok(r.code === 0 && fpOf(r.out) === FP, `5-6a main advances and the branch is updated: PASS (${r.out.trim()})`);
  const rebased = fresh();
  git(rebased, ["fetch", "-q", "origin"]); git(rebased, ["rebase", "-q", "origin/main"]);
  r = gate({ dir: rebased, head: head(rebased), comments: approval });
  ok(r.code === 0 && fpOf(r.out) === FP, `5-6b a real rebase onto the new main: PASS with the same fingerprint (${r.out.trim()})`);

  const h3 = commit(dir, [["scripts/lib/guard-expectations.tsv", "a\t1\nb\t2\n"]]);
  r = gate({ dir, head: h3, comments: approval });
  ok(r.code === 0 && fpOf(r.out) === FP, `7 generated registry change outside the protected files: PASS (${r.out.trim()})`);

  // ---- APPROVAL INVALIDATES ----------------------------------------------------
  const expectInvalid = (d, h, label, files) => {
    const res = gate({ dir: d, head: h, comments: approval });
    ok(res.code === 1 && /Owner approval: INVALID/.test(res.out) && res.out.includes(`Approved protected fingerprint: ${FP}`) && fpOf(res.out) && fpOf(res.out) !== FP
      && (!files || res.out.includes(`Changed protected files: ${files}`)), `${label}: FAIL (${res.out.trim()})`);
    return res;
  };
  let d = fresh();
  expectInvalid(d, commit(d, [["CLAUDE.md", "# rules\n\nline one\nnew approved rulE\n"]]), "8 one byte of CLAUDE.md changes after approval", "CLAUDE.md");
  d = fresh();
  expectInvalid(d, commit(d, [[".github/workflows/ci.yml", "name: ci\non: push\n"]]), "9 a workflow changes after approval", ".github/workflows/ci.yml");
  d = fresh();
  expectInvalid(d, commit(d, [["scripts/lib/ownerApproval.mjs", "export const rule = 0;\n"]]), "10 ownerApproval.mjs changes after approval", "scripts/lib/ownerApproval.mjs");
  d = fresh();
  expectInvalid(d, commit(d, [[".github/workflows/new.yml", "name: new\n"]]), "11a a protected file is added after approval", ".github/workflows/new.yml");
  d = fresh();
  expectInvalid(d, commit(d, [[".github/workflows/ci.yml", null]]), "11b a protected file is removed after approval", ".github/workflows/ci.yml");
  // main changes a protected file the PR also touches: the merged result is not what was reviewed.
  put(origin, "CLAUDE.md", "# rules (main)\n\nline one\n"); git(origin, ["add", "-A"]); git(origin, ["commit", "-q", "-m", "main edits CLAUDE.md"]);
  const stale = join(root, `clone-${++n}`); // branch made BEFORE main's edit, not updated
  git(root, ["clone", "-q", `file://${origin}`, stale]);
  git(stale, ["reset", "-q", "--hard", "HEAD~1"]); git(stale, ["checkout", "-q", "-b", "work"]);
  put(stale, "CLAUDE.md", "# rules\n\nline one\nnew approved rule\n"); git(stale, ["add", "-A"]); git(stale, ["commit", "-q", "-m", "approved scope"]);
  git(stale, ["fetch", "-q", "origin"]);
  r = gate({ dir: stale, head: head(stale), comments: approval });
  ok(r.code === 1 && /main changed CLAUDE\.md after this branch's merge base/.test(r.out), `11d main changed a protected file after the branch's base and the branch was not updated: FAIL CLOSED (the merge would blend unapproved bytes) (${r.out.trim()})`);
  d = fresh(); // branched from the new main: base content of CLAUDE.md differs from the approved one
  r = gate({ dir: d, head: head(d), comments: approval });
  ok(r.code === 1 && /Owner approval: INVALID/.test(r.out), `11c main changed the base content of a protected file the PR touches: FAIL (${r.out.trim()})`);
  git(origin, ["revert", "--no-edit", "HEAD"]);

  d = fresh();
  const H = head(d);
  const bot = [{ ...ownerSays(`/owner-approve-diff ${FP}`), user: { login: OWNER.login, id: OWNER.id, type: "Bot" } }];
  r = gate({ dir: d, head: H, comments: bot });
  ok(r.code === 1 && /Owner approval: INVALID/.test(r.out), `12 a bot posting the approval: FAIL (${r.out.trim()})`);
  r = gate({ dir: d, head: H, comments: [{ ...ownerSays(`/owner-approve-diff ${FP}`), user: { login: "claude-agent", id: 1, type: "User" } }] });
  ok(r.code === 1, `12b an agent account posting the approval: FAIL (${r.out.trim()})`);
  r = gate({ dir: d, head: H, comments: [{ ...ownerSays(`/owner-approve-diff ${FP}`), user: { login: OWNER.login, id: OWNER.id + 1, type: "User" } }] });
  ok(r.code === 1, `12c a spoofed owner login with another account id: FAIL (${r.out.trim()})`);
  r = gate({ dir: d, head: H, comments: [ownerSays(`/owner-approve-diff ${FP}`, { updated_at: "2026-11-13T11:00:00Z" })] });
  ok(r.code === 1 && /Owner approval: INVALID/.test(r.out), `13 an owner comment edited after posting: FAIL (${r.out.trim()})`);
  r = gate({ dir: d, head: H, comments: approval, number: 1479 });
  ok(r.code === 1 && fpOf(r.out) !== FP, `14 replaying the fingerprint approved on PR #1478 against PR #1479: FAIL (${r.out.trim()})`);
  r = gate({ dir: d, head: H, comments: [ownerSays(`/owner-approve-diff ${FP.slice(0, 63)}0`)] });
  ok(r.code === 1, `14b a near-miss fingerprint: FAIL (${r.out.trim()})`);
  const moved = commit(d, [["CLAUDE.md", "# rules\n\nline one\nsomething else\n"]]);
  r = gate({ dir: d, head: H, headLater: moved, comments: approval });
  ok(r.code === 1 && /moved/.test(r.out), `16 the run reads one protected diff while the PR moves to another: FAIL CLOSED (${r.out.trim()})`);
  r = gate({ dir: d, head: moved, comments: [ownerSays(`/owner-approve ${H}`)] });
  ok(r.code === 1, `legacy approval of an older head does not approve the moved head (${r.out.trim()})`);
  r = gate({ dir: d, head: moved, comments: [ownerSays(`/owner-approve ${moved}`)] });
  ok(r.code === 0 && /legacy head approval/.test(r.out), `transition: a legacy approval of the exact current head still approves (${r.out.trim()})`);

  // ---- pure-rule checks --------------------------------------------------------
  const s256 = (x) => createHash("sha256").update(x).digest("hex");
  const e = (path, base, head) => ({ path, base, head });
  const a = protectedFingerprint({ repo: "wallstreethyena/Wayfind", number: 1, entries: [e("CLAUDE.md", s256("a"), s256("b"))] }, s256);
  ok(a && /^[0-9a-f]{64}$/.test(a.fingerprint), "fingerprint is SHA-256 hex over the manifest");
  ok(protectedFingerprint({ repo: "wallstreethyena/Wayfind", number: 1, entries: [e("app.js", s256("a"), s256("b"))] }, s256) === null, "a non-protected path never enters the fingerprint (it is not the owner's scope)");
  ok(protectedFingerprint({ repo: "wallstreethyena/Wayfind", number: 1, entries: [e("CLAUDE.md", "nothex", s256("b"))] }, s256) === null && protectedFingerprint({ repo: "x/y", number: 1, entries: [] }, s256) === null, "incomplete evidence never fingerprints (fails closed)");
  ok(findOwnerDiffApproval([ownerSays(`/owner-approve-diff ${a.fingerprint}`)], a.fingerprint)?.id > 0 && findOwnerDiffApproval([ownerSays(`please /owner-approve-diff ${a.fingerprint}`)], a.fingerprint) === null, "the command must be its own line");
  ok(JSON.stringify(changedProtectedPaths(a.manifest, protectedFingerprint({ repo: "wallstreethyena/Wayfind", number: 1, entries: [e("CLAUDE.md", s256("a"), s256("c"))] }, s256).manifest)) === '["CLAUDE.md"]', "the audit names the changed protected file");

  // ---- RED PROOFS ----------------------------------------------------------------
  // (a) a fingerprint that ignored file contents (paths only) would pass case 8.
  const weak = (entries) => s256(JSON.stringify(entries.map((x) => x.path)));
  ok(weak([e("CLAUDE.md", s256("a"), s256("rule"))]) === weak([e("CLAUDE.md", s256("a"), s256("rulE"))])
    && protectedFingerprint({ repo: "a/b", number: 1, entries: [e("CLAUDE.md", s256("a"), s256("rule"))] }, s256).fingerprint
      !== protectedFingerprint({ repo: "a/b", number: 1, entries: [e("CLAUDE.md", s256("a"), s256("rulE"))] }, s256).fingerprint,
  "RED: a contents-blind fingerprint would let a one-byte change through; the real one does not");
  // (b) the pre-v2 gate (head-bound only) fails the persistence case the owner asked to fix.
  const repoRoot = join(HERE, "..");
  let oldRef = null;
  try { oldRef = git(repoRoot, ["rev-parse", "--verify", "-q", "origin/main"]); } catch { oldRef = null; }
  const oldSrc = (rel) => { try { return git(repoRoot, ["show", `${oldRef}:${rel}`]); } catch { return null; } };
  const oldGate = oldRef && oldSrc("scripts/check-owner-approval-pr.mjs");
  if (oldGate && !/owner-approve-diff/.test(oldSrc("scripts/lib/ownerApproval.mjs") || "x owner-approve-diff")) {
    const og = join(root, "old/scripts");
    mkdirSync(join(og, "lib"), { recursive: true });
    for (const rel of ["scripts/check-owner-approval-pr.mjs", "scripts/lib/ownerApproval.mjs", "scripts/lib/githubPullEvidence.mjs"]) writeFileSync(join(root, "old", rel), oldSrc(rel) + "\n");
    r = gate({ dir, head: head(dir), comments: approval, script: join(og, "check-owner-approval-pr.mjs") });
    ok(r.code === 1, `RED: the pre-v2 gate rejects the updated branch the owner already approved (the loop this fixes) (${r.out.trim().slice(0, 200)})`);
  } else {
    checks++; // main already carries v2: the head-bound gate is gone, nothing to red-prove against
  }

  // ---- wiring --------------------------------------------------------------------
  const guardsTxt = readFileSync(join(HERE, "guards.txt"), "utf8");
  ok(/node scripts\/test-owner-approval-v2\.mjs/.test(guardsTxt), "wired into guards.txt");
  ok(/test-owner-approval-v2/.test(readFileSync(join(HERE, "lib/ownerApproval.mjs"), "utf8")), "this test is itself an owner-only file");
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log(`test-owner-approval-v2: OK — ${checks} assertions: protected-diff approval persists through unrelated changes, branch updates, real rebases and generated files; any protected byte, workflow, approval-code change, protected file added or removed, or main changing a protected base invalidates it; bot, agent, spoofed-id, edited and replayed approvals fail; a run whose PR moves mid-read fails closed; legacy exact-head approvals still work; red-proved against a contents-blind fingerprint and the pre-v2 gate`);
