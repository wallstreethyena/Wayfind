// lib/commandCenter/auth.js — the ONE server-side authorization choke point
// for /command-center data. Every /api/command-center/* request passes through
// requireOwner() BEFORE any provider is queried; the client is never trusted.
//
// Two ways in, both server-verified:
//   1. OWNER SESSION (primary): the browser sends its Supabase access token as
//      `Authorization: Bearer <jwt>`. We verify it against Supabase Auth
//      (GET /auth/v1/user) and require the verified user id to equal
//      WF_OWNER_USER_ID — the same server-env-only owner identity the Curator
//      Boost system uses (lib/memberSignals.js). The UUID never ships to the
//      client and is never derived from client input.
//   2. HEADER SECRET (fallback, scripting/emergency): `x-wf-cc-key` equal to
//      METRICS_SECRET — the existing owner-metrics secret (see
//      /api/metrics/share). Header, not query param, so it can't leak into
//      URLs, logs, or browser history.
//
// Fail-closed: if NEITHER WF_OWNER_USER_ID nor METRICS_SECRET is configured,
// every request gets 503 not_configured — the dashboard never silently opens.
//
// Verified tokens are cached for 60s (warm-lambda Map) so one page load's
// parallel panel fetches don't stampede Supabase Auth.

const TOKEN_TTL = 60 * 1000;
const tokenCache = globalThis.__wfCcTokenCache || (globalThis.__wfCcTokenCache = new Map());

function clean(v) { return String(v || "").trim().replace(/^['"]+|['"]+$/g, ""); }

function supabaseAuthBase(env) {
  const raw = clean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw;
}

// Constant-time-ish comparison (length leak is fine; content isn't).
function safeEqual(a, b) {
  const A = String(a || ""), B = String(b || "");
  if (A.length !== B.length || A.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A.charCodeAt(i) ^ B.charCodeAt(i);
  return diff === 0;
}

function deny(status, reason) {
  return { ok: false, status, body: { ok: false, reason } };
}

// requireOwner(req, { fetchImpl, env, now }) -> { ok: true, mode } | deny.
// fetchImpl/env/now are injectable for the unit lock; production uses defaults.
export async function requireOwner(req, opts = {}) {
  const env = opts.env || process.env;
  const fetchImpl = opts.fetchImpl || fetch;
  const now = typeof opts.now === "function" ? opts.now : Date.now;

  const ownerId = clean(env.WF_OWNER_USER_ID);
  const secret = clean(env.METRICS_SECRET);

  if (!ownerId && !secret) return deny(503, "not_configured");

  // Path 2: header secret.
  const key = req.headers.get("x-wf-cc-key");
  if (secret && key && safeEqual(key, secret)) return { ok: true, mode: "secret" };

  // Path 1: Supabase session token → verified user id === owner id.
  const authz = String(req.headers.get("authorization") || "");
  const m = authz.match(/^Bearer\s+(.+)$/i);
  if (!ownerId || !m) return deny(401, "unauthorized");
  const token = m[1].trim();
  if (token.length < 20) return deny(401, "unauthorized");

  const hit = tokenCache.get(token);
  if (hit && hit.exp > now()) {
    return hit.userId === ownerId ? { ok: true, mode: "owner" } : deny(403, "forbidden");
  }

  const base = supabaseAuthBase(env);
  const anon = clean(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!base || !anon) return deny(503, "not_configured");

  let userId = null;
  try {
    const r = await fetchImpl(`${base}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (r.ok) {
      const d = await r.json().catch(() => null);
      userId = d && d.id ? String(d.id) : null;
    } else if (r.status === 401 || r.status === 403) {
      userId = null; // invalid/expired token
    } else {
      return deny(503, "auth_unavailable"); // Supabase down ≠ forbidden
    }
  } catch {
    return deny(503, "auth_unavailable");
  }

  if (!userId) return deny(401, "unauthorized");
  // Cache the VERIFIED identity (not the outcome) so owner checks stay exact.
  tokenCache.set(token, { userId, exp: now() + TOKEN_TTL });
  if (tokenCache.size > 200) {
    for (const [k, v] of tokenCache) { if (v.exp <= now()) tokenCache.delete(k); }
  }
  return userId === ownerId ? { ok: true, mode: "owner" } : deny(403, "forbidden");
}
