#!/usr/bin/env node
/**
 * test-migration-lease — the production migration lease (2026-11-14).
 *
 * scripts/apply-migration.mjs takes public.wf_migration_lease before it sends
 * any migration SQL, so two appliers cannot run against the project at once.
 * This locks the pure halves: the SQL the lease uses (atomic UPDATE ... RETURNING
 * with a free / expired / ours predicate, nothing user-shaped spliced in), the
 * acquired-reply parser (fails closed on anything but exactly our row), and the
 * wiring in apply-migration.mjs (lease before the receipt and the apply, release
 * after the outcome receipt). The concurrency itself is proved against a real
 * Postgres by scripts/prove-migration-lease-race.sh (run manually; output in the PR).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildLeaseAcquireSql, buildLeaseReleaseSql, leaseAcquired, LEASE_MIGRATION_FILE } from "./lib/migrationApply.mjs";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fails = [];
let n = 0;
const ok = (cond, msg) => { n++; if (!cond) fails.push(msg); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

const acq = buildLeaseAcquireSql({ holder: "apply-migration:host:1:ab12", migration: "20261114_x" });
ok(/^update public\.wf_migration_lease/m.test(acq) && /returning holder;$/m.test(acq), "acquire is one UPDATE ... RETURNING (atomic in Postgres)");
ok(/where id = 1 and \(holder is null or expires_at < now\(\) or holder = 'apply-migration:host:1:ab12'\)/.test(acq), "acquire only when free, expired, or already ours");
ok(/interval '900 seconds'/.test(acq), "default TTL 900s so a crashed holder cannot wedge the lease");
for (const bad of ["x'; drop table t; --", "a b", "", "x".repeat(201), "q\"", "n\\n"]) {
  ok(throws(() => buildLeaseAcquireSql({ holder: bad, migration: "m" })), `unsafe holder refused: ${JSON.stringify(bad).slice(0, 30)}`);
  ok(throws(() => buildLeaseAcquireSql({ holder: "h", migration: bad })), `unsafe migration name refused: ${JSON.stringify(bad).slice(0, 30)}`);
  ok(throws(() => buildLeaseReleaseSql({ holder: bad })), `unsafe release holder refused: ${JSON.stringify(bad).slice(0, 30)}`);
}
for (const ttl of [0, 59, 3601, 1.5, "900"]) ok(throws(() => buildLeaseAcquireSql({ holder: "h", migration: "m", ttlSeconds: ttl })), `ttl ${ttl} refused`);
ok(/where id = 1 and holder = 'h' returning id;$/.test(buildLeaseReleaseSql({ holder: "h" })), "release only clears OUR lease");

ok(leaseAcquired('[{"holder":"me"}]', "me"), "acquired: exactly our row");
for (const [body, why] of [["[]", "no row (held by someone else)"], ['[{"holder":"other"}]', "another holder"], ['[{"holder":"me"},{"holder":"me"}]', "two rows"], ["not json", "unparseable"], ['{"message":"relation does not exist"}', "error object"], ["", "empty"]]) {
  ok(!leaseAcquired(body, "me"), `not acquired: ${why}`);
}

// Wiring: lease before the first receipt and the apply; release after the outcome receipt.
const src = readFileSync(path.join(REPO, "scripts", "apply-migration.mjs"), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");
const at = (re) => { const m = src.search(re); return m < 0 ? Infinity : m; };
const acquireAt = at(/buildLeaseAcquireSql\(/);
const firstReceipt = at(/appendLedgerLine\(\{ fsImpl: realFs, ledgerAbsPath, record: attemptReceipt \}\)/);
const applyAt = at(/fetch\(reqDescriptor\.url/);
const finalReceipt = at(/record: finalReceipt \}\)/);
const releaseAt = at(/buildLeaseReleaseSql\(/);
ok(acquireAt < firstReceipt && firstReceipt < applyAt && applyAt < finalReceipt && finalReceipt < releaseAt,
  `apply-migration order: lease ${acquireAt} < attempt receipt ${firstReceipt} < apply ${applyAt} < outcome receipt ${finalReceipt} < release ${releaseAt}`);
ok(/if \(!got\.ok \|\| !leaseAcquired\(got\.body, leaseHolder\)\) \{\s*fail\(/.test(src), "no lease → refuse before any migration SQL is sent");
ok(/path\.basename\(resolved\.relPath\) === LEASE_MIGRATION_FILE/.test(src) && LEASE_MIGRATION_FILE === "20261114170000_wf_migration_lease.sql",
  "only the lease table's own migration skips the lease (bootstrap)");
const leaseSql = readFileSync(path.join(REPO, "supabase", "migrations", LEASE_MIGRATION_FILE), "utf8");
ok(/enable row level security/.test(leaseSql) && /revoke all on table public\.wf_migration_lease from anon, authenticated/.test(leaseSql) && !/create policy/i.test(leaseSql),
  "lease table is service-only: RLS on, no policies, no anon/authenticated grants");

if (fails.length) {
  console.error(`test-migration-lease: FAIL (${fails.length} of ${n})\n  - ${fails.join("\n  - ")}`);
  process.exit(1);
}
console.log(`test-migration-lease: OK — ${n} assertions: atomic acquire SQL, injection-safe tokens, bounded TTL, fail-closed reply parsing, lease-before-SQL wiring, service-only table`);
