#!/usr/bin/env node
/**
 * scripts/test-google-daily-quota-breaker.mjs
 *
 * A Google Place Details PER-DAY 429 is deterministic until midnight Pacific.
 * 2026-11-03 audit: inventory-refresh (hourly) held the generic 30 minute
 * breaker, so each later run called Google once more to rediscover the 429, and
 * promote-index (every 5 minutes) claimed rows, probed Google and parked them.
 *
 * Proves, by EXECUTING lib/providerHealth.js and reading the two crons with
 * comments stripped:
 *   1. breakerCooldownMs holds a per-day quota 429 until the Pacific reset
 *      (>30 min mid-day, never longer than 24h+10m), and leaves every other
 *      failure (per-minute 429, billing, 5xx) on the default cooldown.
 *   2. the shared GOOGLE_DETAILS_DAILY_BREAKER round-trips through trip/open.
 *   3. promote-index checks that breaker BEFORE wf_promotion_claim and trips it
 *      on quota_daily; inventory-refresh checks it BEFORE its row select and
 *      trips both breakers with the computed cooldown.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ph = await import(pathToFileURL(path.join(ROOT, "lib/providerHealth.js")).href);
const { breakerCooldownMs, BREAKER_COOLDOWN_MS } = ph;
const DAYBODY = "Quota exceeded for quota metric 'GetPlaceRequest' and limit 'GetPlaceRequest per day'";

// 1. cooldown semantics. 2026-11-03T20:00Z = 12:00 Pacific (PST) -> 12h + 10m buffer.
const noon = Date.parse("2026-11-03T20:00:00Z");
assert.equal(breakerCooldownMs("quota", 429, DAYBODY, noon), (12 * 60 + 10) * 60000, "per-day quota holds to the Pacific reset + 10m");
assert.ok(breakerCooldownMs("quota", 429, DAYBODY, noon) > BREAKER_COOLDOWN_MS, "longer than the generic cooldown");
for (const t of [Date.parse("2026-11-03T08:05:00Z"), Date.parse("2026-11-04T07:59:00Z")]) {
  const ms = breakerCooldownMs("quota", 429, DAYBODY, t);
  assert.ok(ms > 0 && ms <= (24 * 60 + 10) * 60000, "cooldown stays inside one Pacific day + buffer");
}
assert.equal(breakerCooldownMs("quota", 429, "Quota exceeded per minute", noon), BREAKER_COOLDOWN_MS, "per-minute 429 stays on the default");
assert.equal(breakerCooldownMs("billing", 402, "per day", noon), BREAKER_COOLDOWN_MS, "billing stays on the default");
assert.equal(breakerCooldownMs(null, 500, DAYBODY, noon), BREAKER_COOLDOWN_MS, "5xx stays on the default");
const nearReset = Date.parse("2026-11-04T07:40:00Z");
const nearResetCooldown = breakerCooldownMs("quota", 429, DAYBODY, nearReset);
assert.equal(nearResetCooldown, BREAKER_COOLDOWN_MS, "a real daily quota can have exactly the generic cooldown");

// 2. The fixture cannot inherit credentials from a build or operator shell.
// Only the child's in-memory cache is reachable; never production's breaker.
execFileSync(process.execPath, ["--input-type=module", "-e", `
import assert from "node:assert/strict";
import { GOOGLE_DETAILS_DAILY_BREAKER, tripBreaker, breakerOpen, resetBreaker } from ${JSON.stringify(pathToFileURL(path.join(ROOT, "lib/providerHealth.js")).href)};
assert.equal(await breakerOpen(GOOGLE_DETAILS_DAILY_BREAKER), null, "starts closed");
assert.equal(await tripBreaker(GOOGLE_DETAILS_DAILY_BREAKER, "quota", "google 429 per day", 60000), true);
const open = await breakerOpen(GOOGLE_DETAILS_DAILY_BREAKER);
assert.ok(open && open.kind === "quota", "open after trip");
await resetBreaker(GOOGLE_DETAILS_DAILY_BREAKER);
assert.equal(await breakerOpen(GOOGLE_DETAILS_DAILY_BREAKER), null, "closed after reset");
`], { env: { NODE_ENV: "test" }, encoding: "utf8", timeout: 30000 });

// 3. wiring order in the crons.
const promote = strip(read("app/api/cron/promote-index/route.js"));
const iBreaker = promote.search(/const dailyOpen = await breakerOpen\(GOOGLE_DETAILS_DAILY_BREAKER\);\s*if \(dailyOpen\) \{/);
const iClaim = promote.indexOf('rpc(s, "wf_promotion_claim"');
assert.ok(iBreaker > 0 && iClaim > 0 && iBreaker < iClaim, "promote-index checks the daily breaker before it claims rows");
assert.match(promote, /quotaKind === "quota_daily"\)\s*await tripBreaker\(GOOGLE_DETAILS_DAILY_BREAKER/, "promote-index trips the daily breaker on quota_daily");

const refresh = strip(read("app/api/cron/inventory-refresh/route.js"));
const rBreaker = refresh.indexOf("breakerOpen(GOOGLE_DETAILS_DAILY_BREAKER)");
const rSelect = refresh.indexOf('.from("wf_inventory")');
assert.ok(rBreaker > 0 && rSelect > 0 && rBreaker < rSelect, "inventory-refresh checks the daily breaker before its row select");
assert.match(refresh, /breakerCooldownMs\(kind, res\.status, res\.body\)/, "inventory-refresh computes the cooldown from the failure");
assert.match(refresh, /tripBreaker\(BREAKER, kind, "google " \+ res\.status, cool\)/, "inventory-refresh holds its own breaker for the computed cooldown");
assert.match(refresh, /tripBreaker\(GOOGLE_DETAILS_DAILY_BREAKER/, "inventory-refresh trips the shared daily breaker");
const tripCondition = refresh.match(/if \(([^\n]+)\) await tripBreaker\(GOOGLE_DETAILS_DAILY_BREAKER/);
assert.ok(tripCondition, "inventory-refresh's shared-breaker condition is identifiable");
const shouldShare = new Function("kind", "res", "cool", "BREAKER_COOLDOWN_MS", `return (${tripCondition[1]});`);
assert.equal(shouldShare("quota", { status: 429, body: DAYBODY }, nearResetCooldown, BREAKER_COOLDOWN_MS), true,
  "a daily quota still trips the shared breaker when its cooldown equals 30 minutes");
assert.equal(shouldShare("quota", { status: 429, body: "Quota exceeded per minute" }, BREAKER_COOLDOWN_MS, BREAKER_COOLDOWN_MS), false,
  "a per-minute quota does not trip the shared daily breaker");

console.log("test-google-daily-quota-breaker: ok (cooldown semantics executed; shared breaker round-trip; 2 crons check it before any claim/select)");
