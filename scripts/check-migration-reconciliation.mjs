#!/usr/bin/env node
/**
 * scripts/check-migration-reconciliation.mjs — A MIGRATION FILE IN THE REPO IS
 * AN INTENTION. supabase_migrations.schema_migrations IS WHAT HAPPENED.
 *
 * THE INCIDENT THIS GENERALISES (2026-09-07). #1153 widened
 * wf_popularity_stale_batch to 5 arguments and shipped application code that
 * called it with 5 named arguments. Its migration file was correct, reviewed,
 * and merged — and never applied. Nothing in 553 guards noticed, because
 * every one of them reads supabase/migrations/*.sql, which is what the repo
 * INTENDS, never what production actually has ("merging is not applying" —
 * AGENTS.md). scripts/check-rpc-schema-contract.mjs closes that gap for RPC
 * call sites specifically; this closes it for every migration file, whatever
 * it creates — a table, a column, an index, a view, a trigger, a constraint.
 * Same root cause, wider blast radius: an unapplied migration can silently
 * break anything the application assumes the schema already has, not only an
 * RPC signature.
 *
 * THE SOURCE OF TRUTH schema_migrations UNDERCOUNTS. Auditing this repo's own
 * history to build this guard: 155 rows are applied, 39 files exist in
 * supabase/migrations/, and three of those 39 were run DIRECTLY against
 * production (proven live, by probe, per their own file headers) with no
 * schema_migrations row at all, because they never went through migration
 * tooling. A check that trusted the ledger alone would report those three as
 * "never applied" and be WRONG — a false alarm on real, correct, previously
 * shipped code is exactly what trains people to stop reading a guard, which
 * is the same failure mode as #1153 going undetected. So a repo file counts
 * as applied when EITHER its name is in the ledger, OR it is named in the
 * small ALLOWLIST below with the live object that PROVES it, re-verified
 * against wf_schema_objects() on every run — not merely trusted forever.
 * Anything else is reported as never applied. There is no other way out.
 *
 * Both directions are enforced, including DML. Historical aliases retain
 * their live-object probes. Production-only exceptions are exact hash pins.
 *
 * WHY CANARY, NOT PREBUILD, and WHY THIS SKIPS LOUDLY WITHOUT CREDENTIALS:
 * identical reasoning to check-rpc-schema-contract.mjs and
 * check-inventory-integrity.mjs — this needs a live Supabase read, which
 * prebuild does not have, and production state must never gate a build on
 * its own credential's account. Without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 * it prints SKIPPED and exits 0; it never reports a false green by evaporating.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS_DIR = path.join(REPO, "supabase", "migrations");

// ── Files verified applied OUTSIDE the tracked ledger. Each entry must name a
// live object schema_objects() can find; a stale or wrong entry FAILS loudly
// below rather than being trusted forever (same self-cleaning shape as
// check-guard-manifest's EXCLUDED / check-guard-hermeticity's EXEMPT).
import { reconcile, parseFileName, reconcileProduction } from "./lib/migrationReconciliation.mjs";

// ── Self-test: the comparator, before it is trusted with real data ─────────
{
  const ledger = new Set(["real_migration_name"]);
  const objects = new Set(["view:wf_thing", "function:wf_fn"]);
  const cases = [
    ["20260101_real_migration_name.sql", "ok"],
    ["20260101_totally_unapplied.sql", "unresolved"],
    ["not-a-valid-filename.sql", "fail"],
  ];
  let fails = 0;
  for (const [file, want] of cases) {
    const got = reconcile(file, ledger, objects).status;
    if (got !== want) { fails++; console.error(`self-test FAIL — reconcile(${file}) expected ${want}, got ${got}`); }
  }
  // A file allowlisted for an object that is NOT in the live set must fail —
  // proves a stale allowlist entry cannot silently keep passing.
  const fakeAllow = { "20260101_stale.sql": { reason: "test", probes: [{ kind: "view", name: "does_not_exist" }] } };
  const staleResult = (() => {
    const parsed = parseFileName("20260101_stale.sql");
    const allow = fakeAllow[parsed && "20260101_stale.sql"];
    const missing = allow.probes.filter((p) => !objects.has(`${p.kind}:${p.name}`));
    return missing.length === 0 ? "ok" : "fail";
  })();
  if (staleResult !== "fail") { fails++; console.error("self-test FAIL — a stale allowlist entry (probed object not live) must fail, not pass"); }
  if (fails) {
    console.error(`check-migration-reconciliation: FAIL — ${fails} comparator self-test(s) failed; the comparator itself is broken, its verdicts below cannot be trusted`);
    process.exit(1);
  }
}

// ── Credentials are the CONNECTION, not the verdict ─────────────────────────
const URL_ = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!URL_ || !KEY) {
  console.log("check-migration-reconciliation: SKIPPED — no Supabase credentials in env (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enforce)");
  process.exit(0);
}

async function callRpc(fn) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
  });
  if (!r.ok) return { error: `${r.status} ${(await r.text().catch(() => "")).slice(0, 300)}` };
  const rows = await r.json();
  if (!Array.isArray(rows)) return { error: "non-array response" };
  return { rows };
}

const [ledgerResult, objectsResult] = await Promise.all([callRpc("wf_migration_ledger_hashes"), callRpc("wf_schema_objects")]);
if (ledgerResult.error || objectsResult.error) {
  console.error(`check-migration-reconciliation: FAIL — introspection RPC unreachable (wf_migration_ledger_hashes: ${ledgerResult.error || "ok"}; wf_schema_objects: ${objectsResult.error || "ok"}).`);
  console.error("  If this is a fresh deploy: apply the canonical wf_deploy_contract_audit and wf_migration_ledger_hashes migrations first — this check has no way to read the applied-migration ledger without it (same shape as wf_schema_audit.sql, applied separately from the merge that added it).");
  process.exit(1);
}

function ok0(c, m) { if (!c) { console.error("check-migration-reconciliation: FAIL — " + m); process.exit(1); } }

const ledgerNames = new Set(ledgerResult.rows.map((r) => r.name));
ok0(ledgerResult.rows.length > 50, `wf_migration_ledger_hashes() returned only ${ledgerResult.rows.length} rows — this guard has lost its subject (expected a real, long-lived migration history)`);
const objectSet = new Set(objectsResult.rows.map((r) => `${r.kind}:${r.name}`));

// ── Reconcile every repo migration file ─────────────────────────────────────
let files;
try { files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort(); }
catch (e) { console.error(`check-migration-reconciliation: FAIL — cannot read ${MIGRATIONS_DIR}: ${e.message}`); process.exit(1); }
if (files.length < 20) {
  console.error(`check-migration-reconciliation: FAIL — only ${files.length} files under supabase/migrations/ — this guard has lost its subject (expected >= 20)`);
  process.exit(1);
}

const exceptions = JSON.parse(readFileSync(path.join(REPO, "scripts/migration-historical-exceptions.json"), "utf8"));
const reverse = reconcileProduction(files, ledgerResult.rows, exceptions);
for (const error of reverse.errors) console.error(`check-migration-reconciliation: FAIL — ${error}`);
let bad = reverse.errors.length, applied = 0;
for (const file of files) {
  const result = reconcile(file, ledgerNames, objectSet);
  if (result.status === "ok") { applied++; continue; }
  if (result.status === "fail") { bad++; console.error(`check-migration-reconciliation: FAIL — supabase/migrations/${file}: ${result.detail}`); continue; }
  bad++;
  console.error(`check-migration-reconciliation: FAIL — ${file} has no applied ledger entry or verified historical alias.`);
}

// ── Red-proof: a migration this repo genuinely has not applied must fail ───
// The migration THIS PR adds (20260907_wf_deploy_contract_audit.sql) is,
// truthfully, exactly that case until an operator applies it — see that
// file's own closing comment. Prove the mechanism catches it without
// depending on that being true at any particular moment: a synthetic file
// name with neither a ledger row nor an allowlist entry must be unresolved,
// and DDL-bearing synthetic SQL must turn "unresolved" into "fail".
{
  const fakeResult = reconcile("20990101_definitely_never_applied.sql", ledgerNames, objectSet);
  if (fakeResult.status !== "unresolved") {
    bad++;
    console.error("check-migration-reconciliation: FAIL — self-test: a migration filename with no ledger row and no allowlist entry must be UNRESOLVED (then FAIL if DDL-bearing) — the comparator let a fabricated one through as applied.");
  } else {
    console.log('check-migration-reconciliation: RED-PROOF OK — a fabricated "20990101_definitely_never_applied.sql" (no ledger row, no allowlist entry) correctly resolves as never-applied, the same shape #1153\'s migration would have been caught in.');
  }
}

if (bad) {
  console.error(`check-migration-reconciliation: ${bad} failure(s). ${applied} file(s) reconciled.`);
  process.exit(1);
}
console.log(`check-migration-reconciliation: OK — ${files.length} files under supabase/migrations/ reconcile bidirectionally against production (${applied} applied), self-test + red-proof passed.`);
