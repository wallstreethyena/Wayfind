#!/usr/bin/env node
// scripts/npm-audit-ci.mjs — the GitHub dependency audit.
//
// Same bar as `npm audit --audit-level=moderate`: moderate, high, and critical
// advisories fail. Low advisories do not.
//
// One exception, and only this one:
// GHSA-fc5q-39xc-vjpf — picomatch ReDoS through repeated extglobs.
// https://github.com/advisories/GHSA-fc5q-39xc-vjpf
// Build-time only. The inputs are our own patterns. No patched release exists.
// Approved by Gabe 2026-11-17.
//
// The exception is valid through 2027-01-31 UTC. It also stops as soon as npm
// publishes a picomatch version outside the advisory's vulnerable range.
// Any other advisory still fails.

import { execFileSync } from "node:child_process";
import {
  PICO_AUDIT_EXPIRY,
  PICO_AUDIT_GHSA,
  PICO_AUDIT_URL,
  auditDecision,
} from "./lib/npmAuditException.mjs";

function capture(args) {
  try {
    return { code: 0, stdout: execFileSync("npm", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }) };
  } catch (err) {
    return {
      code: Number.isInteger(err.status) ? err.status : 1,
      stdout: err.stdout ? String(err.stdout) : "",
      stderr: err.stderr ? String(err.stderr) : "",
    };
  }
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

const auditRun = capture(["audit", "--json", "--audit-level=moderate"]);
let audit;
try {
  audit = JSON.parse(auditRun.stdout || "");
} catch {
  console.error("npm-audit-ci: npm audit did not return JSON");
  if (auditRun.stderr) console.error(auditRun.stderr);
  process.exit(1);
}

const versionsRun = capture(["view", "picomatch", "versions", "--json"]);
let versions = null;
try {
  const parsed = JSON.parse(versionsRun.stdout || "");
  if (Array.isArray(parsed)) versions = parsed;
} catch {
  versions = null;
}

const decision = auditDecision({ audit, today: todayUtc(), versions });
if (!decision.fail) {
  if (decision.reason === "exception") {
    console.log(
      "npm-audit-ci: exception " + PICO_AUDIT_GHSA +
      " applied (picomatch " + decision.range +
      ", no published version outside that range, valid through " + PICO_AUDIT_EXPIRY +
      " UTC). " + PICO_AUDIT_URL + ". Approved by Gabe 2026-11-17."
    );
  } else {
    console.log("npm-audit-ci: OK — no moderate, high, or critical advisories");
  }
  process.exit(0);
}

console.error("npm-audit-ci: FAIL — " + decision.reason);
if (decision.version) console.error("published picomatch " + decision.version + " is outside " + decision.range);
for (const item of decision.advisories || []) {
  console.error("  " + (item.id || item.name) + " " + item.severity + " " + item.range + " " + item.url);
}
console.error("--- npm audit --audit-level=moderate ---");
const shown = capture(["audit", "--audit-level=moderate"]);
process.stdout.write(shown.stdout || "");
process.stderr.write(shown.stderr || "");
process.exit(shown.code || 1);
