// lib/ownedSocialStore.js — server-only I/O for wf_owned_social (see
// lib/ownedSocial.js for the rules). Every function takes an injectable
// `fetchImpl` and `env` so scripts/test-owned-social-reconcile.mjs can drive it.
//
// FAIL LOUD: reads THROW on a non-2xx or a non-array body. A failed read must
// never look like "Wayfind has no posts" — that empty list is exactly the
// silent miss this pipeline exists to prevent.
import { normalizeAsset, canonicalPermalink } from "./ownedSocial.js";

export const OWNED_TABLE = "wf_owned_social";
export const OWNED_BUCKET = "owned-social";
const PAGE = 500;
const MAX_ROWS = 20000;
const COLUMNS = "shortcode,permalink,format,lifecycle,published_at,title,city,region,relevant_until,evergreen,decision_source,wayfind_links,eligibility,exclusion_reason,companion_of,cover_url,cover_source_url,cover_stored_at,source,last_seen_at,trending_verified_at";

function envOf(env) {
  const e = env || process.env;
  const raw = String(e.SUPABASE_URL || e.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/^http:\/\//i, "https://");
  const key = e.SUPABASE_SERVICE_ROLE_KEY;
  return raw && key ? { url: /^https:\/\//i.test(raw) ? raw : "https://" + raw, key } : null;
}
const headers = (key, extra = {}) => ({ apikey: key, authorization: `Bearer ${key}`, ...extra });

/**
 * Every row (or only shelf candidates with { shelfOnly: true }), paged to
 * exhaustion in a stable order. Throws on any failure.
 */
export async function readOwnedRows({ fetchImpl = fetch, env, shelfOnly = false } = {}) {
  const s = envOf(env);
  if (!s) throw new Error("unavailable: supabase not configured");
  const filter = shelfOnly ? "&lifecycle=eq.published&eligibility=eq.eligible&format=in.(reel,carousel)" : "";
  const out = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const r = await fetchImpl(`${s.url}/rest/v1/${OWNED_TABLE}?select=${COLUMNS}${filter}&order=shortcode.asc`, {
      headers: headers(s.key, { range: `${from}-${from + PAGE - 1}`, "range-unit": "items" }),
      cache: "no-store",
    });
    if (!r || !r.ok) throw new Error(`read ${OWNED_TABLE} failed: HTTP ${r ? r.status : "none"}`);
    const body = await r.json();
    if (!Array.isArray(body)) throw new Error(`read ${OWNED_TABLE} failed: non-array body`);
    out.push(...body);
    if (body.length < PAGE) return out;
  }
  throw new Error(`read ${OWNED_TABLE} hit the ${MAX_ROWS} row ceiling`);
}

/** Upsert canonical rows. New rows keep their classification; existing rows only refresh source fields. */
export async function upsertSourceRows(rows, { fetchImpl = fetch, env } = {}) {
  const s = envOf(env);
  if (!s) throw new Error("unavailable: supabase not configured");
  if (!rows.length) return 0;
  // Insert unknown posts (ignore duplicates) so a re-run never overwrites a
  // human or agent classification with the source's defaults ...
  const ins = await fetchImpl(`${s.url}/rest/v1/${OWNED_TABLE}?on_conflict=shortcode`, {
    method: "POST",
    headers: headers(s.key, { "content-type": "application/json", prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  if (!ins || !ins.ok) throw new Error(`insert ${OWNED_TABLE} failed: HTTP ${ins ? ins.status : "none"}`);
  // ... then mark every post the source still lists as seen, and publish any
  // that were scheduled. Never touches eligibility, exclusion_reason, titles,
  // evergreen or links: an audited or owner decision is never overwritten.
  const seenAt = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 100) {
    const codes = rows.slice(i, i + 100).map((r) => r.shortcode).join(",");
    const up = await fetchImpl(`${s.url}/rest/v1/${OWNED_TABLE}?shortcode=in.(${codes})`, {
      method: "PATCH",
      headers: headers(s.key, { "content-type": "application/json", prefer: "return=minimal" }),
      body: JSON.stringify({ last_seen_at: seenAt, lifecycle: "published", updated_at: seenAt }),
    });
    if (!up || !up.ok) throw new Error(`mark seen failed: HTTP ${up ? up.status : "none"}`);
  }
  return rows.length;
}

/** Public URL of a stored cover. */
export function coverPublicUrl(url, shortcode) {
  return `${url}/storage/v1/object/public/${OWNED_BUCKET}/${shortcode}.jpg`;
}

/**
 * Copy one post's cover from Instagram's expiring CDN link into our bucket and
 * record its permanent URL. Returns { ok, why }.
 */
export async function storeCover(row, { fetchImpl = fetch, env } = {}) {
  const s = envOf(env);
  if (!s) return { ok: false, why: "unavailable: supabase not configured" };
  if (!row || !row.cover_source_url) return { ok: false, why: "no cover_source_url" };
  if (!/^https:\/\/[a-z0-9.-]+\.(cdninstagram\.com|fbcdn\.net)\//i.test(row.cover_source_url)) return { ok: false, why: "cover host not instagram" };
  let img;
  try { img = await fetchImpl(row.cover_source_url, { cache: "no-store" }); } catch (e) { return { ok: false, why: "cover fetch threw" }; }
  if (!img || !img.ok) return { ok: false, why: `cover fetch HTTP ${img ? img.status : "none"} (link expired?)` };
  const type = String(img.headers && img.headers.get ? img.headers.get("content-type") || "" : "");
  if (!/^image\//i.test(type)) return { ok: false, why: "cover is not an image" };
  const body = await img.arrayBuffer();
  if (!body || body.byteLength < 2000) return { ok: false, why: "cover too small" };
  const up = await fetchImpl(`${s.url}/storage/v1/object/${OWNED_BUCKET}/${row.shortcode}.jpg`, {
    method: "POST",
    headers: headers(s.key, { "content-type": type, "x-upsert": "true", "cache-control": "max-age=31536000" }),
    body,
  });
  if (!up || !up.ok) return { ok: false, why: `cover upload HTTP ${up ? up.status : "none"}` };
  const now = new Date().toISOString();
  const patch = await fetchImpl(`${s.url}/rest/v1/${OWNED_TABLE}?shortcode=eq.${row.shortcode}`, {
    method: "PATCH",
    headers: headers(s.key, { "content-type": "application/json", prefer: "return=minimal" }),
    body: JSON.stringify({ cover_url: coverPublicUrl(s.url, row.shortcode), cover_stored_at: now, updated_at: now }),
  });
  if (!patch || !patch.ok) return { ok: false, why: `cover patch HTTP ${patch ? patch.status : "none"}` };
  return { ok: true, why: null };
}

/** Stamp the posts the live shelf actually served. */
export async function markTrendingVerified(codes, { fetchImpl = fetch, env } = {}) {
  const s = envOf(env);
  if (!s || !codes.length) return false;
  const now = new Date().toISOString();
  for (let i = 0; i < codes.length; i += 100) {
    const r = await fetchImpl(`${s.url}/rest/v1/${OWNED_TABLE}?shortcode=in.(${codes.slice(i, i + 100).join(",")})`, {
      method: "PATCH",
      headers: headers(s.key, { "content-type": "application/json", prefer: "return=minimal" }),
      body: JSON.stringify({ trending_verified_at: now }),
    });
    if (!r || !r.ok) return false;
  }
  return true;
}

/**
 * Wayfind's own media from the Instagram Graph API (/{ig-user-id}/media),
 * paged to the end. Ships dark: returns null until IG_GRAPH_TOKEN and
 * IG_BUSINESS_ACCOUNT_ID exist (docs/INSTAGRAM_SETUP.md). Throws on a failed page.
 */
export async function fetchOwnGraphMedia({ fetchImpl = fetch, token, userId, version = "v26.0", maxPages = 40 } = {}) {
  if (!token || !userId) return null;
  const fields = "id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp";
  let url = `https://graph.facebook.com/${version}/${encodeURIComponent(userId)}/media?fields=${fields}&limit=50`;
  const out = [];
  for (let page = 0; url && page < maxPages; page++) {
    const r = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!r || !r.ok) throw new Error(`graph media page ${page} failed: HTTP ${r ? r.status : "none"}`);
    const body = await r.json();
    if (!body || !Array.isArray(body.data)) throw new Error(`graph media page ${page}: no data array`);
    for (const m of body.data) {
      const row = normalizeAsset({ ...m, media_type: m.media_product_type === "REELS" ? "REELS" : m.media_type }, { source: "graph" });
      if (row && row.permalink === canonicalPermalink(row.format, row.shortcode)) out.push(row);
    }
    url = body.paging && body.paging.next ? body.paging.next : null;
  }
  if (url) throw new Error(`graph media stopped after ${maxPages} pages with more remaining`);
  return out;
}
