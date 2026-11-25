#!/usr/bin/env node
// scripts/test-gemini-florida-intelligence.mjs — executable lock test for:
//   1. Holiday intelligence (lib/holidayIntelligence.js + lib/holidays.js):
//      smart per-holiday queries/fit/themes, holiday closure-risk gating (e.g.
//      Bishop Museum on Thanksgiving), honest grounded holiday copy, and audit.
//   2. Florida Trending & Holiday Intelligence core (lib/floridaIntelligence.js):
//      guide staleness detection, verified packet assembly, strict Gemini JSON
//      validation (rejecting unknown IDs, URLs, emails, phones, banned words,
//      dashes, exclamation points), score-boundary purity, and geo honesty.
//   3. Server monitor orchestrator (lib/floridaIntelligenceServer.js):
//      hermetic runs with injected fakes for unconfigured key, active Gemini,
//      quota circuit-trip, and open circuit short-circuit.
//   4. Env/breaker/cron/route/UI wiring parity.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as Hol from "../lib/holidays.js";
import { resolveHolidayContent, resolveHolidayFit } from "../lib/holidayIntelClient.js";
import {
  HOLIDAY_SPECS,
  isLikelyClosedOnHoliday,
  holidayPickCopy,
  matchHolidayGuides,
  auditHolidayPicks,
} from "../lib/holidayIntelligence.js";
import {
  auditTrendingGuideFreshness,
  buildFloridaIntelligencePacket,
  buildGeminiMonitorPrompt,
  validateGeminiIntelligenceOutput,
  applyGeminiToPacket,
  filterIntelligenceForLocation,
} from "../lib/floridaIntelligence.js";
import { localPosterShortlist, posterPlanPromptRows, visiblePosterSubjectKey } from "../lib/posterDaypartPlan.js";
import { runFloridaIntelligenceMonitor } from "../lib/floridaIntelligenceServer.js";
import { classifyProviderFailure } from "../lib/providerHealth.js";
import { KEY_SHAPES } from "../lib/envAudit.js";
import { extractGeminiText } from "../lib/paidGemini.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
const failures = [];
const ok = (cond, msg) => { if (cond) pass++; else failures.push(msg); };

