#!/usr/bin/env node
import { analyzeGuardFile } from "../lib/guardHonestyAnalysis.mjs";
const file = process.argv[2];
try {
  const r = analyzeGuardFile(file);
  process.stdout.write(JSON.stringify({ file, violations: r.violations, hasStructuralOnlyTag: r.hasStructuralOnlyTag, canExecute: r.canExecute, hasRenderHarness: r.hasRenderHarness, hasChildProcessExec: r.hasChildProcessExec, hasLibAppImport: r.hasLibAppImport }));
} catch (e) {
  process.stdout.write(JSON.stringify({ file, violations: ["ANALYSIS_ERROR: " + e.message] }));
}
