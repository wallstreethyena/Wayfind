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
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  reconcile,
  parseFileName,
  reconcileProduction,
  canonicalSingleStatementHash,
  verifyLedgerContent,
  resolvePendingDeclarations,
  fetchAllRpcRows,
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
  // Content integrity: a name match must also be a content match, unless a
  // reviewed baseline pins both hashes.
  {
    const sql = "select 1;\n";
    const file = "20260101_content_fixture.sql";
    const hashes = new Map([[file, canonicalSingleStatementHash(sql)]]);
    const row = (h) => [{ version: "20260101000009", name: "content_fixture", statements_sha256: h }];
    const drifted = "c".repeat(64);
    const entry = { version: "20260101000009", name: "content_fixture", file, ledger_sha256: drifted, file_sha256: hashes.get(file), kind: "statement-text-differs", reason: "fixture: reviewed pre-existing difference", reviewed_by: "self-test" };
    const verdict = (h, baseline) => verifyLedgerContent({ files: [file], ledger: row(h), canonicalHashes: hashes, baseline });
    if (verdict(hashes.get(file), []).errors.length || verdict(hashes.get(file), []).verified !== 1) { fails++; console.error("self-test FAIL — an exact name+content match must verify"); }
    if (!verdict(drifted, []).errors.some((e) => e.startsWith("content drift"))) { fails++; console.error("self-test FAIL — same name, different SQL must be content drift"); }
    if (verdict(drifted, [entry]).errors.length || verdict(drifted, [entry]).baselined !== 1) { fails++; console.error("self-test FAIL — a difference pinned by a reviewed baseline must pass"); }
    if (!verdict("d".repeat(64), [entry]).errors.length) { fails++; console.error("self-test FAIL — a baselined row whose ledger text changed again must fail"); }
    if (!verdict(hashes.get(file), [entry]).errors.some((e) => e.startsWith("stale content baseline"))) { fails++; console.error("self-test FAIL — a baseline entry for a row that now matches must be reported stale"); }
  }
  // Paging, against a server that behaves like PostgREST on an rpc POST:
  // honours ?offset=&limit=, caps every response at max-rows, answers
  // Content-Range "<from>-<to>/<exact count>" ("*/<count>" when empty).
  // Each faulty variant is a way a read can look complete and not be.
  {
    const mk = (n) => Array.from({ length: n }, (_, i) => ({ kind: i % 7 ? "column" : "function", name: `obj_${String(i).padStart(5, "0")}` }))
      .sort((a, b) => (a.kind + ":" + a.name < b.kind + ":" + b.name ? -1 : 1));
    const base = mk(2349);
    const pgrst = ({ cap = 1000, data = () => base, ignoreOffset = false, lieRange = false, count = true, malformed = false, emptyAt = -1, shortBy = 0, extraCount = 0, dupFirst = false } = {}) => {
      let calls = 0;
      return async (url) => {
        calls++;
        const q = new URL(url).searchParams;
        if (!q.get("order")) throw new Error("fixture: no order requested");
        const rows = data(calls);
        const all = dupFirst ? [rows[0], ...rows.slice(0, rows.length - 1)] : rows.slice(0, rows.length - shortBy);
        const off = ignoreOffset ? 0 : Number(q.get("offset") || 0);
        const lim = Math.min(Number(q.get("limit") || cap), cap);
        let page = all.slice(off, off + lim);
        if (emptyAt >= 0 && Number(q.get("offset")) >= emptyAt) page = [];
        const reportedFrom = lieRange ? Number(q.get("offset") || 0) : off;
        const totalStr = String(rows.length + extraCount);
        const cr = malformed ? `rows ${reportedFrom}` : page.length ? `${reportedFrom}-${reportedFrom + page.length - 1}/${totalStr}` : `*/${totalStr}`;
        return { ok: true, status: 206, json: async () => page, headers: { get: (h) => (count && h.toLowerCase() === "content-range" ? cr : null) } };
      };
    };
    const read = (fetchImpl, extra = {}) => fetchAllRpcRows({ url: "https://fixture.invalid", key: "k", fn: "fixture_rpc", order: "kind.asc,name.asc", identity: (r) => `${r.kind}:${r.name}`, fetchImpl, ...extra });
    const expectOk = async (label, f, n) => { const r = await read(f); if (r.error || r.rows.length !== n) { fails++; console.error(`self-test FAIL — paging: ${label} must read all ${n} rows (${r.error || r.rows.length})`); } };
    const expectFail = async (label, f, extra) => { const r = await read(f, extra); if (!r.error) { fails++; console.error(`self-test FAIL — paging: ${label} must fail closed, it returned ${r.rows.length} rows as complete`); } };
    await expectOk("a 1,000-row cap", pgrst(), 2349);
    await expectOk("a smaller unknown cap (300)", pgrst({ cap: 300 }), 2349);
    await expectOk("an exact multiple of the page size", pgrst({ data: () => mk(2000) }), 2000);
    await expectOk("an empty result", pgrst({ data: () => [] }), 0);
    await expectOk("one clean retry after the data changed mid-read", pgrst({ data: (c) => (c <= 2 ? mk(2349) : mk(2350)) }), 2350);
    await expectFail("first page only (offset ignored, honest range)", pgrst({ ignoreOffset: true }));
    await expectFail("offset ignored behind a range that echoes the request", pgrst({ ignoreOffset: true, lieRange: true }));
    await expectFail("no exact count", pgrst({ count: false }));
    await expectFail("a malformed Content-Range", pgrst({ malformed: true }));
    await expectFail("an empty page before the total", pgrst({ emptyAt: 1000 }));
    await expectFail("fewer rows than the server's own count", pgrst({ shortBy: 5 }));
    await expectFail("a count larger than the rows served", pgrst({ extraCount: 3 }));
    await expectFail("a dataset that keeps changing", pgrst({ data: (c) => mk(2349 + c) }));
    await expectFail("a repeated identity in a unique key", pgrst({ dupFirst: true }), { unique: true });
  }
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


