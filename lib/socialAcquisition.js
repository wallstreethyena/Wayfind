import { createHash } from "node:crypto";
import { credential } from "./envPlaceholder.js";
import { observedCount, qualifySocialPost, seasonalEvidence } from "./socialQualification.js";
import { normalizedSocialHandle, resolveSocialPlace } from "./socialIdentity.js";

export const SOCIAL_SEARCH_PROVIDER = "serpapi_social_free";
export const SOCIAL_SEARCH_DAILY_CEILING = 4;

const REGIONS = Object.freeze([
  "Tampa Bay", "Sarasota Bradenton", "Orlando", "Miami Fort Lauderdale",
  "Jacksonville St Augustine", "Naples Fort Myers", "Palm Beach", "Florida Keys",
]);

const INTENTS = Object.freeze([
  "pumpkin patch corn maze hayride fall festival",
  "Halloween haunted attraction ghost tour spooky date",
  "Oktoberfest beer garden fall market seasonal popup",
  "fall coffee pumpkin drink seasonal menu Halloween food",
  "family Halloween trunk or treat costume festival",
]);

const PLATFORM_BY_HOST = Object.freeze({
  "instagram.com": "instagram", "www.instagram.com": "instagram",
  "tiktok.com": "tiktok", "www.tiktok.com": "tiktok",
  "facebook.com": "facebook", "www.facebook.com": "facebook", "fb.watch": "facebook",
  "youtube.com": "youtube", "www.youtube.com": "youtube", "youtu.be": "youtube",
});

const INVENTORY_METROS = Object.freeze({
  "Tampa Bay": ["tampa", "st-pete"],
  "Sarasota Bradenton": ["manatee-sarasota"],
  Orlando: ["orlando"],
  "Miami Fort Lauderdale": ["miami-dade", "broward", "miami"],
  "Palm Beach": ["palm-beach"],
  "Jacksonville St Augustine": ["florida"],
  "Naples Fort Myers": ["florida"],
  "Florida Keys": ["florida"],
});

export function socialSearchKey() {
  return credential(process.env.SERPAPI_KEY);
}

export function plannedSocialQueries(day, count = 2) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) throw new Error("Florida day required");
  const n = Math.max(0, Math.min(SOCIAL_SEARCH_DAILY_CEILING, Number(count) || 0));
  const seed = Number(String(day).replaceAll("-", ""));
  return Array.from({ length: n }, (_, offset) => {
    const region = REGIONS[(seed + offset) % REGIONS.length];
    const intent = INTENTS[(Math.floor(seed / 7) + offset) % INTENTS.length];
    return { key: `${day}:${offset}:${region}`, region, query: `${region} Florida ${intent} ${String(day).slice(0, 4)}` };
  });
}

export function boundedQueryCount(value, fallback = 2) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(SOCIAL_SEARCH_DAILY_CEILING, Math.trunc(parsed))) : fallback;
}

export async function verifySerpFreeInventory(key, requested, { fetcher = fetch, timeoutMs = 8000 } = {}) {
  if (!key) return { ok: false, reason: "unconfigured", remaining: 0 };
  try {
    const url = new URL("https://serpapi.com/account.json");
    url.searchParams.set("api_key", key);
    const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json().catch(() => null);
    const price = typeof body?.plan_monthly_price === "number" ? body.plan_monthly_price : Number.NaN;
    const remaining = observedCount(body?.total_searches_left);
    if (!response.ok || !body || String(body.account_status || "").toLowerCase() !== "active") {
      return { ok: false, reason: `account_response_${response.status}`, remaining: 0 };
    }
    if (price !== 0) return { ok: false, reason: "not_zero_cost_plan", remaining: remaining ?? 0 };
    if (remaining === null || remaining < requested) return { ok: false, reason: "insufficient_free_inventory", remaining: remaining ?? 0 };
    return { ok: true, reason: "free_inventory_verified", remaining };
  } catch {
    return { ok: false, reason: "account_check_failed", remaining: 0 };
  }
}

export async function searchIndexedShorts(key, query, { fetcher = fetch, timeoutMs = 12000 } = {}) {
  if (!key || !query) return { ok: false, reason: "unconfigured", results: [] };
  try {
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google");
    url.searchParams.set("q", query);
    url.searchParams.set("location", "Florida, United States");
    url.searchParams.set("gl", "us");
    url.searchParams.set("hl", "en");
    url.searchParams.set("api_key", key);
    const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body || body.error) return { ok: false, reason: `search_response_${response.status}`, results: [] };
    return { ok: true, results: Array.isArray(body.short_videos) ? body.short_videos : [] };
  } catch {
    return { ok: false, reason: "search_failed", results: [] };
  }
}

export function platformForSocialUrl(value) {
  try { return PLATFORM_BY_HOST[new URL(String(value)).hostname.toLowerCase()] || null; }
  catch { return null; }
}

function stableId(platform, permalink) {
  return createHash("sha256").update(`${platform}\n${permalink}`).digest("hex").slice(0, 40);
}

function creatorKey(platform, handle) {
  return `${platform}:${normalizedSocialHandle(handle)}`;
}

function handleFromResult(item, platform, permalink) {
  try {
    const url = new URL(permalink);
    if (platform === "tiktok") {
      const match = url.pathname.match(/^\/@([^/]+)/);
      if (match) return normalizedSocialHandle(match[1]);
    }
  } catch {}
  return normalizedSocialHandle(item?.profile_name) || null;
}

