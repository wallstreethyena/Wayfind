#!/usr/bin/env node
// Reads one `npm audit --json` document and exits 0 only when every moderate,
// high, or critical advisory is GHSA-fc5q-39xc-vjpf. See
// scripts/lib/npmAuditAllowlist.mjs for why that one id is excepted.
import { readFileSync } from "node:fs";
import { unexpectedAdvisories, picomatchExceptionSeen, PICOMATCH_REDOS } from "./lib/npmAuditAllowlist.mjs";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/audit-allowlist.mjs <npm-audit.json>");
  process.exit(2);
}
let report;
try {
  report = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`Dependency security audit: report is not JSON (${e.message})`);
  process.exit(1);
}
const problems = unexpectedAdvisories(report);
if (problems.length) {
  console.error(`Dependency security audit failed. Only ${PICOMATCH_REDOS} may be ignored:`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
if (picomatchExceptionSeen(report)) {
  console.log(`Dependency security audit: ignored ${PICOMATCH_REDOS} (picomatch ReDoS, no patched release). Remove scripts/lib/npmAuditAllowlist.mjs when picomatch ships a fix. Every other moderate or higher advisory still fails.`);
} else {
  console.log(`Dependency security audit: no moderate or higher advisories. The ${PICOMATCH_REDOS} exception was not needed; remove it.`);
}
