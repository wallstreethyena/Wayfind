// scripts/lib/deriveGuardRegistry.mjs — THE ONE CANONICAL DERIVATION of the
// machine-readable guard registry.
//
// WHY THIS FILE EXISTS (2026-09-07). The registry's mechanically-derived
// fields — class, assertionCount, wiring, gating, critical, and the rest —
// could go stale against the files they describe and NOTHING failed. Measured
// on main at 76e76968: the registry recorded scripts/test-api-guard.mjs as
// class CALL with 26 assertions when the file on disk was class RENDER with
// 49, and `check-guard-registry` reported OK. Four entries were wrong that
// day. The registry is the machine-readable answer to "is this guard real and
// what does it do"; a registry that can be wrong about a guard's class is the
// exact failure it exists to prevent.
//
// The root cause was structural, not clerical: the generator
// (build-guard-registry.mjs) OWNED the derivation, and the checker
// (check-guard-registry.mjs) could only read the generator's cached output.
// The checker had no way to ask "what SHOULD this say", so it could only
// verify things it could enumerate itself (file<->entry correspondence, live
// guards.txt wiring, required hand-authored fields). Everything mechanically
// derived was, by construction, unverifiable.
//
// So the derivation moved HERE, and both sides now call it:
//
//   build-guard-registry.mjs  -> deriveGuardRegistry(root) -> writes JSON
//   check-guard-registry.mjs  -> deriveGuardRegistry(root) -> compares JSON
//
// One function, two callers, no second implementation to drift. A stale
// snapshot is now a merge-blocking failure that names the exact field.
//
// DETERMINISM IS THE LOAD-BEARING PROPERTY. Everything this function returns
// is a pure function of the repo contents: the guard files on disk,
// scripts/guards.txt, package.json, the workflow YAML, check-guard-manifest's
// EXCLUDED block, and scripts/lib/guard-registry-overrides.json. It reads no
// environment, no clock, no network. The ONE nondeterministic field in the
// published registry — `generated`, a date stamp — is deliberately NOT
// produced here; the generator adds it on write and the comparison ignores
// it, so a registry regenerated on a different day is not reported as drift.
//
// The hand-authored fields (protects / blastRadius / owner) are still
// hand-authored, but they are hand-authored IN A CHECKED-IN FILE
// (guard-registry-overrides.json), which makes them just as derivable as the
// rest. Editing the override file without regenerating is drift too, and is
// now caught.
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  guardShapedFilesOnDisk,
  guardsTxtReachedFiles,
  npmScriptsReferencing,
  workflowsReferencing,
} from "./guardWiring.mjs";
import { analyzeGuardFile, findAssertionCalls } from "./guardHonestyAnalysis.mjs";

// ── 1. the audit's top-20 (citation — see build-guard-registry.mjs header) ──
export const TOP20_AUDIT_FILES = [
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
export const MONEY_RX = /\b(spend\w*|affiliat\w*|book(?:ing)?\w*|env(?:ironment)?|commerce\w*|viator|monet\w*)\b/i;
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
  if (start === -1) throw new Error("deriveGuardRegistry: could not find EXCLUDED in check-guard-manifest.mjs — extraction is now stale");
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
  const blocksDeploy = inGuardsTxt || npmScripts.some((s) => autoBuildScripts.has(s));
  const blocksCi = inGuardsTxt || workflows.some((w) => w.blocking);
  if (blocksCi && blocksDeploy) return "blocks-ci-and-deploy";
  if (blocksDeploy) return "blocks-deploy-only";
  if (blocksCi) return "blocks-ci-only";
  if (workflows.length > 0) return "scheduled-monitoring-only";
  if (npmScripts.length > 0) return "manual-npm-script-only";
  return "unwired";
}

