#!/usr/bin/env node
/**
 * scripts/check-schema-watch.mjs — THE GUARDRAIL FOR THE 2026-08-25 EXPOSURE PASS.
 *
 * WHAT HAPPENED. A Supabase security email arrived on 23 Aug leading with a
 * CRITICAL that had already been fixed. Underneath it, unread for two days, were
 * two advisor ERRORs and three findings the advisor does not check for at all:
 *
 *   1. wf_affiliate_worklist was a SECURITY DEFINER view. A view with no
 *      security_invoker runs as its OWNER and ignores RLS on everything beneath
 *      it, so it served the entire monetisation worklist — bookable-but-unlinked
 *      places, suggested partner, hit counts — to anyone holding the publishable
 *      key out of the browser bundle.
 *   2. wf_promotion_enqueue_by_score was anon-callable. It writes the queue the
 *      cron drains through PAID Google Place Details calls: an unauthenticated,
 *      unrated faucet on metered spend.
 *   3. anon held TRUNCATE on all 60 public tables. RLS DOES NOT RESTRICT
 *      TRUNCATE. Alongside it, 88 INSERT/UPDATE/DELETE grants with no policy
 *      behind them — RLS was the only thing in the way.
 *
 * NONE OF IT WAS NEW. security_hardening_v1..v4 each locked down the objects
 * that existed at the time, and the next migration created new ones born wide
 * open, because ALTER DEFAULT PRIVILEGES granted anon ALL on every new table and
 * EXECUTE on every new function. v5 fixed the default. This guard, the SQL
 * function wf_schema_audit() and /api/cron/schema-watch are what stop v6 from
 * being necessary.
 *
 * WHAT THIS GUARD CAN AND CANNOT DO. It cannot check the live database —
 * check-guard-hermeticity forbids a guard from holding a credential, and it is
 * right to: a guard whose verdict depends on which shell ran it is not a guard.
 * So the DIVISION IS DELIBERATE. The live invariants run in Postgres
 * (wf_schema_audit) on a cron. This file locks the SHAPES that make that
 * possible: the watchdog is scheduled, it is fail-closed, it cannot report a
 * failed read as a clean run, and none of its six invariants have been quietly
 * deleted from the SQL.
 *
 * If you are here because this guard failed: do not weaken the assertion. Each
 * one is a hole that was open on 2026-08-25.
 */
