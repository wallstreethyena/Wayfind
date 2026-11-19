#!/usr/bin/env node
// scripts/produce-clipp-evidence.mjs — Permitted Local Chrome Evidence Producer
// & Durable Snapshot Runner for Clipp Offers (C3 P1).
//
// Why this exists:
// clipp.com sits behind Akamai Bot Manager and returns HTTP 403 (`INCONCLUSIVE`)
// to every datacenter IP (Vercel Serverless, GitHub Actions, curl). We never
// use stealth scrapers or WAF bypasses. Instead, this script runs either:
//   1. Scheduled / manual local Google Chrome collection on the operator's Mac
//      (`--out <path>`), navigating the 39 registered Clipp URLs + 1 negative-control
//      404 URL in standard Google Chrome (never headless evasion), classifying live
//      DOM status, writing the evidence snapshot, updating the local durable store,
//      and optionally POSTing the structured evidence batch to `/api/cron/verify-offers`.
//   2. Non-writing scheduled-mode dry run (`CLIPP_PRODUCER_SCHEDULED=1 --dry-run`):
//      when `--fixture` is NOT passed, executes the real standard Google Chrome
//      producer against all 39 registered URLs + 1 negative-control 404 URL, writes
//      only to explicit temporary `--out` / `--store` paths (never mutating repo files),
//      and allows `--push` ONLY to a local loopback receiver (`127.0.0.1` / `localhost`).
//   3. Deterministic fixture dry-run (`--dry-run --fixture <path>`) or host readiness
//      check (`--check-host`) for fast verification without launching Chrome.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  CLIPP_MARKETS,
  CLIPP_MERCHANT_OFFERS,
  QUARANTINED_CLIPP_OFFERS,
  CLIPP_AUDIT_EXPIRY,
} from "../lib/clippOffers.js";
import { classifyClippLandingPage } from "../lib/commerceHealth.js";
import { runClippDurableSweep } from "../lib/clippDurableStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const NEGATIVE_CONTROL_TARGET = Object.freeze({
  offerId: "clipp-control-nonexistent-404",
  kind: "negative_control",
  merchant: "Nonexistent Control Deal",
  city: "Tampa",
  dest: "https://www.clipp.com/all-offers/nonexistent-deal-99999999",
  expectedDealId: "99999999",
});

const LOG_MAX_BYTES = 512 * 1024; // 512 KB per file (<= 1 MB total with .1 backup)

function parseArgs(argv) {
  const isScheduled = process.env.CLIPP_PRODUCER_SCHEDULED === "1";
  const args = {
    dryRun: false,
    checkHost: false,
    allowSnapshotIngest: false,
    fixture: "",
    out: "",
    outExplicit: false,
    store: "",
    storeExplicit: false,
    stateFile: "",
    lockFile: "",
    logFile: "",
    minIntervalHours: 0,
    pushUrl: "",
    mode: isScheduled ? "automated_chrome_producer" : "manual",
    source: isScheduled ? "scheduled_mac_chrome_producer" : "manual_mac_chrome_observation",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--check-host") args.checkHost = true;
    else if (a === "--allow-snapshot-ingest") args.allowSnapshotIngest = true;
    else if (a === "--fixture" && argv[i + 1]) args.fixture = path.resolve(argv[++i]);
    else if (a === "--out" && argv[i + 1]) {
      args.out = path.resolve(argv[++i]);
      args.outExplicit = true;
    } else if (a === "--store" && argv[i + 1]) {
      args.store = path.resolve(argv[++i]);
      args.storeExplicit = true;
    } else if (a === "--state-file" && argv[i + 1]) {
      args.stateFile = path.resolve(argv[++i]);
    } else if (a === "--lock-file" && argv[i + 1]) {
      args.lockFile = path.resolve(argv[++i]);
    } else if (a === "--log-file" && argv[i + 1]) {
      args.logFile = path.resolve(argv[++i]);
    } else if (a === "--min-interval-hours" && argv[i + 1]) {
      args.minIntervalHours = Math.max(0, Number(argv[++i]) || 0);
    } else if (a === "--push" && argv[i + 1]) {
      args.pushUrl = String(argv[++i]).trim();
    } else if (a === "--mode" && argv[i + 1]) {
      args.mode = String(argv[++i]).trim();
    }
  }
  if (!args.out) {
    args.out = args.dryRun
      ? path.join(os.tmpdir(), `wf-clipp-dryrun-evidence-${process.pid}.json`)
      : path.join(ROOT, "data", "clipp-browser-evidence.json");
  }
  return args;
}

