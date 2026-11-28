// lib/floridaIntelligenceServer.js — server-only orchestrator for Wayfind's
// Florida Trending & Holiday Intelligence monitor powered by Gemini AI.
//
// Cost & safety invariants:
//   - Visitor requests (readFloridaIntelligence) NEVER call Gemini — they only
//     read the shared Supabase cache (wf_places_cache) or build the zero-LLM
//     deterministic snapshot.
//   - Only the scheduled cron (/api/cron/florida-intelligence) invokes Gemini,
//     always through lib/paidGemini.js (WAYFIND_GATE, atomic monthly request
//     grants and the Gemini circuit breaker). Optional Carbon has its own grant.
//   - Missing GEMINI_API_KEY degrades honestly with explicit status "unconfigured"
//     while still updating deterministic Florida & holiday intelligence.

import { cget, cset, sbEnv } from "./serverCache.js";
import { siteTodayStr } from "./siteTime.js";
import { activeHoliday } from "./holidays.js";
import { GUIDES } from "./guides.js";
import { currentGuides } from "./guideLifecycle.js";
import { FALL_THANKSGIVING_2026 } from "./fallThanksgiving2026.js";
import { geminiKey } from "./geminiKey.js";
import { paidGeminiRequest, extractGeminiText, geminiMonthlyCap, GEMINI_SKU } from "./paidGemini.js";
import { openaiKey } from "./openaiKey.js";
import { paidOpenAiRequest, extractOpenAiText, openaiMonthlyCap, OPENAI_DEFAULT_MODEL, OPENAI_SKU } from "./paidOpenAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "./providerHealth.js";
import { readLedgerUsage } from "./jobPulse.js";
import { resolveOverride } from "./envAudit.js";
import { CARBON_EDITORIAL_LANE, CARBON_EDITORIAL_MODEL } from "./geminiEditorialPolicy.js";
import {
  FLORIDA_INTEL_CACHE_KEY,
  buildCarbonEditorialPrompt,
  buildFloridaIntelligencePacket,
  buildGeminiMonitorPrompt,
  validateGeminiIntelligenceOutput,
  applyGeminiToPacket,
  filterIntelligenceForLocation,
} from "./floridaIntelligence.js";

export const FLORIDA_INTEL_FRESH_TTL_MS = 12 * 3600 * 1000;
export const FLORIDA_INTEL_STALE_TTL_MS = 48 * 3600 * 1000;

// The 60s cron keeps 4s for the snapshot write and 15s for its job pulse.
const EDITORIAL_PROVIDER_BUDGET_MS = 40_000;
const EDITORIAL_FALLBACK_TIMEOUT_MS = 8_000;
const EDITORIAL_CACHE_TIMEOUT_MS = 4_000;

