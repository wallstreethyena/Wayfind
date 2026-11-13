// app/api/planner/route.js — Grounded Wayfind Planner server endpoint.
//
// Architectural invariants:
//   1. Searches Wayfind's real owned inventory (`app/api/search/route.js`) and
//      curated seasonal/Christmas browse (`app/api/christmas/browse/route.js` +
//      `lib/curatedEvents.js`) — zero Google Places spend.
//   2. Routes any Anthropic spend exclusively through `paidAnthropicRequest`
//      (`lib/paidAi.js`) with `breakerOpen`/`tripBreaker` and IP rate limiting.
//   3. Never writes directly to Supabase or mutates user trips on the server:
//      returns validated `proposedPlan` or narrow `actions` + canonical
//      `candidateCatalog` so the client commits confirmed plans through
//      Wayfind's existing local + authenticated sync pipeline.
//   4. Never caches private user trip state across requests.

import { aiKey } from "../../../lib/aiKey.js";
import { paidAnthropicRequest } from "../../../lib/paidAi.js";
import { breakerOpen, tripBreaker, classifyProviderFailure } from "../../../lib/providerHealth.js";
import { siteTodayStr } from "../../../lib/siteTime.js";
import { fetchCuratedEvents } from "../../../lib/curatedEvents.js";
import { checkPlannerEntitlement } from "../../../lib/plannerEntitlement.js";
import { parsePlannerRequest } from "../../../lib/plannerParse.js";
import {
  buildGroundedCandidatePool,
  plannerInventoryQueries,
  buildDeterministicPlan,
  resolveDeterministicEditActions,
  buildPlannerClaudePrompt,
  parseAndValidateClaudePlan,
  parseAndValidateClaudeEdit,
  sanitizeConversationHistory,
  sanitizeProposedPlanDraft,
  revalidateProposedDraft,
  parseDraftRevisionIntent,
  applyDeterministicDraftRevision,
  buildDraftRevisionClaudePrompt,
  parseAndValidateClaudeDraftRevision,
} from "../../../lib/wayfindPlanner.js";
import { serveInventoryByPlaceIds } from "../../../lib/inventoryServe.js";
import { executePlannerActionBatch } from "../../../lib/plannerActions.js";
import {
  getPublishedChristmasResearchRows,
  getFirstPartyAtlasPlaces,
} from "../../../lib/plannerLocalInventory.js";
import { GET as siteSearch } from "../search/route.js";
import { GET as christmasBrowseGet } from "../christmas/browse/route.js";
import {
  normalizePlannerVoice,
  plannerPersona,
  pickLine,
  personaChatSystem,
  cleanPersonaChat,
} from "../../../lib/plannerPersona.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-5-5";
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX_REQUESTS = 12;
const PUBLIC_CACHE_TTL_MS = 8 * 60 * 1000;
const PUBLIC_CACHE_MAX = 120;

const ipBuckets = new Map();
const publicPlanCache = new Map();

function clientIp(req) {
  try {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0].trim().slice(0, 64) || "anon";
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 64) || "anon";
  } catch { /* ignore */ }
  return "anon";
}

function isRateLimited(ip, now = Date.now()) {
  const cutoff = now - RATE_WINDOW_MS;
  const prev = (ipBuckets.get(ip) || []).filter((ts) => ts > cutoff);
  if (prev.length >= RATE_MAX_REQUESTS) {
    ipBuckets.set(ip, prev);
    return true;
  }
  prev.push(now);
  ipBuckets.set(ip, prev);
  if (ipBuckets.size > 500) {
    for (const [k, stamps] of ipBuckets.entries()) {
      if (!stamps.some((ts) => ts > cutoff)) ipBuckets.delete(k);
    }
  }
  return false;
}

function readPublicCache(key, now = Date.now()) {
  const hit = publicPlanCache.get(key);
  if (!hit) return null;
  if (now - hit.at > PUBLIC_CACHE_TTL_MS) {
    publicPlanCache.delete(key);
    return null;
  }
  return hit.value;
}

function writePublicCache(key, value, now = Date.now()) {
  if (publicPlanCache.size >= PUBLIC_CACHE_MAX) {
    const oldest = publicPlanCache.keys().next().value;
    if (oldest !== undefined) publicPlanCache.delete(oldest);
  }
  publicPlanCache.set(key, { at: now, value });
}

