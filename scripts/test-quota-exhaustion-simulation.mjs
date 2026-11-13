#!/usr/bin/env node
// scripts/test-quota-exhaustion-simulation.mjs — Missions 7, 8, 9, 10, 20 & 22 Runtime Proof.
//
// Deterministically proves in a hermetic environment (zero real network calls):
//   1. Owned Hours Spine (`lib/ownedHours.js`): weekday text, Schema.org JSON-LD, and OSM
//      `opening_hours` parsing; strict 30-day ToS eviction for `google_places` vs owned
//      non-Google retention; Eastern vs Central Florida timezone handling; holiday
//      special-hours uncertainty detection; exact `open_now` / `closing_soon` /
//      `opens_later_today` / `closed` / `unknown` state computation with live Google OFF.
//   2. 5-Class Spend Accounting (`lib/spendGate.js`): `VISITOR` (`human_interactive`),
//      `BACKGROUND` (`background_enrichment`), `REFRESH` (`cron_refresh`), `REPAIR`
//      (`repair_backfill`), `SYNTHETIC_QA` (`synthetic_qa`) — zero paid spend for
//      `SYNTHETIC_QA`, 50% daily line + 20% human reserve enforcement for `REPAIR`.
//   3. Hours Freshness Prioritization (`lib/hoursFreshnessQueue.js`).
//   4. Quota-Exhaustion Simulation (Mission 20):
//      - Pre-spend owned snapshot serves HTTP 200 with 0 Google calls.
//      - Google Atmosphere quota exhausted (`spendAllowDetailsAtmosphere -> false`):
//        `/api/places/details` returns HTTP 200 from owned snapshot or partial identity
//        (NEVER HTTP 503 for known venues), `fetchPlaceDetail` heals vaulted photos while
//        preventing empty-hours truth caching (`ok: false, partial: true`).
//      - Upstream Google 429 / 503 degrades cleanly to HTTP 200 snapshot.
//      - Synthetic HTTP header (`x-wf-synthetic: 1`) forces `SYNTHETIC_QA` -> 0 spend.
//      - Live Google 200 self-heals `signals.owned_hours` + `pdd1|` cache so subsequent
//        lookups cost 0 Google calls.

import assert from "node:assert/strict";
import { register } from "node:module";
import {
  parseWeekdayDescriptionsToPeriods,
  parseJsonLdOpeningHoursSpecification,
  parseOsmOpeningHours,
  buildOwnedHoursRecord,
  isUsableOwnedHours,
  detectSpecialHoursUncertainty,
  evaluateOwnedHoursStatus,
} from "../lib/ownedHours.js";
import { scoreHoursRefreshPriority, rankHoursRefreshQueue } from "../lib/hoursFreshnessQueue.js";
import {
  TRAFFIC,
  BACKGROUND_PRIORITY,
  BACKGROUND_DAILY_LINES,
  runWithTraffic,
  takeFromLedgerDetailed,
  getSpendClassTelemetry,
  resetSpendClassTelemetryForTests,
  backgroundDailySku,
} from "../lib/spendGate.js";
import { getDetailTelemetry, resetDetailTelemetryForTests } from "../lib/detailTelemetry.js";

register(new URL("./lib/nodeResolveHook.mjs", import.meta.url));
register(
  "data:text/javascript," +
    encodeURIComponent(`
      export async function resolve(spec, ctx, next) {
        if (spec === "next/server") return next("next/server.js", ctx);
        return next(spec, ctx);
      }
    `),
);

const { fetchPlaceDetail } = await import("../lib/google.js");
const { POST: detailsPost } = await import("../app/api/places/details/route.js");

let assertions = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  assertions++;
}
function eq(actual, expected, msg) {
  assert.deepEqual(actual, expected, msg);
  assertions++;
}

const DAY_MS = 86400000;
const origFetch = globalThis.fetch;
const savedEnv = { ...process.env };