// ── 1. Holiday intelligence & closure-risk protection ─────────────────────────
{
  const tg = resolveHolidayContent("thanksgiving", Hol.contentFor("thanksgiving", "Thanksgiving"));
  const xm = resolveHolidayContent("christmas", Hol.contentFor("christmas", "Christmas"));
  const ny = resolveHolidayContent("newyear", Hol.contentFor("newyear", "New Year's Day"));
  ok(tg === HOLIDAY_SPECS.thanksgiving && !tg.queries.includes("best things to do this weekend"), "thanksgiving uses holiday-specific queries instead of generic weekend fallback");
  ok(xm === HOLIDAY_SPECS.christmas && ny === HOLIDAY_SPECS.newyear, "christmas and newyear resolve to dedicated holiday specs");

  const bishop = { id: "p-bishop", name: "The Bishop Museum of Science and Nature", types: ["museum", "tourist_attraction"] };
  const riverwalk = { id: "p-river", name: "Riverwalk", types: ["park", "tourist_attraction"] };
  const lightsGarden = { id: "p-lights", name: "Selby Botanical Holiday Lights", types: ["botanical_garden", "park"] };
  const verifiedOpenMuseum = { ...bishop, openOnHoliday: true };

  ok(isLikelyClosedOnHoliday(bishop, "thanksgiving") === true, "Bishop Museum is flagged as likely closed on Thanksgiving");
  ok(isLikelyClosedOnHoliday(bishop, "christmas") === true, "Bishop Museum is flagged as likely closed on Christmas");
  ok(isLikelyClosedOnHoliday(verifiedOpenMuseum, "thanksgiving") === false, "a museum with verified openOnHoliday:true is not excluded");
  ok(isLikelyClosedOnHoliday(riverwalk, "thanksgiving") === false, "open-air Riverwalk park stays eligible on Thanksgiving");
  ok(tg.exclude(bishop) === true && tg.exclude(riverwalk) === false, "thanksgiving exclusion gate blocks likely-closed museum and keeps open-air Riverwalk");

  ok(resolveHolidayFit("thanksgiving", lightsGarden, Hol.fitFor) > resolveHolidayFit("thanksgiving", riverwalk, Hol.fitFor), "holiday light garden outscores plain park on Thanksgiving fit");
  ok(resolveHolidayFit("thanksgiving", riverwalk, Hol.fitFor) > 0, "Thanksgiving fit scoring is active (non-zero) for waterfront outdoor venues");
  ok(resolveHolidayFit("christmas", lightsGarden, Hol.fitFor) > 15, "Christmas fit scoring rewards holiday lights and gardens");

  const detCopy = holidayPickCopy(riverwalk, "thanksgiving");
  ok(detCopy.length > 20 && !/crowd-pleaser|review base/i.test(detCopy), "deterministic holiday copy replaces generic crowd-pleaser boilerplate");
  const aiCopy = holidayPickCopy(riverwalk, "thanksgiving", { geminiPick: { why: "Waterfront walk along the Manatee River that stays open all Thanksgiving weekend." } });
  ok(aiCopy.includes("Manatee River"), "validated Gemini holiday copy takes precedence when present");

  const badAudit = auditHolidayPicks([bishop, riverwalk], { holidayKey: "thanksgiving", verifiedEventsCount: 0 });
  ok(badAudit.score < 60 && badAudit.issues.some((i) => i.code === "closure_risk_venue") && badAudit.issues.some((i) => i.code === "missing_verified_events"),
    "holiday quality audit catches closure-risk museums, thin coverage, and missing verified events");

  const matched = matchHolidayGuides({
    "florida-thanksgiving-weekend-2026": { title: "Florida Thanksgiving Weekend 2026", updated: "2026-11-10", region: "Florida" },
    "tampa-tacos": { title: "Best Tacos in Tampa", updated: "2026-11-20", region: "Tampa" },
  }, "thanksgiving");
  ok(matched.length === 1 && matched[0].slug === "florida-thanksgiving-weekend-2026", "matchHolidayGuides links only matching verified holiday guides");
}

