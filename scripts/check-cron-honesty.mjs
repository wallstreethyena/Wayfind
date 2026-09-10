#!/usr/bin/env node
/**
 * check-cron-honesty — no job may report success while doing nothing, and a
 * known long-running cron may not surrender its heartbeat to the platform
 * timeout.
 *
 * THE ORIGINAL INCIDENT (2026-08-13 to 2026-08-16). SUPABASE_SERVICE_ROLE_KEY
 * was the literal string "[SENSITIVE]" for three days. Eight cron routes,
 * across twelve sites, returned a failure body with HTTP 200. Vercel read the
 * runs as healthy and the popularity table stopped growing.
 *
 * THE SECOND INCIDENT (2026-09-10). /api/cron/photo-repair mutated 109 queue
 * rows and then Vercel killed it at exactly 60 seconds, before recordPulse()
 * ran. The work was partial but the monitoring layer received no terminal
 * heartbeat. A longer maxDuration alone is not protection: the worker must own
 * a smaller budget and stop starting work while platform time remains to finish
 * the current batch and pulse.
 *
 * AGENTS.md §5 already says absent configuration must fail loudly. Nothing
 * enforced it. This guard owns both cron-honesty shapes now.
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

// The shape the original incident shipped: a failure body returned with a 2xx
// status. Matched on the RESPONSE, not on a helper name, so routing around the
// helper does not route around the guard.
const SILENT_OK = /return\s+Response\.json\(\s*\{[^}]*\b(?:error|ok\s*:\s*false)\b[^}]*\}\s*,\s*\{[^}]*status:\s*2\d\d/;

function numberLiteral(src, re) {
  const m = re.exec(src);
  if (!m) return null;
  const n = Number(m[1].replace(/_/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Narrow, deliberate contract for the cron that actually hit Vercel's hard
// wall in production. This is structural because the route requires real
// Supabase credentials to execute end-to-end in CI, so it checks the actual
// controller wiring and then self-red-proves the predicate below.
function photoRepairBudgetHealthy(src) {
  const maxSeconds = numberLiteral(src, /export\s+const\s+maxDuration\s*=\s*([\d_]+)/);
  const workBudgetMs = numberLiteral(src, /const\s+WORK_BUDGET_MS\s*=\s*([\d_]+)/);
  const batchSize = numberLiteral(src, /const\s+BATCH_SIZE\s*=\s*([\d_]+)/);
  if (maxSeconds == null || workBudgetMs == null || batchSize == null) return false;
  return maxSeconds * 1000 - workBudgetMs >= 60_000
    && batchSize > 0
    && batchSize <= 50
    && /runRepairWithinBudget\s*\(/.test(src)
    && /now\(\)\s*>=\s*deadlineAt/.test(src)
    && /stopReason\s*=\s*["']deadline["']/.test(src)
    && /recordPulse\(\s*["']photo-repair["']/.test(src);
}

for (const { job, file } of routes) {
  const raw = readFileSync(file, "utf8");
  // Comments stripped: several routes explain incidents in prose and quote
  // banned lines. A guard that fires on its own rationale is a guard someone
  // deletes.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const silentOk = SILENT_OK.test(src);
  const badPhotoRepairBudget = job === "photo-repair" && !photoRepairBudgetHealthy(src);
  ok(!silentOk && !badPhotoRepairBudget,
    silentOk
      ? `${job} returns a failure body with a 2xx status — use jobCannotRun()/jobFailed() from lib/jobFail.js.`
      : `${job} lost the owned deadline contract: photo-repair must keep >=60s platform headroom, batch at <=50 rows, stop starting batches at its own deadline, and still reach recordPulse().`);
}

// The helpers must keep answering non-2xx. If someone "fixes" a noisy alert by
// softening these, every route above silently reverts at once.
{
  const jf = readFileSync(path.join(REPO, "lib/jobFail.js"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  ok(/status:\s*503/.test(jf), "jobCannotRun must answer 503 — a missing credential is retryable and is not success");
  ok(/status:\s*500/.test(jf), "jobFailed must answer 500 — work that ran and failed is not success either");
  ok(!/status:\s*2\d\d/.test(jf), "lib/jobFail.js must never return a 2xx — it exists exactly to stop that");
  ok(/try\s*\{[\s\S]{0,200}recordPulse\(/.test(jf), "the pulse attempt is wrapped — it needs the same credential that may be absent, so it must never throw past the response");
}

/* ── prove the check can fail ─────────────────────────────────────────────
   Both directions, against the real predicates, so a future edit that loosens
   them is caught here rather than in production. */
{
  const shipped = 'return Response.json({ error: "no service key" }, { status: 200 });';
  ok(SILENT_OK.test(shipped), "self-test: the probe MUST match the exact line the original incident shipped, or it is decoration");
  const shipped2 = 'return Response.json({ ok: false, error: "no supabase service env" }, { status: 200 });';
  ok(SILENT_OK.test(shipped2), "self-test: …including the ok:false variant, which five routes used");
  const fixed = 'return jobCannotRun("popularity", "SUPABASE_SERVICE_ROLE_KEY is missing");';
  ok(!SILENT_OK.test(fixed), "self-test: …and must NOT match the fixed form, or it fires on correct code");

  const realSuccess = 'return Response.json({ ok: true, attempted, succeeded }, { status: 200 });';
  const killedRepair = `
    export const maxDuration = 60;
    const WORK_BUDGET_MS = 60_000;
    const BATCH_SIZE = 200;
    await runRepairWithinBudget();
    if (now() >= deadlineAt) stopReason = "deadline";
    await recordPulse("photo-repair", {});
  `;
  const boundedRepair = `
    export const maxDuration = 300;
    const WORK_BUDGET_MS = 225_000;
    const BATCH_SIZE = 25;
    await runRepairWithinBudget();
    if (now() >= deadlineAt) stopReason = "deadline";
    await recordPulse("photo-repair", {});
  `;
  ok(!SILENT_OK.test(realSuccess) && !photoRepairBudgetHealthy(killedRepair) && photoRepairBudgetHealthy(boundedRepair),
    "self-test: a genuine 200 success stays allowed, the shipped 60s/unbounded photo-repair shape is RED, and the bounded 300s/225s/25-row shape is GREEN");
}

if (fail.length) {
  console.error(`check-cron-honesty: ${pass} passed, ${fail.length} FAILED`);
  for (const f of fail) console.error("  ✗ " + f);
  process.exit(1);
}
console.log(`check-cron-honesty: OK — ${pass} assertions across ${routes.length} cron routes; failures cannot hide behind 2xx and photo-repair owns its deadline`);