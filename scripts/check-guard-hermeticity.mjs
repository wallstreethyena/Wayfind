#!/usr/bin/env node
/**
 * check-guard-hermeticity — A GUARD'S VERDICT MUST BE A FUNCTION OF THE REPO,
 * NOT OF THE SHELL IT RAN IN.
 *
 * THE NIGHT THIS COMES FROM (2026-07-31). check-untracked-affiliate-links had a
 * row wired to the wrong env NAME (the JS const `TM_IMPACT_SID` instead of the
 * var the code reads, NEXT_PUBLIC_IMPACT_SID), so it went red. The response
 * (5c541b4, "fix(guards): accept configured affiliate environment variables")
 * was to add an escape hatch:
 *
 *     const envConfigured = typeof process.env[envName] === "string" && ...
 *     ok(envConfigured || guardedFallbackExists, ...)
 *
 * That did not fix the name. It made the mistake unobservable, and it handed the
 * verdict to the terminal:
 *
 *   - in a shell with `.env.production.local` sourced -> GREEN, and you could
 *     have deleted the literal "7475855" that is the only thing attributing
 *     Ticketmaster and it would have STAYED green;
 *   - in a clean shell -> RED, with a message that pointed at a variable no
 *     part of the app reads.
 *
 * Same shell, same commit, two different answers. Six hours went into the
 * resulting confusion, and the guard that was supposed to protect a live
 * affiliate program was protecting nothing the whole time.
 *
 * THE RULE. A guard may WRITE process.env (setting up a fixture), DELETE from
 * it, or SPREAD it into a child process — none of those let ambient state decide
 * an assertion. A guard may not READ it, unless it is declared below with a
 * reason. Reading ambient env is how "works on my machine" gets into a suite
 * whose entire job is to be the thing that does not.
 *
 * If you need a value, set it explicitly for a child process the way
 * check-monetized-degrade.mjs does — then the test states its own preconditions
 * and reads the same on every machine.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SELF = path.basename(fileURLToPath(import.meta.url));

let pass = 0;
const fails = [];
const ok = (c, m) => { if (c) pass++; else fails.push(m); };

// Every exemption names a file and argues for itself. An exemption that stops
// being true is itself a failure below, so this list cannot quietly rot.
const EXEMPT = {
  "check-env.mjs":
    "its entire purpose is reporting on the ambient environment; it asserts nothing and always exits 0",
  "check-env-value-overrides.mjs":
    "reads ATLAS_MODEL only to SAVE and restore it around deliberate fixture mutation — the assertions run against values it sets itself",
  "check-inventory-integrity.mjs":
    "same shape as check-commerce-redirect: it talks to a live Supabase and the credentials are the CONNECTION, not the verdict. Without them it prints SKIPPED and exits 0; with them the verdict comes entirely from row data. It is also not wired into prebuild at all (see EXCLUDED in check-guard-manifest.mjs) — it runs in .github/workflows/canary.yml, because a stale row in production must never be able to block a code deploy",
  "check-commerce-redirect.mjs":
    "talks to a live Supabase; the credentials are the connection, not the verdict, and it degrades to a skip without them",
  "check-deal-art.mjs":
    "same as check-commerce-redirect — Supabase-backed art availability check, credentials are the connection",
  "test-og-bodies.mjs":
    "OG_BASE is an explicit opt-in for the live-origin variant; unset runs the offline assertions",
  "check-trend-sources.mjs":
    "same shape as check-env-value-overrides: PINTEREST_ACCESS_TOKEN is SAVED, set to a fixture value the guard chooses, asserted against a stub transport (token-in-header, never-in-URL), then restored — the ambient shell never reaches a verdict, and the token-hygiene assertion requires setting the env var the adapter reads at call time",
  "check-guards-emit-no-analytics.mjs":
    "same shape as check-env-value-overrides: WF_SUPPRESS_ANALYTICS and NEXT_PUBLIC_POSTHOG_KEY are SAVED, set to fixture values it chooses, asserted against, and restored in a finally — the ambient shell never reaches a verdict. It cannot delegate to a child process because the assertion is that captureServer issues no fetch, which requires stubbing fetch inside this process",
  "check-promote-metros-live-drift.mjs":
    "same shape as check-inventory-integrity.mjs: it talks to a live Supabase and the credentials are the CONNECTION, not the verdict. Without them it prints SKIPPED and exits 0; with them the verdict comes entirely from wf_promote_metros row data compared to lib/promoteIndex.js PROMOTE_METROS. It is also not wired into prebuild at all (see EXCLUDED in check-guard-manifest.mjs) — it runs in the scheduled canary workflow, because a row inserted straight into production must never be able to block a code deploy",
  "check-atlas-cache-batch.mjs":
    "same shape as check-env-value-overrides.mjs: reads ATLAS_BATCH_MODEL only to SAVE and restore it around a deliberate fixture mutation (proving resolveAtlasBatchModel() logs loud on an unrecognised-but-model-shaped override instead of silently substituting) — the assertions run against values it sets itself, and the saved value is restored in a finally",
  "check-cache-refresh.mjs":
    "2026-09-04 guard-honesty audit (docs/audits/guard-honesty-2026-09-04.md): WAYFIND_GATE and GOOGLE_MAPS_SERVER_KEY are SAVED, then set in-process to fixture values it chooses (shut/free/unset, with/without a key) to drive the real app/api/places/refresh route's GET handler through every gate branch, asserted against the handler's actual returned JSON, then restored in a finally — same shape as check-env-value-overrides.mjs. It cannot delegate to a child process because the assertion is that the SAME loaded module instance responds differently across gate states within one test run",
};

// This file is excluded from its own sweep. It is, by construction, full of
// specimen `process.env` shapes — the self-test above feeds the detector the
// exact 5c541b4 regression and the exact allowed forms. Scanning itself would
// report those fixtures as offences and prove nothing the self-test has not
// already proven directionally. (check-env-discipline.mjs is NOT exempted: the
// scrubber correctly reads its only match as prose inside a failure message.)

// ── source scrubbing ────────────────────────────────────────────────────────
// Comments and string/template literals are removed FIRST. Several guards quote
// `process.env` in prose to explain the very rule this file enforces, and a
// raw-text scan would fire on the documentation rather than on code — the trap
// check-editorial-publish.mjs and check-env-value-overrides.mjs both hit.
// Replacements keep the line count so reported line numbers stay true.
function scrub(src) {
  const keepLines = (m) => m.replace(/[^\n]/g, " ");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, keepLines)
    .replace(/`(?:\\[\s\S]|[^`\\])*`/g, keepLines)
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => '"' + " ".repeat(Math.max(0, m.length - 2)) + '"')
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => "'" + " ".repeat(Math.max(0, m.length - 2)) + "'")
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i >= 0 && !/:\/\//.test(l.slice(Math.max(0, i - 1))) ? l.slice(0, i) : l;
    })
    .join("\n");
}

/**
 * Every `process.env` occurrence that could decide an assertion.
 * WRITE (`process.env.X = `), DELETE and SPREAD (`...process.env`) are allowed;
 * anything else is a read. Exported shape: [{ line, text }].
 */
