// lib/serverCache.js — ONE shared server-side cache (v5.90 cache hardening).
//
// Every user's search feeds ONE Supabase-backed pool that all users benefit from,
// so the site stays live when Google Places 429s, Foursquare limits, or SerpApi
// hits its cap. Used by /api/places/search, /api/fsq/search, and /api/events —
// the identical pattern, one table (wf_places_cache), warm-lambda memory in front.
//
// Row: { k, v, exp, wrote_at }. `exp` = freshness deadline; `wrote_at` = when it
// was written, so the stale-serve fallback can enforce an AGE cap (Google's ToS
// forbids caching place content > 30 days). Writes are service-role only (RLS).
//
// Policy (accuracy first, staleness only as degradation):
//   - Prefer a FRESH row (exp in the future) or a live fetch, always.
//   - Serve a STALE (expired) row ONLY on an upstream error/limit, and ONLY if it
//     is within the caller's staleMs age cap. Callers flag it stale:true and
//     should de-emphasize volatile fields (hours/price) rather than assert them.

const MEM = globalThis.__wfServerCacheMem || (globalThis.__wfServerCacheMem = new Map());
export const DAY = 86400000;

export function sbEnv() {
  // Normalize http:// -> https:// (a 301 turns a POST write into a silent GET).
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}
export function cacheConfigured() { return !!sbEnv(); }

let _lastWrite = null;
export function lastWrite() { return _lastWrite; }
export function memSize() { return MEM.size; }

// Read. opts.staleMs: when set, a row PAST its fresh exp is still returned if it
// was written within staleMs (the age cap). Returns { v, stale } or null.
export async function cget(k, opts = {}) {
  const now = Date.now();
  const staleMs = opts.staleMs || 0;
  const check = (exp, wrote) => {
    if (exp > now) return { ok: true, stale: false };
    if (staleMs && wrote != null && (now - wrote) <= staleMs) return { ok: true, stale: true };
    return { ok: false };
  };
  const m = MEM.get(k);
  if (m) { const c = check(m.exp, m.wrote); if (c.ok) return { v: m.v, stale: c.stale }; }
  const s = sbEnv();
  if (!s) return null;
  try {
    // select=* (NOT an explicit wrote_at) so this READ keeps working before the
    // cache-hardening migration adds the column — otherwise PostgREST 400s on the
    // unknown column, cget returns null, and existing cached lists go unreadable
    // on a cold lambda during a 429 storm (the exact blankout this exists to stop).
    const r = await fetch(`${s.url}/rest/v1/wf_places_cache?k=eq.${encodeURIComponent(k)}&select=*`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store",
    });
    if (!r.ok) return null;
    const row = (await r.json())[0];
    if (!row) return null;
    const exp = new Date(row.exp).getTime();
    // Legacy rows predate wrote_at: approximate the write time from exp so the
    // age cap still applies conservatively (assume a 10-day fresh TTL).
    const wrote = row.wrote_at ? new Date(row.wrote_at).getTime() : (exp - 10 * DAY);
    const c = check(exp, wrote);
    if (!c.ok) return null;
    MEM.set(k, { v: row.v, exp, wrote });
    return { v: row.v, stale: c.stale };
  } catch { return null; }
}

// Write with a fresh TTL (ms). Records wrote_at=now so the stale age cap works.
export async function cset(k, v, ttlMs) {
  const now = Date.now();
  const exp = now + (ttlMs || 10 * DAY);
  MEM.set(k, { v, exp, wrote: now });
  const s = sbEnv();
  if (!s) { _lastWrite = { at: now, ok: false, why: "no supabase env" }; return; }
  const url = `${s.url}/rest/v1/wf_places_cache`;
  const headers = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" };
  try {
    let r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ k, v, exp: new Date(exp).toISOString(), wrote_at: new Date(now).toISOString() }) });
    if (!r.ok) {
      // Pre-migration the table has no wrote_at column, so the write 400s. Retry
      // WITHOUT wrote_at so the SHARED write still lands (reads then approximate
      // wrote_at from exp). Once the migration runs, the first write succeeds.
      r = await fetch(url, { method: "POST", headers, body: JSON.stringify({ k, v, exp: new Date(exp).toISOString() }) });
    }
    const txt = await r.text();
    _lastWrite = { at: now, ok: r.ok, status: r.status, detail: r.ok ? undefined : txt.slice(0, 300) };
  } catch (e) { _lastWrite = { at: now, ok: false, why: String((e && e.message) || e).slice(0, 300) }; }
}

// Permanent place-ID index. Google's ToS lets us keep Place IDs INDEFINITELY, so
// this table has no expiry. Stores the ID + our derived signals (category,
// ranking) plus a MINIMAL skeleton (name/lat/lng) so feeds/tiles can show known
// places when detail caches are cold and re-hydrate details cheaply by ID.
// NOTE: name/lat/lng are the minimal skeleton the owner has chosen to retain for
// reliability; if strict Google ToS is required these should be refreshed <=30d.
export async function upsertPlaceIds(rows) {
  const s = sbEnv();
  if (!s || !Array.isArray(rows) || !rows.length) return;
  const now = new Date(Date.now()).toISOString();
  const payload = rows.filter((r) => r && r.id && typeof r.id === "string").slice(0, 60).map((r) => ({
    place_id: r.id.slice(0, 200),
    name: r.name ? String(r.name).slice(0, 200) : null,
    lat: typeof r.lat === "number" ? r.lat : null,
    lng: typeof r.lng === "number" ? r.lng : null,
    category: r.category ? String(r.category).slice(0, 40) : null,
    signals: r.signals && typeof r.signals === "object" ? r.signals : null,
    seen_at: now,
  }));
  if (!payload.length) return;
  try {
    await fetch(`${s.url}/rest/v1/wf_place_ids`, {
      method: "POST",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify(payload),
    });
  } catch (e) {}
}
