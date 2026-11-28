// scripts/check-reengage-schema.mjs — lock for the re-engagement tables
// STRUCTURAL-ONLY: the target is SQL DDL; there is no local Postgres to run it, so the comment-stripped text is parsed (with negative controls).
// (supabase/migrations/20261128040000_wf_reengagement.sql).
//
// These tables hold email addresses, consent records and push endpoints. The
// only safe shape is: RLS ON, NO policies, no grant to anon/authenticated/public,
// service role only. This guard parses the migration (SQL comments stripped
// first, so a comment cannot satisfy or trip a check) and asserts, per table:
//   * a matching `alter table ... enable row level security`
//   * a `revoke all on table ... from` that names anon AND authenticated
//   * no grant to anon, authenticated or public
// and, for the file: zero `create policy`, and exactly the five expected tables.
//
// POSITIVE CONTROL: the parser must find exactly 5 tables in the real file, and
// each deliberately broken copy of the SQL (below) must be caught. A checker that
// reports "clean" for everything, including a file it should reject, is broken,
// not clean.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIR = path.join(ROOT, "supabase/migrations");
export const EXPECTED = ["wf_reengage_contacts", "wf_reengage_push_subs", "wf_reengage_queue", "wf_reengage_suppressions", "wf_reengage_signals"];

// Remove `-- ...` line comments (respecting single quoted strings) and /* ... */ blocks.
export function stripSqlComments(sql) {
  const noBlock = String(sql).replace(/\/\*[\s\S]*?\*\//g, " ");
  return noBlock.split("\n").map((line) => {
    let inStr = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === "'") inStr = !inStr;
      else if (!inStr && ch === "-" && line[i + 1] === "-") return line.slice(0, i);
    }
    return line;
  }).join("\n");
}

const tbl = (name) => `(?:public\\.)?${name}`;

export function checkSchema(rawSql) {
  const sql = stripSqlComments(rawSql);
  const problems = [];
  const created = [...sql.matchAll(/\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi)].map((m) => m[1].toLowerCase());
  if (created.length !== EXPECTED.length || EXPECTED.some((t) => !created.includes(t))) {
    problems.push(`expected exactly the tables ${EXPECTED.join(", ")}; found ${created.length}: ${created.join(", ") || "none"}`);
  }
  for (const t of created) {
    if (!new RegExp(`\\balter\\s+table\\s+${tbl(t)}\\s+enable\\s+row\\s+level\\s+security\\b`, "i").test(sql)) problems.push(`${t}: no "enable row level security"`);
    const revokes = [...sql.matchAll(new RegExp(`\\brevoke\\s+all\\s+on\\s+(?:table\\s+)?${tbl(t)}\\s+from\\s+([^;]+);`, "gi"))].map((m) => m[1].toLowerCase());
    if (!revokes.some((r) => /\banon\b/.test(r) && /\bauthenticated\b/.test(r))) problems.push(`${t}: no "revoke all ... from" naming both anon and authenticated`);
    if (new RegExp(`\\bgrant\\s+[^;]*\\bon\\s+(?:table\\s+)?${tbl(t)}\\s+to\\s+[^;]*\\b(?:anon|authenticated|public)\\b`, "i").test(sql)) problems.push(`${t}: granted to anon, authenticated or public`);
    if (!new RegExp(`\\bgrant\\s+all\\s+on\\s+(?:table\\s+)?${tbl(t)}\\s+to\\s+service_role\\b`, "i").test(sql)) problems.push(`${t}: no grant to service_role`);
  }
  const policies = [...sql.matchAll(/\bcreate\s+policy\b/gi)].length;
  if (policies) problems.push(`${policies} "create policy" statement(s): these tables must have RLS ON with NO policies`);
  return { problems, tables: created };
}

let failures = 0;
const ok = (cond, msg) => { if (!cond) { console.error("check-reengage-schema: FAIL — " + msg); failures += 1; } };

const files = readdirSync(DIR).filter((f) => /_wf_reengagement\.sql$/.test(f));
ok(files.length === 1, `expected exactly one *_wf_reengagement.sql migration, found ${files.length}`);
const sql = files.length ? readFileSync(path.join(DIR, files[0]), "utf8") : "";
const real = checkSchema(sql);
for (const p of real.problems) ok(false, p);
ok(real.tables.length === 5, `positive control: the parser found ${real.tables.length} tables, expected 5`);
ok(/^begin;/m.test(stripSqlComments(sql)) && /^commit;/m.test(stripSqlComments(sql)), "migration is not wrapped in begin/commit");

// Negative controls: break the real SQL five ways and demand each one is caught.
const first = EXPECTED[0];
const breakers = {
  "RLS dropped": (s) => s.replace(`alter table public.${first} enable row level security;`, ""),
  "revoke without authenticated": (s) => s.replace(`revoke all on table public.${first} from public, anon, authenticated;`, `revoke all on table public.${first} from public, anon;`),
  "a policy added": (s) => s + `\ncreate policy p on public.${first} for select using (true);\n`,
  "grant to anon": (s) => s + `\ngrant select on table public.${first} to anon;\n`,
  "a table hidden in a comment only": (s) => s.replace(/create table if not exists public\.wf_reengage_signals/, "-- create table if not exists public.wf_reengage_signals"),
};
for (const [name, mutate] of Object.entries(breakers)) {
  const mutated = mutate(sql);
  ok(mutated !== sql, `negative control "${name}" did not change the SQL, so it proves nothing`);
  ok(checkSchema(mutated).problems.length > 0, `negative control "${name}" was NOT caught`);
}
// A commented-out revoke must not satisfy the check.
const commentedRevoke = sql.replace(`revoke all on table public.${first} from public, anon, authenticated;`, `-- revoke all on table public.${first} from public, anon, authenticated;`);
ok(commentedRevoke !== sql && checkSchema(commentedRevoke).problems.length > 0, "a commented-out revoke satisfied the check");

if (failures) { console.error(`check-reengage-schema: ${failures} failure(s)`); process.exit(1); }
console.log(`check-reengage-schema: OK — ${real.tables.length} tables (${real.tables.join(", ")}) each with RLS on, revoke from anon+authenticated, service_role grant only; 0 policies; ${Object.keys(breakers).length + 1} negative controls caught`);