import { mkdtempSync, copyFileSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fails = [];
const fail = (m) => fails.push(m);
const ok = (c, m) => { if (!c) fail(m); };
const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

// ── A. THE CLASSIFIER IS EXECUTED, NOT PATTERN-MATCHED ──────────────────────
// A regex asserting the file "mentions" critical proves nothing about what it
// does with one.
const tmp = mkdtempSync(join(tmpdir(), "wf-schemawatch-"));
writeFileSync(join(tmp, "package.json"), '{"type":"module"}');
copyFileSync(new URL("../lib/schemaWatch.js", import.meta.url), join(tmp, "schemaWatch.js"));
const sw = await import(join(tmp, "schemaWatch.js"));

{
  const clean = sw.classifyAudit([
    { severity: "info", kind: "recent_migration", object: "20260825220627", detail: "wf_schema_audit" },
  ]);
  ok(clean.findings.length === 0, "an audit with only info rows produced findings — recent migrations are context, not an alarm");
  ok(clean.context.length === 1, "info rows are being dropped instead of carried as context");
  ok(clean.alarming === false, "an audit with no critical/high findings is alarming — this would train everyone to ignore the alert");

  const dirty = sw.classifyAudit([
    { severity: "warn", kind: "w", object: "b", detail: "d" },
    { severity: "info", kind: "recent_migration", object: "m", detail: "d" },
    { severity: "high", kind: "rls_exempt_grant", object: "c", detail: "d" },
    { severity: "critical", kind: "rls_off", object: "a", detail: "d" },
  ]);
  ok(dirty.alarming === true, "critical and high findings did not raise the alarm");
  ok(dirty.counts.critical === 1 && dirty.counts.high === 1 && dirty.counts.warn === 1, "severity counts are wrong");
  ok(dirty.findings[0].severity === "critical", "findings are not sorted loudest first — the oldest undetected exposure must lead");
  ok(dirty.findings.map((f) => f.severity).join(",") === "critical,high,warn", "finding sort order is not critical > high > warn");

  // The one that matters most: a row this code does not recognise must NOT be
  // discarded. Silently dropping an unknown row is the exact shape of failure
  // the audit exists to catch — an absence of reporting reading as an absence
  // of problems.
  const unknown = sw.classifyAudit([{ severity: "brand_new_kind", kind: "k", object: "o", detail: "d" }]);
  ok(unknown.findings.length === 1, "an unrecognised severity was DROPPED — a future audit check would go unreported and read as clean");
  ok(unknown.alarming === true, "an unrecognised severity did not raise the alarm — unknown must fail loud, not quiet");
}

// ── B. A WATCHDOG NOBODY RUNS IS WORSE THAN NO WATCHDOG ─────────────────────
// It reports green by never reporting. atlas-build ran 100% failed for five days
// behind exactly that silence.
{
  let vercel = null;
  try { vercel = JSON.parse(read("vercel.json")); } catch (e) { fail("vercel.json is unreadable or not valid JSON"); }
  const crons = (vercel && Array.isArray(vercel.crons)) ? vercel.crons : [];
  const wd = crons.find((c) => c && typeof c.path === "string" && c.path.startsWith("/api/cron/schema-watch"));
  ok(!!wd, "/api/cron/schema-watch is not scheduled in vercel.json — the schema watchdog exists and never runs, which reports green by staying silent");
  ok(!!wd && typeof wd.schedule === "string" && wd.schedule.trim().length > 0, "the schema-watch cron has no schedule");
}

// ── C. THE ROUTE'S NON-NEGOTIABLE SHAPES ────────────────────────────────────
{
  const route = read("app/api/cron/schema-watch/route.js");
  ok(/CRON_SECRET/.test(route) && /401/.test(route), "the schema-watch route is not fail-closed on CRON_SECRET — an exposure report is not a public endpoint");
  ok(/wf_schema_audit/.test(route), "the schema-watch route no longer calls wf_schema_audit");
  ok(/is an incident, not a clean run/.test(route), "the route no longer distinguishes 'could not read' from 'found nothing wrong' — reporting an absence of data as an absence of problems is precisely the mistake this route exists to stop");
  ok(/recordPulse/.test(route), "the route no longer records a job pulse — the watchdog would not itself be watched, and a watchdog that silently stops running is the failure it was built to prevent");
  ok(/findings are real and undelivered/.test(route), "the route no longer says WHY it could not send — a silent no-send reproduces the failure mode it exists to catch");
}

// ── D. THE SIX LIVE INVARIANTS ARE STILL IN THE SQL ─────────────────────────
// The repo cannot run them, but it can refuse to forget that they exist. Each
// kind below was a hole that was open on 2026-08-25.
{
  const sql = read("supabase/migrations/20260825_wf_schema_audit.sql");
  const REQUIRED = {
    rls_off: "a public table with RLS disabled — the lint the 23 Aug email led with",
    definer_view_anon: "an anon-readable view without security_invoker — how the affiliate worklist leaked",
    write_grant_no_policy: "a write grant with only RLS behind it — 88 of these existed",
    rls_exempt_grant: "TRUNCATE/REFERENCES/TRIGGER, which RLS does not restrict — anon held TRUNCATE on all 60 tables",
    default_privileges_drift: "the default going back to granting anon on new objects — the root cause of v1 through v4",
    unlisted_anon_definer_rpc: "an anon-callable SECURITY DEFINER function — how wf_promotion_enqueue_by_score became a spend faucet",
  };
  for (const [kind, why] of Object.entries(REQUIRED)) {
    ok(sql.includes(`'${kind}'`), `wf_schema_audit no longer checks '${kind}' — ${why}`);
  }

  // The allowlist is the one place a human decides "this RPC may be called
  // without signing in". It must stay short, and it must stay ARGUED. Anything
  // added here needs to survive being read out loud.
  const listBlock = (sql.match(/intentional_public_rpcs[\s\S]*?\];/) || [""])[0];
  ok(listBlock.length > 0, "wf_schema_audit no longer declares intentional_public_rpcs — every anon-callable definer function would report as a finding, and a noisy alert is an ignored alert");
  const named = (listBlock.match(/'([a-z0-9_]+)'/g) || []).map((s) => s.replace(/'/g, ""));
  const EXPECTED = ["wf_join_waitlist", "wf_log_coverage_gap", "wf_register_push_token"];
  ok(named.length === EXPECTED.length && EXPECTED.every((n) => named.includes(n)),
    `the anon-callable RPC allowlist changed — expected exactly [${EXPECTED.join(", ")}], found [${named.join(", ")}]. Adding one here makes an unauthenticated endpoint invisible to the watchdog, so it must be a deliberate edit to this guard too.`);

  // Per the rule v5 established: default privileges grant nothing now, so
  // exposure is an explicit line. The audit itself must not be anon-callable.
  ok(/revoke all on function public\.wf_schema_audit\(\) from public, anon, authenticated/.test(sql),
    "wf_schema_audit does not revoke itself from public/anon — the exposure report would be readable by the very key it is reporting on");
  ok(/grant execute on function public\.wf_schema_audit\(\) to service_role/.test(sql),
    "wf_schema_audit is not granted to service_role — since v5 removed default privileges, the cron cannot call it without an explicit grant");
}

// ── E. THE v5 RECORD IS IN THE REPO ─────────────────────────────────────────
// Merging does not apply it (nothing in this repo runs SQL on deploy). But the
// schema is the one part of Wayfind that never passes through a commit, and a
// pass that exists only in the migration ledger cannot be reviewed or reverted.
{
  const v5 = read("supabase/migrations/20260825_security_hardening_v5.sql");
  ok(/alter default privileges for role postgres in schema public\s*\n?\s*revoke all on tables from anon, authenticated/i.test(v5),
    "the v5 record no longer contains the default-privileges fix — that single statement is what stops every new table being born readable and writable by the anon key");
  ok(/revoke truncate, references, trigger on all tables in schema public from anon, authenticated/i.test(v5),
    "the v5 record no longer revokes the RLS-exempt privileges");
}

if (fails.length) {
  console.error("check-schema-watch: FAIL");
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
console.log("check-schema-watch: OK — classifier fails loud on unknown severities, watchdog is scheduled and fail-closed, cannot report an unreadable audit as clean, is itself pulsed, and all six live invariants plus the 3-name allowlist are intact");
