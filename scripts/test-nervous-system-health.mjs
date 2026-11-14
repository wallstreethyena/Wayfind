#!/usr/bin/env node
// scripts/test-nervous-system-health.mjs — Mission 21 Deterministic Hermetic Guard.
//
// Proves `/api/health/nervous-system` and `buildNervousSystemReport`:
//   1. Fails closed (`503` when auth unconfigured; `401` on missing/wrong secret)
//      with `Cache-Control: no-store`.
//   2. Issues ZERO outbound `googleapis.com` calls.
//   3. Computes and returns all 11 required Mission 21 operational metrics when
//      authenticated via `Authorization: Bearer <CRON_SECRET>` or `x-wf-cc-key`.
//   4. Raises `detail_503_nonzero` alert (`ok: false`) if any user detail 503 occurs.
//
// Strictly hermetic: reads ZERO `process.env` properties.

import "./lib/nodeResolveHook.mjs";
import { GET } from "../app/api/health/nervous-system/route.js";
import { buildOwnedHoursRecord } from "../lib/ownedHours.js";
import { recordDetailMetric, resetDetailTelemetryForTests } from "../lib/detailTelemetry.js";

let pass = 0;
const fail = [];
function ok(cond, msg) {
  if (cond) pass += 1;
  else fail.push(msg);
}

const origFetch = globalThis.fetch;
let googleCalls = 0;

// Relative to current Date.now() so GET(req)'s live clock sees exact fresh vs stale (>21d, <29d)
const nowMs = Date.now();
const verifiedIso = new Date(nowMs - 2 * 86400000).toISOString();
const freshOpenHours = buildOwnedHoursRecord({
  periods: [0, 1, 2, 3, 4, 5, 6].map((d) => ({
    open: { day: d, hour: 0, minute: 0 },
    close: { day: (d + 1) % 7, hour: 0, minute: 0 },
  })),
  weekdayDescriptions: ["Monday: Open 24 hours"],
  source: "google_places",
  verifiedAt: verifiedIso,
});

const staleIso = new Date(nowMs - 24 * 86400000).toISOString(); // 24d old -> >21d stale, <30d usable
const staleClosedHours = buildOwnedHoursRecord({
  periods: [
    { open: { day: 0, hour: 3, minute: 0 }, close: { day: 0, hour: 3, minute: 1 } },
  ],
  weekdayDescriptions: ["Sunday: 3:00 AM – 3:01 AM"],
  source: "google_places",
  verifiedAt: staleIso,
});

const fixtureInventory = [
  {
    place_id: "ChIJ_MOTE_REAL_1",
    metro: "tampa_bay",
    anchor: true,
    category: "aquarium",
    signals: { owned_hours: freshOpenHours },
  },
  {
    place_id: "ChIJ_RINGLING_REAL_2",
    metro: "tampa_bay",
    anchor: true,
    category: "museum",
    signals: { owned_hours: staleClosedHours },
  },
  {
    place_id: "ChIJ_UNKNOWN_REAL_3",
    metro: "orlando",
    anchor: false,
    category: "park",
    signals: {},
  },
];

function makeResponse(body, status = 200, headers = {}) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : input?.url || String(input);
  if (url.includes("googleapis.com")) {
    googleCalls += 1;
    throw new Error(`Unexpected Google API call in nervous-system health: ${url}`);
  }
  if (url.includes("/rest/v1/wf_inventory")) {
    return makeResponse(fixtureInventory, 200);
  }
  if (url.includes("/rest/v1/wf_viator_clicks")) {
    if (url.includes("offer_id=eq.1234P5")) {
      return makeResponse([], 200, { "content-range": "0-0/2799" });
    }
    if (url.includes("offer_id=neq.1234P5") || url.includes("and=")) {
      return makeResponse([], 200, { "content-range": "0-0/1133" });
    }
    return makeResponse([], 200, { "content-range": "0-0/3932" });
  }
  if (url.includes("/rest/v1/wf_tp_clicks")) {
    if (url.includes("surface=neq.qa") || url.includes("and=")) {
      return makeResponse([], 200, { "content-range": "0-0/758" });
    }
    return makeResponse([], 200, { "content-range": "0-0/760" });
  }
  if (url.includes("/rest/v1/wf_spend_daily")) {
    return makeResponse([{ sku: "places_details", used: 42, cap: 500 }], 200);
  }
  if (url.includes("/rest/v1/rpc/wf_migration_ledger_hashes")) {
    return makeResponse(Array.from({ length: 127 }, (_, i) => ({ version: `2026010${i}` })), 200);
  }
  if (url.includes("/rest/v1/wf_events")) {
    return makeResponse([], 200);
  }
  return makeResponse([], 200);
};

