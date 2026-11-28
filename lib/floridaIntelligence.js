// lib/floridaIntelligence.js — pure Florida Trending & Holiday Intelligence
// core, Gemini AI monitor prompt builder, strict grounded output validator,
// and geo-honest location filtering.
//
// Standing boundaries (AGENTS.md §8, §12, scripts/check-trend-integrity.mjs):
//   - NEVER modifies or reads displayed Wayfind Score or TRENDING_BONUS.
//   - NEVER reads commission, affiliate, payout, or sponsored fields.
//   - NEVER allows Gemini output to invent IDs, URLs, emails, phone numbers,
//     unverified hours, or banned editorial clichés.
//   - Pure & zero-network so every rule is unit-tested and red-provable.

import { isLikelyClosedOnHoliday, auditHolidayPicks, matchHolidayGuides } from "./holidayIntelligence.js";
import { assessedScore } from "./eventAssessment.js";
import { CARBON_EDITORIAL_MAX_BYTES, CARBON_EDITORIAL_MAX_OUTPUT_TOKENS } from "./geminiEditorialPolicy.js";

export const FLORIDA_INTEL_SCHEMA_VERSION = "wayfind-florida-intel-v1";
export const FLORIDA_INTEL_CACHE_KEY = "florida-intel|v1|live";
export const TRENDING_GUIDE_STALE_DAYS = 5;

const ISO_DAY_RX = /^\d{4}-\d{2}-\d{2}$/;
const BANNED_EDITORIAL_RX = /\b(hidden gem|nestled|boasts|stunning|must[- ]see|must[- ]try|iconic|vibrant|bustling|elevate|unforgettable|world[- ]class|busiest|packed|wait time)\b/i;
const FORBIDDEN_CONTACT_RX = /(https?:\/\/|www\.|mailto:|@[\w.-]+\.[a-z]{2,}|\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b)/i;
const EARTH_R_MI = 3958.7554;

function dayNumber(isoDay) {
  if (!ISO_DAY_RX.test(String(isoDay || ""))) return null;
  const ms = Date.parse(`${isoDay}T12:00:00Z`);
  return Number.isFinite(ms) ? Math.floor(ms / 86400000) : null;
}

export function haversineMiles(aLat, aLng, bLat, bLng) {
  if (![aLat, aLng, bLat, bLng].every((v) => typeof v === "number" && Number.isFinite(v))) return null;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_R_MI * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(Math.max(0, 1 - s)));
}