export function ambientReads(source) {
  const out = [];
  scrub(source).split("\n").forEach((line, i) => {
    const re = /process\.env/g;
    let m;
    while ((m = re.exec(line))) {
      const before = line.slice(0, m.index);
      const after = line.slice(m.index + "process.env".length);
      if (/\.\.\.\s*$/.test(before)) continue;                       // spread into a child env
      if (/\bdelete\s+$/.test(before)) continue;                     // fixture teardown
      if (/^(?:\.\w+|\[[^\]]*\])\s*=(?!=)/.test(after)) continue;    // fixture setup
      out.push({ line: i + 1, text: line.trim().slice(0, 120) });
    }
  });
  return out;
}

// ── self-test: the detector must tell the two shapes apart ──────────────────
// A detector that fires on everything gets exempted into uselessness; one that
// fires on nothing is decoration. Both directions are proven before it is used.
{
  const REGRESSION = `const envConfigured = typeof process.env[envName] === "string" && process.env[envName].trim().length > 0;`;
  ok(ambientReads(REGRESSION).length === 2,
    "self-test: the detector fires on the exact 5c541b4 shape (a read that decides a verdict)");
  ok(ambientReads(`process.env.NEXT_PUBLIC_VIATOR_PID = "P00000000";`).length === 0,
    "self-test: a fixture WRITE is allowed — tests must be able to state their preconditions");
  ok(ambientReads(`delete process.env.ATLAS_MODEL;`).length === 0, "self-test: delete is allowed");
  ok(ambientReads(`execFileSync(node, args, { env: { ...process.env, FOO: "1" } });`).length === 0,
    "self-test: spreading into a CHILD env is allowed — the child's explicit override is the precondition");
  ok(ambientReads(`// process.env.X is forbidden here`).length === 0,
    "self-test: prose in a line comment does not count as code");
  // Single-quoted so the backticks inside need no escaping — this is the exact
  // shape of check-env-discipline.mjs:132, which a raw-text scan would flag.
  ok(ambientReads('fail("new `process.env.X || <literal>` fallback");').length === 0,
    "self-test: the phrase inside a failure MESSAGE does not count as code");
  ok(ambientReads(`const v = process.env.OG_BASE || "";`).length === 1,
    "self-test: a plain read is still a read even with a fallback");
}

