#!/usr/bin/env node
// scripts/check-cron-pulse-coverage.mjs — an unmonitored scheduled job must
// be impossible to ship, not merely discouraged.
//
// STRUCTURAL-ONLY: pure regex/text analysis of app/api/cron/*/route.js
// source against vercel.json's schedule list. There is no single runtime
// import that proves "every terminal path reports a pulse" across 30+
// route files that each shape their own control flow differently — this
// checks the actual return/recordPulse call sites with a hand-rolled,
// string/comment-aware, function-nesting-aware scanner, then proves the
// scanner itself can both pass and fail against real and synthetic fixtures
// below (the red-proof self-test), before it is trusted against the repo.
//
// THE INCIDENT THIS CLOSES (2026-09-09). public.verified_offers was never
// applied to production, and lib/verifiedOfferStore.js degrades every
// failure to []/false/no-op by design (correct for its user-facing callers,
// /api/viator/go + /api/viator/tours). app/api/cron/verify-offers inherited
// that silence: it returned { ok: true, checked: 0 } on every run, forever,
// with NO wf_job_pulse row at all — job-watch, which exists specifically to
// notice a job going quiet, could not see this job going quiet because it
// never reported in the first place. See that route's own header and
// supabase/migrations/*_wf_verified_offers.sql for the fix. This guard is
// the generalization: a cron whose GET handler returns without ever calling
// recordPulse (directly, or via lib/jobFail.js's jobCannotRun/jobFailed,
// which call it internally) is exactly as invisible, on ANY terminal path,
// not only the one this incident happened to hit.
//
// WHAT "TERMINAL PATH" MEANS HERE. Every `return` statement that belongs to
// GET's OWN function scope — not one buried inside a forEach/map/filter
// callback, a pool()-style worker, or an IIFE defined inside it, which exit
// only that inner callback, not the request. The scanner tracks a stack of
// function-scope frames (an arrow's `=> {` or a `function` keyword before
// the same brace) so a `return;` used as "skip this item" inside a mapper
// is correctly excluded — see the self-test below, which is exactly the
// false-positive shape a naive "every `return` in the file" regex would
// have hit on cc-alerts/events-link-health/experiences-link-health.
//
// The pre-work auth rejection (`if (!secret || ...) return ...401...;`,
// identical in all 32 routes) is exempt — the job has not started, there is
// nothing yet to report. Detected by the literal `401` inside that specific
// return statement's own text, not by position, so it cannot accidentally
// exempt a real terminal return that happens to come first in some future
// route shape.
//
// GRANDFATHERED DEBT, NOT A BLANK CHEQUE. Same shape as
// scripts/check-guard-honesty.mjs's KNOWN_WEAK: routes that already have a
// gap today are named below with a one-line reason so this guard can ship
// green without either fixing 20 unrelated files in a PR about one cron, or
// silently narrowing what it enforces. Three of the entries
// (deals-health, events-link-health, experiences-link-health) are the exact
// cousins of the verify-offers incident — same "Supabase-backed integrity
// sweep that can go silent" shape — named explicitly in the fix's own scope
// as tracked, NOT fixed here. The rest are legacy jobs that never adopted
// the pulse contract at all, a separate and larger modernization this
// change does not attempt. A KNOWN_UNPULSED entry that stops having any
// violation is reported as a WIN (fix it for real, or the scanner was
// wrong) rather than silently passing forever — remove it when that
// happens, the same discipline check-guard-honesty.mjs already documents.
// A KNOWN_UNPULSED key that no longer names a scheduled route file fails
// loudly, so a rename can't leave a stale exemption no route can ever
// trigger again.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const CRON_DIR = path.join(REPO, "app/api/cron");

let pass = 0;
const failures = [];
const ok = (c, m) => { if (c) pass++; else failures.push(m); };

// ── the scanner ──────────────────────────────────────────────────────────

