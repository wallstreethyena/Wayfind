// lib/osmRegional.js — OpenStreetMap parks / beaches / piers as a REGIONAL
// inventory, refreshed outside visitor requests (owner brief 2026-11-06,
// "finish the discovery cache fix").
//
// WHY REGIONAL. Measured 2026-11-06: wf_places_cache had never held a single
// wf-osm row, and every visitor request to /api/outdoors (Tampa, Sarasota,
// Orlando, Miami) spent ~4.1-4.4s on a live Overpass attempt that came back
// "unavailable". Worse, the old per-request cache key was the VISITOR's own
// coordinate rounded to ~1 km, so even a perfectly working daily warm of the
// market centers could only ever help visitors standing on a center point.
//
// The design now:
//   - A small fixed set of Florida REGIONS (one Overpass query each) covers
//     every Florida landing market. Hawaii markets are out of market
//     (sitemap decision #1888) and are not queried.
//   - Visitors NEVER call Overpass. /api/outdoors reads the covering region
//     rows (one bounded Supabase read), filters by distance from the visitor's
//     own point, and answers in a few hundred ms.
//   - Refreshes happen only in warmRegions(): the daily cron and an
//     owner-authenticated canary, serialized across instances by a lease row,
//     stopped by a breaker after rate limiting or denial, time-boxed, and
//     rotated so a slow region can never starve the others.
//   - A row is only ever replaced by a VERIFIED non-empty result; a timeout,
//     rate limit, denial, malformed body or failed write leaves the last good
//     copy untouched. Every write is read back by a separate request before it
//     counts as "refreshed".
//   - Freshness is the result's own verifiedAt (when Overpass answered), never
//     the time a cache was read. Rows are served up to STALE_MAX_MS (7 days,
//     the original window) after verification and not beyond; rows are never
//     deleted (cache policy).

export const OSM_HOSTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
export const OSM_UA = "Wayfind/1.0 (+https://www.gowayfind.com; hello@gowayfind.com)";
export const REGION_KEY_PREFIX = "wf-osm-region|v1|";
export const LEASE_KEY = "wf-osm-lease|v1";
export const BREAKER_KEY = "wf-osm-breaker|v1";
// The serve limit is the route's original 7-day OSM window (OSM_KEEP_MS),
// unchanged. Refreshes come due at 5 days, so two days of retries happen
// before any copy reaches that limit.
export const FRESH_MS = 5 * 24 * 3600 * 1000;      // due for refresh
export const STALE_MAX_MS = 7 * 24 * 3600 * 1000;  // never served past this
export const QUERY_VERSION = "v1";

// Every Florida landing market center sits inside one of these circles
// (asserted by scripts/test-osm-regional.mjs against lib/landingCities.js).
export const REGIONS = [
  { slug: "tampa", name: "Tampa Bay", lat: 27.9506, lng: -82.4572, radiusM: 30000 },
  { slug: "manatee", name: "Bradenton & Manatee", lat: 27.5200, lng: -82.5600, radiusM: 22000 },
  { slug: "sarasota", name: "Sarasota", lat: 27.3100, lng: -82.5100, radiusM: 22000 },
  { slug: "venice", name: "Venice", lat: 27.0998, lng: -82.4543, radiusM: 20000 },
  { slug: "orlando", name: "Orlando", lat: 28.5384, lng: -81.3789, radiusM: 30000 },
  { slug: "miami", name: "Miami", lat: 25.7617, lng: -80.1918, radiusM: 30000 },
];
export const regionKey = (slug) => REGION_KEY_PREFIX + slug;