const jsonNoStore = (body, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "private, no-store, max-age=0" } });

function sanitizePoint(point) {
  const lat = Number(point && point.lat);
  const lng = Number(point && point.lng);
  if (!point || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return { lat: Math.round(lat * 1000) / 1000, lng: Math.round(lng * 1000) / 1000 };
}

function sanitizeActiveTrip(raw) {
  if (!raw || typeof raw !== "object" || !raw.key) return null;
  const items = Array.isArray(raw.items)
    ? raw.items.slice(0, 60).map((it) => ({
        id: String(it && it.id || "").slice(0, 200),
        day: it && it.day ? String(it.day).slice(0, 12) : null,
        order: Number(it && it.order) || 0,
        note: String(it && it.note || "").slice(0, 300),
        place: it && it.place && typeof it.place === "object"
          ? {
              id: String(it.place.id || it.id || "").slice(0, 200),
              name: String(it.place.name || "").slice(0, 160),
              address: String(it.place.address || "").slice(0, 220),
              city: it.place.city ? String(it.place.city).slice(0, 80) : null,
              lat: Number.isFinite(Number(it.place.lat)) ? Number(it.place.lat) : null,
              lng: Number.isFinite(Number(it.place.lng)) ? Number(it.place.lng) : null,
              type: it.place.type ? String(it.place.type).slice(0, 80) : null,
              price: it.place.price ? String(it.place.price).slice(0, 24) : null,
              priceNum: Number.isFinite(Number(it.place.priceNum)) ? Number(it.place.priceNum) : null,
              rating: Number.isFinite(Number(it.place.rating)) ? Number(it.place.rating) : null,
              reviews: Number.isFinite(Number(it.place.reviews)) ? Number(it.place.reviews) : 0,
              photo: typeof it.place.photo === "string" ? it.place.photo.slice(0, 500) : null,
              itemType: it.place.itemType === "event" ? "event" : "place",
              slotLabel: it.place.slotLabel ? String(it.place.slotLabel).slice(0, 32) : null,
            }
          : { id: String(it && it.id || "").slice(0, 200), name: String(it && it.id || "") },
      })).filter((it) => it.id)
    : [];
  return {
    key: String(raw.key).slice(0, 80),
    title: String(raw.title || "").slice(0, 140),
    city: String(raw.city || "").slice(0, 80),
    state: raw.state ? String(raw.state).slice(0, 8) : "FL",
    startDate: raw.startDate ? String(raw.startDate).slice(0, 12) : null,
    endDate: raw.endDate ? String(raw.endDate).slice(0, 12) : null,
    items,
  };
}

async function runOwnedSearchQuery(q, originPoint) {
  const qs = new URLSearchParams({ q });
  if (originPoint && Number.isFinite(originPoint.lat) && Number.isFinite(originPoint.lng)) {
    qs.set("lat", String(originPoint.lat));
    qs.set("lng", String(originPoint.lng));
  }
  try {
    const res = await siteSearch(new Request("https://wayfind.internal/api/search?" + qs.toString()));
    const data = await res.json();
    const out = [];
    if (Array.isArray(data && data.cards)) out.push(...data.cards);
    if (Array.isArray(data && data.places)) out.push(...data.places);
    return out;
  } catch {
    return [];
  }
}

async function gatherServerCandidates(parsed, { point = null, savedPlaces = [] } = {}) {
  const origin = parsed.destination
    ? { lat: parsed.destination.lat, lng: parsed.destination.lng }
    : point;

  const queries = plannerInventoryQueries(parsed);
  const searchPromises = queries.map((q) => runOwnedSearchQuery(q, origin));

  const ints = new Set((parsed.preferences && parsed.preferences.interests) || []);
  const today = siteTodayStr();
  const inChristmasWindow = today.slice(5) >= "10-15" || today.slice(5) <= "01-05";
  const wantsSeasonal = ints.has("christmas") || ints.has("lights") || ints.has("bars") || ints.has("shows") || inChristmasWindow;
  const isFloridaDest = !parsed.destination || parsed.destination.state === "FL";
  const hasSupabaseEnv = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  );

  const christmasPromise = wantsSeasonal && isFloridaDest
    ? (async () => {
        if (!hasSupabaseEnv) return getPublishedChristmasResearchRows();
        try {
          const qs = new URLSearchParams();
          if (parsed.destination && parsed.destination.name) qs.set("q", parsed.destination.name);
          const res = await christmasBrowseGet(new Request("https://wayfind.internal/api/christmas/browse?" + qs.toString()));
          if (res.ok) {
            const data = await res.json();
            const cards = Array.isArray(data && data.cards) ? data.cards : [];
            if (cards.length >= 4 || !parsed.destination) return cards;
            const broadRes = await christmasBrowseGet(new Request("https://wayfind.internal/api/christmas/browse"));
            if (broadRes.ok) {
              const broadData = await broadRes.json();
              const combined = [...cards, ...(Array.isArray(broadData && broadData.cards) ? broadData.cards : [])];
              if (combined.length > 0) return combined;
            }
            if (cards.length > 0) return cards;
          }
        } catch {
          // Fall through to published first-party Christmas research rows on disk
        }
        return getPublishedChristmasResearchRows();
      })()
    : Promise.resolve([]);

  const curatedPromise = isFloridaDest && hasSupabaseEnv
    ? fetchCuratedEvents({ signal: AbortSignal.timeout(2500) }).catch(() => [])
    : Promise.resolve([]);

  const [searchLists, christmasCards, curatedRows] = await Promise.all([
    Promise.all(searchPromises),
    christmasPromise,
    curatedPromise,
  ]);

  const atlasPlaces = isFloridaDest ? getFirstPartyAtlasPlaces() : [];

  const rawGroups = [
    { sourceKind: "christmas", items: christmasCards },
    ...searchLists.map((items) => ({ sourceKind: "owned_search", items })),
    { sourceKind: "curated_events", items: curatedRows },
    { sourceKind: "atlas_places", items: atlasPlaces },
    { sourceKind: "user_saved", items: Array.isArray(savedPlaces) ? savedPlaces.slice(0, 24) : [] },
  ];

  return buildGroundedCandidatePool(rawGroups, {
    destination: parsed.destination,
    maxRadiusKm: 58,
  });
}

