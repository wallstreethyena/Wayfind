#!/usr/bin/env node
// scripts/test-production-write-firewall.mjs — Runtime red-team proof of the
// Hard Test/Production Write Firewall (Missions 1, 2, 3, 17 & 27).
//
// Intentionally attempts to violate production write boundaries across:
//   1. Viator redirect (/api/viator/go + attributedViatorDestination with 1234P5 & real SKU)
//   2. Travelpayouts attribution (/api/commerce/go + attributedTravelpayoutsDestination)
//   3. Analytics events (PostHog captureServer + Meta CAPI /api/meta/capi)
//   4. Booking callbacks / Google offline conversion RPCs (wf_viator_reconcile, wf_google_begin_upload)
//   5. Cron / Event / Inventory writes (wf_events, wf_inventory, wf_spend_take)
//   6. Feedback (/api/feedback), Email Signup (/api/signup), Vote webhook (/api/vote)
//   7. Server cache (cset -> wf_places_cache) & redirect burst RPC (wf_redirect_burst_record)
//
// Across ALL non-production & synthetic identities:
//   - Local test WITH WF_SUPPRESS_ANALYTICS DELETED and real-shaped 20-char Supabase host
//   - CI runner (GITHUB_ACTIONS=true on pull_request)
//   - Vercel Production Build container (VERCEL_ENV=production + NEXT_PHASE=phase-production-build)
//   - Vercel Preview deployment (VERCEL_ENV=preview)
//   - Live Production Runtime (VERCEL_ENV=production) hit by synthetic markers:
//       * x-wf-synthetic: 1
//       * WayfindSyntheticMonitor/1.0
//       * cookie __wf_synthetic=1
//       * ?wf_synthetic=1
//   - Live Production Runtime (VERCEL_ENV=production) handed contaminated payloads:
//       * offer_id = '1234P5'
//       * fake email 'user@example.com'
//       * localhost destination URL
//       * synthetic place_id 'ChIJ_TEST_FAKE'
//       * impossible coordinates (0, 0) and (95, -200)
//
// Every dangerous attempt MUST fail closed before reaching the underlying network transport.

import assert from "node:assert/strict";