function cleanPlainSentence(raw, maxLen = 190) {
  if (typeof raw !== "string") return "";
  let s = raw
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^["']+|["']+$/g, "")
    .trim();
  if (!s) return "";
  if (FORBIDDEN_CONTACT_RX.test(s)) return "";
  if (BANNED_EDITORIAL_RX.test(s)) return "";
  if (/[!—–]/.test(s)) return "";
  if (s.length > maxLen) {
    s = s.slice(0, maxLen).replace(/\s+\S*$/, "").trim();
  }
  return s;
}

/**
 * Audit the newest "trending-in-florida-this-week-*" guide for freshness.
 */
export function auditTrendingGuideFreshness(guides, todayStr) {
  const todayN = dayNumber(todayStr);
  const list = Object.entries(guides && typeof guides === "object" ? guides : {})
    .filter(([slug, g]) => slug.startsWith("trending-in-florida-this-week-") && g)
    .map(([slug, g]) => ({
      slug,
      title: g.title || slug,
      updated: String(g.updated || ""),
      href: "/guides/" + slug,
    }))
    .sort((a, b) => b.updated.localeCompare(a.updated) || b.slug.localeCompare(a.slug));

  const latest = list[0] || null;
  if (!latest) {
    return {
      latest: null,
      ageDays: null,
      stale: true,
      issue: {
        code: "missing_trending_guide",
        severity: "high",
        area: "trending_florida",
        summary: "No weekly Florida trending guide is currently published.",
        recommendedFix: "Publish or refresh a dated Florida trending pulse from verified events and venue demand.",
      },
    };
  }
  const updatedN = dayNumber(latest.updated);
  const ageDays = todayN != null && updatedN != null ? Math.max(0, todayN - updatedN) : null;
  const stale = ageDays != null && ageDays > TRENDING_GUIDE_STALE_DAYS;
  return {
    latest,
    ageDays,
    stale,
    issue: stale
      ? {
          code: "stale_trending_guide",
          severity: "high",
          area: "trending_florida",
          summary: `Latest Florida trending guide (${latest.slug}) was updated ${ageDays} days ago (${latest.updated}).`,
          recommendedFix: "Refresh Florida trending highlights from live verified events, buzz movers, and regional signals.",
        }
      : null,
  };
}

function classifyTrendingBucket(item) {
  const hay = `${item.name || ""} ${item.category || ""} ${item.subcategory || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
  if (/thanksgiving|christmas|holiday|lights|tree lighting|turkey trot|new year/.test(hay)) return "holiday";
  if (/fest|festival|faire|carnival|market|parade|expo/.test(hay)) return "festivals";
  if (/food|restaurant|dining|brunch|bbq|seafood|taco|steak|bakery|coffee|wine|beer|taste/.test(hay)) return "food";
  if (/nightlife|bar|cocktail|dj|party|club|lounge|rooftop/.test(hay)) return "nightlife";
  if (/concert|comedy|theater|theatre|show|symphony|music|game|arena|stadium/.test(hay)) return "shows";
  return "outdoors";
}

/**
 * Assemble a verified, deterministic Florida Trending + Holiday intelligence
 * packet from real Wayfind inputs. Works 100% deterministically even when
 * Gemini AI is unconfigured, capped, or circuit-open.
 */
export function buildFloridaIntelligencePacket({
  today,
  nowMs = Date.now(),
  events = [],
  buzzPicks = [],
  trendTopics = [],
  guides = {},
  allGuides = null,
  holiday = null,
  thanksgivingEvents = [],
} = {}) {
  if (!ISO_DAY_RX.test(String(today || ""))) {
    throw new Error("buildFloridaIntelligencePacket requires an Eastern YYYY-MM-DD today date");
  }
  const todayN = dayNumber(today);
  const horizonEndN = todayN + 10;

  // 1. Verified active/upcoming Florida events (within next 10 days)
  const rawEvents = [
    ...(Array.isArray(events) ? events : []),
    ...(holiday && holiday.key === "thanksgiving" && Array.isArray(thanksgivingEvents) ? thanksgivingEvents : []),
  ];
  const seenEventIds = new Set();
  const activeEvents = [];
  for (const e of rawEvents) {
    if (!e) continue;
    const status = String(e.event_status || "scheduled").toLowerCase();
    if (["cancelled", "postponed", "unannounced"].includes(status)) continue;
    const state = String(e.state || "FL").toUpperCase();
    if (state !== "FL" && state !== "FLORIDA") continue;
    const start = String(e.start_date || "").slice(0, 10);
    const end = String(e.end_date || start).slice(0, 10);
    const startN = dayNumber(start);
    const endN = dayNumber(end);
    if (startN == null || endN == null) continue;
    if (endN < todayN || startN > horizonEndN) continue;
    const id = String(e.slug || e.event_id || "").trim();
    const name = String(e.short_title || e.event_name || "").trim();
    if (!id || !name || seenEventIds.has(id)) continue;
    seenEventIds.add(id);

    const tags = Array.isArray(e.tags) ? e.tags.map((t) => String(t).toLowerCase()) : [];
    const isHolidayMatch = holiday
      ? tags.includes(holiday.key) || new RegExp(`\\b${holiday.key}\\b`, "i").test(`${name} ${e.card_hook || ""} ${e.editorial_summary || ""}`)
      : false;
    const isTrendingTagged = tags.includes("wf-trending");
    const editorialScore = assessedScore(e, "editorial_score");
    const popScore = assessedScore(e, "popularity_score");

    activeEvents.push({
      id: "ev:" + id,
      kind: "event",
      slug: e.slug || id,
      href: e.slug ? "/florida-events/" + e.slug : null,
      name,
      city: String(e.city || "Florida").trim(),
      metro: String(e.metro || e.region || "").trim() || null,
      lat: Number.isFinite(Number(e.lat)) ? Number(e.lat) : null,
      lng: Number.isFinite(Number(e.lng)) ? Number(e.lng) : null,
      startDate: start,
      endDate: end,
      bucket: classifyTrendingBucket({ name, category: e.category, subcategory: e.subcategory, tags }),
      tags,
      isHolidayMatch,
      isTrendingTagged,
      signalStrength: Math.min(100, Math.round((isTrendingTagged ? 30 : 0) + (isHolidayMatch ? 20 : 0) + editorialScore * 5 + popScore * 3)),
      facts: cleanPlainSentence(e.card_hook || e.editorial_summary || e.why_go || "", 160),
    });
  }
  activeEvents.sort((a, b) => b.signalStrength - a.signalStrength || a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));

  // 2. Verified buzzing Florida places (real venue popularity, never paid placement)
  const seenPlaceIds = new Set();
  const activeBuzz = [];
  for (const p of Array.isArray(buzzPicks) ? buzzPicks : []) {
    if (!p) continue;
    const pid = String(p.place_id || p.id || "").trim();
    const name = String(p.name || "").trim();
    if (!pid || !name || seenPlaceIds.has(pid)) continue;
    seenPlaceIds.add(pid);
    const closedRisk = holiday ? isLikelyClosedOnHoliday(p, holiday.key) : false;
    activeBuzz.push({
      id: "pl:" + pid,
      kind: "place",
      placeId: pid,
      href: "/?q=" + encodeURIComponent(name),
      name,
      city: String(p.city || p.metro || "Florida").trim(),
      metro: String(p.metro || "").trim() || null,
      category: String(p.primary_type || p.primaryType || p.category || "").trim(),
      lat: Number.isFinite(Number(p.lat)) ? Number(p.lat) : null,
      lng: Number.isFinite(Number(p.lng)) ? Number(p.lng) : null,
      rating: Number.isFinite(Number(p.rating)) ? Number(p.rating) : null,
      reviews: Number.isFinite(Number(p.reviews || p.review_count)) ? Number(p.reviews || p.review_count) : null,
      popularity: Number.isFinite(Number(p.popularity || p.tier2_popularity)) ? Number(p.popularity || p.tier2_popularity) : null,
      sourcesCount: Number(p.sources_count) || 0,
      bucket: classifyTrendingBucket({ name, category: p.primary_type || p.category }),
      closureRisk: closedRisk,
      facts: cleanPlainSentence(p.editorial || p.trend_reason || "", 150),
    });
  }
  activeBuzz.sort((a, b) => (b.popularity || 0) - (a.popularity || 0) || (b.reviews || 0) - (a.reviews || 0));

  // 3. Verified research trend topics (private research context only, never score input)
  const activeTopics = (Array.isArray(trendTopics) ? trendTopics : [])
    .filter((t) => t && t.canonical_topic)
    .slice(0, 12)
    .map((t) => ({
      topic: String(t.canonical_topic).slice(0, 80),
      momentum: String(t.momentum || "watch"),
      score: Number.isFinite(Number(t.trend_score)) ? Number(t.trend_score) : null,
      scope: String(t.source_category || "").slice(0, 48),
    }));

  // 4. Combine verified Florida trending shortlist (bounded for fast delivery & small prompt)
  const trendingEvents = activeEvents.slice(0, 14);
  const trendingPlaces = activeBuzz.slice(0, 12);
  const trendingPicks = [...trendingEvents, ...trendingPlaces].slice(0, 20);

  // 5. Active holiday picks & quality audit
  const holidayKey = holiday && holiday.key ? String(holiday.key) : null;
  const holidayEvents = holidayKey
    ? activeEvents.filter((e) => e.isHolidayMatch || (holidayKey === "thanksgiving" && e.tags.includes("holiday"))).slice(0, 10)
    : [];
  const holidayPlaces = holidayKey
    ? activeBuzz.filter((p) => !p.closureRisk).slice(0, 8)
    : [];
  const holidayGuides = holidayKey ? matchHolidayGuides(guides, holidayKey) : [];
  const holidayAudit = holidayKey
    ? auditHolidayPicks([...holidayEvents, ...holidayPlaces], { holidayKey, verifiedEventsCount: holidayEvents.length })
    : { score: 100, status: "healthy", issues: [], closedRiskNames: [] };

  // 6. Freshness audit on Trending in Florida guide + overall monitor health
  const guideAudit = auditTrendingGuideFreshness(allGuides || guides, today);
  const issues = [];
  if (guideAudit.issue) issues.push(guideAudit.issue);
  if (trendingEvents.length < 3) {
    issues.push({
      code: "thin_trending_events",
      severity: "medium",
      area: "trending_florida",
      summary: `Only ${trendingEvents.length} verified Florida events are active in the next 10 days.`,
      recommendedFix: "Verify upcoming Florida events in wf_events so the weekly strip and Trending Now shelves stay full.",
    });
  }
  if (trendingPlaces.length < 3) {
    issues.push({
      code: "thin_trending_places",
      severity: "medium",
      area: "trending_florida",
      summary: `Only ${trendingPlaces.length} verified high-demand Florida venues surfaced in the current buzz pool.`,
      recommendedFix: "Confirm popularity cron health so metro demand signals stay fresh.",
    });
  }
  for (const iss of holidayAudit.issues) issues.push(iss);

  let healthScore = 100;
  for (const iss of issues) {
    healthScore -= iss.severity === "high" ? 20 : iss.severity === "medium" ? 10 : 5;
  }
  healthScore = Math.max(0, Math.min(100, healthScore));
  const auditStatus = healthScore >= 80 ? "healthy" : healthScore >= 55 ? "needs_attention" : "stale";

  // Deterministic fallback brief (used whenever Gemini is off/capped/unavailable)
  const topCities = [...new Set(trendingPicks.map((x) => x.city).filter(Boolean))].slice(0, 3);
  const deterministicFloridaBrief = trendingEvents.length
    ? `Tracking ${trendingEvents.length} verified Florida happenings and ${trendingPlaces.length} local standouts across ${topCities.join(", ") || "Florida"} this week.`
    : `Tracking ${trendingPlaces.length} verified local spots across Florida right now.`;

  const deterministicHolidayBrief = holidayKey
    ? holidayEvents.length
      ? `${holidayEvents.length} verified ${holiday.name} events and ${holidayPlaces.length} open-friendly spots curated across Florida.`
      : `Holiday picks filtered to avoid likely ${holiday.name} closures. Verify holiday hours before heading out.`
    : null;

  return {
    schemaVersion: FLORIDA_INTEL_SCHEMA_VERSION,
    today,
    generatedAt: new Date(nowMs).toISOString(),
    floridaBrief: deterministicFloridaBrief,
    trendingPicks,
    topics: activeTopics,
    guideFreshness: {
      latestSlug: guideAudit.latest ? guideAudit.latest.slug : null,
      latestUpdated: guideAudit.latest ? guideAudit.latest.updated : null,
      ageDays: guideAudit.ageDays,
      stale: guideAudit.stale,
    },
    holiday: holidayKey
      ? {
          key: holidayKey,
          name: holiday.name,
          brief: deterministicHolidayBrief,
          events: holidayEvents,
          places: holidayPlaces,
          guides: holidayGuides,
          audit: {
            score: holidayAudit.score,
            status: holidayAudit.status,
            closedRiskNames: holidayAudit.closedRiskNames,
          },
        }
      : null,
    qualityAudit: {
      healthScore,
      status: auditStatus,
      issues,
    },
  };
}

/**
 * Build the grounded JSON request payload for Gemini AI (`paidGeminiRequest`).
 * Sends ONLY verified IDs and factual fields — zero PII, zero affiliate data.
 */
export function buildGeminiMonitorPrompt(packet, { includeResearch = false } = {}) {
  const compactEvidence = {
    today_et: packet.today,
    guide_freshness: packet.guideFreshness,
    active_holiday: packet.holiday
      ? {
          key: packet.holiday.key,
          name: packet.holiday.name,
          events: packet.holiday.events.slice(0, 8).map((e) => ({
            id: e.id,
            name: e.name,
            city: e.city,
            dates: `${e.startDate} to ${e.endDate}`,
            facts: e.facts,
          })),
          places: packet.holiday.places.slice(0, 6).map((p) => ({
            id: p.id,
            name: p.name,
            city: p.city,
            category: p.category,
            facts: p.facts,
          })),
          deterministic_issues: packet.qualityAudit.issues.filter((i) => i.area === "holiday_special").map((i) => i.summary),
        }
      : null,
    trending_florida: packet.trendingPicks.slice(0, 14).map((x) => ({
      id: x.id,
      kind: x.kind,
      name: x.name,
      city: x.city,
      bucket: x.bucket,
      dates: x.startDate ? `${x.startDate} to ${x.endDate}` : null,
      category: x.category || null,
      facts: x.facts,
    })),
    detected_issues: packet.qualityAudit.issues.map((i) => ({ area: i.area, severity: i.severity, summary: i.summary })),
  };
  if (includeResearch) {
    compactEvidence.research_topics = packet.topics.slice(0, 8).map((t) => ({ topic: t.topic, momentum: t.momentum }));
  }

  const systemInstruction =
    "You are the Wayfind Florida Intelligence Monitor. Analyze ONLY the verified JSON evidence supplied below and return strict JSON. " +
    "RULES: " +
    "1. Ground every word in the supplied evidence. NEVER invent venues, dates, ticket prices, hours, menus, URLs, emails, or phone numbers. " +
    "2. Only reference exact `id` strings present in the input arrays. " +
    "3. Wayfind voice: plain, direct, concrete English. NO exclamation points, NO em-dashes or en-dashes, and NEVER use: hidden gem, nestled, boasts, stunning, must-see, must-try, iconic, vibrant, bustling, elevate, unforgettable, world-class, packed, busiest, wait time. " +
    "4. Keep `floridaBrief` under 155 characters, each `why` under 150 characters, and each `timingTip` or `closureNote` under 90 characters. " +
    "5. Return JSON with exact top-level keys: " +
    "`floridaBrief` (string), `trendingEditorial` (array of {id, why, tag, timingTip}), " +
    "`holidayEditorial` (object {holidayBrief, picks: [{id, why, closureNote}]} or null), " +
    "`monitorNotes` (array of up to 4 {area, severity, summary, recommendedFix}).";

  return {
    systemInstruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(compactEvidence) }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1400,
      responseMimeType: "application/json",
    },
  };
}

// Keep the paid lane on the same public evidence and editorial contract as
// standard Gemini. Check the complete, serialized request, including its
// instructions and configuration, before it can claim a spend grant.
export function buildCarbonEditorialPrompt(packet) {
  const body = buildGeminiMonitorPrompt(packet);
  body.generationConfig = {
    responseMimeType: "application/json",
    maxOutputTokens: CARBON_EDITORIAL_MAX_OUTPUT_TOKENS,
    thinkingConfig: { thinkingLevel: "LOW" },
  };
  return new TextEncoder().encode(JSON.stringify(body)).byteLength <= CARBON_EDITORIAL_MAX_BYTES ? body : null;
}

/**
 * Strictly validate Gemini's JSON output against the verified packet allowlist
 * and Wayfind editorial safety rules. Unknown IDs, URLs, banned hype phrases,
 * and malformed structures are stripped cleanly — never trusted blindly.
 */
export function validateGeminiIntelligenceOutput(rawTextOrObj, packet) {
  let parsed = null;
  if (rawTextOrObj && typeof rawTextOrObj === "object") {
    parsed = rawTextOrObj;
  } else if (typeof rawTextOrObj === "string" && rawTextOrObj.trim()) {
    const cleaned = rawTextOrObj.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return { ok: false, reason: "invalid_json", rejectedCount: 0, data: null };
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "invalid_root", rejectedCount: 0, data: null };
  }

  const allowedTrendingIds = new Set((packet.trendingPicks || []).map((x) => x.id));
  const allowedHolidayIds = new Set([
    ...((packet.holiday && packet.holiday.events) || []).map((x) => x.id),
    ...((packet.holiday && packet.holiday.places) || []).map((x) => x.id),
  ]);

  let rejectedCount = 0;

  const floridaBrief = cleanPlainSentence(parsed.floridaBrief, 165);
  if (parsed.floridaBrief && !floridaBrief) rejectedCount++;

  const trendingById = {};
  if (Array.isArray(parsed.trendingEditorial)) {
    for (const row of parsed.trendingEditorial.slice(0, 20)) {
      if (!row || typeof row !== "object") { rejectedCount++; continue; }
      const id = String(row.id || "").trim();
      if (!allowedTrendingIds.has(id)) { rejectedCount++; continue; }
      const why = cleanPlainSentence(row.why, 160);
      const tag = cleanPlainSentence(row.tag, 36);
      const timingTip = cleanPlainSentence(row.timingTip, 95);
      if (!why) { rejectedCount++; continue; }
      trendingById[id] = { why, tag: tag || null, timingTip: timingTip || null };
    }
  }

  let holidayBrief = "";
  const holidayById = {};
  if (packet.holiday && parsed.holidayEditorial && typeof parsed.holidayEditorial === "object") {
    holidayBrief = cleanPlainSentence(parsed.holidayEditorial.holidayBrief, 165);
    if (parsed.holidayEditorial.holidayBrief && !holidayBrief) rejectedCount++;
    if (Array.isArray(parsed.holidayEditorial.picks)) {
      for (const row of parsed.holidayEditorial.picks.slice(0, 14)) {
        if (!row || typeof row !== "object") { rejectedCount++; continue; }
        const id = String(row.id || "").trim();
        if (!allowedHolidayIds.has(id)) { rejectedCount++; continue; }
        const why = cleanPlainSentence(row.why, 160);
        const closureNote = cleanPlainSentence(row.closureNote, 95);
        if (!why) { rejectedCount++; continue; }
        holidayById[id] = { why, closureNote: closureNote || null };
      }
    }
  }

  const monitorNotes = [];
  if (Array.isArray(parsed.monitorNotes)) {
    for (const note of parsed.monitorNotes.slice(0, 4)) {
      if (!note || typeof note !== "object") { rejectedCount++; continue; }
      const area = ["trending_florida", "holiday_special"].includes(String(note.area || "")) ? String(note.area) : "trending_florida";
      const severity = ["high", "medium", "low"].includes(String(note.severity || "")) ? String(note.severity) : "medium";
      const summary = cleanPlainSentence(note.summary, 160);
      const recommendedFix = cleanPlainSentence(note.recommendedFix, 160);
      if (!summary) { rejectedCount++; continue; }
      monitorNotes.push({ area, severity, summary, recommendedFix: recommendedFix || null });
    }
  }

  const acceptedCount = (floridaBrief ? 1 : 0) + Object.keys(trendingById).length + Object.keys(holidayById).length + (holidayBrief ? 1 : 0);
  if (acceptedCount === 0 && monitorNotes.length === 0) {
    return { ok: false, reason: "all_output_rejected", rejectedCount, data: null };
  }

  return {
    ok: true,
    reason: null,
    rejectedCount,
    data: {
      floridaBrief: floridaBrief || null,
      trendingById,
      holidayBrief: holidayBrief || null,
      holidayById,
      monitorNotes,
    },
  };
}

/**
 * Merge validated Gemini editorial and audit notes into the base packet
 * without ever altering deterministic IDs, dates, or quality floors.
 */
export function applyGeminiToPacket(packet, validated, meta = {}) {
  const aiData = validated && validated.ok && validated.data ? validated.data : null;
  const trendingPicks = (packet.trendingPicks || []).map((item) => {
    const ed = aiData && aiData.trendingById ? aiData.trendingById[item.id] : null;
    return {
      ...item,
      why: (ed && ed.why) || item.facts || "",
      aiTag: (ed && ed.tag) || null,
      timingTip: (ed && ed.timingTip) || null,
      aiGrounded: !!ed,
    };
  });

  let holiday = packet.holiday;
  if (holiday) {
    const mergeHolidayItem = (item) => {
      const ed = aiData && aiData.holidayById ? aiData.holidayById[item.id] : null;
      return {
        ...item,
        why: (ed && ed.why) || item.facts || "",
        closureNote: (ed && ed.closureNote) || null,
        aiGrounded: !!ed,
      };
    };
    holiday = {
      ...holiday,
      brief: (aiData && aiData.holidayBrief) || holiday.brief,
      events: (holiday.events || []).map(mergeHolidayItem),
      places: (holiday.places || []).map(mergeHolidayItem),
    };
  }

  return {
    ...packet,
    floridaBrief: (aiData && aiData.floridaBrief) || packet.floridaBrief,
    trendingPicks,
    holiday,
    monitor: {
      provider: meta.provider || "gemini",
      model: meta.model || null,
      status: meta.status || (aiData ? "active" : "deterministic_only"),
      reason: meta.reason || null,
      aiActive: !!aiData,
      rejectedItems: validated ? validated.rejectedCount : 0,
      aiNotes: aiData ? aiData.monitorNotes : [],
      checkedAt: meta.checkedAt || packet.generatedAt,
    },
  };
}

/**
 * Geographic honesty filter (AGENTS.md §12): prioritizes picks near the
 * visitor's location while honestly labeling statewide picks when farther out.
 */
export function filterIntelligenceForLocation(snapshot, { lat = null, lng = null, radiusMi = 60, holidayKey = null } = {}) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const hasGeo = typeof lat === "number" && Number.isFinite(lat) && typeof lng === "number" && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const capRadius = Number.isFinite(Number(radiusMi)) && Number(radiusMi) > 0 ? Math.min(250, Number(radiusMi)) : 60;

  const annotate = (items) => (Array.isArray(items) ? items : []).map((item) => {
    const distMi = hasGeo && item.lat != null && item.lng != null
      ? Math.round(haversineMiles(lat, lng, item.lat, item.lng) * 10) / 10
      : null;
    return {
      ...item,
      distMi,
      scope: distMi != null && distMi <= capRadius ? "local" : "statewide",
    };
  });

  const sortLocalFirst = (items) => items.slice().sort((a, b) => {
    const aLoc = a.scope === "local" ? 0 : 1;
    const bLoc = b.scope === "local" ? 0 : 1;
    if (aLoc !== bLoc) return aLoc - bLoc;
    if (a.distMi != null && b.distMi != null && aLoc === 0) return a.distMi - b.distMi;
    return (b.signalStrength || 0) - (a.signalStrength || 0);
  });

  const trendingPicks = sortLocalFirst(annotate(snapshot.trendingPicks));
  let holiday = snapshot.holiday || null;
  if (holiday && (!holidayKey || holiday.key === holidayKey)) {
    holiday = {
      ...holiday,
      events: sortLocalFirst(annotate(holiday.events)),
      places: sortLocalFirst(annotate(holiday.places)),
    };
  } else if (holidayKey && (!holiday || holiday.key !== holidayKey)) {
    holiday = null;
  }

  return {
    schemaVersion: snapshot.schemaVersion,
    today: snapshot.today,
    generatedAt: snapshot.generatedAt,
    floridaBrief: snapshot.floridaBrief,
    monitor: snapshot.monitor,
    guideFreshness: snapshot.guideFreshness,
    qualityAudit: snapshot.qualityAudit,
    localRadiusMi: hasGeo ? capRadius : null,
    trendingPicks,
    holiday,
  };
}
