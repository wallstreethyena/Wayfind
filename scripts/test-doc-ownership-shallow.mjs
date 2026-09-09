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
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const GUARD = join(process.cwd(), "scripts", "check-doc-ownership.mjs");
const OWNER = { GIT_AUTHOR_NAME: "Gabriel Pereira", GIT_AUTHOR_EMAIL: "owner@example.com", GIT_COMMITTER_NAME: "Gabriel Pereira", GIT_COMMITTER_EMAIL: "owner@example.com" };
const LANE = { GIT_AUTHOR_NAME: "WAYFIND LLC", GIT_AUTHOR_EMAIL: "lane@example.com", GIT_COMMITTER_NAME: "WAYFIND LLC", GIT_COMMITTER_EMAIL: "lane@example.com" };

const PRE_FIX_SHA = "195ba627";
let passed = 0;
let redProofSkipped = false;
const failures = [];
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
  // Vercel's own clone is shallow and will not contain this object. A missing pre-fix
  // source is a skipped proof, never a failure, or this test would break every deploy.
  let oldSource = null;
  try {
    oldSource = execFileSync("git", ["show", `${PRE_FIX_SHA}:scripts/check-doc-ownership.mjs`], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch { oldSource = null; }
  if (oldSource) {
    const shallowOld = mk("shallow-old");
    const oldGuard = join(shallowOld, "old-guard.mjs");
    writeFileSync(oldGuard, oldSource);
    const r7 = runGuard(shallowOld, oldGuard, { GITHUB_ACTIONS: "true" });
    check("red proof: the pre-fix guard passed the incident shape", r7.code === 0 && /SKIP/.test(r7.out), `pre-fix guard did not reproduce the miss — code ${r7.code}: ${r7.out.trim()}`);
  } else {
    redProofSkipped = true;
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
} finally {
  rmSync(root, { recursive: true, force: true });
}

if (failures.length) {
  console.error("test-doc-ownership-shallow: FAIL");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
const redProof = redProofSkipped
  ? `pre-fix source at ${PRE_FIX_SHA} unreachable in this checkout, red proof skipped`
  : "pre-fix source red-proved";
console.log(`test-doc-ownership-shallow: OK — ${passed} assertions (incident shape reproduced from a real shallow clone, ${redProof}, Vercel skip preserved, four ordinary answers unchanged)`);
