// lib/pushTokens.js — server-only reads/writes against device_push_tokens,
// via Supabase's REST API with the service-role key (same pattern as
// app/api/push/register/route.js's sbEnv()/RPC call — this module is the
// read/cleanup counterpart for the push-sending side, owner Gabe, 2026-09-23).
//
// WHY REST AND NOT @supabase/supabase-js HERE: every other cron route in this
// lane that talks to Supabase directly (see app/api/cron/affiliate-coverage)
// uses the client library, but this module is intentionally dependency-light
// and fetch-only so its three functions stay trivially testable with an
// injected fetch — no client to construct, no global to stub.
//
// device_push_tokens columns (see supabase-schema.sql / migrations):
//   token, platform, user_id, device_id, created_at, updated_at

const PAGE_SIZE = 1000;

function sbEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

/**
 * Every iOS token registered to a given (verified) user id, newest first.
 * Empty array on any missing config, network failure or non-2xx response —
 * a caller that cannot send push must never look like it has zero tokens by
 * a real read succeeding at "no rows".
 */
export async function tokensForUser(userId, { fetchImpl = fetch } = {}) {
  const s = sbEnv();
  const id = String(userId || "").trim();
  if (!s || !id) return [];
  const url =
    `${s.url}/rest/v1/device_push_tokens` +
    `?select=token,platform,device_id,created_at` +
    `&user_id=eq.${encodeURIComponent(id)}` +
    `&platform=eq.ios&order=created_at.desc`;
  try {
    const r = await fetchImpl(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key },
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

/**
 * Remove a device token that APNs has said will never accept another push
 * (BadDeviceToken/Unregistered/DeviceTokenNotForTopic, or a 410). Best
 * effort: a failed delete just means the token gets rediscovered as invalid
 * on the next send, never a crash of the caller.
 */
export async function deleteToken(token, { fetchImpl = fetch } = {}) {
  const s = sbEnv();
  const t = String(token || "").trim();
  if (!s || !t) return false;
  try {
    const r = await fetchImpl(`${s.url}/rest/v1/device_push_tokens?token=eq.${encodeURIComponent(t)}`, {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key, prefer: "return=minimal" },
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}

// PostgREST `in.(...)` values: strip characters that would break out of the
// list syntax. Allowlist entries are operator-controlled (Vercel env), not
// user input, but this keeps a stray comma/paren from corrupting the filter
// instead of just being a silently-ignored id.
function sanitizeInListValue(v) {
  return String(v).trim().replace(/[(),"]/g, "");
}

/**
 * Every iOS device token, oldest-registered first, paged internally and
 * capped at `limit` (default/hard cap 5000 — see app/api/cron/weekend-picks,
 * which is the only caller and exists specifically so a mass send can never
 * exceed a bounded run). When `allowlist` is given (a list of user ids
 * and/or device ids), only tokens belonging to one of them are returned —
 * everything else is excluded at the query, not filtered client side.
 */
export async function allIosTokens({ limit = 5000, allowlist = null, fetchImpl = fetch } = {}) {
  const s = sbEnv();
  if (!s) return [];
  const cap = Math.max(1, Math.min(5000, (limit | 0) || 5000));

  let allowClause = "";
  if (Array.isArray(allowlist) && allowlist.length) {
    const ids = allowlist.map(sanitizeInListValue).filter(Boolean);
    if (!ids.length) return []; // an allowlist that resolves to nothing sends to nobody, not to everybody
    const list = ids.join(",");
    allowClause = `&or=(user_id.in.(${list}),device_id.in.(${list}))`;
  }

  const out = [];
  let offset = 0;
  while (out.length < cap) {
    const pageSize = Math.min(PAGE_SIZE, cap - out.length);
    const url =
      `${s.url}/rest/v1/device_push_tokens` +
      `?select=token,user_id,device_id` +
      `&platform=eq.ios&order=created_at.asc${allowClause}` +
      `&limit=${pageSize}&offset=${offset}`;
    let rows;
    try {
      const r = await fetchImpl(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
        headers: { apikey: s.key, authorization: "Bearer " + s.key },
      });
      if (!r.ok) break;
      rows = await r.json();
    } catch (e) {
      break;
    }
    if (!Array.isArray(rows) || rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break; // short page = no more rows
    offset += rows.length;
  }
  return out.slice(0, cap);
}
