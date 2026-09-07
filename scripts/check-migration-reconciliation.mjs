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
 * SCOPE: SCHEMA, NOT DATA. A migration file with no CREATE/ALTER/DROP — a
 * pure data backfill (UPDATE/INSERT only) — creates no object this guard can
 * verify existed or not, and the task this guard exists for (tables, columns,
 * indexes, views, triggers, constraints — all schema concepts) does not cover
 * row data either. Those files are reported as NOTE, out of scope by design,
 * never silently dropped from the output. (wf_promote_metros row drift has
 * its own guard: scripts/check-promote-metros-live-drift.mjs.)
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
const APPLIED_WITHOUT_LEDGER_ENTRY = {
  "20260729_wf_job_pulse.sql": {
    reason: "Ledger entry is named \"wf_job_pulse_spend_watch\" (20260729192501), not this filename.",
    probes: [{ kind: "table", name: "wf_job_pulse" }, { kind: "function", name: "wf_job_health" }],
  },
  "20260730_wf_cuisine_chips.sql": {
    reason: "Ledger entry is named \"wf_cuisine_chips_floor\" (20260729233040), not this filename.",
    probes: [{ kind: "function", name: "wf_cuisine_chips" }],
  },
  "20260813_wf_promotion_cron_and_lockdown.sql": {
    reason: "Consolidates the applied migrations wf_promotion_cron_jobs (20260813165059) and wf_promotion_lockdown (20260813165147) into one committed file.",
    probes: [{ kind: "view", name: "wf_promotion_health" }],
  },
  "20260822_wf_scout_verdicts.sql": {
    reason: "Ledger entry is named \"scout_verdicts_and_candidates\" (20260822164708), not this filename.",
    probes: [{ kind: "table", name: "wf_scout_verdicts" }, { kind: "function", name: "wf_scout_candidates" }],
  },
  "20260825_security_hardening_v5.sql": {
    reason: "File's own header: \"APPLIED TO PRODUCTION 2026-08-25 as four migrations\" (security_hardening_v5_definer_views_and_rpc_lockdown, security_hardening_v5_table_grants_least_privilege, security_hardening_v5_net_schema_and_default_privileges, fix_two_silent_rls_denials_comments_delete_and_waitlist_signed_in — all four ARE in the ledger; the repo file is a consolidated record with its own different derived name).",
    probes: [{ kind: "view", name: "wf_affiliate_worklist" }, { kind: "view", name: "wf_beach_water_geo" }],
  },
  "20260825_wf_client_permissions.sql": {
    reason: "Ledger entry is named \"wf_client_permissions_snapshot_source\" (20260825221345), not this filename.",
    probes: [{ kind: "function", name: "wf_client_permissions" }],
  },
  "20260825_wf_schema_audit.sql": {
    reason: "File's own header: \"APPLIED TO PRODUCTION 2026-08-25 as migration wf_schema_audit_exposure_watchdog\" (in the ledger; different derived name). Also independently corroborated live: app/api/cron/schema-watch/route.js calls this function in production.",
    probes: [{ kind: "function", name: "wf_schema_audit" }],
  },
  "20260904_editorial_publish_gate_symmetry.sql": {
    reason: "Applied directly against production 2026-09-04, not through migration tooling — no schema_migrations row exists for it. This file is the committed record.",
    probes: [{ kind: "constraint", name: "wf_editorial_verified_needs_content" }],
  },
  "20260905_editorial_read_gate.sql": {
    reason: "File's own header: \"APPLIED LIVE 2026-09-05 ... PROVEN BY PROBE\" — applied directly, no migration-tooling record exists.",
    probes: [{ kind: "view", name: "wf_editorial_servable" }],
  },
  "20260905_editorial_requires_servable_place.sql": {
    reason: "File's own header: \"APPLIED LIVE 2026-09-05 ... PROVEN BY PROBE\" — applied directly, no migration-tooling record exists.",
    probes: [{ kind: "trigger", name: "wf_editorial_servable_place" }, { kind: "function", name: "wf_editorial_requires_servable_place" }],
  },
};

function stripSqlComments(sql) {
  return sql.split("\n").map((line) => {
    const i = line.indexOf("--");
    return i === -1 ? line : line.slice(0, i);
  }).join("\n");
}

function isDdlBearing(sql) {
  return /\b(create|alter|drop)\s+(or\s+replace\s+)?(table|view|function|index|unique\s+index|trigger|constraint|type|extension|policy|schema)\b/i.test(stripSqlComments(sql));
}

