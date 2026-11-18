#!/usr/bin/env node
// The audit exception ignores one advisory id and nothing else.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unexpectedAdvisories, picomatchExceptionSeen, PICOMATCH_REDOS } from "./lib/npmAuditAllowlist.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CLI = path.join(ROOT, "scripts", "audit-allowlist.mjs");
let n = 0;
const ok = (cond, msg) => { assert.equal(cond, true, msg); n++; };

const via = (id, severity, title) => ({
  source: 1,
  name: "pkg",
  severity,
  title: title || id,
  url: `https://github.com/advisories/${id}`,
});
const report = (entries) => ({ vulnerabilities: Object.fromEntries(entries) });

const onlyPicomatch = report([
  ["picomatch", { severity: "high", via: [via(PICOMATCH_REDOS, "high", "picomatch ReDoS")] }],
  ["fdir", { severity: "high", via: ["picomatch"] }],
  ["@sentry/nextjs", { severity: "high", via: ["@rollup/plugin-commonjs"] }],
]);
ok(unexpectedAdvisories(onlyPicomatch).length === 0, "the picomatch advisory and its transitive dependents pass");
ok(picomatchExceptionSeen(onlyPicomatch) === true, "the exception is recorded as seen");

const extra = report([
  ["picomatch", { severity: "high", via: [via(PICOMATCH_REDOS, "high")] }],
  ["left-pad", { severity: "moderate", via: [via("GHSA-aaaa-bbbb-cccc", "moderate", "other")] }],
]);
const extraProblems = unexpectedAdvisories(extra);
ok(extraProblems.length === 1 && /ghsa-aaaa-bbbb-cccc/.test(extraProblems[0]) && /left-pad/.test(extraProblems[0]), "a second moderate advisory fails");

const critical = report([["evil", { severity: "critical", via: [via("GHSA-dddd-eeee-ffff", "critical")] }]]);
ok(unexpectedAdvisories(critical).some((p) => /critical/.test(p)), "a critical advisory fails");

const low = report([["old", { severity: "low", via: [via("GHSA-1111-2222-3333", "low")] }]]);
ok(unexpectedAdvisories(low).length === 0 && picomatchExceptionSeen(low) === false, "a low advisory stays below the moderate line");

const nameless = report([["mystery", { severity: "high", via: [{ severity: "high", title: "no id", url: "https://example.test/not-an-advisory" }] }]]);
ok(unexpectedAdvisories(nameless).some((p) => /no GHSA id/.test(p)), "a blocking advisory without a GHSA id fails closed");

ok(unexpectedAdvisories(null).length === 1, "a missing report fails");
ok(unexpectedAdvisories({ error: { code: "EAI", summary: "offline" } })[0].includes("offline"), "an npm audit error fails");
ok(unexpectedAdvisories({ vulnerabilities: {} }).length === 0 && picomatchExceptionSeen({ vulnerabilities: {} }) === false, "a clean report passes and the exception is unused");

const dir = mkdtempSync(path.join(tmpdir(), "wf-audit-"));
try {
  const passFile = path.join(dir, "pass.json");
  const failFile = path.join(dir, "fail.json");
  writeFileSync(passFile, JSON.stringify(onlyPicomatch));
  writeFileSync(failFile, JSON.stringify(extra));
  const pass = execFileSync(process.execPath, [CLI, passFile], { encoding: "utf8" });
  ok(pass.includes(PICOMATCH_REDOS) && /Remove scripts\/lib\/npmAuditAllowlist\.mjs/.test(pass), "the CLI names the exception and when to remove it");
  let failed = false;
  try {
    execFileSync(process.execPath, [CLI, failFile], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    failed = e.status === 1 && /ghsa-aaaa-bbbb-cccc/.test(String(e.stderr));
  }
  ok(failed, "the CLI exits 1 when another advisory is present");
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`test-npm-audit-allowlist: OK — ${n} assertions; only ${PICOMATCH_REDOS} is ignored`);
