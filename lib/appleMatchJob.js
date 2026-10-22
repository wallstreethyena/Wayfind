// lib/appleMatchJob.js — THE APPLE PLACE ID BACKFILL AS A RESUMABLE JOB.
// Shared by the scheduled route (app/api/cron/apple-place-match) and the
// manual CLI (scripts/apple-place-match.mjs), so both reserve, match, store
// and stop by exactly the same rules. Every network call goes through the
// injected `fetchImpl`, so tests simulate Supabase and Apple and never burn
// real quota.
//
// WHAT IT KEEPS: public.wf_apple_place_ids (migration 20261021180000) — an
// Apple Place ID (storable: "Place IDs are exempt from the storage
// restrictions in Section 2.5 of Attachment 6",
// developer.apple.com/documentation/mapkit/identifying-unique-locations-with-place-ids)
// or a refusal reason, plus Wayfind's own match evidence. Apple's names,
// addresses and coordinates are read in memory to decide identity
// (lib/applePlaceMatch.js, the SAME rule the browser applies) and dropped.
//
// RESUMABLE BY STATE, NOT BY A STORED CURSOR. Each run re-derives the backlog:
// wf_inventory rows (OPERATIONAL, not excluded) with no wf_apple_place_ids row,
// a row stored under a different Wayfind name (renamed), a stale row (older
// than RECHECK_DAYS) or a retryable refusal (RETRYABLE_REASONS). Paging both
// tables uses the DATABASE's order (order=place_id.asc + place_id=gt.cursor)
// and lib/dbCursor.createCursorGuard — never a JS comparison of text keys
// (en_US collation sorts "ChIJZ_" after "ChIJjb"). A run that stops for any
// reason simply leaves the rest of the backlog for the next run. Transient
// Apple failures store nothing, so those places stay in the backlog.
//
// COST: zero. Apple Maps Server API is part of the Apple Developer Program
// ("up to 25,000 service calls per day per team between Apple Maps Server API
// and MapKit JS. If your app exceeds this quota, the service returns an HTTP
// 429", developer.apple.com/documentation/applemapsserverapi). Every Apple
// search first reserves ONE unit of the shared 'apple_maps' daily ceiling
// (15,000, wf_source_registry) through the atomic
// public.wf_reserve_free_provider_call, capability 'server_search'. The RPC
// returns the provider's running total and this capability's running total
// for the day AFTER the reservation, serialized by Postgres row locks, so each
// reserved unit has a unique position. A unit is spent on Apple only when its
// position is inside BOTH limits:
//   * BACKFILL_DAILY_MAX (6,000) server_search units per day, and
//   * BACKFILL_PROVIDER_STOP (12,000) provider units per day,
// leaving at least 3,000 of the 15,000 for live map traffic (PlaceLookup and
// Search in the browser), which itself stays far under Apple's free 25,000.
// Concurrent or retried runs therefore cannot exceed either limit: the
// position check is per unit, not a read-then-act race. No Google call ever.
import { createPrivateKey, sign } from "node:crypto";
import { matchApplePlace, normalizeName } from "./applePlaceMatch.js";
import { createCursorGuard } from "./dbCursor.js";
import { siteTodayStr } from "./siteTime.js";

export const JOB = "apple-place-match";
export const METHOD = "maps-server-api-search-v1";
export const CAPABILITY = "server_search";
export const BACKFILL_DAILY_MAX = 6000;
export const BACKFILL_PROVIDER_STOP = 12000;
export const RECHECK_DAYS = 90;
// A refusal that may change without the Wayfind row changing: Apple had no POI
// at all for the name. Retried after its own short window; identity refusals
// (ambiguous, name-mismatch, chain-needs-locality, ...) wait for RECHECK_DAYS.
export const RETRYABLE_REASONS = Object.freeze({ "no-results": 7 });
export const MAX_CONSECUTIVE_ERRORS = 3;
export const APPLE_TIMEOUT_MS = 8000;
export const CREDENTIALS_MISSING_NOTE = "apple credentials not configured; no Apple calls (map keeps existing pins + Search fallback)";
export const BACKLOG_EXHAUSTED_NOTE = "backlog exhausted; no Apple calls";
export const CREDENTIALS_INVALID_NOTE = "apple credentials invalid or expired; no Apple calls until fixed";
export const LEDGER_MISSING_NOTE = "apple budget ledger not provisioned; no Apple calls (apply migration 20261021180000)";
const PAGE = 1000;
const DAY = 86400000;

