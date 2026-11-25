// Runtime PostgreSQL for supabase/migrations/20261125190000_wf_competitor_watch.sql.
// STRUCTURAL-ONLY: the subject is a SQL migration with no lib/ or app/ code to import;
// it is EXECUTED in an in-memory PGlite, never read as text alone.
// Isolated PGlite (in memory, never production). Roles are created here the way
// Supabase provides them, including Supabase's default table grants to anon,
// authenticated and service_role, so the migration's REVOKE is what actually
// keeps anon and authenticated out (not an accident of an empty test database).
//
// Proves: anon and authenticated cannot select or insert either table; the
// service role can; the unique constraints dedupe a rerun; the length and value
// checks hold; and (red proof) the same probes DO see access when the revoke
// lines are removed, so a green here is earned.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const FILE = new URL("../supabase/migrations/20261125190000_wf_competitor_watch.sql", import.meta.url);
const sql = await readFile(FILE, "utf8");
const h = (s) => createHash("sha256").update(s).digest("hex");

let count = 0;
const ok = (value, label) => { assert.ok(value, label); count += 1; };
const eq = (a, b, label) => { assert.deepEqual(a, b, label); count += 1; };

const SUPABASE_LIKE = `
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

async function freshDb(migrationSql) {
  const db = new PGlite();
  await db.exec(SUPABASE_LIKE);
  await db.exec(migrationSql);
  const asRole = async (role, q, params = []) => {
    await db.exec("begin");
    try {
      await db.exec(`set local role ${role}`);
      const r = await db.query(q, params);
      await db.exec("commit");
      return r;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  };
  return { db, asRole };
}

const INTEL_INSERT = `insert into public.wf_competitor_intel
  (competitor, tier, source_url_hash, source_host, title, metro, signal_type, diff_summary)
  values ($1, 1, $2, 'www.example.com', 'Winter lights guide', 'tampa', $3, 'New seasonal guide URL')
  on conflict (competitor, source_url_hash, signal_type) do nothing returning id`;
const PROMO_INSERT = `insert into public.wf_competitor_promos
  (competitor, metro, subject, discount_pct, impact_level, source_url, source_url_hash)
  values ($1, 'orlando', $2, $3, 'medium', 'https://www.example.com/deals', $4)
  on conflict (competitor, source_url_hash, subject) do nothing returning id, status`;

// ── the real migration ──────────────────────────────────────────────────────
{
  ok(/^begin;$/m.test(sql) && /^commit;$/m.test(sql), "the migration runs inside begin/commit");
  ok(/Reverse:[\s\S]*drop table if exists public\.wf_competitor_promos, public\.wf_competitor_intel;/.test(sql), "the header carries the reverse SQL");
  const { db, asRole } = await freshDb(sql);
  count += 1;

  for (const t of ["wf_competitor_intel", "wf_competitor_promos"]) {
    const rls = await db.query("select relrowsecurity from pg_class where relname = $1", [t]);
    eq(rls.rows[0].relrowsecurity, true, `${t}: row level security is on`);
    const pol = await db.query("select count(*)::int as n from pg_policies where tablename = $1", [t]);
    eq(pol.rows[0].n, 0, `${t}: no policies (service role only)`);
    for (const role of ["anon", "authenticated"]) {
      await assert.rejects(() => asRole(role, `select * from public.${t}`), /permission denied/i, `${role} cannot select ${t}`);
      count += 1;
    }
  }
  for (const role of ["anon", "authenticated"]) {
    await assert.rejects(() => asRole(role, INTEL_INSERT, ["fever", h("u1"), "new_guide"]), /permission denied/i, `${role} cannot insert intel`);
    count += 1;
    await assert.rejects(() => asRole(role, PROMO_INSERT, ["fever", "25% off: lights", 25, h("p1")]), /permission denied/i, `${role} cannot insert promos`);
    count += 1;
  }

  // Service role: insert, read back, and dedupe a rerun.
  const first = await asRole("service_role", INTEL_INSERT, ["fever", h("u1"), "new_guide"]);
  eq(first.rows.length, 1, "service role inserts an intel row");
  const again = await asRole("service_role", INTEL_INSERT, ["fever", h("u1"), "new_guide"]);
  eq(again.rows.length, 0, "the same (competitor, url hash, signal) is deduped by the unique constraint");
  const otherSignal = await asRole("service_role", INTEL_INSERT, ["fever", h("u1"), "new_event"]);
  eq(otherSignal.rows.length, 1, "a different signal on the same URL is its own row");
  await assert.rejects(
    () => asRole("service_role", INTEL_INSERT.replace(" on conflict (competitor, source_url_hash, signal_type) do nothing", ""), ["fever", h("u1"), "new_guide"]),
    /duplicate key|unique/i, "a plain duplicate insert is refused by the database",
  );
  count += 1;
  const read = await asRole("service_role", "select competitor, signal_type, matched_wayfind from public.wf_competitor_intel order by id");
  eq(read.rows, [{ competitor: "fever", signal_type: "new_guide", matched_wayfind: false }, { competitor: "fever", signal_type: "new_event", matched_wayfind: false }], "service role reads the rows back");

  const p1 = await asRole("service_role", PROMO_INSERT, ["fever", "25% off: lights", 25, h("p1")]);
  eq(p1.rows[0].status, "new", "a promo starts as status new");
  const p2 = await asRole("service_role", PROMO_INSERT, ["fever", "25% off: lights", 25, h("p1")]);
  eq(p2.rows.length, 0, "the same (competitor, url hash, subject) promo is deduped");

  // The checks that keep page bodies and bad values out.
  const bad = [
    ["intel signal type outside the list", INTEL_INSERT, ["fever", h("u2"), "page_body"]],
    ["intel url hash that is not sha256 hex", INTEL_INSERT, ["fever", "https://example.com/raw-url", "new_guide"]],
    ["intel competitor slug with spaces", INTEL_INSERT, ["Fever Up", h("u3"), "new_guide"]],
    ["promo discount over 100", PROMO_INSERT, ["fever", "150% off", 150, h("p2")]],
    ["promo discount under 0", PROMO_INSERT, ["fever", "minus", -5, h("p3")]],
    ["promo subject over 160 chars", PROMO_INSERT, ["fever", "x".repeat(161), 20, h("p4")]],
  ];
  for (const [label, q, params] of bad) {
    await assert.rejects(() => asRole("service_role", q, params), /check constraint|violates/i, label);
    count += 1;
  }
  await assert.rejects(
    () => asRole("service_role", `insert into public.wf_competitor_intel (competitor, tier, source_url_hash, source_host, title, metro, signal_type, diff_summary) values ('fever', 1, $1, 'www.example.com', 't', 'tampa', 'new_guide', $2)`, [h("u9"), "y".repeat(401)]),
    /check constraint/i, "a diff summary over 400 chars (a page body) is refused",
  );
  count += 1;
  await assert.rejects(
    () => asRole("service_role", `insert into public.wf_competitor_promos (competitor, metro, subject, impact_level, status, source_url, source_url_hash) values ('fever', 'miami', 's', 'medium', 'published', 'https://www.example.com', $1)`, [h("p9")]),
    /check constraint/i, "a promo status outside new/reviewed/dismissed is refused",
  );
  count += 1;
  await assert.rejects(
    () => asRole("service_role", `insert into public.wf_competitor_promos (competitor, metro, subject, impact_level, source_url, source_url_hash) values ('fever', 'miami', 's', 'extreme', 'https://www.example.com', $1)`, [h("p8")]),
    /check constraint/i, "an impact level outside low/medium/high is refused",
  );
  count += 1;
  await db.close();
}

// ── red proof: without the REVOKE lines the same probes see access ──────────
{
  const mutant = sql.replace(/^revoke all on table .*$/gm, "-- revoke removed for the red proof");
  ok(mutant !== sql && !/^revoke /m.test(mutant), "CONTROL: the mutant really drops the revoke lines");
  const { db, asRole } = await freshDb(mutant);
  const r = await asRole("anon", "select * from public.wf_competitor_intel");
  eq(r.rows, [], "CONTROL: without the revoke, anon's select is NOT refused (so the refusal above is the revoke's doing)");
  await assert.rejects(() => asRole("anon", INTEL_INSERT, ["fever", h("u1"), "new_guide"]), /row-level security/i, "CONTROL: RLS alone still refuses the insert");
  count += 1;
  await db.close();
}

// ── red proof: a policy makes the migration's own self-check roll back ──────
{
  const withPolicy = sql.replace("do $$", () => "create policy leak on public.wf_competitor_intel for select to anon using (true);\ndo $$");
  const db = new PGlite();
  await db.exec(SUPABASE_LIKE);
  await assert.rejects(() => db.exec(withPolicy), /must stay service-role only/, "CONTROL: a policy on a competitor table aborts the migration");
  count += 1;
  await db.exec("rollback"); // the failed script leaves its explicit transaction aborted; end it
  const exists = await db.query("select count(*)::int as n from pg_class where relname in ('wf_competitor_intel', 'wf_competitor_promos')");
  eq(exists.rows[0].n, 0, "CONTROL: the aborted migration left no table behind (begin/commit rolled it back)");
  await db.close();
}

console.log(`test-competitor-watch-schema: ${count} assertions passed`);
