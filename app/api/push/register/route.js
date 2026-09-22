export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createHash } from "node:crypto";

const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sbEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return url && key ? { url, key } : null;
}

function limited(key) {
  const now = Date.now();
  const arr = (HITS.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) { HITS.set(key, arr); return true; }
  arr.push(now);
  HITS.set(key, arr);
  if (HITS.size > 5000) HITS.clear();
  return false;
}

function clientKey(req, token) {
  const ip = String(req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || String(req.headers.get("x-real-ip") || "").trim();
  if (ip) return "ip:" + ip;
  return "token:" + createHash("sha256").update(token).digest("hex").slice(0, 24);
}

async function verifiedUserId(req, s) {
  const auth = String(req.headers.get("authorization") || "").trim();
  if (!auth) return { ok: true, userId: null };
  if (!/^Bearer\s+\S+$/i.test(auth)) return { ok: false, status: 401 };
  try {
    const r = await fetch(s.url + "/auth/v1/user", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { apikey: s.key, authorization: auth },
    });
    if (!r.ok) return { ok: false, status: 401 };
    const user = await r.json();
    return { ok: true, userId: UUID.test(String(user && user.id || "")) ? user.id : null };
  } catch {
    return { ok: false, status: 503 };
  }
}

export async function POST(req) {
  const s = sbEnv();
  if (!s) return Response.json({ ok: false, error: "unconfigured" }, { status: 503, headers: { "cache-control": "no-store" } });

  let body;
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: "bad_json" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const platform = typeof body?.platform === "string" ? body.platform.trim().toLowerCase() : "";
  const deviceId = typeof body?.deviceId === "string" ? body.deviceId.trim().slice(0, 160) : null;

  if (token.length < 32 || token.length > 512 || /[\r\n\0]/.test(token)) {
    return Response.json({ ok: false, error: "invalid_token" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (platform !== "ios" && platform !== "android") {
    return Response.json({ ok: false, error: "invalid_platform" }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  if (limited(clientKey(req, token))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429, headers: { "cache-control": "no-store" } });
  }

  const identity = await verifiedUserId(req, s);
  if (!identity.ok) {
    return Response.json({ ok: false, error: identity.status === 401 ? "invalid_session" : "auth_unavailable" }, { status: identity.status, headers: { "cache-control": "no-store" } });
  }

  try {
    const r = await fetch(s.url + "/rest/v1/rpc/wf_register_push_token_server", {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        apikey: s.key,
        authorization: "Bearer " + s.key,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_token: token,
        p_platform: platform,
        p_device_id: deviceId || null,
        p_user_id: identity.userId,
      }),
    });
    if (!r.ok) {
      console.error("[push-register] storage unavailable status=" + r.status);
      return Response.json({ ok: false, error: "storage_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
    }
    return Response.json({ ok: true }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ ok: false, error: "storage_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
