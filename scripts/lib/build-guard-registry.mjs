#!/usr/bin/env node
// scripts/lib/build-guard-registry.mjs — GENERATOR for scripts/lib/guard-registry.json.
//
// This is NOT a guard (not wired into scripts/guards.txt) — it is the tool
// that PRODUCES the checked-in registry. Run it by hand after adding/moving/
// renaming a guard, or after editing scripts/lib/guard-registry-overrides.json:
//
//   node scripts/lib/build-guard-registry.mjs
//
// scripts/check-guard-registry.mjs (the actual CI guard) does NOT trust this
// file's cached wiring/class data for its pass/fail decisions — it re-derives
// "is this guard wired into scripts/guards.txt" LIVE, every run, straight
// from scripts/guards.txt itself (via scripts/lib/guardWiring.mjs), exactly
// so a stale registry can never report a disconnected guard as connected.
// The registry's mechanically-derived fields exist for the OWNER'S reading
// (what class is this, how many assertions, is it wired anywhere at all) —
// the one property the CI guard treats as load-bearing is "critical guards
// need required hand-authored fields", which it also re-validates itself.
//
// WHAT COUNTS AS "CRITICAL" (mechanical, reproducible — never a hand-typed
// list of guard names):
//   1. TOP20_AUDIT_FILES below — the 20 numbered rows of the "Top-20 most
//      dangerous" table in docs/audits/guard-honesty-2026-09-04.md (as of
//      2026-09-04, on branch ship/audit-trio-2026-09-04, not yet merged to
//      main as of this writing). That table is itself the product of a
//      human-read audit, so the LIST is necessarily a fixed citation — but
//      it is a citation of a specific, retrievable source, not invention.
//   2. MONEY_RX below, applied to (a) the guard's own filename and (b) the
//      basename of every lib/ or app/ module it imports (via
//      guardHonestyAnalysis.detectCapabilities' importScanCode) — "anything
//      touching money": spend, affiliate, booking, env(ironment), commerce,
//      plus viator/monetize (Wayfind's principal revenue partner and the
//      literal word "monetize" are unambiguously money even though they
//      are not literally one of the task's five example words).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  repoRoot,
  guardShapedFilesOnDisk,
  guardsTxtReachedFiles,
  npmScriptsReferencing,
  workflowsReferencing,
} from "./guardWiring.mjs";
import { analyzeGuardFile, findAssertionCalls } from "./guardHonestyAnalysis.mjs";

const ROOT = repoRoot(import.meta.url);

// ── 1. the audit's top-20 (citation, see header) ───────────────────────────
const TOP20_AUDIT_FILES = [
  "check-env.mjs",
  "check-spend-guard.mjs",
  "test-booking-integrity.mjs",
  "check-hydration-style.mjs",
  "check-unified-commerce-rail.mjs",
  "check-direct-affiliate-urls.mjs",
  "check-promote-spend-gate.mjs",
  "check-commerce-redirect.mjs",
  "test-card-booking.mjs",
  "test-sheet-booking.mjs",
  "check-guide-cta-honesty.mjs",
  "check-cost-gate.mjs",
  "test-city-gate.mjs",
  "check-geo-gated-boosts.mjs",
  "check-price-badge.mjs",
  "check-spend-effective-cap.mjs",
  "test-booking-resolve-extraction.mjs",
  "check-doc-ownership.mjs",
  "check-guide-share.mjs",
  "check-editorial-everywhere.mjs",
];

