// app/api/push/test/route.js — send one real APNs test push, on demand.
//
// OWNER INTENT (Gabe, 2026-09-23). Before "Weekend Picks Near You" ever
// fires for real, there has to be a way to prove the whole chain — APNs
// credentials, a registered device token, the tap-to-open path — actually
// works, without waiting for Friday. Two callers, two different trust
// levels:
//
//   (a) operator/CI, with CRON_SECRET: can target ANY token or ANY user's
//       tokens, and can override the copy (for a one-off wording check).
//       This is the scripts/push-test.mjs path.
//   (b) a signed-in app user, with their own Supabase session: can only
//       ever reach THEIR OWN tokens (identity comes from the verified
//       session, never a client-supplied id), fixed copy, rate-limited —
//       this is "does Wayfind's push actually work on my phone", not a way
//       to spam yourself or anyone else.
//
// Same verified-session pattern as app/api/push/register/route.js
// (/auth/v1/user) — a bearer that fails verification is 401, not silently
// treated as anonymous.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { apnsConfigured, sendPush } from "../../../../lib/apns.js";
import { tokensForUser, deleteToken } from "../../../../lib/pushTokens.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

const TEST_TITLE = "Wayfind test";
const TEST_BODY = "Notifications are working. Tap to open your weekend picks.";
const TEST_URL = "/";

// Rate limit for the USER bearer path only: 3 sends per 10 minutes per
// signed-in user. Same in-memory-per-warm-instance shape as
// app/api/push/register/route.js — not durable across cold starts, and that
// is fine, the durable floor is APNs itself rejecting a dead token.
const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 3;

function limited(key) {
  const now = Date.now();
  const arr = (HITS.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) { HITS.set(key, arr); return true; }
  arr.push(now);
  HITS.set(key, arr);
  if (HITS.size > 5000) HITS.clear();
  return false;
}

function sbEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

async function verifiedUserId(req, s) {
  const auth = String(req.headers.get("authorization") || "").trim();
  if (!/^Bearer\s+\S+$/i.test(auth)) return { ok: false, status: 401 };
  try {
    const r = await fetch(s.url + "/auth/v1/user", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { apikey: s.key, authorization: auth },
    });
    if (!r.ok) return { ok: false, status: 401 };
    const user = await r.json();
    const id = user && user.id;
    return UUID.test(String(id || "")) ? { ok: true, userId: id } : { ok: false, status: 401 };
  } catch {
    return { ok: false, status: 503 };
  }
}

// Never the full token in a response — a last-6 fingerprint is enough for a
// human to tell "which of my devices" apart without handing back the secret.
const maskToken = (t) => String(t || "").slice(-6);

async function sendAndReport(target) {
  const r = await sendPush({ token: target.token, title: target.title, body: target.body, url: target.url });
  if (!r.ok && (r.status === 410 || INVALID_REASONS.has(r.reason))) {
    try { await deleteToken(target.token); } catch (e) {}
  }
  return { token: maskToken(target.token), status: r.status, reason: r.reason };
}

export async function POST(req) {
  if (!apnsConfigured()) {
    return Response.json({ error: "unconfigured" }, { status: 503, headers: { "cache-control": "no-store" } });
  }

  let body = {};
  try { body = await req.json(); } catch (e) {}

  const authHeader = String(req.headers.get("authorization") || "").trim();
  const cronSecret = process.env.CRON_SECRET;
  const isOwner = Boolean(cronSecret) && authHeader === "Bearer " + cronSecret;

  const targets = [];

  if (isOwner) {
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const userId = typeof body.userId === "string" && UUID.test(body.userId) ? body.userId : "";
    if (!token && !userId) {
      return Response.json({ error: "token or userId required" }, { status: 400, headers: { "cache-control": "no-store" } });
    }
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : TEST_TITLE;
    const msgBody = typeof body.body === "string" && body.body.trim() ? body.body.trim() : TEST_BODY;
    const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : TEST_URL;

    if (token) targets.push({ token, title, body: msgBody, url });
    if (userId) {
      const rows = await tokensForUser(userId);
      for (const row of rows) targets.push({ token: row.token, title, body: msgBody, url });
    }
  } else {
    const s = sbEnv();
    if (!s) return Response.json({ error: "unconfigured" }, { status: 503, headers: { "cache-control": "no-store" } });

    const identity = await verifiedUserId(req, s);
    if (!identity.ok) {
      return Response.json({ error: "invalid_session" }, { status: identity.status, headers: { "cache-control": "no-store" } });
    }
    if (limited("user:" + identity.userId)) {
      return Response.json({ error: "rate_limited" }, { status: 429, headers: { "cache-control": "no-store" } });
    }

    // Fixed copy, always — a user-supplied title/body/url is exactly the
    // "spam yourself or anyone else" surface this path must not have.
    const rows = await tokensForUser(identity.userId);
    for (const row of rows) targets.push({ token: row.token, title: TEST_TITLE, body: TEST_BODY, url: TEST_URL });
  }

  if (!targets.length) {
    return Response.json({ ok: true, results: [] }, { headers: { "cache-control": "no-store" } });
  }

  const results = [];
  for (const target of targets) results.push(await sendAndReport(target));

  return Response.json({ ok: true, results }, { headers: { "cache-control": "no-store" } });
}
