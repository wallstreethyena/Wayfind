#!/usr/bin/env node
// scripts/check-affiliate-opportunity-refresh.mjs — A RE-SIGHTING MUST COUNT.
//
// THE DEFECT (owner's affiliate deep-link audit, 2026-09-08, measured against
// production). The only writer of wf_affiliate_opportunities used
//
//     POST /rest/v1/wf_affiliate_opportunities?on_conflict=place_id
//     Prefer: resolution=ignore-duplicates
//
// and `ignore-duplicates` SKIPS an existing row rather than updating it. So for
// every place already in the queue, `hits` could not increment, `last_seen_at`
// could not refresh, and `resolved_at` could not clear. Measured: 63 rows, all
// at hits = 1, all frozen at first_seen_at = last_seen_at = 2026-08-21. The
// worklist orders by `hits DESC`, so the ranking signal was structurally stuck
// at 1 for everything. Nothing about that is visible in a status code — the
// write returned 2xx every time, and the route then reported
// `opps = oppRows.length`, the count of rows it SENT.
//
// WHAT THIS GUARD PROVES, AND WHAT IT DOES NOT. It is HERMETIC: no database, no
// network. It locks the code-side invariants — the write goes through the atomic
// RPC, the skip-on-conflict shape cannot come back, the function is server-only,
// the caller reports what the database did rather than what it sent, and the
// migration exists so #1161's reconciliation forces it to be applied.
//
// It does NOT prove the SQL semantics. Those were proven by EXECUTING the real
// migration against a real PostgreSQL 16 on 2026-09-09 (insert -> hits 1;
// re-sight -> hits 2 with first_seen_at held and last_seen_at moved; resolve
// then re-sight -> resolved_at cleared and counted as reopened; same place twice
// in one batch -> one increment; malformed elements -> no rows; and the old
// `on conflict do nothing` write left hits unchanged, for contrast). That
// transcript is in the PR and in claude/wayfind-AFFILIATE-OPPORTUNITY-REFRESH-2026-09-09.md.
// A guard that pretended to prove SQL behaviour without running SQL would be the
// decoration this repo keeps finding.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { toOpportunityRow, recordAffiliateOpportunities } from "../lib/affiliateOpportunity.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = (rel) => path.join(ROOT, rel);
const read = (rel) => (existsSync(P(rel)) ? readFileSync(P(rel), "utf8") : null);

let failed = 0;
const ok = (cond, msg) => { if (!cond) { console.error("check-affiliate-opportunity-refresh: FAIL — " + msg); failed++; } return !!cond; };

const TABLE = "wf_affiliate_opportunities";
const FN = "wf_affiliate_opportunity_seen";
const ROUTE = "app/api/cron/atlas-build/route.js";
const HELPER = "lib/affiliateOpportunity.js";

// Comments are not code. This file names every string it forbids, and so do the
// files it reads — a raw-source grep would match the explanation of the bug and
// call it the bug. (Five separate false greens on 2026-07-30 were exactly this.)
const stripJs = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const stripSql = (s) => String(s).split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