// ── 2. Florida Trending & Holiday packet + Gemini grounding validator ─────────
{
  const staleCheck = auditTrendingGuideFreshness({
    "trending-in-florida-this-week-nov-17-2026": { title: "Trending in Florida This Week", updated: "2026-11-17" },
  }, "2026-11-23");
  ok(staleCheck.stale === true && staleCheck.ageDays === 6 && staleCheck.issue?.code === "stale_trending_guide",
    "freshness audit flags a 6-day-old Nov 17 weekly trending guide on Nov 23");

  const freshCheck = auditTrendingGuideFreshness({
    "trending-in-florida-this-week-nov-23-2026": { title: "Trending in Florida This Week", updated: "2026-11-23" },
  }, "2026-11-23");
  ok(freshCheck.stale === false && freshCheck.issue === null, "fresh same-day weekly guide passes freshness audit");

  const packet = buildFloridaIntelligencePacket({
    today: "2026-11-23",
    nowMs: Date.parse("2026-11-23T19:00:00Z"),
    holiday: { key: "thanksgiving", name: "Thanksgiving" },
    guides: {
      "trending-in-florida-this-week-nov-17-2026": { title: "Trending in Florida This Week", updated: "2026-11-17" },
      "florida-thanksgiving-weekend-2026": { title: "Florida Thanksgiving Weekend 2026", updated: "2026-11-10" },
    },
    events: [
      { event_id: "utc-lights", slug: "utc-holidays-2026", event_name: "Holidays at UTC", city: "Sarasota", state: "FL", lat: 27.386, lng: -82.453, start_date: "2026-11-14", end_date: "2027-01-03", tags: ["wf-trending", "holiday"], editorial_score: 8.5, card_hook: "Nightly holiday light shows and outdoor ice skating." },
      { event_id: "miami-show", slug: "miami-boat-2026", event_name: "Miami Holiday Lights", city: "Miami", state: "FL", lat: 25.775, lng: -80.186, start_date: "2026-11-25", end_date: "2026-11-29", tags: ["thanksgiving"], editorial_score: 8.0, card_hook: "Bayfront lights kickoff over Thanksgiving weekend." },
      { event_id: "cancelled-1", slug: "cancelled-evt", event_name: "Cancelled Fest", city: "Tampa", state: "FL", start_date: "2026-11-25", end_date: "2026-11-26", event_status: "cancelled" },
      { event_id: "expired-1", slug: "expired-evt", event_name: "Old Fest", city: "Tampa", state: "FL", start_date: "2026-11-01", end_date: "2026-11-10" },
      { event_id: "non-fl", slug: "chicago-evt", event_name: "Chicago Fest", city: "Chicago", state: "IL", start_date: "2026-11-25", end_date: "2026-11-26" },
    ],
    buzzPicks: [
      { place_id: "pl-river", name: "Bradenton Riverwalk", city: "Bradenton", lat: 27.498, lng: -82.574, primary_type: "park", rating: 4.7, reviews: 5200, popularity: 0.9 },
      { place_id: "pl-bishop", name: "The Bishop Museum of Science and Nature", city: "Bradenton", lat: 27.499, lng: -82.573, primary_type: "museum", rating: 4.6, reviews: 2400, popularity: 0.85 },
    ],
  });

  ok(packet.trendingPicks.some((x) => x.id === "ev:utc-holidays-2026"), "verified active Florida event enters packet");
  ok(!packet.trendingPicks.some((x) => /cancelled-evt|expired-evt|chicago-evt/.test(x.id)), "cancelled, expired, and non-FL events are excluded from packet");
  ok(packet.holiday && !packet.holiday.places.some((p) => p.placeId === "pl-bishop"), "closure-risk museum is filtered out of holiday place picks");
  ok(packet.holiday && packet.holiday.places.some((p) => p.placeId === "pl-river"), "open-air Riverwalk remains in holiday place picks");

  const prompt = buildGeminiMonitorPrompt(packet);
  ok(prompt.generationConfig.responseMimeType === "application/json" && prompt.contents.length === 1, "Gemini prompt requests strict JSON output");
  ok(!Object.hasOwn(JSON.parse(prompt.contents[0].parts[0].text), "research_topics"), "Gemini prompt leaves private research in Wayfind");
  const researchPrompt = buildGeminiMonitorPrompt(packet, { includeResearch: true });
  ok(Object.hasOwn(JSON.parse(researchPrompt.contents[0].parts[0].text), "research_topics"), "the OpenAI prompt can still include internal research");

  const validated = validateGeminiIntelligenceOutput(JSON.stringify({
    floridaBrief: "Thanksgiving week brings nightly Sarasota light shows, bayfront kickoffs, and open coastal walks across Florida.",
    trendingEditorial: [
      { id: "ev:utc-holidays-2026", why: "Nightly light shows and outdoor skating make UTC an easy Thanksgiving week evening plan.", tag: "Holiday lights", timingTip: "Shows start at 6:30 PM nightly." },
      { id: "ev:hallucinated-999", why: "Made up event that was never in the input.", tag: "Fake" },
      { id: "pl:pl-river", why: "This hidden gem boasts stunning views! Visit https://spam.example", tag: "Park" },
    ],
    holidayEditorial: {
      holidayBrief: "Pair Sarasota holiday lights with open waterfront walks over Thanksgiving weekend.",
      picks: [
        { id: "pl:pl-river", why: "Reliable open-air riverfront walk when indoor spots close for Thanksgiving.", closureNote: "Public park remains open daily." },
        { id: "pl:invented", why: "Should be dropped." },
      ],
    },
    monitorNotes: [
      { area: "trending_florida", severity: "high", summary: "Weekly Florida guide is 6 days old and needs refresh.", recommendedFix: "Refresh weekly Florida pulse with Thanksgiving weekend dates." },
    ],
  }), packet);

  ok(validated.ok === true, "valid Gemini JSON output passes grounding validator");
  ok(Boolean(validated.data.trendingById["ev:utc-holidays-2026"]), "grounded event editorial is accepted");
  ok(!validated.data.trendingById["ev:hallucinated-999"], "hallucinated event ID is rejected");
  ok(!validated.data.trendingById["pl:pl-river"], "banned clichés, exclamation point, and URL are rejected");
  ok(Boolean(validated.data.holidayById["pl:pl-river"]) && !validated.data.holidayById["pl:invented"], "grounded holiday pick is accepted while invented ID is rejected");
  ok(validated.rejectedCount >= 3, `rejectedCount records dropped hallucinations/violations (got ${validated.rejectedCount})`);

  const merged = applyGeminiToPacket(packet, validated, { model: "gemini-2.5-flash", status: "active" });
  ok(merged.monitor.aiActive === true && merged.floridaBrief.includes("Sarasota light shows"), "merged snapshot adopts validated Gemini brief");

  // Geo honesty: Parrish, FL -> Bradenton/Sarasota are local (<= 60mi), Miami is statewide (> 60mi)
  const forParrish = filterIntelligenceForLocation(merged, { lat: 27.5689, lng: -82.4393, radiusMi: 60 });
  const utc = forParrish.trendingPicks.find((x) => x.id === "ev:utc-holidays-2026");
  const mia = forParrish.trendingPicks.find((x) => x.id === "ev:miami-boat-2026");
  ok(utc && utc.scope === "local" && utc.distMi < 20, "Sarasota pick is labeled local for Parrish visitor");
  ok(mia && mia.scope === "statewide" && mia.distMi > 150, "Miami pick is honestly labeled statewide (not local) for Parrish visitor");
}

