#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateDiscoveryReport } from "../lib/fallDiscoveryReport.js";

const day = "2026-10-04";
const good = { ok: true, today: day, results: [{ place_id: "fixture" }], coverage: { candidates_evaluated: 1 }, registry_members_not_evaluated_this_run: [] };
assert.equal(validateDiscoveryReport(good, day), 1, "a current non-empty complete report passes");
for (const bad of [null, { ...good, ok: false }, { ...good, skipped: true }, { ...good, today: "2026-10-03" }, { ...good, results: [] }, { ...good, coverage: { candidates_evaluated: 2 } }, { ...good, registry_members_not_evaluated_this_run: ["missing"] }]) {
  assert.throws(() => validateDiscoveryReport(bad, day), "missing, skipped, stale, empty, or incomplete discovery must fail");
}
const workflow = readFileSync(new URL("../.github/workflows/fall-discovery.yml", import.meta.url), "utf8");
assert.ok(workflow.indexOf("node scripts/fall-discovery/run.mjs") < workflow.indexOf("node scripts/fall-discovery/verify-report.mjs"), "verification follows the discovery command");
assert.ok(workflow.includes("if-no-files-found: error"), "a missing report cannot silently pass artifact upload");
console.log("test-fall-discovery-report: 10 assertions passed; no live source or credentials used");