function buildSlimCatalog(proposedPlan, candidates, seedPlace = null) {
  const slimCatalog = {};
  const catalogById = new Map((candidates || []).map((c) => [String(c.id), c]));
  if (seedPlace && seedPlace.id && !catalogById.has(String(seedPlace.id))) {
    catalogById.set(String(seedPlace.id), seedPlace);
  }
  if (proposedPlan && Array.isArray(proposedPlan.days)) {
    for (const d of proposedPlan.days) {
      for (const s of (d.stops || [])) {
        const entity = catalogById.get(String(s.id));
        if (entity) slimCatalog[entity.id] = entity;
      }
    }
  }
  return slimCatalog;
}

async function gatherDraftRevisionCandidates(rawDraft, draftParsed, message, { point = null, savedPlaces = [] } = {}) {
  const origin = draftParsed.destination
    ? { lat: draftParsed.destination.lat, lng: draftParsed.destination.lng }
    : point;

  const baseCity = rawDraft.city || (draftParsed.destination && draftParsed.destination.name) || "Orlando";
  const citySuffix = baseCity ? ` ${baseCity}` : "";
  const queries = [
    `restaurants${citySuffix}`,
    `things to do${citySuffix}`,
    `breakfast coffee${citySuffix}`,
  ];
  if (message) {
    const cleanMsg = message.replace(/[^a-zA-Z0-9\s]/g, " ").trim();
    if (cleanMsg) {
      queries.push(`${cleanMsg.slice(0, 40)}${citySuffix}`);
      if (/\bcoffee\b/i.test(message)) queries.push(`coffee bakery${citySuffix}`);
      if (/\bsushi\b/i.test(message)) queries.push(`sushi${citySuffix}`);
      if (/\btacos?\b/i.test(message)) queries.push(`tacos mexican${citySuffix}`);
      if (/\bseafood\b/i.test(message)) queries.push(`seafood${citySuffix}`);
      if (/\bbreakfast\b/i.test(message)) queries.push(`breakfast${citySuffix}`);
      if (/\bbar|cocktails?\b/i.test(message)) queries.push(`cocktail bar${citySuffix}`);
    }
  }

  const searchPromises = [...new Set(queries)].slice(0, 5).map((q) => runOwnedSearchQuery(q, origin));

  const draftStopIds = (rawDraft.days || []).flatMap((d) => (d.stops || []).map((s) => String(s.id || s.entityId))).filter(Boolean);
  const nonEventDraftStopIds = draftStopIds.filter((id) => !id.startsWith("event:"));
  const hasEventsInDraft = draftStopIds.some((id) => id.startsWith("event:"));

  const today = siteTodayStr();
  const inChristmasWindow = today.slice(5) >= "10-15" || today.slice(5) <= "01-05";
  const wantsSeasonal = inChristmasWindow || hasEventsInDraft || /\b(?:christmas|holiday|lights|santa)\b/i.test(message);
  const isFloridaDest = !draftParsed.destination || draftParsed.destination.state === "FL";
  const hasSupabaseEnv = Boolean(
    (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()
  );

  const exactPlacesPromise = (hasSupabaseEnv && origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng) && nonEventDraftStopIds.length > 0)
    ? serveInventoryByPlaceIds(nonEventDraftStopIds, origin.lat, origin.lng, 58000).catch(() => [])
    : Promise.resolve([]);

  const christmasPromise = wantsSeasonal && isFloridaDest
    ? (async () => {
        if (!hasSupabaseEnv) return getPublishedChristmasResearchRows();
        try {
          const qs = new URLSearchParams();
          if (draftParsed.destination && draftParsed.destination.name) qs.set("q", draftParsed.destination.name);
          const res = await christmasBrowseGet(new Request("https://wayfind.internal/api/christmas/browse?" + qs.toString()));
          if (res.ok) {
            const data = await res.json();
            const cards = Array.isArray(data && data.cards) ? data.cards : [];
            if (cards.length >= 4 || !draftParsed.destination) return cards;
            const broadRes = await christmasBrowseGet(new Request("https://wayfind.internal/api/christmas/browse"));
            if (broadRes.ok) {
              const broadData = await broadRes.json();
              const combined = [...cards, ...(Array.isArray(broadData && broadData.cards) ? broadData.cards : [])];
              if (combined.length > 0) return combined;
            }
            if (cards.length > 0) return cards;
          }
        } catch { /* fallback */ }
        return getPublishedChristmasResearchRows();
      })()
    : Promise.resolve([]);

  const curatedPromise = isFloridaDest && hasSupabaseEnv
    ? fetchCuratedEvents({ signal: AbortSignal.timeout(2500) }).catch(() => [])
    : Promise.resolve([]);

  const [exactPlaces, searchLists, christmasCards, curatedRows] = await Promise.all([
    exactPlacesPromise,
    Promise.all(searchPromises),
    christmasPromise,
    curatedPromise,
  ]);

  const atlasPlaces = isFloridaDest ? getFirstPartyAtlasPlaces() : [];

  const rawGroups = [
    { sourceKind: "draft_verified_ids", items: exactPlaces },
    { sourceKind: "christmas", items: christmasCards },
    ...searchLists.map((items) => ({ sourceKind: "owned_search", items })),
    { sourceKind: "curated_events", items: curatedRows },
    { sourceKind: "atlas_places", items: atlasPlaces },
    { sourceKind: "user_saved", items: Array.isArray(savedPlaces) ? savedPlaces.slice(0, 24) : [] },
  ];

  return buildGroundedCandidatePool(rawGroups, {
    destination: draftParsed.destination,
    maxRadiusKm: 58,
  });
}

