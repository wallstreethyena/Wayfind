#!/usr/bin/env node
// Exercise the real grant and Google wrapper without credentials or network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
const path = "scripts/add-seasonal-venues-2026-10-19.mjs";
const source = readFileSync(path, "utf8");
const start = source.indexOf("  async function grant(sku)");
const end = source.indexOf("  async function expectedPoint", start);
assert.ok(start >= 0 && end > start, "actual grant and fetch wrapper exist");
let checks = 0;
async function exercise({ allowed = false, billed = 0, sku = "text_pro" } = {}) {
  const calls = [];
  const context = vm.createContext({ billed, BILL_CAP: 130, stoppedForCap: false,
    monthCap: 432, scrub: String, billedStatus: (status) => status === 200,
    spendAllow: async (value) => { calls.push(["ledger", value]); return allowed; },
    spendAllowCapped: async (value, cap) => { calls.push(["ledger", value, cap]); return allowed; },
    refundToLedger: async () => {},
    fetch: async () => { calls.push(["google"]); return { status: 200 }; },
  });
  const result = await vm.runInContext(source.slice(start, end) +
    `;googleFetch("https://unused.test", {}, ${JSON.stringify(sku)})`, context);
  return { result, calls, billed: context.billed };
}
for (const sku of ["text_pro", "details_pro", "details_enterprise"]) {
  const denied = await exercise({ sku });
  assert.match(denied.result.blocked, /monthly spend cap/);
  assert.equal(denied.calls.length, 1);
  assert.equal(denied.calls[0][0], "ledger"); checks += 3;
  const granted = await exercise({ sku, allowed: true });
  assert.equal(granted.calls[0][0], "ledger");
  assert.equal(granted.calls[1][0], "google");
  assert.equal(granted.billed, 1); checks += 3;
}
const capped = await exercise({ billed: 130, allowed: true });
assert.match(capped.result.blocked, /130 billed-call cap/);
assert.equal(capped.calls.length, 0); checks += 2;
for (const args of [["--self-test"], ["--bypass-month-cap"]]) {
  const result = spawnSync(process.execPath, [path, ...args], { encoding: "utf8" });
  assert.equal(result.status, args[0] === "--self-test" ? 0 : 1, result.stdout + result.stderr); checks++;
}
console.log(`test-seasonal-add-safety: ${checks} offline assertions passed`);