const [ledgerResult, objectsResult] = await Promise.all([
  fetchAllRpcRows({ url: URL_, key: KEY, fn: "wf_migration_ledger_hashes", order: "version.asc", identity: (r) => r && r.version, unique: true }),
  fetchAllRpcRows({ url: URL_, key: KEY, fn: "wf_schema_objects", order: "kind.asc,name.asc", identity: (r) => r && `${r.kind}:${r.name}` }),
]);
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
const reverse = reconcileProduction(files, ledgerResult.rows, exceptions, canonicalHashes, objectSet);
for (const error of reverse.errors) console.error(`check-migration-reconciliation: FAIL — ${error}`);
let bad = reverse.errors.length, applied = 0;

// ── Content integrity, not filename alone ───────────────────────────────────
// Every production row matched to a repo file by name must carry the exact
// statement hash of that committed file, or be pinned (both hashes) in the
// reviewed baseline. Missing baseline file fails closed.
let contentBaseline;
try { contentBaseline = JSON.parse(readFileSync(path.join(REPO, "scripts/migration-content-baseline.json"), "utf8")); }
catch (e) { contentBaseline = null; bad++; console.error(`check-migration-reconciliation: FAIL — cannot read scripts/migration-content-baseline.json: ${e.message}`); }
const content = contentBaseline
  ? verifyLedgerContent({ files, ledger: ledgerResult.rows, canonicalHashes, baseline: contentBaseline, exceptions })
  : { errors: [], verified: 0, baselined: 0 };
for (const error of content.errors) console.error(`check-migration-reconciliation: FAIL — ${error}`);
bad += content.errors.length;
const unresolved = [], appliedFiles = new Set(), rawHashes = new Map();
for (const file of files) {
  rawHashes.set(file, createHash("sha256").update(readFileSync(path.join(MIGRATIONS_DIR, file))).digest("hex"));
  const result = reconcile(file, ledgerResult.rows, objectSet, canonicalHashes.get(file));
  if (result.status === "ok") { applied++; appliedFiles.add(file); continue; }
  if (result.status === "fail") { bad++; console.error(`check-migration-reconciliation: FAIL — supabase/migrations/${file}: ${result.detail}`); continue; }
  unresolved.push(file);
}
// An unresolved file passes ONLY as an owned, hash-pinned pending declaration
// (resolvePendingDeclarations); stale or mismatched declarations fail.
let pendingManifest = null;
try { pendingManifest = JSON.parse(readFileSync(path.join(REPO, "scripts/migration-pending-apply.json"), "utf8")); }
catch (e) { bad++; console.error(`check-migration-reconciliation: FAIL — cannot read scripts/migration-pending-apply.json: ${e.message}`); }
const pendingVerdict = pendingManifest
  ? resolvePendingDeclarations({ unresolved, applied: appliedFiles, pending: pendingManifest, rawHashes })
  : { errors: [], declared: [] };
for (const error of pendingVerdict.errors) { bad++; console.error(`check-migration-reconciliation: FAIL — ${error}`); }
for (const d of pendingVerdict.declared) console.log(`check-migration-reconciliation: PENDING (declared, NOT applied in production) — ${d.file} owner=${d.owner} tracking=${d.tracking}`);

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
console.log(`check-migration-reconciliation: OK — ${files.length} files under supabase/migrations/ reconcile bidirectionally against production (${applied} applied); content: ${content.verified} name-matched migrations byte-identical to production, ${content.baselined} reviewed historical differences pinned by hash, 0 drift; ${pendingVerdict.declared.length} declared-pending (owned, hash-pinned, absent from production by design); self-test + hash-alias red-proof passed.`);
