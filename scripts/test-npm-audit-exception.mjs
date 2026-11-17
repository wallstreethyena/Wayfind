#!/usr/bin/env node
// scripts/test-npm-audit-exception.mjs
// The picomatch audit exception is one advisory, and it expires.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PICO_AUDIT_EXPIRY,
  PICO_AUDIT_GHSA,
  PICO_AUDIT_URL,
  auditDecision,
  moderateAdvisories,
  picoExceptionActive,
} from "./lib/npmAuditException.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0;
let fails = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };

const GHSA = {
  source: 1,
  name: "picomatch",
  severity: "high",
  range: "<=4.0.7",
  title: "picomatch ReDoS",
  url: PICO_AUDIT_URL,
};
const OTHER = {
  source: 2,
  name: "left-pad",
  severity: "moderate",
  range: "<1.0.0",
  title: "something else",
  url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz",
};
const versions = ["2.3.1", "4.0.5", "4.0.7"];

function audit(vias) {
  return { vulnerabilities: { picomatch: { name: "picomatch", severity: "high", via: vias } } };
}

ok(PICO_AUDIT_GHSA === "GHSA-fc5q-39xc-vjpf" && PICO_AUDIT_EXPIRY === "2027-01-31",
  "the exception names one advisory and expires 2027-01-31");
ok(moderateAdvisories(audit([GHSA])).length === 1, "positive control: the advisory reader sees the picomatch GHSA");
ok(moderateAdvisories(audit([{ ...GHSA, severity: "low" }])).length === 0,
  "a low advisory does not fail, matching npm audit --audit-level=moderate");
ok(moderateAdvisories({ vulnerabilities: { rollup: { via: ["picomatch"] } } }).length === 0,
  "a transitive via string is not a second advisory");

const allowed = auditDecision({ audit: audit([GHSA]), today: "2026-11-17", versions });
ok(allowed.fail === false && allowed.reason === "exception",
  "the single picomatch advisory is allowed before the expiry while every release is still vulnerable");
ok(auditDecision({ audit: { vulnerabilities: {} }, today: "2026-11-17", versions }).fail === false,
  "a clean audit passes");
ok(auditDecision({ audit: audit([GHSA, OTHER]), today: "2026-11-17", versions }).fail === true,
  "any other advisory still fails");
ok(auditDecision({ audit: audit([OTHER]), today: "2026-11-17", versions }).reason === "other-advisories",
  "an unrelated advisory fails even when picomatch is quiet");

const expired = auditDecision({ audit: audit([GHSA]), today: "2027-02-01", versions });
ok(expired.fail === true && expired.reason === "expired",
  "the exception fails starting 2027-02-01 UTC");
ok(auditDecision({ audit: audit([GHSA]), today: "2027-01-31", versions }).fail === false,
  "2027-01-31 UTC is still inside the exception");

const patched = auditDecision({ audit: audit([GHSA]), today: "2026-11-17", versions: versions.concat(["4.0.8"]) });
ok(patched.fail === true && patched.reason === "patched-version" && patched.version === "4.0.8",
  "a published picomatch outside the vulnerable range ends the exception");
ok(picoExceptionActive({ today: "2026-11-17", versions: [], vulnerableRange: "<=4.0.7" }).active === false,
  "an empty version list cannot prove that no patch exists");
ok(auditDecision({ audit: audit([{ ...GHSA, range: "" }]), today: "2026-11-17", versions }).fail === true,
  "a missing vulnerable range does not get the exception");

const wf = readFileSync(join(ROOT, ".github/workflows/guards.yml"), "utf8");
const at = wf.indexOf("name: Dependency security audit");
const step = wf.slice(Math.max(0, at - 900), at + 400);
ok(step.includes("node scripts/npm-audit-ci.mjs"), "the audit step runs the exception script");
ok(step.includes(PICO_AUDIT_GHSA) && step.includes(PICO_AUDIT_URL) && step.includes("2027-01-31"),
  "the workflow names the advisory, its link, and the expiry");
ok(/approved by Gabe 2026-11-17/i.test(step), "the workflow records Gabe's approval");
const src = readFileSync(join(ROOT, "scripts/npm-audit-ci.mjs"), "utf8");
const lib = readFileSync(join(ROOT, "scripts/lib/npmAuditException.mjs"), "utf8");
ok(src.includes('["audit", "--json", "--audit-level=moderate"]') || src.includes("[\"audit\", \"--json\", \"--audit-level=moderate\"]"),
  "the script still runs npm audit at moderate");
ok((lib.match(/GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/gi) || []).filter((id, i, all) => all.indexOf(id) === i).length === 1,
  "the exception module names exactly one GHSA");
ok(!/audit-level=low/.test(src) && !/audit-level=critical/.test(src),
  "the audit level is not lowered and not narrowed to critical only");

if (fails) {
  console.error("test-npm-audit-exception: FAIL — " + fails + " failed, " + pass + " passed");
  process.exit(1);
}
console.log("test-npm-audit-exception: OK — " + pass + " assertions");