// ── 3. Hermetic server monitor orchestration (zero network) ──────────────────
{
  const fixedInputs = {
    events: [{ event_id: "e1", slug: "utc-holidays-2026", event_name: "Holidays at UTC", city: "Sarasota", state: "FL", lat: 27.386, lng: -82.453, start_date: "2026-11-14", end_date: "2027-01-03", tags: ["wf-trending", "holiday"], editorial_score: 8.5, card_hook: "Nightly light shows." }],
    buzzPicks: [{ place_id: "p1", name: "Riverwalk", city: "Bradenton", lat: 27.498, lng: -82.574, primary_type: "park", rating: 4.7, review_count: 5200 }],
    trendTopics: [],
  };
  let cachedWritten = null;
  const cacheSet = async (_k, v) => { cachedWritten = v; };

  // 3a. Unconfigured key -> zero Gemini call, deterministic snapshot still written
  let called = 0;
  const unconf = await runFloridaIntelligenceMonitor({
    now: new Date("2026-11-23T19:00:00Z"),
    apiKeyOverride: "",
    inputsOverride: fixedInputs,
    geminiRequestImpl: async () => { called++; throw new Error("must not call Gemini without key"); },
    cacheSetImpl: cacheSet,
    breakerOpenImpl: async () => null,
  });
  ok(unconf.ok && unconf.aiStatus === "unconfigured" && called === 0 && Boolean(cachedWritten), "missing GEMINI_API_KEY skips network call and still persists deterministic snapshot");

  // 3a-openai. OpenAI key set, no Gemini key, OpenAI refuses: the run must say
  // WHY (status + scrubbed message), not "key is not set", and trip the breaker.
  {
    const tripped = [];
    const refused = await runFloridaIntelligenceMonitor({
      now: new Date("2026-11-23T19:00:00Z"),
      apiKeyOverride: "",
      openaiApiKeyOverride: "sk-test-fixture",
      openaiRequestImpl: async () => new Response(JSON.stringify({ error: { message: "You exceeded your current quota, please check your plan and billing details.", type: "insufficient_quota" } }), { status: 429 }),
      inputsOverride: fixedInputs,
      geminiRequestImpl: async () => { throw new Error("must not call Gemini without key"); },
      cacheSetImpl: async () => {},
      breakerOpenImpl: async () => null,
      tripBreakerImpl: async (provider, kind) => { tripped.push(provider + ":" + kind); },
    });
    ok(refused.ok && refused.aiStatus === "provider_error" && /^openai 429: .*quota/.test(refused.aiReason || ""), "an OpenAI refusal is reported as provider_error with its status and reason, not as a missing key");
    ok(tripped.includes("openai:quota"), "an OpenAI quota refusal trips the openai breaker");

    const badKey = await runFloridaIntelligenceMonitor({
      now: new Date("2026-11-23T19:00:00Z"),
      apiKeyOverride: "",
      openaiApiKeyOverride: "sk-test-fixture",
      openaiRequestImpl: async () => new Response(JSON.stringify({ error: { message: "Incorrect API key provided: sk-proj-****abcd. You can find your API key at platform.openai.com." } }), { status: 401 }),
      inputsOverride: fixedInputs,
      geminiRequestImpl: async () => { throw new Error("must not call Gemini without key"); },
      cacheSetImpl: async () => {},
      breakerOpenImpl: async () => null,
      tripBreakerImpl: async () => {},
    });
    ok(badKey.aiStatus === "provider_error" && /^openai 401: /.test(badKey.aiReason || "") && !/sk-/.test(badKey.aiReason || ""), "an OpenAI 401 is reported with any key-shaped text scrubbed");

    const noKeys = await runFloridaIntelligenceMonitor({
      now: new Date("2026-11-23T19:00:00Z"),
      apiKeyOverride: "",
      openaiApiKeyOverride: "",
      openaiRequestImpl: async () => { throw new Error("must not call OpenAI without key"); },
      inputsOverride: fixedInputs,
      geminiRequestImpl: async () => { throw new Error("must not call Gemini without key"); },
      cacheSetImpl: async () => {},
      breakerOpenImpl: async () => null,
    });
    ok(noKeys.aiStatus === "unconfigured", "with neither key set the run still reads unconfigured");
  }

  // 3b. Active Gemini response -> validated and merged
  const activeRes = await runFloridaIntelligenceMonitor({
    now: new Date("2026-11-23T19:00:00Z"),
    apiKeyOverride: "AIzaValidFixtureKey00000000000000000000",
    inputsOverride: fixedInputs,
    geminiRequestImpl: async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({
        floridaBrief: "Sarasota holiday lights and Bradenton waterfront walks lead Florida picks this week.",
        trendingEditorial: [{ id: "ev:utc-holidays-2026", why: "Nightly Sarasota light displays open all week." }],
        holidayEditorial: { holidayBrief: "Open waterfront walks and evening light shows fit Thanksgiving week.", picks: [{ id: "pl:p1", why: "Open daily along the riverfront." }] },
        monitorNotes: [],
      }) }] } }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
    cacheSetImpl: cacheSet,
    breakerOpenImpl: async () => null,
  });
  ok(activeRes.ok && activeRes.aiStatus === "active" && activeRes.snapshot.monitor.aiActive === true, "valid Gemini run activates AI brief and persists grounded snapshot");

  // 3c. Gemini 429 RESOURCE_EXHAUSTED -> trips gemini circuit breaker
  let tripped = null;
  const quotaRes = await runFloridaIntelligenceMonitor({
    now: new Date("2026-11-23T19:00:00Z"),
    apiKeyOverride: "AIzaValidFixtureKey00000000000000000000",
    inputsOverride: fixedInputs,
    geminiRequestImpl: async () => new Response('{"error":{"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}', { status: 429 }),
    cacheSetImpl: cacheSet,
    breakerOpenImpl: async () => null,
    tripBreakerImpl: async (provider, kind, reason) => { tripped = { provider, kind, reason }; },
  });
  ok(quotaRes.aiStatus === "circuit_tripped" && quotaRes.breakerKind === "quota" && tripped?.provider === "gemini" && tripped?.kind === "quota",
    "Gemini quota 429 classifies as quota and trips the gemini circuit breaker");

  // 3d. Open breaker -> short-circuits before calling Gemini
  let calledWhenOpen = 0;
  const openRes = await runFloridaIntelligenceMonitor({
    now: new Date("2026-11-23T19:00:00Z"),
    apiKeyOverride: "AIzaValidFixtureKey00000000000000000000",
    inputsOverride: fixedInputs,
    geminiRequestImpl: async () => { calledWhenOpen++; return new Response("{}", { status: 200 }); },
    cacheSetImpl: cacheSet,
    breakerOpenImpl: async () => ({ kind: "billing", reason: "key invalid" }),
  });
  ok(openRes.aiStatus === "circuit_open" && openRes.breakerKind === "billing" && calledWhenOpen === 0, "open gemini breaker skips provider call immediately");
}

