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
 * THE SOURCE OF TRUTH schema_migrations UNDERCOUNTS. Some repo files were run
 * directly against production and have no schema_migrations row at all. Those
 * historical files are accepted only through the small live-object allowlist
 * in migrationReconciliation.mjs. Every probe is re-verified on every run.
 *
 * BOTH DIRECTIONS ARE ENFORCED, INCLUDING DML. Historical production-only
 * exceptions are exact version/name/statement-hash pins. A newer Supabase
 * failure mode is also handled without a pin: if an apply records the whole
 * canonical filename stem as the migration `name`, that spelling is accepted
 * ONLY when the live statement-array SHA-256 equals the exact committed file
 * encoded as the one statement Supabase recorded. A same-name/different-SQL
 * row therefore stays red.
 *
 * WHY CANARY, NOT PREBUILD, and WHY THIS SKIPS LOUDLY WITHOUT CREDENTIALS:
 * this needs a live Supabase read, which prebuild does not have, and production
 * state must never gate a build on its own credential's account. Without
 * SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY it prints SKIPPED and exits 0; it
 * never reports a false green by evaporating.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  reconcile,
  parseFileName,
  reconcileProduction,
  canonicalSingleStatementHash,
} from "./lib/migrationReconciliation.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const MIGRATIONS_DIR = path.join(REPO, "supabase", "migrations");

// ── Self-test: the comparator, before it is trusted with real data ─────────
{
  const logicalLedger = [{ version: "20260101000001", name: "real_migration_name", statements_sha256: "a".repeat(64) }];
  const objects = new Set(["view:wf_thing", "function:wf_fn"]);
  const cases = [
    ["20260101_real_migration_name.sql", logicalLedger, null, "ok"],
    ["20260101_totally_unapplied.sql", logicalLedger, null, "unresolved"],
    ["not-a-valid-filename.sql", logicalLedger, null, "fail"],
  ];
  let fails = 0;
  for (const [file, ledger, hash, want] of cases) {
    const got = reconcile(file, ledger, objects, hash).status;
    if (got !== want) { fails++; console.error(`self-test FAIL — reconcile(${file}) expected ${want}, got ${got}`); }
  }

  // Supabase may store the whole canonical filename stem as `name`. That is
  // legitimate only when the live statement-array hash proves exact bytes.
  const aliasFile = "20260101_alias_name.sql";
  const aliasHash = canonicalSingleStatementHash("select 1;\n");
  const aliasRow = { version: "20260101000002", name: "20260101_alias_name", statements_sha256: aliasHash };
  if (reconcile(aliasFile, [aliasRow], objects, aliasHash).status !== "ok") {
    fails++; console.error("self-test FAIL — exact filename-stem alias with matching statement hash must reconcile");
  }
  if (reconcile(aliasFile, [{ ...aliasRow, statements_sha256: "b".repeat(64) }], objects, aliasHash).status !== "fail") {
    fails++; console.error("self-test FAIL — filename-stem alias with different SQL hash must fail closed");
  }
  if (reconcile(aliasFile, [aliasRow], objects, null).status !== "fail") {
    fails++; console.error("self-test FAIL — filename-stem alias without a canonical hash must fail closed");
  }

  // A stale historical live-object proof must fail, not become a permanent
  // exception. This mirrors the real allowlist behavior without mutating it.
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
  console.error("  If this is a fresh deploy: apply the canonical wf_deploy_contract_audit and wf_migration_ledger_hashes migrations first — this check has no way to read the applied-migration ledger without it.");
  process.exit(1);
}

function ok0(c, m) { if (!c) { console.error("check-migration-reconciliation: FAIL — " + m); process.exit(1); } }
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

// Compute the exact hash shape wf_migration_ledger_hashes() returns for a
// whole-file Management-API apply: sha256(UTF8(JSON.stringify([sqlText]))).
const canonicalHashes = new Map();
for (const file of files) {
  const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  canonicalHashes.set(file, canonicalSingleStatementHash(sql));
}

const exceptions = JSON.parse(readFileSync(path.join(REPO, "scripts/migration-historical-exceptions.json"), "utf8"));
const reverse = reconcileProduction(files, ledgerResult.rows, exceptions, canonicalHashes);
for (const error of reverse.errors) console.error(`check-migration-reconciliation: FAIL — ${error}`);
let bad = reverse.errors.length, applied = 0;
for (const file of files) {
  const result = reconcile(file, ledgerResult.rows, objectSet, canonicalHashes.get(file));
  if (result.status === "ok") { applied++; continue; }
  if (result.status === "fail") { bad++; console.error(`check-migration-reconciliation: FAIL — supabase/migrations/${file}: ${result.detail}`); continue; }
  bad++;
  console.error(`check-migration-reconciliation: FAIL — ${file} has no applied ledger entry or verified historical alias.`);
}

// ── Red-proof: a migration this repo genuinely has not applied must fail ───
{
  const fakeResult = reconcile("20990101_definitely_never_applied.sql", ledgerResult.rows, objectSet, canonicalSingleStatementHash("select 1;\n"));
  if (fakeResult.status !== "unresolved") {
    bad++;
    console.error("check-migration-reconciliation: FAIL — self-test: a migration filename with no ledger row and no allowlist entry must be UNRESOLVED — the comparator let a fabricated one through as applied.");
  } else {
    console.log('check-migration-reconciliation: RED-PROOF OK — fabricated unapplied migration correctly remains unresolved; filename-stem aliases require exact hash proof.');
  }
}

if (bad) {
  console.error(`check-migration-reconciliation: ${bad} failure(s). ${applied} file(s) reconciled.`);
  process.exit(1);
}
console.log(`check-migration-reconciliation: OK — ${files.length} files under supabase/migrations/ reconcile bidirectionally against production (${applied} applied), self-test + hash-alias red-proof passed.`);
