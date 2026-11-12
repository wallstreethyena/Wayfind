// Server data for lib/trendingSocial.js: events, places, first-party
// velocity and newly synced owned posts. Server only (service key).
//
// VELOCITY (Wayfind's own users): the `events` behaviour table, per place,
// recent 3 days vs the 14 days before. Bot and self-click resistance, by
// construction: a device counts at most ONCE per place per day per action
// family, a row with no device is ignored, and a device that fires more than
// DEVICE_DAY_CAP rows on one place in a day is dropped for that day. So a
// hundred clicks from one browser are one signal, not a hundred.
import { fetchCuratedEvents } from "./curatedEvents.js";
import { siteTodayStr } from "./siteTime.js";
import { allSocialAssets } from "./socialAssets.js";
import { WAYFIND_SOCIAL } from "./wayfindSocialAssets.generated.js";
import { buildTrendingSocial } from "./trendingSocial.js";

const ACTIONS = ["detail_open", "commerce_cta_clicked", "save", "share_open", "stop_add", "like"];
const DEVICE_DAY_CAP = 20;
const CACHE_MS = 10 * 60 * 1000;
let cache = null;

function rest() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return raw && key ? { url: raw, key } : null;
}

async function restGet(path, signal) {
  const r = rest();
  if (!r) throw new Error("supabase-unconfigured");
  const res = await fetch(r.url + "/rest/v1/" + path, { headers: { apikey: r.key, authorization: "Bearer " + r.key }, signal, cache: "no-store" });
  if (!res.ok) { const err = new Error("supabase " + res.status); err.status = res.status; throw err; }
  return res.json();
}