// ── 4. Provider health, env audit, extractGeminiText, score boundary, wiring ─
{
  ok(classifyProviderFailure(429, "RESOURCE_EXHAUSTED quota") === "quota", "providerHealth classifies Gemini RESOURCE_EXHAUSTED as quota");
  ok(classifyProviderFailure(400, "API key not valid. Please pass a valid API key.") === "billing", "providerHealth classifies invalid Gemini key as billing");
  ok(extractGeminiText({ candidates: [{ content: { parts: [{ thought: true, text: "thinking" }, { text: '{"ok":true}' }] } }] }) === '{"ok":true}',
    "extractGeminiText ignores thought parts and returns clean text");

  ok(KEY_SHAPES.some((s) => s.key === "GEMINI_API_KEY"), "GEMINI_API_KEY has declared key shape in envAudit");
  const envProbe = (fixtureEnv) => {
    const res = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      'import { resolveOverride, malformedKeys } from "./lib/envAudit.js"; console.log(JSON.stringify({ malformed: malformedKeys().map((m) => m.key), model: resolveOverride("GEMINI_MODEL") }));',
    ], { cwd: REPO, env: { ...fixtureEnv }, encoding: "utf8" });
    if (res.status !== 0) throw new Error(`envProbe failed: ${(res.stderr || res.stdout).slice(0, 300)}`);
    return JSON.parse(res.stdout.trim());
  };
  ok(envProbe({ GEMINI_API_KEY: "sk-ant-wrong-provider-key-00000000000" }).malformed.includes("GEMINI_API_KEY"), "wrong-provider key in GEMINI_API_KEY is flagged malformed");
  ok(!envProbe({ GEMINI_API_KEY: "AIzaSyExampleValidGeminiKeyValue123456" }).malformed.includes("GEMINI_API_KEY"), "valid AIza key passes GEMINI_API_KEY shape check");
  const authKey = "AQ.fixture_" + "0".repeat(40);
  ok(!envProbe({ GEMINI_API_KEY: authKey }).malformed.includes("GEMINI_API_KEY"), "Google AI Studio authorization keys pass the Gemini shape check");
  ok(KEY_SHAPES.some((s) => s.key === "GOOGLE_AI_API_KEY") && !envProbe({ GOOGLE_AI_API_KEY: authKey }).malformed.includes("GOOGLE_AI_API_KEY"), "the Gemini key alias validates Google authorization keys");
  ok(envProbe({ GEMINI_API_KEY: "AQ.short", GOOGLE_AI_API_KEY: "sk-proj-wrong-provider-key" }).malformed.length === 2, "truncated authorization keys and wrong-provider aliases remain malformed");
  const defModel = envProbe({}).model;
  ok(defModel.value === "gemini-2.5-flash" && defModel.status === "default", "GEMINI_MODEL defaults to gemini-2.5-flash");
  ok(envProbe({ GEMINI_MODEL: "gpt-4o" }).model.status === "malformed", "non-Gemini GEMINI_MODEL is flagged malformed");

  // Score boundary purity: intelligence modules never touch displayed Wayfind Score
  for (const rel of ["lib/floridaIntelligence.js", "lib/floridaIntelligenceServer.js", "lib/holidayIntelligence.js"]) {
    const code = read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    ok(!/\bTRENDING_BONUS\b|\bwayfindScore\s*\(|\btoDisplayScore\b/.test(code), `${rel} never touches displayed Wayfind Score or TRENDING_BONUS`);
  }

  // Cron schedule, middleware guard, breaker-reset, and Command Center wiring
  const vercel = JSON.parse(read("vercel.json"));
  const entry = (vercel.crons || []).find((c) => c.path === "/api/cron/florida-intelligence");
  ok(Boolean(entry), "vercel.json schedules /api/cron/florida-intelligence");
  ok(entry && vercel.crons.filter((c) => c.schedule === entry.schedule).length === 1, "florida-intelligence cron schedule does not collide with another cron");
  ok(read("middleware.js").includes('"/api/intelligence/florida"'), "middleware.js protects /api/intelligence/florida");
  ok(read("app/api/cron/breaker-reset/route.js").includes('"gemini"'), "breaker-reset supports gemini");
  ok(read("app/api/command-center/[panel]/route.js").includes("geminiMonitor"), "Command Center intelligence panel surfaces geminiMonitor");
}

