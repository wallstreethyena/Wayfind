// lib/floridaIntelligenceServer.js — server-only orchestrator for Wayfind's
// Florida Trending, Holiday and Poster Intelligence monitor, OpenAI first.
//
// Cost & safety invariants:
//   - Visitor requests (readFloridaIntelligence) NEVER call Gemini — they only
//     read the shared Supabase cache (wf_places_cache) or build the zero-LLM
//     deterministic snapshot.
//   - Only the scheduled cron (/api/cron/florida-intelligence) invokes Gemini,
//     always through lib/paidGemini.js (WAYFIND_GATE + GEMINI_MONTHLY_REQUEST_CAP
//     + atomic wf_spend_take("gemini_requests") + circuit breaker).
//   - Missing GEMINI_API_KEY degrades honestly with explicit status "unconfigured"
//     while still updating deterministic Florida & holiday intelligence.

import { cget, cset, sbEnv } from "./serverCache.js";
import { siteTodayStr } from "./siteTime.js";
import { activeHoliday } from "./holidays.js";
import { GUIDES } from "./guides.js";
import { currentGuides } from "./guideLifecycle.js";
import { FALL_THANKSGIVING_2026 } from "./fallThanksgiving2026.js";
import { geminiKey } from "./geminiKey.js";
import { paidGeminiRequest, extractGeminiText } from "./paidGemini.js";
import { openaiKey } from "./openaiKey.js";
import { paidOpenAiRequest, extractOpenAiText, OPENAI_DEFAULT_MODEL } from "./paidOpenAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "./providerHealth.js";
import { resolveOverride } from "./envAudit.js";
import {
  FLORIDA_INTEL_CACHE_KEY,
  buildFloridaIntelligencePacket,
  buildGeminiMonitorPrompt,
  validateGeminiIntelligenceOutput,
  applyGeminiToPacket,
  filterIntelligenceForLocation,
} from "./floridaIntelligence.js";

export const FLORIDA_INTEL_FRESH_TTL_MS = 12 * 3600 * 1000;
export const FLORIDA_INTEL_STALE_TTL_MS = 48 * 3600 * 1000;

