#!/usr/bin/env node
/**
 * scripts/run-synthetic-monitor.mjs — PRODUCTION-LIKE SYNTHETIC USER MONITORING.
 *
 * WHY THIS EXISTS. CLAUDE.md's canary section measured the guard suite at 420
 * scripts, 343 of which read source as TEXT and only 2 of which render the app
 * and gate a deploy on it — "a regex cannot see a render". This is the missing
 * layer for the flows that matter most in production, run continuously against
 * the DEPLOYED site rather than a local build, on real rendered content.
 *
 * THIS SCRIPT TOUCHES THE NETWORK. It is deliberately NOT wired into
 * scripts/guards.txt — the prebuild suite must stay hermetic (see
 * scripts/check-guard-hermeticity.mjs), and a flaky partner/CDN must never be
 * able to block a code merge. This is a smoke test, exactly like
 * .github/workflows/canary.yml's three jobs, run on its own schedule instead
 * (.github/workflows/synthetic-monitor.yml).
 *
 * The scenario DEFINITIONS live in scripts/lib/synthetic/scenarios.mjs, as
 * data — adding a flow means adding an entry there, not new plumbing here.
 * scripts/check-synthetic-monitor-hermetic.mjs proves those definitions and
 * the evidence/redaction logic are correct WITHOUT touching the network; this
 * file is what actually executes them.
 *
 * USAGE
 *   node scripts/run-synthetic-monitor.mjs --all
 *   node scripts/run-synthetic-monitor.mjs --scenario=homepage
 *   node scripts/run-synthetic-monitor.mjs --all --base-url=http://localhost:3100
 *   node scripts/run-synthetic-monitor.mjs --list
 *
 * Exits non-zero when any executed scenario has a failing assertion, threw,
 * or (for a page scenario) Chromium could not be found — a check that cannot
 * run must never report success by evaporating.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SCENARIOS, REQUIRED_FLOWS } from "./lib/synthetic/scenarios.mjs";
import { launchChromium } from "./lib/synthetic/chromium.mjs";
import { redactUrl, describeRedirectDestination } from "./lib/synthetic/redact.mjs";
import { runEvidenceDir, writeScenarioFailureEvidence } from "./lib/synthetic/evidence.mjs";
import { PROVIDERS } from "../lib/commerceProviders.js";
import { isTicketmasterFamily } from "../lib/affiliates.js";
import { SARASOTA } from "./lib/synthetic/fixtures.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASE_URL = "https://www.gowayfind.com";
const SCENARIO_TIMEOUT_MS = 60_000;

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { all: false, scenario: null, baseUrl: DEFAULT_BASE_URL, evidenceDir: null, list: false };
  for (const arg of argv) {
    if (arg === "--all") out.all = true;
    else if (arg === "--list") out.list = true;
    else if (arg.startsWith("--scenario=")) out.scenario = arg.slice("--scenario=".length);
    else if (arg === "--scenario") out.scenario = "__NEXT__";
    else if (arg.startsWith("--base-url=")) out.baseUrl = arg.slice("--base-url=".length).replace(/\/+$/, "");
    else if (arg.startsWith("--evidence-dir=")) out.evidenceDir = arg.slice("--evidence-dir=".length);
    else if (out.scenario === "__NEXT__") out.scenario = arg;
  }
  return out;
}

function usageAndExit(code) {
  console.error("Usage: node scripts/run-synthetic-monitor.mjs (--all | --scenario=<id> | --list) [--base-url=<url>] [--evidence-dir=<dir>]");
  console.error(`Scenarios: ${SCENARIOS.map((s) => s.id).join(", ")}`);
  process.exit(code);
}

const args = parseArgs(process.argv.slice(2));

if (args.list) {
  for (const s of SCENARIOS) console.log(`${s.id}\t[${s.flow}]\t${s.name}`);
  process.exit(0);
}

if (!args.all && !args.scenario) usageAndExit(1);

const toRun = args.all ? SCENARIOS : SCENARIOS.filter((s) => s.id === args.scenario);
if (!toRun.length) {
  console.error(`run-synthetic-monitor: no scenario matches "${args.scenario}"`);
  usageAndExit(1);
}

// A ratchet, same shape as run-guards.mjs's FLOOR — this refuses to report
// "done" if scenarios.mjs ever loses entries to a bad merge.
if (args.all && SCENARIOS.length < REQUIRED_FLOWS.length) {
  console.error(`run-synthetic-monitor: FAIL — ${SCENARIOS.length} scenarios for ${REQUIRED_FLOWS.length} required flows. Refusing to report a full run.`);
  process.exit(1);
}

const evidenceBase = args.evidenceDir || path.join(ROOT, "synthetic-evidence");
const runDir = runEvidenceDir(evidenceBase);

// ── the REAL production allowlist, not a second hand-kept copy ────────────
const ATTRIBUTED_PARTNER_HOST_REGEXES = Object.values(PROVIDERS).flatMap((p) => p.hosts || []);
function isAttributedPartnerHost(hostname, rawUrl) {
  if (isTicketmasterFamily(rawUrl)) return true;
  return ATTRIBUTED_PARTNER_HOST_REGEXES.some((rx) => rx.test(hostname));
}
const OWN_HOSTS = new Set(["www.gowayfind.com", "gowayfind.com", "localhost"]);
function isOwnFallbackHost(hostname) {
  return OWN_HOSTS.has(hostname) || hostname.endsWith(".gowayfind.com");
}

// ── ctx construction (the contract documented atop scenarios.mjs) ─────────
function buildCtx({ baseUrl, browser }) {
  const results = [];
  const notes = [];
  const consoleErrors = [];
  const networkFailures = [];
  const openedContexts = [];
  let lastUrl = null;
  let lastViewport = null;
  let lastPage = null;

  const ctx = {
    baseUrl,
    ok(name, cond, expected, actual) {
      const pass = !!cond;
      results.push({ name, pass, expected, actual });
      if (!pass) console.log(`    ✗ ${name} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      return pass;
    },
    note(text) {
      notes.push(String(text));
    },
    setUrl(u) {
      lastUrl = u;
    },
    async openPage({ viewport } = {}) {
      if (!browser) throw new Error("Chromium is unavailable — cannot open a page (see the run's top-level SKIPPED note)");
      const vp = viewport || { width: 1280, height: 900 };
      lastViewport = vp;
      // A GEOLOCATED, PERMISSION-GRANTED CONTEXT, PINNED TO A REAL METRO.
      // Without an explicit grant, headless Chromium's geolocation resolution
      // is a runner-host-dependent guessing game (IP geo in whatever
      // datacenter the job happens to run in), which makes every downstream
      // rail selection non-deterministic and, worse, leaves the app waiting
      // on a permission resolution that can stall the render entirely. Real
      // users either grant location or the app falls back — this pins the
      // monitor to the SAME real, first-class metro every other scenario in
      // this file already uses (Sarasota, FL), so results are comparable
      // across runs and the homepage renders the SAME populated surface a
      // located reader would see, not whatever IP-geo the CI runner has.
      const bctx = await browser.newContext({
        viewport: vp,
        deviceScaleFactor: 1,
        userAgent: "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)",
        geolocation: { latitude: SARASOTA.lat, longitude: SARASOTA.lng },
        permissions: ["geolocation"],
      });
      openedContexts.push(bctx);
      const page = await bctx.newPage();
      lastPage = page;
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 500));
      });
      page.on("pageerror", (err) => {
        consoleErrors.push("pageerror: " + String((err && err.message) || err).slice(0, 500));
      });
      page.on("requestfailed", (req) => {
        try {
          networkFailures.push({
            url: req.url(),
            method: req.method(),
            status: null,
            resourceType: req.resourceType(),
            failure: req.failure() && req.failure().errorText,
          });
        } catch {}
      });
      page.on("response", (res) => {
        try {
          if (res.status() >= 400) {
            networkFailures.push({ url: res.url(), method: res.request().method(), status: res.status(), resourceType: res.request().resourceType() });
          }
        } catch {}
      });
      return page;
    },
    async fetchJson(pathOrUrl, opts = {}) {
      const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : baseUrl + pathOrUrl;
      lastUrl = url;
      const redirect = opts.redirect || "follow";
      let res = null;
      let text = "";
      let json = null;
      let errMsg = null;
      try {
        res = await fetch(url, {
          redirect,
          headers: { "user-agent": "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)" },
        });
        if (redirect !== "manual" || res.status < 300 || res.status >= 400) {
          text = await res.text().catch(() => "");
          try { json = JSON.parse(text); } catch {}
        }
      } catch (e) {
        errMsg = String((e && e.message) || e);
      }
      const status = res ? res.status : 0;
      if (!res || status >= 400 || errMsg) {
        networkFailures.push({
          url,
          method: opts.method || "GET",
          status,
          resourceType: "fetch",
          failure: errMsg ? errMsg.slice(0, 200) : undefined,
        });
      }
      const headers = {};
      if (res && res.headers) for (const [k, v] of res.headers.entries()) headers[k] = v;
      return { status, ok: !!res && res.ok, url, json, text, headers, error: errMsg };
    },
    describeDestination(rawLocation) {
      return describeRedirectDestination(rawLocation, isAttributedPartnerHost, isOwnFallbackHost);
    },
    get results() { return results; },
    get notes() { return notes; },
    get consoleErrors() { return consoleErrors; },
    get networkFailures() { return networkFailures; },
    get lastUrl() { return lastUrl; },
    get lastViewport() { return lastViewport; },
  };

  return {
    ctx,
    async cleanup() {
      for (const c of openedContexts) {
        try { await c.close(); } catch {}
      }
    },
    async screenshot() {
      if (!lastPage) return null;
      try { return await lastPage.screenshot({ fullPage: false }); } catch { return null; }
    },
  };
}

function reproCommandFor(scenario, baseUrl) {
  return `node scripts/run-synthetic-monitor.mjs --scenario=${scenario.id} --base-url=${baseUrl}`;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`scenario timed out after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function main() {
  console.log(`run-synthetic-monitor: ${toRun.length} scenario(s) against ${args.baseUrl}`);
  console.log(`run-synthetic-monitor: evidence root ${runDir}`);

  const browser = await launchChromium().catch((e) => {
    console.log(`run-synthetic-monitor: Chromium launch failed (${e && e.message}) — page-based scenarios will report a hard failure, not a silent pass`);
    return null;
  });
  if (!browser) {
    console.log("run-synthetic-monitor: WARNING — no Chromium available; only API-kind scenario assertions that avoid openPage() can run meaningfully");
  }

  let anyFail = false;
  const summary = [];

  for (const scenario of toRun) {
    process.stdout.write(`\n▶ ${scenario.id} — ${scenario.name}\n`);
    const { ctx, cleanup, screenshot } = buildCtx({ baseUrl: args.baseUrl, browser });
    let threw = null;
    try {
      await withTimeout(scenario.run(ctx), SCENARIO_TIMEOUT_MS, scenario.id);
    } catch (e) {
      threw = e;
      ctx.ok("scenario completed without throwing", false, "no exception", String((e && e.stack) || e).slice(0, 800));
    }

    const failing = ctx.results.filter((r) => !r.pass);
    const scenarioPassed = !threw && ctx.results.length > 0 && failing.length === 0;
    if (ctx.results.length === 0 && !threw) {
      ctx.ok("scenario recorded at least one assertion", false, "> 0 assertions", 0);
    }
    const finalFailing = ctx.results.filter((r) => !r.pass);

    if (finalFailing.length > 0) {
      anyFail = true;
      const shot = await screenshot();
      const evidence = writeScenarioFailureEvidence({
        runDir,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        baseUrl: args.baseUrl,
        url: ctx.lastUrl,
        viewport: ctx.lastViewport,
        assertions: ctx.results,
        consoleErrors: ctx.consoleErrors,
        networkFailures: ctx.networkFailures,
        screenshot: shot,
        reproCommand: reproCommandFor(scenario, args.baseUrl),
      });
      console.log(`  FAIL — ${finalFailing.length}/${ctx.results.length} assertions failed`);
      console.log(`  evidence: ${evidence.dir}`);
      console.log(`  repro: ${reproCommandFor(scenario, args.baseUrl)}`);
      if (ctx.lastUrl) console.log(`  url: ${redactUrl(ctx.lastUrl)}`);
    } else {
      console.log(`  OK — ${ctx.results.length} assertions`);
    }
    for (const n of ctx.notes) console.log(`  note: ${n}`);

    summary.push({ id: scenario.id, flow: scenario.flow, pass: finalFailing.length === 0, assertions: ctx.results.length, failing: finalFailing.length });
    await cleanup();
  }

  if (browser) await browser.close().catch(() => {});

  console.log("\nrun-synthetic-monitor: summary");
  for (const s of summary) {
    console.log(`  ${s.pass ? "PASS" : "FAIL"}  ${s.id.padEnd(22)} ${s.flow.padEnd(22)} ${s.assertions - s.failing}/${s.assertions} assertions`);
  }

  if (anyFail) {
    console.log(`\nrun-synthetic-monitor: FAIL — evidence under ${runDir}`);
    process.exit(1);
  }
  console.log("\nrun-synthetic-monitor: OK — all scenarios passed");
  process.exit(0);
}

mkdirSync(runDir, { recursive: true });
main().catch((e) => {
  console.error("run-synthetic-monitor: FATAL —", (e && e.stack) || e);
  process.exit(1);
});
