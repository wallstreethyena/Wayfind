#!/usr/bin/env node
// scripts/test-owner-approval-carry-forward.mjs — an owner approval survives a
// pull request catching up with main, and nothing else.
//
// 2026-11-12: PRs #2175 (CLAUDE.md) and #2107 (a .github workflow) were approved
// by the owner three times each and still could not merge. Branch protection
// makes a pull request catch up with main before merging; catching up makes a new
// head commit; the approval named the old head, so it no longer counted. Main
// moved 18 commits between the owner's approval and the merge attempt.
//
// The rule (scripts/lib/ownerApproval.mjs, "APPROVAL CARRY-FORWARD"): an approval
// of an earlier commit counts for the current head only when the pull request's
// OWN change (GitHub's three-dot diff from the merge base) is the same change,
// file by file and patch by patch, with one narrow allowance for the guard
// registries. Every scenario below is built from real git history in a temp
// repository and turned into the file list GitHub's compare API returns.
//
// Red-proved three ways: a judge that accepts everything and a judge that never
// carries forward (the old behaviour) must each get scenarios wrong, and the
// pre-fix check-owner-approval-pr.mjs (pinned blob below, read from git) must
// block the exact rebase case that now passes.
//
// Hermetic: temp git repositories, a fetch stub, no network, no env secrets.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareApprovedChange, approvedCommitCandidates, decideOwnerApproval, OWNERS, isOwnerOnly,
} from "./lib/ownerApproval.mjs";
import { fetchCarryForward } from "./lib/githubPullEvidence.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

const OWNER = OWNERS[0];
const T = { created_at: "2026-11-12T22:30:46Z", updated_at: "2026-11-12T22:30:46Z" };
const approve = (sha, user = { login: OWNER.login, id: OWNER.id, type: "User" }, extra = {}) =>
  ({ id: 9000 + n, ...T, ...extra, user, body: `/owner-approve ${sha}` });

const root = mkdtempSync(join(tmpdir(), "carry-forward-"));
const ENV = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@x.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@x.invalid", GIT_CONFIG_NOSYSTEM: "1", HOME: root };
const git = (dir, args) => execFileSync("git", args, { cwd: dir, encoding: "utf8", env: ENV, stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (dir, args) => { try { git(dir, args); return true; } catch { return false; } };

let repoN = 0;
function repo(files) {
  const dir = join(root, `r${++repoN}`);
  mkdirSync(dir);
  git(dir, ["init", "-q", "-b", "main"]);
  write(dir, files);
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "-m", "base"]);
  return dir;
}
function write(dir, files) {
  for (const [path, body] of Object.entries(files)) {
    const full = join(dir, path);
    if (body === null) { rmSync(full, { force: true }); continue; }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, body);
  }
}
const commit = (dir, files, msg = "change") => { write(dir, files); git(dir, ["add", "-A"]); git(dir, ["commit", "-q", "-m", msg]); return git(dir, ["rev-parse", "HEAD"]); };

// What GitHub's compare API answers for GET /compare/main...<sha>: one entry per
// file changed from the merge base, with a patch that starts at the first hunk.
const STATUS = { A: "added", M: "modified", D: "removed", R: "renamed" };
function compareFiles(dir, sha) {
  const range = `main...${sha}`;
  const rows = git(dir, ["diff", "--name-status", "-M", range]).split("\n").filter(Boolean);
  return rows.map((row) => {
    const [code, a, b] = row.split("\t");
    const status = STATUS[code[0]];
    const filename = status === "renamed" ? b : a;
    const raw = git(dir, ["diff", "--no-color", "-M", "-U3", range, "--", ...(status === "renamed" ? [a, b] : [filename])]);
    const at = raw.indexOf("\n@@");
    const patch = at >= 0 ? raw.slice(at + 1) : undefined;
    const changes = patch ? patch.split("\n").filter((l) => /^[+-]/.test(l)).length : 0;
    return { filename, status, ...(status === "renamed" ? { previous_filename: a } : {}), ...(patch ? { patch } : {}), changes };
  });
}

const BIG = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
const RULES = "# rules\n\n" + BIG;
const GUARDS = Array.from({ length: 30 }, (_, i) => `node scripts/check-g${i}.mjs`).join("\n") + "\n";