async function fetchSupabaseJson(s, path, fetchImpl = fetch) {
  if (!s || !s.url || !s.key) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_500);
  try {
    const r = await fetchImpl(`${s.url}/rest/v1/${path}`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` },
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSupabaseRpc(s, fnName, args, fetchImpl = fetch) {
  if (!s || !s.url || !s.key) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_500);
  try {
    const r = await fetchImpl(`${s.url}/rest/v1/rpc/${fnName}`, {
      method: "POST",
      headers: {
        apikey: s.key,
        Authorization: `Bearer ${s.key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args || {}),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!r.ok) return [];
    const data = await r.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

const FLORIDA_BUZZ_ANCHORS = [
  { metro: "Tampa Bay", lat: 27.4989, lng: -82.5748 },
  { metro: "Orlando", lat: 28.5383, lng: -81.3792 },
  { metro: "Miami", lat: 25.7617, lng: -80.1918 },
];

async function gatherLiveInputs(today, fetchImpl = fetch) {
  const s = sbEnv();
  if (!s || !s.url || !s.key) return { events: [], buzzPicks: [], trendTopics: [] };
  const [events, rawInventory, topicRows, ...buzzBatches] = await Promise.all([
    fetchSupabaseJson(
      s,
      `wf_events?select=event_id,slug,event_name,short_title,city,county,state,lat,lng,start_date,end_date,event_status,category,subcategory,tags,editorial_score,popularity_score,card_hook,editorial_summary,why_go&state=eq.FL&end_date=gte.${encodeURIComponent(today)}&order=start_date.asc&limit=120`,
      fetchImpl
    ),
    fetchSupabaseJson(
      s,
      "wf_inventory?select=place_id,name,metro,locality,postal_city,lat,lng,primary_type,category,signals,editorial&status=eq.OPERATIONAL&excluded=not.is.true&needs_review=not.is.true&order=refreshed_at.desc&limit=120",
      fetchImpl
    ),
    fetchSupabaseJson(
      s,
      "wf_trend_topics?select=canonical_topic,momentum,trend_score,source_category,observed_at&order=observed_at.desc&limit=20",
      fetchImpl
    ),
    ...FLORIDA_BUZZ_ANCHORS.map((a) =>
      fetchSupabaseRpc(s, "wf_buzz_picks", { p_lat: a.lat, p_lng: a.lng, p_radius_mi: 40, p_max: 8 }, fetchImpl)
    ),
  ]);

  const seenIds = new Set();
  const buzzPicks = [];
  for (let i = 0; i < buzzBatches.length; i++) {
    const anchor = FLORIDA_BUZZ_ANCHORS[i];
    for (const r of Array.isArray(buzzBatches[i]) ? buzzBatches[i] : []) {
      if (!r || !r.place_id || !r.name || seenIds.has(r.place_id)) continue;
      seenIds.add(r.place_id);
      const rating = r.rating != null ? Number(r.rating) : null;
      const reviews = r.reviews != null ? Number(r.reviews) : null;
      buzzPicks.push({
        place_id: r.place_id,
        name: r.name,
        city: r.city || r.locality || anchor.metro,
        metro: anchor.metro,
        lat: r.lat,
        lng: r.lng,
        primary_type: r.primary_type || r.category || "",
        category: r.category || "",
        rating: Number.isFinite(rating) ? rating : null,
        reviews: Number.isFinite(reviews) ? reviews : null,
        popularity: r.popularity != null && Number.isFinite(Number(r.popularity)) ? Number(r.popularity) : null,
        sources_count: r.sources_count != null ? Number(r.sources_count) : 1,
        editorial: r.editorial || "",
      });
    }
  }
  for (const row of Array.isArray(rawInventory) ? rawInventory : []) {
    if (!row || !row.place_id || !row.name || seenIds.has(row.place_id)) continue;
    const sig = row.signals && typeof row.signals === "object" ? row.signals : {};
    const rating = sig.rating != null ? Number(sig.rating) : null;
    const reviews = sig.reviews != null ? Number(sig.reviews) : (sig.userRatingCount != null ? Number(sig.userRatingCount) : null);
    if (rating != null && (!Number.isFinite(rating) || rating < 4.4)) continue;
    if (reviews != null && (!Number.isFinite(reviews) || reviews < 100)) continue;
    if (rating == null && reviews == null) continue;
    seenIds.add(row.place_id);
    buzzPicks.push({
      place_id: row.place_id,
      name: row.name,
      city: row.locality || row.postal_city || row.metro || "Florida",
      metro: row.metro || null,
      lat: row.lat,
      lng: row.lng,
      primary_type: row.primary_type || row.category || "",
      category: row.category || "",
      rating: Number.isFinite(rating) ? rating : null,
      reviews: Number.isFinite(reviews) ? reviews : null,
      editorial: row.editorial || "",
    });
  }
  return { events, buzzPicks, trendTopics: topicRows };
}

/**
 * Run one full Florida Trending & Holiday Intelligence monitoring cycle.
 * Called by /api/cron/florida-intelligence (CRON_SECRET-gated).
 */
export async function runFloridaIntelligenceMonitor({
  now = new Date(),
  fetchImpl = fetch,
  geminiRequestImpl = paidGeminiRequest,
  cacheSetImpl = cset,
  breakerOpenImpl = breakerOpen,
  tripBreakerImpl = tripBreaker,
  apiKeyOverride = undefined,
  // Test seams for the OpenAI-first lane. Undefined keeps production behavior
  // (real key, real metered request) exactly as before.
  openaiApiKeyOverride = undefined,
  openaiRequestImpl = paidOpenAiRequest,
  inputsOverride = null,
  boardContext = null, // internal data only; the cron supplies provider-scoped safe strings
} = {}) {
  const today = siteTodayStr(now);
  const nowMs = now.getTime();
  const holiday = activeHoliday(now);
  const guides = currentGuides(GUIDES);

  const liveInputs = inputsOverride || (await gatherLiveInputs(today, fetchImpl));
  const packet = buildFloridaIntelligencePacket({
    today,
    nowMs,
    events: liveInputs.events,
    buzzPicks: liveInputs.buzzPicks,
    trendTopics: liveInputs.trendTopics,
    guides,
    allGuides: GUIDES,
    holiday,
    thanksgivingEvents: FALL_THANKSGIVING_2026,
  });

  const modelOverride = resolveOverride("GEMINI_MODEL");
  const model = modelOverride.status === "malformed" ? modelOverride.spec.fallback : modelOverride.value;
  if (modelOverride.status === "malformed") {
    console.error(`[florida-intelligence] GEMINI_MODEL="${modelOverride.value}" is malformed — falling back to ${model}`);
  }

  const oaiKey = openaiApiKeyOverride !== undefined
    ? String(openaiApiKeyOverride || "").trim()
    : (apiKeyOverride === undefined && geminiRequestImpl === paidGeminiRequest ? openaiKey() : "");
  // Why the OpenAI lane produced nothing usable. Before 2026-11-25 a failed
  // OpenAI call fell through silently, so with no Gemini key the run reported
  // "OPENAI_API_KEY / GEMINI_API_KEY is not set" while the OpenAI key WAS set
  // and every call was being refused. Now the real reason reaches the pulse note.
  let openaiFailure = null;
  let openaiSignal = "provider_unavailable";
  let openaiSkipped = false;
  const key = apiKeyOverride !== undefined ? String(apiKeyOverride || "").trim() : geminiKey();
  let validated = null;
  let aiStatus = "unconfigured";
  let aiReason = "OPENAI_API_KEY / GEMINI_API_KEY is not set";
  let breakerKind = null;
  let activeModel = model;
  let provider = "gemini";

  if (oaiKey) {
    const open = await breakerOpenImpl("openai");
    if (!open) {
      const privateContext = typeof boardContext?.openai === "string" && boardContext.openai.length <= 1500 ? boardContext.openai : "";
      const promptBody = buildGeminiMonitorPrompt(packet, { includeResearch: true, includePosterPlan: true, boardContext: privateContext });
      const sysText = promptBody?.systemInstruction?.parts?.map((p) => p.text).join("\n") || "";
      const userText = promptBody?.contents?.[0]?.parts?.map((p) => p.text).join("\n") || "";
      const res = await openaiRequestImpl({
        model: OPENAI_DEFAULT_MODEL,
        apiKey: oaiKey,
        body: {
          max_tokens: promptBody?.generationConfig?.maxOutputTokens || 1400,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            ...(sysText ? [{ role: "system", content: sysText }] : []),
            { role: "user", content: userText },
          ],
        },
      });
      if (res && res.ok) {
        try {
          const payload = await res.json();
          const text = extractOpenAiText(payload);
          validated = validateGeminiIntelligenceOutput(text, packet, { allowPosterPlan: true, allowEditorial: !privateContext });
          if (validated.ok) {
            aiStatus = "active";
            aiReason = null;
            activeModel = OPENAI_DEFAULT_MODEL;
            provider = "openai";
          } else {
            openaiFailure = "openai output rejected: " + String(validated.reason || "grounding validator");
          }
        } catch { openaiFailure = "openai response JSON parse failed"; /* fall through to Gemini */ }
      } else {
        const status = res ? res.status : 503;
        let errText = "";
        try { errText = res ? (await res.text()).slice(0, 400) : ""; } catch {}
        let blockedReason = "";
        try {
          const parsedErr = JSON.parse(errText);
          if (parsedErr && parsedErr.error === "openai_request_blocked") blockedReason = String(parsedErr.reason || "");
        } catch {}
        if (blockedReason) {
          openaiFailure = "openai blocked: " + blockedReason;
          if (/cap|quota|gate|budget/i.test(blockedReason)) openaiSignal = "budget_limited";
          if (/missing|invalid/i.test(blockedReason)) openaiSignal = "configuration_missing";
        } else {
          // Strip anything key-shaped OpenAI echoes back (its 401 quotes a masked key).
          const safeText = errText.replace(/sk-[A-Za-z0-9_*.-]+/g, "[key]").replace(/\s+/g, " ").slice(0, 140);
          openaiFailure = `openai ${status}: ${safeText}`;
          const kind = classifyProviderFailure(status, errText);
          if (kind === "quota" || kind === "billing") openaiSignal = "budget_limited";
          if (kind) {
            try { await tripBreakerImpl("openai", kind, openaiFailure); } catch {}
          }
        }
      }
    } else {
      openaiSkipped = true;
      if (open.kind === "quota" || open.kind === "billing") openaiSignal = "budget_limited";
      openaiFailure = `openai circuit open (${open.kind || "quota"}): ${open.reason || "cooldown active"}`;
    }
  }

  if (aiStatus !== "active" && key) {
    const open = await breakerOpenImpl("gemini");
    if (open) {
      aiStatus = "circuit_open";
      breakerKind = open.kind || "quota";
      aiReason = `gemini circuit open (${breakerKind}): ${open.reason || "cooldown active"}`;
    } else {
      // This legacy fallback generates public prose, so it does not receive board data.
      const body = buildGeminiMonitorPrompt(packet);
      const res = await geminiRequestImpl({ model, apiKey: key, body });
      if (res && res.ok) {
        try {
          const payload = await res.json();
          const text = extractGeminiText(payload);
          validated = validateGeminiIntelligenceOutput(text, packet);
          if (validated.ok) {
            aiStatus = "active";
            aiReason = null;
          } else {
            aiStatus = "validation_rejected";
            aiReason = validated.reason || "gemini output rejected by grounding validator";
          }
        } catch {
          aiStatus = "provider_error";
          aiReason = "gemini response JSON parse failed";
        }
      } else {
        const status = res ? res.status : 503;
        let errText = "";
        try { errText = res ? (await res.text()).slice(0, 240) : ""; } catch {}
        let blockedReason = "";
        try {
          const parsedErr = JSON.parse(errText);
          if (parsedErr && parsedErr.error === "gemini_request_blocked") blockedReason = String(parsedErr.reason || "");
        } catch {}

        if (blockedReason) {
          aiStatus = blockedReason === "gate_shut" ? "gate_shut"
            : blockedReason.includes("cap") ? "cap_blocked"
            : "blocked";
          aiReason = blockedReason;
        } else {
          const kind = classifyProviderFailure(status, errText);
          if (kind) {
            breakerKind = kind;
            aiStatus = "circuit_tripped";
            aiReason = `gemini ${status}: ${errText.slice(0, 140)}`;
            try { await tripBreakerImpl("gemini", kind, aiReason); } catch {}
          } else {
            aiStatus = "provider_error";
            aiReason = `gemini HTTP ${status}`;
          }
        }
      }
    }
  }

  // No Gemini key, OpenAI key present but its call failed: report the OpenAI
  // failure, not "key is not set".
  if (aiStatus === "unconfigured" && openaiFailure) {
    aiStatus = "provider_error";
    aiReason = openaiFailure;
  }

  const snapshot = applyGeminiToPacket(packet, validated, {
    model: activeModel,
    provider,
    status: aiStatus,
    reason: aiReason,
    checkedAt: new Date(nowMs).toISOString(),
  });

  await cacheSetImpl(FLORIDA_INTEL_CACHE_KEY, snapshot, FLORIDA_INTEL_FRESH_TTL_MS);

  return {
    ok: true,
    today,
    model: activeModel,
    aiStatus,
    aiReason,
    breakerKind,
    healthScore: snapshot.qualityAudit.healthScore,
    auditStatus: snapshot.qualityAudit.status,
    issuesCount: snapshot.qualityAudit.issues.length,
    trendingCount: snapshot.trendingPicks.length,
    holidayKey: snapshot.holiday ? snapshot.holiday.key : null,
    snapshot,
    // Cron-internal board receipts only. No raw error, prompt or key.
    boardOutcomes: [
      provider === "openai" && aiStatus === "active"
        ? { provider: "openai", status: snapshot.posterPlan ? "succeeded" : "degraded", signal: snapshot.posterPlan ? "none" : "deterministic_fallback" }
        : { provider: "openai", status: oaiKey && !openaiSkipped ? "unavailable" : "skipped", signal: oaiKey ? openaiSignal : "configuration_missing" },
      provider === "openai" && aiStatus === "active"
        ? { provider: "gemini", status: "skipped", signal: "none" }
        : provider === "gemini" && aiStatus === "active"
          ? { provider: "gemini", status: "succeeded", signal: "none" }
          : { provider: "gemini", status: key && aiStatus !== "circuit_open" ? "unavailable" : "skipped",
            signal: !key ? "configuration_missing" : breakerKind || /cap|gate/.test(aiStatus) ? "budget_limited" : "provider_unavailable" },
    ],
  };
}

