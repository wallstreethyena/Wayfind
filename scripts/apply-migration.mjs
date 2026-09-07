#!/usr/bin/env node
/**
 * scripts/apply-migration.mjs — THE ONE CANONICAL WAY TO APPLY A MIGRATION TO
 * PRODUCTION. Read scripts/lib/migrationApply.mjs's header first — it carries
 * the two 2026-09-07 incidents this exists to make structurally hard to
 * repeat (#1153's unapplied 5-arg migration; the grep/sed reconstruction of
 * 20260907_wf_deploy_contract_audit.sql that shipped wf_schema_objects()
 * with 4 kinds instead of 7).
 *
 * Usage:
 *   node scripts/apply-migration.mjs <path under supabase/migrations/>
 *   node scripts/apply-migration.mjs --emergency-direct-sql --reason "<why>" <path>
 *
 * There is no other way to supply SQL to this script. No --sql, no -c, no
 * stdin, no fragment. Exactly one whole, committed, unmodified file.
 *
 * What happens, in order, every time:
 *   1. Parse args — refuse anything that isn't exactly one canonical path
 *      (scripts/lib/migrationApply.mjs `parseArgs`).
 *   2. Require BOTH the Management-API credential (to apply) and the
 *      PostgREST credentials (to reconcile, step 5) before touching
 *      anything — this tool will not apply without also being able to
 *      check afterward.
 *   3. Resolve the path strictly under supabase/migrations/, read the WHOLE
 *      file as a Buffer.
 *   4. Verify the file is tracked, has no uncommitted changes, and its
 *      working-tree bytes are byte-identical to what's committed at HEAD.
 *      Any drift refuses the run before anything is sent anywhere.
 *   5. Compute SHA-256 over the exact bytes, print + append a receipt
 *      (filename, sha256, git commit, mode) to scripts/migration-apply-log.jsonl
 *      BEFORE the network call — the record exists even if the call fails.
 *   6. Apply via the Supabase Management API — the migrations endpoint by
 *      default (Supabase records the ledger row itself), or the raw query
 *      endpoint under --emergency-direct-sql (no ledger row; see the
 *      "unfiled fix" half of the second 2026-09-07 incident for why leaving
 *      that gap silent is exactly the failure to avoid).
 *   7. Append a second receipt with the outcome.
 *   8. ALWAYS run scripts/check-migration-reconciliation.mjs next, in the
 *      same process invocation, and fold its exit code into this script's
 *      own. Applying and then not checking is how the second incident
 *      compounded — this script cannot do that by construction, because the
 *      credentials it required at step 2 mean reconciliation never SKIPs.
 */
import { existsSync, readFileSync, mkdirSync, appendFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseArgs,
  resolveCanonicalMigrationPath,
  readWholeFileBuffer,
  sha256Hex,
  verifyCommittedAndClean,
  buildReceipt,
  deriveProjectRef,
  buildManagementApiRequest,
  checkRequiredCredentials,
  appendLedgerLine,
  LEDGER_REL_PATH,
  MIGRATIONS_REL_DIR,
} from "./lib/migrationApply.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function usage() {
  console.log(
    [
      "Usage:",
      `  node scripts/apply-migration.mjs <path under ${MIGRATIONS_REL_DIR}/>`,
      `  node scripts/apply-migration.mjs --emergency-direct-sql --reason "<why>" <path under ${MIGRATIONS_REL_DIR}/>`,
      "",
      "The ONLY way to supply SQL is a whole, committed .sql file under",
      `${MIGRATIONS_REL_DIR}/. No inline SQL argument, no stdin fragment, no`,
      '"just this statement". See scripts/lib/migrationApply.mjs for why.',
    ].join("\n")
  );
}

function fail(msg) {
  console.error(`apply-migration: REFUSED — ${msg}`);
  process.exit(1);
}

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  if (parsed.help) {
    usage();
    process.exit(0);
  }
  usage();
  fail(parsed.error);
}

const realFs = { existsSync, readFileSync, mkdirSync, appendFileSync };

function realGit(args, { cwd, binary } = {}) {
  try {
    const out = execFileSync("git", args, {
      cwd: cwd || REPO,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: binary ? null : "utf8",
    });
    return { ok: true, out: binary ? out : out.trim() };
  } catch (e) {
    return { ok: false, out: binary ? Buffer.alloc(0) : "", error: String((e && (e.stderr || e.message)) || e).trim() };
  }
}

// Step 2 — credentials required BEFORE anything else happens, and BOTH
// halves (apply + reconcile) are required together. See migrationApply.mjs
// checkRequiredCredentials for why.
const creds = checkRequiredCredentials(process.env);
if (!creds.ok) {
  fail(
    `missing required environment variable(s): ${creds.missing.join(", ")}. This tool requires BOTH the Management-API credential to apply AND the PostgREST credentials to immediately reconcile afterward (step 8) — it refuses to apply without also being able to check.`
  );
}

