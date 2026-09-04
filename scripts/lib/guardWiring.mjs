// scripts/lib/guardWiring.mjs — shared, LIVE (never cached, never hardcoded)
// enumeration of "what guard-shaped files exist on disk" and "what does
// scripts/guards.txt actually reach", reused by BOTH the registry generator
// (scripts/lib/build-guard-registry.mjs) and the registry's own CI check
// (scripts/check-guard-registry.mjs) so the two can never quietly diverge on
// what "wired" means. Mirrors scripts/check-guard-manifest.mjs's resolution
// logic (same regexes, same npm-run expansion) rather than inventing a
// second way to answer the same question — that file is the existing,
// battle-tested source of truth for "does guards.txt reach this file".
//
// Every function here reads the real files on every call. Nothing is
// memoized across a process lifetime beyond what a single generator/check
// run needs, and nothing here is a list of guard names typed by hand.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

// Resolve the repo root from ANY caller's import.meta.url, regardless of
// whether the caller lives in scripts/ or scripts/lib/ — walk upward until a
// directory containing both package.json AND a scripts/ folder is found,
// rather than assuming a fixed depth (a fixed "../.." would silently
// resolve to the wrong directory the day a caller moves).
export function repoRoot(importMetaUrl) {
  let dir = path.dirname(new URL(importMetaUrl).pathname);
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, "scripts"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`guardWiring.repoRoot: could not find repo root walking up from ${importMetaUrl}`);
}

const GUARD_FILE_RX = /^(check|test)-.*\.mjs$/;

// Every scripts/{check,test}-*.mjs on disk right now. This is the same
// pattern scripts/check-guard-manifest.mjs enumerates against — the census
// this whole registry exists to keep honest.
export function guardShapedFilesOnDisk(root) {
  const scriptsDir = path.join(root, "scripts");
  return readdirSync(scriptsDir)
    .filter((f) => GUARD_FILE_RX.test(f))
    .sort()
    .map((f) => `scripts/${f}`);
}

// Parse scripts/guards.txt + package.json exactly as check-guard-manifest.mjs
// does: a set of scripts/*.mjs basenames the manifest reaches, either
// directly (`node scripts/check-foo.mjs`) or through `npm run <script>`
// whose body itself names a scripts/*.mjs file.
export function guardsTxtReachedFiles(root) {
  const manifestPath = path.join(root, "scripts/guards.txt");
  const raw = readFileSync(manifestPath, "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  let pkg = {};
  try {
    pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    // package.json is malformed / unreadable — treated as reaching nothing
    // extra via npm scripts; the direct scripts/*.mjs lines still resolve.
  }
  const pkgScripts = pkg.scripts || {};

  const reached = new Set();
  const npmScriptLines = new Set(); // which "npm run X" lines guards.txt has, for callers that also want this
  for (const line of lines) {
    const direct = line.match(/scripts\/([A-Za-z0-9._-]+\.mjs)/g) || [];
    direct.forEach((d) => reached.add(d.replace("scripts/", "")));
    const npmMatch = line.match(/^npm run ([A-Za-z0-9:_-]+)$/);
    if (npmMatch) {
      npmScriptLines.add(npmMatch[1]);
      const body = pkgScripts[npmMatch[1]] || "";
      (body.match(/scripts\/([A-Za-z0-9._-]+\.mjs)/g) || []).forEach((d) => reached.add(d.replace("scripts/", "")));
    }
  }
  return { reached, npmScriptLines, lineCount: lines.length };
}

// Which npm scripts (name -> body) reference a given scripts/*.mjs basename
// anywhere in their body — independent of whether guards.txt also reaches
// them (e.g. "postbuild" and "audit:regression" are real wiring that
// guards.txt never mentions).
export function npmScriptsReferencing(root, basename) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return [];
  }
  const scripts = pkg.scripts || {};
  const hits = [];
  for (const [name, body] of Object.entries(scripts)) {
    if (typeof body === "string" && body.includes(`scripts/${basename}`)) hits.push(name);
  }
  return hits;
}

// Which workflow files (.github/workflows/*.yml, ops/*.workflow.yml)
// reference a given scripts/*.mjs basename, either directly or via
// `npm run <script>` where <script>'s body references it. Returns
// [{ file, blocking }] where "blocking" means the workflow triggers on
// pull_request or push (merge-time), as opposed to schedule/workflow_dispatch
// (monitoring only, never blocks a merge or a deploy).
export function workflowsReferencing(root, basename, npmScriptNamesReferencing) {
  const dirs = [path.join(root, ".github/workflows"), path.join(root, "ops")];
  const hits = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!/\.ya?ml$/.test(f)) continue;
      const full = path.join(dir, f);
      const src = readFileSync(full, "utf8");
      const directHit = src.includes(`scripts/${basename}`);
      const npmHit = npmScriptNamesReferencing.some((n) => new RegExp(`npm run ${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(src));
      if (!directHit && !npmHit) continue;
      // Extract the top-level "on:" block only (from the line starting
      // "on:" up to the next line that starts at column 0 with a non-"on:"
      // key), so a comment mentioning "push" elsewhere in the file can't be
      // misread as the trigger.
      const lines = src.split(/\r?\n/);
      const onIdx = lines.findIndex((l) => /^on:/.test(l));
      let onBlock = "";
      if (onIdx !== -1) {
        onBlock = lines[onIdx];
        for (let i = onIdx + 1; i < lines.length; i++) {
          if (/^\S/.test(lines[i])) break; // next top-level key
          onBlock += "\n" + lines[i];
        }
      }
      const blocking = /(^|\n)\s*(pull_request|push)\s*:/.test(onBlock);
      hits.push({ file: path.relative(root, full), blocking });
    }
  }
  return hits;
}
