#!/usr/bin/env node
// scripts/live-viator-smoke.mjs — POST-DEPLOYMENT PRODUCTION SMOKE TEST.
//
// Proves against LIVE production that a known ticketable attraction produces
// a valid, ATTRIBUTED Viator CTA. This is layer 1 of the revenue-guard stack
// added after the check-env.mjs incident (a guard that could never fail,
// wired into nothing, silently let NEXT_PUBLIC_VIATOR_PID go missing/
// placeholder — see lib/envPlaceholder.js and scripts/check-env-placeholders.mjs).
// A build-time guard proves the CODE is correct; this proves the DEPLOYED
// SITE, with the real env, actually produces a bookable link right now.
//
// DELIBERATELY NOT IN scripts/guards.txt / npm run prebuild. It dials a real
// network host and depends on live Vercel env — scripts/check-guard-
// hermeticity.mjs exists precisely to keep the guard suite from depending on
// anything the guard's author did not put there deliberately, and this script
// is the opt-in escape hatch, run by hand or from a post-deploy step, never
// from `npm run prebuild`. Naming it outside the `check-*` / `test-*`
// convention keeps check-guard-manifest.mjs from expecting it to be wired in.
//
// THE ABSOLUTE RULE: never print, log, echo or persist the PID or any
// credential value — booleans and shapes only. That property is enforced at
// RUNTIME below (wrapConsole), not merely by review, and the enforcement
// mechanism itself is unit-tested in scripts/test-secret-output-guard.mjs.
//
// Usage:
//   node scripts/live-viator-smoke.mjs [baseUrl]
//   WF_SMOKE_BASE_URL=https://www.gowayfind.com node scripts/live-viator-smoke.mjs
//
// Exit 0 only when every assertion below passes. Exit 1 on any failure,
// printing which check failed (never the value that failed it).
import { assertViatorRedirectShape, assertProbeShape } from "../lib/viatorSmokeAssert.js";
import { wrapConsole } from "../lib/secretOutputGuard.js";

const secrets = []; // populated the instant a real credential value is known
const wrapped = wrapConsole(console, secrets);

const BASE = (process.argv[2] || process.env.WF_SMOKE_BASE_URL || "https://www.gowayfind.com").replace(/\/+$/, "");
const TIMEOUT_MS = 10000;

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

let pass = 0;
const fails = [];
// `detail` is a SHAPE object (booleans / reasons array) — never the raw value.
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log(`  ok  ${label}`); }
  else { fails.push({ label, detail }); console.error(`  FAIL ${label}` + (detail ? " — " + JSON.stringify(detail) : "")); }
};

async function main() {
  console.log(`live-viator-smoke: target ${BASE}`);

  // ── 1. the probe endpoint: booleans only, never echoes values ────────────
  console.log("\n-- probe: /api/viator/go?probe=1 --");
  let probeJson = null;
  try {
    const r = await fetchWithTimeout(`${BASE}/api/viator/go?probe=1`);
    probeJson = await r.json().catch(() => null);
  } catch (e) {
    ok(false, "probe endpoint reachable", { error: "network_error" });
  }
  if (probeJson) {
    const probeVerdict = assertProbeShape(probeJson);
    ok(probeVerdict.ok, "probe reports hasKey / keyLooksValid / hasPid / a 2xx upstream", probeVerdict.reasons);
  }

  // ── 2. the real redirect: a known ticketable attraction ───────────────────
  console.log("\n-- redirect: /api/viator/go?intent=search&q=orlando%20tour&city=Orlando&surface=smoke --");
  const url = `${BASE}/api/viator/go?intent=search&q=${encodeURIComponent("orlando tour")}&city=${encodeURIComponent("Orlando")}&surface=smoke`;
  let res = null;
  try {
    res = await fetchWithTimeout(url, { redirect: "manual" });
  } catch (e) {
    ok(false, "redirect endpoint reachable", { error: "network_error" });
  }
  if (res) {
    ok(res.status === 302, "response status is 302", { status: res.status });
    const location = res.headers.get("location") || "";
    const verdict = assertViatorRedirectShape(location);

    // Register the pid (if any) with the output guard BEFORE printing
    // anything else about it, so even a mistake in the lines below cannot
    // leak it.
    try {
      const pid = new URL(location).searchParams.get("pid");
      if (pid) secrets.push(pid);
    } catch {}

    ok(verdict.hostOk, "Location host is viator.com / www.viator.com", { host: verdict.host });
    ok(verdict.pidPresent, "Location carries a pid parameter", null);
    ok(verdict.pidShapeOk, "pid clears the shape bar (/^P\\d{6,}$/ or length>3)", null);
    ok(verdict.pidNotPlaceholder, "pid is NOT a recognized placeholder (lib/envPlaceholder.js)", null);
    ok(verdict.mcidOk, "mcid === 42383", null);
    ok(verdict.mediumOk, "medium === link", null);
  }

  console.log(`\nlive-viator-smoke: ${pass} passed, ${fails.length} failed`);
  if (fails.length) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  // A thrown secretOutputGuard error lands here too — still never printed raw.
  console.error("live-viator-smoke: FATAL —", e && e.message ? e.message : "unknown error");
  process.exitCode = 1;
}).finally(() => wrapped.restore());