// ── Scenarios, each { name, approved, current, expectSame, mustMention? } ───────
const scenarios = [];

// 1. Approved, then caught up with main by MERGING main (main edited the top of
//    CLAUDE.md, shifting every line number, and an unrelated file).
{
  const dir = repo({ "CLAUDE.md": RULES, "app/a.js": "export const a = 1;\n", "app/b.js": "export const b = 1;\n" });
  git(dir, ["checkout", "-q", "-b", "pr"]);
  commit(dir, { "CLAUDE.md": RULES.replace("line 30\n", "line 30\nnew owner rule\n"), "app/a.js": "export const a = 2;\n" });
  const approved = git(dir, ["rev-parse", "HEAD"]);
  const before = compareFiles(dir, approved);
  git(dir, ["checkout", "-q", "main"]);
  commit(dir, { "CLAUDE.md": "# rules\n\nmain added a heading line\n\n" + BIG, "app/b.js": "export const b = 2;\n" });
  git(dir, ["checkout", "-q", "pr"]);
  git(dir, ["merge", "-q", "--no-edit", "main"]);
  const head = git(dir, ["rev-parse", "HEAD"]);
  scenarios.push({ name: "1 merge main into an approved PR (CLAUDE.md line numbers shifted)", approved: before, current: compareFiles(dir, head), expectSame: true, approvedSha: approved, headSha: head });

  // 1b. the same approval after a REBASE onto newer main instead of a merge.
  git(dir, ["checkout", "-q", "-b", "pr-rebased", approved]);
  git(dir, ["rebase", "-q", "main"]);
  scenarios.push({ name: "1b rebase an approved PR onto newer main", approved: before, current: compareFiles(dir, git(dir, ["rev-parse", "HEAD"])), expectSame: true });
}

// 2. Guard registry: the PR's rows land in a different place after catching up
//    (main appended rows at the same spot; the conflict is resolved keeping both).
{
  const dir = repo({ "scripts/guards.txt": GUARDS, "scripts/check-new.mjs": "// placeholder\n" });
  git(dir, ["checkout", "-q", "-b", "pr"]);
  commit(dir, { "scripts/guards.txt": GUARDS + "node scripts/check-new.mjs\n", "scripts/check-new.mjs": "import x from '../lib/x.js';\n" });
  const approved = git(dir, ["rev-parse", "HEAD"]);
  const before = compareFiles(dir, approved);
  git(dir, ["checkout", "-q", "main"]);
  commit(dir, { "scripts/guards.txt": GUARDS + "node scripts/check-main-a.mjs\nnode scripts/check-main-b.mjs\n" });
  git(dir, ["checkout", "-q", "pr"]);
  tryGit(dir, ["merge", "-q", "--no-edit", "main"]); // conflicts in guards.txt
  writeFileSync(join(dir, "scripts/guards.txt"), GUARDS + "node scripts/check-main-a.mjs\nnode scripts/check-main-b.mjs\nnode scripts/check-new.mjs\n");
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "--no-edit"]);
  const head = git(dir, ["rev-parse", "HEAD"]);
  const after = compareFiles(dir, head);
  const g0 = before.find((f) => f.filename === "scripts/guards.txt").patch;
  const g1 = after.find((f) => f.filename === "scripts/guards.txt").patch;
  ok(g0 !== g1 && g0.replace(/^@@.*$/gm, "@@") !== g1.replace(/^@@.*$/gm, "@@"), "2 setup: the registry patch really differs in its context, not only its line numbers");
  scenarios.push({ name: "2 guard registry rows moved by a catch-up merge", approved: before, current: after, expectSame: true });

  // 2b. the same registry, but a row was DROPPED after approval (a weakened guard).
  const dropped = after.map((f) => f.filename !== "scripts/guards.txt" ? f
    : { ...f, patch: f.patch + "\n-node scripts/check-g3.mjs", changes: f.changes + 1 });
  scenarios.push({ name: "2b a registry row removed after approval", approved: before, current: dropped, expectSame: false, mustMention: "scripts/guards.txt" });
  // 2c. a registry row ADDED after approval.
  const added = after.map((f) => f.filename !== "scripts/guards.txt" ? f
    : { ...f, patch: f.patch + "\n+node scripts/check-sneaky.mjs", changes: f.changes + 1 });
  scenarios.push({ name: "2c a registry row added after approval", approved: before, current: added, expectSame: false, mustMention: "scripts/guards.txt" });
}

