#!/usr/bin/env node
/**
 * test-doc-ownership-shallow — the ownership guard must not answer OK on the merge gate
 * when it cannot read the base it needs.
 *
 * Measured 2026-09-09. GitHub Actions run 34390086158, head b3cc9a48, printed:
 *
 *   check-doc-ownership: SKIP — confirmed shallow checkout does not contain origin/main
 *   run-guards: OK — 592/592 guards + 1 credentialed re-run(s) green in 180.0s
 *
 * PR #1197 merged two minutes later carrying an AGENTS.md edit authored by a lane —
 * exactly what check-doc-ownership exists to refuse. The guard was correct locally and
 * silent on the only run that decides a merge, because actions/checkout used the default
 * depth 1 and never fetched origin/main.
 *
 * This test builds that checkout shape for real: a shallow clone with no origin/main
 * remote-tracking ref, plus a lane commit touching AGENTS.md. It proves the shipped guard
 * fails there under GITHUB_ACTIONS, proves the pre-fix source passed there (the red
 * proof), and proves the four ordinary answers are unchanged.
 *
 * WHY THE PRE-FIX SOURCE IS A COMMITTED FIXTURE AND NOT `git show <sha>`.
 * The first version of this file read it with
 * `git show 195ba627:scripts/check-doc-ownership.mjs`. That object is absent from
 * both the hosted merge gate's shallow checkout and Vercel's, so the read failed,
 * the RED proof skipped itself, and the test still printed OK with a smaller count.
 * That is the same fail-open this file exists to punish, on the same run. The
 * defective source is therefore committed at
 * scripts/fixtures/check-doc-ownership-at-195ba627.mjs.txt and pinned by its git
 * blob SHA-1, which is content-derived and so verifiable with no history and no
 * network. There is no path here that can skip the RED proof.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GUARD = join(process.cwd(), "scripts", "check-doc-ownership.mjs");
const OWNER = { GIT_AUTHOR_NAME: "Gabriel Pereira", GIT_AUTHOR_EMAIL: "owner@example.com", GIT_COMMITTER_NAME: "Gabriel Pereira", GIT_COMMITTER_EMAIL: "owner@example.com" };
const LANE = { GIT_AUTHOR_NAME: "WAYFIND LLC", GIT_AUTHOR_EMAIL: "lane@example.com", GIT_COMMITTER_NAME: "WAYFIND LLC", GIT_COMMITTER_EMAIL: "lane@example.com" };

const PRE_FIX_SHA = "195ba627";
const PRE_FIX_FIXTURE = join(process.cwd(), "scripts", "fixtures", "check-doc-ownership-at-195ba627.mjs.txt");
// git blob SHA-1 of scripts/check-doc-ownership.mjs as of 195ba627. Content
// addressed, so this pin is checkable without the object being present.
const PRE_FIX_BLOB = "3c83f3dd9e683fec26bbe974faf6718055a421ba";
const gitBlobSha1 = (buf) => createHash("sha1").update(`blob ${buf.length}\0`).update(buf).digest("hex");

let passed = 0;
let bailed = null;
const failures = [];
// A proof that cannot run is not a proof that passed.
const bail = (msg) => { const e = new Error(msg); e.guardBail = true; throw e; };
const check = (name, cond, detail) => { if (cond) passed += 1; else failures.push(`${name}: ${detail}`); };

const git = (cwd, args, env = {}) =>
  execFileSync("git", args, { cwd, encoding: "utf8", env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });

/** Run a guard script in `cwd`; return {code, out}. */
const runGuard = (cwd, script, env = {}) => {
  try {
    const out = execFileSync("node", [script], { cwd, encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "", ...env }, stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout || ""}${error.stderr || ""}` };
  }
};

const root = mkdtempSync(join(tmpdir(), "wf-ownership-"));
try {
  // An origin with one owner-authored commit on main.
  const origin = join(root, "origin");
  mkdirSync(origin);
  git(origin, ["init", "-q", "-b", "main"]);
  writeFileSync(join(origin, "AGENTS.md"), "# rules\n\n## 1. First rule\n");
  mkdirSync(join(origin, "docs", "proposals"), { recursive: true });
  writeFileSync(join(origin, "docs", "proposals", "seed.md"), "seed\n");
  git(origin, ["add", "-A"]);
  git(origin, ["commit", "-q", "-m", "seed"], OWNER);

  /** Clone `origin`, optionally shallow, optionally dropping the origin/main ref. */
  const clone = (name, { shallow = false, dropMainRef = false } = {}) => {
    const dir = join(root, name);
    git(root, shallow ? ["clone", "-q", "--depth=1", `file://${origin}`, dir] : ["clone", "-q", `file://${origin}`, dir]);
    git(dir, ["config", "user.email", "t@example.com"]);
    git(dir, ["config", "user.name", "t"]);
    if (dropMainRef) git(dir, ["update-ref", "-d", "refs/remotes/origin/main"]);
    return dir;
  };
  const commitFile = (dir, relPath, body, env) => {
    mkdirSync(join(dir, relPath.split("/").slice(0, -1).join("/") || "."), { recursive: true });
    writeFileSync(join(dir, relPath), body);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-q", "-m", `touch ${relPath}`], env);
  };

  // ---- ordinary answers, full history: these must not change ----
  const laneRules = clone("lane-rules");
  commitFile(laneRules, "AGENTS.md", "# rules\n\n## 1. First rule\n\n## 2. Lane wrote this\n", LANE);
  const r1 = runGuard(laneRules, GUARD);
  check("lane editing AGENTS.md is refused", r1.code === 1 && /owner-only files modified by a lane/.test(r1.out), `code ${r1.code}: ${r1.out.trim()}`);

  const laneProposal = clone("lane-proposal");
  commitFile(laneProposal, "docs/proposals/lane-topic.md", "proposal\n", LANE);
  const r2 = runGuard(laneProposal, GUARD);
  check("lane writing a proposal is allowed", r2.code === 0 && /OK/.test(r2.out), `code ${r2.code}: ${r2.out.trim()}`);

  const ownerRules = clone("owner-rules");
  commitFile(ownerRules, "AGENTS.md", "# rules\n\n## 1. First rule\n\n## 2. Owner wrote this\n", OWNER);
  const r3 = runGuard(ownerRules, GUARD);
  check("owner editing AGENTS.md is allowed", r3.code === 0 && /OK/.test(r3.out), `code ${r3.code}: ${r3.out.trim()}`);

  const laneCode = clone("lane-code");
  commitFile(laneCode, "lib/thing.js", "export const a = 1;\n", LANE);
  const r4 = runGuard(laneCode, GUARD);
  check("lane editing ordinary code is allowed", r4.code === 0 && /OK/.test(r4.out), `code ${r4.code}: ${r4.out.trim()}`);

  // ---- the incident shape: shallow, no origin/main, lane touching AGENTS.md ----
  const mk = (name) => {
    const dir = clone(name, { shallow: true, dropMainRef: true });
    commitFile(dir, "AGENTS.md", "# rules\n\n## 1. First rule\n\n## 2. Lane wrote this\n", LANE);
    return dir;
  };

  const shallowCi = mk("shallow-ci");
  check("the incident checkout really is shallow", git(shallowCi, ["rev-parse", "--is-shallow-repository"]).trim() === "true", "expected a shallow clone");
  const r5 = runGuard(shallowCi, GUARD, { GITHUB_ACTIONS: "true" });
  check("shallow on the merge gate fails closed", r5.code === 1, `code ${r5.code}: ${r5.out.trim()}`);
  check("the failure names the repair", /fetch-depth: 0/.test(r5.out), `message did not name fetch-depth: 0 — ${r5.out.trim()}`);
  check("shallow on the merge gate never answers SKIP", !/SKIP/.test(r5.out), `still printed SKIP — ${r5.out.trim()}`);

  // Vercel runs this same suite through `prebuild` on its own shallow clone and is not the
  // merge gate. That path must keep skipping, or every deployment breaks.
  const shallowLocal = mk("shallow-local");
  const r6 = runGuard(shallowLocal, GUARD);
  check("shallow off the merge gate still skips", r6.code === 0 && /SKIP/.test(r6.out), `code ${r6.code}: ${r6.out.trim()}`);

  // ---- red proof: the pre-fix source passes the incident shape ----
  // Read from the committed fixture, never from git history, so this runs
  // identically on a full clone, the shallow merge gate, and Vercel.
  let preFixBuf = null;
  try { preFixBuf = readFileSync(PRE_FIX_FIXTURE); } catch { preFixBuf = null; }
  check("the pre-fix fixture is present", preFixBuf !== null,
    `${PRE_FIX_FIXTURE} is missing — the RED proof has nothing to run against`);
  if (preFixBuf === null) bail(`the pre-fix fixture ${PRE_FIX_FIXTURE} is missing, so the RED proof cannot run at all. Restore it from ${PRE_FIX_SHA}:scripts/check-doc-ownership.mjs.`);

  const fixtureBlob = gitBlobSha1(preFixBuf);
  check(`the fixture is byte-identical to the source at ${PRE_FIX_SHA}`, fixtureBlob === PRE_FIX_BLOB,
    `blob ${fixtureBlob} != pinned ${PRE_FIX_BLOB} — an edited fixture proves nothing about what shipped`);
  if (fixtureBlob !== PRE_FIX_BLOB) bail(`the pre-fix fixture no longer matches the source at ${PRE_FIX_SHA} (blob ${fixtureBlob}, pinned ${PRE_FIX_BLOB}).`);

  {
    const shallowOld = mk("shallow-old");
    const oldGuard = join(shallowOld, "old-guard.mjs");
    writeFileSync(oldGuard, preFixBuf);
    const r7 = runGuard(shallowOld, oldGuard, { GITHUB_ACTIONS: "true" });
    check("red proof: the pre-fix guard passed the incident shape", r7.code === 0 && /SKIP/.test(r7.out), `pre-fix guard did not reproduce the miss — code ${r7.code}: ${r7.out.trim()}`);
  }

  // ---- structural: every shallow escape is gated, so neither can rot back open ----
  const shipped = readFileSync(GUARD, "utf8");
  const shallowBlocks = shipped.split("if (isShallow) {").slice(1);
  check("both shallow escapes exist", shallowBlocks.length === 2, `found ${shallowBlocks.length} shallow branches, expected 2`);
  for (const [i, block] of shallowBlocks.entries()) {
    const body = block.split("}")[0];
    check(`shallow escape ${i + 1} is gated by the merge-gate check`, /IS_MERGE_GATE/.test(body), `branch ${i + 1} can still exit 0 on the merge gate`);
  }
  check("the merge gate is GitHub Actions", /GITHUB_ACTIONS\s*===\s*"true"/.test(shipped), "IS_MERGE_GATE is not bound to GITHUB_ACTIONS");
} catch (e) {
  if (!e || !e.guardBail) throw e;
  bailed = e.message;
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (bailed) {
  console.error("test-doc-ownership-shallow: FAIL — the red proof could not run.");
  console.error(`  ${bailed}`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

if (failures.length) {
  console.error("test-doc-ownership-shallow: FAIL");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
// A count floor, so this file can never again report OK with its central proof
// quietly absent. If assertions are added, raise this deliberately.
const EXPECTED = 16;
if (passed !== EXPECTED) {
  console.error(`test-doc-ownership-shallow: FAIL — ran ${passed} assertions, expected exactly ${EXPECTED}.`);
  console.error("  A different count means a proof was skipped or added without review. Neither may pass silently.");
  process.exit(1);
}
console.log(`test-doc-ownership-shallow: OK — ${passed} assertions (incident shape reproduced from a real shallow clone, pre-fix source pinned at blob ${PRE_FIX_BLOB.slice(0, 12)} and read from a committed fixture so it runs on shallow checkouts too, red-proved, Vercel skip preserved, four ordinary answers unchanged)`);
