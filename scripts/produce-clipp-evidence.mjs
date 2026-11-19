#!/usr/bin/env node
// scripts/produce-clipp-evidence.mjs — Permitted Clipp Evidence Producer (C3).
//
// WHY THIS TOOL EXISTS:
// clipp.com sits behind Akamai WAF and returns HTTP 403 (`INCONCLUSIVE`) to
// unauthenticated datacenter/serverless fetchers. Wayfind NEVER uses stealth
// scrapers, fingerprint spoofing, or WAF bypasses. Instead:
//   - Locally (or via `ops/launchd/com.gowayfind.clipp-evidence-producer.plist`),
//     this operator/producer tool opens standard Mac Chrome (`channel: "chrome"`),
//     reads the 40 registered Clipp pages + 1 nonexistent 404 control page politely,
//     classifies each page with `classifyClippLandingPage`, and outputs a structured
//     JSON evidence snapshot.
//   - Optionally ingests the evidence into a durable store (`--store <path>`) or
//     pushes it to `POST /api/cron/verify-offers` (`--push <url>`) using `CRON_SECRET`
//     (never logging any secret).
//
// USAGE:
//   node scripts/produce-clipp-evidence.mjs --dry-run
//   node scripts/produce-clipp-evidence.mjs --dry-run --fixture <snapshot.json>
//   node scripts/produce-clipp-evidence.mjs --out /tmp/clipp-evidence.json
//   node scripts/produce-clipp-evidence.mjs --fixture <snapshot.json> --store /tmp/clipp-store.json
//   node scripts/produce-clipp-evidence.mjs --out /tmp/clipp-evidence.json --push https://www.gowayfind.com/api/cron/verify-offers

import fs from "node:fs";
import path from "node:path";
import { classifyClippLandingPage } from "../lib/commerceHealth.js";
import {
  CLIPP_MARKETS,
  CLIPP_MERCHANT_OFFERS,
  QUARANTINED_CLIPP_OFFERS,
  CLIPP_AUDIT_EXPIRY,
  CLIPP_LAST_MANUAL_AUDIT_AT,
} from "../lib/clippOffers.js";
import {
  produceClippOfferEvidence,
  runClippDurableSweep,
} from "../lib/clippDurableStore.js";

function parseArgs(argv) {
  const opts = {
    dryRun: false,
    fixture: null,
    out: null,
    store: null,
    push: null,
    mode:
      process.env.CLIPP_PRODUCER_SCHEDULED === "1"
        ? "automated_chrome_producer"
        : "manual",
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--fixture" && argv[i + 1]) opts.fixture = argv[++i];
    else if (a === "--out" && argv[i + 1]) opts.out = argv[++i];
    else if (a === "--store" && argv[i + 1]) opts.store = argv[++i];
    else if (a === "--push" && argv[i + 1]) opts.push = argv[++i];
    else if (a === "--mode" && argv[i + 1]) opts.mode = argv[++i];
  }
  return opts;
}

