// lib/directSearch.js — FREE, server-only search over places Wayfind already owns.
//
// This module never calls Google or another metered provider. It searches the
// fresh (<=30 day) identity fields in wf_inventory, then joins exact place IDs
// to addresses Wayfind already stores in its publish-ready Atlas and creator
// registries. The route returns candidates; it never guesses which candidate a
// user meant. A caller may auto-open only when exactly one returned candidate
// carries exactMatch=true.

import { allCreators } from "./creatorVideos.js";
import { atlasPlaceFor, listPublishReadyAtlasIds, usableSupabaseEnv } from "./atlasPlaceAllowlist.js";
import { isOperational } from "./businessStatus.js";
import { deadlineSignal, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { invRowToPlace, distMeters, boxForRadius } from "./inventoryServe.js";
import { LANDING_CITIES } from "./landingCities.js";
import { bucketMetro } from "./promoteIndex.js";

export const DIRECT_SEARCH_RADIUS_M = 80_000;
export const QUALIFIED_CITY_RADIUS_M = 30_000;
export const DIRECT_SEARCH_LIMIT = 8;
export const DIRECT_SEARCH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const SOURCE_LIMIT = 100;

const PLACE_ID_RX = /^[A-Za-z0-9_-]+$/;
const STATE_NAMES = Object.freeze({ FL: "florida", HI: "hawaii" });
const STOP_TOKENS = new Set(["a", "an", "and", "at", "in", "of", "the"]);
// Observed first-party standalone city submissions outside LANDING_CITIES.
// Treating either as a venue near the device would silently substitute the
// current city for explicit intent. This list does not claim coverage or coords.
const OBSERVED_UNSUPPORTED_CITIES = new Set(["gastonia", "pensacola"]);

/** Punctuation/accent-insensitive text identity shared by names and addresses. */
export function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019'`]/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function exactNameMatch(query, name) {
  const q = normalizeSearchText(query);
  return !!q && q === normalizeSearchText(name);
}

function cityForms(city) {
  const name = normalizeSearchText(city.name);
  const state = normalizeSearchText(city.state);
  const fullState = STATE_NAMES[String(city.state || "").toUpperCase()] || state;
  return [...new Set([name, `${name} ${state}`, `${name} ${fullState}`, `${name} ${state} usa`, `${name} ${fullState} usa`])]
    .sort((a, b) => b.length - a.length);
}

const CITY_SUFFIXES = Object.values(LANDING_CITIES)
  .flatMap((city) => cityForms(city).map((form) => ({ city, form })))
  .sort((a, b) => b.form.length - a.form.length);

/**
 * Pull only an exact known city suffix from a venue query. The city is allowed
 * to override a supplied device center because it is explicit user intent.
 */
export function splitCityQualifier(query) {
  const normalized = normalizeSearchText(query);
  if (!normalized) return { text: "", city: null };
  for (const candidate of CITY_SUFFIXES) {
    if (normalized === candidate.form) return { text: "", city: candidate.city };
    if (!normalized.endsWith(` ${candidate.form}`)) continue;
    const text = normalized.slice(0, -(candidate.form.length + 1)).trim();
    if (text) return { text, city: candidate.city };
  }
  return { text: normalized, city: null };
}

