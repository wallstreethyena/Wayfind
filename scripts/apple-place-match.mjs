#!/usr/bin/env node
// scripts/apple-place-match.mjs — ONE-TIME (then incremental) MATCH OF EVERY
// WAYFIND PLACE TO AN APPLE PLACE ID, FREE.
//
//   node scripts/apple-place-match.mjs                 # dry run: counts only, no writes
//   node scripts/apple-place-match.mjs --write         # store Place IDs / refusals
//   node scripts/apple-place-match.mjs --max 2000 --metro manatee-sarasota --write
//
// WHAT IT KEEPS: public.wf_apple_place_ids (migration 20261021180000) — the Apple
// Place ID (storable: "Place IDs are exempt from the storage restrictions in
// Section 2.5 of Attachment 6", developer.apple.com/documentation/mapkit/
// identifying-unique-locations-with-place-ids) and Wayfind's own evidence
// (status, refusal reason, name score). Apple's names, addresses and
// coordinates are used in memory to decide identity and then dropped (DPLA
// Attachment 6 §2.5). The map resolves the ID with MapKit JS PlaceLookup.
//
// IDENTITY: lib/applePlaceMatch.js matchApplePlace — the SAME rule the browser
// applies — inside the place's own metro box (wf_promote_metros, falling back
// to lib/promoteIndex.js PROMOTE_METROS). Ambiguous, chain-without-locality,
// category-mismatch, ... are stored as 'refused' and never guessed.
//
// COST: zero. Apple Maps Server API is included with the Apple Developer
// Program: "up to 25,000 service calls per day per team between Apple Maps
// Server API and MapKit JS. If your app exceeds this quota, the service
// returns an HTTP 429" (developer.apple.com/documentation/applemapsserverapi).
// Every call first reserves one unit of the 'apple_maps' daily ceiling through
// public.wf_reserve_free_provider_call (shared with the browser), and the run
// stops at --max (default 6000) or the first refusal / 429. No Google call.
//
// ENV (names only): NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, APPLE_MAPS_TEAM_ID, APPLE_MAPS_KEY_ID,
// APPLE_MAPS_PRIVATE_KEY (the .p8 text of a Maps ID private key, created free
// under Certificates, Identifiers & Profiles > Keys with "MapKit JS" enabled).
import { createPrivateKey, sign } from "node:crypto";
import { matchApplePlace, normalizeName } from "../lib/applePlaceMatch.js";
import { PROMOTE_METROS, metrosFromRows } from "../lib/promoteIndex.js";
import { siteTodayStr } from "../lib/siteTime.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const WRITE = flag("--write");
const MAX = Math.max(1, Math.min(20000, Number(opt("--max", 6000)) || 6000));
const ONLY_METRO = opt("--metro", null);
const RECHECK_DAYS = Number(opt("--recheck-days", 90)) || 90;
const PER_SECOND = Math.max(1, Math.min(10, Number(opt("--rate", 5)) || 5));
const METHOD = "maps-server-api-search-v1";

function env(name) { const v = String(process.env[name] || "").trim(); return v || null; }
function fail(msg) { console.error(`apple-place-match: ${msg}`); process.exit(2); }

const SB_URL = (env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL") || "").replace(/\/+$/, "");
const SB_KEY = env("SUPABASE_SERVICE_ROLE_KEY");
if (!SB_URL || !SB_KEY) fail("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const sbHeaders = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };

async function sbGetAll(pathAndQuery, pageSize = 1000) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const r = await fetch(`${SB_URL}/rest/v1/${pathAndQuery}`, { headers: { ...sbHeaders, Range: `${offset}-${offset + pageSize - 1}`, "Range-Unit": "items" } });
    if (!r.ok) throw new Error(`${pathAndQuery.split("?")[0]}: HTTP ${r.status}`);
    const rows = await r.json();
    out.push(...rows);
    if (rows.length < pageSize) return out;
  }
}

// ---- the shared daily ceiling ------------------------------------------------
async function reserveOne() {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/wf_reserve_free_provider_call`, {
    method: "POST", headers: sbHeaders,
    body: JSON.stringify({ p_provider: "apple_maps", p_capability: "server_search", p_usage_date: siteTodayStr(new Date()), p_units: 1 }),
  });
  if (!r.ok) return { allowed: false, reason: `meter HTTP ${r.status}` };
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  return { allowed: !!(row && row.allowed === true), reason: row ? row.reason : "meter_unavailable", calls: row ? Number(row.calls) : 0 };
}

// ---- Apple Maps Server API auth (developer.apple.com/documentation/applemapsserverapi/-v1-token)
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
function authJwt() {
  const team = env("APPLE_MAPS_TEAM_ID"), kid = env("APPLE_MAPS_KEY_ID"), pem = env("APPLE_MAPS_PRIVATE_KEY");
  if (!team || !kid || !pem) return null;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "ES256", kid, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: team, iat: now, exp: now + 1800 }));
  const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${body}.${b64url(sig)}`;
}
let access = null;
async function accessToken() {
  if (access && access.until > Date.now() + 60000) return access.token;
  const jwt = authJwt();
  if (!jwt) fail("APPLE_MAPS_TEAM_ID, APPLE_MAPS_KEY_ID and APPLE_MAPS_PRIVATE_KEY are required (see header)");
  const r = await fetch("https://maps-api.apple.com/v1/token", { headers: { Authorization: `Bearer ${jwt}` } });
  if (!r.ok) fail(`Apple token exchange failed: HTTP ${r.status}`);
  const j = await r.json();
  access = { token: j.accessToken, until: Date.now() + (Number(j.expiresInSeconds) || 1800) * 1000 };
  return access.token;
}