// Tag every character 'c' (code) / 's' (string/template) / 'm' (comment) so
// brace/identifier scanning below never misreads text inside either.
function classify(src) {
  const n = src.length;
  const kind = new Array(n).fill("c");
  let i = 0;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") { kind[i] = "m"; i++; }
      continue;
    }
    if (c === "/" && c2 === "*") {
      kind[i] = "m"; i++; kind[i] = "m"; i++;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { kind[i] = "m"; i++; }
      if (i < n) { kind[i] = "m"; i++; kind[i] = "m"; i++; }
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; kind[i] = "s"; i++;
      while (i < n) {
        if (src[i] === "\\") { kind[i] = "s"; i++; if (i < n) { kind[i] = "s"; i++; } continue; }
        kind[i] = "s";
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    i++;
  }
  return kind;
}

const isWordChar = (c) => /[A-Za-z0-9_$]/.test(c);

// Locate GET's body as [bodyStart, bodyEnd) — bodyStart just after its
// opening '{', bodyEnd at the matching closing '}'.
function findGetBody(src, kind) {
  const m = /export\s+async\s+function\s+GET\s*\(/.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  while (i < src.length && depth > 0) {
    if (kind[i] === "c") { if (src[i] === "(") depth++; else if (src[i] === ")") depth--; }
    i++;
  }
  while (i < src.length && !(kind[i] === "c" && src[i] === "{")) i++;
  const bodyStart = i + 1;
  let d = 1; i = bodyStart;
  while (i < src.length && d > 0) {
    if (kind[i] === "c") { if (src[i] === "{") d++; else if (src[i] === "}") { d--; if (d === 0) break; } }
    i++;
  }
  return { bodyStart, bodyEnd: i };
}

// One pass over GET's body: collect every top-level (GET's own function
// scope, not a nested callback) `return` start position, and every
// top-level `recordPulse(` call start position.
function scanBody(src, kind, bodyStart, bodyEnd) {
  const stack = []; // true = this brace frame is a FUNCTION scope
  const topReturns = [];
  const topPulses = [];
  let i = bodyStart;
  while (i < bodyEnd) {
    if (kind[i] !== "c") { i++; continue; }
    const c = src[i];
    if (c === "{") {
      let j = i - 1;
      while (j >= bodyStart && /\s/.test(src[j])) j--;
      let isFn = src[j] === ">" && src[j - 1] === "=" ? true : false; // arrow `=> {`
      if (!isFn && src[j] === ")") {
        let d2 = 0, k = j;
        while (k >= bodyStart) {
          if (kind[k] === "c") {
            if (src[k] === ")") d2++;
            else if (src[k] === "(") { d2--; if (d2 === 0) { k--; break; } }
          }
          k--;
        }
        while (k >= bodyStart && /\s/.test(src[k])) k--;
        let k2 = k;
        while (k2 >= bodyStart && isWordChar(src[k2])) k2--;
        const before = src.slice(Math.max(bodyStart, k2 - 9), k2 + 1);
        if (/\bfunction\*?\s*$/.test(before)) isFn = true; // `function name(...) {` / `function (...) {`
      }
      stack.push(isFn);
      i++; continue;
    }
    if (c === "}") { stack.pop(); i++; continue; }
    if (isWordChar(c)) {
      let j = i;
      while (j < bodyEnd && isWordChar(src[j])) j++;
      const word = src.slice(i, j);
      const atTop = !stack.some(Boolean);
      if (atTop && word === "return") topReturns.push(i);
      if (atTop && word === "recordPulse") {
        let k = j; while (k < bodyEnd && /\s/.test(src[k])) k++;
        if (src[k] === "(") topPulses.push(i);
      }
      i = j; continue;
    }
    i++;
  }
  return { topReturns, topPulses };
}

// A top-level return's own statement text: from `return` to the first
// top-level ';' (local bracket balance back to 0), or up to wherever an
// enclosing bracket would otherwise close (no trailing semicolon).
function statementEnd(src, kind, start, bodyEnd) {
  let i = start, depth = 0;
  while (i < bodyEnd) {
    if (kind[i] !== "c") { i++; continue; }
    const c = src[i];
    if ("([{".includes(c)) { depth++; i++; continue; }
    if (")]}".includes(c)) {
      if (depth === 0) return i;
      depth--; i++; continue;
    }
    if (c === ";" && depth === 0) return i + 1;
    i++;
  }
  return bodyEnd;
}

/**
 * @param {string} src route.js source
 * @returns {{error:string}|{violations:{line:number,stmt:string}[],returnCount:number,pulseCount:number}}
 */
function analyzeRoute(src) {
  const kind = classify(src);
  const body = findGetBody(src, kind);
  if (!body) return { error: "no `export async function GET(` found" };
  const { bodyStart, bodyEnd } = body;
  const { topReturns, topPulses } = scanBody(src, kind, bodyStart, bodyEnd);
  const violations = [];
  let prevEnd = bodyStart;
  for (const r of topReturns) {
    const end = statementEnd(src, kind, r, bodyEnd);
    const stmt = src.slice(r, end);
    const isAuthGate = /\b401\b/.test(stmt);
    const selfPulses = /\bjobCannotRun\s*\(|\bjobFailed\s*\(/.test(stmt);
    const covered = isAuthGate || selfPulses || topPulses.some((p) => p >= prevEnd && p < r);
    if (!covered) violations.push({ line: src.slice(0, r).split("\n").length, stmt: stmt.replace(/\s+/g, " ").trim().slice(0, 100) });
    prevEnd = end;
  }
  return { violations, returnCount: topReturns.length, pulseCount: topPulses.length };
}

// ── vercel.json → the scheduled route files this guard must cover ─────────
function scheduledRouteFiles() {
  const vercel = JSON.parse(readFileSync(path.join(REPO, "vercel.json"), "utf8"));
  const crons = Array.isArray(vercel.crons) ? vercel.crons : [];
  const files = new Set();
  for (const c of crons) {
    const withoutQuery = String(c.path || "").split("?")[0];
    const slug = withoutQuery.replace(/^\/api\/cron/, "").replace(/^\//, "");
    files.add(slug ? `app/api/cron/${slug}/route.js` : "app/api/cron/route.js");
  }
  return [...files].sort();
}

// ── grandfathered pre-existing gaps (dated, reasoned — see header) ─────────
const KNOWN_UNPULSED = {
  "app/api/cron/deals-health/route.js": "2026-09-09, verify-offers pulse-visibility fix: same silent-success shape (jobCannotRun/jobFailed cover its error paths, but both success returns — the expiry-only early return and the final link-health return — never call recordPulse). Tracked, not fixed here.",
  "app/api/cron/events-link-health/route.js": "2026-09-09, verify-offers pulse-visibility fix: zero recordPulse/jobFail reference in the whole file — the exact cousin of the pre-fix verify-offers gap (Supabase-backed link-health sweep). Tracked, not fixed here.",
  "app/api/cron/route.js": "Pre-existing: the daily owner-briefing route never adopted lib/jobPulse.js. Legacy, unrelated to the verify-offers incident.",
  "app/api/cron/atlas-build/route.js": "Pre-existing false positive of THIS scanner, verified by hand: its `pulse(opts)` local helper (route.js:341-344) wraps recordPulse(\"atlas-refresh\"|\"atlas-retry\"|\"atlas-build\", opts) under a name this scanner does not special-case — scripts/test-job-pulse.mjs already locks real pulse coverage for this route by name. A handful of early gate/selector-unreachable returns above that helper are a separate, smaller pre-existing gap.",
  "app/api/cron/audit-feeds/route.js": "Pre-existing: never adopted lib/jobPulse.js. Legacy, unrelated to the verify-offers incident.",
  "app/api/cron/beach-water/route.js": "Pre-existing: never adopted lib/jobPulse.js. Legacy, unrelated to the verify-offers incident.",
  "app/api/cron/booking-audit/route.js": "Pre-existing: never adopted lib/jobPulse.js. Legacy, unrelated to the verify-offers incident.",
  "app/api/cron/cc-alerts/route.js": "Pre-existing: never adopted lib/jobPulse.js. Legacy, unrelated to the verify-offers incident.",
  "app/api/cron/cwv/route.js": "Pre-existing: never adopted lib/jobPulse.js. Legacy, unrelated to the verify-offers incident.",
  "app/api/cron/experiences/route.js": "Pre-existing: never adopted lib/jobPulse.js. Legacy, unrelated to the verify-offers incident.",
  "app/api/cron/hero-images/route.js": "Pre-existing: never adopted lib/jobPulse.js. Legacy, unrelated to the verify-offers incident.",
  "app/api/cron/instagram-scout/route.js": "Pre-existing: reports via a local `json(body,status)` helper this scanner does not resolve to Response.json; several of its early service/health guard returns predate full pulse adoption.",
  "app/api/cron/inventory-refresh/route.js": "Pre-existing: one early feature-gate return (`{skipped:\"gate ...\"}`) predates pulse adoption; the job's real work paths already pulse.",
  "app/api/cron/lunch-images/route.js": "Pre-existing: never adopted lib/jobPulse.js. Legacy, unrelated to the verify-offers incident.",
  "app/api/cron/promote-index/route.js": "Pre-existing: two early feature-gate/validation returns predate pulse adoption; the job's real work paths already pulse.",
  "app/api/cron/schema-watch/route.js": "Pre-existing: the send-skipped and send-attempted final branches of its email step predate full pulse adoption; the scan step above already pulses.",
  "app/api/cron/scout/route.js": "Pre-existing: one feature-gate return and the dry-run summary branch predate full pulse adoption; the job's real adjudication path already pulses.",
  "app/api/cron/social-discovery/route.js": "Pre-existing: three early mode/config-validation returns predate full pulse adoption; the job's real work paths already pulse.",
};

// ── self-test: prove the scanner can both pass AND fail ────────────────────
// (check-guards-can-fail.mjs / AGENTS.md §4 — an assertion that cannot fail
// is worse than no assertion.)
{
  const GOOD = `
    export async function GET(req) {
      const secret = process.env.CRON_SECRET;
      const auth = req.headers.get("authorization") || "";
      if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });
      if (!svc) return jobCannotRun("x", "no service key");
      const rows = items.filter((it) => { if (!it.ok) return false; return true; }); // nested return must not count
      let n = 0;
      rows.forEach((r) => { if (r.bad) return; n++; }); // nested return must not count
      await recordPulse("x", { attempted: rows.length, succeeded: n });
      return Response.json({ ok: true, n });
    }
  `;
  const goodResult = analyzeRoute(GOOD);
  ok(goodResult.violations.length === 0,
    `self-test POSITIVE CONTROL failed: a route with recordPulse before its final return, jobCannotRun on its error path, and TWO nested-callback `+`return`+`s (a filter + a forEach) should have ZERO violations, got ${goodResult.violations.length}`);
  ok(goodResult.returnCount === 3,
    `self-test: GOOD fixture should have exactly 3 top-level returns (401 gate, jobCannotRun, final) — the two nested `+`return`+`s inside filter/forEach must be excluded from the count; got ${goodResult.returnCount}`);

  const BAD = GOOD.replace('await recordPulse("x", { attempted: rows.length, succeeded: n });\n      ', "");
  const badResult = analyzeRoute(BAD);
  ok(badResult.violations.length === 1,
    `self-test RED-PROOF failed: removing the one recordPulse call before the final return must produce EXACTLY 1 violation (the final return), got ${badResult.violations.length}`);
  ok(badResult.violations.length && /ok: true, n/.test(badResult.violations[0].stmt),
    "self-test: the flagged violation must be the final `return Response.json(...)`, identified by its own statement text");

  // The exact false-positive shape this scanner exists to avoid: a naive
  // "every `return` in the file" regex would flag the nested filter/forEach
  // returns above even though GOOD is fully covered. Prove the negative
  // directly against a fixture that ONLY has nested returns and IS pulsed.
  const NESTED_ONLY = `
    export async function GET(req) {
      if (!secret) return new Response("no", { status: 401 });
      const kept = list.filter((x) => { if (x.skip) return; return x.ok; });
      await recordPulse("y", { attempted: kept.length, succeeded: kept.length });
      return Response.json({ ok: true });
    }
  `;
  ok(analyzeRoute(NESTED_ONLY).violations.length === 0,
    "self-test: nested returns inside a filter callback must never be treated as unpulsed terminal paths");
}

// ── prove the scanner still finds the real, currently-open gaps ───────────
// (so KNOWN_UNPULSED cannot rot into hiding a checker that stopped working)
{
  for (const rel of ["app/api/cron/deals-health/route.js", "app/api/cron/events-link-health/route.js"]) {
    const src = readFileSync(path.join(REPO, rel), "utf8");
    const res = analyzeRoute(src);
    ok(!res.error && res.violations.length > 0,
      `${rel}: expected this scanner to still find an open violation here (it is the tracked, not-yet-fixed cousin of the verify-offers incident) — got ${res.error || "0 violations"}. Either it was fixed for real (remove its KNOWN_UNPULSED entry) or this scanner regressed.`);
  }
}

// ── prove verify-offers is now clean ───────────────────────────────────────
{
  const src = readFileSync(path.join(REPO, "app/api/cron/verify-offers/route.js"), "utf8");
  const res = analyzeRoute(src);
  ok(!res.error, "app/api/cron/verify-offers/route.js: GET handler not found — this scanner has lost its subject");
  ok(res.returnCount >= 4, `app/api/cron/verify-offers/route.js: expected several terminal returns (401 gate, jobCannotRun, jobFailed, idle, success) — got ${res.returnCount}, this scanner may have lost its subject`);
  ok(res.violations.length === 0,
    `app/api/cron/verify-offers/route.js: expected zero unpulsed terminal paths after the 2026-09-09 fix, found ${res.violations.length}: ${JSON.stringify(res.violations)}`);
}

// ── the real run ─────────────────────────────────────────────────────────
const scheduled = scheduledRouteFiles();
ok(scheduled.length >= 25, `scheduledRouteFiles() found only ${scheduled.length} routes from vercel.json's crons — this guard has lost its subject (expected >= 25)`);

const wins = [];
for (const rel of scheduled) {
  const abs = path.join(REPO, rel);
  if (!existsSync(abs)) { failures.push(`${rel}: scheduled in vercel.json but no route.js exists on disk`); continue; }
  const src = readFileSync(abs, "utf8");
  const res = analyzeRoute(src);
  if (res.error) { failures.push(`${rel}: ${res.error}`); continue; }
  if (res.violations.length === 0) {
    if (KNOWN_UNPULSED[rel]) wins.push(rel);
    pass++;
    continue;
  }
  if (KNOWN_UNPULSED[rel]) { pass++; continue; } // grandfathered debt, not this guard's failure today
  for (const v of res.violations) {
    failures.push(`${rel}:${v.line} — terminal return \`${v.stmt}\` has no recordPulse (directly, or via jobCannotRun/jobFailed) reachable before it, and is not the CRON_SECRET auth gate. Job-watch cannot see this outcome. Call recordPulse() before returning, or route through lib/jobFail.js.`);
  }
}

// KNOWN_UNPULSED keys that no longer name a scheduled route are stale.
const scheduledSet = new Set(scheduled);
for (const rel of Object.keys(KNOWN_UNPULSED)) {
  ok(scheduledSet.has(rel), `KNOWN_UNPULSED names ${rel}, which vercel.json no longer schedules — remove the stale entry`);
}

if (failures.length) {
  console.error(`check-cron-pulse-coverage: ${pass} passed, ${failures.length} FAILED`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
if (wins.length) console.log(`check-cron-pulse-coverage: note — ${wins.join(", ")} no longer have any unpulsed terminal path; remove from KNOWN_UNPULSED`);
console.log(`check-cron-pulse-coverage: OK — ${pass} assertions; ${scheduled.length} scheduled cron routes checked (${scheduled.length - Object.keys(KNOWN_UNPULSED).length} fully enforced, ${Object.keys(KNOWN_UNPULSED).length} grandfathered pre-existing gaps tracked above)`);