export const SCHEMA_NOTES =
  "Mechanically-derived fields (class/assertionCount/wiring/gating/critical/criticalReasons) are regenerated every run from " +
  "scripts/guards.txt, package.json, .github/workflows/*.yml, ops/*.workflow.yml and scripts/lib/guardHonestyAnalysis.mjs — " +
  "editing them by hand will be overwritten on the next `node scripts/lib/build-guard-registry.mjs`. Hand-authored fields " +
  "(protects/blastRadius/owner) live in scripts/lib/guard-registry-overrides.json and are merged in; they are REQUIRED for " +
  "every entry with critical:true and optional elsewhere. scripts/check-guard-registry.mjs (the CI guard) re-derives guards.txt " +
  "wiring LIVE rather than trusting this file's cached `wiring.guardsTxt` — and since 2026-09-07 it also re-derives EVERY " +
  "mechanically-derived field via scripts/lib/deriveGuardRegistry.mjs and fails when the committed snapshot disagrees, so a " +
  "stale registry can no longer be merged unnoticed.";

/**
 * The single canonical derivation. Pure with respect to the repo: reads only
 * checked-in files, never the environment or the clock.
 *
 * Deliberately does NOT set `generated` — that is the one nondeterministic
 * field, added by the generator on write and skipped by diffRegistry.
 *
 * @param {string} root absolute repo root
 * @returns {{doc: object, missingOverrides: string[], incompleteCritical: {id:string, missing:string[]}[]}}
 */