async function askClaudePlanner(promptObj, { maxTokens = 1400 } = {}) {
  const key = aiKey();
  if (!key) return { ok: false, reason: "not_configured" };
  try {
    if (await breakerOpen("anthropic")) return { ok: false, reason: "breaker_open" };
  } catch { /* fail open on cache read */ }

  try {
    const res = await paidAnthropicRequest({
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system: promptObj.system,
        messages: [{ role: "user", content: promptObj.user }],
      }),
    });

    if (res.status === 503) {
      return { ok: false, reason: "gate_shut" };
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const kind = classifyProviderFailure(res.status, text);
      if (kind) {
        try { await tripBreaker("anthropic", kind, text); } catch { /* fail soft */ }
      }
      return { ok: false, reason: kind || "http_error" };
    }
    const data = await res.json().catch(() => null);
    const textBlock = data && Array.isArray(data.content)
      ? data.content.find((b) => b && b.type === "text" && typeof b.text === "string")
      : null;
    if (!textBlock) return { ok: false, reason: "empty_response" };
    return { ok: true, text: textBlock.text };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

export async function POST(req) {
  const entitlement = checkPlannerEntitlement(null);
  if (!entitlement.allowed) {
    return jsonNoStore({ ok: false, code: "ENTITLEMENT_REQUIRED", entitlement }, 402);
  }
  const okJson = (payload) => jsonNoStore({ ok: true, entitlement, ...payload });

  let body = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, code: "INVALID_JSON" }, 400);
  }

  const message = String((body && body.message) || "").trim().slice(0, 600);
  if (!message) {
    return jsonNoStore({ ok: false, code: "EMPTY_MESSAGE" }, 400);
  }

  // The host on the page (Santa, Boo or plain Wayfind) owns the chat's voice.
  const voice = normalizePlannerVoice(body && body.voice);
  const persona = plannerPersona(voice);
  const contextCity = body && typeof body.contextCity === "string" ? body.contextCity.slice(0, 80) : null;
  const point = sanitizePoint(body && body.point);
  const activeTrip = sanitizeActiveTrip(body && body.activeTrip);
  const seedPlace = body && body.seedPlace && typeof body.seedPlace === "object" ? body.seedPlace : null;
  const savedPlaces = Array.isArray(body && body.savedPlaces) ? body.savedPlaces.slice(0, 20) : [];
  const today = siteTodayStr();

  // The visitor's earlier turns this session (client sends at most 3), so the
  // host remembers what was already said and asks only for what is missing.
  const recent = Array.isArray(body && body.recent)
    ? body.recent.filter((t) => typeof t === "string").map((t) => t.trim().slice(0, 300)).filter(Boolean).slice(-3)
    : [];
  const conversationHistory = sanitizeConversationHistory(body && body.conversationHistory);
  const hasRawDraft = body && body.proposedPlan !== undefined && body.proposedPlan !== null;

  if (hasRawDraft) {
    const rawDraft = sanitizeProposedPlanDraft(body.proposedPlan);
    if (!rawDraft) {
      return jsonNoStore({ ok: false, code: "INVALID_PLAN_SHAPE", rejectedIds: [] }, 422);
    }

    const draftParsed = parsePlannerRequest(
      `${rawDraft.city || contextCity || ""} ${rawDraft.startDate || ""} to ${rawDraft.endDate || ""} ${message}`.trim(),
      { todayYmd: today, contextCity: rawDraft.city || contextCity }
    );

    const candidates = await gatherDraftRevisionCandidates(rawDraft, draftParsed, message, {
      point,
      savedPlaces,
    });

    const reval = revalidateProposedDraft(rawDraft, candidates, { destination: draftParsed.destination });
    if (!reval.ok) {
      return jsonNoStore({
        ok: false,
        code: reval.code || "UNGROUNDED_DRAFT",
        rejectedIds: reval.rejectedIds || [],
        errors: reval.errors || [],
      }, 422);
    }

    const intent = parseDraftRevisionIntent(message, reval.draft, conversationHistory, { todayYmd: today, point });

    if (intent.kind === "undo" || intent.kind === "ambiguous") {
      const candidateCatalog = buildSlimCatalog(reval.draft, candidates);
      return okJson({
        mode: intent.kind === "undo" ? "no_change" : "clarify",
        revisionStatus: intent.kind === "undo" ? "unchanged" : "clarify",
        voice,
        reply: intent.kind === "undo"
          ? "Use Undo on your draft to step back to the previous version, or tell me which stop you'd like changed."
          : intent.clarificationQuestion,
        clarificationQuestion: intent.clarificationQuestion || null,
        proposedPlan: reval.draft,
        candidateCatalog,
        changedStopIds: [],
        confidenceSummary: reval.draft.confidenceSummary,
        metrics: {
          tripLength: reval.draft.days.length,
          candidateCount: candidates.length,
        },
        source: "deterministic",
      });
    }

    const detAttempt = applyDeterministicDraftRevision(intent, reval.draft, candidates, {
      voice,
      point,
      destination: draftParsed.destination,
    });

    if (intent.kind === "retime_stop" || intent.kind === "optimize_day") {
      const candidateCatalog = buildSlimCatalog(detAttempt.proposedPlan, candidates);
      return okJson({
        mode: detAttempt.mode || (detAttempt.changed ? "revise_plan" : "no_change"),
        revisionStatus: detAttempt.revisionStatus || (detAttempt.changed ? "revised" : "unchanged"),
        voice,
        reply: detAttempt.reply,
        proposedPlan: detAttempt.proposedPlan,
        candidateCatalog,
        changedStopIds: detAttempt.changedStopIds || [],
        confidenceSummary: detAttempt.proposedPlan.confidenceSummary,
        metrics: {
          tripLength: detAttempt.proposedPlan.days.length,
          candidateCount: candidates.length,
        },
        source: "deterministic",
      });
    }

    if (intent.requestedCategory && !detAttempt.changed) {
      const candidateCatalog = buildSlimCatalog(detAttempt.proposedPlan, candidates);
      return okJson({
        mode: "no_change",
        revisionStatus: "unchanged",
        voice,
        reply: detAttempt.reply,
        proposedPlan: detAttempt.proposedPlan,
        candidateCatalog,
        changedStopIds: [],
        confidenceSummary: detAttempt.proposedPlan.confidenceSummary,
        metrics: {
          tripLength: detAttempt.proposedPlan.days.length,
          candidateCount: candidates.length,
        },
        source: "deterministic",
      });
    }

    const ip = clientIp(req);
    const rateLimited = isRateLimited(ip);

    if (!rateLimited) {
      const promptObj = buildDraftRevisionClaudePrompt(intent, reval.draft, candidates, conversationHistory, { voice });
      const claudeRes = await askClaudePlanner(promptObj);
      if (claudeRes.ok) {
        const claudeValidated = parseAndValidateClaudeDraftRevision(
          claudeRes.text,
          intent,
          reval.draft,
          candidates,
          { destination: draftParsed.destination }
        );
        if (claudeValidated.ok) {
          const candidateCatalog = buildSlimCatalog(claudeValidated.proposedPlan, candidates);
          return okJson({
            mode: claudeValidated.mode || "revise_plan",
            revisionStatus: claudeValidated.revisionStatus || "revised",
            voice,
            reply: claudeValidated.reply,
            clarificationQuestion: claudeValidated.clarificationQuestion || null,
            proposedPlan: claudeValidated.proposedPlan,
            candidateCatalog,
            changedStopIds: claudeValidated.changedStopIds || [],
            confidenceSummary: claudeValidated.proposedPlan.confidenceSummary,
            metrics: {
              tripLength: claudeValidated.proposedPlan.days.length,
              candidateCount: candidates.length,
            },
            source: "claude",
          });
        }
      }
    }

    const candidateCatalog = buildSlimCatalog(detAttempt.proposedPlan, candidates);
    return okJson({
      mode: detAttempt.mode || (detAttempt.changed ? "revise_plan" : "no_change"),
      revisionStatus: detAttempt.revisionStatus || (detAttempt.changed ? "revised" : "unchanged"),
      voice,
      reply: detAttempt.reply,
      proposedPlan: detAttempt.proposedPlan,
      candidateCatalog,
      changedStopIds: detAttempt.changedStopIds || [],
      confidenceSummary: detAttempt.proposedPlan.confidenceSummary,
      metrics: {
        tripLength: detAttempt.proposedPlan.days.length,
        candidateCount: candidates.length,
      },
      source: "deterministic",
    });
  }

  let parsed = parsePlannerRequest(message, {
    todayYmd: today,
    activeTrip,
    contextCity,
    seedPlace,
  });
  if (parsed.clarificationQuestion && recent.length && !activeTrip) {
    const merged = parsePlannerRequest([...recent, message].join(". "), {
      todayYmd: today,
      activeTrip,
      contextCity,
      seedPlace,
    });
    if (merged.destination && !merged.clarificationQuestion) parsed = merged;
  }

  if (!hasRawDraft && !activeTrip && conversationHistory.length > 0 && parsed.clarificationQuestion) {
    const priorUserTexts = conversationHistory
      .filter((m) => m && m.role === "user")
      .map((m) => m.text)
      .filter(Boolean);
    if (priorUserTexts.length > 0) {
      const combinedMsg = `${priorUserTexts.join(". ")}. ${message}`.trim();
      const reParsed = parsePlannerRequest(combinedMsg, {
        todayYmd: today,
        activeTrip,
        contextCity,
        seedPlace,
      });
      if (!reParsed.clarificationQuestion) {
        parsed = reParsed;
      }
    }
  }

  // 1. Missing critical destination or dates -> ask ONE high-value question immediately (zero AI cost).
  // The host talks back in character (owner 2026-11-13): a short witty reply to
  // whatever they said, always ending on the city/dates ask. Claude writes it
  // when available; otherwise a hand written in-character line, never the bare
  // form question.
  if (parsed.clarificationQuestion) {
    const seed = message.toLowerCase();
    let reply = parsed.destination
      ? pickLine(persona.clarifyDates(parsed.destination.name), seed)
      : pickLine(persona.clarifyCity, seed);
    let source = "deterministic";
    // Why a hand written line was used, so a fallback is never mistaken for a
    // generated reply: rate_limited | unavailable (no key or breaker open) |
    // gate_shut (AI spend cap) | <provider failure kind> | unusable_reply.
    let fallbackReason = parsed.destination ? "not_needed" : null;
    if (!parsed.destination) {
      if (isRateLimited(clientIp(req))) {
        fallbackReason = "rate_limited";
      } else {
        const chat = await askClaudePlanner(
          { system: personaChatSystem(voice), user: [...recent, message].join("\n") },
          { maxTokens: 220 },
        );
        const cleaned = chat.ok ? cleanPersonaChat(chat.text) : null;
        if (cleaned) {
          reply = cleaned;
          source = "claude";
        } else {
          fallbackReason = chat.ok ? "unusable_reply" : (chat.reason || "unavailable");
        }
      }
    }
    return okJson({
      mode: "clarify",
      voice,
      reply,
      clarificationQuestion: parsed.clarificationQuestion,
      metrics: {
        tripLength: 0,
        candidateCount: 0,
      },
      source,
      ...(source === "deterministic" ? { fallbackReason } : {}),
    });
  }

  // Fast path for pure local stop moves/removals/optimizations that need zero external search or AI!
  if (parsed.edit && activeTrip && ["move_stop", "remove_stop", "optimize_trip"].includes(parsed.edit.kind)) {
    const resolved = resolveDeterministicEditActions(parsed, activeTrip, [], { voice });
    if (resolved) {
      const catalogObj = {};
      for (const it of activeTrip.items) {
        if (it.place && it.place.id) catalogObj[it.place.id] = it.place;
      }
      const check = executePlannerActionBatch({ [activeTrip.key]: activeTrip }, resolved.actions, {
        verifiedCatalog: catalogObj,
      });
      if (check.ok) {
        return okJson({
          mode: "edit_trip",
          voice,
          reply: resolved.reply,
          actions: resolved.actions,
          candidateCatalog: catalogObj,
          metrics: {
            tripLength: parsed.dates.dayCount || 0,
            candidateCount: Object.keys(catalogObj).length,
          },
          source: "deterministic",
        });
      }
    }
  }

  // Safe public cache check ONLY when there is no private user trip, raw draft, history, seedPlace, or savedPlaces.
  const isPublicCacheable = !activeTrip && !hasRawDraft && conversationHistory.length === 0 && !seedPlace && savedPlaces.length === 0;
  const cacheKey = isPublicCacheable
    ? `${voice}:${parsed.destination?.slug || "none"}:${parsed.dates.startDate || ""}:${parsed.dates.endDate || ""}:${message.toLowerCase().replace(/\s+/g, " ").slice(0, 180)}`
    : null;
  if (cacheKey) {
    const cached = readPublicCache(cacheKey);
    if (cached) return okJson({ ...cached, cached: true });
  }

  // 2. Gather grounded candidates from Wayfind's real owned inventory + curated events
  const candidates = await gatherServerCandidates(parsed, { point, savedPlaces });

  if (candidates.length === 0) {
    const cityLabel = parsed.destination ? parsed.destination.name : "that area";
    return okJson({
      mode: "empty_inventory",
      voice,
      reply: pickLine(persona.empty(cityLabel), message),
      metrics: {
        tripLength: parsed.dates.dayCount || 0,
        candidateCount: 0,
      },
      source: "deterministic",
    });
  }

  const ip = clientIp(req);
  const rateLimited = isRateLimited(ip);

  // 3a. Conversational edit on an existing trip (replace stop, add stop, revise budget/indoors)
  if (parsed.edit && activeTrip) {
    let editPayload = null;
    let source = "deterministic";

    // Deterministic edit resolver runs first for crisp accuracy; Claude refines complex freeform requests when available
    editPayload = resolveDeterministicEditActions(parsed, activeTrip, candidates, { voice });

    if (!editPayload && !rateLimited) {
      const promptObj = buildPlannerClaudePrompt(parsed, candidates, { activeTrip, voice });
      const claudeRes = await askClaudePlanner(promptObj);
      if (claudeRes.ok) {
        const validated = parseAndValidateClaudeEdit(claudeRes.text, activeTrip, candidates);
        if (validated.ok) {
          editPayload = { reply: validated.reply, actions: validated.actions };
          source = "claude";
        }
      }
    }

    if (!editPayload) {
      return okJson({
        mode: "no_change",
        voice,
        reply: persona.noChange,
        metrics: {
          tripLength: parsed.dates.dayCount || 0,
          candidateCount: candidates.length,
        },
        source: "deterministic",
      });
    }

    // Build minimal catalog containing only referenced IDs + existing stops
    const catalogObj = {};
    for (const c of candidates) catalogObj[c.id] = c;
    for (const it of activeTrip.items) {
      if (it.place && it.place.id && !catalogObj[it.place.id]) catalogObj[it.place.id] = it.place;
    }

    const dryRun = executePlannerActionBatch({ [activeTrip.key]: activeTrip }, editPayload.actions, {
      verifiedCatalog: catalogObj,
    });
    if (!dryRun.ok) {
      return jsonNoStore({
        ok: false,
        code: dryRun.code || "ACTION_VALIDATION_FAILED",
        rejectedIds: dryRun.rejectedIds || [],
      }, 422);
    }

    const referencedIds = new Set(
      editPayload.actions.flatMap((a) => [a.entityId, a.newEntityId, a.stopId]).filter(Boolean).map(String)
    );
    const slimCatalog = {};
    for (const id of referencedIds) {
      if (catalogObj[id]) slimCatalog[id] = catalogObj[id];
    }

    return okJson({
      mode: "edit_trip",
      voice,
      reply: editPayload.reply,
      actions: editPayload.actions,
      candidateCatalog: slimCatalog,
      metrics: {
        tripLength: parsed.dates.dayCount || 0,
        candidateCount: candidates.length,
      },
      source,
    });
  }

  // 3b. Multi-stop / multi-day Trip Proposal (requires user confirmation via `Save itinerary` before committing!)
  let proposedPlan = null;
  let source = "deterministic";
  let fallbackReason = rateLimited ? "rate_limited" : null;

  if (!rateLimited) {
    const promptObj = buildPlannerClaudePrompt(parsed, candidates, { voice });
    const claudeRes = await askClaudePlanner(promptObj);
    if (claudeRes.ok) {
      const validated = parseAndValidateClaudePlan(claudeRes.text, parsed, candidates);
      if (validated.ok) {
        proposedPlan = validated.plan;
        source = "claude";
      } else {
        fallbackReason = `ungrounded_plan:${validated.code || "invalid"}`;
      }
    } else {
      fallbackReason = claudeRes.reason || "unavailable";
    }
  }

  if (!proposedPlan) {
    proposedPlan = buildDeterministicPlan(parsed, candidates, { voice, seedPlace });
    source = "deterministic";
  }

  if (!proposedPlan) {
    return okJson({
      mode: "empty_inventory",
      voice,
      reply: persona.noFit,
      metrics: {
        tripLength: parsed.dates.dayCount || 0,
        candidateCount: candidates.length,
      },
      source: "deterministic",
    });
  }

  const slimCatalog = buildSlimCatalog(proposedPlan, candidates, seedPlace);

  const responseBody = {
    ok: true,
    entitlement,
    mode: "propose_trip",
    voice,
    reply: proposedPlan.explanation,
    proposedPlan,
    candidateCatalog: slimCatalog,
    confidenceSummary: proposedPlan.confidenceSummary,
    metrics: {
      tripLength: proposedPlan.days.length,
      candidateCount: candidates.length,
      proposedStopCount: proposedPlan.days.reduce((n, d) => n + d.stops.length, 0),
    },
    source,
    ...(source === "deterministic" ? { fallbackReason } : {}),
  };

  if (cacheKey && source === "claude") {
    writePublicCache(cacheKey, responseBody);
  }

  return jsonNoStore(responseBody);
}
