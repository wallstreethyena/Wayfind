#!/usr/bin/env node
/**
 * test-owner-approval-v2 — Owner Approval V2 (owner directive, 2026-11-13).
 *
 * The owner approves protected content with a normal GitHub review (Review
 * changes → Approve), never with a pasted "/owner-approve <sha>" command. The
 * approval stays valid while the protected content it approved is byte for byte
 * the same, so rebases, main moving and unrelated code never cost a new
 * approval; any change to protected bytes does.
 *
 * Runs the REAL base-branch check (scripts/check-owner-approval-pr.mjs) in real
 * git repositories, with the GitHub REST API answered by a stub that reads the
 * same repositories (git trees, merge bases, pull request files), and proves the
 * owner's 16 cases plus the edges:
 *
 *   VALID     1-4 rebase onto a new main, head sha changes, protected diff same -> PASS
 *             5-6 unrelated app code added after approval                       -> PASS
 *             7   migration receipt / generated registry added                  -> PASS
 *   INVALID   8   one byte changed in CLAUDE.md                                 -> FAIL
 *             9   a .github/** file changed                                     -> FAIL
 *             10  the owner-approval code itself changed                        -> FAIL
 *             11  a protected file added, or one removed                         -> FAIL
 *             12  a bot submits APPROVED                                        -> FAIL
 *             13  a non-owner user submits APPROVED                             -> FAIL
 *             14  the owner approved a different protected fingerprint          -> FAIL
 *             15  stale run: head differs from the event, or moves mid-read     -> FAIL CLOSED
 *             16  no owner review                                               -> FAIL
 *   EDGES     a later "Request changes" withdraws; a dismissed approval does not
 *             count; a comment-only review neither grants nor withdraws; the owner
 *             re-approving the new content passes; main changing a protected file
 *             the branch also changes needs a fresh review; the legacy comment is
 *             still read; refusals never ask for a pasted command.
 *
 * Plus the pure fingerprint rules, the owner-only roots invariant the tree reader
 * relies on, the re-check script (re-runs only the live head's failed gate runs,
 * decides nothing) and the two new workflows' safety, and wiring into guards.txt.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OWNERS, OWNER_ONLY, OWNER_ONLY_DIRS, isOwnerOnly, latestOwnerReview, protectedDiff, protectedFingerprint, decideOwnerApproval } from "./lib/ownerApproval.mjs";

const REPO = process.cwd();
const PR_CHECK = join(REPO, "scripts", "check-owner-approval-pr.mjs");
const RECHECK = join(REPO, "scripts", "owner-approval-recheck.mjs");
const OWNER = { type: "User", login: OWNERS[0].login, id: OWNERS[0].id };
const LANE = { GIT_AUTHOR_NAME: "lane", GIT_AUTHOR_EMAIL: "lane@example.com", GIT_COMMITTER_NAME: "lane", GIT_COMMITTER_EMAIL: "lane@example.com" };

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks += 1; };
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...LANE }, stdio: ["ignore", "pipe", "pipe"] }).trim();

// ── 1. Pure rules ──────────────────────────────────────────────────────────
{
  const e = (sha, mode = "100644") => ({ mode, type: "blob", sha });
  const rowsA = protectedDiff({ "CLAUDE.md": e("1".repeat(40)), "lib/x.js": e("2".repeat(40)) }, { "CLAUDE.md": e("3".repeat(40)), "lib/x.js": e("4".repeat(40)) });
  ok(rowsA.length === 1 && rowsA[0][0] === "CLAUDE.md", "fingerprint: only owner-only paths are part of the protected diff");
  const fpA = protectedFingerprint(rowsA);
  ok(/^[0-9a-f]{64}$/.test(fpA), "fingerprint: a sha256 hex digest");
  const reordered = protectedDiff({ "lib/y.js": e("9".repeat(40)), "CLAUDE.md": e("1".repeat(40)) }, { "CLAUDE.md": e("3".repeat(40)) });
  ok(protectedFingerprint(reordered) === fpA, "fingerprint: unrelated paths and key order never change it");
  ok(protectedFingerprint(protectedDiff({ "CLAUDE.md": e("1".repeat(40)) }, { "CLAUDE.md": e("5".repeat(40)) })) !== fpA, "fingerprint: different proposed bytes, different fingerprint");
  ok(protectedFingerprint(protectedDiff({ "CLAUDE.md": e("6".repeat(40)) }, { "CLAUDE.md": e("3".repeat(40)) })) !== fpA, "fingerprint: different base bytes, different fingerprint");
  ok(protectedDiff({ "CLAUDE.md": e("1".repeat(40)) }, { "CLAUDE.md": e("1".repeat(40), "100755") }).length === 1, "fingerprint: a mode change is a protected change");
  ok(protectedDiff({}, { "AGENTS.md": e("7".repeat(40)) })[0][1] === null && protectedDiff({ "AGENTS.md": e("7".repeat(40)) }, {})[0][2] === null, "fingerprint: added and removed protected files are recorded as absent on one side");
  ok(protectedDiff({ "CLAUDE.md": e("1".repeat(40)) }, { "CLAUDE.md": e("1".repeat(40)) }).length === 0, "fingerprint: identical bytes are no change");

  const r = (id, state, at, user = OWNER, commit = "a".repeat(40)) => ({ id, state, submitted_at: at, commit_id: commit, user });
  ok(latestOwnerReview([r(1, "APPROVED", "2026-11-13T01:00:00Z")])?.id === 1, "review: the owner's approval is found");
  ok(latestOwnerReview([r(1, "APPROVED", "2026-11-13T01:00:00Z"), r(2, "CHANGES_REQUESTED", "2026-11-13T02:00:00Z")])?.state === "CHANGES_REQUESTED", "review: a later Request changes is the latest decisive review");
  ok(latestOwnerReview([r(1, "APPROVED", "2026-11-13T01:00:00Z"), r(2, "COMMENTED", "2026-11-13T02:00:00Z")])?.id === 1, "review: a comment-only review neither grants nor withdraws");
  ok(latestOwnerReview([r(1, "DISMISSED", "2026-11-13T01:00:00Z")])?.state === "DISMISSED", "review: a dismissed review is decisive and approves nothing");
  ok(latestOwnerReview([r(1, "APPROVED", "2026-11-13T01:00:00Z"), r(2, "DISMISSED", "2026-11-13T02:00:00Z")])?.state === "DISMISSED", "review: dismissing the owner's later Request changes never revives the older approval");
  ok(latestOwnerReview([r(1, "APPROVED", "2026-11-13T01:00:00Z", { ...OWNER, type: "Bot" })]) === null, "review: a bot carrying the owner's login and id never counts");
  ok(latestOwnerReview([r(1, "APPROVED", "2026-11-13T01:00:00Z", { type: "User", login: "someone", id: 4242 })]) === null, "review: another user never counts");
  ok(latestOwnerReview([r(1, "APPROVED", "2026-11-13T01:00:00Z", { ...OWNER, id: OWNER.id + 1 })]) === null, "review: the owner's login on another account id never counts");
  ok(latestOwnerReview([r(1, "APPROVED", "2026-11-13T01:00:00Z", OWNER, "abc")]) === null && latestOwnerReview([{ ...r(1, "APPROVED", ""), submitted_at: "" }]) === null, "review: no full commit sha or no timestamp, no approval");
  ok(latestOwnerReview(null) === null && latestOwnerReview([null, 1, {}]) === null, "review: malformed lists never approve or throw");

  // The tree reader walks only the root and OWNER_ONLY_DIRS; every pattern must live there.
  const dirsLc = new Set(OWNER_ONLY_DIRS.map((d) => d.toLowerCase()));
  const escaped = OWNER_ONLY.filter((rx) => {
    const src = rx.source.replace(/^\^/, "");
    const lastSlash = src.lastIndexOf("\\/");
    const dir = lastSlash < 0 ? "" : src.slice(0, lastSlash).replace(/\\\./g, ".").replace(/\\\//g, "/").toLowerCase();
    return dir !== "" && !dirsLc.has(dir) && !(dir === ".github");
  });
  ok(escaped.length === 0 && OWNER_ONLY.every((rx) => rx.source.startsWith("^") && rx.flags.includes("i")), `roots: every owner-only pattern is anchored, case-insensitive and inside the walked directories (${escaped.map(String).join(", ") || "none escape"})`);
  ok(isOwnerOnly("scripts/owner-approval-recheck.mjs") && isOwnerOnly("scripts/test-owner-approval-v2.mjs") && isOwnerOnly(".github/workflows/owner-review-observed.yml"), "roots: the V2 re-check script, this test and the new workflows are owner-only");

  const base = { changedPaths: ["CLAUDE.md"], mergeGate: true, pr: { number: 9, eventHeadSha: "b".repeat(40), liveHeadSha: "b".repeat(40) }, comments: [], baseChangedAt: [], error: null };
  const fp = (x) => ({ fingerprint: x.repeat(64), paths: ["CLAUDE.md"], behindBy: 0 });
  ok(!decideOwnerApproval({ ...base, reviews: [r(1, "APPROVED", "2026-11-13T01:00:00Z")], fingerprints: { ["b".repeat(40)]: fp("c") } }).ok, "decision: a missing fingerprint for the reviewed commit fails closed");
  ok(!decideOwnerApproval({ ...base, reviews: [r(1, "APPROVED", "2026-11-13T01:00:00Z")], fingerprints: { ["b".repeat(40)]: fp("c"), ["a".repeat(40)]: { fingerprint: "zz" } } }).ok, "decision: a malformed fingerprint fails closed");
  const appr = [r(1, "APPROVED", "2026-11-13T01:00:00Z")];
  ok(decideOwnerApproval({ ...base, reviews: appr, fingerprints: { ["b".repeat(40)]: fp("c"), ["a".repeat(40)]: fp("c") } }).ok, "decision: control, same fingerprint over the same protected paths passes");
  ok(!decideOwnerApproval({ ...base, changedPaths: ["CLAUDE.md", "AGENTS.md"], reviews: appr, fingerprints: { ["b".repeat(40)]: fp("c"), ["a".repeat(40)]: fp("c") } }).ok, "decision: a changed protected path missing from the fingerprint fails closed (a tree-walk miss can never ride on an old approval)");
  const same = { ["b".repeat(40)]: fp("c"), ["a".repeat(40)]: fp("c") };
  ok(!decideOwnerApproval({ ...base, baseChangedAt: null, reviews: appr, fingerprints: same }).ok, "decision: unreadable base-branch history fails closed");
  ok(!decideOwnerApproval({ ...base, reviews: appr, fingerprints: { ...same, ["b".repeat(40)]: { ...fp("c"), behindBy: null } } }).ok, "decision: an unknown behind-count fails closed");
}

// ── 2. The real base-branch check, in real git, with a git-backed API stub ──
const root = mkdtempSync(join(tmpdir(), "wf-owner-v2-"));
try {
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, ["init", "-q", "-b", "main"]);
  const put = (rel, body) => { mkdirSync(join(repo, rel.split("/").slice(0, -1).join("/") || "."), { recursive: true }); writeFileSync(join(repo, rel), body); };
  const commit = (msg) => { git(repo, ["add", "-A"]); git(repo, ["commit", "-q", "-m", msg]); return git(repo, ["rev-parse", "HEAD"]); };
  put("CLAUDE.md", "# rules\n\nrule one\n");
  put("README.md", "hello\n");
  put("lib/app.js", "export const a = 1;\n");
  put("scripts/lib/ownerApproval.mjs", "export const rule = 1;\n");
  put(".github/workflows/ci.yml", "name: ci\n");
  commit("seed");

  git(repo, ["checkout", "-q", "-b", "work"]);
  put("CLAUDE.md", "# rules\n\nrule one\nrule two (protected diff A)\n");
  const c1 = commit("protected change A");

  // main moves with unrelated work; the branch rebases (a new head sha, same protected diff)
  git(repo, ["checkout", "-q", "main"]);
  put("lib/other.js", "export const other = 1;\n");
  commit("unrelated main work");
  git(repo, ["checkout", "-q", "work"]);
  git(repo, ["rebase", "-q", "main"]);
  const c1r = git(repo, ["rev-parse", "HEAD"]);
  put("lib/app.js", "export const a = 2;\n");
  const c2 = commit("unrelated app change after approval");
  put("scripts/migration-apply-log.jsonl", "{\"file\":\"x\"}\n");
  put("scripts/lib/guard-expectations.tsv", "x\t1\n");
  const c3 = commit("migration receipt and generated registry");
  const variant = (name, fn) => { git(repo, ["checkout", "-q", "-b", name, c3]); fn(); const h = commit(name); git(repo, ["checkout", "-q", "work"]); return h; };
  const c4 = variant("byte", () => put("CLAUDE.md", "# rules\n\nrule one\nrule two (protected diff A)!\n"));
  const cGh = variant("gh", () => put(".github/workflows/ci.yml", "name: ci2\n"));
  const cGate = variant("gate", () => put("scripts/lib/ownerApproval.mjs", "export const rule = 2;\n"));
  const cAdd = variant("add", () => put("AGENTS.md", "# agents\n"));
  const cRm = variant("rm", () => rmSync(join(repo, ".github/workflows/ci.yml")));
  // main itself changes CLAUDE.md, and the branch is rebased onto it: the protected base changed
  git(repo, ["checkout", "-q", "-b", "main2", "main"]);
  put("CLAUDE.md", "# rules\n\nrule one (edited on main)\n");
  commit("main edits CLAUDE.md");
  git(repo, ["checkout", "-q", "-b", "onmain2", c3]);
  git(repo, ["rebase", "-q", "-X", "theirs", "main2"]);
  const cBase = git(repo, ["rev-parse", "HEAD"]);
  git(repo, ["checkout", "-q", "work"]);
  ok(c1r !== c1, "setup: the rebase really changed the head sha");

  const preload = join(root, "stub.mjs");
  writeFileSync(preload, `
import { readFileSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
const cfg = JSON.parse(readFileSync(process.env.STUB_CONFIG, "utf8"));
const g = (args) => execFileSync("git", args, { cwd: cfg.repo, encoding: "utf8" }).trim();
let pullReads = 0;
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
globalThis.fetch = async (url) => {
  appendFileSync(process.env.STUB_LOG, String(url) + "\\n");
  const u = new URL(url);
  const path = u.pathname.replace(/^\\/repos\\/[^/]+\\/[^/]+/, "");
  let m;
  if ((m = path.match(/^\\/pulls\\/\\d+$/))) {
    pullReads += 1;
    const head = cfg.liveHeadLater && pullReads > cfg.laterAfter ? cfg.liveHeadLater : cfg.liveHead;
    const base = g(["merge-base", cfg.baseRef, head]);
    const files = g(["diff", "--name-only", "--no-renames", base, head]).split("\\n").filter(Boolean);
    return reply(200, { head: { sha: head }, base: { ref: "main" }, changed_files: files.length, state: "open" });
  }
  if ((m = path.match(/^\\/pulls\\/\\d+\\/files$/))) {
    const base = g(["merge-base", cfg.baseRef, cfg.liveHead]);
    const files = g(["diff", "--name-only", "--no-renames", base, cfg.liveHead]).split("\\n").filter(Boolean);
    return reply(200, Number(u.searchParams.get("page") || 1) > 1 ? [] : files.map((filename) => ({ filename, status: "modified" })));
  }
  if (/^\\/pulls\\/\\d+\\/reviews$/.test(path)) return reply(200, Number(u.searchParams.get("page") || 1) > 1 ? [] : cfg.reviews);
  if (/^\\/issues\\/\\d+\\/events$/.test(path)) return reply(200, Number(u.searchParams.get("page") || 1) > 1 ? [] : cfg.events);
  if (/^\\/git\\/ref\\/heads\\/main$/.test(path)) return reply(200, { object: { sha: g(["rev-parse", cfg.baseRef]) } });
  if (/^\\/issues\\/\\d+\\/comments$/.test(path)) return reply(200, Number(u.searchParams.get("page") || 1) > 1 ? [] : cfg.comments);
  if ((m = path.match(/^\\/compare\\/([^/]+)\\.\\.\\.([0-9a-f]{40})$/))) {
    try { return reply(200, { merge_base_commit: { sha: g(["merge-base", cfg.baseRef, m[2]]) }, behind_by: Number(g(["rev-list", "--count", m[2] + ".." + cfg.baseRef])) }); } catch { return reply(404, {}); }
  }
  if ((m = path.match(/^\\/git\\/commits\\/([0-9a-f]{40})$/))) {
    try { return reply(200, { tree: { sha: g(["rev-parse", m[1] + "^{tree}"]) } }); } catch { return reply(404, {}); }
  }
  if ((m = path.match(/^\\/git\\/trees\\/([0-9a-f]{40})$/))) {
    const recursive = u.searchParams.get("recursive") === "1";
    const out = g(["ls-tree", ...(recursive ? ["-r", "-t"] : []), m[1]]);
    const tree = out ? out.split("\\n").map((line) => { const [meta, p] = line.split("\\t"); const [mode, type, sha] = meta.split(" "); return { path: p, mode, type, sha }; }) : [];
    return reply(200, { tree, truncated: false });
  }
  return reply(404, {});
};`);
  let n = 0;
  const run = ({ liveHead, eventHead = liveHead, reviews = [], comments = [], events = [], liveHeadLater = null, laterAfter = 1, baseRef = "main", attempt = "1", runSha = "" }) => {
    const tag = ++n;
    const cfg = join(root, `cfg-${tag}.json`), log = join(root, `log-${tag}.txt`), ev = join(root, `ev-${tag}.json`);
    writeFileSync(cfg, JSON.stringify({ repo, liveHead, reviews, comments, events, liveHeadLater, laterAfter, baseRef }));
    writeFileSync(log, "");
    writeFileSync(ev, JSON.stringify({ pull_request: { number: 2460, head: { sha: eventHead } } }));
    const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request_target", GITHUB_EVENT_PATH: ev, GITHUB_TOKEN: "fixture-token", GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.fixture.invalid", STUB_CONFIG: cfg, STUB_LOG: log, GITHUB_RUN_ATTEMPT: attempt, GITHUB_SHA: runSha };
    let code = 0, out = "";
    try { out = execFileSync(process.execPath, ["--import", preload, PR_CHECK], { cwd: root, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { code = e.status ?? 1; out = `${e.stdout || ""}${e.stderr || ""}`; }
    return { code, out: out.trim(), calls: readFileSync(log, "utf8").split("\n").filter(Boolean) };
  };
  let rid = 0;
  const review = (commitSha, state = "APPROVED", user = OWNER, at = `2026-11-13T0${Math.min(9, ++rid)}:00:00Z`) => ({ id: 9000 + rid, state, commit_id: commitSha, submitted_at: at, user });
  const approvedA = [review(c1)];
  let r;

  // VALID
  r = run({ liveHead: c1r, reviews: approvedA });
  ok(r.code === 0 && /protected content is unchanged/.test(r.out) && r.calls.some((c) => /\/git\/trees\//.test(c)), `1-4: approved diff A, rebased onto a new main (new head sha), protected diff still A -> PASS without a new approval (${r.code}: ${r.out})`);
  r = run({ liveHead: c2, reviews: approvedA });
  ok(r.code === 0, `5-6: unrelated app code added after approval -> PASS (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: approvedA });
  ok(r.code === 0, `7: migration receipt and generated registry changes -> PASS (${r.code}: ${r.out})`);
  r = run({ liveHead: c1r, reviews: [review(c1r)] });
  ok(r.code === 0, `the approved commit itself passes (${r.code}: ${r.out})`);
  r = run({ liveHead: c1, reviews: approvedA });
  ok(r.code === 1 && /behind the base branch/.test(r.out), `a head behind main fails closed: the protected diff is not the one that would merge (${r.code}: ${r.out})`);

  // INVALID
  for (const [label, head] of [["8: one byte changed in CLAUDE.md", c4], ["9: a .github/** file changed", cGh], ["10: the owner-approval code itself changed", cGate], ["11a: a protected file added", cAdd], ["11b: a protected file removed", cRm]]) {
    r = run({ liveHead: head, reviews: approvedA });
    ok(r.code === 1 && /protected content changed after the owner's approval/.test(r.out) && /Review changes → Approve/.test(r.out) && !r.out.includes("/owner-approve"), `${label} -> FAIL and asks for a fresh GitHub review (${r.code}: ${r.out})`);
  }
  r = run({ liveHead: c3, reviews: [review(c1, "APPROVED", { ...OWNER, type: "Bot" })] });
  ok(r.code === 1 && /no owner approval yet/.test(r.out), `12: a bot's APPROVED review -> FAIL (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: [review(c1, "APPROVED", { type: "User", login: "wayfind-agent", id: 4242 })] });
  ok(r.code === 1 && /no owner approval yet/.test(r.out), `13: a non-owner user's APPROVED review -> FAIL (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: [review(c4)] });
  ok(r.code === 1 && /protected content changed/.test(r.out), `14: the owner approved a different protected fingerprint -> FAIL (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, eventHead: c2, reviews: approvedA });
  ok(r.code === 1 && /moved/.test(r.out), `15a: stale run (the head is no longer the event's head) -> FAIL CLOSED (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: approvedA, liveHeadLater: c4, laterAfter: 2 });
  ok(r.code === 1 && /moved .*while the protected content was being fingerprinted/.test(r.out), `15b: the head moves while protected content is read -> FAIL CLOSED (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: [] });
  ok(r.code === 1 && /no owner approval yet/.test(r.out) && /Review changes → Approve/.test(r.out) && !r.out.includes("/owner-approve"), `16: no owner review -> FAIL, and the refusal asks for a GitHub review, never a command (${r.code}: ${r.out})`);

  // EDGES
  r = run({ liveHead: c3, reviews: [review(c1), review(c3, "CHANGES_REQUESTED")] });
  ok(r.code === 1 && /requested changes/.test(r.out), `edge: a later Request changes withdraws the approval (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: [{ ...review(c1), state: "DISMISSED" }] });
  ok(r.code === 1 && /dismissed/.test(r.out), `edge: a dismissed approval does not count (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: [review(c1), { ...review(c3, "CHANGES_REQUESTED"), state: "DISMISSED" }] });
  ok(r.code === 1 && /dismissed/.test(r.out), `audit: dismissing the owner's Request changes never revives the older approval (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: [review(c1, "APPROVED", OWNER, "2026-11-13T03:00:00Z")], events: [{ event: "base_ref_changed", created_at: "2026-11-13T04:00:00Z" }] });
  ok(r.code === 1 && /base branch changed after/.test(r.out), `audit: retargeting the base after the approval needs a fresh review (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: [review(c1, "APPROVED", OWNER, "2026-11-13T03:00:00Z")], events: [{ event: "base_ref_changed", created_at: "2026-11-13T02:00:00Z" }, { event: "labeled", created_at: "2026-11-13T05:00:00Z" }] });
  ok(r.code === 0, `control: a base change before the approval, and unrelated events after it, keep it (${r.code}: ${r.out})`);
  const mainTip = git(repo, ["rev-parse", "main"]), oldMain = git(repo, ["rev-parse", "main~1"]);
  r = run({ liveHead: c3, reviews: approvedA, attempt: "2", runSha: oldMain });
  ok(r.code === 1 && /re-run .* older rule never re-judges/.test(r.out), `audit: a re-run started on an older main is refused (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: approvedA, attempt: "2", runSha: mainTip });
  ok(r.code === 0, `control: a re-run on the current main is judged normally (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, reviews: [review(c1), review(c3, "COMMENTED")] });
  ok(r.code === 0, `edge: a later comment-only review leaves the approval standing (${r.code}: ${r.out})`);
  r = run({ liveHead: c4, reviews: [review(c1), review(c4)] });
  ok(r.code === 0, `edge: after a protected change the owner approves again and it passes (${r.code}: ${r.out})`);
  r = run({ liveHead: cBase, reviews: approvedA, baseRef: "main2" });
  ok(r.code === 1 && /protected content changed/.test(r.out), `edge: main changed the same protected file, so the approved diff no longer applies -> fresh review (${r.code}: ${r.out})`);
  r = run({ liveHead: c3, comments: [{ id: 1, user: OWNER, body: `/owner-approve ${c3}`, created_at: "2026-11-13T00:00:00Z", updated_at: "2026-11-13T00:00:00Z" }] });
  ok(r.code === 0 && /legacy comment/.test(r.out), `transition: an existing legacy comment is still read (${r.code}: ${r.out})`);
  r = run({ liveHead: c2, reviews: [] });
  ok(r.code === 1, `control: the same head without the review fails, so the passes above came from the review (${r.code})`);

  // ── 3. The re-check script: re-runs only the live head's failed gate runs ──
  const rcPreload = join(root, "rc-stub.mjs");
  writeFileSync(rcPreload, `
import { readFileSync, appendFileSync } from "node:fs";
const cfg = JSON.parse(readFileSync(process.env.STUB_CONFIG, "utf8"));
globalThis.fetch = async (url, init = {}) => {
  appendFileSync(process.env.STUB_LOG, (init.method || "GET") + " " + String(url) + "\\n");
  const u = new URL(url);
  const path = u.pathname.replace(/^\\/repos\\/[^/]+\\/[^/]+/, "");
  if (/^\\/pulls\\/\\d+$/.test(path)) return { ok: true, status: 200, json: async () => ({ state: "open", base: { ref: "main" }, head: { sha: cfg.head } }) };
  const m = path.match(/^\\/actions\\/workflows\\/([^/]+)\\/runs$/);
  if (m) return { ok: true, status: 200, json: async () => ({ workflow_runs: cfg.runs[m[1]] || [] }) };
  if (/^\\/actions\\/runs\\/\\d+\\/rerun-failed-jobs$/.test(path) && init.method === "POST") return { ok: true, status: 201, json: async () => null };
  return { ok: false, status: 404, json: async () => ({}) };
};`);
  const H = "1".repeat(40), OLD = "2".repeat(40);
  const rc = (cfgObj, envOver = {}) => {
    const tag = ++n;
    const cfg = join(root, `rc-${tag}.json`), log = join(root, `rclog-${tag}.txt`), ev = join(root, `rcev-${tag}.json`);
    writeFileSync(cfg, JSON.stringify(cfgObj)); writeFileSync(log, "");
    writeFileSync(ev, JSON.stringify({ workflow_run: { pull_requests: [{ number: 2460 }] } }));
    const env = { ...process.env, GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_run", GITHUB_REF: "refs/heads/main", GITHUB_EVENT_PATH: ev, GITHUB_TOKEN: "t", GITHUB_REPOSITORY: "wallstreethyena/Wayfind", GITHUB_API_URL: "https://api.github.fixture.invalid", STUB_CONFIG: cfg, STUB_LOG: log, ...envOver };
    let code = 0, out = "";
    try { out = execFileSync(process.execPath, ["--import", rcPreload, RECHECK], { cwd: root, encoding: "utf8", env, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { code = e.status ?? 1; out = `${e.stdout || ""}${e.stderr || ""}`; }
    return { code, out, posts: readFileSync(log, "utf8").split("\n").filter((l) => l.startsWith("POST")) };
  };
  const runOf = (id, head, conclusion, status = "completed", at = "2026-11-13T05:00:00Z") => ({ id, head_sha: head, status, conclusion, created_at: at });
  r = rc({ head: H, runs: { "owner-approval.yml": [runOf(11, H, "failure"), runOf(10, OLD, "failure", "completed", "2026-11-13T06:00:00Z")], "guards.yml": [runOf(21, H, "success")] } });
  ok(r.code === 0 && r.posts.length === 1 && /\/actions\/runs\/11\/rerun-failed-jobs/.test(r.posts[0]), `recheck: re-runs only the failed gate run for the live head, never another head's or a green one (${r.code}: ${r.posts.join(" | ")})`);
  r = rc({ head: H, runs: { "owner-approval.yml": [runOf(11, H, null, "in_progress")], "guards.yml": [] } });
  ok(r.code === 0 && r.posts.length === 0, `recheck: an in-progress or missing run is left alone (${r.posts.length} posts)`);
  r = rc({ head: H, runs: {} }, { GITHUB_REF: "refs/pull/2460/merge" });
  ok(r.code === 1 && r.posts.length === 0 && /main's context/.test(r.out), `recheck: refuses outside main's context (${r.code})`);
  r = rc({ head: H, runs: {} }, { GITHUB_EVENT_NAME: "pull_request_review" });
  ok(r.code === 1 && r.posts.length === 0, `recheck: refuses any event but workflow_run (${r.code})`);
  const rcSrc = readFileSync(RECHECK, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  ok(!/check-runs|\/reviews|\/statuses|\/merge\b|\/comments/.test(rcSrc), "recheck: never posts a check, status, review, comment or merge (it decides nothing)");
} finally {
  rmSync(root, { recursive: true, force: true });
}

// ── 4. The two new workflows are safe, and everything is wired ─────────────
{
  const wf = (f) => readFileSync(join(REPO, ".github", "workflows", f), "utf8").split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");
  const obs = wf("owner-review-observed.yml");
  ok(/on:\s*\n\s+pull_request_review:/.test(obs) && /^permissions:\s*\{\}\s*$/m.test(obs) && !/uses:|checkout|secrets\.|\$\{\{/.test(obs) && /github\.event\.review\.user\.id == 297334934/.test(obs),
    "owner-review-observed: no permissions, no checkout, no actions, no secrets, no expressions in steps, and only the owner's account id starts it");
  const rcw = wf("owner-approval-recheck.yml");
  ok(/on:\s*\n\s+workflow_run:\s*\n\s+workflows:\s*\[owner-review-observed\]/.test(rcw) && /persist-credentials:\s*false/.test(rcw) && !/^\s*ref:/m.test(rcw) && !/github\.event\.workflow_run\.head|github\.event\.pull_request/.test(rcw)
    && !/\b(npm|npx|yarn|pnpm)\b/.test(rcw) && !/run:\s*[|>]/.test(rcw) && /run:\s*node scripts\/owner-approval-recheck\.mjs\s*$/m.test(rcw),
    "owner-approval-recheck: workflow_run from main, main checked out without credentials, nothing installed, no event text in the shell");
  const exprs = [...rcw.matchAll(/\$\{\{([^}]*)\}\}/g)].map((m) => m[1].trim());
  ok(JSON.stringify(exprs) === JSON.stringify(["github.token"]), `owner-approval-recheck: the only expression is the token (${exprs.join(" ; ")})`);
  const guards = readFileSync(join(REPO, "scripts", "guards.txt"), "utf8");
  ok(/^node scripts\/test-owner-approval-v2\.mjs$/m.test(guards), "wiring: this test runs in scripts/guards.txt");
  const docs = readFileSync(join(REPO, "docs", "OWNER_APPROVAL.md"), "utf8");
  ok(/Review changes → Approve/.test(docs) && /fingerprint/i.test(docs), "docs: OWNER_APPROVAL.md describes the GitHub review and the protected-content fingerprint");
}

const EXPECTED = 65;
if (checks !== EXPECTED) {
  console.error(`test-owner-approval-v2: FAIL — ran ${checks} assertions, expected exactly ${EXPECTED}; a proof was skipped or added without review.`);
  process.exit(1);
}
console.log(`test-owner-approval-v2: OK — ${checks} assertions: owner GitHub review approves protected content by fingerprint; rebase, main moving, unrelated code, receipts and registries keep it; one changed protected byte, a .github change, a gate change, an added or removed protected file, a bot, a non-owner, a different fingerprint, a stale or moving head, or no review fail; refusals never ask for a pasted command; the re-check only re-runs the live head's failed gates`);
