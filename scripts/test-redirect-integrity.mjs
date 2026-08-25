#!/usr/bin/env node
// scripts/test-redirect-integrity.mjs — every paid click lands attributed.
//
// The week of 2026-08-16, 29 of 62 provider redirects were reported failed, and
// the missing-query path in /api/viator/go 302'd real users to the BARE
// viator.com homepage — a click already paid for, handed to the partner with no
// attribution. This locks the two properties that fix demanded:
//   1. No redirect route ships a bare, unattributed viator.com Location.
//   2. resolver_path flows through the commerce schema on redirect events (and
//      ONLY redirect events), so degraded-but-attributed outcomes are
//      measurable separately from hard failures.
// This test imports lib/commerce.js, which can reach captureServer. Guards run
// in dev machines and CI — never let a schema unit test write real analytics.
process.env.WF_SUPPRESS_ANALYTICS = "1";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(REPO, p), "utf8");

let pass = 0;
const fail = (m) => { console.error("test-redirect-integrity: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── 1. Source properties of the redirect routes ──────────────────────────────
{
  const viator = read("app/api/viator/go/route.js");
  ok(!/failAndRedirect\(\s*"missing-query",\s*"https:\/\/www\.viator\.com"\s*\)/.test(viator),
    "the missing-query path no longer dumps users on the bare unattributed viator.com homepage");
  ok(/city-search-fallback/.test(viator) && /homepage-fallback/.test(viator),
    "missing-query degrades through named, attributed rungs (city search, then pid-carrying homepage)");
  ok(/resolver_path:\s*resolved\s*\?\s*"product"\s*:\s*"search-fallback"/.test(viator),
    "the main viator redirect reports which rung it took");

  const eats = read("app/api/eats/go/route.js");
  ok(/resolver_path:\s*store\s*\?\s*"store"\s*:\s*"search-fallback"/.test(eats),
    "the eats redirect reports store vs search-fallback instead of counting an attributed fallback as a failure");
  ok(!/provider_redirect_failed",\s*\{\s*failure_reason:\s*"store-unresolved"/.test(eats),
    "store-unresolved is no longer reported as a hard failure — the user still lands attributed");
}

// ── 2. resolver_path flows through the commerce schema ───────────────────────
{
  const { commercePayload } = await import("../lib/commerce.js");
  const started = commercePayload("provider_redirect_started", { provider: "uber_eats", click_id: "wf-abc12345", resolver_path: "search-fallback" });
  ok(started.resolver_path === "search-fallback", "provider_redirect_started carries resolver_path");
  const failed = commercePayload("provider_redirect_failed", { provider: "viator", failure_reason: "missing-query", resolver_path: "city-search-fallback" });
  ok(failed.resolver_path === "city-search-fallback" && failed.failure_reason === "missing-query",
    "provider_redirect_failed carries both failure_reason and the fallback rung taken");
  const clicked = commercePayload("commerce_cta_clicked", { provider: "viator", click_id: "wf-abc12345", resolver_path: "search-fallback" });
  ok(!("resolver_path" in clicked), "resolver_path stays OFF non-redirect events — the whitelist does not widen by accident");
}

console.log(`test-redirect-integrity: OK — ${pass} assertions`);