function unsupportedLocationIntent(query, parsed) {
  if (parsed.city) return false;
  const normalized = normalizeSearchText(query);
  if (OBSERVED_UNSUPPORTED_CITIES.has(normalized)) return true;
  // An explicit City, ST/State shape that was not in the exact owned city table
  // must never fall back to the device center.
  const raw = String(query || "").trim();
  return /^[a-z][a-z .'-]{1,60},\s*(?:[a-z]{2}|[a-z]{4,20})(?:,\s*usa)?$/i.test(raw)
    || /,\s*[a-z][a-z .'-]{1,60},\s*(?:[a-z]{2}|[a-z]{4,20})(?:,\s*usa)?$/i.test(raw);
}

function envForRead(env) {
  const source = env || {};
  const raw = String(source.SUPABASE_URL || source.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : `https://${raw}`)) : "";
  const key = source.SUPABASE_SERVICE_ROLE_KEY || source.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return usableSupabaseEnv(url, key) ? { url, key } : null;
}

let STORED_ADDRESSES = null;

/** Addresses are curated owned records. Keep one deterministic record per ID. */
export function storedAddressIndex() {
  if (STORED_ADDRESSES) return STORED_ADDRESSES;
  const byId = new Map();
  for (const id of listPublishReadyAtlasIds()) {
    const place = atlasPlaceFor(id);
    if (!place || !PLACE_ID_RX.test(String(place.placeId || ""))) continue;
    byId.set(place.placeId, {
      placeId: place.placeId,
      name: place.name,
      address: place.address || null,
      city: null,
      category: place.category || null,
    });
  }
  const creatorLibrary = allCreators();
  const creatorSpots = [
    ...(creatorLibrary.creators || []).flatMap((creator) => creator.spots || []),
    ...(creatorLibrary.unattributed || []),
  ];
  for (const spot of creatorSpots) {
    if (!spot || !PLACE_ID_RX.test(String(spot.placeId || ""))) continue;
    const prior = byId.get(spot.placeId) || {};
    byId.set(spot.placeId, {
      placeId: spot.placeId,
      name: spot.name || prior.name || null,
      address: spot.address || prior.address || null,
      city: spot.city || prior.city || null,
      category: spot.category || prior.category || null,
    });
  }
  STORED_ADDRESSES = [...byId.values()];
  return STORED_ADDRESSES;
}

function queryTokens(text) {
  return normalizeSearchText(text).split(" ").filter((token) => token.length > 1 && !STOP_TOKENS.has(token));
}

function storedMatch(text, item, fullQuery = text) {
  const q = normalizeSearchText(text);
  const full = normalizeSearchText(fullQuery);
  const name = normalizeSearchText(item && item.name);
  const address = normalizeSearchText(item && item.address);
  if (!q) return null;
  if (name === q) return { rank: 0, kind: "exact-name", exact: true };
  if (address === q || address === full) return { rank: 0, kind: "exact-address", exact: true };
  if (name.startsWith(`${q} `) || q.startsWith(`${name} `)) return { rank: 1, kind: "name-prefix", exact: false };
  const tokens = queryTokens(q);
  if (tokens.length && tokens.every((token) => name.includes(token))) return { rank: 2, kind: "name", exact: false };
  if (address.startsWith(`${q} `) || address.includes(` ${q} `) || address.endsWith(` ${q}`)) {
    return { rank: 3, kind: "address", exact: false };
  }
  return null;
}

function inventoryMatch(text, row) {
  const q = normalizeSearchText(text);
  const name = normalizeSearchText(row && row.name);
  if (!q || !name) return null;
  if (name === q) return { rank: 0, kind: "exact-name", exact: true };
  if (name.startsWith(`${q} `) || q.startsWith(`${name} `)) return { rank: 1, kind: "name-prefix", exact: false };
  const tokens = queryTokens(q);
  if (tokens.length && tokens.every((token) => name.includes(token))) return { rank: 2, kind: "name", exact: false };
  return null;
}

function cityMatchesStored(item, city) {
  if (!city) return true;
  const cityName = normalizeSearchText(city.name);
  if (item.city) return normalizeSearchText(item.city) === cityName;
  const address = normalizeSearchText(item.address);
  // Some Atlas addresses are a street line only. Keep those candidates and
  // let the fresh inventory coordinate enforce the explicit city radius. An
  // explicit, different stored city is rejected above.
  return !address || address.includes(cityName) || !Object.values(LANDING_CITIES).some((known) => address.includes(normalizeSearchText(known.name)));
}

function ownedQueryUrl(config, { table, freshnessColumn, fields, text, storedIds, lat, lng, radiusMeters, nowMs }) {
  const box = boxForRadius(lat, lng, radiusMeters);
  const url = new URL(`/rest/v1/${table}`, config.url);
  url.searchParams.set("select", fields);
  url.searchParams.set("lat", `gte.${box.minLat.toFixed(5)}`);
  url.searchParams.append("lat", `lte.${box.maxLat.toFixed(5)}`);
  url.searchParams.set("lng", `gte.${box.minLng.toFixed(5)}`);
  url.searchParams.append("lng", `lte.${box.maxLng.toFixed(5)}`);
  url.searchParams.set(freshnessColumn, `gte.${new Date(nowMs - DIRECT_SEARCH_MAX_AGE_MS).toISOString()}`);
  // One sentinel row proves truncation rather than guessing from a full page.
  url.searchParams.set("limit", String(SOURCE_LIMIT + 1));

  const tokens = queryTokens(text).sort((a, b) => b.length - a.length);
  const broad = (tokens[0] || normalizeSearchText(text)).slice(0, 80);
  const clauses = [];
  if (broad) clauses.push(`name.ilike.*${broad.replace(/[*,()]/g, "")}*`);
  const ids = [...new Set(storedIds || [])].filter((id) => PLACE_ID_RX.test(id)).slice(0, 50);
  if (ids.length) clauses.push(`place_id.in.(${ids.join(",")})`);
  if (clauses.length) url.searchParams.set("or", `(${clauses.join(",")})`);
  return url;
}

function suppressionQueryUrl(config, ids) {
  const url = new URL("/rest/v1/wf_inventory", config.url);
  url.searchParams.set("select", "place_id,status,excluded");
  url.searchParams.set("place_id", `in.(${ids.join(",")})`);
  url.searchParams.set("limit", String(SOURCE_LIMIT));
  return url;
}

function indexRowToPlace(row) {
  const signals = row.signals && typeof row.signals === "object" ? row.signals : {};
  const types = row.category ? [String(row.category).toLowerCase()] : [];
  return {
    id: row.place_id,
    displayName: { text: row.name },
    location: { latitude: row.lat, longitude: row.lng },
    types,
    rating: typeof signals.rating === "number" ? signals.rating : null,
    userRatingCount: typeof signals.reviews === "number" ? signals.reviews : 0,
    _wfInventory: true,
  };
}

function freshAt(row, source, nowMs) {
  const raw = source === "inventory" ? row.refreshed_at : row.seen_at;
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) && timestamp >= nowMs - DIRECT_SEARCH_MAX_AGE_MS && timestamp <= nowMs + 5 * 60 * 1000;
}