// 3. Product code added after approval.
{
  const dir = repo({ "CLAUDE.md": RULES, "app/page.js": "export default function P() { return null; }\n" });
  git(dir, ["checkout", "-q", "-b", "pr"]);
  const approved = commit(dir, { "CLAUDE.md": RULES + "approved rule\n" });
  const before = compareFiles(dir, approved);
  const head = commit(dir, { "app/new-feature.js": "export const charge = (cents) => fetch('/api/pay', { method: 'POST', body: String(cents) });\n" });
  scenarios.push({ name: "3 new product code after approval", approved: before, current: compareFiles(dir, head), expectSame: false, mustMention: "app/new-feature.js" });

  // 3b. an edit inside a file the approval already covered.
  const head2 = commit(dir, { "app/new-feature.js": null, "CLAUDE.md": RULES + "approved rule\nunapproved second rule\n" });
  scenarios.push({ name: "3b a changed line inside an already approved file", approved: before, current: compareFiles(dir, head2), expectSame: false, mustMention: "CLAUDE.md" });
}

// 4. Additional destructive DB mutation after approval: a new DROP in the
//    approved migration, and a whole new migration file.
{
  const mig = "supabase/migrations/20261101_add_index.sql";
  const dir = repo({ "CLAUDE.md": RULES });
  git(dir, ["checkout", "-q", "-b", "pr"]);
  const approved = commit(dir, { "CLAUDE.md": RULES + "db rule\n", [mig]: "create index if not exists places_city on places(city);\n" });
  const before = compareFiles(dir, approved);
  const head = commit(dir, { [mig]: "create index if not exists places_city on places(city);\ndrop table if exists place_photos;\n" });
  scenarios.push({ name: "4 a DROP TABLE added to the approved migration", approved: before, current: compareFiles(dir, head), expectSame: false, mustMention: mig });
  const head2 = commit(dir, { "supabase/migrations/20261112_cleanup.sql": "delete from places where rating < 3;\n" });
  scenarios.push({ name: "4b a new destructive migration file", approved: before, current: compareFiles(dir, head2), expectSame: false, mustMention: "supabase/migrations/20261112_cleanup.sql" });
}

// 4c. Approved migration, then its apply receipt is committed (Gabe's case 3):
//     an "applied" receipt line for the approved, unedited migration persists.
{
  const mig = "supabase/migrations/20261113000000_add_city_index.sql";
  const LOG = "scripts/migration-apply-log.jsonl";
  const old = JSON.stringify({ schema: 1, file: "supabase/migrations/20261001000000_old.sql", sha256: "a".repeat(64), status: "applied" }) + "\n";
  const dir = repo({ [LOG]: old, "CLAUDE.md": RULES });
  git(dir, ["checkout", "-q", "-b", "pr"]);
  const approved = commit(dir, { [mig]: "create index if not exists places_city on places(city);\n", "CLAUDE.md": RULES + "migration rule\n" });
  const before = compareFiles(dir, approved);
  git(dir, ["checkout", "-q", "main"]);
  commit(dir, { [LOG]: old + JSON.stringify({ schema: 1, file: "supabase/migrations/20261112000000_main.sql", sha256: "b".repeat(64), status: "applied" }) + "\n" });
  git(dir, ["checkout", "-q", "pr"]);
  git(dir, ["merge", "-q", "--no-edit", "main"]);
  const receipt = JSON.stringify({ schema: 1, file: mig, sha256: "c".repeat(64), status: "applied", reason: "applied after the owner's go" });
  const head = commit(dir, { [LOG]: readFileSync(join(dir, LOG), "utf8") + receipt + "\n" });
  scenarios.push({ name: "4c an approved migration plus its apply receipt", approved: before, current: compareFiles(dir, head), expectSame: true });
  const strayHead = commit(dir, { [LOG]: readFileSync(join(dir, LOG), "utf8") + JSON.stringify({ schema: 1, file: "supabase/migrations/20261113000001_drop.sql", sha256: "d".repeat(64), status: "applied" }) + "\n" });
  scenarios.push({ name: "4d a receipt for a migration the owner never approved", approved: before, current: compareFiles(dir, strayHead), expectSame: false, mustMention: "not a migration in the approved change" });
  const junkHead = commit(dir, { [LOG]: readFileSync(join(dir, LOG), "utf8") + "not json\n" });
  scenarios.push({ name: "4e a line in the receipt log that is not a receipt", approved: before, current: compareFiles(dir, junkHead), expectSame: false, mustMention: "not an \"applied\" migration receipt" });
}