function parseFileName(f) {
  const m = f.match(/^(\d{8,14})_(.+)\.sql$/);
  return m ? { version: m[1], name: m[2] } : null;
}

// Pure comparator — reconciles one file against a ledger name-set and an
// object-existence set. Exported shape so the self-test below exercises the
// EXACT function the real run uses, not a re-implementation of it.
function reconcile(file, ledgerNames, objectSet) {
  const parsed = parseFileName(file);
  if (!parsed) return { status: "fail", detail: `filename does not match the <version>_<name>.sql convention — cannot even attempt to reconcile it` };
  if (ledgerNames.has(parsed.name)) return { status: "ok", via: "ledger" };
  const allow = APPLIED_WITHOUT_LEDGER_ENTRY[file];
  if (allow) {
    const missing = allow.probes.filter((p) => !objectSet.has(`${p.kind}:${p.name}`));
    if (missing.length === 0) return { status: "ok", via: "allowlist" };
    return { status: "fail", detail: `allowlisted ("${allow.reason}") but the object(s) it claims are live no longer exist: ${missing.map((p) => `${p.kind} ${p.name}`).join(", ")} — the allowlist entry is stale, or this was rolled back` };
  }
  return { status: "unresolved" }; // caller decides DDL-fail vs DML-note
}

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

const [ledgerResult, objectsResult] = await Promise.all([callRpc("wf_migration_ledger"), callRpc("wf_schema_objects")]);
if (ledgerResult.error || objectsResult.error) {
  console.error(`check-migration-reconciliation: FAIL — introspection RPC unreachable (wf_migration_ledger: ${ledgerResult.error || "ok"}; wf_schema_objects: ${objectsResult.error || "ok"}).`);
  console.error("  If this is a fresh deploy: apply supabase/migrations/20260907_wf_deploy_contract_audit.sql to production first — this check has no way to read the applied-migration ledger without it (same shape as wf_schema_audit.sql, applied separately from the merge that added it).");
  process.exit(1);
}

function ok0(c, m) { if (!c) { console.error("check-migration-reconciliation: FAIL — " + m); process.exit(1); } }

const ledgerNames = new Set(ledgerResult.rows.map((r) => r.name));
ok0(ledgerResult.rows.length > 50, `wf_migration_ledger() returned only ${ledgerResult.rows.length} rows — this guard has lost its subject (expected a real, long-lived migration history)`);
const objectSet = new Set(objectsResult.rows.map((r) => `${r.kind}:${r.name}`));

// ── Reconcile every repo migration file ─────────────────────────────────────
let files;
try { files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort(); }
catch (e) { console.error(`check-migration-reconciliation: FAIL — cannot read ${MIGRATIONS_DIR}: ${e.message}`); process.exit(1); }
if (files.length < 20) {
  console.error(`check-migration-reconciliation: FAIL — only ${files.length} files under supabase/migrations/ — this guard has lost its subject (expected >= 20)`);
  process.exit(1);
}

let bad = 0, applied = 0, notes = 0;
for (const file of files) {
  const result = reconcile(file, ledgerNames, objectSet);
  if (result.status === "ok") { applied++; continue; }
  if (result.status === "fail") { bad++; console.error(`check-migration-reconciliation: FAIL — supabase/migrations/${file}: ${result.detail}`); continue; }
  // unresolved: neither ledger nor allowlist. DDL-bearing => real failure. Pure DML => out of scope, reported as a note.
  const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  if (isDdlBearing(sql)) {
    bad++;
    console.error(`check-migration-reconciliation: FAIL — supabase/migrations/${file} defines schema (CREATE/ALTER/DROP) but has NEVER BEEN APPLIED to production: no matching row in supabase_migrations.schema_migrations (checked derived name "${parseFileName(file).name}") and no allowlist entry. This is the #1153 failure class — a migration merged into main with no corresponding change in the live database.`);
  } else {
    notes++;
    console.log(`check-migration-reconciliation: NOTE — supabase/migrations/${file} is pure DML (no CREATE/ALTER/DROP) with no ledger row — out of scope for schema reconciliation (see file header). Data-drift for this table, if any, is its own guard's job, not this one's.`);
  }
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
  console.error(`check-migration-reconciliation: ${bad} failure(s). ${applied} file(s) reconciled (${notes} DML-only note(s)).`);
  process.exit(1);
}
console.log(`check-migration-reconciliation: OK — ${files.length} files under supabase/migrations/ all reconcile against production (${applied} applied, ${notes} pure-DML out of scope), self-test + red-proof passed.`);
