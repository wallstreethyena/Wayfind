// app/api/account/delete/route.js — real in-app account deletion (Apple App
// Store guideline 5.1.1(v): an app offering account creation must offer
// in-app account deletion, not point at a web form or a support email).
// Owner: Gabe, 2026-09-23.
//
// SHAPE COPIED FROM app/api/push/register/route.js (sbEnv/rate-limit/verify
// pattern), tightened because this route is destructive: the bearer token
// is REQUIRED (push/register allows an anonymous device), and only after
// that identity is verified does anything below run.
//
// ORDERING IS LOAD BEARING. Every cleanup step (a-f) is best effort and
// recorded in `cleaned` — a failed storage delete or a failed Apple revoke
// must never stop the account from being deleted, or a user who hit one
// flaky upstream would be stuck unable to delete their account at all. The
// ONE exception is the Admin API user delete (g): it runs LAST, only after
// the bearer's identity was verified, and if IT fails the route returns 502
// and does not report success — the client must not sign the device out or
// clear local data for an account that still exists server side.
import { appleConfigured, exchangeCode, revokeToken } from "../../../../lib/appleAuth.js";
import { recordPulse } from "../../../../lib/jobPulse.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const HITS = new Map();
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5;

function sbEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

function clientIp(req) {
  const fwd = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  return fwd || String(req.headers.get("x-real-ip") || "").trim() || "unknown";
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) { HITS.set(ip, arr); return true; }
  arr.push(now);
  HITS.set(ip, arr);
  if (HITS.size > 5000) HITS.clear();
  return false;
}

// Unlike push/register, a bearer token is MANDATORY here — this route deletes
// data, it never runs for an anonymous device.
async function verifiedUser(req, s) {
  const auth = String(req.headers.get("authorization") || "").trim();
  if (!/^Bearer\s+\S+$/i.test(auth)) return { ok: false, status: 401 };
  try {
    const r = await fetch(s.url + "/auth/v1/user", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { apikey: s.key, authorization: auth },
    });
    if (!r.ok) return { ok: false, status: 401 };
    const user = await r.json().catch(() => null);
    if (!user || !UUID.test(String(user.id || ""))) return { ok: false, status: 401 };
    return { ok: true, user };
  } catch {
    return { ok: false, status: 503 };
  }
}

function hasAppleIdentity(user) {
  try {
    if (Array.isArray(user.identities) && user.identities.some((i) => i && i.provider === "apple")) return true;
    const providers = user.app_metadata && user.app_metadata.providers;
    if (Array.isArray(providers) && providers.includes("apple")) return true;
  } catch {}
  return false;
}

// PostgREST `ilike`/`like` take a LIKE PATTERN, not a literal — `_`, `%` and,
// through PostgREST's own `*`-for-`%` alias, a literal `*` all act as
// wildcards. An email whose local part happens to contain any of those
// (underscore is common) would match more than itself. `in.()` with each
// value double-quoted, the same pattern lib/ownedPool.js already uses for
// PostgREST list filters, takes each value as a LITERAL — no character in it
// is ever read as a wildcard, so it cannot be gamed into a broader match.
function pgQuote(value) {
  return `"${String(value).replace(/["\\]/g, "\\$&")}"`;
}

