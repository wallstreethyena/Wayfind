#!/usr/bin/env node
// scripts/lib/build-guard-registry.mjs — GENERATOR for scripts/lib/guard-registry.json.
//
// This is NOT a guard (not wired into scripts/guards.txt) — it is the tool
// that PRODUCES the checked-in registry. Run it by hand after adding/moving/
// renaming a guard, or after editing scripts/lib/guard-registry-overrides.json:
//
//   node scripts/lib/build-guard-registry.mjs
//
// 2026-09-07: THE DERIVATION NO LONGER LIVES HERE. It moved to
// scripts/lib/deriveGuardRegistry.mjs, which this file and
// scripts/check-guard-registry.mjs both call. This file's only remaining job
// is to add the `generated` date stamp and WRITE the JSON. The checker calls
// the same function, derives the truth in memory, and fails when the
// committed snapshot disagrees on any mechanically-derived field — so a stale
// registry is now a merge-blocking failure instead of a silent lie. See that
// module's header for the measured incident (main 76e76968: the registry said
// test-api-guard was CALL/26 when the file was RENDER/49, and the check
// reported OK).
//
// Consequence worth knowing: editing a guard file, scripts/guards.txt,
// package.json, a workflow YAML, or guard-registry-overrides.json and NOT
// re-running this generator now fails the build. That is the point.
//
// WHAT COUNTS AS "CRITICAL" (mechanical, reproducible — never a hand-typed
// list of guard names). Both rules now LIVE IN deriveGuardRegistry.mjs, which
// exports TOP20_AUDIT_FILES and MONEY_RX; they are documented here because
// this is the file an operator runs:
//   1. TOP20_AUDIT_FILES — the 20 numbered rows of the "Top-20 most
//      dangerous" table in docs/audits/guard-honesty-2026-09-04.md (as of
//      2026-09-04, on branch ship/audit-trio-2026-09-04, not yet merged to
//      main as of this writing). That table is itself the product of a
//      human-read audit, so the LIST is necessarily a fixed citation — but
//      it is a citation of a specific, retrievable source, not invention.
//   2. MONEY_RX, applied to (a) the guard's own filename and (b) the
//      basename of every lib/ or app/ module it imports (via
//      guardHonestyAnalysis.detectCapabilities' importScanCode) — "anything
//      touching money": spend, affiliate, booking, env(ironment), commerce,
//      plus viator/monetize (Wayfind's principal revenue partner and the
//      literal word "monetize" are unambiguously money even though they
//      are not literally one of the task's five example words).
import { writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "./guardWiring.mjs";
import { deriveGuardRegistry } from "./deriveGuardRegistry.mjs";

const ROOT = repoRoot(import.meta.url);

function main() {
  const { doc: derived, missingOverrides, incompleteCritical } = deriveGuardRegistry(ROOT);

  if (missingOverrides.length) {
    console.error(`build-guard-registry: FAIL — ${missingOverrides.length} guard(s) are CRITICAL (money-keyword or top-20-audit match) but have no entry in scripts/lib/guard-registry-overrides.json:`);
    missingOverrides.forEach((f) => console.error(`    ${f}`));
    console.error("Add {protects, blastRadius:{category,detail}, owner} for each, then re-run.");
    process.exit(1);
  }
  if (incompleteCritical.length) {
    console.error(`build-guard-registry: FAIL — ${incompleteCritical.length} critical entr${incompleteCritical.length === 1 ? "y is" : "ies are"} missing a required field:`);
    incompleteCritical.forEach((e) => console.error(`    ${e.id}: missing ${e.missing.join(", ")}`));
    process.exit(1);
  }

  // `generated` is the ONE field the derivation deliberately does not produce
  // (a clock read is not a function of the repo). It is added here on write
  // and skipped by diffRegistry, so regenerating on a different day is not
  // reported as drift.
  const doc = { generated: new Date().toISOString().slice(0, 10), ...derived };

  const outPath = path.join(ROOT, "scripts/lib/guard-registry.json");
  writeFileSync(outPath, JSON.stringify(doc, null, 2) + "\n");

  const { counts } = doc;
  console.log(
    `build-guard-registry: wrote ${counts.totalRegistryEntries} entries (${counts.totalOnDiskGuardFiles} on-disk guard files + 1 tsc-wrapper entry) to scripts/lib/guard-registry.json`
  );
  console.log(`  critical: ${counts.criticalCount}, currently unwired-from-guards.txt-and-critical: ${counts.unwiredCriticalCount}`);
  if (counts.unwiredCriticalCount) {
    console.log("  (this is a real finding, not a bug in the generator — see scripts/check-guard-registry.mjs)");
    doc.entries.filter((e) => e.critical && e.file && !e.wiring.guardsTxt).forEach((e) => console.log(`    UNWIRED CRITICAL: ${e.file}`));
  }
}

main();