async function withinEditorialDeadline(deadline, limitMs, work) {
  const remaining = Math.floor(deadline - performance.now());
  if (remaining < 2_000) return null;
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, Math.min(limitMs, remaining));
  });
  try {
    return await Promise.race([work(controller.signal), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function tryCarbonEditorial(packet, body, apiKey, request, signal) {
  try {
    const response = await request({ model: CARBON_EDITORIAL_MODEL, apiKey, body, signal }, CARBON_EDITORIAL_LANE);
    if (signal.aborted) return { status: "timeout" };
    if (!response?.ok) {
      if (!response) return { status: "no_response" };
      const refusal = await response.json().catch(() => null);
      if (signal.aborted) return { status: "timeout" };
      if (refusal?.error === "gemini_request_blocked" && refusal.reason === "monthly_request_cap_reached_or_ledger_unavailable") {
        const outcome = await blockedAiOutcome(refusal.reason, CARBON_EDITORIAL_LANE.sku, CARBON_EDITORIAL_LANE.cap);
        return { status: outcome.status };
      }
      return { status: `http_${response.status}` };
    }
    const payload = await response.json();
    const finishReason = payload?.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== "STOP") return { status: "incomplete" };
    const result = validateGeminiIntelligenceOutput(extractGeminiText(payload), packet);
    return result.ok ? { status: "active", validated: result } : { status: "validation_rejected" };
  } catch {
    return { status: "request_failed" };
  }
}

export function floridaIntelligenceAiSkipped(status) {
  return status === "gate_shut" || status === "cap_blocked";
}

async function blockedAiOutcome(reason, sku, cap) {
  if (reason === "gate_shut") return { status: "blocked", reason: "WAYFIND_GATE is missing or invalid" };
  if (reason === "monthly_request_cap_reached_or_ledger_unavailable" && cap) {
    // A refused grant can mean the configured cap was reached or storage failed.
    const usage = await readLedgerUsage(sku);
    if (usage && usage.used >= cap) {
      return { status: "cap_blocked", reason: `${sku} request cap reached (${usage.used}/${cap})` };
    }
    return { status: "blocked", reason: `${sku} grant refused and request cap unconfirmed` };
  }
  if (reason === "provider_unreachable") return { status: "provider_error", reason: "provider unreachable" };
  if (reason === "missing_or_invalid_OPENAI_MONTHLY_REQUEST_CAP" ||
      reason === "missing_or_invalid_GEMINI_MONTHLY_REQUEST_CAP") {
    return { status: "blocked", reason };
  }
  return { status: "blocked", reason: "request blocked by the provider guard" };
}

// Provider bodies and stored breaker reasons can include credentials. Use their
// content for classification only, then persist an allowlisted explanation.
function providerAiFailure(provider, status, body) {
  const noCredits = status === 429 && /no credits remaining/i.test(body);
  const kind = noCredits ? "billing" : classifyProviderFailure(status, body);
  const summary = noCredits ? "no credits remaining"
    : kind === "billing" ? "provider rejected billing or credentials"
    : kind === "quota" ? "provider quota exceeded"
    : status === 401 || status === 403 ? "provider rejected authentication or permissions"
    : "provider request failed";
  return { kind, reason: `${provider} ${status}: ${summary}` };
}

function providerCircuitOutcome(provider, open) {
  const kind = open.kind === "billing" ? "billing" : "quota";
  return { status: "circuit_open", kind, reason: `${provider} ${kind} circuit open` };
}

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
  editorialModel = process.env["GEMINI_EDITORIAL_MODEL"],
  // Test seams for the OpenAI-first lane. Undefined keeps production behavior
  // (real key, real metered request) exactly as before.
  openaiApiKeyOverride = undefined,
  openaiRequestImpl = paidOpenAiRequest,
  inputsOverride = null,
} = {}) {
  const editorialDeadline = performance.now() + EDITORIAL_PROVIDER_BUDGET_MS;
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
  const carbonEnabled = editorialModel === CARBON_EDITORIAL_MODEL;
  const model = modelOverride.status === "malformed" || modelOverride.value?.startsWith(CARBON_EDITORIAL_MODEL)
    ? modelOverride.spec.fallback : modelOverride.value;
  if (modelOverride.status === "malformed") {
    console.error(`[florida-intelligence] GEMINI_MODEL is malformed; falling back to ${model}`);
  }

  const gateShut = process.env.WAYFIND_GATE?.trim().toLowerCase() === "shut";
  const oaiKey = openaiApiKeyOverride !== undefined
    ? String(openaiApiKeyOverride || "").trim()
    : (apiKeyOverride === undefined && geminiRequestImpl === paidGeminiRequest ? openaiKey() : "");
  // Keep the OpenAI outcome while trying Gemini so an unavailable fallback
  // cannot hide the primary provider's actionable failure.
  let openaiFailure = null;
  const key = apiKeyOverride !== undefined ? String(apiKeyOverride || "").trim() : geminiKey();
  let validated = null;
  let aiStatus = gateShut ? "gate_shut" : "unconfigured";
  let aiReason = gateShut ? "WAYFIND_GATE=shut" : "OPENAI_API_KEY / GEMINI_API_KEY is not set";
  let breakerKind = null;
  let activeModel = model;
  let provider = "gemini";
  let carbonFailure = null;
  const boundedEditorial = !gateShut && carbonEnabled && Boolean(key);

  if (boundedEditorial) {
    const body = buildCarbonEditorialPrompt(packet);
    if (body) {
      const carbon = await withinEditorialDeadline(editorialDeadline, CARBON_EDITORIAL_LANE.timeoutMs, async (signal) => {
        const open = await breakerOpenImpl("gemini");
        if (open || signal.aborted) return { status: "circuit_open" };
        return tryCarbonEditorial(packet, body, key, geminiRequestImpl, signal);
      });
      if (carbon?.validated) {
        validated = carbon.validated;
        aiStatus = "active";
        aiReason = null;
        activeModel = CARBON_EDITORIAL_MODEL;
      } else if (carbon?.status !== "circuit_open") {
        const status = carbon?.status || "timeout";
        console.info("[florida-intelligence] Carbon editorial fallback", status);
        if (status !== "cap_blocked") carbonFailure = status;
      }
    }
  }

  const runFallback = (work) => boundedEditorial
    ? withinEditorialDeadline(editorialDeadline, EDITORIAL_FALLBACK_TIMEOUT_MS, work)
    : work();

  if (!gateShut && aiStatus !== "active" && oaiKey) {
    const completed = await runFallback(async (signal) => {
      const open = await breakerOpenImpl("openai");
      if (signal?.aborted) return false;
      if (!open) {
        const promptBody = buildGeminiMonitorPrompt(packet, { includeResearch: true });
        const sysText = promptBody?.systemInstruction?.parts?.map((p) => p.text).join("\n") || "";
        const userText = promptBody?.contents?.[0]?.parts?.map((p) => p.text).join("\n") || "";
        const res = await openaiRequestImpl({
          model: OPENAI_DEFAULT_MODEL,
          apiKey: oaiKey,
          signal,
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
        if (signal?.aborted) return false;
        if (res && res.ok) {
          try {
            const payload = await res.json();
            if (signal?.aborted) return false;
            const text = extractOpenAiText(payload);
            validated = validateGeminiIntelligenceOutput(text, packet);
            if (validated.ok) {
              aiStatus = "active";
              aiReason = null;
              activeModel = OPENAI_DEFAULT_MODEL;
              provider = "openai";
            } else {
              openaiFailure = { status: "validation_rejected", reason: "openai output rejected: " + String(validated.reason || "grounding validator") };
            }
          } catch {
            if (signal?.aborted) return false;
            openaiFailure = { status: "provider_error", reason: "openai response JSON parse failed" };
          }
        } else {
          const status = res ? res.status : 503;
          let errText = "";
          try { errText = res ? (await res.text()).slice(0, 400) : ""; } catch {}
          if (signal?.aborted) return false;
          let blockedReason = "";
          try {
            const parsedErr = JSON.parse(errText);
            if (parsedErr && parsedErr.error === "openai_request_blocked") blockedReason = String(parsedErr.reason || "");
          } catch {}
          if (blockedReason) {
            const outcome = await blockedAiOutcome(blockedReason, OPENAI_SKU, openaiMonthlyCap());
            if (signal?.aborted) return false;
            openaiFailure = { status: outcome.status, reason: "openai blocked: " + outcome.reason };
          } else {
            const { reason, kind } = providerAiFailure("openai", status, errText);
            openaiFailure = { status: "provider_error", reason, kind };
            if (kind) {
              try { await tripBreakerImpl("openai", kind, reason); } catch {}
            }
          }
        }
      } else {
        openaiFailure = providerCircuitOutcome("openai", open);
      }
      return true;
    });
    if (!completed) openaiFailure = { status: "provider_error", reason: "openai editorial deadline reached" };
  }

  if (!gateShut && aiStatus !== "active" && key) {
    const completed = await runFallback(async (signal) => {
      const open = await breakerOpenImpl("gemini");
      if (signal?.aborted) return false;
      if (open) {
        const outcome = providerCircuitOutcome("gemini", open);
        aiStatus = outcome.status;
        breakerKind = outcome.kind;
        aiReason = outcome.reason;
      } else {
        const body = buildGeminiMonitorPrompt(packet);
        const res = await geminiRequestImpl({ model, apiKey: key, body, signal });
        if (signal?.aborted) return false;
        if (res && res.ok) {
          try {
            const payload = await res.json();
            if (signal?.aborted) return false;
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
            if (signal?.aborted) return false;
            aiStatus = "provider_error";
            aiReason = "gemini response JSON parse failed";
          }
        } else {
          const status = res ? res.status : 503;
          let errText = "";
          try { errText = res ? (await res.text()).slice(0, 240) : ""; } catch {}
          if (signal?.aborted) return false;
          let blockedReason = "";
          try {
            const parsedErr = JSON.parse(errText);
            if (parsedErr && parsedErr.error === "gemini_request_blocked") blockedReason = String(parsedErr.reason || "");
          } catch {}

          if (blockedReason) {
            const outcome = await blockedAiOutcome(blockedReason, GEMINI_SKU, geminiMonthlyCap());
            if (signal?.aborted) return false;
            aiStatus = outcome.status;
            aiReason = outcome.reason;
          } else {
            const { kind, reason } = providerAiFailure("gemini", status, errText);
            aiReason = reason;
            if (kind) {
              breakerKind = kind;
              aiStatus = "circuit_tripped";
              try { await tripBreakerImpl("gemini", kind, aiReason); } catch {}
            } else {
              aiStatus = "provider_error";
            }
          }
        }
      }
      return true;
    });
    if (!completed && !breakerKind) {
      aiStatus = "provider_error";
      aiReason = "gemini editorial deadline reached";
    }
  }

  if (aiStatus !== "active" && openaiFailure && (
    aiStatus === "unconfigured" ||
    (floridaIntelligenceAiSkipped(aiStatus) && !floridaIntelligenceAiSkipped(openaiFailure.status)) ||
    (!breakerKind && openaiFailure.kind)
  )) {
    aiStatus = openaiFailure.status;
    aiReason = openaiFailure.reason;
    breakerKind = openaiFailure.kind || null;
    activeModel = OPENAI_DEFAULT_MODEL;
    provider = "openai";
  }
  if (carbonFailure && (aiStatus === "unconfigured" || floridaIntelligenceAiSkipped(aiStatus))) {
    aiStatus = "provider_error";
    aiReason = `Carbon editorial ${carbonFailure}`;
    activeModel = CARBON_EDITORIAL_MODEL;
    provider = "gemini";
  }

  const snapshot = applyGeminiToPacket(packet, validated, {
    model: activeModel,
    provider,
    status: aiStatus,
    reason: aiReason,
    checkedAt: new Date(nowMs).toISOString(),
  });

  const cacheOptions = boundedEditorial ? { signal: AbortSignal.timeout(EDITORIAL_CACHE_TIMEOUT_MS) } : undefined;
  await cacheSetImpl(FLORIDA_INTEL_CACHE_KEY, snapshot, FLORIDA_INTEL_FRESH_TTL_MS, cacheOptions);

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
    const hasKey = !!geminiKey();
    const modelOverride = resolveOverride("GEMINI_MODEL");
    cached = applyGeminiToPacket(packet, null, {
      model: modelOverride.status === "malformed" ? modelOverride.spec.fallback : modelOverride.value,
      status: hasKey ? "awaiting_cron" : "unconfigured",
      reason: hasKey ? "Waiting for next scheduled /api/cron/florida-intelligence run" : "GEMINI_API_KEY is not set",
      checkedAt: now.toISOString(),
    });
  }

  const filtered = filterIntelligenceForLocation(cached, { lat, lng, radiusMi, holidayKey });
  return { ...filtered, cached: !stale && !!cached.monitor, stale };
}
