// lib/curatorPicksServer.js — SERVER-ONLY: the owner's curator-pick set.
//
// The same one truth lib/curatorPicks.js applies in the browser, read here so
// server-built rails (lib/railsData.js) and paged API feeds order and cap with
// the bump already applied: a newly picked place can enter a top-N on the
// server, and the first paint is not re-ordered when the client store lands.
//
// Identity is env-only here (WF_OWNER_USER_ID, the same door
// /api/signals/likes uses first). This module never sees a session, never
// returns an email or UUID, and returns place ids only.
import { stampOwnerPick } from "./ownerBump.js";

/** Same lifetime as /api/signals/likes's warm-instance cache. */
export const CURATOR_PICKS_TTL_MS = 60 * 1000;

/**
 * Data-cache lifetime for reads made while a PAGE renders. A `no-store` read
 * inside app/page.js or a guide would opt that ISR page into per-request
 * rendering, and a shorter revalidate would lower the page's own schedule
 * (Next takes the minimum). 3600 is >= every page that reaches this (home
 * 3600, guides 900), so it changes no page's refresh schedule. The browser
 * store (/api/signals/curator-picks, s-maxage 60) corrects sooner.
 */
export const PAGE_SAFE_REVALIDATE_S = 3600;

let cache = null; // { ids: string[], exp }
let inflight = null;

function supabaseServiceEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

/** Owner user ids that may mint a pick: env, plus a verified owner session id. */
export function curatorOwnerIds(sessionOwnerId) {
  const out = new Set();
  const env = String(process.env.WF_OWNER_USER_ID || "").trim();
  if (env) out.add(env);
  if (sessionOwnerId) out.add(String(sessionOwnerId));
  return [...out];
}

/**
 * Read the owner's liked place ids. Returns null when the read could not be
 * made (no service env, no owner id, HTTP failure) — UNKNOWN, which callers
 * must treat as "leave rows as they are", never as "nothing is picked".
 */
export async function readOwnerPickIds(ownerIds, fetchImpl, cacheOpts) {
  const s = supabaseServiceEnv();
  const ids = (ownerIds || []).filter(Boolean);
  if (!s || !ids.length) return null;
  const f = fetchImpl || fetch;
  const inList = "in.(" + ids.map((x) => '"' + String(x).replace(/"/g, "") + '"').join(",") + ")";
  try {
    const r = await f(`${s.url}/rest/v1/likes?user_id=${encodeURIComponent(inList)}&select=place_id&limit=5000`, {
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}` },
      ...(cacheOpts || { next: { revalidate: PAGE_SAFE_REVALIDATE_S } }),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    return [...new Set(rows.map((row) => row && row.place_id).filter(Boolean).map(String))];
  } catch (e) { return null; }
}

/**
 * The public pick set, cached per warm instance. `fresh` bypasses the cache
 * (the owner's own post-tap read). Resolves null when unknown.
 */
export async function loadOwnerPickIds(opts) {
  const fresh = !!(opts && opts.fresh);
  // A caller with its own freshness (the public endpoint: 60s, or fresh) reads
  // past the page path's warm cache, which may hold an hour-old data-cache copy.
  const own = fresh || !!(opts && Number.isFinite(opts.revalidate));
  if (!own && cache && cache.exp > Date.now()) return cache.ids;
  if (!own && inflight) return inflight;
  const run = (async () => {
    const cacheOpts = fresh ? { cache: "no-store" } : (own ? { next: { revalidate: opts.revalidate } } : null);
    const ids = await readOwnerPickIds(curatorOwnerIds(opts && opts.sessionOwnerId), opts && opts.fetchImpl, cacheOpts);
    if (ids && !own) cache = { ids, exp: Date.now() + CURATOR_PICKS_TTL_MS };
    return ids;
  })();
  if (!own) { inflight = run; run.finally(() => { inflight = null; }); }
  return run;
}

/**
 * Apply the pick set to server rows BEFORE they are sorted or capped. Same
 * function as the client (stampOwnerPick), so the number, the restamped sort
 * key and the Curator's-pick mark cannot drift between server and browser.
 * `ids` null (unknown) returns rows untouched.
 */
export function applyCuratorPicksServer(rows, ids) {
  if (!Array.isArray(rows) || !ids) return rows;
  const set = ids instanceof Set ? ids : new Set(ids.map(String));
  if (!set.size) return rows;
  return rows.map((p) => (p && p.id != null && set.has(String(p.id)) && !(p._members && p._members.ownerPick === true) ? stampOwnerPick(p, true) : p));
}

/** Test-only. */
export function __resetCuratorPicksServerForTest() { cache = null; inflight = null; }
