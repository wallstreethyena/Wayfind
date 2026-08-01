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
import { execFileSync } from "node:child_process";

const OWNER_ONLY = [/^AGENTS\.md$/, /^CLAUDE\.md$/, /^LOCKS\.md$/, /^QUEUE\.md$/, /^docs\/[^/]*-standard\.md$/];
const OWNERS = ["Gabriel Pereira"];
const git = (...args) => {
  try {
    return { ok: true, out: execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() };
  } catch (error) {
    return { ok: false, out: "", error: String(error && (error.stderr || error.message) || error).trim() };
  }
};
const fail = (message) => {
  console.error(`check-doc-ownership: FAIL — ${message}`);
  process.exit(1);
};

const inside = git("rev-parse", "--is-inside-work-tree");
if (!inside.ok || inside.out !== "true") {
  fail(`git is unavailable or the checkout is not a Git worktree${inside.error ? ` (${inside.error})` : ""}`);
}

const shallowResult = git("rev-parse", "--is-shallow-repository");
if (!shallowResult.ok || !/^(?:true|false)$/.test(shallowResult.out)) {
  fail(`cannot determine whether the checkout is shallow (${shallowResult.error || shallowResult.out || "no answer"})`);
}
const isShallow = shallowResult.out === "true";

const headResult = git("rev-parse", "--verify", "HEAD^{commit}");
if (!headResult.ok || !headResult.out) fail(`HEAD is not a readable commit (${headResult.error || "no object"})`);

const upstreamResult = git("rev-parse", "--verify", "origin/main^{commit}");
if (!upstreamResult.ok || !upstreamResult.out) {
  if (isShallow) {
    console.log("check-doc-ownership: SKIP — confirmed shallow checkout does not contain origin/main");
    process.exit(0);
  }
  fail(`origin/main is not a readable commit in a non-shallow checkout (${upstreamResult.error || "no object"})`);
}

const baseResult = git("merge-base", "origin/main", "HEAD");
if (!baseResult.ok || !baseResult.out) {
  if (isShallow) {
    console.log("check-doc-ownership: SKIP — readable HEAD and origin/main histories are truncated before their merge base");
    process.exit(0);
  }
  fail(`origin/main merge base is unavailable in a non-shallow checkout${baseResult.error ? ` (${baseResult.error})` : ""}`);
}
const base = baseResult.out;

const commitResult = git("rev-list", `${base}..HEAD`);
if (!commitResult.ok) fail(`cannot enumerate branch commits (${commitResult.error})`);
const commits = commitResult.out.split("\n").filter(Boolean);
const bad = [];
for (const c of commits) {
  const authorResult = git("log", "-1", "--format=%an", c);
  if (!authorResult.ok || !authorResult.out) fail(`cannot read author for ${c.slice(0, 8)} (${authorResult.error || "empty author"})`);
  const author = authorResult.out;
  if (OWNERS.includes(author)) continue;
  const filesResult = git("diff-tree", "--no-commit-id", "--name-only", "-r", c);
  if (!filesResult.ok) fail(`cannot inspect ${c.slice(0, 8)} (${filesResult.error})`);
  for (const f of filesResult.out.split("\n").filter(Boolean)) {
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
