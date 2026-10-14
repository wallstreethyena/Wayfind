#!/usr/bin/env node
/**
 * scripts/check-no-product-review.mjs - NO_EXACT_AFFILIATE_PRODUCT must never
 * hold a past-due "no exact product" decision.
 *
 * Why: lib/eventTicketDeals.js lets a reviewed "no partner product" decision
 * suppress the affiliate-coverage leak alarm until its reviewBy. 2026-10-13:
 * every row had lapsed (09-30 .. 10-05) and nobody noticed until the nightly
 * job went red, so sellable events sat unmapped. This guard fails the BUILD
 * when a decision's reviewBy is earlier than the clock it is given.
 *
 * The clock is PASSED IN, never read from the wall time (a wall-clock guard
 * goes red on unchanged code and blocks deploys; see check-affiliate-coverage
 * FIXTURE_TODAY). Resolution order:
 *   --today=YYYY-MM-DD  |  the newest reviewedAt
 *   in the registry (the date the registry itself claims to have been reviewed
 *   through, so a row left behind by a later review pass fails).
 * Run it nightly with --today=$(date +%F) for the true wall-clock check.
 */
import { NO_EXACT_AFFILIATE_PRODUCT, staleNoProductDecisions } from "../lib/eventTicketDeals.js";

let failed = 0;
const ok = (c, m) => { if (c) console.log("  ok  " + m); else { failed++; console.error("FAIL  " + m); } };
const arg = process.argv.find((a) => a.startsWith("--today="));
const rows = Object.entries(NO_EXACT_AFFILIATE_PRODUCT);
const newest = rows.map(([, r]) => r.reviewedAt).sort().pop();
const clock = (arg && arg.slice(8)) || newest;
ok(/^\d{4}-\d{2}-\d{2}$/.test(String(clock)), `clock is a date (${clock})`);

for (const [id, r] of rows) {
  const days = (Date.parse(r.reviewBy + "T00:00:00Z") - Date.parse(r.reviewedAt + "T00:00:00Z")) / 86400000;
  ok(days >= 0 && days <= 14, `${id}: reviewBy is within 14 days of reviewedAt (${days}d)`);
  ok(typeof r.reason === "string" && r.reason.length >= 20, `${id}: carries an auditable reason`);
}
const stale = staleNoProductDecisions(clock);
ok(stale.length === 0, stale.length ? `past-due no-exact-product decision(s) at ${clock}: ` + stale.map((x) => `${x.eventId} (reviewBy ${x.reviewBy})`).join(", ") : `no past-due decision at clock ${clock}`);

// the predicate itself, executed (proves the guard can go red)
const fx = { a: { reviewedAt: "2026-10-01", reviewBy: "2026-10-05", reason: "x".repeat(20) }, b: { reviewedAt: "2026-10-01", reviewBy: "2026-10-05", eventEndsOn: "2026-10-03", reason: "x".repeat(20) } };
ok(staleNoProductDecisions("2026-10-06", fx).map((x) => x.eventId).join() === "a", "a past-due decision is flagged; one whose event already ended is not");
ok(staleNoProductDecisions("2026-10-05", fx).length === 0, "a decision is current ON its reviewBy day");

if (failed) { console.error(`\ncheck-no-product-review: ${failed} failure(s)`); process.exit(1); }
console.log("\ncheck-no-product-review: OK");