function coverageFor(lat, lng, city, radiusMeters) {
  const metro = bucketMetro(lat, lng);
  // "global" is a queue bucket, explicitly not a served market.
  if (!metro || metro === "global") return null;
  return {
    kind: "owned-inventory",
    metro,
    radiusMeters,
    ...(city ? { city: `${city.name}, ${city.state}` } : {}),
  };
}

/** Pure deterministic ordering; no quality score or invented relevance. */
export function rankOwnedCandidates(candidates, limit = DIRECT_SEARCH_LIMIT) {
  return [...(candidates || [])]
    .sort((a, b) => a.matchRank - b.matchRank || a.distanceMeters - b.distanceMeters || a.place.displayName.text.localeCompare(b.place.displayName.text) || a.place.id.localeCompare(b.place.id))
    .slice(0, limit)
    .map(({ place }) => place);
}

function response(status, query, extra = {}) {
  return { status, places: [], source: "owned-inventory", query, ...extra };
}

/**
 * Search fresh owned inventory. Dependencies are injectable so the complete
 * read/failure/empty contract is executable without network or real secrets.
 */
export async function searchOwnedPlaces({ query, lat, lng, env = process.env, fetchImpl = fetch, nowMs = Date.now(), addressIndex } = {}) {
  const original = String(query || "").trim().slice(0, 160);
  const parsed = splitCityQualifier(original);
  if (unsupportedLocationIntent(original, parsed)) return response("unavailable", original, { reason: "unsupported_location" });
  if (parsed.text.length < 2) return response("unavailable", original, { reason: parsed.city ? "place-query-required" : "invalid-query" });

  const hasLat = lat !== null && lat !== undefined && String(lat).trim() !== "";
  const hasLng = lng !== null && lng !== undefined && String(lng).trim() !== "";
  const suppliedLat = hasLat ? Number(lat) : NaN, suppliedLng = hasLng ? Number(lng) : NaN;
  const hasPoint = Number.isFinite(suppliedLat) && Math.abs(suppliedLat) <= 90 && Number.isFinite(suppliedLng) && Math.abs(suppliedLng) <= 180;
  const centerLat = parsed.city ? parsed.city.lat : (hasPoint ? suppliedLat : null);
  const centerLng = parsed.city ? parsed.city.lng : (hasPoint ? suppliedLng : null);
  if (centerLat == null || centerLng == null) return response("unavailable", original, { reason: "unsupported_location" });

  const radiusMeters = parsed.city ? QUALIFIED_CITY_RADIUS_M : DIRECT_SEARCH_RADIUS_M;
  const coverage = coverageFor(centerLat, centerLng, parsed.city, radiusMeters);
  if (!coverage) return response("unavailable", original, { reason: "unsupported_location", coverage: { kind: "owned-inventory", available: false } });
  const config = envForRead(env);
  if (!config) return response("unavailable", original, { reason: "not_configured", coverage });

  const stored = (addressIndex || storedAddressIndex())
    .map((item) => ({ item, match: storedMatch(parsed.text, item, original) }))
    .filter(({ item, match }) => match && cityMatchesStored(item, parsed.city));
  const storedById = new Map(stored.map(({ item, match }) => [item.placeId, { item, match }]));
  const commonQuery = {
    text: parsed.text,
    storedIds: [...storedById.keys()],
    lat: centerLat,
    lng: centerLng,
    radiusMeters,
    nowMs,
  };
  const inventoryUrl = ownedQueryUrl(config, {
    ...commonQuery,
    table: "wf_inventory",
    freshnessColumn: "refreshed_at",
    fields: "place_id,name,lat,lng,category,primary_type,google_types,cuisines,status,excluded,signals,photo_ref,refreshed_at",
  });
  const indexUrl = ownedQueryUrl(config, {
    ...commonQuery,
    table: "wf_place_ids",
    freshnessColumn: "seen_at",
    fields: "place_id,name,lat,lng,category,signals,seen_at",
  });

  const read = async (url) => {
    try {
      const result = await fetchImpl(url, {
        headers: { apikey: config.key, Authorization: `Bearer ${config.key}` },
        cache: "no-store",
        signal: deadlineSignal(DB_DEADLINE_MS),
      });
      if (!result || !result.ok) return null;
      const rows = await result.json();
      return Array.isArray(rows) ? { rows: rows.slice(0, SOURCE_LIMIT), truncated: rows.length > SOURCE_LIMIT } : null;
    } catch {
      return null;
    }
  };
  const [inventoryResult, indexResult] = await Promise.all([read(inventoryUrl), read(indexUrl)]);
  if (!inventoryResult && !indexResult) return response("unavailable", original, { reason: "source_unavailable", coverage });
  const inventoryRows = inventoryResult && inventoryResult.rows;
  const indexRows = indexResult && indexResult.rows;

  // seen_at is written when a Google result is actually observed and its
  // identity skeleton is upserted. It is valid freshness evidence, but the
  // permanent index does not carry inventory's excluded/closed controls. Read
  // those controls independently by exact ID; on failure, index-only rows do
  // not serve.
  const freshIndexRows = (indexRows || []).filter((row) => row && freshAt(row, "index", nowMs));
  const indexIds = [...new Set(freshIndexRows.map((row) => row.place_id).filter((id) => PLACE_ID_RX.test(String(id || ""))))];
  const suppressionResult = indexIds.length ? await read(suppressionQueryUrl(config, indexIds)) : { rows: [], truncated: false };
  const suppressedIds = new Set((suppressionResult && suppressionResult.rows || [])
    .filter((row) => row && (row.excluded === true || !isOperational(row)))
    .map((row) => row.place_id));
  const sourcePartial = !inventoryResult || !indexResult || !suppressionResult;
  const sourceTruncated = !!(inventoryResult && inventoryResult.truncated) || !!(indexResult && indexResult.truncated);

  // Inventory is richer and wins when both sources carry a fresh row. The
  // permanent ID index fills identities seen more recently than inventory was
  // refreshed; it never upgrades a stale row or invents missing fields.
  const rowsById = new Map();
  if (suppressionResult) {
    for (const row of freshIndexRows) {
      if (!suppressedIds.has(row.place_id)) rowsById.set(row.place_id, { row, source: "index" });
    }
  }
  for (const row of inventoryRows || []) {
    if (row && freshAt(row, "inventory", nowMs)) rowsById.set(row.place_id, { row, source: "inventory" });
  }

  const candidates = [];
  for (const { row, source } of rowsById.values()) {
    if (!row || !PLACE_ID_RX.test(String(row.place_id || "")) || row.excluded === true || !isOperational(row)) continue;
    if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng)) continue;
    const distanceMeters = distMeters(centerLat, centerLng, row.lat, row.lng);
    if (distanceMeters > radiusMeters) continue;
    const storedHit = storedById.get(row.place_id) || null;
    const match = storedHit ? storedHit.match : inventoryMatch(parsed.text, row);
    if (!match) continue;
    const place = source === "inventory" ? invRowToPlace(row) : indexRowToPlace(row);
    if (storedHit && storedHit.item.address) place.formattedAddress = storedHit.item.address;
    place.exactMatch = match.exact;
    place.matchKind = match.kind;
    // Distance is from the request's search center (or the explicit qualifier's
    // center), never a claim about which municipality the venue belongs to.
    // The client may render this as "X mi from search area" without guessing a
    // place city from coordinates.
    place.distanceMeters = Math.round(distanceMeters);
    candidates.push({ place, matchRank: match.rank, distanceMeters });
  }

  const ambiguity = sourceTruncated ? "source_truncated" : sourcePartial ? "source_partial" : candidates.length > 1 ? "multiple_candidates" : null;
  const places = rankOwnedCandidates(candidates);
  if (sourcePartial || sourceTruncated) for (const place of places) place.exactMatch = false;
  const freshness = { maxAgeDays: 30, cutoff: new Date(nowMs - DIRECT_SEARCH_MAX_AGE_MS).toISOString() };
  if (!places.length && sourcePartial) {
    return response("unavailable", original, { reason: "source_unavailable", coverage, freshness });
  }
  if (!places.length && sourceTruncated) {
    return response("unavailable", original, { reason: "source_truncated", coverage, freshness, ambiguity: "source_truncated" });
  }
  if (!places.length) return response("empty", original, { reason: "not_in_library", coverage, freshness });
  return {
    status: "ok", places, source: "owned-inventory", query: original, coverage, freshness,
    candidateCount: candidates.length,
    ...(ambiguity ? { ambiguity } : {}),
  };
}
