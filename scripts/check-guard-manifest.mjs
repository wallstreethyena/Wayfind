#!/usr/bin/env node
/**
 * scripts/check-guard-manifest.mjs — the meta-guard.
 *
 * A guard that exists on disk but runs nowhere protects nothing while looking
 * like protection. That was real: on 2026-07-28 five guard-shaped scripts were
 * found never wired into prebuild, two of which had silently gone stale.
 *
 * So: every scripts/{check,test}-*.mjs must be EITHER listed in
 * scripts/guards.txt OR declared below with a reason. There is no third
 * option, and "forgot to wire it up" cannot survive review.
 *
 * Also asserts the manifest can't rot in the other direction — a listed guard
 * whose file no longer exists fails here rather than at 3am in prebuild.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

// Every exclusion needs a reason. Keep this list short and argued.
const EXCLUDED = {
  "check-bundle.mjs": "runs in `npm run audit:regression` — needs a completed next build, too slow for every prebuild",
  "check-headers.mjs": "runs in `npm run audit:regression` — asserts deployed response headers, needs a live origin",
  "check-moment.mjs": "STALE as of 2026-07-28: fails on 'trust copy must appear in overlay AND sheet'. The UI it guards changed in the design release; needs triage — either the copy regressed or the guard is obsolete. Deliberately not wired in while red.",
  "check-ux.mjs": "STALE as of 2026-07-28: fails on 'mood kicker missing'. Same situation as check-moment.mjs — triage, then either fix the surface or retire the guard.",
};

const MANIFEST = path.resolve("scripts/guards.txt");
const SCRIPTS = path.resolve("scripts");

let raw;
try {
  raw = readFileSync(MANIFEST, "utf8");
} catch (e) {
  console.error(`check-guard-manifest: FAIL — cannot read scripts/guards.txt: ${e.message}`);
  process.exit(1);
}

const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

// Which guard files does the manifest actually reach? Includes guards invoked
// indirectly via `npm run <script>`, so an npm-wrapped guard still counts.
const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8"));
const reached = new Set();
for (const line of lines) {
  const direct = line.match(/scripts\/([A-Za-z0-9._-]+\.mjs)/g) || [];
  direct.forEach((d) => reached.add(d.replace("scripts/", "")));
  const npmRun = line.match(/^npm run ([A-Za-z0-9:_-]+)$/);
  if (npmRun) {
    const body = (pkg.scripts || {})[npmRun[1]] || "";
    (body.match(/scripts\/([A-Za-z0-9._-]+\.mjs)/g) || []).forEach((d) => reached.add(d.replace("scripts/", "")));
  }
}

const onDisk = readdirSync(SCRIPTS).filter((f) => /^(check|test)-.*\.mjs$/.test(f));

let failed = 0;

// 1. Nothing guard-shaped may be silently unwired.
const unaccounted = onDisk.filter((f) => !reached.has(f) && !(f in EXCLUDED));
if (unaccounted.length) {
  failed++;
  console.error("check-guard-manifest: FAIL — guard-shaped scripts neither listed in scripts/guards.txt nor excluded:");
  unaccounted.forEach((f) => console.error(`    scripts/${f}`));
  console.error("  Add it to scripts/guards.txt (one line), or declare it in EXCLUDED with a reason.");
}

// 2. Exclusions must be real files, so the list can't accumulate ghosts.
const ghostExclusions = Object.keys(EXCLUDED).filter((f) => !existsSync(path.join(SCRIPTS, f)));
if (ghostExclusions.length) {
  failed++;
  console.error("check-guard-manifest: FAIL — EXCLUDED names a file that no longer exists:");
  ghostExclusions.forEach((f) => console.error(`    scripts/${f}`));
}

// 3. A guard can't be excluded AND listed — that reads as protected but the
//    reason says otherwise, which is exactly the ambiguity this file removes.
const both = Object.keys(EXCLUDED).filter((f) => reached.has(f));
if (both.length) {
  failed++;
  console.error("check-guard-manifest: FAIL — listed in guards.txt AND in EXCLUDED:");
  both.forEach((f) => console.error(`    scripts/${f}`));
}

// 4. The manifest can't reference a guard that isn't there.
const missing = [...reached].filter((f) => !existsSync(path.join(SCRIPTS, f)));
if (missing.length) {
  failed++;
  console.error("check-guard-manifest: FAIL — guards.txt references missing files:");
  missing.forEach((f) => console.error(`    scripts/${f}`));
}

if (failed) process.exit(1);

console.log(
  `check-guard-manifest: OK — ${onDisk.length} guard scripts accounted for ` +
  `(${reached.size} wired, ${Object.keys(EXCLUDED).length} excluded with reasons), no ghosts, no missing files`
);
