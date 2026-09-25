#!/usr/bin/env node
/**
 * check-locks — coordination guard for concurrent Wayfind lanes.
 *
 * Lane identity comes from the branch name, never commit-author display text:
 *   lane/<lane>/<task>
 *
 * A lane may add/remove/edit only its own LOCKS.md rows, and only that same
 * lane may modify a currently locked path. This prevents accidental cross-lane
 * edits and removes the old author-name / "gabriel" bypass. It is still a
 * coordination guard, not an authorization boundary; repository permissions
 * remain the security boundary.
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const LOCKS_FILE = "LOCKS.md";
const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return ""; } };

function parseLocks(text) {
  return String(text || "").split("\n")
    .filter((l) => l.includes("|") && !l.trim().startsWith("#") && !l.trim().startsWith("Format:"))
    .map((l) => l.split("|").map((s) => s.trim()))
    .filter((p) => p.length >= 2 && p[0] && p[1] && !p[0].startsWith("`"))
    .map(([path, lane, date = "", reason = ""]) => ({ path, lane, date, reason }));
}

function signature(lock) {
  return [lock.path, lock.lane, lock.date, lock.reason].join("\u0000");
}

function branchLane() {
  const branch = String(process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || sh("git branch --show-current") || "").trim();
  const match = branch.match(/^lane\/([^/]+)(?:\/|$)/i);
  return { branch, lane: match ? match[1].toLowerCase() : "" };
}

if (!existsSync(LOCKS_FILE)) {
  console.log("check-locks: SKIP — no LOCKS.md");
  process.exit(0);
}

const currentLocks = parseLocks(readFileSync(LOCKS_FILE, "utf8"));
const base = sh("git merge-base origin/main HEAD");
if (!base) {
  if (currentLocks.length) {
    console.error("check-locks: FAIL — active locks exist but origin/main merge base is unavailable");
    process.exit(1);
  }
  console.log("check-locks: OK — no active locks; merge base unavailable");
  process.exit(0);
}

const changed = sh(`git diff --name-only ${base}...HEAD`).split("\n").filter(Boolean);
const identity = branchLane();

// LOCKS.md is owner-governed but lane-editable: a lane may mutate only rows
// whose lane exactly matches lane/<lane>/... on its branch.
if (changed.includes(LOCKS_FILE)) {
  const baseText = sh(`git show ${base}:${LOCKS_FILE}`);
  const baseLocks = parseLocks(baseText);
  const baseSet = new Map(baseLocks.map((l) => [signature(l), l]));
  const currentSet = new Map(currentLocks.map((l) => [signature(l), l]));
  const mutations = [
    ...baseLocks.filter((l) => !currentSet.has(signature(l))),
    ...currentLocks.filter((l) => !baseSet.has(signature(l))),
  ];
  const foreign = mutations.filter((l) => !identity.lane || l.lane.toLowerCase() !== identity.lane);
  if (foreign.length) {
    console.error(`check-locks: FAIL — ${LOCKS_FILE} may only be changed by the lane that owns each changed row`);
    console.error(`  branch: ${identity.branch || "(detached/unknown)"}; expected branch form lane/<lane>/<task>`);
    for (const l of foreign) console.error(`  ${l.path} is owned by lane ${l.lane}`);
    process.exit(1);
  }
}

if (!currentLocks.length) {
  console.log("check-locks: OK — no active locks");
  process.exit(0);
}

const violations = currentLocks.filter((l) => changed.includes(l.path) && (!identity.lane || identity.lane !== l.lane.toLowerCase()));
if (violations.length) {
  console.error("check-locks: FAIL — locked path modified by another lane:");
  console.error(`  branch: ${identity.branch || "(detached/unknown)"}; lane: ${identity.lane || "unknown"}`);
  for (const v of violations) console.error(`  ${v.path} is locked by ${v.lane}`);
  console.error("  Coordinate through the lane protocol; do not spoof commit authors or bypass locks.");
  process.exit(1);
}

console.log(`check-locks: OK — ${currentLocks.length} lock(s), lane ${identity.lane || "unscoped"}, no cross-lane edits`);