// Step 3a — resolve strictly under supabase/migrations/.
const resolved = resolveCanonicalMigrationPath({ repoRoot: REPO, rawPath: parsed.rawPath });
if (!resolved.ok) fail(resolved.error);

// Step 3b — read the WHOLE file.
const fileResult = readWholeFileBuffer({ fsImpl: realFs, absPath: resolved.absPath });
if (!fileResult.ok) fail(fileResult.error);

// Step 4 — committed, clean, byte-identical to HEAD.
const gitCheck = verifyCommittedAndClean({
  git: realGit,
  repoRoot: REPO,
  relPath: resolved.relPath,
  fileBuffer: fileResult.buffer,
});
if (!gitCheck.ok) fail(gitCheck.error);

// Step 5 — hash + record BEFORE execution.
const sha256 = sha256Hex(fileResult.buffer);
const ledgerAbsPath = path.join(REPO, LEDGER_REL_PATH);

const attemptReceipt = buildReceipt({
  relPath: resolved.relPath,
  version: resolved.version,
  name: resolved.name,
  sha256,
  byteLength: fileResult.buffer.length,
  headCommit: gitCheck.headCommit,
  mode: parsed.mode,
  reason: parsed.reason,
  status: "attempting",
  timestamp: new Date().toISOString(),
});
console.log(`apply-migration: ${JSON.stringify(attemptReceipt)}`);
appendLedgerLine({ fsImpl: realFs, ledgerAbsPath, record: attemptReceipt });

const refResult = deriveProjectRef(creds.supabaseUrl);
if (!refResult.ok) fail(refResult.error);

const sql = fileResult.buffer.toString("utf8");
const reqDescriptor = buildManagementApiRequest({
  mode: parsed.mode,
  projectRef: refResult.ref,
  sql,
  migrationName: resolved.name,
});

// Step 6 — execute. This is the only fetch call in this whole script, and
// its body is always reqDescriptor.body, built above only from `sql`, which
// is only ever fileResult.buffer decoded — never a separately-typed string.
let applyOutcome;
try {
  const r = await fetch(reqDescriptor.url, {
    method: reqDescriptor.method,
    headers: { Authorization: `Bearer ${creds.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(reqDescriptor.body),
  });
  const bodyText = await r.text().catch(() => "");
  applyOutcome = { httpOk: r.ok, status: r.status, body: bodyText.slice(0, 2000) };
} catch (e) {
  applyOutcome = { httpOk: false, status: null, body: String((e && e.message) || e) };
}

// Step 7 — record the outcome.
const finalReceipt = buildReceipt({
  relPath: resolved.relPath,
  version: resolved.version,
  name: resolved.name,
  sha256,
  byteLength: fileResult.buffer.length,
  headCommit: gitCheck.headCommit,
  mode: parsed.mode,
  reason: parsed.reason,
  status: applyOutcome.httpOk ? "applied" : "failed",
  timestamp: new Date().toISOString(),
});
finalReceipt.http = { status: applyOutcome.status, endpoint: reqDescriptor.url };
console.log(`apply-migration: ${JSON.stringify(finalReceipt)}`);
appendLedgerLine({ fsImpl: realFs, ledgerAbsPath, record: finalReceipt });

if (!applyOutcome.httpOk) {
  console.error(`apply-migration: the Management API call FAILED (status ${applyOutcome.status}): ${applyOutcome.body}`);
}
if (parsed.mode === "direct-sql") {
  console.error(
    `apply-migration: EMERGENCY DIRECT-SQL PATH USED (reason: "${parsed.reason}"). This bypasses Supabase's own migration ledger — supabase_migrations.schema_migrations gets no row for it. If check-migration-reconciliation.mjs (running next) reports ${resolved.relPath} as unresolved, add it to APPLIED_WITHOUT_LEDGER_ENTRY in scripts/check-migration-reconciliation.mjs, naming the specific live object(s) sha256 ${sha256} proves this file created, and commit that alongside this run's log line in ${LEDGER_REL_PATH}.`
  );
}

// Step 8 — ALWAYS reconcile next, same operation. Never skipped: the
// credentials required at step 2 are exactly the ones this needs, so this
// call cannot SKIP the way it would with no credentials at all.
console.log("apply-migration: running migration reconciliation now (same operation, not a separate step) ...");
const recon = spawnSync("node", ["scripts/check-migration-reconciliation.mjs"], {
  cwd: REPO,
  stdio: "inherit",
  env: process.env,
});
const reconOk = recon.status === 0;

console.log(
  `apply-migration: SUMMARY — file=${resolved.relPath} sha256=${sha256} mode=${parsed.mode} apply=${applyOutcome.httpOk ? "OK" : "FAILED"} reconciliation=${reconOk ? "OK" : "FAILED"}`
);
console.log(`apply-migration: commit ${LEDGER_REL_PATH} — an applied migration with no committed record of it is the second half of the 2026-09-07 incident this tool exists to prevent.`);

process.exit(applyOutcome.httpOk && reconOk ? 0 : 1);
