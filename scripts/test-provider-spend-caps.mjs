#!/usr/bin/env node
// Hermetic controls for finite non-event provider budgets. This script never
// supplies runtime credentials or a real ledger; the positive control injects
// only a local ledger grant.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { providerMonthlyCap, providerSpendAllow } from "../lib/providerSpend.js";

const CHILD = "--provider-spend-hermetic";
if (process.argv[2] !== CHILD) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), CHILD], {
    env: { NODE_ENV: "test" }, stdio: "inherit", timeout: 120000,
  });
  if (child.error) throw child.error;
  process.exit(child.status === 0 ? 0 : (child.status || 1));
}

let checks = 0;
function ok(value, message) {
  checks++;
  if (!value) throw new Error(message);
}
async function withEnv(values, run) {
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value == null) delete process.env[key]; else process.env[key] = value;
    }
    return await run();
  } finally {
    for (const key of Object.keys(values)) delete process.env[key];
  }
}

for (const raw of [undefined, "", "0", "-1", "1.5", "9007199254740992", "abc"]) {
  await withEnv({ VIATOR_MONTH_CAP: raw }, async () => {
    ok(providerMonthlyCap("viator") === null, `invalid cap is denied: ${String(raw)}`);
  });
}
ok(providerMonthlyCap("missing") === null, "unknown providers have no cap");

await withEnv({ WAYFIND_GATE: "shut", VIATOR_MONTH_CAP: "12" }, async () => {
  let calls = 0;
  ok(!(await providerSpendAllow("viator", { take: async () => { calls++; return true; } })), "shut gate denies before ledger");
  ok(calls === 0, "shut gate does not attempt a ledger grant");
});

await withEnv({ WAYFIND_GATE: "open", VIATOR_MONTH_CAP: undefined }, async () => {
  let calls = 0;
  ok(!(await providerSpendAllow("viator", { take: async () => { calls++; return true; } })), "unset cap denies before ledger");
  ok(calls === 0, "unset cap does not attempt a ledger grant");
});

const PROVIDERS = {
  viator: "VIATOR_MONTH_CAP",
  foursquare: "FOURSQUARE_MONTH_CAP",
  tripadvisor: "TRIPADVISOR_MONTH_CAP",
  youtube: "YOUTUBE_MONTH_CAP",
  pexels: "PEXELS_MONTH_CAP",
};
for (const [provider, env] of Object.entries(PROVIDERS)) {
  await withEnv({ WAYFIND_GATE: "open", [env]: "37" }, async () => {
    let seen = null;
    ok(await providerSpendAllow(provider, { take: async (sku, cap) => { seen = [sku, cap]; return true; } }), `${provider} accepts a positive ledger grant`);
    ok(JSON.stringify(seen) === JSON.stringify([`provider_${provider}`, 37]), `${provider} grants its own finite ledger SKU and cap`);
  });
}
await withEnv({ WAYFIND_GATE: "open", VIATOR_MONTH_CAP: "37" }, async () => {
  ok(!(await providerSpendAllow("viator", { take: async () => false })), "ledger denial blocks the call");
});

console.log(`test-provider-spend-caps: ${checks} checks passed`);