// Install a bottom-layer transport spy BEFORE importing firewall modules so we can
// prove zero mutating requests ever reach the underlying network socket!
const socketCalls = [];
const realUndiciFetch = globalThis.fetch;
const bottomSocketSpy = async function bottomSocketSpy(input, init = {}) {
  const url = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
  const method = String(init?.method || input?.method || "GET").toUpperCase();
  socketCalls.push({ url, method, body: init?.body ? String(init.body) : null });

  // Return realistic responses for read-only lookups (e.g., wf_experiences or wf_tp_links GET)
  if (method === "GET" || method === "HEAD") {
    if (url.includes("/rest/v1/wf_tp_links")) {
      return new Response(
        JSON.stringify([
          {
            provider: "tiqets",
            offer_id: "tiq-real-99",
            campaign_id: 89,
            destination_url: "https://www.tiqets.com/en/orlando-attractions-c663/",
            short_url: "https://tp.st/abc123xyz",
            marker: "500000",
            trs: "300000",
            enabled: true,
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }

  // If ANY mutating request to a real live target ever reaches here during a blocked scenario,
  // socketCalls records the breach and fails the guard!
  return new Response("{}", { status: 201, headers: { "content-type": "application/json" } });
};
bottomSocketSpy.__wfIsSocketSpy = true;
globalThis.fetch = bottomSocketSpy;

const {
  classifyExecutionIdentity,
  classifySyntheticTraffic,
  classifyWriteTarget,
  validateProductionWritePayload,
  evaluateProductionWrite,
  installProductionWriteFetchGuard,
  getFirewallTelemetry,
  resetFirewallTelemetryForTests,
  OPERATOR_WRITE_CAPABILITY_TOKEN,
} = await import("../lib/productionWriteFirewall.js");

// Re-ensure our bottom spy sits underneath the firewall wrapper
assert.equal(globalThis.fetch.__wfFirewallWrapped, true, "firewall fetch wrapper auto-installed on import");

const { attributedViatorDestination } = await import("../lib/viatorAttribution.js");
const { attributedTravelpayoutsDestination } = await import("../lib/travelpayoutsAttribution.js");
const { captureServer } = await import("../lib/serverEvents.js");
const { cset } = await import("../lib/serverCache.js");
const { supabaseBurstStore } = await import("../lib/redirectTrafficClass.js");
const { GET: viatorGo } = await import("../app/api/viator/go/route.js");
const { POST: feedbackPost } = await import("../app/api/feedback/route.js");
const { POST: signupPost } = await import("../app/api/signup/route.js");
const { POST: metaCapiPost } = await import("../app/api/meta/capi/route.js");
const { POST: votePost } = await import("../app/api/vote/route.js");

// Realistic 20-char lowercase alphanumeric Supabase host (matches real production ref format,
// never uses real credentials).
const SIMULATED_PROD_SB_URL = "https://abcdefghijklmnopqrst.supabase.co";
const SIMULATED_PROD_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.simulated_service_role";

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  pass += 1;
}

function mutatingSocketLeaks() {
  return socketCalls.filter((c) => {
    const t = classifyWriteTarget(c.url, c.method, { SUPABASE_URL: SIMULATED_PROD_SB_URL });
    return t.isLiveTarget && t.isMutation;
  });
}

// ── 1. Execution Identity Matrix ──────────────────────────────────────────────
{
  // Local shell with zero flags -> FAIL CLOSED
  const local = classifyExecutionIdentity({ env: {}, argv: ["node", "some-local-script.mjs"] });
  ok(local.allowLiveWrites === false && local.mode === "UNVERIFIED_EXECUTION_CONTEXT", "local shell without flags fails closed");

  // Vercel Production Build (`npm run prebuild` inside VERCEL_ENV=production!) -> FAIL CLOSED
  const vercelBuild = classifyExecutionIdentity({
    env: { VERCEL_ENV: "production", NEXT_PHASE: "phase-production-build" },
    argv: ["node", ".next/server/app/page.js"],
  });
  ok(vercelBuild.allowLiveWrites === false && vercelBuild.mode === "BUILD_CONTAINER", "Vercel production build container fails closed");

  const npmPrebuild = classifyExecutionIdentity({
    env: { VERCEL_ENV: "production", npm_lifecycle_event: "prebuild" },
    argv: ["node", "scripts/check-go-routes-crawler-gate.mjs"],
  });
  ok(npmPrebuild.allowLiveWrites === false, "npm run prebuild inside Vercel production fails closed");

  // Vercel Preview deployment -> FAIL CLOSED
  const preview = classifyExecutionIdentity({
    env: { VERCEL_ENV: "preview" },
    argv: ["node", "server.js"],
  });
  ok(preview.allowLiveWrites === false && preview.mode === "PREVIEW_RUNTIME", "Vercel preview runtime fails closed");

  // GitHub Actions PR CI -> FAIL CLOSED
  const prCi = classifyExecutionIdentity({
    env: { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/1/merge" },
    argv: ["node", "scripts/record-workflow-pulse.mjs"],
  });
  ok(prCi.allowLiveWrites === false, "GitHub Actions pull_request CI fails closed even for pulse script");

  // Guard entrypoint even if VERCEL_ENV=production -> FAIL CLOSED
  const guardInProd = classifyExecutionIdentity({
    env: { VERCEL_ENV: "production" },
    argv: ["node", "scripts/check-provider-redirects.mjs"],
  });
  ok(guardInProd.allowLiveWrites === false && guardInProd.mode === "TEST_OR_GUARD_SCRIPT", "guard script entrypoint fails closed even if VERCEL_ENV=production");

  // Real Vercel Production Runtime -> ALLOWED
  const prodRuntime = classifyExecutionIdentity({
    env: { VERCEL_ENV: "production" },
    argv: ["node", "/var/task/server.js"],
  });
  ok(prodRuntime.allowLiveWrites === true && prodRuntime.mode === "PRODUCTION_RUNTIME", "real Vercel production runtime is permitted");

  // Scheduled GitHub workflow maintenance script on main -> ALLOWED
  const scheduled = classifyExecutionIdentity({
    env: { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "schedule", GITHUB_REF: "refs/heads/main" },
    argv: ["node", "scripts/record-workflow-pulse.mjs"],
  });
  ok(scheduled.allowLiveWrites === true && scheduled.mode === "AUTHORIZED_SCHEDULED_JOB", "scheduled maintenance pulse on main is permitted");

  // Explicit operator capability -> ALLOWED (unless WF_GUARD_SUITE=1!)
  const opAllowed = classifyExecutionIdentity({
    env: { WF_PRODUCTION_WRITE_CAPABILITY: OPERATOR_WRITE_CAPABILITY_TOKEN },
    argv: ["node", "scripts/seed-owned-hours.mjs"],
  });
  ok(opAllowed.allowLiveWrites === true && opAllowed.mode === "AUTHORIZED_OPERATOR_CLI", "explicit operator capability is permitted");

  const opBlockedByGuard = classifyExecutionIdentity({
    env: { WF_PRODUCTION_WRITE_CAPABILITY: OPERATOR_WRITE_CAPABILITY_TOKEN, WF_GUARD_SUITE: "1" },
    argv: ["node", "scripts/seed-owned-hours.mjs"],
  });
  ok(opBlockedByGuard.allowLiveWrites === false, "WF_GUARD_SUITE=1 overrides even explicit operator capability");
}

// ── 2. Red-Team Dangerous Writes WITH `WF_SUPPRESS_ANALYTICS` DELETED ─────────
{
  resetFirewallTelemetryForTests();
  socketCalls.length = 0;

  // Simulate the EXACT incident condition: developer/build deletes WF_SUPPRESS_ANALYTICS
  // and WF_VIATOR_TOKEN_CAPTURE while real-shaped production keys sit in process.env!
  delete process.env.WF_SUPPRESS_ANALYTICS;
  delete process.env.WF_VIATOR_TOKEN_CAPTURE;
  delete process.env.WF_GUARD_SUITE;
  process.env.SUPABASE_URL = SIMULATED_PROD_SB_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SIMULATED_PROD_KEY;
  process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_live_simulated_key_12345";
  process.env.NEXT_PUBLIC_VIATOR_PID = "P00320881";
  process.env.META_CAPI_ACCESS_TOKEN = "EAABsimulatedMetaToken";
  process.env.SIGNUP_WEBHOOK_URL = "https://hooks.zapier.com/hooks/catch/123/abc/";

  const humanHeaders = new Headers({
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
    referer: "https://www.gowayfind.com/guides/things-to-do-orlando",
  });

  // 2a. Viator redirect route with 1234P5 AND with a real-shaped tour code
  const rViator1 = await viatorGo(
    new Request(
      "https://www.gowayfind.com/api/viator/go?product=" +
        encodeURIComponent("https://www.viator.com/tours/Orlando/Airboat/d827-1234P5") +
        "&surface=guide_pick",
      { headers: humanHeaders },
    ),
  );
  ok(rViator1.status === 302, "Viator redirect still returns 302 under test");

  const rViatorRealSku = await attributedViatorDestination({
    offerId: "123164P1",
    destinationUrl: "https://www.viator.com/tours/Orlando/Clear-Kayak/d663-123164P1",
    pageHint: "orlando",
    surface: "guide_pick",
    trafficClass: "human",
  });
  ok(
    rViatorRealSku.error && rViatorRealSku.error.startsWith("firewall-blocked:"),
    `attributedViatorDestination blocked without suppression flag (got ${JSON.stringify(rViatorRealSku)})`,
  );

  // 2b. Travelpayouts attribution
  const rTp = await attributedTravelpayoutsDestination({
    provider: "tiqets",
    offerId: "tiq-real-99",
    destinationUrl: "https://www.tiqets.com/en/orlando-attractions-c663/",
    surface: "guide_pick",
    trafficClass: "human",
  });
  ok(
    rTp.error && rTp.error.startsWith("firewall-blocked:"),
    `attributedTravelpayoutsDestination blocked without suppression flag (got ${JSON.stringify(rTp)})`,
  );

  // 2c. PostHog server capture & Meta CAPI
  const phSent = await captureServer("provider_redirect_started", {
    distinctId: "visitor-123",
    properties: { provider: "viator" },
    headers: humanHeaders,
  });
  ok(phSent === false, "captureServer blocked from reaching live PostHog even with WF_SUPPRESS_ANALYTICS deleted");

  const capiRes = await metaCapiPost(
    new Request("https://www.gowayfind.com/api/meta/capi", {
      method: "POST",
      headers: humanHeaders,
      body: JSON.stringify({ event_id: "ev-1", source_path: "/" }),
    }),
  );
  ok(capiRes.status === 204, "Meta CAPI relay returned 204 without dispatching live event");

  // 2d. Direct fetch writes: booking callbacks, cron event writes, inventory writes, spend RPC, cache, burst
  const directTargets = [
    [`${SIMULATED_PROD_SB_URL}/rest/v1/rpc/wf_viator_reconcile`, "POST", { p_events: [] }],
    [`${SIMULATED_PROD_SB_URL}/rest/v1/rpc/wf_google_begin_upload`, "POST", {}],
    [`${SIMULATED_PROD_SB_URL}/rest/v1/wf_events`, "POST", { title: "Test Event" }],
    [`${SIMULATED_PROD_SB_URL}/rest/v1/wf_inventory?place_id=eq.ChIJ123`, "PATCH", { signals: {} }],
    [`${SIMULATED_PROD_SB_URL}/rest/v1/wf_christmas_plan_votes`, "POST", { plan_id: "p1" }],
    [`${SIMULATED_PROD_SB_URL}/rest/v1/wf_group_plans`, "POST", { id: "gp1" }],
    [`${SIMULATED_PROD_SB_URL}/rest/v1/rpc/wf_spend_take`, "POST", { p_sku: "viator" }],
  ];
  for (const [u, m, body] of directTargets) {
    const res = await fetch(u, {
      method: m,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    ok(res.status === 403, `direct ${m} ${u} blocked with 403 by universal fetch firewall`);
  }

  // 2e. Feedback, Signup, Vote, Server Cache, Redirect Burst
  await cset("pd1|ChIJtest", { name: "Test" }, 60_000);
  let burstThrew = false;
  try {
    await supabaseBurstStore().record("k1", "o1", Date.now(), 60);
  } catch {
    burstThrew = true;
  }
  ok(burstThrew, "supabaseBurstStore blocked from calling live wf_redirect_burst_record");

  const fbRes = await feedbackPost(
    new Request("https://www.gowayfind.com/api/feedback", {
      method: "POST",
      headers: humanHeaders,
      body: JSON.stringify({ message: "test feedback from guard", sentiment: "up" }),
    }),
  );
  ok(fbRes.status === 403, "feedback route blocked non-production live write");

  await signupPost(
    new Request("https://www.gowayfind.com/api/signup", {
      method: "POST",
      headers: humanHeaders,
      body: JSON.stringify({ email: "reallooking@gmail.com", source: "footer" }),
    }),
  );

  await votePost(
    new Request("https://www.gowayfind.com/api/vote", {
      method: "POST",
      headers: humanHeaders,
      body: JSON.stringify({ placeId: "ChIJ123", vote: "yes" }),
    }),
  );

  // CRITICAL PROOF: ZERO mutating requests ever reached bottomSocketSpy!
  const leaks = mutatingSocketLeaks();
  ok(
    leaks.length === 0,
    `ZERO live mutations reached network socket across all red-team attempts (leaks=${JSON.stringify(leaks)})`,
  );
  ok(getFirewallTelemetry().blockedTotal >= 12, "firewall telemetry counted every blocked write attempt");
}

// ── 3. Synthetic Request Markers & Payload Contamination Gate IN PRODUCTION ───
{
  // Even inside real VERCEL_ENV=production on www.gowayfind.com:
  const prodEnv = { VERCEL_ENV: "production", SUPABASE_URL: SIMULATED_PROD_SB_URL };
  const prodArgv = ["node", "/var/task/server.js"];

  // 3a. x-wf-synthetic header, WayfindSyntheticMonitor UA, __wf_synthetic cookie, ?wf_synthetic=1
  const synthCases = [
    new Request("https://www.gowayfind.com/api/viator/go", { headers: { "x-wf-synthetic": "1" } }),
    new Request("https://www.gowayfind.com/api/viator/go", {
      headers: { "user-agent": "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)" },
    }),
    new Request("https://www.gowayfind.com/api/feedback", {
      headers: { cookie: "__wf_synthetic=1" },
    }),
    new Request("https://www.gowayfind.com/api/viator/go?wf_synthetic=1"),
  ];
  for (const req of synthCases) {
    ok(classifySyntheticTraffic(req).synthetic === true, `classified synthetic request: ${req.url}`);
    const verdict = evaluateProductionWrite({
      surface: "prod_route",
      table: "wf_viator_clicks",
      method: "POST",
      targetUrl: `${SIMULATED_PROD_SB_URL}/rest/v1/wf_viator_clicks`,
      req,
      env: prodEnv,
      argv: prodArgv,
    });
    ok(verdict.allowed === false, "synthetic request blocked even inside VERCEL_ENV=production");
  }

  // 3b. WayfindSyntheticMonitor on /api/viator/go STILL receives 302 partner URL (for book-links watchdog)
  //     while writing ZERO wf_viator_clicks rows!
  socketCalls.length = 0;
  const monRes = await viatorGo(
    new Request(
      "https://www.gowayfind.com/api/viator/go?product=" +
        encodeURIComponent("https://www.viator.com/tours/Orlando/Clear-Kayak/d663-123164P1"),
      {
        headers: {
          "user-agent": "WayfindSyntheticMonitor/1.0 (+https://www.gowayfind.com)",
          referer: "https://www.gowayfind.com/",
        },
      },
    ),
  );
  ok(
    monRes.status === 302 && (monRes.headers.get("location") || "").includes("viator.com"),
    "WayfindSyntheticMonitor still receives 302 partner Location on exact product",
  );
  ok(mutatingSocketLeaks().length === 0, "WayfindSyntheticMonitor wrote ZERO rows to Supabase or PostHog");

  // 3c. Payload Data-Quality Firewall rejects contaminated rows even inside VERCEL_ENV=production!
  const dirtyPayloads = [
    [{ offer_id: "1234P5", surface: "culture" }, "fixture-offer-1234P5"],
    [{ email: "tester@example.com", slug: "" }, "payload-quality:fake-email-domain:email"],
    [{ destination_url: "http://localhost:3000/tours/1" }, "payload-quality:loopback-or-test-url:destination_url"],
    [{ place_id: "ChIJ_TEST_MEDSPA", name: "Fake" }, "payload-quality:synthetic-place-id"],
    [{ place_id: "ChIJreal12345", lat: 0, lng: 0 }, "payload-quality:impossible-coordinates"],
    [{ place_id: "ChIJreal12345", lat: 95, lng: -82 }, "payload-quality:impossible-coordinates"],
    [{ offer_id: "999P1", surface: "qa" }, "payload-quality:qa-surface-row"],
    [{ offer_id: "999P1", content_id: "claude-verify-20261113" }, "payload-quality:synthetic-content_id"],
  ];
  for (const [payload, expectedReason] of dirtyPayloads) {
    const v = evaluateProductionWrite({
      surface: "prod_write",
      table: "wf_viator_clicks",
      method: "POST",
      targetUrl: `${SIMULATED_PROD_SB_URL}/rest/v1/wf_viator_clicks`,
      payload,
      env: prodEnv,
      argv: prodArgv,
    });
    ok(
      v.allowed === false && v.reason === expectedReason,
      `dirty payload rejected in VERCEL_ENV=production (${expectedReason}, got ${v.reason})`,
    );
  }

  // Positive control: a clean real customer click in VERCEL_ENV=production IS allowed!
  const cleanVerdict = evaluateProductionWrite({
    surface: "viator_attribution",
    table: "wf_viator_clicks",
    method: "POST",
    targetUrl: `${SIMULATED_PROD_SB_URL}/rest/v1/wf_viator_clicks`,
    payload: {
      offer_id: "123164P1",
      placement_campaign: "wf-orlando-guide_pick-123164p1",
      surface: "guide_pick",
      content_id: "rock-springs-kayak",
      destination_url: "https://www.viator.com/tours/Orlando/Clear-Kayak/d663-123164P1",
    },
    req: new Request("https://www.gowayfind.com/api/viator/go", {
      headers: {
        "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      },
    }),
    env: prodEnv,
    argv: prodArgv,
  });
  ok(cleanVerdict.allowed === true, "legitimate human customer click in VERCEL_ENV=production is permitted");
}

if (process.argv.includes("--red-prove")) {
  console.error("test-production-write-firewall: FAIL (RED_PROVE: simulated synthetic write leak)");
  process.exit(1);
}

console.log(
  `test-production-write-firewall: OK (${pass} assertions — local/CI/build/preview/synthetic/fixture writes all fail closed with 0 socket leaks)`,
);
