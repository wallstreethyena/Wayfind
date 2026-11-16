// lib/unifiedSearch.js — phrase map, then the catalog/index, then optional Claude filters.
//
// Place rows stay on lib/directSearch.js. This module adds pages, guides,
// events, and coupons. Claude runs only for an unrecognized query when
// WAYFIND_SEARCH_UNDERSTAND=on, and only as a filter. Ranking is searchRank.

import { usableSupabaseEnv } from "./atlasPlaceAllowlist.js";
import { buildSearchCatalog } from "./searchCatalog.js";
import { occurrenceDatesFor } from "./eventOccurrences.js";
import { eventIsOpenRun, EVENT_OPEN_RUN_DAYS } from "./eventVisitFacts.js";
import { nextOpenDay } from "./scheduleNoteDays.js";
import { resolveSearchIntent } from "./searchIntent.js";
import { dedupeSearchResults, rankSearchDocuments } from "./searchRank.js";
import { siteTodayStr } from "./siteTime.js";
import { understandSearch } from "./searchUnderstand.js";

const DISPLAYABLE = new Set(["scheduled", "sold_out"]);

function addIsoDays(dayStr, n) {
  const [y, m, d] = String(dayStr).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

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
    start_date: typeof row.start_date === "string" ? row.start_date : null,
    end_date: typeof row.end_date === "string" ? row.end_date : null,
    select_nights: row.select_nights === true,
    schedule_note: typeof row.schedule_note === "string" ? row.schedule_note : "",
    verify_note: typeof row.verify_note === "string" ? row.verify_note : "",
    occurrence_dates: occurrenceDatesFor(row),
  };
}

function eventDocActiveToday(doc, dayStr) {
  if (!doc || doc.kind !== "event" || !/^\d{4}-\d{2}-\d{2}$/.test(String(dayStr || ""))) return false;
  if (Array.isArray(doc.occurrence_dates) && doc.occurrence_dates.length) {
    return doc.occurrence_dates.includes(dayStr);
  }
  const start = typeof doc.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(doc.start_date) ? doc.start_date : null;
  if (!start || start > dayStr) return false;
  const endRaw = typeof doc.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(doc.end_date) ? doc.end_date : null;
  const openRun = eventIsOpenRun({
    start_date: start,
    end_date: endRaw,
    schedule_note: doc.schedule_note,
    verify_note: doc.verify_note,
  });
  const effectiveEnd = endRaw || (openRun ? addIsoDays(start, EVENT_OPEN_RUN_DAYS) : start);
  if (effectiveEnd && effectiveEnd < dayStr) return false;
  if (doc.select_nights || doc.schedule_note) {
    return nextOpenDay({
      start_date: start,
      end_date: effectiveEnd,
      select_nights: doc.select_nights === true,
      schedule_note: doc.schedule_note || "",
    }, dayStr, dayStr) === dayStr;
  }
  return true;
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

async function fetchDatedEvents(config, query, fetchImpl, { needsActiveToday = false, todayStr = null } = {}) {
  const token = searchToken(query);
  if (!config || !token) return [];
  const isChristmas = token === "christmas";
  try {
    const url = new URL("/rest/v1/wf_events", config.url);
    url.searchParams.set("select", "event_id,slug,event_name,city,start_date,end_date,select_nights,schedule_note,venue,category,tags,audience,price_band,is_free,lat,lng,event_status");
    if (isChristmas) {
      url.searchParams.set("or", "(event_name.ilike.*christmas*,event_name.ilike.*holiday*,category.eq.holiday)");
    } else {
      url.searchParams.set("event_name", `ilike.*${token}*`);
    }
    if (needsActiveToday && todayStr) {
      url.searchParams.set("start_date", `lte.${todayStr}`);
    }
    url.searchParams.set("event_status", "in.(scheduled,sold_out)");
    url.searchParams.set("order", "start_date.asc.nullslast");
    url.searchParams.set("limit", isChristmas ? "60" : "20");
    const rows = await readJson(fetchImpl, url, config);
    return (rows || []).map(eventToDoc).filter(Boolean);
  } catch {
    return [];
  }
}

async function remoteDocuments(config, query, fetchImpl, options = {}) {
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
      if (Array.isArray(rows)) {
        const indexed = rows.map(indexRowToDoc).filter(Boolean);
        if (!options.needsActiveToday) return indexed;
        const datedEvents = await fetchDatedEvents(config, query, fetchImpl, options);
        return [...indexed.filter((doc) => doc.kind !== "event"), ...datedEvents];
      }
    }
  } catch {
    // The index is optional until the migration is applied.
  }
  return fetchDatedEvents(config, query, fetchImpl, options);
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
  const effectiveToday = today || siteTodayStr(new Date(nowMs));
  const catalog = buildSearchCatalog(today ? { today } : {});
  const c = intent.constraints || {};
  const needsActiveToday = c.openNow === true || c.when === "now" || c.when === "tonight" || c.when === "today";
  const remoteQuery = intent.recognized && intent.phrase ? intent.phrase : query;
  const remote = await remoteDocuments(supabaseConfig(env), remoteQuery, fetchImpl, { needsActiveToday, todayStr: effectiveToday });
  const activeOk = (doc) => {
    if (!doc || doc.kind !== "event") return true;
    if (doc.end_date && /^\d{4}-\d{2}-\d{2}$/.test(doc.end_date) && doc.end_date < effectiveToday) return false;
    if (needsActiveToday) return eventDocActiveToday(doc, effectiveToday);
    return true;
  };
  const ranked = rankSearchDocuments([...catalog, ...remote, ...extraDocuments].filter(activeOk), {
    query: intent.recognized ? intent.phrase : query,
    city: intent.city,
    filters: intent.recognized ? null : filters,
  });
  const leads = intent.result ? [intent.result] : [];
  // "free things to do": only rows that SAY they are free. applySearchFilters
  // keeps unknown prices and relaxes to the full set when nothing matches,
  // which would list paid rows under a free search, so it is not used here.
  const freeOk = (doc) => !intent.free || doc.price_band === "free";
  const themeOk = (doc) => !c.excludeThemeParks || !/\b(theme\s*park|amusement\s*park|magic\s*kingdom|epcot|hollywood\s*studios|animal\s*kingdom|walt\s*disney|universal\s*studios|islands\s*of\s*adventure|seaworld|busch\s*gardens|legoland)\b/i.test(String(doc && doc.title || ""));
  const extras = intent.recognized
    ? ranked.filter((doc) => doc.kind !== "page" && freeOk(doc) && themeOk(doc) && (!doc.city_slug || doc.city_slug === intent.city.slug || doc.city_slug === (intent.result && intent.result.city_slug)))
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
