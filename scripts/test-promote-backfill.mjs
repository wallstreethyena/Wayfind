// scripts/test-promote-backfill.mjs
//
// Locks the cheap in-box enqueue: OFF by default, budget-gated, no Google,
// no new geo boxes. Also locks that identity-pool / inventory shaping reuses
// existing type signals (empty google_types[] + primary_type) and that the
// homepage rail path does not grow a Place Details call.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  planBackfillEnqueue, backfillSwitchOn,
  PROMOTE_BACKFILL_ENV, PROMOTE_BACKFILL_LIMIT_ENV, PROMOTE_BACKFILL_MAX_USD_ENV,
  PROMOTE_BACKFILL_ON, PROMOTE_BACKFILL_RPC,
} from "../lib/promoteEnqueue.js";
import { PROMOTE_METROS } from "../lib/promoteIndex.js";
import { existingTypeSignals } from "../lib/placeCategory.js";
import { isBreakfastPlace } from "../lib/breakfast.js";
import { isFamilyPlace } from "../lib/familyPlace.js";
import { isStrongTicketedVenue } from "../lib/eventVenue.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(ROOT, rel), "utf8");
let fail = 0, pass = 0;
const ok = (c, m) => { if (!c) { console.error("  FAIL: " + m); fail++; } else pass++; };

// ── 1. kill-switch defaults OFF ─────────────────────────────────────────────
ok(backfillSwitchOn({}) === false, "empty env is off");
ok(backfillSwitchOn({ [PROMOTE_BACKFILL_ENV]: "" }) === false, "empty string is off");
ok(backfillSwitchOn({ [PROMOTE_BACKFILL_ENV]: "1" }) === false, "\"1\" is off — only exact \"on\"");
ok(backfillSwitchOn({ [PROMOTE_BACKFILL_ENV]: "true" }) === false, "\"true\" is off — only exact \"on\"");
ok(backfillSwitchOn({ [PROMOTE_BACKFILL_ENV]: "yes" }) === false, "\"yes\" is off — only exact \"on\"");
ok(backfillSwitchOn({ [PROMOTE_BACKFILL_ENV]: "ON" }) === false, "\"ON\" is off — case-sensitive");
ok(backfillSwitchOn({ [PROMOTE_BACKFILL_ENV]: PROMOTE_BACKFILL_ON }) === true, "exact \"on\" is the only on");

const off = planBackfillEnqueue({});
ok(off.enabled === false && off.willEnqueue === 0, "default plan enqueues nothing");
ok(off.envName === PROMOTE_BACKFILL_ENV, "plan names the kill-switch");
ok(/off \(default\)/.test(off.reason), "off reason names the default");

const onNoLimit = planBackfillEnqueue({ [PROMOTE_BACKFILL_ENV]: PROMOTE_BACKFILL_ON });
ok(onNoLimit.enabled === true && onNoLimit.willEnqueue === 0, "on without a limit still enqueues 0");

const onLimited = planBackfillEnqueue({
  [PROMOTE_BACKFILL_ENV]: PROMOTE_BACKFILL_ON,
  [PROMOTE_BACKFILL_LIMIT_ENV]: "50",
});
ok(onLimited.willEnqueue === 50, "on + limit 50 → willEnqueue 50");
ok(onLimited.estimateUSD === 0.85, "50 × $0.017 = $0.85 committed Details if the worker later drains");

const spendCapped = planBackfillEnqueue({
  [PROMOTE_BACKFILL_ENV]: PROMOTE_BACKFILL_ON,
  [PROMOTE_BACKFILL_LIMIT_ENV]: "500",
  [PROMOTE_BACKFILL_MAX_USD_ENV]: "0.17",
});
ok(spendCapped.willEnqueue === 10, "spend cap $0.17 → floor(0.17/0.017)=10");
ok(spendCapped.estimateUSD <= 0.17, "estimate never exceeds the spend cap");

// Prove the default-off check can fail: a live switch MUST produce a positive.
ok(onLimited.willEnqueue > off.willEnqueue, "self-test: on+limit is distinguishable from default off");

// ── 2. no Google in the enqueue path ────────────────────────────────────────
const ENQUEUE_PATHS = [
  "lib/promoteEnqueue.js",
  "scripts/enqueue-inbox.mjs",
  "app/api/cron/promote-backfill/route.js",
];
for (const rel of ENQUEUE_PATHS) {
  const src = read(rel);
  ok(src.length > 0, `${rel} exists and is non-empty`);
  ok(!/places\.googleapis\.com/.test(src), `${rel} must not call Google Places`);
  ok(!/getPlaceDetails/.test(src), `${rel} must not call getPlaceDetails`);
  ok(src.includes(PROMOTE_BACKFILL_ENV), `${rel} documents ${PROMOTE_BACKFILL_ENV}`);
}
ok(read("app/api/cron/promote-backfill/route.js").includes("cache: \"no-store\""),
  "backfill cron POSTs with cache:\"no-store\" (mutating RPC)");
