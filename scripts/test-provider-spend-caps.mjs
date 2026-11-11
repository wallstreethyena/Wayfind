#!/usr/bin/env node
// Hermetic controls for finite non-event provider budgets. This script never
// supplies runtime credentials or a real ledger; the positive control injects
// only a local ledger grant.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { VIATOR_MONTH_CAP_FALLBACK, providerMonthlyCap, providerSpendAllow, providerSpendDecision } from "../lib/providerSpend.js";

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

ok(VIATOR_MONTH_CAP_FALLBACK === 3000, "the Viator code fallback is 3,000 a month");
for (const raw of ["0", "-1", "1.5", "9007199254740992", "abc"]) {
  await withEnv({ VIATOR_MONTH_CAP: raw }, async () => {
    ok(providerMonthlyCap("viator") === null, `malformed cap is denied: ${String(raw)}`);
  });
}
for (const raw of [undefined, ""]) {
  await withEnv({ VIATOR_MONTH_CAP: raw }, async () => {
    ok(providerMonthlyCap("viator") === 3000, `absent Viator cap falls back to 3000: ${String(raw)}`);
  });
}
await withEnv({ VIATOR_MONTH_CAP: "1000" }, async () => {
  ok(providerMonthlyCap("viator") === 1000, "a set VIATOR_MONTH_CAP overrides the 3000 fallback");
});
ok(providerMonthlyCap("missing") === null, "unknown providers have no cap");
await withEnv({ FOURSQUARE_MONTH_CAP: undefined }, async () => {
  ok(providerMonthlyCap("foursquare") === null, "providers other than Viator still have no fallback");
});

await withEnv({ WAYFIND_GATE: "shut", VIATOR_MONTH_CAP: "12" }, async () => {
  let calls = 0;
  ok(!(await providerSpendAllow("viator", { take: async () => { calls++; return true; } })), "shut gate denies before ledger");
  ok(calls === 0, "shut gate does not attempt a ledger grant");
  const d = await providerSpendDecision("viator", { take: async () => { calls++; return true; } });
  ok(d.allow === false && d.reason === "gate_shut", "shut gate names gate_shut without exposing a cap");
});

await withEnv({ WAYFIND_GATE: "open", VIATOR_MONTH_CAP: undefined }, async () => {
  let used = 0;
  const take = async (sku, cap) => {
    if (sku !== "provider_viator" || cap !== 3000) return false;
    if (used >= 3000) return false;
    used += 1;
    return true;
  };
  for (let n = 0; n < 3000; n++) {
    if (!(await providerSpendAllow("viator", { take }))) throw new Error(`grant ${n + 1} should be inside the 3000 fallback`);
  }
  ok(used === 3000, "the fallback grants 3000 ledger calls");
  ok(!(await providerSpendAllow("viator", { take })), "the guard blocks the call above 3000");
  const d = await providerSpendDecision("viator", { take });
  ok(d.allow === false && d.reason === "ledger_denied", "a call above 3000 is ledger_denied");
  ok(!Object.prototype.hasOwnProperty.call(d, "cap"), "a denied fallback call does not echo the cap");
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
  const d = await providerSpendDecision("viator", { take: async () => false });
  ok(d.allow === false && d.reason === "ledger_denied", "ledger denial names ledger_denied, not a balance");
  ok(!Object.prototype.hasOwnProperty.call(d, "cap"), "spend decision never echoes the cap number");
});

console.log(`test-provider-spend-caps: ${checks} checks passed`);