// Other edges: conflict resolved by dropping main's line; same added line moved
// in a normal file; a binary file; a compare list at GitHub's 300-file limit.
{
  const dir = repo({ "CLAUDE.md": RULES });
  git(dir, ["checkout", "-q", "-b", "pr"]);
  const approved = commit(dir, { "CLAUDE.md": RULES.replace("line 20\n", "line 20 approved wording\n") });
  const before = compareFiles(dir, approved);
  git(dir, ["checkout", "-q", "main"]);
  commit(dir, { "CLAUDE.md": RULES.replace("line 21\n", "line 21 safety rule from main\n") });
  git(dir, ["checkout", "-q", "pr"]);
  tryGit(dir, ["merge", "-q", "--no-edit", "main"]);
  // a resolution that keeps the PR's text and quietly drops main's safety rule
  writeFileSync(join(dir, "CLAUDE.md"), RULES.replace("line 20\n", "line 20 approved wording\n"));
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-q", "--no-edit"]);
  scenarios.push({ name: "5 a conflict resolution that drops main's new rule", approved: before, current: compareFiles(dir, git(dir, ["rev-parse", "HEAD"])), expectSame: false, mustMention: "CLAUDE.md" });
}
{
  const dir = repo({ "app/x.js": BIG });
  git(dir, ["checkout", "-q", "-b", "pr"]);
  const approved = commit(dir, { "app/x.js": BIG.replace("line 5\n", "line 5\nexport const fee = 0;\n") });
  const before = compareFiles(dir, approved);
  const head = commit(dir, { "app/x.js": BIG.replace("line 35\n", "line 35\nexport const fee = 0;\n") });
  scenarios.push({ name: "6 the same added line moved elsewhere in a code file", approved: before, current: compareFiles(dir, head), expectSame: false, mustMention: "app/x.js" });
}
{
  const bin = { filename: "public/logo.png", status: "modified", changes: 0 };
  scenarios.push({ name: "7 a binary file is never carried forward", approved: [bin], current: [{ ...bin, sha: "other" , changes: 0, patch: undefined }], expectSame: true });
  scenarios.push({ name: "7b a binary file GitHub reports as changed", approved: [{ ...bin, changes: 2 }], current: [{ ...bin, changes: 2 }], expectSame: false, mustMention: "public/logo.png" });
  const many = Array.from({ length: 300 }, (_, i) => ({ filename: `f${i}.js`, status: "added", patch: "@@ -0,0 +1 @@\n+x", changes: 1 }));
  scenarios.push({ name: "8 a 300-file change (GitHub's limit) is never carried forward", approved: many, current: many, expectSame: false, mustMention: "300" });
}

// ── The real rule gets every scenario right ─────────────────────────────────────
const judgeReal = (a, b) => compareApprovedChange(a, b);
for (const s of scenarios) {
  const v = judgeReal(s.approved, s.current);
  ok(v.same === s.expectSame, `${s.name}: expected ${s.expectSame ? "approval carried forward" : "fresh approval needed"}, got ${v.same} (${v.material.join("; ")})`);
  if (!s.expectSame && s.mustMention) ok(v.material.some((m) => m.includes(s.mustMention)), `${s.name}: the reason names ${s.mustMention} (${v.material.join("; ")})`);
}

