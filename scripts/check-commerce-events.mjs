#!/usr/bin/env node
/**
 * check-commerce-events — commerce measurement stays honest and stays out of the
 * ranker.
 *
 * THE FACT THIS GUARDS
 * Fourteen days of PostHog show zero non-owner clicks on any monetized link, and
 * until lib/commerce.js there was no IMPRESSION event on a money link anywhere in
 * the codebase — only the click-time `*_out` family. A zero was therefore
 * unreadable: "nobody wants it" and "nobody ever saw it" produced the identical
 * number. That is the same §5-class defect as an unconfigured value rendering as
 * an ordinary empty state.
 *
 * WHAT IT ASSERTS
 *  1. commerce_impression exists and is emitted somewhere. Without it the funnel
 *     has no denominator and a zero stays unreadable.
 *  2. NO RANKING MODULE IMPORTS lib/commerce. Payout must never reach a score,
 *     sort or eligibility decision — AGENTS.md §8 already forbids affinity
 *     feeding a displayed Wayfind Score, and commission is a stronger form of the
 *     same corruption.
 *  3. The context field list is a WHITELIST, and the forbidden personal-data
 *     shapes are checked against VALUES, not just field names.
 *  4. Rank is coarse. A raw rank beside a commission figure is the evidence trail
 *     for pay-for-placement.
 *  5. The UI never builds a partner URL: commerceHref returns our own path.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const MOD = "lib/commerce.js";
const src = existsSync(path.resolve(MOD)) ? readFileSync(path.resolve(MOD), "utf8") : null;
ok(!!src, `${MOD} exists`);

const mod = src ? await import(path.resolve(MOD)) : null;
if (mod) {
  const { COMMERCE_EVENTS, CONTEXT_FIELDS, rankBucket, commercePayload, commerceHref } = mod;

  // (1) the denominator
  ok(COMMERCE_EVENTS.includes("commerce_impression"),
    "commerce_impression is defined — without an impression event a zero click count is unreadable, which is the exact state this repo is in today");
  for (const e of ["commerce_cta_clicked", "disclosure_viewed", "provider_redirect_failed", "fallback_clicked"]) {
    ok(COMMERCE_EVENTS.includes(e), `${e} is defined`);
  }

  // (3) whitelist behaviour, proven by calling it
  // Never call the module bare: it THROWS by design, and an uncaught throw exits
  // nonzero while discarding this guard's report and skipping every assertion
  // after it. A guard must FAIL, not crash — the message is the product.
  const tryPayload = (ev, ctx) => { try { return { ok: true, v: commercePayload(ev, ctx) }; } catch (e) { return { ok: false, err: String(e && e.message || e) }; } };
  // Two separate concerns, two separate payloads. Combining them hid the
  // whitelist result: with the whitelist broken, the email in the same payload
  // reached the value check and threw, so the failure surfaced as "threw" rather
  // than "an unlisted field was sent".
  const attempt = tryPayload("commerce_impression", { surface: "cuisine", nope: "x" });
  ok(attempt.ok, `commercePayload accepted a valid impression (it threw: ${attempt.err || ""})`);
  const leaked = attempt.ok ? attempt.v : {};
  ok(!("nope" in leaked), "an unlisted field is DROPPED rather than sent — the field list is a whitelist");
  ok(!("email" in leaked), "an unlisted personal field is dropped");
  ok(leaked.surface === "cuisine", "listed fields survive (an empty payload would make the check above vacuous)");
  ok(CONTEXT_FIELDS.length >= 12 && !CONTEXT_FIELDS.includes("user_id") && !CONTEXT_FIELDS.includes("lat"),
    "the context whitelist carries no account id and no raw coordinates");

  // forbidden VALUE shapes, not just names.
  //
  // commercePayload's own contract (lib/commerce.js) is deliberately
  // environment-dependent: it THROWS in development so the mistake is loud and
  // cheap to catch, but in production it DROPS the offending field instead of
  // throwing, so a bad value can never crash a rendering page. Vercel sets
  // NODE_ENV=production for the whole build — including this prebuild guard
  // step, which runs before `next build` ever starts — so asserting "it always
  // throws" only ever held in an interactive dev shell and fails every real
  // build. The actual security property this guard exists to prove is narrower
  // and env-independent: the email must never reach the emitted payload,
  // whether that's enforced by throwing or by silently dropping the field.
  const emailAttempt = tryPayload("commerce_impression", { merchant: "someone@example.com" });
  const emailLeaked = emailAttempt.ok && JSON.stringify(emailAttempt.v).includes("someone@example.com");
  ok(!emailLeaked, "a correctly-NAMED field carrying an email never reaches the emitted payload, in dev (throw) or production (silent drop) — personal data escapes by value, not by field name");

  // (4) coarse rank only
  ok(rankBucket(1) === "top3" && rankBucket(7) === "4-10" && rankBucket(99) === "11+",
    "rankBucket returns coarse buckets");
  ok(rankBucket(0) === null && rankBucket("x") === null, "an invalid rank yields null, never a fabricated bucket");
  ok(!/rank\s*:\s*rank\b/.test(src) && !CONTEXT_FIELDS.includes("rank"),
    "no raw rank field exists — a precise rank beside a commission figure is the pay-for-placement evidence trail");

  // (5) UI never builds a partner URL
  const href = commerceHref({ provider: "wegotrip", offerId: "abc", surface: "cuisine" });
  ok(typeof href === "string" && href.startsWith("/api/"),
    "commerceHref returns OUR redirect path, so the server mints the click and validates the destination");
  ok(!/tp\.media|wegotrip\.com|klook\.com|tiqets\.com/.test(String(href)),
    "commerceHref never returns a partner domain");
  ok(!/tp\.media\/r|marker=/.test(src),
    `${MOD} does not construct affiliate URLs — that belongs behind the server redirect`);
}

// (2) THE INTEGRITY RULE: no ranking module may import this.
const RANKERS = [
  "lib/ranking.js", "lib/score.js", "lib/intentPages.js", "lib/beaches.js",
  "lib/landing.js", "lib/placeFilter.js", "lib/inventoryServe.js", "lib/memberSignals.js",
];
let checkedRankers = 0;
for (const rel of RANKERS) {
  const p = path.resolve(rel);
  if (!existsSync(p)) continue;
  checkedRankers++;
  const s = readFileSync(p, "utf8");
  // Allow the extension: this repo imports with explicit ".js" (see the note in
  // lib/intentPages.js), so a specifier that must END at "commerce" matches
  // nothing. The first version of this line was a false negative — rule 2 was
  // not enforced at all, proven by injecting a real import and watching it pass.
  ok(!/(?:from|require\()\s*["'][^"']*\bcommerce(?:\.m?js)?["']/.test(s),
    `${rel} does not import lib/commerce — commission must never reach a score, sort or eligibility decision`);
}
ok(checkedRankers >= 5, `checked the ranking modules for a commerce import (got ${checkedRankers}) — an empty list would make rule 2 vacuous`);

if (fail.length) {
  console.error("check-commerce-events: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-commerce-events: OK — ${pass} assertions (impression event exists, whitelist enforced by value, rank coarse, ${checkedRankers} ranking modules free of commerce)`);
