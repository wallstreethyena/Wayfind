// lib/applePlaceIds.js — SERVER SIDE of the free Apple pin path.
//
// 1. attachApplePlaceIds(places): the inv=1 list ships, for each place the map
//    may NOT draw from a stored coordinate, the Apple Place ID Wayfind matched
//    once (public.wf_apple_place_ids, filled by scripts/apple-place-match.mjs).
//    The browser resolves that ID to Apple's CURRENT coordinate with MapKit JS
//    PlaceLookup at render time. No coordinate is stored or shipped from here.
//    Apple: "Place IDs are exempt from the storage restrictions in Section 2.5
//    of Attachment 6" (developer.apple.com/documentation/mapkit/
//    identifying-unique-locations-with-place-ids).
//
// 2. reserveAppleServiceCalls(units): the ONE daily ceiling for every Apple
//    Maps service call Wayfind meters (browser PlaceLookup/Search and the
//    server matcher), through the existing atomic free-provider meter
//    public.wf_reserve_free_provider_call (provider 'apple_maps'). Apple's
//    free allowance is "25,000 service calls per day per team between Apple
//    Maps Server API and MapKit JS"; over it Apple answers HTTP 429
//    (developer.apple.com/documentation/applemapsserverapi). The registry
//    ceiling is set BELOW that so un-metered surfaces (event routes, parking)
//    keep headroom.
//
// Both fail CLOSED: no table / no registry row / any error means no Place IDs
// and no grant. Never a Google call, never an Apple call from this module.
import { fetchDeadline, DB_DEADLINE_MS } from "./fetchDeadline.js";
import { siteTodayStr } from "./siteTime.js";

export const APPLE_PROVIDER = "apple_maps";
// Largest single grant: one map batch. Keeps one caller from draining the day.
export const APPLE_GRANT_MAX = 24;
const PLACE_ID_RX = /^[A-Za-z0-9_-]{6,64}$/;

export function validApplePlaceId(id) { return typeof id === "string" && PLACE_ID_RX.test(id); }

async function supabaseEnv() {
  try {
    const { sbEnv } = await import("./serverCache.js");
    return sbEnv();
  } catch { return null; }
}

// Stored matches for these Wayfind ids: Map(place_id -> Apple Place ID).
// Fails closed to an empty Map. Read fresh (no-store) so a Place ID the
// backfill stored this morning reaches the map today, whatever the list's
// day-long edge cache holds (app/api/places/map/list ships it uncached).
export async function readApplePlaceIds(ids, options = {}) {
  const byId = new Map();
  const want = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id && id.length <= 256))];
  if (!want.length) return byId;
  const s = options.env || await supabaseEnv();
  if (!s) return byId;
  const fetchImpl = options.fetchImpl || fetchDeadline;
  const headers = { apikey: s.key, Authorization: `Bearer ${s.key}` };
  try {
    for (let i = 0; i < want.length; i += 300) {
      const chunk = want.slice(i, i + 300);
      const url = `${s.url}/rest/v1/wf_apple_place_ids?select=place_id,apple_place_id&status=eq.matched&place_id=in.(${chunk.map(encodeURIComponent).join(",")})&limit=${chunk.length}`;
      const r = await fetchImpl(url, { headers, cache: "no-store" }, options.deadlineMs || DB_DEADLINE_MS);
      if (!r || !r.ok) return new Map(); // table not migrated yet, or read failed: ship nothing
      for (const row of await r.json()) if (row && validApplePlaceId(row.apple_place_id)) byId.set(row.place_id, row.apple_place_id);
    }
  } catch { return new Map(); }
  return byId;
}

// Mutates the given served places: sets `applePlaceId` on rows whose map
// verdict is false and that have a stored match. Returns the number attached.
export async function attachApplePlaceIds(places, options = {}) {
  const want = (Array.isArray(places) ? places : []).filter((p) => p && typeof p.id === "string" && p.mapCoord && p.mapCoord.ok === false);
  if (!want.length) return 0;
  const byId = await readApplePlaceIds(want.map((p) => p.id), options);
  let n = 0;
  for (const p of want) { const a = byId.get(p.id); if (a) { p.applePlaceId = a; n++; } }
  return n;
}

// -> { granted, ledger, reason }. `ledger:false` means the meter refused for a
// structural reason (provider not registered yet, RPC missing): the browser
// then keeps only its own legacy per-map caps and makes NO Place ID lookups.
export async function reserveAppleServiceCalls(units, { capability = "map_place_lookup", now = Date.now(), env, fetchImpl } = {}) {
  const want = Math.max(0, Math.min(APPLE_GRANT_MAX, Math.floor(Number(units) || 0)));
  if (!want) return { granted: 0, ledger: true, reason: "nothing-requested" };
  const s = env || await supabaseEnv();
  if (!s) return { granted: 0, ledger: false, reason: "meter_unavailable" };
  const doFetch = fetchImpl || fetchDeadline;
  try {
    const r = await doFetch(`${s.url}/rest/v1/rpc/wf_reserve_free_provider_call`, {
      method: "POST",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_provider: APPLE_PROVIDER, p_capability: String(capability), p_usage_date: siteTodayStr(new Date(now)), p_units: want }),
      cache: "no-store",
    }, DB_DEADLINE_MS);
    if (!r || !r.ok) return { granted: 0, ledger: false, reason: "meter_unavailable" };
    const rows = await r.json();
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (!row) return { granted: 0, ledger: false, reason: "meter_unavailable" };
    if (row.allowed === true) return { granted: want, ledger: true, reason: "reserved", calls: Number(row.calls) || 0 };
    const reason = String(row.reason || "meter_refused");
    // Not registered / not zero-cost / no ceiling: the ledger is not set up.
    const structural = /provider_unavailable|not_a_zero_cost|missing_or_insufficient_ceiling|invalid_units/.test(reason);
    return { granted: 0, ledger: !structural, reason };
  } catch { return { granted: 0, ledger: false, reason: "meter_unavailable" }; }
}