const env = (e, name) => { const v = String((e || {})[name] || "").trim(); return v || null; };

// ---- credentials + Apple auth --------------------------------------------
// Server-only env (never NEXT_PUBLIC_). Precedence:
//   A. APPLE_MAPS_SERVER_TOKEN: a Maps token generated in the Apple Developer
//      portal with Token Type "Server API" (Restriction "None"). Used as the
//      Bearer for GET /v1/token.
//   B. APPLE_MAPS_TEAM_ID + APPLE_MAPS_KEY_ID + APPLE_MAPS_PRIVATE_KEY (.p8
//      PEM; real newlines or literal "\n" sequences): an ES256 JWT is signed
//      here per run and used as that Bearer.
//   neither: null (controlled fallback, CREDENTIALS_MISSING_NOTE).
export function normalizePem(pem) {
  return String(pem || "").trim().replace(/^["']|["']$/g, "").replace(/\\r\\n|\\n/g, "\n").replace(/\r\n/g, "\n").trim();
}
export function appleCredentials(e = process.env) {
  const serverToken = env(e, "APPLE_MAPS_SERVER_TOKEN");
  if (serverToken) return { kind: "server-token", token: serverToken };
  const team = env(e, "APPLE_MAPS_TEAM_ID"), kid = env(e, "APPLE_MAPS_KEY_ID"), pem = env(e, "APPLE_MAPS_PRIVATE_KEY");
  return team && kid && pem ? { kind: "jwt", team, kid, pem: normalizePem(pem) } : null;
}

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
// The Maps auth token: ES256 JWT { alg, kid, typ } / { iss: team, iat, exp, scope: "server_api" } (no origin),
// exchanged at GET https://maps-api.apple.com/v1/token (Authorization: Bearer
// <auth token>) for { accessToken, expiresInSeconds } (documented 1800 s):
// developer.apple.com/documentation/applemapsserverapi/-v1-token
export function mapsAuthToken(creds, nowMs = Date.now()) {
  const now = Math.floor(nowMs / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid: creds.kid, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: creds.team, iat: now, exp: now + 1800, scope: "server_api" }));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key: createPrivateKey(creds.pem), dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}

export function createAppleSearch({ creds, fetchImpl = fetch, now = () => Date.now(), timeoutMs = APPLE_TIMEOUT_MS }) {
  let access = null;
  const call = async (url, headers) => {
    try { return await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) }); }
    catch (e) { return { timeout: true, error: String((e && e.message) || e).slice(0, 80) }; }
  };
  const token = async () => {
    if (access && access.until > now() + 60000) return { token: access.token };
    let jwt;
    if (creds.kind === "server-token") jwt = creds.token;
    else try { jwt = mapsAuthToken(creds, now()); } catch { return { fatal: "apple private key unreadable", credentials: true }; }
    const r = await call("https://maps-api.apple.com/v1/token", { Authorization: `Bearer ${jwt}` });
    if (r.timeout) return { error: "token timeout" };
    if (r.status === 401 || r.status === 403) return { fatal: `apple token refused (HTTP ${r.status})`, credentials: true };
    if (r.status === 429) return { quota: true };
    if (!r.ok) return { error: `token HTTP ${r.status}` };
    const j = await r.json().catch(() => null);
    if (!j || typeof j.accessToken !== "string") return { error: "token response invalid" };
    access = { token: j.accessToken, until: now() + (Number(j.expiresInSeconds) || 1800) * 1000 };
    return { token: access.token };
  };
  // -> { results } | { quota:true } | { error } | { fatal }
  const search = async (name, box) => {
    const t = await token();
    if (!t.token) return t;
    const q = new URLSearchParams({ q: name, searchRegion: `${box.north},${box.east},${box.south},${box.west}`, limitToCountries: "US", resultTypeFilter: "Poi", lang: "en-US" });
    const r = await call(`https://maps-api.apple.com/v1/search?${q}`, { Authorization: `Bearer ${t.token}` });
    if (r.timeout) return { error: "timeout" };
    if (r.status === 429) return { quota: true };
    if (r.status === 401) { access = null; return { error: "HTTP 401" }; }
    if (!r.ok) return { error: `HTTP ${r.status}` };
    const j = await r.json().catch(() => null);
    return { results: j && Array.isArray(j.results) ? j.results : [] };
  };
  // Exchange the credential BEFORE any unit is reserved, so a bad or expired
  // credential costs no ledger unit and no search call.
  search.prepare = token;
  return search;
}

