#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { collectReadEvidence } from "./lib/starvationReadEvidence.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PYTHON = "python3"; // Deliberately hermetic: never inherit PYTHON_BIN.

const good = collectReadEvidence(["food", "nightlife"], [
  { status: "fulfilled", value: { rows: [{ place_id: "a" }], truncated: false } },
  { status: "fulfilled", value: { rows: [], truncated: false } },
]);
assert.deepEqual(good.rowsRead, { food: 1, nightlife: 0 });
assert.equal(good.evidence.actualTruncated, false);
assert.equal(good.evidence.complete, true);

const cut = collectReadEvidence(["food"], [
  { status: "fulfilled", value: { rows: [{ place_id: "a" }], truncated: true } },
]);
assert.equal(cut.evidence.actualTruncated, true);
assert.equal(cut.evidence.complete, false);

const failed = collectReadEvidence(["food", "nightlife"], [
  { status: "fulfilled", value: { rows: [], truncated: false } },
  { status: "rejected", reason: new Error("timeout") },
]);
assert.equal(failed.rowsRead.nightlife, null);
assert.equal(failed.evidence.perCategory.nightlife.truncated, null);
assert.equal(failed.evidence.sourceFailures, 1);
assert.equal(failed.evidence.unknownFailures, 1);
assert.equal(failed.evidence.actualTruncated, null);
assert.equal(failed.evidence.complete, false);

const malformed = collectReadEvidence(["food"], [
  { status: "fulfilled", value: { rows: [] } },
]);
assert.equal(malformed.evidence.perCategory.food.status, "unknown");
assert.equal(malformed.evidence.complete, false);

const missing = collectReadEvidence(["food"], []);
assert.equal(missing.evidence.unknownFailures, 1);
assert.equal(missing.evidence.actualTruncated, null);

const py = spawnSync(PYTHON, [join(HERE, "test-audit-candidate-starvation.py")], {
  cwd: join(HERE, ".."),
  encoding: "utf8",
  env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
});
if (py.status !== 0) {
  process.stderr.write(py.stdout || "");
  process.stderr.write(py.stderr || "");
  process.exit(py.status ?? 1);
}

console.log("test-audit-candidate-starvation: OK — read evidence and Python orchestration are fail-closed");
