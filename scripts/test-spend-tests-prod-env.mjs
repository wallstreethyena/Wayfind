#!/usr/bin/env node
// Every spend-gate test must pass with the PRODUCTION paid switches ON.
//
// 2026-09-29: #1538 added WAYFIND_PROMOTE_PAID / PROMOTE_DETAILS_MONTH_CAP. CI runs
// with neither set, so the suite was green; Vercel's build env has both, and two
// tests that pinned the free-tier arithmetic read them ambiently and failed the
// production prebuild (test-promote-details, test-photos-paid-cap). Green CI, red
// deploy: CLAUDE.md lesson 1, "env-gated branches need a CI run with the flag ON".
//
// This re-executes each spend test in a child process with every paid switch that
// production carries turned on, and asserts the real exit code. A test that pins
// free-mode numbers must clear the switches it depends on itself.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

// Every switch that widens a spend ceiling in production. Add a new one here the
// day it is introduced.
const PROD_PAID_ENV = {
  WAYFIND_PROMOTE_PAID: "1",
  PROMOTE_DETAILS_MONTH_CAP: "6650",
  WAYFIND_PHOTOS_PAID: "1",
  GOOGLE_PHOTOS_MONTH_CAP: "7700",
};

const TESTS = [
  "test-promote-details.mjs",
  "test-photos-paid-cap.mjs",
  "test-promote-paid-cap.mjs",
  "test-spend-bypass-regression.mjs",
  "test-autocomplete-proxy.mjs",
  "check-spend-effective-cap.mjs",
  "check-promote-spend-gate.mjs",
  "check-spend-guard.mjs",
  "check-cost-gate.mjs",
  "check-quota-reservation.mjs",
];

const failures = [];
for (const t of TESTS) {
  const r = spawnSync(process.execPath, [path.join(here, t)], {
    env: { ...process.env, ...PROD_PAID_ENV },
    encoding: "utf8",
    timeout: 120000,
  });
  if (r.status !== 0) {
    const why = String(r.stderr || r.stdout || r.error || "").trim().split("\n").slice(-2).join(" | ");
    failures.push(`${t} exited ${r.status} with production paid switches on: ${why}`);
  }
}

if (failures.length) {
  for (const f of failures) console.error("spend-tests-prod-env: FAIL — " + f);
  process.exit(1);
}
console.log(`spend-tests-prod-env: OK — ${TESTS.length} spend tests executed with ${Object.keys(PROD_PAID_ENV).length} production paid switches on, all exit 0`);
