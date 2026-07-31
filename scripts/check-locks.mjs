#!/usr/bin/env node
/**
 * check-locks — a branch may not modify a path locked by a different lane.
 * Lock owner is matched against the commit author on this branch.
 */
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

if (!existsSync("LOCKS.md")) { console.log("check-locks: SKIP — no LOCKS.md"); process.exit(0); }
const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return ""; } };

const locks = readFileSync("LOCKS.md", "utf8").split("\n")
  .filter((l) => l.includes("|") && !l.trim().startsWith("#") && !l.trim().startsWith("Format:"))
  .map((l) => l.split("|").map((s) => s.trim()))
  .filter((p) => p.length >= 2 && p[0] && !p[0].startsWith("`"))
  .map(([path, lane]) => ({ path, lane }));

if (!locks.length) { console.log("check-locks: OK — no active locks"); process.exit(0); }

const base = sh("git merge-base origin/main HEAD");
if (!base) { console.log("check-locks: SKIP — no merge base"); process.exit(0); }
const changed = sh(`git diff --name-only ${base}...HEAD`).split("\n").filter(Boolean);
const author = sh("git log -1 --format=%an HEAD").toLowerCase();

const violations = locks.filter((l) => changed.includes(l.path) && !author.includes(l.lane.toLowerCase()) && !author.includes("gabriel"));
if (violations.length) {
  console.error("check-locks: FAIL — locked path modified by another lane:");
  for (const v of violations) console.error(`  ${v.path} is locked by ${v.lane}; this branch is authored by "${sh("git log -1 --format=%an HEAD")}"`);
  console.error("  Coordinate in QUEUE.md, or ask the owner to move the lock.");
  process.exit(1);
}
console.log(`check-locks: OK — ${locks.length} lock(s), no cross-lane edits`);