function appendBoundedLog(logFile, entry) {
  if (!logFile) return;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    if (fs.existsSync(logFile)) {
      const st = fs.statSync(logFile);
      if (st.size >= LOG_MAX_BYTES) {
        try {
          fs.renameSync(logFile, `${logFile}.1`);
        } catch {}
      }
    }
    const line = `${new Date().toISOString()} ${typeof entry === "string" ? entry : JSON.stringify(entry)}\n`;
    fs.appendFileSync(logFile, line, "utf8");
  } catch {}
}

function isProcessAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (e) {
    return e && e.code === "EPERM";
  }
}

function acquirePidLock(lockFile) {
  if (!lockFile) return { acquired: true, release() {} };
  fs.mkdirSync(path.dirname(lockFile), { recursive: true });
  if (fs.existsSync(lockFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(lockFile, "utf8"));
      if (existing && existing.pid && existing.pid !== process.pid && isProcessAlive(existing.pid)) {
        return {
          acquired: false,
          holderPid: existing.pid,
          startedAt: existing.startedAt || null,
          release() {},
        };
      }
    } catch {}
    try {
      fs.unlinkSync(lockFile);
    } catch {}
  }
  const payload = JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() });
  fs.writeFileSync(lockFile, payload, { encoding: "utf8", flag: "w" });
  return {
    acquired: true,
    release() {
      try {
        if (fs.existsSync(lockFile)) {
          const cur = JSON.parse(fs.readFileSync(lockFile, "utf8"));
          if (!cur || cur.pid === process.pid) fs.unlinkSync(lockFile);
        }
      } catch {}
    },
  };
}

