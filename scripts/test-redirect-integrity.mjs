#!/usr/bin/env node
// scripts/test-redirect-integrity.mjs — every paid click lands attributed,
// and a Book click never 302s to searchResults / bare viator.com.
//
// 2026-08-16: missing-query dumped users on the unattributed homepage.
// 2026-08-25: Book resolve now fails closed to our own site. Honest Search
// Viator is an explicit intent=search. ASSERT ON THE CALL.
process.env.WF_SUPPRESS_ANALYTICS = "1";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chooseViatorGoLocation } from "../lib/viatorIntegrity.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (p) => readFileSync(path.join(REPO, p), "utf8");

let pass = 0;
const fail = (m) => { console.error("test-redirect-integrity: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

// ── 1. CALL: Book location is never search / homepage ────────────────────
{
  const miss = chooseViatorGoLocation({ siteFallback: "/" });
  ok(miss.ok === false && miss.location === "/",
    "Book with no product fails closed to our own site");
  ok(miss.resolver_path === "fail-closed",
    "the miss reports resolver_path=fail-closed");
  ok(!/viator\.com/i.test(miss.location),
    "the miss does not dump users on viator.com");

  const search = chooseViatorGoLocation({
    intent: "search",
    searchUrl: () => "https://www.viator.com/searchResults/all?text=kayak&pid=P1&mcid=42383&medium=link",
    siteFallback: "/",
  });
  ok(search.ok === true && /searchResults/.test(search.location) && /pid=/.test(search.location),
    "honest Search Viator still lands on an attributed search page");

  const product = chooseViatorGoLocation({
    resolvedProductUrl: "https://www.viator.com/tours/St-Petersburg/Clear-Kayak/d5403-173028P1",
    siteFallback: "/",
  });
  ok(product.ok === true && /d5403-173028P1/.test(product.location),
    "a verified product still redirects to that product");
}

// ── 2. Route source: Book path uses the chooser; no leftover homepage dump
{
  const viator = read("app/api/viator/go/route.js");
  ok(/chooseViatorGoLocation/.test(viator),
    "the viator go route calls the shared Book-location chooser");
  ok(!/failAndRedirect\(\s*"missing-query",\s*"https:\/\/www\.viator\.com"\s*\)/.test(viator),
    "the missing-query path no longer dumps users on the bare unattributed viator.com homepage");

  const eats = read("app/api/eats/go/route.js");
  ok(/resolver_path:\s*store\s*\?\s*"store"\s*:\s*"search-fallback"/.test(eats),
    "the eats redirect reports store vs search-fallback instead of counting an attributed fallback as a failure");
  ok(!/provider_redirect_failed",\s*\{\s*failure_reason:\s*"store-unresolved"/.test(eats),
    "store-unresolved is no longer reported as a hard failure — the user still lands attributed");
}

// ── 3. resolver_path flows through the commerce schema ───────────────────
{
  const { commercePayload } = await import("../lib/commerce.js");
  const started = commercePayload("provider_redirect_started", { provider: "uber_eats", click_id: "wf-abc12345", resolver_path: "search-fallback" });
  ok(started.resolver_path === "search-fallback", "provider_redirect_started carries resolver_path");
  const failed = commercePayload("provider_redirect_failed", { provider: "viator", failure_reason: "missing-query", resolver_path: "fail-closed" });
  ok(failed.resolver_path === "fail-closed" && failed.failure_reason === "missing-query",
    "provider_redirect_failed carries both failure_reason and the fail-closed rung");
  const clicked = commercePayload("commerce_cta_clicked", { provider: "viator", click_id: "wf-abc12345", resolver_path: "search-fallback" });
  ok(!("resolver_path" in clicked), "resolver_path stays OFF non-redirect events — the whitelist does not widen by accident");
}

console.log(`test-redirect-integrity: OK — ${pass} assertions`);