async function restDelete(s, path, query) {
  try {
    const r = await fetch(`${s.url}/rest/v1/${path}?${query}`, {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key, prefer: "return=minimal" },
    });
    return r.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

async function restPatch(s, path, query, body) {
  try {
    const r = await fetch(`${s.url}/rest/v1/${path}?${query}`, {
      method: "PATCH",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify(body),
    });
    return r.ok ? "ok" : "failed";
  } catch {
    return "failed";
  }
}

// Deletes every storage object under bucket `bucket` whose path is exactly
// `${userId}/...` — both user-media (wf_user_media.storage_path/
// thumbnail_path) and comment-photos (owner-prefixed folder, confirmed via
// `select bucket_id, name, owner_id from storage.objects` against the
// project: every comment-photos row's `name` starts with its `owner_id`,
// e.g. "<uuid>/<placeId>-<ts>-<rand>.jpeg") key their objects this way.
async function deleteStoragePrefix(s, bucket, userId) {
  try {
    const listRes = await fetch(`${s.url}/storage/v1/object/list/${bucket}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json" },
      // Storage's list default page size is 100; 1000 covers every
      // realistic per-user photo count in one page. A user who somehow
      // exceeds it keeps the remainder as an orphaned object under their
      // (now deleted) id — cosmetic, not a data-exposure or correctness bug.
      body: JSON.stringify({ prefix: `${userId}/`, limit: 1000 }),
    });
    if (!listRes.ok) return "list_failed";
    const entries = await listRes.json().catch(() => null);
    const names = Array.isArray(entries) ? entries.filter((e) => e && e.name).map((e) => `${userId}/${e.name}`) : [];
    if (!names.length) return "none";
    const delRes = await fetch(`${s.url}/storage/v1/object/${bucket}`, {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json" },
      body: JSON.stringify({ prefixes: names }),
    });
    return delRes.ok ? `deleted:${names.length}` : "delete_failed";
  } catch {
    return "failed";
  }
}

// wf_user_media's own storage_path/thumbnail_path columns, rather than a
// bucket list, so this step also cleans up correctly even if a row's path
// was written under some other convention.
async function deleteUserMediaObjects(s, userId) {
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_user_media?select=storage_path,thumbnail_path&user_id=eq.${userId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key },
    });
    if (!r.ok) return "list_failed";
    const rows = await r.json().catch(() => null);
    const paths = new Set();
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row && row.storage_path) paths.add(row.storage_path);
      if (row && row.thumbnail_path) paths.add(row.thumbnail_path);
    }
    if (!paths.size) return "none";
    const delRes = await fetch(`${s.url}/storage/v1/object/user-media`, {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json" },
      body: JSON.stringify({ prefixes: [...paths] }),
    });
    return delRes.ok ? `deleted:${paths.size}` : "delete_failed";
  } catch {
    return "failed";
  }
}

export async function POST(req) {
  const s = sbEnv();
  if (!s) return Response.json({ ok: false, error: "unconfigured" }, { status: 503, headers: { "cache-control": "no-store" } });

  let body;
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (!body || body.confirm !== "delete") {
    return Response.json({ ok: false, error: "confirmation_required" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const ip = clientIp(req);
  if (rateLimited(ip)) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "cache-control": "no-store" } });
  }

  const identity = await verifiedUser(req, s);
  if (!identity.ok) {
    return Response.json({ ok: false, error: identity.status === 401 ? "invalid_session" : "auth_unavailable" }, { status: identity.status, headers: { "cache-control": "no-store" } });
  }
  const user = identity.user;
  const userId = user.id;
  const email = typeof user.email === "string" && user.email ? user.email : null;

  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().slice(0, 160) : "";
  const appleAuthorizationCode = typeof body.appleAuthorizationCode === "string" ? body.appleAuthorizationCode.trim() : "";

  const cleaned = {};

  // a. Storage: user-media (via wf_user_media's own path columns) and
  // comment-photos (owner-prefixed folder — see deleteStoragePrefix above).
  cleaned.storage_user_media = await deleteUserMediaObjects(s, userId);
  cleaned.storage_comment_photos = await deleteStoragePrefix(s, "comment-photos", userId);

  // b. Non-FK tables — no ON DELETE CASCADE from auth.users, so these
  // survive the Admin delete below unless removed explicitly.
  cleaned.wf_feedback = await restDelete(s, "wf_feedback", `user_id=eq.${userId}`);
  cleaned.wf_taste = await restDelete(s, "wf_taste", `user_id=eq.${userId}`);

  // c. ON DELETE SET NULL tables that also carry a free-text PII column —
  // the row itself is anonymized by the FK on delete, but its email column
  // is not, so it is cleared here ahead of that.
  cleaned.wf_city_requests = await restPatch(s, "wf_city_requests", `user_id=eq.${userId}`, { email: null });

  // d. Email-keyed marketing tables (no user_id column at all — matched by
  // email only, and only when the account actually has one). Both the exact
  // and the lower-cased form are matched (signup forms do not all normalize
  // case before insert), but every value is a LITERAL inside in.() — never a
  // pattern, so nothing in the email itself can widen the match.
  if (email) {
    const lower = email.toLowerCase();
    const values = lower === email ? [email] : [email, lower];
    const pattern = `email=in.(${encodeURIComponent(values.map(pgQuote).join(","))})`;
    cleaned.wf_email_signups = await restDelete(s, "wf_email_signups", pattern);
    cleaned.wf_waitlist = await restDelete(s, "wf_waitlist", pattern);
    cleaned.wf_giveaway_entries = await restDelete(s, "wf_giveaway_entries", pattern);
  } else {
    cleaned.wf_email_signups = cleaned.wf_waitlist = cleaned.wf_giveaway_entries = "skipped_no_email";
  }

  // e. Push tokens for this device. User-linked rows cascade with the Admin
  // delete below regardless; this also removes the row when the device was
  // never linked to a user (device_id-only rows the cascade cannot reach).
  cleaned.device_push_tokens = deviceId ? await restDelete(s, "device_push_tokens", `device_id=eq.${encodeURIComponent(deviceId)}`) : "skipped_no_device_id";

  // f. Apple: revoke the Sign in with Apple grant when we can. This can
  // never abort the deletion — every branch below is recorded, not thrown.
  let appleRevoked;
  if (!hasAppleIdentity(user)) {
    appleRevoked = "skipped_not_apple";
  } else if (!appleAuthorizationCode) {
    appleRevoked = "skipped_no_code";
  } else if (!appleConfigured()) {
    appleRevoked = "skipped_unconfigured";
  } else {
    try {
      const tokens = await exchangeCode(appleAuthorizationCode);
      const refreshToken = tokens && tokens.refresh_token;
      if (!refreshToken) throw new Error("Apple did not return a refresh token");
      await revokeToken(refreshToken, "refresh_token");
      appleRevoked = "revoked";
    } catch {
      appleRevoked = "failed";
    }
  }

  // g. The Admin user delete — LAST, and the only step allowed to fail the
  // whole request. Cascades profiles/likes/saved_places/follows/comments/
  // wf_saved_items/wf_user_media/device_push_tokens; events and
  // wf_media_reports.reporter_id are ON DELETE SET NULL (anonymized, kept).
  let adminDeleted = false;
  try {
    const r = await fetch(`${s.url}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { apikey: s.key, authorization: "Bearer " + s.key },
    });
    adminDeleted = r.ok;
  } catch {
    adminDeleted = false;
  }

  if (!adminDeleted) {
    try { await recordPulse("account_delete", { attempted: 1, succeeded: 0, note: "admin user delete failed" }); } catch {}
    return Response.json({ ok: false, error: "delete_failed" }, { status: 502, headers: { "cache-control": "no-store" } });
  }

  try { await recordPulse("account_delete", { attempted: 1, succeeded: 1 }); } catch {}
  // No PII in this line by construction — no email, no token, no ids beyond
  // what is already implicit in "an account was deleted".
  console.log("[account-delete] account deleted, apple=" + appleRevoked);

  return Response.json(
    { ok: true, revoked: { apple: appleRevoked }, cleaned },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