// The existing OpenAI cron request only. No provider traffic from fixtures.
{
  const now = new Date("2026-11-25T17:00:00Z");
  const nowDay = "2026-11-25";
  const nearby = { hasLocalOrigin: true, lat: 27.50, lng: -82.55 };
  const inputsOverride = {
    events: [
      { slug: "fixture-today", event_name: "Fixture Today", event_status: "scheduled", start_date: nowDay, end_date: nowDay, lat: 27.50, lng: -82.56, state: "FL" },
      { slug: "fixture-tomorrow", event_name: "Fixture Tomorrow", event_status: "scheduled", start_date: "2026-11-26", lat: 27.50, lng: -82.56, state: "FL" },
      { slug: "fixture-cancelled", event_name: "Fixture Cancelled", event_status: "cancelled", start_date: nowDay, lat: 27.50, lng: -82.56, state: "FL" },
    ],
    buzzPicks: [
      { place_id: "venue-local", name: "Local lunch fixture", city: "Bradenton", lat: 27.52, lng: -82.57, category: "restaurant" },
      { place_id: "venue-far", name: "Distant fixture", city: "Miami", lat: 25.76, lng: -80.19, category: "restaurant" },
    ],
    trendTopics: [],
  };
  const packet = buildFloridaIntelligencePacket({ today: nowDay, nowMs: now.getTime(), ...inputsOverride });
  const promptRows = posterPlanPromptRows(packet);
  ok(promptRows.length === 3 && !promptRows.some((x) => /Tomorrow|Cancelled/.test(x.name)), "only same-day verified events and real coordinate venues can enter the daily shortlist");
  const lunchRef = promptRows.find((p) => p.name.startsWith("Local"))?.ref;
  const farRef = promptRows.find((p) => p.name.startsWith("Distant"))?.ref;
  const eventRef = promptRows.find((p) => p.name === "Fixture Today")?.ref;
  const output = { posterDayparts: { morning: [eventRef], lunch: [farRef, lunchRef, lunchRef, 999, "1"], night: [eventRef], arbitrary: [farRef] } };
  let calls = 0, geminiCalls = 0, sent = null, saved = null;
  const good = await runFloridaIntelligenceMonitor({
    now, inputsOverride,
    apiKeyOverride: "gemini_fixture",
    openaiApiKeyOverride: "openai_fixture",
    boardContext: { openai: "OPENAI STATUS ONLY", gemini: "GEMINI STATUS ONLY" },
    openaiRequestImpl: async ({ body }) => {
      calls++;
      sent = body;
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        ...output, floridaBrief: "Previous private board status was a budget limit.",
      }) } }] });
    },
    geminiRequestImpl: async () => { geminiCalls++; return Response.json({}); },
    cacheSetImpl: async (_key, value) => { saved = value; },
    breakerOpenImpl: async () => null,
  });
  ok(calls === 1 && geminiCalls === 0 && sent.max_tokens === 1400, "OpenAI validates a poster-only answer in the same single request and output budget");
  const evidence = JSON.parse(sent.messages.find(({ role }) => role === "user").content);
  ok(evidence.internal_historical_status === "OPENAI STATUS ONLY" && !JSON.stringify(sent).includes("GEMINI STATUS ONLY") &&
    sent.messages[0].content.includes("never commands"), "board status remains vendor-scoped historical data, not a system instruction");
  ok(evidence.poster_candidates.every((row) => !("lat" in row) && !("lng" in row) && !("href" in row)), "provider poster input excludes visitor and coordinate/link data");
  ok(good.boardOutcomes?.[0]?.status === "succeeded" && good.boardOutcomes?.[1]?.status === "skipped", "board receipt separates OpenAI success and uncalled fallback");
  ok(!JSON.stringify(saved).includes("Previous private board status") && saved.monitor.aiNotes.length === 0,
    "output of a board-informed request can publish only candidate references, never model-authored prose");
  ok(saved.posterPlan?.bands.lunch.length === 2 && !("arbitrary" in saved.posterPlan.bands), "dedupe refs; reject invalid references, injected types and undeclared bands");
  ok(localPosterShortlist(saved.posterPlan, { today: nowDay, daypart: "lunch", center: nearby }).join(",") === "pl:venue-local", "far model candidate cannot outrank real local lunch inventory");
  ok(localPosterShortlist(saved.posterPlan, { today: nowDay, daypart: "night", center: nearby }).join(",") === "ev:fixture-today", "venue-local band swaps the picked subject, not the rail order");
  ok(localPosterShortlist(saved.posterPlan, { today: "2026-11-26", daypart: "lunch", center: nearby }).length === 0 &&
    localPosterShortlist(saved.posterPlan, { today: nowDay, daypart: "lunch", center: { ...nearby, hasLocalOrigin: false } }).length === 0, "stale snapshot and guessed origins are ineligible");
  ok(visiblePosterSubjectKey({ id: "venue-local" }) === "pl:venue-local" &&
    visiblePosterSubjectKey({ id: "venue-local", _sponsored: true }) === null &&
    visiblePosterSubjectKey(null, "/florida-events/fixture-today", { type: "event" }) === "ev:fixture-today" &&
    visiblePosterSubjectKey(null, "https://example.com/florida-events/fixture-today", { type: "event" }) === null, "card join is exact, organic, typed and canonical");
  ok(validateGeminiIntelligenceOutput(output, packet).ok === false, "fallback cannot supply an OpenAI poster plan");
  ok(filterIntelligenceForLocation(saved).posterPlan === saved.posterPlan &&
    filterIntelligenceForLocation({ ...saved, monitor: { provider: "gemini", aiActive: true } }).posterPlan === null, "only the active OpenAI snapshot projects the bounded poster plan");
  let sentGemini = null;
  const fallback = await runFloridaIntelligenceMonitor({
    now, inputsOverride, apiKeyOverride: "gemini_fixture", openaiApiKeyOverride: "openai_fixture",
    boardContext: { openai: "OPENAI STATUS ONLY", gemini: "GEMINI STATUS ONLY" },
    openaiRequestImpl: async () => Response.json({ error: { message: "Quota exceeded" } }, { status: 429 }),
    geminiRequestImpl: async ({ body }) => {
      sentGemini = body;
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ ...output, floridaBrief: "Fixture verified picks." }) }] } }] });
    },
    cacheSetImpl: async () => {}, breakerOpenImpl: async () => null, tripBreakerImpl: async () => {},
  });
  ok(fallback.snapshot.posterPlan === null && fallback.snapshot.monitor.provider === "gemini" &&
    fallback.boardOutcomes[0].signal === "budget_limited", "provider quota preserves deterministic poster behavior and existing Gemini editorial fallback");
  ok(!JSON.parse(sentGemini.contents[0].parts[0].text).internal_historical_status &&
    !JSON.stringify(sentGemini).includes("OPENAI STATUS ONLY"), "prose-generating Gemini fallback receives no private board data");
  ok(/<PosterPlanSeed plan=\{floridaIntel\?\.stale === false/.test(read("app/page.js")) &&
    /const posterDaypartPlan = usePosterPlan\(\)/.test(read("app/components/DaypartRail.js")) &&
    /<PosterSpotlightProvider shortlist=\{spotlight\}>/.test(read("app/components/DaypartRail.js")) &&
    ["app/components/RailCard.js", "app/components/IconicPlaceCard.js"].every((file) => read(file).includes("<PosterSpotlightBadge")), "real homepage forwards a fresh plan to shared poster card renderers, including Trending");
  ok(!/\.\.\.data[\s,}]/.test(read("app/api/intelligence/florida/route.js")) &&
    !/monitor: monitor/.test(read("app/api/intelligence/florida/route.js")), "public API never spreads internal provider or board state");
}

if (failures.length) {
  console.error("test-gemini-florida-intelligence: FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`test-gemini-florida-intelligence: OK — ${pass} assertions passed (holiday intelligence, closure gating, Florida trend freshness, Gemini grounding validator, fail-closed circuit/budget, wiring)`);