function resolveCronSecret() {
  if (process.env.CRON_SECRET && String(process.env.CRON_SECRET).trim()) {
    return { secret: String(process.env.CRON_SECRET).trim(), source: "env" };
  }
  if (process.platform === "darwin") {
    const service = "com.gowayfind.clipp-evidence-producer";
    const account = "CRON_SECRET";
    try {
      const out = execFileSync(
        "/usr/bin/security",
        ["find-generic-password", "-s", service, "-a", account, "-w"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      ).trim();
      if (out) return { secret: out, source: "macos_keychain" };
    } catch {}
  }
  return { secret: "", source: "none" };
}

function isLoopbackUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "::1" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

function allTargets({ includeNegativeControl = false } = {}) {
  const targets = [
    ...CLIPP_MARKETS.map((m) => ({
      offerId: m.offerId,
      kind: "market",
      merchant: "",
      city: m.city,
      dest: m.dest,
      expectedDealId: "",
    })),
    ...CLIPP_MERCHANT_OFFERS.map((m) => ({
      offerId: m.offerId,
      kind: "merchant",
      merchant: m.merchant,
      city: m.area,
      dest: m.dest,
      expectedDealId: (/-deal-(\d+)(?:[/?#]|$)/i.exec(m.dest) || [])[1] || "",
    })),
    ...QUARANTINED_CLIPP_OFFERS.map((m) => ({
      offerId: m.offerId,
      kind: "quarantined_merchant",
      merchant: m.merchant,
      city: m.area,
      dest: m.dest,
      expectedDealId: (/-deal-(\d+)(?:[/?#]|$)/i.exec(m.dest) || [])[1] || "",
    })),
  ];
  if (includeNegativeControl) targets.push(NEGATIVE_CONTROL_TARGET);
  return targets;
}

async function harvestWithStandardChrome({ mode = "manual", source = "manual_mac_chrome_observation" } = {}) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    channel: "chrome",
    headless: false,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 840 },
  });
  const page = await context.newPage();
  const observedAt = new Date().toISOString();
  const targets = allTargets({ includeNegativeControl: true });
  const results = [];
  let controlCheck = null;

  try {
    for (const t of targets) {
      let httpStatus = 0;
      let finalUrl = t.dest;
      let html = "";
      let title = "";
      try {
        const resp = await page.goto(t.dest, {
          waitUntil: "domcontentloaded",
          timeout: 25000,
        });
        await page.waitForTimeout(450);
        httpStatus = resp ? resp.status() : 0;
        finalUrl = page.url();
        title = await page.title();
        html = await page.content();
      } catch {
        httpStatus = 0;
      }

      const classification = classifyClippLandingPage({
        httpStatus,
        finalUrl,
        html,
        expectedDealId: t.expectedDealId,
        expectedMerchant: t.merchant || t.city,
        expectedCity: t.city,
      });

      const hasSoldOut =
        /\bTHIS\s+DEAL\s+IS\s+SOLD\s+OUT\b|\bSold\s+Out\s+for\s+Now\b|\bDeal\s+Sold\s+Out\b/i.test(
          html
        );
      const hasAlmostGone = /\bAlmost\s+Gone\b/i.test(html);
      const hasAddToCart = /\bAdd\s+to\s+Cart\b/i.test(html);
      const hasBuyNow = /\bBuy\s+Now\b/i.test(html);
      const priceMatch = /\$\s*(\d+(?:\.\d{1,2})?)\s+for\s+\$\s*(\d+(?:\.\d{1,2})?)/i.exec(html);

      const entry = {
        offerId: t.offerId,
        kind: t.kind,
        httpStatus,
        finalUrl,
        title,
        hasSoldOut,
        hasAlmostGone,
        hasAddToCart,
        hasBuyNow,
        livePriceDetected: priceMatch ? Number(priceMatch[1]) : null,
        classification,
        observedAt,
        verificationMode: mode,
        source,
      };

      if (t.kind === "negative_control") {
        controlCheck = {
          ...entry,
          passed: classification.status !== "ACTIVE" && classification.status !== "ALMOST_GONE",
        };
      } else {
        results.push(entry);
      }
    }
  } finally {
    await browser.close();
  }

  return {
    observedAt,
    source,
    verificationMode: mode,
    auditExpiry: CLIPP_AUDIT_EXPIRY,
    totalChecked: results.length,
    controlCheck,
    results,
  };
}

function checkHostReadiness(args) {
  const chromeAppPath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  const nodePath = process.execPath;
  const secretInfo = resolveCronSecret();
  return {
    ok: true,
    checkHost: true,
    nodeExecutable: nodePath,
    nodeExists: fs.existsSync(nodePath),
    chromeAppPath,
    chromeInstalled: fs.existsSync(chromeAppPath),
    scriptPath: fileURLToPath(import.meta.url),
    registeredTargets: allTargets({ includeNegativeControl: false }).length,
    negativeControlUrl: NEGATIVE_CONTROL_TARGET.dest,
    cronSecretConfigured: Boolean(secretInfo.secret),
    cronSecretSource: secretInfo.source,
    auditExpiry: CLIPP_AUDIT_EXPIRY,
    mode: args.mode,
    source: args.source,
  };
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.checkHost) {
    const status = checkHostReadiness(args);
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  const lock = acquirePidLock(args.lockFile);
  if (!lock.acquired) {
    const msg = {
      ok: true,
      skipped: true,
      reason: "already_running_pid_lock",
      holderPid: lock.holderPid,
      startedAt: lock.startedAt,
    };
    appendBoundedLog(args.logFile, msg);
    console.log(JSON.stringify(msg, null, 2));
    return;
  }

  try {
    if (!args.dryRun && args.minIntervalHours > 0 && args.stateFile && fs.existsSync(args.stateFile)) {
      try {
        const st = JSON.parse(fs.readFileSync(args.stateFile, "utf8"));
        const lastMs = Date.parse(st?.lastSuccessAt || "");
        const minMs = args.minIntervalHours * 3600 * 1000;
        if (Number.isFinite(lastMs) && Date.now() - lastMs < minMs) {
          const skipMsg = {
            ok: true,
            skipped: true,
            reason: "within_min_interval_window",
            lastSuccessAt: st.lastSuccessAt,
            minIntervalHours: args.minIntervalHours,
          };
          appendBoundedLog(args.logFile, skipMsg);
          console.log(JSON.stringify(skipMsg, null, 2));
          return;
        }
      } catch {}
    }

    let snapshotPath = args.fixture;
    let payload = null;

    if (args.fixture) {
      // Deterministic fixture mode: tag as fixture unless --allow-snapshot-ingest is explicitly set
      const raw = JSON.parse(fs.readFileSync(args.fixture, "utf8"));
      if (args.allowSnapshotIngest) {
        payload = raw;
      } else {
        const list = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
        const tmpFixture = path.join(os.tmpdir(), `wf-clipp-fixture-run-${process.pid}-${Date.now()}.json`);
        fs.writeFileSync(
          tmpFixture,
          JSON.stringify({
            observedAt: raw?.observedAt || new Date().toISOString(),
            verificationMode: args.dryRun ? "automated_fixture_dryrun" : "fixture",
            source: args.dryRun ? "fixture_dryrun" : "fixture",
            isFixture: !args.dryRun,
            results: list,
          }),
          "utf8"
        );
        snapshotPath = tmpFixture;
      }
    } else {
      // Real Google Chrome producer run (works in both normal and non-writing --dry-run mode)
      payload = await harvestWithStandardChrome({ mode: args.mode, source: args.source });
      if (!args.dryRun || args.outExplicit) {
        fs.mkdirSync(path.dirname(args.out), { recursive: true });
        fs.writeFileSync(args.out, JSON.stringify(payload, null, 2) + "\n", "utf8");
        snapshotPath = args.out;
      } else {
        fs.writeFileSync(args.out, JSON.stringify(payload, null, 2) + "\n", "utf8");
        snapshotPath = args.out;
      }
    }

    const tmpStore =
      args.storeExplicit && args.store
        ? args.store
        : args.dryRun
        ? path.join(os.tmpdir(), `wf-clipp-dryrun-store-${process.pid}.json`)
        : undefined;

    const sweep = await runClippDurableSweep({
      snapshotPath,
      storePath: tmpStore,
      verificationMode: args.mode,
    });

    if (args.dryRun && !args.storeExplicit && tmpStore && fs.existsSync(tmpStore)) {
      try {
        fs.unlinkSync(tmpStore);
      } catch {}
    }
    if (args.dryRun && !args.outExplicit && !args.fixture && snapshotPath && fs.existsSync(snapshotPath)) {
      try {
        fs.unlinkSync(snapshotPath);
      } catch {}
    }

    let pushResult = null;
    if (args.pushUrl) {
      if (args.dryRun && !isLoopbackUrl(args.pushUrl)) {
        pushResult = {
          pushed: false,
          blocked: true,
          reason: "dry_run_only_allows_loopback_push",
        };
      } else {
        const secretInfo = resolveCronSecret();
        const headers = { "Content-Type": "application/json" };
        if (secretInfo.secret) headers.Authorization = `Bearer ${secretInfo.secret}`;
        const bodyPayload =
          payload || (snapshotPath && fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, "utf8")) : {});
        const evidenceBatch = Array.isArray(bodyPayload) ? bodyPayload : bodyPayload.results || [];
        try {
          const res = await fetch(args.pushUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              verificationMode: args.mode,
              source: args.source,
              observedAt: bodyPayload?.observedAt || new Date().toISOString(),
              controlCheck: bodyPayload?.controlCheck || null,
              clippEvidence: evidenceBatch,
            }),
          });
          let responseBody = null;
          try {
            responseBody = await res.json();
          } catch {}
          pushResult = {
            pushed: res.ok,
            httpStatus: res.status,
            authSource: secretInfo.source,
            receipt: responseBody?.clipp?.receipt || responseBody?.receipt || null,
          };
        } catch (err) {
          pushResult = {
            pushed: false,
            httpStatus: 0,
            authSource: secretInfo.source,
            error: String((err && err.message) || err).slice(0, 200),
          };
        }
      }
    }

    if (!args.dryRun && args.stateFile && sweep.ok) {
      try {
        fs.mkdirSync(path.dirname(args.stateFile), { recursive: true });
        fs.writeFileSync(
          args.stateFile,
          JSON.stringify(
            {
              lastSuccessAt: payload?.observedAt || new Date().toISOString(),
              verificationMode: sweep.verificationMode,
              checked: sweep.checked,
              active: sweep.active,
              quarantined: sweep.quarantined,
              inconclusive: sweep.inconclusive,
            },
            null,
            2
          ) + "\n",
          "utf8"
        );
      } catch {}
    }

    const summary = {
      ok: sweep.ok,
      dryRun: args.dryRun,
      mode: sweep.mode,
      verificationMode: sweep.verificationMode,
      source: args.source,
      observedAt: payload?.observedAt || null,
      checked: sweep.checked,
      active: sweep.active,
      quarantined: sweep.quarantined,
      recovered: sweep.recovered,
      inconclusive: sweep.inconclusive,
      controlCheck: payload?.controlCheck || null,
      catalogue: sweep.catalogue,
      push: pushResult,
    };
    appendBoundedLog(args.logFile, summary);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    lock.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