try {
  resetDetailTelemetryForTests();

  // 1. Unconfigured auth fails closed with 503
  delete process.env.CRON_SECRET;
  delete process.env.METRICS_SECRET;
  process.env.SUPABASE_URL = "https://fixture-nervous.supabase.local";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-service-role-nervous";

  const unconfRes = await GET(new Request("https://www.gowayfind.com/api/health/nervous-system"));
  ok(unconfRes.status === 503, `unconfigured auth returns 503 (got ${unconfRes.status})`);
  ok(unconfRes.headers.get("cache-control") === "no-store", "503 sets Cache-Control: no-store");

  // 2. Unauthorized requests fail closed with 401
  process.env.CRON_SECRET = "nervous-cron-secret-test";
  process.env.METRICS_SECRET = "nervous-metrics-secret-test";

  const noHeaderRes = await GET(new Request("https://www.gowayfind.com/api/health/nervous-system"));
  ok(noHeaderRes.status === 401, `missing header returns 401 (got ${noHeaderRes.status})`);
  ok(noHeaderRes.headers.get("cache-control") === "no-store", "401 sets Cache-Control: no-store");

  const badBearerRes = await GET(
    new Request("https://www.gowayfind.com/api/health/nervous-system", {
      headers: { authorization: "Bearer wrong-secret" },
    }),
  );
  ok(badBearerRes.status === 401, `wrong Bearer returns 401 (got ${badBearerRes.status})`);

  const badCcRes = await GET(
    new Request("https://www.gowayfind.com/api/health/nervous-system", {
      headers: { "x-wf-cc-key": "wrong-cc-key" },
    }),
  );
  ok(badCcRes.status === 401, `wrong x-wf-cc-key returns 401 (got ${badCcRes.status})`);

  // 3. Valid Bearer token returns 200 + all 11 Mission 21 metrics
  recordDetailMetric("snapshot_served");
  const okBearerRes = await GET(
    new Request("https://www.gowayfind.com/api/health/nervous-system", {
      headers: { authorization: "Bearer nervous-cron-secret-test" },
    }),
  );
  ok(okBearerRes.status === 200, `valid Bearer returns 200 (got ${okBearerRes.status})`);
  ok(okBearerRes.headers.get("cache-control") === "no-store", "200 sets Cache-Control: no-store");

  const body = await okBearerRes.json();
  ok(body.ok === true, "clean report has ok: true");
  ok(body.surface === "nervous-system", "surface is nervous-system");

  const requiredMetrics = [
    "ownedHoursCoverage",
    "unknownOpenStatePct",
    "googleDetailAttempts",
    "googleDetail503s",
    "humanVsBackgroundSpend",
    "staleSnapshotCount",
    "syntheticWritesBlocked",
    "attributionContamination",
    "migrationDrift",
    "searchEligibilityRejections",
    "christmasOpenTonightCount",
  ];
  for (const key of requiredMetrics) {
    ok(body.metrics && body.metrics[key] !== undefined, `metrics.${key} is present`);
  }

  ok(
    body.metrics.ownedHoursCoverage.usableOwnedHoursCount === 2 &&
      body.metrics.ownedHoursCoverage.totalOperationalInventory === 3 &&
      body.metrics.ownedHoursCoverage.coveragePct === 66.67,
    `ownedHoursCoverage accurate (${JSON.stringify(body.metrics.ownedHoursCoverage)})`,
  );
  ok(
    body.metrics.unknownOpenStatePct.unknownCount === 1 &&
      body.metrics.unknownOpenStatePct.unknownPct === 33.33,
    `unknownOpenStatePct accurate (${JSON.stringify(body.metrics.unknownOpenStatePct)})`,
  );
  ok(
    body.metrics.staleSnapshotCount.staleCount === 1 &&
      Array.isArray(body.metrics.staleSnapshotCount.refreshQueueTop10) &&
      body.metrics.staleSnapshotCount.refreshQueueTop10.length === 3,
    `staleSnapshotCount + refreshQueueTop10 populated`,
  );
  ok(
    body.metrics.attributionContamination.viator.totalRows === 3932 &&
      body.metrics.attributionContamination.viator.syntheticFixtureRows === 2799 &&
      body.metrics.attributionContamination.viator.cleanAnalyticalRows === 1133,
    `attributionContamination.viator accurate`,
  );
  ok(
    body.metrics.migrationDrift.appliedLedgerCount === 127 &&
      body.metrics.migrationDrift.rpcReachable === true,
    `migrationDrift ledger RPC populated`,
  );
  ok(
    body.metrics.humanVsBackgroundSpend.dailyLedgerBySku?.places_details?.used === 42,
    `humanVsBackgroundSpend daily ledger populated`,
  );
  ok(
    typeof body.metrics.christmasOpenTonightCount.tonight === "number" &&
      typeof body.metrics.christmasOpenTonightCount.openingSoon === "number" &&
      body.metrics.christmasOpenTonightCount.all > 100,
    `christmasOpenTonightCount populated from statewide Christmas pool`,
  );

  // 4. Valid x-wf-cc-key also returns 200
  const okCcRes = await GET(
    new Request("https://www.gowayfind.com/api/health/nervous-system", {
      headers: { "x-wf-cc-key": "nervous-metrics-secret-test" },
    }),
  );
  ok(okCcRes.status === 200, `valid x-wf-cc-key returns 200 (got ${okCcRes.status})`);

  // 5. Detail 503 alert triggers ok: false
  recordDetailMetric("detail_503_returned");
  const alertRes = await GET(
    new Request("https://www.gowayfind.com/api/health/nervous-system", {
      headers: { authorization: "Bearer nervous-cron-secret-test" },
    }),
  );
  const alertBody = await alertRes.json();
  ok(
    alertBody.ok === false && alertBody.alerts.includes("detail_503_nonzero:1"),
    `detail 503 raises detail_503_nonzero alert (${JSON.stringify(alertBody.alerts)})`,
  );

  // 6. Zero outbound Google API calls
  ok(googleCalls === 0, `zero outbound Google API calls (${googleCalls})`);

  if (process.argv.includes("--red-prove")) {
    ok(noHeaderRes.status === 200, "RED_PROVE: simulated unauthenticated 200 leak");
  }
} finally {
  resetDetailTelemetryForTests();
  globalThis.fetch = origFetch;
  delete process.env.CRON_SECRET;
  delete process.env.METRICS_SECRET;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

if (fail.length) {
  console.error("test-nervous-system-health: FAIL");
  for (const f of fail) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-nervous-system-health: OK (${pass} assertions)`);