ok(read("scripts/enqueue-inbox.mjs").includes(PROMOTE_BACKFILL_RPC),
  "operator script calls the existing wf_promotion_backfill RPC");

const vercel = read("vercel.json");
ok(!/promote-backfill/.test(vercel), "vercel.json does not schedule promote-backfill (switch stays off)");

// ── 3. the promote boxes stay inside Florida ────────────────────────────────
// This assertion used to freeze the metro LIST at the original four, as a scope
// lock on the PR that introduced the backfill switch. That lock expired on
// 2026-08-22 when thirteen Florida boxes were added, and freezing a list is the
// weaker check anyway — it fails on every legitimate expansion while saying
// nothing about the failure that matters.
//
// The real invariant is geographic. 3,642 indexed places clearing 9.2 sit in
// Dubai, Singapore, Istanbul, Leeds and Manila — the residue of stray searches.
// Promoting those would flood the app with cards in cities Wayfind cannot rank
// honestly or monetise, which is the entire reason wf_promote_metros exists. So:
// every box must fall inside Florida, and every box must be well-formed.
// Parity with the SQL table is a separate guard (check-promote-metros-parity).
const FL = { minLat: 24.4, maxLat: 31.1, minLng: -87.7, maxLng: -79.9 };
const metroKeys = Object.keys(PROMOTE_METROS);
ok(metroKeys.length >= 4, `expected at least the four original boxes, found ${metroKeys.length}`);
for (const key of metroKeys) {
  const b = PROMOTE_METROS[key];
  ok(b.minLat < b.maxLat && b.minLng < b.maxLng, `${key}: box is inverted (min must be < max)`);
  ok(b.minLat >= FL.minLat && b.maxLat <= FL.maxLat && b.minLng >= FL.minLng && b.maxLng <= FL.maxLng,
    `${key} falls outside Florida (${b.minLat},${b.minLng})-(${b.maxLat},${b.maxLng}). ` +
    `Promotion is bounded to markets Wayfind can rank and monetise; widening it is a product decision, not a config edit.`);
}
// Prove the check can fail: a box in Istanbul must be caught.
{
  const bad = { minLat: 40.9, maxLat: 41.1, minLng: 28.8, maxLng: 29.1 };
  ok(!(bad.minLat >= FL.minLat && bad.maxLat <= FL.maxLat && bad.minLng >= FL.minLng && bad.maxLng <= FL.maxLng),
    "self-test: an Istanbul box must be detected as outside Florida, or this guard is inert");
}

// ── 4. category placement uses existing signals, not a stored list name ─────
ok(JSON.stringify(existingTypeSignals({ google_types: [], primary_type: "cafe" })) === JSON.stringify(["cafe"]),
  "empty google_types[] reuses primary_type");
ok(existingTypeSignals({ category: "nightlife", name: "Acme" }).length === 0,
  "stored category is not a type signal");
ok(isBreakfastPlace({ types: [], primaryType: "cafe", name: "Lakewood Ranch Cafe" }) === true,
  "breakfast identity sees a cafe primaryType when types[] is empty");
ok(isBreakfastPlace({ types: [], primaryType: null, category: "food", name: "Acme Holdings LLC" }) === false,
  "breakfast does not invent from a stored food category");
ok(isFamilyPlace({ types: [], primary_type: "zoo", name: "Some Zoo" }) === true,
  "family identity reuses primary_type=zoo when types[] is empty");
ok(isStrongTicketedVenue({ types: [], primaryType: "performing_arts_theater", name: "Straz Center" }) === true,
  "events identity reuses a ticketed primaryType when types[] is empty");

// ── 5. identity pool + homepage rail path: no new Place Details ─────────────
const railsData = read("lib/railsData.js");
ok(/existingTypeSignals\(row\)/.test(railsData),
  "buildIdentityPool shapes types via existingTypeSignals (empty-array reuse)");
const identityFn = railsData.slice(railsData.indexOf("async function buildIdentityPool"), railsData.indexOf("async function buildCreatorsPool"));
ok(identityFn.length > 200, "could extract buildIdentityPool source");
ok(!/getPlaceDetails/.test(identityFn), "buildIdentityPool does not call getPlaceDetails");
ok(!/places\.googleapis/.test(identityFn), "buildIdentityPool does not call Google");
ok(/wf_inventory/.test(identityFn), "identity widen reads wf_inventory (owned rows)");

const page = read("app/page.js");
ok(!/getPlaceDetails/.test(page), "app/page.js still has no Place Details call");
const railsRoute = read("app/api/rails/route.js");
ok(!/getPlaceDetails/.test(railsRoute) && !/places\.googleapis/.test(railsRoute),
  "GET /api/rails does not call Place Details");

if (fail) {
  console.error(`test-promote-backfill: ${fail} failure(s), ${pass} passed`);
  process.exit(1);
}
console.log(`test-promote-backfill: OK — ${pass} assertions (kill-switch default off, no Google, four boxes, existing-signal category)`);
