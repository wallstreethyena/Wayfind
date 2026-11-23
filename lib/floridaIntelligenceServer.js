// lib/floridaIntelligenceServer.js — server-only orchestrator for Wayfind's
// Florida Trending & Holiday Intelligence monitor powered by Gemini AI.
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

async function gatherLiveInputs(today, fetchImpl = fetch) {
  const s = sbEnv();
  const [events, rawInventory, topicRows] = await Promise.all([
    fetchSupabaseJson(
      s,
      `wf_events?select=event_id,slug,event_name,short_title,city,county,state,lat,lng,start_date,end_date,event_status,category,subcategory,tags,editorial_score,popularity_score,card_hook,editorial_summary,why_go&state=eq.FL&end_date=gte.${encodeURIComponent(today)}&order=start_date.asc&limit=120`,
      fetchImpl
    ),
    fetchSupabaseJson(
      s,
      "wf_inventory?select=place_id,name,metro,locality,postal_city,lat,lng,primary_type,category,signals,editorial&status=eq.OPERATIONAL&excluded=is.false&needs_review=is.false&order=refreshed_at.desc&limit=60",
      fetchImpl
    ),
    fetchSupabaseJson(
      s,
      "wf_trend_topics?select=canonical_topic,momentum,trend_score,source_category,observed_at&order=observed_at.desc&limit=20",
      fetchImpl
    ),
  ]);
  const buzzPicks = (Array.isArray(rawInventory) ? rawInventory : [])
    .map((row) => {
      const sig = row && row.signals && typeof row.signals === "object" ? row.signals : {};
      const rating = Number(sig.rating);
      const reviews = Number(sig.reviews ?? sig.userRatingCount);
      return {
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
      };
    })
    .filter((p) => (p.rating == null || p.rating >= 4.4) && (p.reviews == null || p.reviews >= 100));
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
  inputsOverride = null,
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
    holiday,
    thanksgivingEvents: FALL_THANKSGIVING_2026,
  });

  const modelOverride = resolveOverride("GEMINI_MODEL");
  const model = modelOverride.status === "malformed" ? modelOverride.spec.fallback : modelOverride.value;
  if (modelOverride.status === "malformed") {
    console.error(`[florida-intelligence] GEMINI_MODEL="${modelOverride.value}" is malformed — falling back to ${model}`);
  }

  const key = apiKeyOverride !== undefined ? String(apiKeyOverride || "").trim() : geminiKey();
  let validated = null;
  let aiStatus = "unconfigured";
  let aiReason = "GEMINI_API_KEY is not set";
  let breakerKind = null;

  if (key) {
    const open = await breakerOpenImpl("gemini");
    if (open) {
      aiStatus = "circuit_open";
      breakerKind = open.kind || "quota";
      aiReason = `gemini circuit open (${breakerKind}): ${open.reason || "cooldown active"}`;
    } else {
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

  const snapshot = applyGeminiToPacket(packet, validated, {
    model,
    status: aiStatus,
    reason: aiReason,
    checkedAt: new Date(nowMs).toISOString(),
  });

  await cacheSetImpl(FLORIDA_INTEL_CACHE_KEY, snapshot, FLORIDA_INTEL_FRESH_TTL_MS);

  return {
    ok: true,
    today,
    model,
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
    const packet = buildFloridaIntelligencePacket({
      today,
      nowMs: now.getTime(),
      events: [],
      buzzPicks: [],
      trendTopics: [],
      guides,
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
