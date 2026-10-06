#!/usr/bin/env node
// Runtime controls for branch-owned coordination locks, including the old
// commit-display-name bypass. No remote refs or real owner data are changed.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const guard = fileURLToPath(new URL("./check-locks.mjs", import.meta.url));
const initialLocks = "# Fixture locks\nFormat: `path | lane | ISO date | reason`\nowned.js | gwen | 2026-10-04 | fixture\n";
function probe({ branch = "lane/gwen/test", author = "Fixture", locks = initialLocks, mutate = "file", noBase = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "wayfind-lock-fixture-"));
  const env = { ...process.env, GITHUB_HEAD_REF: "", GITHUB_REF_NAME: "", GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: "fixture@example.invalid", GIT_COMMITTER_NAME: author, GIT_COMMITTER_EMAIL: "fixture@example.invalid" };
  const git = (...args) => execFileSync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
  try {
    git("init", "-q", "-b", "main");
    writeFileSync(path.join(dir, "LOCKS.md"), initialLocks);
    writeFileSync(path.join(dir, "owned.js"), "export const fixture = 1;\n");
    git("add", "."); git("commit", "-qm", "fixture base");
    if (!noBase) git("update-ref", "refs/remotes/origin/main", git("rev-parse", "HEAD"));
    git("checkout", "-qb", branch);
    if (mutate === "file") writeFileSync(path.join(dir, "owned.js"), "export const fixture = 2;\n");
    else writeFileSync(path.join(dir, "LOCKS.md"), locks);
    git("add", "."); git("commit", "--allow-empty", "-qm", "fixture change");
    const run = spawnSync(process.execPath, [guard], { cwd: dir, env, encoding: "utf8" });
    assert.equal(run.error, undefined, "the guard process must actually start");
    return { code: run.status, output: run.stdout + run.stderr };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

assert.equal(probe().code, 0, "the matching lane may modify its locked path");
assert.notEqual(probe({ branch: "lane/kim/test" }).code, 0, "another lane cannot modify the locked path");
assert.notEqual(probe({ branch: "feature/unscoped" }).code, 0, "an unscoped branch cannot claim the lock");
assert.notEqual(probe({ branch: "lane/kim/test", author: "Gabriel Fixture" }).code, 0, "spoofing an owner-like display name never bypasses the lane lock");
assert.equal(probe({ mutate: "locks", locks: initialLocks.replace("fixture\n", "updated fixture\n") }).code, 0, "a matching lane can propose its own row change (separate owner gate still applies)");
assert.notEqual(probe({ branch: "lane/kim/test", mutate: "locks", locks: "# Fixture locks\n" }).code, 0, "another lane cannot delete the owner's lock row");
const unavailable = probe({ noBase: true });
assert.notEqual(unavailable.code, 0, "active locks with no readable base fail closed");
assert.match(unavailable.output, /merge base is unavailable/, "missing-base failure names the actual blocker");
console.log("test-lane-lock-ownership: 8 runtime controls passed in isolated repositories; no remote refs changed");