export function distMeters(aLat, aLng, bLat, bLng) {
  const R = 6371000, toR = (d) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// Regions whose circle overlaps the visitor's search circle.
export function regionsFor(lat, lng, radiusM, regions = REGIONS) {
  return regions.filter((g) => distMeters(lat, lng, g.lat, g.lng) <= g.radiusM + radiusM);
}

export function overpassQuery(g, serverTimeoutS) {
  const a = `(around:${g.radiusM},${g.lat},${g.lng})`;
  return `[out:json][timeout:${serverTimeoutS}];(` +
    `nwr["natural"="beach"]["name"]${a};` +
    `nwr["leisure"~"^(park|nature_reserve)$"]["name"]${a};` +
    `nwr["tourism"="viewpoint"]["name"]${a};` +
    `nwr["man_made"="pier"]["name"]${a};` +
    `nwr["leisure"="marina"]["name"]${a};` +
    `);out center 2000;`; // body verbosity: nodes keep lat/lon (out tags would drop them)
}

const kindOf = (t) => t.natural === "beach" ? "Beach" : t.tourism === "viewpoint" ? "Scenic viewpoint" : t.man_made === "pier" ? "Pier" : t.leisure === "marina" ? "Marina" : t.leisure === "nature_reserve" ? "Nature preserve" : "Park";

// Places keep the OSM element id as their identity (provenance), and are
// deduped by id, then by name within 250 m (one park mapped as way + node).
export function parseElements(d) {
  const out = [];
  const byId = new Set();
  for (const el of (d && Array.isArray(d.elements) ? d.elements : [])) {
    const tags = el.tags || {};
    const name = tags.name;
    const plat = el.lat != null ? el.lat : el.center && el.center.lat;
    const plng = el.lon != null ? el.lon : el.center && el.center.lon;
    if (!name || !isFinite(plat) || !isFinite(plng)) continue;
    // A disused or demolished feature is not a place to send anyone.
    if (tags["disused"] === "yes" || tags["abandoned"] === "yes" || tags["demolished"] === "yes" || tags["disused:leisure"] || tags["was:leisure"]) continue;
    const id = "osm:" + el.type + el.id;
    if (byId.has(id)) continue;
    const nk = name.toLowerCase().trim();
    if (out.some((p) => p._nk === nk && distMeters(p.lat, p.lng, plat, plng) <= 250)) continue;
    byId.add(id);
    out.push({ id, name, lat: plat, lng: plng, kind: kindOf(tags), _nk: nk });
  }
  return out.map(({ _nk, ...p }) => p);
}

// One Overpass answer → one outcome kind. Overpass reports a server-side
// timeout or memory abort as HTTP 200 with a "runtime error" remark and a
// truncated element list: that is a TIMEOUT, never a valid empty answer.
export function classifyOverpass({ status, aborted, networkError, text }) {
  if (aborted) return { kind: "timeout" };
  if (networkError) return { kind: "network" };
  if (status === 429) return { kind: "rate_limited" };
  if (status === 403 || status === 406 || status === 401) return { kind: "denied" };
  if (status === 504) return { kind: "timeout" };
  if (status !== 200) return { kind: "http_" + status };
  let d;
  try { d = JSON.parse(text); } catch { return { kind: "malformed" }; }
  if (!d || !Array.isArray(d.elements)) return { kind: "malformed" };
  if (typeof d.remark === "string" && /runtime error|timed out|out of memory/i.test(d.remark)) return { kind: "timeout" };
  const places = parseElements(d);
  return places.length ? { kind: "ok", places, elements: d.elements.length } : { kind: "valid_empty", places: [], elements: d.elements.length };
}

// One attempt against one host. Returns a sanitized diagnostic record:
// host, HTTP status, duration, bytes, outcome kind, Retry-After. Never
// headers or bodies (the body of an error page can be large or noisy).
export async function fetchRegion(g, host, { fetchImpl = fetch, timeoutMs = 15000, now = Date.now } = {}) {
  const serverTimeoutS = Math.max(5, Math.floor(timeoutMs / 1000) - 2);
  const q = overpassQuery(g, serverTimeoutS);
  const t0 = now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let status = null, text = "", retryAfter = null, aborted = false, networkError = false;
  try {
    const r = await fetchImpl(host, { method: "POST", signal: ctrl.signal, headers: { "content-type": "application/x-www-form-urlencoded", "User-Agent": OSM_UA }, body: "data=" + encodeURIComponent(q) });
    status = r.status;
    retryAfter = (r.headers && r.headers.get && r.headers.get("retry-after")) || null;
    text = await r.text();
  } catch (e) {
    if (e && (e.name === "AbortError" || ctrl.signal.aborted)) aborted = true; else networkError = true;
  } finally { clearTimeout(timer); }
  const c = classifyOverpass({ status, aborted, networkError, text });
  return { host: host.replace(/^https:\/\//, "").replace(/\/api\/interpreter$/, ""), status, ms: now() - t0, bytes: text.length, queryChars: q.length, kind: c.kind, elements: c.elements ?? null, places: c.places || [], retryAfter };
}

// ── Supabase (wf_places_cache) via REST, injected for tests ────────────────
// Every Supabase call is bounded so a stalled PostgREST cannot eat the cron's
// 60s box (the briefing email runs after the warm).
const SB_TIMEOUT_MS = 3000;
const bounded = (init) => ({ ...init, signal: AbortSignal.timeout(SB_TIMEOUT_MS) });
function sbHeaders(sb, extra) { return { apikey: sb.key, Authorization: `Bearer ${sb.key}`, ...(extra || {}) }; }

export async function readRegions(sb, slugs, { fetchImpl = fetch, timeoutMs = 2500 } = {}) {
  if (!sb || !slugs.length) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const keys = slugs.map((s) => `"${regionKey(s)}"`).join(",");
    const r = await fetchImpl(`${sb.url}/rest/v1/wf_places_cache?k=in.(${encodeURIComponent(keys)})&select=k,v,exp`, { headers: sbHeaders(sb), cache: "no-store", signal: ctrl.signal });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows.filter((row) => row && row.v && Array.isArray(row.v.places)) : [];
  } catch { return []; } finally { clearTimeout(timer); }
}

async function upsertRow(sb, k, v, exp, fetchImpl) {
  const r = await fetchImpl(`${sb.url}/rest/v1/wf_places_cache`, bounded({ method: "POST", headers: sbHeaders(sb, { "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify({ k, v, exp }) }));
  return r.ok;
}

// The visitor answer: region rows → places near THIS visitor, distance from
// the visitor, nothing past the stale limit, each id once.
export function serveFromRegions(rows, lat, lng, radiusM, now = Date.now()) {
  const seen = new Set();
  const places = [];
  let newest = null, oldest = null, servedRows = 0;
  for (const row of rows) {
    const v = row.v || {};
    const verifiedAt = Date.parse(v.verifiedAt || "");
    if (!isFinite(verifiedAt) || now - verifiedAt > STALE_MAX_MS) continue;
    servedRows++;
    newest = newest == null ? verifiedAt : Math.max(newest, verifiedAt);
    oldest = oldest == null ? verifiedAt : Math.min(oldest, verifiedAt);
    for (const p of v.places) {
      if (seen.has(p.id)) continue;
      const dm = distMeters(lat, lng, p.lat, p.lng);
      if (dm > radiusM) continue;
      seen.add(p.id);
      places.push({ ...p, distMi: dm / 1609.34 });
    }
  }
  places.sort((a, b) => a.distMi - b.distMi);
  return { places, servedRows, newestVerifiedAt: newest ? new Date(newest).toISOString() : null, oldestVerifiedAt: oldest ? new Date(oldest).toISOString() : null, stale: oldest != null && now - oldest > FRESH_MS };
}

// ── lease + breaker (serialize refreshes across instances and overlapping runs)
export async function acquireLease(sb, holder, ttlMs, { fetchImpl = fetch, now = Date.now } = {}) {
  // Seed the row once (expired), never overwriting an existing one.
  await fetchImpl(`${sb.url}/rest/v1/wf_places_cache`, bounded({ method: "POST", headers: sbHeaders(sb, { "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" }), body: JSON.stringify({ k: LEASE_KEY, v: { holder: null }, exp: new Date(0).toISOString() }) })).catch(() => null);
  // Atomic take: a single UPDATE that only matches an expired lease.
  const nowIso = new Date(now()).toISOString();
  const r = await fetchImpl(`${sb.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(LEASE_KEY)}&exp=lt.${encodeURIComponent(nowIso)}`, bounded({ method: "PATCH", headers: sbHeaders(sb, { "Content-Type": "application/json", Prefer: "return=representation" }), body: JSON.stringify({ v: { holder, at: nowIso }, exp: new Date(now() + ttlMs).toISOString() }) })).catch(() => null);
  if (!r || !r.ok) return false;
  const rows = await r.json().catch(() => []);
  return Array.isArray(rows) && rows.length === 1;
}
export async function releaseLease(sb, holder, { fetchImpl = fetch, now = Date.now } = {}) {
  await fetchImpl(`${sb.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(LEASE_KEY)}&v->>holder=eq.${encodeURIComponent(holder)}`, bounded({ method: "PATCH", headers: sbHeaders(sb, { "Content-Type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify({ exp: new Date(now() - 1000).toISOString() }) })).catch(() => null);
}
export async function readBreaker(sb, { fetchImpl = fetch, now = Date.now } = {}) {
  try {
    const r = await fetchImpl(`${sb.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(BREAKER_KEY)}&select=v,exp`, bounded({ headers: sbHeaders(sb), cache: "no-store" }));
    const row = r.ok ? (await r.json())[0] : null;
    return row && Date.parse(row.exp) > now() ? { open: true, until: row.exp, reason: row.v && row.v.reason } : { open: false };
  } catch { return { open: false }; }
}
async function openBreaker(sb, reason, ms, fetchImpl, now) {
  await upsertRow(sb, BREAKER_KEY, { reason, at: new Date(now()).toISOString() }, new Date(now() + ms).toISOString(), fetchImpl).catch(() => false);
}

// Deterministic, fair refresh order: regions with no servable copy first,
// then the oldest verification, ties rotated by day so no region is always
// last. Regions verified within FRESH_MS are not due.
export function planWarm(rows, now = Date.now(), regions = REGIONS) {
  const verified = new Map(rows.map((row) => [row.k, Date.parse((row.v || {}).verifiedAt || "")]));
  const day = Math.floor(now / 86400000);
  const items = regions.map((g, i) => {
    const at = verified.get(regionKey(g.slug));
    const has = isFinite(at) && now - at <= STALE_MAX_MS;
    return { g, at: isFinite(at) ? at : null, has, due: !isFinite(at) || now - at > FRESH_MS, rot: (i + day) % regions.length };
  });
  const due = items.filter((x) => x.due).sort((a, b) => (a.has - b.has) || ((a.at || 0) - (b.at || 0)) || (a.rot - b.rot));
  return { due, fresh: items.filter((x) => !x.due) };
}

// The one refresh path (cron + owner canary). Unit of every count = REGION.
// Each region ends in exactly one status:
//   refreshed   verified result written AND read back by a separate request
//   cached      already fresh, not due, provider not touched
//   stale       due, refresh failed, visitors still served the last good copy
//   unavailable due, refresh failed, no servable copy
//   deferred    due, not attempted (time box, breaker, or lease held)
// refreshed + cached + stale + unavailable + deferred === regions.length.
export async function warmRegions(sb, opts = {}) {
  const { fetchImpl = fetch, now = Date.now, deadlineMs = 38000, perAttemptMs = 15000, only = null, holder = "warm-" + now() } = opts;
  const started = now();
  const regions = only ? REGIONS.filter((g) => only.includes(g.slug)) : REGIONS;
  if (only && regions.length !== only.length) throw new Error("unknown region in: " + only.join(","));
  const result = { unit: "region", total: regions.length, refreshed: 0, cached: 0, stale: 0, unavailable: 0, deferred: 0, attempts: [], regions: {}, breaker: null, lease: null };
  if (!sb) { result.deferred = regions.length; result.lease = "no_storage"; return result; }
  const rows = await readRegions(sb, regions.map((g) => g.slug), { fetchImpl, timeoutMs: 5000 });
  const { due, fresh } = planWarm(rows, now(), regions);
  for (const x of fresh) { result.cached++; result.regions[x.g.slug] = { status: "cached", verifiedAt: new Date(x.at).toISOString() }; }
  const markDeferred = (list, why) => { for (const x of list) { result.deferred++; result.regions[x.g.slug] = { status: "deferred", why, hasCopy: x.has }; } };
  if (!due.length) return result;
  const breaker = await readBreaker(sb, { fetchImpl, now });
  if (breaker.open) { result.breaker = breaker; markDeferred(due, "breaker_open"); return result; }
  const leaseMs = deadlineMs + perAttemptMs + 10000;
  if (!(await acquireLease(sb, holder, leaseMs, { fetchImpl, now }))) { result.lease = "held_elsewhere"; markDeferred(due, "lease_held"); return result; }
  result.lease = "acquired";
  try {
    for (let i = 0; i < due.length; i++) {
      const x = due[i];
      const left = deadlineMs - (now() - started);
      if (left < 11000) { markDeferred(due.slice(i), "time_box"); break; }
      let outcome = null;
      // One host at a time: never two concurrent Overpass queries from us.
      // Each attempt gets only the time actually left in the box.
      for (const host of OSM_HOSTS) {
        const budget = Math.min(perAttemptMs, deadlineMs - (now() - started) - 1000);
        if (budget < 10000) break; // a shorter attempt on a 20-30 km query is a near-certain timeout
        const a = await fetchRegion(x.g, host, { fetchImpl, timeoutMs: budget, now });
        result.attempts.push({ region: x.g.slug, host: a.host, status: a.status, ms: a.ms, bytes: a.bytes, queryChars: a.queryChars, kind: a.kind, elements: a.elements, places: a.places.length, retryAfter: a.retryAfter });
        outcome = a;
        if (a.kind === "ok" || a.kind === "valid_empty") break;
        if (a.kind === "rate_limited" || a.kind === "denied") break; // do not shop the same workload to another host
      }
      if (outcome && outcome.kind === "ok") {
        const verifiedAt = new Date(now()).toISOString();
        const v = { places: outcome.places, verifiedAt, source: "overpass", host: outcome.host, query: QUERY_VERSION, region: x.g.slug, count: outcome.places.length };
        const wrote = await upsertRow(sb, regionKey(x.g.slug), v, new Date(now() + STALE_MAX_MS).toISOString(), fetchImpl).catch(() => false);
        const back = wrote ? (await readRegions(sb, [x.g.slug], { fetchImpl, timeoutMs: 5000 }))[0] : null;
        const confirmed = !!(back && back.v && back.v.verifiedAt === verifiedAt && back.v.places.length === outcome.places.length);
        if (confirmed) { result.refreshed++; result.regions[x.g.slug] = { status: "refreshed", places: outcome.places.length, verifiedAt }; continue; }
        result.regions[x.g.slug] = { status: x.has ? "stale" : "unavailable", why: "persistence_failed", hasCopy: x.has };
        x.has ? result.stale++ : result.unavailable++;
        continue;
      }
      if (!outcome) { markDeferred([x], "time_box"); continue; }
      const why = outcome.kind;
      // A verified empty answer never replaces a copy that had places; it is
      // reported, and only a region that never had a copy reads "unavailable".
      result.regions[x.g.slug] = { status: x.has ? "stale" : "unavailable", why, hasCopy: x.has };
      x.has ? result.stale++ : result.unavailable++;
      if (why === "rate_limited" || why === "denied") {
        const ra = parseInt((outcome && outcome.retryAfter) || "", 10);
        const ms = why === "denied" ? 6 * 3600 * 1000 : Math.max(isFinite(ra) ? ra * 1000 : 0, 30 * 60 * 1000);
        await openBreaker(sb, why, ms, fetchImpl, now);
        result.breaker = { open: true, reason: why, forMs: ms };
        markDeferred(due.slice(i + 1), "breaker_open");
        break;
      }
    }
  } finally { await releaseLease(sb, holder, { fetchImpl, now }); }
  return result;
}