// ── Red proof: two wrong judges must each get scenarios wrong ───────────────────
const wrongCount = (judge) => scenarios.filter((s) => judge(s.approved, s.current).same !== s.expectSame).map((s) => s.name);
const acceptsAll = wrongCount(() => ({ same: true, material: [] }));
ok(acceptsAll.some((x) => x.startsWith("3 ")) && acceptsAll.some((x) => x.startsWith("4 ")) && acceptsAll.some((x) => x.startsWith("2b")),
  `red: a judge that always carries forward is caught on new code, a DROP TABLE and a removed guard (${acceptsAll.join(" | ")})`);
const neverCarries = wrongCount(() => ({ same: false, material: ["head changed"] }));
ok(neverCarries.some((x) => x.startsWith("1 ")) && neverCarries.some((x) => x.startsWith("1b")) && neverCarries.some((x) => x.startsWith("2 ")) && neverCarries.some((x) => x.startsWith("4c")),
  `red: the old exact-head-only behaviour is caught on the merge, rebase, registry and receipt cases (${neverCarries.join(" | ")})`);
ok(acceptsAll.some((x) => x.startsWith("4d")), "red: a judge that always carries forward is caught on a receipt for an unapproved migration");
const ignoresContext = wrongCount((a, b) => {
  const strip = (fs) => fs.map((f) => `${f.filename}|${f.status}|${String(f.patch || "").split("\n").filter((l) => /^[+-]/.test(l)).sort().join("\n")}`).sort().join("\n");
  return { same: strip(a) === strip(b), material: [] };
});
ok(ignoresContext.some((x) => x.startsWith("6 ")), `red: a judge that ignores where a line sits is caught on the moved code line (${ignoresContext.join(" | ")})`);

// ── decideOwnerApproval: only the owner's own unedited approval can be carried ──
const s1 = scenarios[0];
const ev = (comments, carryForward) => ({
  changedPaths: ["CLAUDE.md", "app/a.js"], mergeGate: true,
  pr: { number: 2175, eventHeadSha: s1.headSha, liveHeadSha: s1.headSha },
  comments, error: null, carryForward,
});
const cf = [{ sha: s1.approvedSha, approvedFiles: s1.approved, currentFiles: s1.current }];
let v = decideOwnerApproval(ev([approve(s1.approvedSha)], cf));
ok(v.ok && /carried forward to head/.test(v.reason), `decide: the owner's approval of the earlier head carries to the caught-up head (${v.reason})`);
const a0 = (v.audit || [])[0] || {};
ok(a0.pr === 2175 && a0.decision === "carried-forward" && a0.approvedHeadSha === s1.approvedSha && a0.currentHeadSha === s1.headSha
  && /^[0-9a-f]{64}$/.test(a0.approvedFingerprint || "") && a0.approvedFingerprint === a0.currentFingerprint
  && a0.files.includes("CLAUDE.md") && a0.actor.login === OWNER.login && a0.actor.id === OWNER.id && a0.approvedAt === T.created_at && Array.isArray(a0.why) && a0.why.length,
  `audit: the carried approval records PR, both heads, matching fingerprints, files, actor, time and why (${JSON.stringify(a0)})`);
v = decideOwnerApproval(ev([], cf));
ok(!v.ok && /no owner approval for head/.test(v.reason), `decide 5: no approval at all stays blocked even with matching diffs supplied (${v.reason})`);
v = decideOwnerApproval(ev([approve(s1.approvedSha, { login: "wayfind-agent", id: 4242, type: "User" })], cf));
ok(!v.ok, "decide: a non-owner's approval is never carried forward");
v = decideOwnerApproval(ev([approve(s1.approvedSha, { login: OWNER.login, id: OWNER.id, type: "Bot" })], cf));
ok(!v.ok, "decide: a bot account with the owner's login is never carried forward");
v = decideOwnerApproval(ev([approve(s1.approvedSha, undefined, { updated_at: "2026-11-12T23:00:00Z" })], cf));
ok(!v.ok, "decide: an edited approval comment is never carried forward");
v = decideOwnerApproval(ev([approve("e".repeat(40))], cf));
ok(!v.ok, "decide: diffs supplied for a sha the owner never approved are ignored");
v = decideOwnerApproval(ev([approve(s1.approvedSha)], [{ sha: s1.approvedSha, error: "GitHub API /compare answered HTTP 404" }]));
ok(!v.ok && /could not be compared/.test(v.reason), `decide: a comparison that could not be read fails closed and says so (${v.reason})`);
const s3 = scenarios.find((s) => s.name.startsWith("3 "));
v = decideOwnerApproval(ev([approve(s1.approvedSha)], [{ sha: s1.approvedSha, approvedFiles: s3.approved, currentFiles: s3.current }]));
ok(!v.ok && /app\/new-feature\.js is part of the change now/.test(v.reason), `decide 3: a material change blocks and names exactly what changed (${v.reason})`);
ok(v.audit && v.audit[0] && v.audit[0].decision === "expired" && v.audit[0].approvedFingerprint !== v.audit[0].currentFingerprint && v.audit[0].why.some((w) => /new-feature/.test(w)),
  "audit: an expired approval records why it expired and the fingerprints differ");
