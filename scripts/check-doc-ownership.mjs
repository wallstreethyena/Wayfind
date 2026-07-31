#!/usr/bin/env node
/**
 * check-doc-ownership — rule-defining files are owner-only.
 *
 * Measured 2026-07-31: 11 of 29 branch-vs-main conflicts (38%) were on coordination
 * documents, not code. AGENTS.md conflicted on 3 branches, CLAUDE.md on 3,
 * docs/KIMI_QUEUE.md on 3. Rules cannot stabilise while the rules are a merge target.
 *
 * Fails when a non-owner commit on the current branch touches an owner-only path.
 * Lane state belongs in docs/lanes/<lane>.md — one file per lane, so two lanes can
 * never collide. Rule changes go to docs/proposals/<lane>-<topic>.md.
 */
import { execSync } from "node:child_process";

const OWNER_ONLY = [/^AGENTS\.md$/, /^CLAUDE\.md$/, /^LOCKS\.md$/, /^QUEUE\.md$/, /^docs\/[^/]*-standard\.md$/];
const OWNERS = ["Gabriel Pereira"];
const sh = (c) => { try { return execSync(c, { encoding: "utf8" }).trim(); } catch { return ""; } };

const base = sh("git merge-base origin/main HEAD") || sh("git rev-parse HEAD~1");
if (!base) { console.log("check-doc-ownership: SKIP — no merge base"); process.exit(0); }

const commits = sh(`git rev-list ${base}..HEAD`).split("\n").filter(Boolean);
const bad = [];
for (const c of commits) {
  const author = sh(`git log -1 --format=%an ${c}`);
  if (OWNERS.includes(author)) continue;
  for (const f of sh(`git diff-tree --no-commit-id --name-only -r ${c}`).split("\n").filter(Boolean)) {
    if (OWNER_ONLY.some((rx) => rx.test(f))) bad.push({ c: c.slice(0, 8), author, f });
  }
}

if (bad.length) {
  console.error("check-doc-ownership: FAIL — owner-only files modified by a lane:");
  for (const b of bad) console.error(`  ${b.c}  ${b.f}  (author: ${b.author})`);
  console.error("  Write docs/lanes/<lane>.md for state, or docs/proposals/<lane>-<topic>.md to propose a rule change.");
  process.exit(1);
}
console.log(`check-doc-ownership: OK — ${commits.length} commit(s), no owner-only files touched by a lane`);
