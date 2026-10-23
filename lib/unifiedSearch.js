// lib/unifiedSearch.js — phrase map, then the catalog/index, then optional Claude filters.
//
// Place rows stay on lib/directSearch.js. This module adds pages, guides,
// events, and coupons. Claude runs only for an unrecognized query when
// WAYFIND_SEARCH_UNDERSTAND=on, and only as a filter. Ranking is searchRank.

import { usableSupabaseEnv } from "./atlasPlaceAllowlist.js";
import { buildSearchCatalog } from "./searchCatalog.js";
import { resolveSearchIntent } from "./searchIntent.js";
import { dedupeSearchResults, rankSearchDocuments } from "./searchRank.js";
import { understandSearch } from "./searchUnderstand.js";

const DISPLAYABLE = new Set(["scheduled", "sold_out"]);

function supabaseConfig(env) {
  const source = env || {};
  const raw = String(source.SUPABASE_URL || source.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : `https://${raw}`) : "";
  const key = String(source.SUPABASE_SERVICE_ROLE_KEY || source.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  // Same rule as place search: a missing or placeholder host is unconfigured.
  // Do not spend the request waiting on a host that is not the index.
  return usableSupabaseEnv(url, key) ? { url, key } : null;
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function eventToDoc(row) {
  if (!row || !row.event_id || !row.slug || !row.event_name) return null;
  if (row.event_status && !DISPLAYABLE.has(row.event_status)) return null;
  const city = String(row.city || "").trim();
  const audience = Array.isArray(row.audience) ? row.audience : [];
  return {
    kind: "event",
    title: String(row.event_name),
    href: `/florida-events/${row.slug}`,
    secondary: ["Event", city || null, row.start_date || null].filter(Boolean).join(" · "),
    city_slug: slugify(city) || null,
    city_name: city || null,
    category: "events",
    price_band: row.is_free === true ? "free" : (typeof row.price_band === "string" ? row.price_band : null),
    kid_friendly: audience.length ? audience.includes("families") || audience.includes("kids") : null,
    keywords: Array.isArray(row.tags) ? row.tags.map(String) : [],
    lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
    lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
  };
}

function indexRowToDoc(row) {
  if (!row || row.kind === "place" || !row.title || !row.href) return null;
  if (!["event", "guide", "page", "coupon"].includes(row.kind)) return null;
  return {
    kind: row.kind,
    title: String(row.title),
    href: String(row.href),
    secondary: row.secondary || null,
    city_slug: row.city_slug || null,
    city_name: row.city_name || null,
    category: row.category || null,
    price_band: row.price_band || null,
    kid_friendly: row.kid_friendly == null ? null : row.kid_friendly === true,
    keywords: Array.isArray(row.keywords) ? row.keywords.map(String) : [],
    lat: Number.isFinite(Number(row.lat)) ? Number(row.lat) : null,
    lng: Number.isFinite(Number(row.lng)) ? Number(row.lng) : null,
  };
}

async function readJson(fetchImpl, url, config) {
  const response = await fetchImpl(url, {
    headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "content-type": "application/json" },
    cache: "no-store",
  });
  if (!response || !response.ok) return null;
  const body = await response.json();
  return Array.isArray(body) ? body : null;
}

function searchToken(query) {
  const tokens = String(query || "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
  tokens.sort((a, b) => b.length - a.length);
  return (tokens[0] || "").replace(/[*,()]/g, "").slice(0, 40);
}

export async function searchIndexDocuments(query, { env = process.env, fetchImpl = fetch } = {}) {
  return remoteDocuments(supabaseConfig(env), query, fetchImpl);
}

async function remoteDocuments(config, query, fetchImpl) {
  if (!config) return [];
  try {
    const rpc = new URL("/rest/v1/rpc/wf_search_documents_query", config.url);
    const response = await fetchImpl(rpc, {
      method: "POST",
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_query: String(query || "").slice(0, 160), p_limit: 40 }),
      cache: "no-store",
    });
    if (response && response.ok) {
      const rows = await response.json();
      if (Array.isArray(rows)) return rows.map(indexRowToDoc).filter(Boolean);
    }
  } catch {
    // The index is optional until the migration is applied.
  }
  const token = searchToken(query);
  if (!token) return [];
  try {
    const url = new URL("/rest/v1/wf_events", config.url);
    url.searchParams.set("select", "event_id,slug,event_name,city,start_date,end_date,venue,category,tags,audience,price_band,is_free,lat,lng,event_status");
    url.searchParams.set("event_name", `ilike.*${token}*`);
    url.searchParams.set("event_status", "in.(scheduled,sold_out)");
    url.searchParams.set("limit", "20");
    const rows = await readJson(fetchImpl, url, config);
    return (rows || []).map(eventToDoc).filter(Boolean);
  } catch {
    return [];
  }
}

function publicResult(row) {
  if (!row || typeof row.href !== "string" || !row.href.startsWith("/") || row.href.startsWith("//")) return null;
  return {
    kind: row.kind,
    title: String(row.title || "").slice(0, 160),
    href: row.href.slice(0, 240),
    secondary: String(row.secondary || row.kind || "").slice(0, 160),
    city_slug: row.city_slug || null,
    lead: row.lead === true,
  };
}

/**
 * Non-place hits for the search dropdown. Place ordering stays in directSearch.
 * `meta.understand` is a short code for tests; it is not model text.
 */
export async function searchLibrary({
  query,
  lat,
  lng,
  env = process.env,
  fetchImpl = fetch,
  nowMs = Date.now(),
  today,
  extraDocuments = [],
} = {}) {
  const intent = resolveSearchIntent(query, { lat, lng });
  let understand = { filters: null, reason: "skipped_intent", called: false };
  if (!intent.recognized) {
    understand = await understandSearch({ query, city: intent.city, env, fetchImpl, nowMs });
  }
  let filters = understand.filters;
  if (filters && filters.city && intent.city && filters.city !== intent.city.slug && intent.city.source !== "home") {
    filters = { ...filters, city: null };
  }
  const catalog = buildSearchCatalog(today ? { today } : {});
  const remote = await remoteDocuments(supabaseConfig(env), query, fetchImpl);
  const ranked = rankSearchDocuments([...catalog, ...remote, ...extraDocuments], {
    query: intent.recognized ? intent.phrase : query,
    city: intent.city,
    filters: intent.recognized ? null : filters,
  });
  const leads = intent.result ? [intent.result] : [];
  const extras = intent.recognized
    ? ranked.filter((doc) => doc.kind !== "page" && (!doc.city_slug || doc.city_slug === intent.city.slug || doc.city_slug === (intent.result && intent.result.city_slug)))
    : ranked.filter((doc) => doc.kind !== "place");
  const results = dedupeSearchResults([...leads, ...extras], 8).map(publicResult).filter(Boolean);
  return {
    results,
    city: intent.city,
    recognized: intent.recognized,
    meta: {
      understand: understand.reason,
      called: understand.called === true,
      filters: filters || null,
    },
  };
}