function dealIdFromDest(dest) {
  const m = /-deal-(\d+)(?:[/?#]|$)/i.exec(String(dest || ""));
  return m ? m[1] : "";
}

function parseStoredPrices(title) {
  const m1 = /\$\s*(\d+(?:\.\d{1,2})?)\s+for\s+\$\s*(\d+(?:\.\d{1,2})?)/i.exec(
    String(title || "")
  );
  if (m1) return { storedBuyPrice: Number(m1[1]), storedFaceValue: Number(m1[2]) };
  const m2 =
    /\$\s*(\d+(?:\.\d{1,2})?)\s+.*?\(reg\.\s*\$\s*(\d+(?:\.\d{1,2})?)\)/i.exec(
      String(title || "")
    );
  if (m2) return { storedBuyPrice: Number(m2[1]), storedFaceValue: Number(m2[2]) };
  return { storedBuyPrice: null, storedFaceValue: null };
}

async function harvestWithStandardChrome(verificationMode) {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  const targets = [
    ...CLIPP_MARKETS.map((m) => ({
      offerId: m.offerId,
      kind: "market",
      label: m.city,
      area: m.area,
      dest: m.dest,
      title: m.verified?.title || m.city,
    })),
    ...CLIPP_MERCHANT_OFFERS.map((m) => ({
      offerId: m.offerId,
      kind: "merchant",
      label: m.merchant,
      area: m.area,
      dest: m.dest,
      title: m.title,
    })),
    ...QUARANTINED_CLIPP_OFFERS.map((m) => ({
      offerId: m.offerId,
      kind: "quarantined",
      label: m.merchant,
      area: m.area,
      dest: m.dest,
      title: m.title,
    })),
  ];

  const results = [];
  try {
    for (const t of targets) {
      let httpStatus = 0;
      let finalUrl = t.dest;
      let html = "";
      let pageTitle = "";
      try {
        const resp = await page.goto(t.dest, {
          waitUntil: "domcontentloaded",
          timeout: 18000,
        });
        await page.waitForTimeout(450);
        httpStatus = resp ? resp.status() : 0;
        finalUrl = page.url();
        html = await page.content();
        pageTitle = await page.title();
      } catch (e) {
        httpStatus = 0;
      }

      const prices = parseStoredPrices(t.title);
      const classification = classifyClippLandingPage({
        httpStatus,
        finalUrl,
        html,
        expectedDealId: dealIdFromDest(t.dest),
        expectedMerchant: t.label,
        expectedCity: t.area || t.label,
        storedBuyPrice: prices.storedBuyPrice,
        storedFaceValue: prices.storedFaceValue,
      });

      results.push({
        offerId: t.offerId,
        kind: t.kind,
        label: t.label,
        dest: t.dest,
        finalUrl,
        httpStatus,
        title: pageTitle,
        hasAddToCart: /Add\s+to\s+Cart/i.test(html),
        hasBuyNow: /Buy\s+Now/i.test(html),
        hasSoldOut:
          /THIS\s+DEAL\s+IS\s+SOLD\s+OUT|Sold\s+Out\s+for\s+Now|Deal\s+Sold\s+Out/i.test(
            html
          ),
        hasAlmostGone: /\bAlmost\s+Gone\b/i.test(html),
        classification,
        verificationMode,
        observedAt: new Date().toISOString(),
      });
    }
  } finally {
    await browser.close();
  }

  return {
    observedAt: new Date().toISOString(),
    source:
      verificationMode === "manual"
        ? "manual_mac_chrome_observation"
        : "scheduled_mac_chrome_producer",
    verificationMode,
    count: results.length,
    results,
  };
}

const args = parseArgs(process.argv);

if (args.dryRun && !args.fixture) {
  console.log(
    JSON.stringify({
      ok: true,
      dryRun: true,
      verificationMode: args.mode,
      registeredMarkets: CLIPP_MARKETS.length,
      registeredMerchants: CLIPP_MERCHANT_OFFERS.length,
      quarantinedMerchants: QUARANTINED_CLIPP_OFFERS.length,
      auditExpiry: CLIPP_AUDIT_EXPIRY,
      lastManualAuditAt: CLIPP_LAST_MANUAL_AUDIT_AT,
    })
  );
  process.exit(0);
}

let produced;
if (args.fixture) {
  produced = await produceClippOfferEvidence({
    snapshotPath: path.resolve(args.fixture),
  });
} else {
  const snapshot = await harvestWithStandardChrome(args.mode);
  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), "utf8");
  }
  produced = {
    ok: true,
    mode: "chrome_producer",
    verificationMode: snapshot.verificationMode,
    observedAt: snapshot.observedAt,
    items: snapshot.results,
  };
}

if (args.out && args.fixture) {
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(produced, null, 2), "utf8");
}

let sweepSummary = null;
if (args.store || !args.dryRun) {
  sweepSummary = await runClippDurableSweep({
    evidenceBatch: produced.items,
    verificationMode: produced.verificationMode || args.mode,
    storePath: args.store ? path.resolve(args.store) : undefined,
  });
}

if (args.push && !args.dryRun) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) {
    console.error("produce-clipp-evidence: CRON_SECRET is required for --push");
    process.exit(1);
  }
  const resp = await fetch(args.push, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({
      verificationMode: produced.verificationMode || args.mode,
      clippEvidence: produced.items,
    }),
  });
  if (!resp.ok) {
    console.error(`produce-clipp-evidence: --push returned HTTP ${resp.status}`);
    process.exit(1);
  }
}

console.log(
  JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    mode: produced.mode,
    verificationMode: produced.verificationMode || args.mode,
    itemCount: Array.isArray(produced.items) ? produced.items.length : 0,
    ...(sweepSummary
      ? {
          checked: sweepSummary.checked,
          active: sweepSummary.active,
          quarantined: sweepSummary.quarantined,
          recovered: sweepSummary.recovered,
          inconclusive: sweepSummary.inconclusive,
        }
      : {}),
  })
);