// ---- the shared daily ceiling ---------------------------------------------
// -> { allowed, reason, providerCalls, backfillCalls }. `allowed` only when the
// RPC reserved AND this unit's position is inside both backfill limits.
export async function reserveBackfillUnit({ sb, fetchImpl, nowMs = Date.now(), dailyMax = BACKFILL_DAILY_MAX, providerStop = BACKFILL_PROVIDER_STOP }) {
  let r;
  try {
    r = await fetchImpl(`${sb.url}/rest/v1/rpc/wf_reserve_free_provider_call`, {
      method: "POST", headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_provider: "apple_maps", p_capability: CAPABILITY, p_usage_date: siteTodayStr(new Date(nowMs)), p_units: 1 }),
    });
  } catch { return { allowed: false, reason: "meter_unavailable", providerCalls: null, backfillCalls: null }; }
  if (!r || !r.ok) return { allowed: false, reason: `meter HTTP ${r ? r.status : "?"}`, providerCalls: null, backfillCalls: null };
  const rows = await r.json().catch(() => null);
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!row) return { allowed: false, reason: "meter_unavailable", providerCalls: null, backfillCalls: null };
  const providerCalls = Number(row.calls), backfillCalls = Number(row.free_units);
  if (row.allowed !== true) return { allowed: false, reason: String(row.reason || "meter_refused"), providerCalls, backfillCalls };
  if (!Number.isFinite(backfillCalls) || backfillCalls > dailyMax) return { allowed: false, reason: "backfill_daily_max", providerCalls, backfillCalls };
  if (!Number.isFinite(providerCalls) || providerCalls > providerStop) return { allowed: false, reason: "live_headroom", providerCalls, backfillCalls };
  return { allowed: true, reason: "reserved", providerCalls, backfillCalls };
}

// Is the shared ledger + Place ID table in place? Both come from migration
// 20261021180000_wf_apple_place_ids.sql. Read-only probes; no reservation.
export async function ledgerProvisioned({ sb, fetchImpl }) {
  const h = { apikey: sb.key, Authorization: `Bearer ${sb.key}` };
  try {
    const reg = await fetchImpl(`${sb.url}/rest/v1/wf_source_registry?select=provider,status,hard_call_ceiling_daily&provider=eq.apple_maps&limit=1`, { headers: h, cache: "no-store" });
    if (!reg || !reg.ok) return false;
    const rows = await reg.json();
    if (!Array.isArray(rows) || rows.length !== 1 || !(Number(rows[0].hard_call_ceiling_daily) > 0)) return false;
    const t = await fetchImpl(`${sb.url}/rest/v1/wf_apple_place_ids?select=place_id&limit=1`, { headers: h, cache: "no-store" });
    return !!(t && t.ok);
  } catch { return false; }
}

