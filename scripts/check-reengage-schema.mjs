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

// The columns and keys the re-engagement routes depend on. Each is a position in
// the DDL (inside the named table's own body, or its own statement), not a name
// that appears somewhere in the file.
function tableBody(sql, t) {
  const m = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(?:public\\.)?${t}\\s*\\(([\\s\\S]*?)\\n\\);`, "i").exec(sql);
  return m ? m[1] : "";
}
export function checkShape(rawSql) {
  const sql = stripSqlComments(rawSql);
  const problems = [];
  const contacts = tableBody(sql, "wf_reengage_contacts");
  const queue = tableBody(sql, "wf_reengage_queue");
  if (!/^\s*email_hash\s+text\s+not\s+null\s+unique\b/im.test(contacts)) problems.push("wf_reengage_contacts has no `email_hash text not null unique` column (the address must never be a lookup key in a URL)");
  if (!/^\s*confirmed_at\s+timestamptz\s*,/im.test(contacts)) problems.push("wf_reengage_contacts has no nullable `confirmed_at timestamptz` column (the click that confirms a recipient)");
  if (!/trigger_type[^\n]*\n?[^\n]*check\s*\(trigger_type\s+in\s*\([^)]*'itinerary_email'/i.test(queue)) problems.push("wf_reengage_queue.trigger_type does not allow 'itinerary_email' (the immediate send rows the daily cap counts)");
  const idx = /create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?\w+\s+on\s+(?:public\.)?wf_reengage_queue\s*\(\s*contact_id\s*,\s*trigger_type\s*,\s*channel\s*,\s*step\s*,\s*dedupe_key\s*\)\s*([^;]*);/i.exec(sql);
  if (!idx) problems.push("wf_reengage_queue has no unique index on (contact_id, trigger_type, channel, step, dedupe_key): per contact drip dedupe is gone");
  else if (/\bwhere\b/i.test(idx[1])) problems.push("the contact unique index is PARTIAL: PostgREST on_conflict cannot target a partial index, so every drip insert would fail");
  return problems;
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
const shape = checkShape(sql);
for (const p of shape) ok(false, p);
const shapeBreakers = {
  "email_hash column dropped": (x) => x.replace(/^\s*email_hash\s+text\s+not\s+null\s+unique[^\n]*\n/m, ""),
  "confirmed_at column dropped": (x) => x.replace(/^\s*confirmed_at\s+timestamptz,\n/m, ""),
  "itinerary_email trigger dropped": (x) => x.replace("'itinerary_email', ", ""),
  "contact unique index dropped": (x) => x.replace(/create unique index if not exists wf_reengage_queue_contact_key[\s\S]*?;\n/, ""),
  "contact unique index made partial": (x) => x.replace("(contact_id, trigger_type, channel, step, dedupe_key);", "(contact_id, trigger_type, channel, step, dedupe_key) where contact_id is not null;"),
  "email_hash only in a comment": (x) => x.replace(/^(\s*)email_hash(\s+text\s+not\s+null\s+unique[^\n]*\n)/m, "$1-- email_hash$2"),
};
for (const [name, mutate] of Object.entries(shapeBreakers)) {
  const mutated = mutate(sql);
  ok(mutated !== sql, `shape negative control "${name}" did not change the SQL, so it proves nothing`);
  ok(checkShape(mutated).length > 0, `shape negative control "${name}" was NOT caught`);
}
// A commented-out revoke must not satisfy the check.
const commentedRevoke = sql.replace(`revoke all on table public.${first} from public, anon, authenticated;`, `-- revoke all on table public.${first} from public, anon, authenticated;`);
ok(commentedRevoke !== sql && checkSchema(commentedRevoke).problems.length > 0, "a commented-out revoke satisfied the check");

if (failures) { console.error(`check-reengage-schema: ${failures} failure(s)`); process.exit(1); }
console.log(`check-reengage-schema: OK — ${real.tables.length} tables (${real.tables.join(", ")}) each with RLS on, revoke from anon+authenticated, service_role grant only; 0 policies; ${Object.keys(breakers).length + 1} negative controls caught; contacts.email_hash + confirmed_at, queue itinerary_email trigger and a non partial contact unique index present (${Object.keys(shapeBreakers).length} shape negative controls caught)`);