/** Pure, so the same judgement can be run against a deliberately broken copy. */
export function findings({ route, helper, migration, writers }) {
  const out = [];

  // 1. NO FILE ANYWHERE MAY WRITE THIS TABLE DIRECTLY. Any direct PostgREST
  //    write bypasses the increment whatever its Prefer header says, and the
  //    only sanctioned path is the RPC. This is deliberately repo-wide rather
  //    than route-only: the next writer of this queue will not necessarily be
  //    atlas-build, and a route-scoped check would not see it.
  //
  //    IT IS ALSO DELIBERATELY NOT A BAN ON THE STRING `resolution=ignore-duplicates`.
  //    An earlier draft of this guard did exactly that, ANDed across the whole
  //    route source, and it was decoration twice over: it could only fire when
  //    the direct-write rule below had already fired, and a global ban would be
  //    WRONG — atlas-build/route.js:577 uses ignore-duplicates on wf_editorial,
  //    where skipping an existing row is the correct semantics and protects 373
  //    existing rows. A guard that fires on correct code is worse than no guard.
  //    The defect was never the header; it was the header applied to THIS table.
  for (const { file, source } of writers || []) {
    const w = stripJs(source);
    if (new RegExp(`rest/v1/${TABLE}\\b`).test(w)) out.push(`table-written-directly:${file}`);
  }

  if (route == null) out.push("route-missing");
  else {
    const r = stripJs(route);
    // 2. It must go through the helper, called — not merely imported.
    if (!/recordAffiliateOpportunities\s*\(/.test(r)) out.push("route-does-not-call-helper");
    if (!/toOpportunityRow\s*\(/.test(r)) out.push("route-does-not-shape-rows");
    // 3. EFFECTS, NOT ATTEMPTS. Assigning the length of the batch is the exact
    //    reporting bug that let a frozen queue look busy.
    if (/\bopps\s*=\s*oppRows\.length/.test(r)) out.push("route-reports-attempts-not-effects");
    if (!/\bopps\s*=\s*rec\.seen\b/.test(r)) out.push("route-does-not-report-database-effects");
  }

  if (helper == null) out.push("helper-missing");
  else {
    const h = stripJs(helper);
    // 4. The call must be db.rpc("<literal>", { <literal keys> }) in app/ or lib/,
    //    or scripts/check-rpc-schema-contract.mjs — the guard that exists because
    //    #1153 shipped a 5-arg caller against a 3-arg function — cannot see it.
    if (!new RegExp(`\\b(?:db|supabase)\\.rpc\\s*\\(\\s*["']${FN}["']\\s*,\\s*\\{`).test(h)) out.push("helper-rpc-call-invisible-to-contract-guard");
    if (!/p_rows\s*:/.test(h)) out.push("helper-wrong-argument-name");
  }

  if (migration == null) out.push("migration-missing");
  else {
    const m = stripSql(migration);
    if (!new RegExp(`create or replace function public\\.${FN}\\(p_rows jsonb\\)`).test(m)) out.push("migration-does-not-define-the-function");
    // 5. Server-only. A revenue worklist must never be writable by a browser key.
    if (!new RegExp(`revoke all on function public\\.${FN}\\(jsonb\\) from public, anon, authenticated`).test(m)) out.push("migration-does-not-revoke-execute");
    if (!new RegExp(`grant execute on function public\\.${FN}\\(jsonb\\) to service_role`).test(m)) out.push("migration-does-not-grant-service-role");
    if (/security definer/i.test(m) && !/set search_path/i.test(m)) out.push("migration-definer-without-search-path");
    // 6. The three behaviours the function exists for, asserted structurally
    //    here and proven by execution in the record referenced above.
    if (!/hits\s*=\s*public\.wf_affiliate_opportunities\.hits\s*\+\s*1/.test(m)) out.push("migration-does-not-increment-hits");
    if (!/last_seen_at\s*=\s*now\(\)/.test(m)) out.push("migration-does-not-refresh-last-seen");
    if (!/resolved_at\s*=\s*null/.test(m)) out.push("migration-does-not-reopen");
    // 7. first_seen_at is the age of the opportunity and must never move. It may
    //    appear in the INSERT column list and value list, but never in the
    //    conflict UPDATE.
    const upd = m.slice(m.search(/on conflict \(place_id\) do update set/i));
    if (/first_seen_at\s*=/.test(upd)) out.push("migration-moves-first-seen-at");
    // 8. RLS must be asserted for a table whose DDL now lives here.
    if (!new RegExp(`alter table public\\.${TABLE} enable row level security`).test(m)) out.push("migration-does-not-enable-rls");
  }

  return out;
}

const routeSrc = read(ROUTE);
const helperSrc = read(HELPER);
const migFile = existsSync(P("supabase/migrations"))
  ? readdirSync(P("supabase/migrations")).find((f) => f.includes("affiliate_opportunity_seen"))
  : null;
const migSrc = migFile ? readFileSync(P(`supabase/migrations/${migFile}`), "utf8") : null;

// Every app/ and lib/ source, so the direct-write ban is repo-wide rather than
// route-only. A positive control below proves this corpus is non-empty and
// actually reaches the file we care about — a scan that silently found nothing
// would report a clean bill of health for a repo it never read.
function collect(dir, acc = []) {
  const abs = P(dir);
  if (!existsSync(abs)) return acc;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) collect(rel, acc);
    else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name)) acc.push({ file: rel, source: readFileSync(P(rel), "utf8") });
  }
  return acc;
}
const writers = [...collect("app"), ...collect("lib")];

const REAL = { route: routeSrc, helper: helperSrc, migration: migSrc, writers };
const real = findings(REAL);
ok(real.length === 0, `the affiliate opportunity queue is not wired to record re-sightings: ${real.join(", ")}`);

