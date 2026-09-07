#!/usr/bin/env node
/**
 * scripts/test-job-watch-fallback.mjs — THE WATCHER MUST BE WATCHED, LAYER TWO.
 *
 * THE GAP (owner, 2026-09-07 incident review). RESEND_API_KEY has never been
 * set in Vercel. job-watch ran hourly all day 2026-09-07, correctly detected 5
 * real incidents every run, correctly filed its own failed self-pulse
 * (succeeded:0, "CANNOT SEND..."), and every single run still answered HTTP
 * 200 — because Resend was the ONLY channel this route had for saying "nobody
 * was told", and Resend was the exact channel that was down. Detection was
 * never broken. Notification was, and the notification failure was itself
 * reported nowhere a human or a status-code monitor would see it.
 *
 * The owner's requirement, verbatim in intent: the alarm system must not
 * depend on one optional email secret. app/api/cron/job-watch/route.js now
 * answers an undelivered alarm through THREE independent channels: the
 * existing failed self-pulse (succeeded:0, unchanged), a high-severity Sentry
 * event, and a non-200 HTTP status. This file proves all three states —
 * healthy, delivered, undelivered — deterministically, with no dependency on
 * live Resend, Sentry, or Supabase state.
 *
 * TWO LAYERS OF PROOF:
 *   §1 STATIC — the source wiring: Sentry is imported and called from both
 *      undelivered branches, and a self-test (matching check-cron-honesty.mjs's
 *      own "prove the check can fail" section) shows the exact pre-fix
 *      response shape would be caught.
 *   §2 DYNAMIC — the REAL route.js GET handler runs, in a hermetic child
 *      process per scenario (env built from nothing — check-guard-hermeticity's
 *      rule, same shape as test-foursquare.mjs §10/§11). Supabase and Resend
 *      are reached only through a scripted fetch (any unscripted call throws —
 *      the same trap test-foursquare.mjs uses for Google). Sentry is reached
 *      through scripts/lib/sentryStubHook.mjs, a module-resolution hook that
 *      redirects "@sentry/nextjs" to scripts/lib/sentryTestStub.mjs for this
 *      child only, so a captured event is observed directly rather than
 *      inferred from source text.
 *
 * RED-PROVED BY HAND while building this: `git stash` the route.js fix and
 * `node scripts/test-job-watch-fallback.mjs` against the resulting pre-fix
 * code — every §2 undelivered assertion (status, sentryCalls, and this file's
 * §1 self-test) goes red; `git stash pop` restores it. See the PR description
 * for the exact transcript.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

let n = 0, failn = 0;
const ok = (cond, msg) => { n++; if (!cond) { failn++; console.error("  ✗ " + msg); } };

const ROUTE_PATH = new URL("../app/api/cron/job-watch/route.js", import.meta.url);
const raw = readFileSync(ROUTE_PATH, "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
const src = strip(raw);

// ── §1 STATIC: the wiring is really there ───────────────────────────────────
ok(/from\s+["']@sentry\/nextjs["']/.test(src), "route.js imports @sentry/nextjs — the same package sentry.server.config.js already initialises for this exact runtime (nodejs)");
ok(/Sentry\.captureException\(/.test(src), "route.js calls Sentry.captureException somewhere");
{
  const reportFn = (src.match(/function reportUndelivered\([\s\S]*?\n\}/) || [""])[0];
  ok(/Sentry\.captureException\(/.test(reportFn), "reportUndelivered() is the one place that calls Sentry.captureException — a single call site, not duplicated ad hoc per branch");
  ok(/level:\s*["']fatal["']/.test(reportFn), "the event is filed at 'fatal' — Sentry's highest level, matching 'high-severity' from the brief");
  ok(/try\s*\{/.test(reportFn) && /catch/.test(reportFn), "the Sentry call is wrapped in try/catch — telemetry must never be why this route fails to answer (same fail-soft rule recordPulse already follows)");
}
// Balanced-parens scan for every `Response.json(...)` call's full argument
// text — the same technique check-job-pulse-contract.mjs uses for recordPulse
// call sites, chosen over a single clever regex on purpose: a character class
// that excludes only `;` (the obvious first draft) does not stop at the first
// unmatched `}` either, so it happily matches straight through a SECOND options
// object and calls the fixed two-argument shape broken. A depth counter cannot
// make that mistake.
// Backtick quoting below is matched via charCode, never a literal backtick
// character in this file's own source — even one written as an escaped
// character inside an ordinary quoted string. This file had exactly that
// (comparing against a quoted backtick literal) and it desynced
// check-guard-hermeticity.mjs's own backtick-pair scrubber for every line
// after it in this file, silently un-scrubbing this file's later template
// literals — precisely the self-defeating-guard shape that hermeticity rule
// exists to catch, and worth naming so it is not reintroduced.
const BACKTICK = String.fromCharCode(96);
function responseJsonCalls(s) {
  const out = [];
  let at = 0;
  for (;;) {
    const i = s.indexOf("Response.json(", at);
    if (i < 0) break;
    const open = i + "Response.json".length;
    let depth = 0, q = null, j = open;
    for (; j < s.length; j++) {
      const c = s[j];
      if (q) { if (c === "\\") j++; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === BACKTICK) { q = c; continue; }
      if (c === "(") depth++;
      else if (c === ")") { depth--; if (depth === 0) break; }
    }
    out.push(s.slice(open, j + 1));
    at = j + 1;
  }
  return out;
}
const undeliveredWithoutFailStatus = (call) => /sent:\s*false/.test(call) && !/status:\s*[45]\d\d/.test(call);

{
  const totalOccurrences = (src.match(/reportUndelivered\(/g) || []).length;
  const hasDef = /function\s+reportUndelivered\(/.test(src);
  ok(hasDef, "reportUndelivered is defined as a function — a single place, not duplicated inline logic per branch");
  const callSites = totalOccurrences - (hasDef ? 1 : 0);
  ok(callSites === 3, `reportUndelivered( is called at exactly 3 call sites, excluding its own definition (found ${callSites} call sites, ${totalOccurrences} total occurrences) — health-feed failure, missing config, and a real send that failed`);
}
ok((src.match(/status:\s*500/g) || []).length === 2, "exactly two `status: 500` responses exist — one per undelivered branch");
{
  const calls = responseJsonCalls(src);
  ok(calls.length >= 4, `found ${calls.length} Response.json(...) calls in route.js — too few to exercise this check meaningfully`);
  for (const call of calls) {
    ok(!undeliveredWithoutFailStatus(call), `a Response.json(...) call carries sent:false with no non-2xx status: ${call.slice(0, 90).replace(/\s+/g, " ")}…`);
  }
}

// self-test mirroring check-cron-honesty.mjs's own "prove the check can fail":
// the exact PRE-FIX shape (this PR's diff) must be caught, and the shipped fix
// must not be.
{
  const preFix = 'Response.json({ ok: true, incidents: incidents.length, sent: false, reason: "RESEND_API_KEY or DIGEST_EMAIL not set", detail: incidents.map(incidentLine) })';
  ok(responseJsonCalls(preFix).length === 1 && undeliveredWithoutFailStatus(responseJsonCalls(preFix)[0]),
    "self-test: the detector flags the EXACT pre-fix call (sent:false, no status option -> default 200)");
  const postFix = 'Response.json(\n  { ok: false, incidents: incidents.length, sent: false, reason, detail: incidents.map(incidentLine) },\n  { status: 500, headers: { "cache-control": "no-store" } }\n)';
  ok(responseJsonCalls(postFix).length === 1 && !undeliveredWithoutFailStatus(responseJsonCalls(postFix)[0]),
    "self-test: …and does NOT flag the shipped fix, which supplies an explicit non-2xx status in the same call");
}

console.log(`  §1 static: ${n - failn}/${n} passed so far`);

// ── §2 DYNAMIC: the real GET handler, three states, hermetic ───────────────
const HOOK_URL = JSON.stringify(new URL("./lib/sentryStubHook.mjs", import.meta.url).href);
const ROUTE_URL = JSON.stringify(ROUTE_PATH.href);

// ONE fixed child template, driven entirely by explicit env (never the ambient
// shell — check-guard-hermeticity.mjs's rule; execFileSync below builds `env`
// from nothing per call, the same shape as test-foursquare.mjs §10/§11).
const CHILD = `
  import { register } from "node:module";
  register(${HOOK_URL}, import.meta.url);
  const route = await import(${ROUTE_URL});

  const rows = JSON.parse(process.env.__WF_ROWS);
  const resendMode = process.env.__WF_RESEND_MODE;
  const pulseWrites = [];
  const healthReads = [];
  globalThis.fetch = async (url, opts) => {
    const u = String(url);
    if (u.includes("/rest/v1/rpc/wf_job_health")) {
      healthReads.push({ cache: opts.cache, bounded: !!opts.signal });
      return { ok: true, status: 200, json: async () => rows };
    }
    if (u.includes("/rest/v1/wf_job_pulse")) {
      let body = {};
      try { body = JSON.parse((opts && opts.body) || "{}"); } catch (e) {}
      pulseWrites.push(body);
      return { ok: true, status: 201, json: async () => ({}) };
    }
    if (u.includes("api.resend.com/emails")) {
      if (resendMode === "success") return { ok: true, status: 200, json: async () => ({ id: "email_1" }) };
      if (resendMode === "fail") return { ok: false, status: 429, json: async () => ({ message: "rate limited" }) };
      throw new Error("network down");
    }
    throw new Error("TRAP: unexpected fetch " + u);
  };

  const req = new Request("https://gowayfind.com/api/cron/job-watch", {
    headers: { authorization: "Bearer " + process.env.__WF_CRON_SECRET },
  });
  const res = await route.GET(req);
  let body = {};
  try { body = await res.json(); } catch (e) {}
  console.log(JSON.stringify({
    status: res.status,
    body,
    sentryCalls: globalThis.__wfSentryStubCalls || [],
    flushCalls: globalThis.__wfSentryFlushCalls || [],
    pulseWrites,
    healthReads,
  }));
`;

function runScenario({ rows, resendMode = "unset", resendKeySet = false }) {
  const env = {
    NODE_ENV: "test",
    CRON_SECRET: "test-cron-secret",
    SUPABASE_URL: "https://fake.supabase.example",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key",
    __WF_ROWS: JSON.stringify(rows),
    __WF_RESEND_MODE: resendMode,
    __WF_CRON_SECRET: "test-cron-secret",
  };
  if (resendKeySet) env.RESEND_API_KEY = "test-resend-key";
  const out = execFileSync(process.execPath, ["--input-type=module", "-e", CHILD], {
    env, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out.trim().split("\n").pop());
}

const INCIDENT_ROWS = [
  { job: "atlas-build", attempted: 100, succeeded: 0, consecutive_zero: 5, last_note: "0 published of 25" },
];
const HEALTHY_ROWS = [
  { job: "popularity", attempted: 40, succeeded: 38, consecutive_zero: 0, last_note: null },
  { job: "hero-images", attempted: 0, succeeded: 0, consecutive_zero: 0, last_note: null },
];

// STATE 1a: healthy — real rows, zero incidents.
{
  const r = runScenario({ rows: HEALTHY_ROWS, resendMode: "unset", resendKeySet: false });
  ok(r.status === 200, `healthy: status is 200 (got ${r.status})`);
  ok(r.body.ok === true && r.body.incidents === 0, "healthy: ok:true, incidents:0");
  ok(r.healthReads.length === 1 && r.healthReads[0].cache === "no-store" && r.healthReads[0].bounded, "health decisions use a fresh, time-bounded database read");
  ok((r.sentryCalls || []).length === 0, "healthy: NO Sentry event — this is the negative control the whole guard exists to prove");
  const heartbeat = (r.pulseWrites || []).find((p) => p.job === "job-watch");
  ok(heartbeat && heartbeat.attempted === 0 && heartbeat.failed === 0, "healthy: a zero-work heartbeat distinguishes a healthy watcher from a stopped watcher");
}
// Missing health evidence must not masquerade as a healthy empty fleet.
{
  const r = runScenario({ rows: [], resendMode: "unset", resendKeySet: false });
  ok(r.status === 503 && r.body.ok === false, `empty table: must fail closed (got ${r.status})`);
  ok(/no pulse rows in window/.test(r.body.note || ""), "empty table: reported as 'nothing is reporting', not as a clean bill of health");
  ok((r.sentryCalls || []).length === 1, "empty table: report health-feed failure");
  ok(r.flushCalls.length === 1 && r.flushCalls[0] === 2000, "health-feed alarm is flushed with bounded wait");
}
// STATE 2: incidents > 0, delivery SUCCEEDS.
{
  const r = runScenario({ rows: INCIDENT_ROWS, resendMode: "success", resendKeySet: true });
  ok(r.status === 200, `delivered: status is 200 (got ${r.status})`);
  ok(r.body.sent === true, "delivered: sent:true");
  ok((r.sentryCalls || []).length === 0, "delivered: NO Sentry event — a working alert is not an incident in itself");
  const pw = (r.pulseWrites || []).find((p) => p.job === "job-watch");
  ok(!!pw, "delivered: job-watch filed its own self-pulse");
  ok(pw && pw.succeeded >= 1, "delivered: the pulse records succeeded >= 1 — delivery is provable from the pulse table alone");
  ok(pw && /delivered/.test(pw.note || ""), "delivered: the pulse note says so");
}
// STATE 3a: incidents > 0, RESEND_API_KEY absent (today's actual production state).
{
  const r = runScenario({ rows: INCIDENT_ROWS, resendMode: "unset", resendKeySet: false });
  ok(r.status === 500, `no key: status is 500, NOT 200 (got ${r.status}) — this is the exact production lie being fixed`);
  ok(r.body.ok === false && r.body.sent === false, "no key: ok:false, sent:false");
  const calls = r.sentryCalls || [];
  ok(r.flushCalls.length === 1 && r.flushCalls[0] === 2000, "missing-key alarm flushes before returning");
  ok(calls.length === 1, `no key: exactly one Sentry event (got ${calls.length})`);
  ok(calls[0] && calls[0].opts && calls[0].opts.level === "fatal", "no key: the event is high-severity ('fatal')");
  ok(calls[0] && calls[0].opts && calls[0].opts.tags && calls[0].opts.tags.job === "job-watch", "no key: the event is tagged with the job name");
  ok(calls[0] && /RESEND_API_KEY or DIGEST_EMAIL not set/.test(calls[0].message || ""), "no key: the event names the actual missing config");
  const pw = (r.pulseWrites || []).find((p) => p.job === "job-watch");
  ok(pw && pw.succeeded === 0, "no key: the self-pulse still records succeeded:0 — kept, not weakened");
  ok(pw && /CANNOT SEND/.test(pw.note || ""), "no key: the self-pulse note is unchanged");
}
// STATE 3b: incidents > 0, RESEND_API_KEY present but the send itself fails.
// A key that IS set but a provider outage is just as undelivered — must not
// silently degrade to 3a's absence of Sentry coverage.
{
  const r = runScenario({ rows: INCIDENT_ROWS, resendMode: "fail", resendKeySet: true });
  ok(r.status === 500, `send failed: status is 500 (got ${r.status})`);
  ok(r.body.sent === false && r.body.sendStatus === 429, "send failed: sent:false, sendStatus carries Resend's actual status");
  const calls = r.sentryCalls || [];
  ok(calls.length === 1, `send failed: exactly one Sentry event (got ${calls.length})`);
  ok(calls[0] && /Resend send failed/.test(calls[0].message || ""), "send failed: the event names a send failure, distinct from missing config");
  const pw = (r.pulseWrites || []).find((p) => p.job === "job-watch");
  ok(pw && pw.succeeded === 0 && /SEND FAILED/.test(pw.note || ""), "send failed: the self-pulse still records the failure");
}

console.log(`test-job-watch-fallback: ${n - failn}/${n} passed`);
if (failn) process.exit(1);
