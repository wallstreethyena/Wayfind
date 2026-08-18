#!/usr/bin/env node
/**
 * check-cron-honesty — no job may report success while doing nothing.
 *
 * THE INCIDENT (2026-08-13 to 2026-08-16). SUPABASE_SERVICE_ROLE_KEY was the
 * literal string "[SENSITIVE]" for three days. Eight cron routes, across twelve
 * sites, did this:
 *
 *     if (!url || !svc) return Response.json({ error: "no service key" }, { status: 200 });
 *
 * Every run answered 200. Vercel's cron log read healthy. The popularity table
 * stopped growing for three days, which is one of the two reasons the
 * "Exploding Trends" rail ships empty.
 *
 * It was undetectable from inside, too: the early return fires BEFORE
 * recordPulse(), so those runs left no trace at all — not even a failed pulse —
 * and app/api/cron/job-watch, which exists to notice a job that stopped, cannot
 * see a job that never reported.
 *
 * AGENTS.md §5 already said absent configuration must fail loudly. Nothing
 * enforced it. This does.
 *
 * WHY THE STATUS CODE IS THE ASSERTION. recordPulse() needs the same service
 * key, so in this exact failure it cannot write either. The only signal that
 * survives a dead database is the HTTP response, which is why the rule is about
 * status codes rather than logging.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const CRON_DIR = path.join(REPO, "app/api/cron");

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const routes = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({ job: d.name, file: path.join(CRON_DIR, d.name, "route.js") }))
  .filter((r) => existsSync(r.file));

ok(routes.length >= 10, `PROBE: the cron routes were found (${routes.length}) — a short list here would make every assertion below vacuous`);

// The shape the incident shipped: a failure body returned with a 2xx status.
// Matched on the RESPONSE, not on a helper name, so routing around the helper
// does not route around the guard.
const SILENT_OK = /return\s+Response\.json\(\s*\{[^}]*\b(?:error|ok\s*:\s*false)\b[^}]*\}\s*,\s*\{[^}]*status:\s*2\d\d/;

for (const { job, file } of routes) {
  const raw = readFileSync(file, "utf8");
  // Comments stripped: several of these files explain the incident in prose and
  // quote the banned line. A guard that fires on its own rationale is a guard
  // someone deletes (CLAUDE.md).
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  ok(!SILENT_OK.test(src),
    `${job} returns a failure body with a 2xx status — that is the shape that made three days of dead-key silence read as healthy. Use jobCannotRun()/jobFailed() from lib/jobFail.js, which answer 503/500.`);
}

// The helpers must keep answering non-2xx. If someone "fixes" a noisy alert by
// softening these, every route above silently reverts at once.
{
  // Comments stripped here too. This file QUOTES the banned line verbatim in
  // its header to explain the incident, so reading it raw makes the 2xx
  // assertion below fire on the rationale rather than the code — the exact
  // trap this guard warns about for the routes, hit one function later.
  const jf = readFileSync(path.join(REPO, "lib/jobFail.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  ok(/status:\s*503/.test(jf), "jobCannotRun must answer 503 — a missing credential is retryable and is not success");
  ok(/status:\s*500/.test(jf), "jobFailed must answer 500 — work that ran and failed is not success either");
  ok(!/status:\s*2\d\d/.test(jf), "lib/jobFail.js must never return a 2xx — it exists exactly to stop that");
  // The pulse is best-effort by design and must not be load-bearing: it needs
  // the same key that may be missing. Assert it is attempted AND that its
  // failure cannot take the response down.
  ok(/try\s*\{[\s\S]{0,200}recordPulse\(/.test(jf), "the pulse attempt is wrapped — it needs the same credential that may be absent, so it must never throw past the response");
}

/* ── prove the check can fail ─────────────────────────────────────────────
   Both directions, against the real regex, so a future edit that loosens it
   is caught here rather than in production three days later. */
{
  const shipped = 'return Response.json({ error: "no service key" }, { status: 200 });';
  ok(SILENT_OK.test(shipped), "self-test: the probe MUST match the exact line the incident shipped, or it is decoration");
  const shipped2 = 'return Response.json({ ok: false, error: "no supabase service env" }, { status: 200 });';
  ok(SILENT_OK.test(shipped2), "self-test: …including the ok:false variant, which five routes used");
  const fixed = 'return jobCannotRun("popularity", "SUPABASE_SERVICE_ROLE_KEY is missing");';
  ok(!SILENT_OK.test(fixed), "self-test: …and must NOT match the fixed form, or it fires on correct code");
  const realSuccess = 'return Response.json({ ok: true, attempted, succeeded }, { status: 200 });';
  ok(!SILENT_OK.test(realSuccess), "self-test: …and must NOT match a genuine success response");
}

if (fail.length) {
  console.error(`check-cron-honesty: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-cron-honesty: OK — ${pass} assertions across ${routes.length} cron routes; no job returns a failure body with a 2xx status`);