// ── 2. money keywords (mechanical match against filenames + lib/app imports) ─
const MONEY_RX = /\b(spend\w*|affiliat\w*|book(?:ing)?\w*|env(?:ironment)?|commerce\w*|viator|monet\w*)\b/i;
const IMPORT_SPEC_G = /(?:from|require\()\s*["']((?:\.{1,2}\/)+(?:lib|app)\/[^"']*|(?:lib|app)\/[^"']*)["']/g;
const DYN_IMPORT_SPEC_G = /\bimport\s*\(\s*[^)]*["']((?:\.{1,2}\/)+(?:lib|app)\/[^"']*|(?:lib|app)\/[^"']*)["']/g;

function moneyImportSpecs(importScanCode) {
  const specs = new Set();
  let m;
  IMPORT_SPEC_G.lastIndex = 0;
  while ((m = IMPORT_SPEC_G.exec(importScanCode))) specs.add(m[1]);
  DYN_IMPORT_SPEC_G.lastIndex = 0;
  while ((m = DYN_IMPORT_SPEC_G.exec(importScanCode))) specs.add(m[1]);
  return [...specs].filter((s) => MONEY_RX.test(path.basename(s, path.extname(s))));
}

// ── 3. EXCLUDED-with-reason, read straight out of check-guard-manifest.mjs's
// own EXCLUDED object literal (mechanical extraction, not re-typed) ────────
function readExcludedReasons(root) {
  const src = readFileSync(path.join(root, "scripts/check-guard-manifest.mjs"), "utf8");
  const start = src.indexOf("const EXCLUDED = {");
  if (start === -1) throw new Error("build-guard-registry: could not find EXCLUDED in check-guard-manifest.mjs — extraction is now stale");
  const end = src.indexOf("\n};", start);
  const block = src.slice(start, end);
  const entryRx = /"([^"]+\.mjs)":\s*"((?:[^"\\]|\\.)*)"/g;
  const out = {};
  let m;
  while ((m = entryRx.exec(block))) out[m[1]] = m[2].replace(/\\"/g, '"');
  return out;
}

// ── 4. gating classification from live wiring ───────────────────────────────
function classifyGating({ inGuardsTxt, npmScripts, workflows }) {
  const autoBuildScripts = new Set(["postbuild", "prebuild", "build"]);
  // Deploy-blocking: reached via guards.txt (npm run prebuild, which every
  // `npm run build` triggers) OR via an npm pre/post-build hook that npm
  // itself runs automatically around `npm run build` (e.g. "postbuild").
  const blocksDeploy = inGuardsTxt || npmScripts.some((s) => autoBuildScripts.has(s));
  // CI-blocking: reached via guards.txt (guards.yml's `node run-guards.mjs`
  // step covers the whole manifest) OR named as an explicit step in a
  // workflow that triggers on pull_request/push.
  const blocksCi = inGuardsTxt || workflows.some((w) => w.blocking);
  if (blocksCi && blocksDeploy) return "blocks-ci-and-deploy";
  if (blocksDeploy) return "blocks-deploy-only";
  if (blocksCi) return "blocks-ci-only";
  if (workflows.length > 0) return "scheduled-monitoring-only";
  if (npmScripts.length > 0) return "manual-npm-script-only";
  return "unwired";
}

// ── main ─────────────────────────────────────────────────────────────────
function main() {
  const files = guardShapedFilesOnDisk(ROOT); // "scripts/xxx.mjs", sorted
  const { reached: guardsTxtReached, lineCount: guardsTxtLineCount } = guardsTxtReachedFiles(ROOT);
  const excludedReasons = readExcludedReasons(ROOT);

  const overridesPath = path.join(ROOT, "scripts/lib/guard-registry-overrides.json");
  const overrides = JSON.parse(readFileSync(overridesPath, "utf8"));

  const entries = [];
  const missingOverrides = [];

  for (const rel of files) {
    const basename = path.basename(rel);
    const abs = path.join(ROOT, rel);
    const raw = readFileSync(abs, "utf8");
    const analysis = analyzeGuardFile(abs);
    const caps = analysis; // analyzeGuardFile spreads caps onto its result
    const assertionCount = findAssertionCalls(caps.code).length;

    const npmScripts = npmScriptsReferencing(ROOT, basename);
    const workflows = workflowsReferencing(ROOT, basename, npmScripts);
    const inGuardsTxt = guardsTxtReached.has(basename);
    const gating = classifyGating({ inGuardsTxt, npmScripts, workflows });

    const klass = caps.hasRenderHarness ? "RENDER" : caps.hasLibAppImport || caps.hasChildProcessExec ? "CALL" : "STRUCTURAL";

    const moneySpecs = moneyImportSpecs(caps.importScanCode);
    const filenameMoneyMatch = MONEY_RX.test(basename.replace(/\.mjs$/, ""));
    const criticalReasons = [];
    if (TOP20_AUDIT_FILES.includes(basename)) criticalReasons.push("top-20-audit (docs/audits/guard-honesty-2026-09-04.md)");
    if (filenameMoneyMatch) criticalReasons.push(`money-keyword-in-filename:${basename.match(MONEY_RX)[0].toLowerCase()}`);
    if (moneySpecs.length) criticalReasons.push(`money-keyword-in-import:${moneySpecs.join(",")}`);
    const critical = criticalReasons.length > 0;

    const override = overrides[rel] || null;
    if (critical && !override) missingOverrides.push(rel);

    entries.push({
      file: rel,
      npmScript: null,
      class: klass,
      hasStructuralOnlyTag: caps.hasStructuralOnlyTag,
      assertionCount,
      unprovenAbsenceCount: analysis.unproven.length,
      honestyViolations: analysis.violations,
      selfDocumentsRedProve: /red[- ]prove/i.test(raw),
      wiring: {
        guardsTxt: inGuardsTxt,
        npmScripts,
        githubWorkflows: workflows,
      },
      gating,
      excludedReason: excludedReasons[basename] || null,
      critical,
      criticalReasons,
      protects: override?.protects ?? null,
      blastRadius: override?.blastRadius ?? null,
      owner: override?.owner ?? null,
    });
  }

  // The one guards.txt line that is NOT a scripts/*.mjs file: `npm run
  // check:jsx` (tsc --noEmit over a fixed file list — see check-guard-manifest
  // .mjs's own EXCLUDED mapping of "check:jsx" -> null). Documented for
  // completeness ("for every guard") but deliberately outside the file-based
  // enumeration above, so it can never be reported as an on-disk guard
  // missing a registry entry.
  entries.push({
    file: null,
    npmScript: "check:jsx",
    class: "OTHER",
    hasStructuralOnlyTag: null,
    assertionCount: null,
    unprovenAbsenceCount: null,
    honestyViolations: [],
    selfDocumentsRedProve: false,
    wiring: { guardsTxt: true, npmScripts: ["check:jsx"], githubWorkflows: [] },
    gating: "blocks-ci-and-deploy",
    excludedReason: null,
    critical: false,
    criticalReasons: [],
    protects: "TypeScript can bind the app's key client surfaces (tsc --noEmit over the fixed file list in package.json's check:jsx script).",
    blastRadius: { category: "correctness", detail: "A type/import error here is a build-time signal only — it does not itself gate money, it gates code health on the surfaces listed." },
    owner: "Qwen (Engineering)",
  });

  if (missingOverrides.length) {
    console.error(`build-guard-registry: FAIL — ${missingOverrides.length} guard(s) are CRITICAL (money-keyword or top-20-audit match) but have no entry in scripts/lib/guard-registry-overrides.json:`);
    missingOverrides.forEach((f) => console.error(`    ${f}`));
    console.error("Add {protects, blastRadius:{category,detail}, owner} for each, then re-run.");
    process.exit(1);
  }

  // Validate override completeness for every critical entry (belt+suspenders
  // with scripts/check-guard-registry.mjs's own re-validation at check time).
  const incomplete = entries.filter((e) => e.critical && (!e.protects || !e.blastRadius?.category || !e.blastRadius?.detail || !e.owner));
  if (incomplete.length) {
    console.error(`build-guard-registry: FAIL — ${incomplete.length} critical entr${incomplete.length === 1 ? "y is" : "ies are"} missing a required field:`);
    incomplete.forEach((e) => console.error(`    ${e.file || e.npmScript}`));
    process.exit(1);
  }

  const criticalCount = entries.filter((e) => e.critical).length;
  const unwiredCritical = entries.filter((e) => e.critical && e.file && !e.wiring.guardsTxt);

  const doc = {
    generated: new Date().toISOString().slice(0, 10),
    generator: "scripts/lib/build-guard-registry.mjs",
    schemaNotes:
      "Mechanically-derived fields (class/assertionCount/wiring/gating/critical/criticalReasons) are regenerated every run from " +
      "scripts/guards.txt, package.json, .github/workflows/*.yml, ops/*.workflow.yml and scripts/lib/guardHonestyAnalysis.mjs — " +
      "editing them by hand will be overwritten on the next `node scripts/lib/build-guard-registry.mjs`. Hand-authored fields " +
      "(protects/blastRadius/owner) live in scripts/lib/guard-registry-overrides.json and are merged in; they are REQUIRED for " +
      "every entry with critical:true and optional elsewhere. scripts/check-guard-registry.mjs (the CI guard) re-derives guards.txt " +
      "wiring LIVE rather than trusting this file's cached `wiring.guardsTxt` — this snapshot is for humans reading the registry.",
    moneyKeywordRegexSource: MONEY_RX.source,
    top20AuditFiles: TOP20_AUDIT_FILES,
    counts: {
      totalOnDiskGuardFiles: files.length,
      totalRegistryEntries: entries.length,
      guardsTxtLineCount,
      guardsTxtReachedFileCount: guardsTxtReached.size,
      criticalCount,
      unwiredCriticalCount: unwiredCritical.length,
      classCounts: {
        CALL: entries.filter((e) => e.class === "CALL").length,
        RENDER: entries.filter((e) => e.class === "RENDER").length,
        STRUCTURAL: entries.filter((e) => e.class === "STRUCTURAL").length,
        OTHER: entries.filter((e) => e.class === "OTHER").length,
      },
    },
    entries,
  };

  const outPath = path.join(ROOT, "scripts/lib/guard-registry.json");
  writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");
  console.log(
    `build-guard-registry: wrote ${entries.length} entries (${files.length} on-disk guard files + 1 tsc-wrapper entry) to scripts/lib/guard-registry.json`
  );
  console.log(`  critical: ${criticalCount}, currently unwired-from-guards.txt-and-critical: ${unwiredCritical.length}`);
  if (unwiredCritical.length) {
    console.log("  (this is a real finding, not a bug in the generator — see scripts/check-guard-registry.mjs)");
    unwiredCritical.forEach((e) => console.log(`    UNWIRED CRITICAL: ${e.file}`));
  }
}

main();