const inList = (ids) => "(" + ids.map((id) => '"' + String(id).replace(/"/g, "") + '"').join(",") + ")";

async function placesByIds(ids, signal) {
  const out = new Map();
  for (let i = 0; i < ids.length; i += 80) {
    const rows = await restGet("wf_inventory?select=place_id,name,locality,metro,lat,lng,status&place_id=in." + encodeURIComponent(inList(ids.slice(i, i + 80))), signal);
    for (const row of rows) out.set(row.place_id, row);
  }
  return out;
}

/** Pure: per place { recentActions, baselineActions } from raw rows. */
export function velocityFromRows(rows, nowMs) {
  const DAY = 86400000;
  const perDeviceDay = new Map();
  for (const row of rows || []) {
    if (!row || !row.place_id || !row.device_id || !row.created_at) continue;
    const t = Date.parse(row.created_at);
    if (!Number.isFinite(t)) continue;
    const k = row.place_id + "|" + row.device_id + "|" + Math.floor(t / DAY);
    const cur = perDeviceDay.get(k) || { place: row.place_id, t, n: 0 };
    cur.n += 1;
    perDeviceDay.set(k, cur);
  }
  const out = new Map();
  for (const { place, t, n } of perDeviceDay.values()) {
    if (n > DEVICE_DAY_CAP) continue; // a hammering device is noise, not interest
    const age = (nowMs - t) / DAY;
    const v = out.get(place) || { recentActions: 0, baselineActions: 0 };
    if (age <= 3) v.recentActions += 1;
    else if (age <= 17) v.baselineActions += 1;
    out.set(place, v);
  }
  return out;
}

export async function velocityByPlace(placeIds, nowMs, signal) {
  if (!placeIds.length) return new Map();
  const since = new Date(nowMs - 17 * 86400000).toISOString();
  const rows = [];
  for (let i = 0; i < placeIds.length; i += 60) {
    const q = "events?select=place_id,device_id,created_at&place_id=in." + encodeURIComponent(inList(placeIds.slice(i, i + 60)))
      + "&action=in." + encodeURIComponent("(" + ACTIONS.join(",") + ")") + "&created_at=gte." + encodeURIComponent(since) + "&limit=20000";
    rows.push(...await restGet(q, signal));
  }
  return velocityFromRows(rows, nowMs);
}

// The ingestion table (wf_owned_social, PR #2437) maps onto the social model:
// brand exclusions become kind "brand", a companion Reel rides with its
// carousel, any other exclusion keeps its reason, the stored first-party cover
// is used for the card. Optional: until the table exists (404/400) the
// committed snapshot is the whole inventory.
const BRAND_REASONS = new Set(["brand_promo_no_discovery", "ad_creative"]);
export function ownedRowToAsset(r) {
  const entities = [
    ...(r.event_ids || []).map((id) => ({ type: "event", id })),
    ...(r.place_ids || []).map((id) => ({ type: "place", id })),
  ];
  const reason = r.eligibility === "excluded" ? r.exclusion_reason : null;
  return {
    id: "ig:" + r.shortcode, permalink: r.permalink, format: r.format, published_at: r.published_at,
    status: r.lifecycle || "published", caption: r.caption || "", city: r.city || null, entities,
    kind: reason && BRAND_REASONS.has(reason) ? "brand" : "discovery", kind_reason: reason,
    twin_of: r.companion_of ? "ig:" + r.companion_of : null,
    excluded_reason: reason && !BRAND_REASONS.has(reason) && reason !== "companion_duplicate" ? reason : null,
    cover_url: r.cover_url || null, source: "owned-db",
  };
}

async function syncedOwned(signal) {
  try {
    const rows = await restGet("wf_owned_social?select=shortcode,permalink,format,lifecycle,published_at,caption,city,place_ids,event_ids,eligibility,exclusion_reason,companion_of,cover_url,last_seen_at&limit=5000", signal);
    const lastSeen = rows.reduce((m, r) => (r.last_seen_at && r.last_seen_at > m ? r.last_seen_at : m), "");
    return { rows: rows.map(ownedRowToAsset), table: true, lastSeen: lastSeen || null };
  } catch (e) {
    if (e && (e.status === 404 || e.status === 400)) return { rows: [], table: false, lastSeen: null };
    throw e;
  }
}

/**
 * When the inventory was last reconciled against Instagram: the newest
 * last_seen_at the ingestion stamped on wf_owned_social when that table
 * exists, otherwise the committed snapshot's synced_at.
 */
function lastReconciliation(owned) {
  if (owned.table && owned.lastSeen) return { at: owned.lastSeen, source: "wf_owned_social" };
  return { at: (WAYFIND_SOCIAL && WAYFIND_SOCIAL.synced_at) || null, source: "snapshot" };
}

/** Everything buildTrendingSocial needs, cached for 10 minutes. */
export async function trendingSocialDeps({ signal = AbortSignal.timeout(9000), fresh = false } = {}) {
  const nowMs = Date.now();
  if (!fresh && cache && nowMs - cache.at < CACHE_MS) return cache.deps;
  const today = siteTodayStr();
  const [events, owned] = await Promise.all([fetchCuratedEvents({ signal }), syncedOwned(signal)]);
  const reconciled = lastReconciliation(owned);
  const assets = allSocialAssets({ extraOwned: owned.rows });
  const placeIds = new Set();
  const { GUIDES } = await import("./guides.js");
  for (const a of assets) for (const e of a.entities) {
    if (e.type === "place") placeIds.add(e.id);
    if (e.type === "guide" && GUIDES[e.id]) for (const p of GUIDES[e.id].picks || []) { if (p && p.placeId) { placeIds.add(p.placeId); break; } }
  }
  const ids = [...placeIds];
  const [placesById, velocity] = await Promise.all([placesByIds(ids, signal), velocityByPlace(ids, nowMs, signal).catch(() => new Map())]);
  const deps = {
    today, nowMs, placesById, velocityByPlace: velocity, extraOwned: owned.rows, socialTable: owned.table, reconciled,
    eventsById: new Map(events.map((e) => [e.event_id, e])), eventsBySlug: new Map(events.map((e) => [e.slug, e])),
  };
  cache = { at: nowMs, deps };
  return deps;
}

export async function trendingSocial({ origin = null, fresh = false } = {}) {
  const deps = await trendingSocialDeps({ fresh });
  return { ...buildTrendingSocial({ origin, deps }), socialTable: deps.socialTable, reconciled: deps.reconciled };
}