async function appleSearch(name, box) {
  const q = new URLSearchParams({ q: name, searchRegion: `${box.north},${box.east},${box.south},${box.west}`, limitToCountries: "US", resultTypeFilter: "Poi", lang: "en-US" });
  const r = await fetch(`https://maps-api.apple.com/v1/search?${q}`, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (r.status === 429) return { quota: true };
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const j = await r.json();
  return { results: Array.isArray(j.results) ? j.results : [] };
}

// ---- main ---------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  let boxes = PROMOTE_METROS;
  try { const live = metrosFromRows(await sbGetAll("wf_promote_metros?select=metro,min_lat,max_lat,min_lng,max_lng,active&active=is.true")); if (live && Object.keys(live).length) boxes = live; } catch { /* offline fallback */ }
  const rows = await sbGetAll("wf_inventory?select=place_id,name,metro,locality,primary_type,google_types,category,status,excluded,refreshed_at&excluded=is.false&order=place_id");
  let done = new Map();
  try { done = new Map((await sbGetAll("wf_apple_place_ids?select=place_id,matched_name,checked_at")).map((r) => [r.place_id, r])); }
  catch (e) { if (WRITE) fail(`wf_apple_place_ids is not readable (${e.message}); apply migration 20261021180000_wf_apple_place_ids.sql first`); }
  const sameName = new Map();
  for (const r of rows) { const k = `${r.metro}|${normalizeName(r.name)}`; sameName.set(k, (sameName.get(k) || 0) + 1); }
  const fresh = Date.now() - RECHECK_DAYS * 86400000;
  const todo = rows.filter((r) => {
    if (!r.name || (r.status && r.status !== "OPERATIONAL")) return false;
    if (ONLY_METRO && r.metro !== ONLY_METRO) return false;
    const prev = done.get(r.place_id);
    return !prev || prev.matched_name !== r.name || Date.parse(prev.checked_at) < fresh;
  })
    // Places whose stored coordinate the map can no longer draw go first.
    .sort((a, b) => (Date.parse(a.refreshed_at) || 0) - (Date.parse(b.refreshed_at) || 0));
  console.log(`apple-place-match: ${rows.length} inventory rows, ${done.size} already checked, ${todo.length} to check, max ${MAX}, ${WRITE ? "WRITE" : "dry run"}`);

  const tally = { checked: 0, matched: 0, refused: 0, skipped: 0, errors: 0, reasons: {} };
  const out = [];
  const flush = async () => {
    if (!WRITE || !out.length) { out.length = 0; return; }
    const batch = out.splice(0, out.length);
    const r = await fetch(`${SB_URL}/rest/v1/wf_apple_place_ids?on_conflict=place_id`, { method: "POST", headers: { ...sbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(batch) });
    if (!r.ok) fail(`write failed: HTTP ${r.status} ${await r.text()}`);
  };
  for (const row of todo) {
    if (tally.checked >= MAX) break;
    const box0 = boxes[row.metro];
    if (!box0 || row.metro === "global") { tally.skipped++; tally.reasons["no-metro-area"] = (tally.reasons["no-metro-area"] || 0) + 1; continue; }
    const box = { north: box0.maxLat, south: box0.minLat, east: box0.maxLng, west: box0.minLng };
    const grant = await reserveOne();
    if (!grant.allowed) { console.log(`apple-place-match: daily ceiling refused (${grant.reason}) after ${tally.checked} calls — stopping`); break; }
    const res = await appleSearch(row.name, box);
    tally.checked++;
    if (res.quota) { console.log("apple-place-match: Apple answered 429 (daily quota) — stopping"); break; }
    if (res.error) { tally.errors++; continue; }
    const place = { id: row.place_id, name: row.name, locality: row.locality, primaryType: row.primary_type, types: row.google_types || [], category: row.category };
    const v = matchApplePlace(place, res.results, { box, sameNameIds: sameName.get(`${row.metro}|${normalizeName(row.name)}`) || 1 });
    if (v.ok) tally.matched++; else { tally.refused++; tally.reasons[v.reason] = (tally.reasons[v.reason] || 0) + 1; }
    out.push({
      place_id: row.place_id, status: v.ok ? "matched" : "refused", apple_place_id: v.ok ? v.appleId : null,
      reason: v.ok ? null : v.reason, name_score: v.ok ? v.nameScore : null,
      category_checked: !!(v.ok && v.evidence && v.evidence.categoryChecked), method: METHOD,
      matched_name: row.name, checked_at: new Date().toISOString(),
    });
    if (out.length >= 200) await flush();
    await sleep(Math.ceil(1000 / PER_SECOND));
  }
  await flush();
  console.log(JSON.stringify(tally, null, 1));
}

main().catch((e) => fail(e && e.message ? e.message : String(e)));