// Did today's latest pulse already say the credentials are invalid? Then this
// run neither calls Apple nor pulses again (one note per day, no paging storm).
export async function credentialsAlreadyRefusedToday({ sb, fetchImpl, nowMs = Date.now() }) {
  try {
    const r = await fetchImpl(`${sb.url}/rest/v1/wf_job_pulse?select=note,ran_at&job=eq.${JOB}&order=ran_at.desc&limit=1`, { headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` }, cache: "no-store" });
    if (!r || !r.ok) return false;
    const rows = await r.json();
    const last = Array.isArray(rows) ? rows[0] : null;
    return !!(last && last.note === CREDENTIALS_INVALID_NOTE && siteTodayStr(new Date(last.ran_at)) === siteTodayStr(new Date(nowMs)));
  } catch { return false; }
}

// ---- the backlog ----------------------------------------------------------
async function readAll({ sb, fetchImpl, table, select, filters = "" }) {
  const out = [];
  const guard = createCursorGuard();
  let cursor = "";
  for (let page = 0; page < 200; page++) {
    const q = `select=${select}&order=place_id.asc&limit=${PAGE}${filters}${cursor ? `&place_id=gt.${encodeURIComponent(cursor)}` : ""}`;
    const r = await fetchImpl(`${sb.url}/rest/v1/${table}?${q}`, { headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}` }, cache: "no-store" });
    if (!r || !r.ok) throw new Error(`${table} unavailable (HTTP ${r ? r.status : "?"})`);
    const rows = await r.json();
    if (!Array.isArray(rows)) throw new Error(`${table} response invalid`);
    for (const row of rows) {
      // Progress in the database's own terms: a key this read has never seen.
      if (!guard.admit(row && row.place_id)) throw new Error(`${table} pagination did not advance`);
      out.push(row);
    }
    if (rows.length < PAGE) return out;
    cursor = rows[rows.length - 1].place_id;
  }
  throw new Error(`${table} pagination exceeded its page ceiling`);
}

export function needsCheck(row, prev, nowMs, recheckDays = RECHECK_DAYS) {
  if (!row || !row.name || (row.status && row.status !== "OPERATIONAL") || row.excluded === true) return false;
  if (!prev) return true;
  if (prev.matched_name !== row.name) return true;
  const checked = Date.parse(prev.checked_at);
  if (!Number.isFinite(checked) || nowMs - checked > recheckDays * DAY) return true;
  const retry = prev.status === "refused" ? RETRYABLE_REASONS[prev.reason] : undefined;
  return retry != null && nowMs - checked > retry * DAY;
}

export async function loadBacklog({ sb, fetchImpl, nowMs = Date.now(), onlyMetro = null, recheckDays = RECHECK_DAYS }) {
  const rows = await readAll({ sb, fetchImpl, table: "wf_inventory", select: "place_id,name,metro,locality,primary_type,google_types,category,status,excluded,refreshed_at", filters: "&excluded=is.false" });
  const done = new Map((await readAll({ sb, fetchImpl, table: "wf_apple_place_ids", select: "place_id,status,reason,matched_name,checked_at" })).map((r) => [r.place_id, r]));
  const sameName = new Map();
  for (const r of rows) { const k = `${r.metro}|${normalizeName(r.name)}`; sameName.set(k, (sameName.get(k) || 0) + 1); }
  const todo = rows.filter((r) => (!onlyMetro || r.metro === onlyMetro) && needsCheck(r, done.get(r.place_id), nowMs, recheckDays))
    // Oldest Google observation first: the rows the map can no longer draw.
    // (A timestamp order, never a text-key order.)
    .sort((a, b) => (Date.parse(a.refreshed_at) || 0) - (Date.parse(b.refreshed_at) || 0));
  return { todo, inventory: rows.length, stored: done.size, sameName };
}