export function deriveGuardRegistry(root) {
  const files = guardShapedFilesOnDisk(root); // "scripts/xxx.mjs", sorted
  const { reached: guardsTxtReached, lineCount: guardsTxtLineCount } = guardsTxtReachedFiles(root);
  const excludedReasons = readExcludedReasons(root);

  const overrides = JSON.parse(readFileSync(path.join(root, "scripts/lib/guard-registry-overrides.json"), "utf8"));

  const entries = [];
  const missingOverrides = [];

  for (const rel of files) {
    const basename = path.basename(rel);
    const abs = path.join(root, rel);
    const raw = readFileSync(abs, "utf8");
    const analysis = analyzeGuardFile(abs);
    const caps = analysis; // analyzeGuardFile spreads caps onto its result
    const assertionCount = findAssertionCalls(caps.code).length;

    const npmScripts = npmScriptsReferencing(root, basename);
    const workflows = workflowsReferencing(root, basename, npmScripts);
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
  // check:jsx`. Documented for completeness but deliberately outside the
  // file-based enumeration, so it can never be reported as an on-disk guard
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

  const incompleteCritical = [];
  for (const e of entries) {
    if (!e.critical) continue;
    const missing = [];
    if (!e.protects || !String(e.protects).trim()) missing.push("protects");
    if (!e.blastRadius?.category || !String(e.blastRadius.category).trim()) missing.push("blastRadius.category");
    if (!e.blastRadius?.detail || !String(e.blastRadius.detail).trim()) missing.push("blastRadius.detail");
    if (!e.owner || !String(e.owner).trim()) missing.push("owner");
    if (missing.length) incompleteCritical.push({ id: e.file ?? `npm:${e.npmScript}`, missing });
  }

  const criticalCount = entries.filter((e) => e.critical).length;
  const unwiredCriticalCount = entries.filter((e) => e.critical && e.file && !e.wiring.guardsTxt).length;

  const doc = {
    generator: "scripts/lib/build-guard-registry.mjs",
    derivation: "scripts/lib/deriveGuardRegistry.mjs",
    schemaNotes: SCHEMA_NOTES,
    moneyKeywordRegexSource: MONEY_RX.source,
    top20AuditFiles: TOP20_AUDIT_FILES,
    counts: {
      totalOnDiskGuardFiles: files.length,
      totalRegistryEntries: entries.length,
      guardsTxtLineCount,
      guardsTxtReachedFileCount: guardsTxtReached.size,
      criticalCount,
      unwiredCriticalCount,
      classCounts: {
        CALL: entries.filter((e) => e.class === "CALL").length,
        RENDER: entries.filter((e) => e.class === "RENDER").length,
        STRUCTURAL: entries.filter((e) => e.class === "STRUCTURAL").length,
        OTHER: entries.filter((e) => e.class === "OTHER").length,
      },
    },
    entries,
  };

  return { doc, missingOverrides, incompleteCritical };
}

/**
 * Fields in the published registry that are NOT a function of repo contents.
 * The comparison skips these, so regenerating on a different day is not drift.
 * Keep this list as small as it possibly can be: every name here is a field
 * the parity check cannot protect.
 */
export const NONDETERMINISTIC_TOP_LEVEL_FIELDS = Object.freeze(["generated"]);

function entryId(e) {
  return e && e.file != null ? e.file : `npm:${e && e.npmScript}`;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepDiff(committed, derived, prefix, out, limit) {
  if (out.length >= limit) return;
  if (Array.isArray(committed) && Array.isArray(derived)) {
    if (committed.length !== derived.length) {
      out.push({ path: `${prefix}.length`, committed: committed.length, derived: derived.length });
      // Still walk the overlap so the reader sees WHICH element changed, not
      // just that the count moved.
    }
    const n = Math.min(committed.length, derived.length);
    for (let i = 0; i < n; i++) deepDiff(committed[i], derived[i], `${prefix}[${i}]`, out, limit);
    return;
  }
  if (isPlainObject(committed) && isPlainObject(derived)) {
    const keys = [...new Set([...Object.keys(committed), ...Object.keys(derived)])].sort();
    for (const k of keys) {
      if (!(k in committed)) { out.push({ path: `${prefix}.${k}`, committed: "<absent>", derived: derived[k] }); continue; }
      if (!(k in derived)) { out.push({ path: `${prefix}.${k}`, committed: committed[k], derived: "<absent>" }); continue; }
      deepDiff(committed[k], derived[k], `${prefix}.${k}`, out, limit);
      if (out.length >= limit) return;
    }
    return;
  }
  if (committed !== derived) out.push({ path: prefix, committed, derived });
}

/**
 * Compare a committed registry document against a freshly derived one.
 *
 * Entries are matched by IDENTITY (file path, or "npm:<script>"), never by
 * array position, so a guard added in the middle of the alphabet reports as
 * one added entry rather than as several hundred shifted ones.
 *
 * @returns {{path:string, committed:any, derived:any}[]} empty when in sync
 */
export function diffRegistry(committed, derived, limit = 40) {
  const out = [];
  const skip = new Set([...NONDETERMINISTIC_TOP_LEVEL_FIELDS, "entries"]);

  const topKeys = [...new Set([...Object.keys(committed || {}), ...Object.keys(derived || {})])]
    .filter((k) => !skip.has(k))
    .sort();
  for (const k of topKeys) {
    if (out.length >= limit) return out;
    if (!(k in (committed || {}))) { out.push({ path: k, committed: "<absent>", derived: derived[k] }); continue; }
    if (!(k in (derived || {}))) { out.push({ path: k, committed: committed[k], derived: "<absent>" }); continue; }
    deepDiff(committed[k], derived[k], k, out, limit);
  }

  const cEntries = Array.isArray(committed?.entries) ? committed.entries : [];
  const dEntries = Array.isArray(derived?.entries) ? derived.entries : [];
  const cById = new Map(cEntries.map((e) => [entryId(e), e]));
  const dById = new Map(dEntries.map((e) => [entryId(e), e]));
  const ids = [...new Set([...cById.keys(), ...dById.keys()])].sort();
  for (const id of ids) {
    if (out.length >= limit) return out;
    if (!cById.has(id)) { out.push({ path: `entries[${id}]`, committed: "<absent>", derived: "<present>" }); continue; }
    if (!dById.has(id)) { out.push({ path: `entries[${id}]`, committed: "<present>", derived: "<absent>" }); continue; }
    deepDiff(cById.get(id), dById.get(id), `entries[${id}]`, out, limit);
  }
  return out;
}