// ── the sweep ───────────────────────────────────────────────────────────────
const SCRIPTS = path.resolve("scripts");
const MANIFEST = path.resolve("scripts/guards.txt");
ok(existsSync(MANIFEST), "scripts/guards.txt exists");

const files = readdirSync(SCRIPTS).filter((f) => /^(check|test)-.*\.mjs$/.test(f) && f !== SELF);
ok(files.length >= 200, `${files.length} guard files scanned — a collapsed file list would make this vacuous`);
ok(readdirSync(SCRIPTS).includes(SELF), "the self-exclusion resolves to a real filename — a typo would silently exclude nothing, or everything");

const offenders = [];
const usedExemptions = new Set();
for (const f of files) {
  const reads = ambientReads(readFileSync(path.join(SCRIPTS, f), "utf8"));
  if (!reads.length) continue;
  if (f in EXEMPT) { usedExemptions.add(f); continue; }
  offenders.push({ f, reads });
}

for (const o of offenders) {
  ok(false,
    `${o.f} READS process.env and decides its verdict from it:\n` +
    o.reads.map((r) => `      line ${r.line}: ${r.text}`).join("\n") +
    `\n      A guard that consults the shell answers differently in a clean terminal than in one with .env.production.local sourced — that is how 5c541b4 turned a live-affiliate guard into decoration for six hours.` +
    `\n      Set the value explicitly for a child process (see scripts/check-monetized-degrade.mjs), or declare ${o.f} in EXEMPT here with a reason.`);
}

// An exemption whose justification has expired is a lie in the codebase.
for (const f of Object.keys(EXEMPT)) {
  ok(existsSync(path.join(SCRIPTS, f)), `EXEMPT names ${f}, which no longer exists — delete the entry`);
  if (existsSync(path.join(SCRIPTS, f))) {
    ok(usedExemptions.has(f),
      `${f} is EXEMPT but no longer reads process.env — remove the exemption so the next real one gets read on its merits`);
  }
  ok((EXEMPT[f] || "").length > 30, `the exemption for ${f} must argue for itself, not just exist`);
}

if (fails.length) {
  console.error("check-guard-hermeticity: FAIL\n  - " + fails.join("\n  - "));
  process.exit(1);
}
console.log(`check-guard-hermeticity: OK — ${pass} assertions; ${files.length} guards scanned, ${Object.keys(EXEMPT).length} declared exemptions, no guard decides its verdict from the ambient shell`);