// The migration filename must satisfy scripts/check-migration-reconciliation.mjs,
// which is what forces this to be APPLIED and not merely merged.
// POSITIVE CONTROL on the scan itself. A recursive walk that quietly matched
// nothing would report "no direct writers" for a repo it never opened — the
// `git grep -c` false-clean this codebase has already been bitten by once.
ok(writers.length > 200, `only ${writers.length} app/ + lib/ source files were scanned for direct writes; the walk is not reaching the repo.`);
ok(writers.some((w) => w.file === ROUTE), `the direct-write scan never reached ${ROUTE}, the one file that used to contain the defect.`);
ok(writers.some((w) => w.file === HELPER), `the direct-write scan never reached ${HELPER}.`);
// ...and a NEGATIVE control: the legitimate ignore-duplicates write on a
// different table must stay silent, or this guard fires on correct code.
ok(writers.some((w) => /resolution=ignore-duplicates/.test(w.source) && /rest\/v1\/wf_editorial\b/.test(w.source)),
  "expected to find the legitimate ignore-duplicates write on wf_editorial; if it moved, re-confirm this guard still does not flag it.");

ok(!!migFile && /^(\d{8,14})_(.+)\.sql$/.test(migFile), `the migration filename ${JSON.stringify(migFile)} does not match the version-prefixed convention, so it can never be reconciled against production.`);

// --- red-prove the static half by watched mutation --------------------------
function mutate(src, find, replace) {
  const parts = String(src).split(find);
  if (parts.length < 2) throw new Error(`mutation target not found, so the red-prove would have been meaningless: ${JSON.stringify(String(find).slice(0, 70))}`);
  return parts.join(replace);
}
let redProves = 0;
const provesRed = (label, patch, expectKey) => {
  redProves++;
  let out;
  try { out = findings({ ...REAL, ...patch }); }
  catch (e) { ok(false, `red-prove "${label}" could not run: ${e.message}`); return; }
  ok(out.includes(expectKey), `red-prove "${label}" did NOT produce ${expectKey} — this guard does not actually detect it (got: ${out.join(", ") || "no findings at all"}).`);
};

try {
  provesRed("the exact shipped defect comes back in the route",
    { writers: writers.map((w) => (w.file === ROUTE ? { ...w, source: mutate(w.source, "const rec = await recordAffiliateOpportunities(oppRows);",
      'const or = await fetch(`${s.url}/rest/v1/wf_affiliate_opportunities?on_conflict=place_id`, { method: "POST", headers: { ...svcH, Prefer: "resolution=ignore-duplicates,return=minimal" } });') } : w)) },
    `table-written-directly:${ROUTE}`);
  provesRed("a SECOND writer appears somewhere else entirely and bypasses the RPC",
    { writers: [...writers, { file: "app/api/somewhere/new/route.js", source: 'await fetch(`${u}/rest/v1/wf_affiliate_opportunities`, { method: "POST" });' }] },
    "table-written-directly:app/api/somewhere/new/route.js");
  provesRed("the route reports rows sent instead of rows recorded",
    { route: mutate(routeSrc, "opps = rec.seen;", "opps = oppRows.length;") },
    "route-reports-attempts-not-effects");
  provesRed("the helper stops being called",
    { route: mutate(routeSrc, "recordAffiliateOpportunities(oppRows)", "noop(oppRows)") },
    "route-does-not-call-helper");
  provesRed("the RPC call is rewritten as a raw fetch, invisible to the contract guard",
    { helper: mutate(helperSrc, `db.rpc("${FN}", { p_rows: clean })`, "fetchRpc(clean)") },
    "helper-rpc-call-invisible-to-contract-guard");
  provesRed("the argument is renamed without the function being renamed",
    { helper: mutate(helperSrc, "p_rows: clean", "rows: clean") },
    "helper-wrong-argument-name");
  provesRed("execute is left granted to browser keys",
    { migration: mutate(migSrc, `revoke all on function public.${FN}(jsonb) from public, anon, authenticated;`, "-- removed") },
    "migration-does-not-revoke-execute");
  provesRed("the increment is dropped and it becomes a plain refresh",
    { migration: mutate(migSrc, "hits              = public.wf_affiliate_opportunities.hits + 1,", "") },
    "migration-does-not-increment-hits");
  provesRed("a resolved opportunity stops reopening",
    { migration: mutate(migSrc, "      resolved_at       = null,", "") },
    "migration-does-not-reopen");
  provesRed("first_seen_at is allowed to move, erasing the age of the opportunity",
    { migration: mutate(migSrc, "      last_seen_at      = now(),", "      last_seen_at      = now(),\n      first_seen_at     = now(),") },
    "migration-moves-first-seen-at");
  provesRed("RLS is dropped from a table whose DDL now lives in the repo",
    { migration: mutate(migSrc, `alter table public.${TABLE} enable row level security;`, "-- removed") },
    "migration-does-not-enable-rls");
  provesRed("the migration is deleted", { migration: null }, "migration-missing");
} catch (e) {
  ok(false, `the red-proves could not run against this tree: ${e.message}`);
}