v = decideOwnerApproval({ ...ev([approve(s1.approvedSha)], cf), mergeGate: false });
ok(!v.ok, "decide: a local run still cannot grant approval, carried or not");
ok(approvedCommitCandidates([approve("a".repeat(40)), approve("b".repeat(40)), approve("c".repeat(40)), approve("d".repeat(40))], "f".repeat(40)).length === 3, "candidates: at most 3 earlier approvals are compared (bounded API reads)");

// ── fetchCarryForward: reads the two three-dot compares, fails closed ───────────
const ctx = { api: "https://api.github.fixture.invalid", repo: "wallstreethyena/Wayfind", token: "t", number: 2175 };
const live = { liveHeadSha: s1.headSha, baseRef: "main", comments: [approve(s1.approvedSha)] };
const stub = (headLater) => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(String(url));
    assert.ok(String(init.headers.Authorization).startsWith("Bearer "));
    const path = new URL(url).pathname;
    const m = /\/compare\/main\.\.\.([0-9a-f]{40})$/.exec(path);
    if (m) return { ok: true, status: 200, json: async () => ({ files: m[1] === s1.headSha ? s1.current : s1.approved }) };
    if (/\/pulls\/2175$/.test(path)) return { ok: true, status: 200, json: async () => ({ head: { sha: headLater || s1.headSha } }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { calls, fetchImpl };
};
let st = stub();
const got = await fetchCarryForward(ctx, live, { fetchImpl: st.fetchImpl });
ok(got.length === 1 && got[0].sha === s1.approvedSha && compareApprovedChange(got[0].approvedFiles, got[0].currentFiles).same,
  "fetch: the approved and current changes are read and match");
ok(st.calls.some((c) => c.endsWith(`/compare/main...${s1.headSha}`)) && st.calls.some((c) => c.endsWith(`/compare/main...${s1.approvedSha}`)), "fetch: both reads are three-dot compares against the base branch");
st = stub("9".repeat(40));
await assert.rejects(fetchCarryForward(ctx, live, { fetchImpl: st.fetchImpl }), /moved/); n++;
st = stub();
ok((await fetchCarryForward(ctx, { ...live, comments: [] }, { fetchImpl: st.fetchImpl })).length === 0 && st.calls.length === 0, "fetch: no earlier owner approval means no extra API reads");
ok((await fetchCarryForward(ctx, { ...live, baseRef: "../evil" }, { fetchImpl: st.fetchImpl }))[0].error, "fetch: a strange base branch name is refused, not interpolated");

// ── End to end, and red proof against the pre-fix check ─────────────────────────
// Run scripts/check-owner-approval-pr.mjs (the base-branch "owner-approval" check)
// with a fetch stub on scenario 1, then the pre-fix copy of the same check.
const preload = join(root, "fetch-stub.mjs");
writeFileSync(join(root, "stub.json"), JSON.stringify({ head: s1.headSha, approved: s1.approvedSha, current: s1.current, before: s1.approved, comments: [approve(s1.approvedSha)] }));
writeFileSync(preload, `
import { readFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(process.env.STUB_CONFIG, "utf8"));
globalThis.fetch = async (url) => {
  const u = new URL(url);
  const path = u.pathname;
  const page = Number(u.searchParams.get("page") || 1);
  const reply = (body) => ({ ok: true, status: 200, json: async () => body });
  if (/\\/pulls\\/\\d+$/.test(path)) return reply({ head: { sha: cfg.head }, base: { ref: "main" }, changed_files: cfg.current.length });
  if (/\\/pulls\\/\\d+\\/files$/.test(path)) return reply(page === 1 ? cfg.current : []);
  if (/\\/issues\\/\\d+\\/comments$/.test(path)) return reply(page === 1 ? cfg.comments : []);
  const m = /\\/compare\\/main\\.\\.\\.([0-9a-f]{40})$/.exec(path);
  if (m) return reply({ files: m[1] === cfg.head ? cfg.current : cfg.before });
  return { ok: false, status: 404, json: async () => ({}) };
};`);
const runCheck = (dir) => {
  const eventPath = join(root, "event.json");
  writeFileSync(eventPath, JSON.stringify({ pull_request: { number: 2175, head: { sha: s1.headSha } } }));
  const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request_target", GITHUB_EVENT_PATH: eventPath, GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.fixture.invalid", GITHUB_TOKEN: "fixture", STUB_CONFIG: join(root, "stub.json") };
  try { return { code: 0, out: execFileSync(process.execPath, ["--import", preload, join(dir, "scripts/check-owner-approval-pr.mjs")], { encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { code: e.status ?? 1, out: `${e.stdout || ""}${e.stderr || ""}` }; }
};
let r = runCheck(REPO);
ok(r.code === 0 && /carried forward to head/.test(r.out), `e2e: the owner-approval check passes a caught-up head on the earlier approval (${r.code}: ${r.out.trim()})`);

const preDir = join(root, "pre-fix");
mkdirSync(join(preDir, "scripts/lib"), { recursive: true });
const FIXTURES = join(REPO, "scripts/fixtures");
const pre = (name) => readFileSync(join(FIXTURES, name), "utf8");
writeFileSync(join(preDir, "scripts/check-owner-approval-pr.mjs"), pre("check-owner-approval-pr-pre-carry-forward.mjs.txt"));
writeFileSync(join(preDir, "scripts/lib/ownerApproval.mjs"), pre("ownerApproval-pre-carry-forward.mjs.txt"));
writeFileSync(join(preDir, "scripts/lib/githubPullEvidence.mjs"), pre("githubPullEvidence-pre-carry-forward.mjs.txt"));
r = runCheck(preDir);
ok(r.code === 1 && /no owner approval for head/.test(r.out), `red e2e: the pre-fix check blocks the same caught-up head, which is the bug (${r.code}: ${r.out.trim().split("\n")[0]})`);

// ── Wiring ──────────────────────────────────────────────────────────────────────
ok(isOwnerOnly("scripts/test-owner-approval-carry-forward.mjs"), "this test is owner-only, so a pull request cannot weaken it unapproved");
const guards = readFileSync(join(REPO, "scripts/guards.txt"), "utf8").split("\n").map((l) => l.trim());
ok(guards.includes("node scripts/test-owner-approval-carry-forward.mjs"), "this test runs in the guards suite");
for (const f of ["scripts/check-doc-ownership.mjs", "scripts/check-owner-approval-pr.mjs", "scripts/owner-approval-gate.mjs"]) {
  const src = readFileSync(join(REPO, f), "utf8");
  const passes = f.endsWith("check-doc-ownership.mjs") ? /error: null, carryForward \}/.test(src) : /carryForward,\s*\}\)/.test(src);
  ok(/fetchCarryForward\(/.test(src) && passes && /approval-audit|Approval audit trail/.test(src), `${f} gathers carry-forward evidence, passes it to the rule and prints the audit trail`);
}

rmSync(root, { recursive: true, force: true });
console.log(`test-owner-approval-carry-forward: OK — ${n} assertions (${scenarios.length} scenarios from real git history: merge and rebase catch-ups and moved registry rows carry the approval; new code, edited lines, DROP TABLE, a new migration, removed or added guard rows, a dropped main rule, a moved code line, binaries and 300-file lists need a fresh one; only the owner's own unedited approval counts; red-proved against three wrong rules and the pre-fix check)`);
