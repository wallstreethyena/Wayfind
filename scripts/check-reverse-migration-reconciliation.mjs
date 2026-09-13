import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { reconcileProduction, canonicalSingleStatementHash } from './lib/migrationReconciliation.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'wf-reverse-migrations-'));
const hash = 'a'.repeat(64);
const row = { version: '20260907114404', name: 'historical', statements_sha256: hash };
const pin = { ...row, reason: 'Reviewed historical repair', reviewed_by: 'fixture reviewer' };
let cases = 0;
try {
  mkdirSync(path.join(dir, 'scripts/lib'), { recursive: true });
  mkdirSync(path.join(dir, 'supabase/migrations'), { recursive: true });
  for (const file of ['check-migration-reconciliation.mjs', 'lib/migrationReconciliation.mjs']) cpSync(path.join(root, 'scripts', file), path.join(dir, 'scripts', file));
  const ledger = Array.from({ length: 55 }, (_, i) => ({ version: String(20260101000000 + i), name: `fixture_${i}`, statements_sha256: hash }));
  for (const r of ledger) writeFileSync(path.join(dir, 'supabase/migrations', `${r.version}_${r.name}.sql`), 'create table example(id int);');
  const preload = path.join(dir, 'fetch.mjs');
  function run(label, rows, pins, expected) {
    writeFileSync(path.join(dir, 'scripts/migration-historical-exceptions.json'), JSON.stringify(pins));
    writeFileSync(preload, `globalThis.fetch = async url => ({ok:true,json:async()=>String(url).endsWith('/wf_migration_ledger_hashes')?${JSON.stringify(rows)}:[]});`);
    const r = spawnSync(process.execPath, ['--import', preload, path.join(dir, 'scripts/check-migration-reconciliation.mjs')], {
      encoding: 'utf8', env: { SUPABASE_URL: 'https://fixture.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fixture-only' },
    });
    assert.equal(r.status, expected, `${label}: ${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout + r.stderr, expected ? /FAIL/ : /OK —/);
    cases++;
  }
  run('canonical positive control', ledger, [], 0);
  run('unknown production-only migration', [...ledger, row], [], 1);
  run('wrong historical hash', [...ledger, row], [{ ...pin, statements_sha256: 'b'.repeat(64) }], 1);
  run('exact reviewed historical exception', [...ledger, row], [pin], 0);
  run('wrong historical name', [...ledger, row], [{ ...pin, name: 'wrong' }], 1);
  run('stale historical exception', ledger, [pin], 1);
  run('missing hash', [...ledger, { ...row, statements_sha256: null }], [pin], 1);

  // Regression for the 2026-09-09 Supabase connector naming anomaly: the
  // ledger may record <version>_<name> (the full filename stem) instead of
  // just <name>. It is valid only when the one-statement ledger hash matches
  // the exact canonical file bytes. Same stem + different SQL must stay red.
  const aliasFile = '20260102000000_alias_fixture.sql';
  const aliasSql = 'create table alias_example(id int);\n';
  const aliasPath = path.join(dir, 'supabase/migrations', aliasFile);
  writeFileSync(aliasPath, aliasSql);
  const aliasRow = {
    version: '20260103000000',
    name: aliasFile.slice(0, -4),
    statements_sha256: canonicalSingleStatementHash(aliasSql),
  };
  run('filename-stem alias exact hash', [...ledger, aliasRow], [], 0);
  run('filename-stem alias wrong hash', [...ledger, { ...aliasRow, statements_sha256: 'b'.repeat(64) }], [], 1);
  run('one canonical file cannot cover logical plus filename-stem applies', [...ledger, aliasRow, { ...aliasRow, version: '20260103000001', name: 'alias_fixture' }], [], 1);
  rmSync(aliasPath);

  const first = path.join(dir, 'supabase/migrations', `${ledger[0].version}_${ledger[0].name}.sql`);
  rmSync(first);
  run('missing repository migration', ledger, [], 1);
  writeFileSync(first, 'create table example(id int);');
  run('repository migration unapplied', ledger.slice(1), [], 1);
  writeFileSync(first, 'update example set id = 2;');
  run('DML migration unapplied', ledger.slice(1), [], 1);
  const duplicate = { ...ledger[0], version: '20260102000000' };
  const mapping = { ...duplicate, reason: 'Reviewed repeated historical application', reviewed_by: 'fixture reviewer', canonical_file: `${ledger[0].version}_${ledger[0].name}.sql` };
  run('unreviewed duplicate canonical name', [...ledger, duplicate], [], 1);
  // Both repeated ledger entries need review; one file cannot silently cover two.
  const firstMapping = { ...mapping, ...ledger[0] };
  run('reviewed duplicate canonical mappings', [...ledger, duplicate], [mapping, firstMapping], 0);
  rmSync(first);
  run('deleted mapped canonical file', [...ledger, duplicate], [mapping, firstMapping], 1);
  writeFileSync(first, 'create table example(id int);');
  assert.ok(reconcileProduction([], [], []).errors.length);
  assert.ok(reconcileProduction([], [row], [pin, pin]).errors.length);
  const actualPins = JSON.parse(readFileSync(path.join(root, 'scripts/migration-historical-exceptions.json'), 'utf8'));
  assert.equal(reconcileProduction(readdirSync(path.join(root, 'supabase/migrations')).filter(f => f.endsWith('.sql')), actualPins, actualPins).errors.length, 0);
  assert.match(readFileSync(path.join(root, '.github/workflows/canary.yml'), 'utf8'), /node scripts\/check-migration-reconciliation\.mjs/);
  console.log(`check-reverse-migration-reconciliation: OK — ${cases} real CLI exit-code controls, filename-stem hash red-proof, manifest and canary wiring passed`);
} finally { rmSync(dir, { recursive: true, force: true }); }