// --- behaviour: the real exported functions, called -------------------------
ok(toOpportunityRow({ place_id: " P1 ", name: "N", category: "attractions" }, { reason: "r", suggestedPartner: "viator" })?.place_id === "P1",
  "toOpportunityRow must trim the place_id it will key on — a stray space makes a second row for the same place.");
for (const bad of [null, undefined, {}, { place_id: "" }, { place_id: "   " }]) {
  ok(toOpportunityRow(bad, {}) === null, `toOpportunityRow(${JSON.stringify(bad)}) produced a row; a sighting with no place_id has nothing to key on and must be dropped before it reaches the database.`);
}

const calls = [];
const client = (result) => ({ rpc: async (name, args) => { calls.push({ name, args }); return result; } });

{ // POSITIVE CONTROL: a healthy call reports the database's own counts.
  const r = await recordAffiliateOpportunities([{ place_id: "a" }, { place_id: "b" }],
    { client: client({ data: [{ inserted: 1, incremented: 4, reopened: 2 }], error: null }) });
  ok(r.ok === true && r.inserted === 1 && r.incremented === 4 && r.reopened === 2, `POSITIVE CONTROL FAILED: a healthy write did not report the database's counts (${JSON.stringify(r)}).`);
  ok(r.seen === 5, "`seen` must be inserted + incremented — the rows the database acted on, never the number sent.");
  ok(calls.at(-1).name === FN && Array.isArray(calls.at(-1).args.p_rows), "the helper must send the batch as p_rows to the real function name.");
}
{ // an RPC error must never read as "nothing to do"
  const r = await recordAffiliateOpportunities([{ place_id: "a" }], { client: client({ data: null, error: { message: "permission denied" } }) });
  ok(r.ok === false && r.seen === 0 && /permission denied/.test(r.reason || ""), `an RPC error was not reported as a failure with its reason (${JSON.stringify(r)}).`);
}
for (const body of [null, undefined, "nope", 42, [], [null]]) {
  const r = await recordAffiliateOpportunities([{ place_id: "a" }], { client: client({ data: body, error: null }) });
  ok(r.ok === false && r.seen === 0, `a malformed RPC body (${JSON.stringify(body)}) was accepted as a successful write of 0 — "we could not tell" and "nothing happened" are different facts, and conflating them is the defect this file exists for.`);
}
{ // a throwing transport is fail-soft but never silently successful
  const r = await recordAffiliateOpportunities([{ place_id: "a" }], { client: { rpc: async () => { throw new Error("socket hang up"); } } });
  ok(r.ok === false && /socket hang up/.test(r.reason || ""), "a transport that threw did not surface as a failure with its reason.");
}
{ // an empty batch is a success that does nothing, and must not call the RPC
  const before = calls.length;
  const r = await recordAffiliateOpportunities([], { client: client({ data: [{ inserted: 9, incremented: 9, reopened: 9 }], error: null }) });
  ok(r.ok === true && r.seen === 0 && calls.length === before, "an empty batch must short-circuit without a round trip, and must report 0.");
}
{ // rows with no place_id are dropped before the round trip, not sent
  const r = await recordAffiliateOpportunities([{ name: "x" }, { place_id: "  " }],
    { client: client({ data: [{ inserted: 1, incremented: 0, reopened: 0 }], error: null }) });
  ok(r.seen === 0, "rows with no usable place_id must not reach the database.");
}

if (failed) { console.error(`check-affiliate-opportunity-refresh: ${failed} failure(s)`); process.exit(1); }
console.log(
  `check-affiliate-opportunity-refresh: OK — the opportunity queue records re-sightings. ` +
  `No file under app/ or lib/ writes ${TABLE} directly (${writers.length} sources scanned) — the only sanctioned path is the RPC. The route reports the database's own effect counts, not the size of the batch it sent. ` +
  `${redProves} watched mutations of the real sources red-proved, each asserting its target existed first. ` +
  `Helper behaviour asserted by CALLING recordAffiliateOpportunities / toOpportunityRow with an injected client — a malformed or errored RPC body can never read as a successful write of zero. ` +
  `The RPC call is written as db.rpc("${FN}", { p_rows }) in lib/ specifically so check-rpc-schema-contract.mjs can see it. ` +
  `FALSE-POSITIVE SURFACE, stated plainly: this guard is HERMETIC and proves NO SQL behaviour. The increment, the held first_seen_at, the reopen, the one-increment-per-batch dedupe and the malformed-input rejection were proven by executing the real migration against PostgreSQL 16 on 2026-09-09; that transcript is the evidence, and check-migration-reconciliation.mjs is what forces the migration to actually reach production.`
);