/**
 * Read-only visitor & Command Center accessor. NEVER invokes Gemini — reads
 * the shared server cache, falling back to an on-demand deterministic packet
 * when cache is cold so pages stay fast and never spend on visitor traffic.
 */
export async function readFloridaIntelligence({
  lat = null,
  lng = null,
  radiusMi = 60,
  holidayKey = null,
  now = new Date(),
  cacheGetImpl = cget,
  fetchImpl = fetch,
  allowLiveFallback = true,
} = {}) {
  let cached = null;
  let stale = false;
  try {
    const hit = await cacheGetImpl(FLORIDA_INTEL_CACHE_KEY, { staleMs: FLORIDA_INTEL_STALE_TTL_MS });
    if (hit && hit.v && typeof hit.v === "object") {
      cached = hit.v;
      stale = !!hit.stale;
    }
  } catch {}

  if (!cached) {
    const today = siteTodayStr(now);
    const holiday = activeHoliday(now);
    const guides = currentGuides(GUIDES);
    const liveInputs = allowLiveFallback
      ? await gatherLiveInputs(today, fetchImpl).catch(() => ({ events: [], buzzPicks: [], trendTopics: [] }))
      : { events: [], buzzPicks: [], trendTopics: [] };
    const packet = buildFloridaIntelligencePacket({
      today,
      nowMs: now.getTime(),
      events: liveInputs.events,
      buzzPicks: liveInputs.buzzPicks,
      trendTopics: liveInputs.trendTopics,
      guides,
      allGuides: GUIDES,
      holiday,
      thanksgivingEvents: FALL_THANKSGIVING_2026,
    });
    const hasOpenAi = !!openaiKey();
    const hasKey = hasOpenAi || !!geminiKey();
    const modelOverride = resolveOverride("GEMINI_MODEL");
    cached = applyGeminiToPacket(packet, null, {
      model: modelOverride.status === "malformed" ? modelOverride.spec.fallback : modelOverride.value,
      provider: hasOpenAi ? "openai" : "gemini",
      status: hasKey ? "awaiting_cron" : "unconfigured",
      reason: hasKey ? "Waiting for next scheduled /api/cron/florida-intelligence run" : "OPENAI_API_KEY / GEMINI_API_KEY is not set",
      checkedAt: now.toISOString(),
    });
  }

  const filtered = filterIntelligenceForLocation(cached, { lat, lng, radiusMi, holidayKey });
  return { ...filtered, cached: !stale && !!cached.monitor, stale };
}
