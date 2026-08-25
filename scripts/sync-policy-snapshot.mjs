#!/usr/bin/env node
/**
 * scripts/sync-policy-snapshot.mjs — refresh lib/policySnapshot.json from production.
 *
 * NOT A GUARD, deliberately. It needs a live service-role credential, and
 * check-guard-hermeticity is right that a guard holding one is not a guard: its
 * verdict would depend on which shell ran it. So the split is:
 *
 *   this script (credentialed, run by a human)  -> writes the contract
 *   check-client-writes-have-policies.mjs       -> reads the contract, hermetic
 *   wf_schema_audit() + /api/cron/schema-watch  -> watches the live database
 *
 * Run it after ANY migration that adds or changes a policy or a grant:
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/sync-policy-snapshot.mjs
 *
 * If the snapshot changes, read the diff before committing it. A permission
 * appearing here that you did not intend to add is a finding, not a chore.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const OUT = path.join(ROOT, "lib/policySnapshot.json");

const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !key) {
  console.error("sync-policy-snapshot: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  console.error("  Mint an sb_secret_... key at Supabase -> Settings -> API Keys; creating one does not revoke production's.");
  process.exit(1);
}

const r = await fetch(`${url}/rest/v1/rpc/wf_client_permissions`, {
  method: "POST",
  headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: "{}",
});
if (!r.ok) {
  console.error(`sync-policy-snapshot: FAILED ${r.status} ${(await r.text()).slice(0, 300)}`);
  process.exit(1);
}
const tables = await r.json();
const count = Object.keys(tables || {}).length;
if (!count) {
  // An empty answer is not "no permissions", it is a broken read. Writing it
  // would hand check-client-writes-have-policies an empty contract, and every
  // browser write would report as unpoliced — or worse, the guard would be
  // rewritten to tolerate it.
  console.error("sync-policy-snapshot: the RPC returned no tables — refusing to overwrite the snapshot with an empty contract.");
  process.exit(1);
}

const prev = JSON.parse(readFileSync(OUT, "utf8"));
const next = {
  _meta: { ...prev._meta, generatedAt: new Date().toISOString().slice(0, 10) },
  tables,
};
const changed = JSON.stringify(prev.tables) !== JSON.stringify(tables);
writeFileSync(OUT, JSON.stringify(next, null, 2) + "\n");
console.log(`sync-policy-snapshot: wrote ${count} tables to lib/policySnapshot.json${changed ? " — CONTENT CHANGED, read the diff before committing" : " (no change)"}`);