try {
  // ── 1. OWNED HOURS PARSERS, TTL & TIMEZONE / HOLIDAY TRUTH ────────────────
  const parsedLines = parseWeekdayDescriptionsToPeriods([
    "Monday: Closed",
    "Tuesday: 11:00 AM – 9:00 PM",
    "Wednesday: 11:00 AM – 9:00 PM",
    "Thursday: 11:00 AM – 9:00 PM",
    "Friday: 11:00 AM – 11:30 PM",
    "Saturday: 5:00 PM – 1:30 AM",
    "Sunday: 12:00 – 8:00 PM",
  ]);
  ok(parsedLines && parsedLines.periods.length === 6, "weekdayDescriptions parser builds 6 open periods (Monday closed)");
  const satWrap = parsedLines.periods.find((p) => p.open.day === 6);
  eq(satWrap.close, { day: 0, hour: 1, minute: 30 }, "midnight wrap advances close.day to Sunday (0)");

  const parsedJsonLd = parseJsonLdOpeningHoursSpecification([
    { dayOfWeek: ["https://schema.org/Wednesday", "Thursday"], opens: "10:00", closes: "17:00" },
    { dayOfWeek: "Friday", opens: "10:00", closes: "21:00" },
    { dayOfWeek: "Friday", opens: "10:00", closes: "14:00", validFrom: "2026-12-24", validThrough: "2026-12-24" },
  ]);
  ok(parsedJsonLd && parsedJsonLd.periods.length === 3, "JSON-LD parser extracts regular periods and skips holiday overrides");

  const parsedOsm = parseOsmOpeningHours("Mo-Th 11:00-21:00; Fr-Sa 11:00-23:00; Su off");
  ok(parsedOsm && parsedOsm.periods.length === 6, "OSM parser handles day ranges and Su off");
  ok(parseOsmOpeningHours("24/7")?.periods.length === 7, "OSM parser handles 24/7");
  eq(parseOsmOpeningHours("May-Sep Mo-Fr 09:00-18:00"), null, "OSM parser conservatively rejects month-conditional schedules");

  const t0 = Date.parse("2026-11-13T23:30:00Z"); // Friday 6:30 PM EST / 5:30 PM CST
  const googleRec = buildOwnedHoursRecord({
    periods: parsedLines.periods,
    weekdayDescriptions: parsedLines.weekdayDescriptions,
    lat: 27.95,
    lng: -82.45, // Tampa -> America/New_York
    source: "google_places",
    verifiedAt: new Date(t0).toISOString(),
  });
  eq(googleRec.timezone, "America/New_York", "Tampa resolves to America/New_York");
  ok(googleRec.expiresAt === new Date(t0 + 30 * DAY_MS).toISOString(), "google_places owned_hours enforces strict +30d expiresAt");
  eq(isUsableOwnedHours(googleRec, t0 + 29 * DAY_MS), true, "google_places usable at day 29");
  eq(isUsableOwnedHours(googleRec, t0 + 30 * DAY_MS + 1), false, "google_places evicted immediately past day 30 ToS ceiling");

  const osmPensacola = buildOwnedHoursRecord({
    periods: parsedOsm.periods,
    weekdayDescriptions: parsedOsm.weekdayDescriptions,
    lat: 30.42,
    lng: -87.21, // Pensacola -> America/Chicago
    source: "openstreetmap",
    verifiedAt: new Date(t0).toISOString(),
  });
  eq(osmPensacola.timezone, "America/Chicago", "Pensacola resolves to America/Chicago");
  eq(osmPensacola.expiresAt, null, "non-Google owned_hours has no 30-day ToS eviction");
  eq(isUsableOwnedHours(osmPensacola, t0 + 45 * DAY_MS), true, "OSM owned_hours remains usable at day 45");
  eq(evaluateOwnedHoursStatus(osmPensacola, t0 + 95 * DAY_MS).freshness, "stale", "non-Google owned_hours transitions to stale after 90d");

  // Open/closed/closing-soon/holiday status with zero live calls
  const friEvening = evaluateOwnedHoursStatus(googleRec, t0);
  eq(friEvening.state, "open", "Friday 6:30 PM EST businessStatus state is open");
  eq(friEvening.semanticState, "open_now", "Friday 6:30 PM EST semanticState is open_now (11:00 AM - 11:30 PM)");
  const friClosingSoon = evaluateOwnedHoursStatus(googleRec, Date.parse("2026-11-14T04:05:00Z")); // Friday 11:05 PM EST
  eq(friClosingSoon.semanticState, "closing_soon", "Friday 11:05 PM EST semanticState is closing_soon (25m before 11:30 PM close)");
  const tueMorning = evaluateOwnedHoursStatus(googleRec, Date.parse("2026-11-17T14:00:00Z")); // Tuesday 9:00 AM EST
  eq(tueMorning.semanticState, "opens_later_today", "Tuesday 9:00 AM EST semanticState is opens_later_today (opens at 11 AM)");
  const monAfternoon = evaluateOwnedHoursStatus(googleRec, Date.parse("2026-11-16T18:00:00Z")); // Monday 1:00 PM EST
  eq(monAfternoon.semanticState, "closed", "Monday (Closed all day) semanticState is closed");

  const xmasEve = detectSpecialHoursUncertainty(Date.parse("2026-12-24T22:00:00Z"), "America/New_York");
  eq(xmasEve.uncertain, true, "Christmas Eve triggers holiday hours uncertainty caveat");
  eq(xmasEve.holiday, "Christmas Eve", "Christmas Eve named explicitly");

  // ── 2. 5-CLASS SPEND ACCOUNTING & SYNTHETIC ZERO-SPEND ───────────────────
  resetSpendClassTelemetryForTests();
  const ledgerRows = new Map();
  let ledgerRpcCount = 0;
  const MONTH = new Date().toISOString().slice(0, 7);
  process.env.WAYFIND_GATE = "free";
  process.env.SUPABASE_URL = "https://ledger.quota-sim.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "sb_secret_sim";
  process.env.VERCEL_ENV = "production";
  delete process.env.WF_GUARD_SUITE;

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes("/rest/v1/wf_spend_ledger")) {
      const sku = decodeURIComponent((u.match(/sku=eq\.([^&]+)/) || [])[1] || "");
      const month = (u.match(/month=eq\.([^&]+)/) || [])[1];
      if (month !== MONTH) return Response.json([]);
      return Response.json(ledgerRows.has(sku) ? [{ used: ledgerRows.get(sku) }] : []);
    }
    if (u.includes("/rest/v1/rpc/wf_spend_take")) {
      ledgerRpcCount++;
      const b = JSON.parse(init.body);
      const used = ledgerRows.get(b.p_sku) ?? 0;
      if (used + 1 <= b.p_cap) {
        ledgerRows.set(b.p_sku, used + 1);
        return Response.json(true);
      }
      return Response.json(false);
    }
    if (u.includes("/rest/v1/rpc/wf_spend_refund")) {
      const b = JSON.parse(init.body);
      ledgerRows.set(b.p_sku, Math.max(0, (ledgerRows.get(b.p_sku) ?? 0) - b.p_n));
      return Response.json(true);
    }
    throw new Error("unexpected fetch in spend section: " + u);
  };

  const synGrant = await runWithTraffic(TRAFFIC.SYNTHETIC_QA, () => takeFromLedgerDetailed("details_enterprise", 475));
  eq(synGrant, { ok: false, reason: "synthetic_qa" }, "SYNTHETIC_QA traffic is unconditionally denied paid spend");
  eq(ledgerRpcCount, 0, "SYNTHETIC_QA makes zero ledger RPC calls");

  eq(BACKGROUND_DAILY_LINES[BACKGROUND_PRIORITY.REPAIR], 250, "REPAIR daily line stops at 50% (250)");
  ledgerRows.set(backgroundDailySku(), 250);
  const repairAtDaily = await runWithTraffic(TRAFFIC.REPAIR, () => takeFromLedgerDetailed("details_pro", 2400));
  eq(repairAtDaily, { ok: false, reason: "daily" }, "REPAIR is refused at 250 daily lookups while higher priorities still have room");

  ledgerRows.set(backgroundDailySku(), 10);
  ledgerRows.set("details_enterprise", 380); // 20% human reserve line for 475 ceiling
  const repairAtReserve = await runWithTraffic(TRAFFIC.REPAIR, () => takeFromLedgerDetailed("details_enterprise", 475));
  eq(repairAtReserve, { ok: false, reason: "reserve" }, "REPAIR cannot consume the 20% human visitor reserve");

  const visitorAtReserve = await runWithTraffic(TRAFFIC.VISITOR, () => takeFromLedgerDetailed("details_enterprise", 475));
  eq(visitorAtReserve.ok, true, "VISITOR succeeds inside the 20% human reserve");

  const spendTelem = getSpendClassTelemetry();
  eq(spendTelem.classes.synthetic_qa.denied, 1, "synthetic_qa denial recorded in telemetry");
  eq(spendTelem.classes.repair_backfill.denied, 2, "repair_backfill denials recorded in telemetry");
  eq(spendTelem.classes.human_interactive.granted, 1, "human_interactive grant recorded in telemetry");

  // ── 3. HOURS FRESHNESS PRIORITIZATION QUEUE ──────────────────────────────
  const highPriorityAnchor = {
    place_id: "ChIJanchor1",
    metro: "tampa-bay",
    anchor: true,
    category: "Museum",
    signals: { reviews: 4200, viator_url: "https://www.viator.com/tours/x" },
  };
  const lowPriorityFresh = {
    place_id: "ChIJfresh2",
    metro: "ocala",
    anchor: false,
    category: "Park",
    signals: { reviews: 18, owned_hours: osmPensacola },
  };
  const ranked = rankHoursRefreshQueue([lowPriorityFresh, highPriorityAnchor], { nowMs: t0 });
  eq(ranked[0].row.place_id, "ChIJanchor1", "missing-hours anchor with commercial readiness outranks fresh low-traffic row");
  ok(scoreHoursRefreshPriority(highPriorityAnchor, { nowMs: t0 }).score > scoreHoursRefreshPriority(lowPriorityFresh, { nowMs: t0 }).score, "priority score strictly higher");

  // ── 4. MISSION 20 QUOTA-EXHAUSTION & ZERO-503 PLACE DETAIL SIMULATION ────
  resetDetailTelemetryForTests();
  if (globalThis.__wfServerCacheMem) globalThis.__wfServerCacheMem.clear();

  const simDb = {
    inventory: new Map([
      [
        "ChIJownedComplete",
        {
          place_id: "ChIJownedComplete",
          name: "The Dalí Museum",
          lat: 27.7659,
          lng: -82.6314,
          locality: "St. Petersburg",
          status: "OPERATIONAL",
          editorial: "Surrealist masterworks on the St. Pete waterfront.",
          signals: {
            owned_hours: googleRec,
            website: "https://thedali.org",
            photo_url: "https://cdn.gowayfind.test/dali.jpg",
          },
        },
      ],
      [
        "ChIJownedHoursOnly",
        {
          place_id: "ChIJownedHoursOnly",
          name: "Mazzaro's Italian Market",
          lat: 27.7921,
          lng: -82.6738,
          locality: "St. Petersburg",
          status: "OPERATIONAL",
          editorial: null,
          signals: {
            owned_hours: googleRec,
            photo_url: "https://cdn.gowayfind.test/mazzaros.jpg",
          },
        },
      ],
      [
        "ChIJpartialKnown",
        {
          place_id: "ChIJpartialKnown",
          name: "Bayfront Sunset Pier",
          lat: 27.3364,
          lng: -82.5451,
          locality: "Sarasota",
          status: "OPERATIONAL",
          editorial: null,
          signals: {
            photo_url: "https://cdn.gowayfind.test/bayfront.jpg",
          },
        },
      ],
    ]),
    cache: new Map(),
    quotaExhausted: false,
    googleStatus: 200,
    googleCalls: 0,
    ownedHoursPatched: [],
  };

  process.env.GOOGLE_MAPS_SERVER_KEY = "sim-google-key";
  process.env.WAYFIND_GATE = "free";
  process.env.WF_PRODUCTION_WRITE_CAPABILITY = "ALLOW_EXPLICIT_OPERATOR_WRITE";

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === "/api/places/details") {
      return detailsPost(new Request("https://www.gowayfind.com/api/places/details", init));
    }
    if (u.startsWith("https://places.googleapis.com/v1/places/")) {
      simDb.googleCalls++;
      if (simDb.googleStatus !== 200) {
        return new Response("Quota exceeded for limit 'GetPlaceRequest per day'", { status: simDb.googleStatus });
      }
      return Response.json({
        id: "ChIJpartialKnown",
        displayName: { text: "Bayfront Sunset Pier" },
        editorialSummary: { text: "Breezy bayfront pier with pelicans and sunset views." },
        regularOpeningHours: {
          periods: parsedLines.periods,
          weekdayDescriptions: parsedLines.weekdayDescriptions,
        },
        nationalPhoneNumber: "(941) 555-0199",
        websiteUri: "https://sarasotabayfront.example.org",
        photos: [{ name: "places/ChIJpartialKnown/photos/rawref" }],
      });
    }
    if (u.includes("/rest/v1/rpc/wf_spend_take")) {
      return Response.json(!simDb.quotaExhausted);
    }
    if (u.includes("/rest/v1/rpc/wf_spend_refund")) {
      return Response.json(true);
    }
    if (u.includes("/rest/v1/wf_inventory")) {
      const m = u.match(/place_id=eq\.([^&]+)/);
      const pid = m ? decodeURIComponent(m[1]) : "";
      if (init.method === "PATCH") {
        const body = JSON.parse(init.body);
        const existing = simDb.inventory.get(pid);
        if (existing) {
          existing.signals = body.signals;
          simDb.ownedHoursPatched.push(pid);
          return Response.json([{ place_id: pid }]);
        }
        return Response.json([]);
      }
      const hit = simDb.inventory.get(pid);
      return Response.json(hit ? [hit] : []);
    }
    if (u.includes("/rest/v1/wf_editorial_servable")) {
      return Response.json([]);
    }
    if (u.includes("/rest/v1/wf_place_photos") || u.includes("/rest/v1/wf_photo_vault")) {
      return Response.json([]);
    }
    if (u.includes("/rest/v1/wf_places_cache")) {
      if (init.method === "POST") {
        const row = JSON.parse(init.body);
        simDb.cache.set(row.k, row);
        return new Response("", { status: 201 });
      }
      const km = u.match(/k=eq\.([^&]+)/);
      const k = km ? decodeURIComponent(km[1]) : "";
      const hit = simDb.cache.get(k);
      return Response.json(hit ? [hit] : []);
    }
    throw new Error("unexpected fetch in simulation: " + u);
  };

  // Scenario A: Rich owned snapshot resolves BEFORE spend (0 Google calls)
  simDb.quotaExhausted = false;
  simDb.googleCalls = 0;
  const resOwned = await detailsPost(
    new Request("https://www.gowayfind.com/api/places/details", {
      method: "POST",
      body: JSON.stringify({ placeId: "ChIJownedComplete", kind: "detail" }),
    }),
  );
  eq(resOwned.status, 200, "Scenario A: owned complete venue returns HTTP 200");
  const bodyOwned = await resOwned.json();
  eq(bodyOwned.source, "owned_snapshot", "Scenario A: served from owned_snapshot");
  eq(simDb.googleCalls, 0, "Scenario A: zero paid Google calls when owned snapshot is complete");

  // Scenario B: QUOTA EXHAUSTED — owned-hours venue + partial known venue both return HTTP 200 (ZERO 503s!)
  simDb.quotaExhausted = true;
  const resExhaustedHours = await detailsPost(
    new Request("https://www.gowayfind.com/api/places/details", {
      method: "POST",
      body: JSON.stringify({ placeId: "ChIJownedHoursOnly", kind: "detail" }),
    }),
  );
  eq(resExhaustedHours.status, 200, "Scenario B1: quota exhausted + owned_hours returns HTTP 200 (never 503)");
  const bodyExhaustedHours = await resExhaustedHours.json();
  eq(bodyExhaustedHours.degraded, "budget", "Scenario B1: names budget degradation explicitly");
  ok(Array.isArray(bodyExhaustedHours.place.regularOpeningHours?.periods), "Scenario B1: serves structured owned hours under quota exhaustion");

  // Client `fetchPlaceDetail` against a known inventory venue with NO hours yet under quota exhaustion:
  const clientPartial = await fetchPlaceDetail("ChIJpartialKnown");
  eq(clientPartial.partial, true, "Scenario B2: fetchPlaceDetail receives HTTP 200 partial fallback instead of 503");
  eq(clientPartial.ok, false, "Scenario B2: ok=false prevents caching missing hours as permanent truth");
  eq(clientPartial.photo, "https://cdn.gowayfind.test/bayfront.jpg", "Scenario B2: vaulted cover photo still heals card under quota exhaustion");
  eq(simDb.googleCalls, 0, "Scenario B: zero Google calls attempted while quota exhausted");

  // Scenario C: Upstream Google 429 storm degrades to HTTP 200 snapshot
  simDb.quotaExhausted = false;
  simDb.googleStatus = 429;
  const res429 = await detailsPost(
    new Request("https://www.gowayfind.com/api/places/details", {
      method: "POST",
      body: JSON.stringify({ placeId: "ChIJownedHoursOnly", kind: "detail" }),
    }),
  );
  eq(res429.status, 200, "Scenario C: upstream Google 429 degrades to HTTP 200 owned snapshot instead of 502");
  eq(simDb.googleCalls, 1, "Scenario C: upstream 429 occurred once and recovered cleanly");

  // Scenario D: Synthetic request header `x-wf-synthetic: 1` forces zero paid spend
  simDb.googleStatus = 200;
  simDb.googleCalls = 0;
  const resSyn = await detailsPost(
    new Request("https://www.gowayfind.com/api/places/details", {
      method: "POST",
      headers: { "x-wf-synthetic": "1" },
      body: JSON.stringify({ placeId: "ChIJownedHoursOnly", kind: "detail" }),
    }),
  );
  eq(resSyn.status, 200, "Scenario D: synthetic monitor request gets HTTP 200 owned snapshot");
  eq(simDb.googleCalls, 0, "Scenario D: synthetic request spent 0 paid Google calls");

  // Scenario E: Live Google 200 self-heals `signals.owned_hours` + `pdd1|` cache -> second lookup costs 0 Google calls
  simDb.googleStatus = 200;
  simDb.googleCalls = 0;
  const liveFirst = await fetchPlaceDetail("ChIJpartialKnown");
  eq(liveFirst.ok, true, "Scenario E1: justified live lookup succeeds");
  eq(simDb.googleCalls, 1, "Scenario E1: 1 Google call on cold enrichment miss");
  ok(simDb.ownedHoursPatched.includes("ChIJpartialKnown"), "Scenario E1: live lookup self-healed wf_inventory.signals.owned_hours");

  simDb.quotaExhausted = true; // Even if quota exhausts immediately after!
  const cachedSecond = await fetchPlaceDetail("ChIJpartialKnown");
  eq(cachedSecond.ok, true, "Scenario E2: second lookup serves rich self-healed snapshot");
  eq(cachedSecond.source, "cached_detail", "Scenario E2: served from pdd1| cached_detail");
  eq(simDb.googleCalls, 1, "Scenario E2: zero additional Google calls on second lookup");

  const detailTelem = getDetailTelemetry();
  eq(detailTelem.detail_503_returned, 0, "Zero detail 503s across all known-venue simulations");
  eq(detailTelem.detail503Rate, 0, "detail503Rate === 0");
  ok(detailTelem.snapshot_served >= 4, "snapshot_served recorded across pre-spend, quota-exhausted, 429, synthetic, and self-healed hits");
  eq(detailTelem.degraded_partial_served, 1, "degraded_partial_served recorded on unenriched known venue under quota exhaustion");

  if (process.argv.includes("--red-prove")) {
    eq(503, 200, "RED_PROVE: simulated user-facing 503 during quota exhaustion");
  }

  console.log(
    `test-quota-exhaustion-simulation: OK — ${assertions} assertions (owned hours parsers/TTL/holiday/TZ, 5-class spend gate, freshness queue, zero-503 quota exhaustion & 429 recovery, synthetic zero-spend, self-healing writeback)`,
  );
} finally {
  globalThis.fetch = origFetch;
  delete process.env.GOOGLE_MAPS_SERVER_KEY;
  delete process.env.WAYFIND_GATE;
  delete process.env.WF_PRODUCTION_WRITE_CAPABILITY;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}