// ---- one bounded run --------------------------------------------------------
export async function runAppleMatch({ sb, fetchImpl, search, boxes, nowMs = Date.now(), maxCalls = 1000, deadlineAt = Infinity, write = true, onlyMetro = null, sleepMs = 0, clock = () => Date.now(), reserve = reserveBackfillUnit }) {
  const stats = { inventory: 0, backlog: 0, checked: 0, matched: 0, refused: 0, skipped: 0, errors: 0, written: 0, remaining: 0, stop: null, reasons: {}, backfillCalls: null, providerCalls: null, appleCalls: 0, reservations: 0 };
  const { todo, inventory, sameName } = await loadBacklog({ sb, fetchImpl, nowMs, onlyMetro });
  stats.inventory = inventory; stats.backlog = todo.length;
  if (!todo.length) { stats.stop = "backlog-exhausted"; return stats; }
  if (typeof search.prepare === "function") {
    const t = await search.prepare();
    if (t.fatal) { stats.stop = t.credentials ? "credentials-invalid" : `apple-fatal:${t.fatal}`; stats.remaining = todo.length; return stats; }
    if (t.quota) { stats.stop = "apple-429"; stats.remaining = todo.length; return stats; }
    if (!t.token) { stats.stop = `apple-errors:${t.error || "token"}`; stats.remaining = todo.length; return stats; }
  }
  const out = [];
  const flush = async () => {
    if (!out.length) return;
    const batch = out.splice(0, out.length);
    if (!write) return;
    const r = await fetchImpl(`${sb.url}/rest/v1/wf_apple_place_ids?on_conflict=place_id`, { method: "POST", headers: { apikey: sb.key, Authorization: `Bearer ${sb.key}`, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch) });
    if (!r || !r.ok) throw new Error(`wf_apple_place_ids write failed (HTTP ${r ? r.status : "?"})`);
    stats.written += batch.length;
  };
  let consecutiveErrors = 0;
  let i = 0;
  try {
    for (; i < todo.length; i++) {
      if (stats.appleCalls >= maxCalls) { stats.stop = "run-batch-done"; break; }
      if (clock() >= deadlineAt) { stats.stop = "run-time-budget"; break; }
      const row = todo[i];
      const b = boxes && boxes[row.metro];
      if (!b || row.metro === "global") { stats.skipped++; stats.reasons["no-metro-area"] = (stats.reasons["no-metro-area"] || 0) + 1; continue; }
      const box = { north: b.maxLat, south: b.minLat, east: b.maxLng, west: b.minLng };
      const grant = await reserve({ sb, fetchImpl, nowMs: clock() });
      stats.reservations++;
      if (grant.providerCalls != null) stats.providerCalls = grant.providerCalls;
      if (grant.backfillCalls != null) stats.backfillCalls = grant.backfillCalls;
      if (!grant.allowed) { stats.stop = `cap:${grant.reason}`; break; }
      stats.appleCalls++;
      const res = await search(row.name, box);
      if (res.quota) { stats.stop = "apple-429"; break; }
      if (res.fatal) { stats.stop = res.credentials ? "credentials-invalid" : `apple-fatal:${res.fatal}`; break; }
      if (res.error || !Array.isArray(res.results)) {
        stats.errors++; consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) { stats.stop = `apple-errors:${res.error || "invalid"}`; i++; break; }
        continue;
      }
      consecutiveErrors = 0;
      stats.checked++;
      const place = { id: row.place_id, name: row.name, locality: row.locality, primaryType: row.primary_type, types: row.google_types || [], category: row.category };
      const v = matchApplePlace(place, res.results, { box, sameNameIds: sameName.get(`${row.metro}|${normalizeName(row.name)}`) || 1 });
      if (v.ok) stats.matched++; else { stats.refused++; stats.reasons[v.reason] = (stats.reasons[v.reason] || 0) + 1; }
      out.push({
        place_id: row.place_id, status: v.ok ? "matched" : "refused", apple_place_id: v.ok ? v.appleId : null,
        reason: v.ok ? null : v.reason, name_score: v.ok ? v.nameScore : null,
        category_checked: !!(v.ok && v.evidence && v.evidence.categoryChecked), method: METHOD,
        matched_name: row.name, checked_at: new Date(clock()).toISOString(),
      });
      if (out.length >= 100) await flush();
      if (sleepMs) await new Promise((r) => setTimeout(r, sleepMs));
    }
    if (!stats.stop) stats.stop = "backlog-pass-done";
  } finally {
    await flush();
  }
  stats.remaining = Math.max(0, todo.length - stats.checked - stats.skipped);
  return stats;
}

// Short wf_job_pulse note (<= 200 chars): progress, remaining, top refusal
// reasons, ETA at the daily backfill limit.
export function pulseNote(stats) {
  if (stats.stop === "backlog-exhausted") return BACKLOG_EXHAUSTED_NOTE;
  if (stats.stop === "credentials-invalid") return CREDENTIALS_INVALID_NOTE;
  const top = Object.entries(stats.reasons || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ");
  const eta = stats.remaining > 0 ? Math.ceil(stats.remaining / BACKFILL_DAILY_MAX) : 0;
  const note = `done ${stats.checked} (matched ${stats.matched}, refused ${stats.refused}); remaining ${stats.remaining}; ETA ~${eta}d; stop ${stats.stop}; today ${stats.backfillCalls ?? "?"}/${BACKFILL_DAILY_MAX}${top ? `; refused: ${top}` : ""}`;
  return note.slice(0, 200);
}