export function normalizeIndexedShort(item, context = {}) {
  const permalink = String(item?.link || "").trim();
  const platform = platformForSocialUrl(permalink);
  if (!platform) return null;
  const title = String(item?.title || "").trim().slice(0, 2000);
  const evidence = seasonalEvidence(title);
  const views = observedCount(item?.extracted_views);
  const creator = String(item?.profile_name || "").trim().slice(0, 200) || null;
  const handle = handleFromResult(item, platform, permalink);
  const mediaId = stableId(platform, permalink);
  return {
    discovery_id: `${SOCIAL_SEARCH_PROVIDER}:${mediaId}`,
    media_id: mediaId,
    provider: SOCIAL_SEARCH_PROVIDER,
    platform,
    permalink,
    creator_name: creator,
    creator_handle: handle,
    title,
    observed_views: views,
    observed_likes: null,
    observed_comments: null,
    query_key: String(context.key || "").slice(0, 300),
    query_region: String(context.region || "FL").slice(0, 120),
    seasonal_evidence: evidence,
    qualification_status: evidence.length ? "trend_only" : "rejected",
    qualification_reason: evidence.length ? "likes_unavailable" : "no_seasonal_offering",
  };
}

export function normalizeIndexedBatch(items, context) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map((item) => normalizeIndexedShort(item, context))
    .filter(Boolean).filter((row) => seen.has(row.discovery_id) ? false : (seen.add(row.discovery_id), true));
}

export function inventoryMetrosForRegions(regions) {
  return [...new Set((Array.isArray(regions) ? regions : []).flatMap((region) => INVENTORY_METROS[region] || ["florida"]))];
}

export async function readAcquisitionInventory(db, regions, { signal, ceiling = 12000 } = {}) {
  const metros = inventoryMetrosForRegions(regions);
  const rows = [];
  let cursor = null;
  while (true) {
    let query = db.from("wf_inventory").select("place_id,name,lat,lng,metro,status")
      .eq("status", "OPERATIONAL").in("metro", metros).order("place_id", { ascending: true }).limit(500);
    if (cursor !== null) query = query.gt("place_id", cursor);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) throw new Error("social_acquisition_inventory_failed");
    if (!data.length) return rows;
    for (const row of data) {
      if (!row?.place_id || (cursor !== null && row.place_id <= cursor)) throw new Error("social_acquisition_inventory_cursor_invalid");
      cursor = row.place_id;
      rows.push(row);
      if (rows.length > ceiling) throw new Error("social_acquisition_inventory_ceiling");
    }
  }
}

export function resolveDiscoveryLocations(discoveries, inventory, { now } = {}) {
  if (!Number.isFinite(now)) throw new Error("location observation time required");
  return (Array.isArray(discoveries) ? discoveries : []).map((row) => {
    const identity = resolveSocialPlace({ caption: row.title }, { inventory, now });
    return { ...row, identity_status: identity.status, identity_method: identity.method,
      candidate_place_id: identity.place_id, identity_confidence: identity.confidence };
  });
}

export function qualifiedCandidateRows(discoveries, creators, { now } = {}) {
  if (!Number.isFinite(now)) throw new Error("qualification observation time required");
  const creatorMap = new Map((Array.isArray(creators) ? creators : [])
    .map((row) => [creatorKey(row.platform, row.handle), row]));
  const rows = [];
  for (const item of Array.isArray(discoveries) ? discoveries : []) {
    const creator = creatorMap.get(creatorKey(item.platform, item.creator_handle)) || null;
    const decision = qualifySocialPost({
      platform: item.platform, handle: item.creator_handle, caption: item.title,
      like_count: item.observed_likes, source: "search_index",
    }, { creator, now });
    if (!decision.eligible) continue;
    rows.push({
      media_id: item.media_id, platform: item.platform, source: "search_index",
      handle: item.creator_handle, hashtag: null, permalink: item.permalink,
      media_type: "SHORT_VIDEO", is_video: true, caption: item.title,
      thumbnail: null, posted_at: null, like_count: item.observed_likes,
      comments_count: item.observed_comments, engagement: 0,
      has_date: false, has_time: false, lead_score: item.observed_likes || 0,
      qualification_policy: decision.policy, qualification_reason: decision.reason,
      qualification_evidence: decision.evidence, creator_qualified: decision.creator_qualified,
      candidate_place_id: item.candidate_place_id, identity_status: item.identity_status,
      identity_method: item.identity_method,
    });
  }
  return rows;
}

export function sourceEvidenceRows(discoveries, observedAt) {
  if (!Number.isFinite(observedAt)) throw new Error("evidence observation time required");
  const observed = new Date(observedAt).toISOString();
  const expires = new Date(observedAt + 30 * 86400000).toISOString();
  return (Array.isArray(discoveries) ? discoveries : []).flatMap((row) => {
    const facts = [{ field_name: "indexed_social_link", evidence_quote: row.title || null }];
    if (row.observed_views !== null) facts.push({ field_name: "observed_views", evidence_quote: String(row.observed_views) });
    return facts.map((fact) => ({
      entity_type: "social_lead", entity_id: row.discovery_id, field_name: fact.field_name,
      source_provider: row.provider, source_url: row.permalink, evidence_quote: fact.evidence_quote,
      evidence_hash: createHash("sha256").update(`${row.discovery_id}\n${fact.field_name}\n${fact.evidence_quote || ""}`).digest("hex"),
      observed_at: observed, expires_at: expires, confidence: 1,
      verification_status: "observed", internal_use: true, display_allowed: false,
      derived_facts_allowed: true, raw_redistribution_allowed: false, commercial_api_allowed: false,
    }));
  });
}
