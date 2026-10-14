// lib/photoPurchaseLog.js — one privacy-conscious row per /api/photo request that
// reached the paid Google decision point (2026-10-15, observe-only).
// Table: public.wf_photo_purchase (supabase/migrations/20261015120000_wf_photo_purchase.sql).
//
// FAIL-SOFT, same contract as lib/photoOutcomes.js recordPhotoOutcome: never
// throws, bounded to 400ms, resolves a boolean, and a no-op outside production.
//
// STORED ROW = ONLY the allowed keys below. NEVER a raw IP, raw user agent,
// photo ref/URL, key or query string. bucket_hash is salted per site (US Eastern) day (salt is
// derived from the existing service key, so no new secret) so it cannot link a
// visitor across days.
import { siteTodayStr } from "./siteTime.js";
import { createHash } from "node:crypto";

const TIMEOUT_MS = 400;
export const PURCHASE_ROW_KEYS = ["place_id", "surface", "request_id", "idempotency_key", "ledger_reason", "upstream", "retried", "refunded", "bucket_hash", "ua_class", "sfs", "env", "deployment_id"];

const sha256 = (s) => createHash("sha256").update(String(s)).digest("hex");

/** Coarse browser bucket; the raw UA is never stored. */
export function uaClass(ua) {
  const s = String(ua || "");
  if (/iPhone|iPad|iPod/i.test(s) && /Safari/i.test(s) && !/CriOS|FxiOS/i.test(s)) return "ios-safari";
  if (/Android/i.test(s) && /Chrome/i.test(s)) return "android-chrome";
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(s)) return "other";
  if (/Chrome|Chromium/i.test(s) && !/Edg|OPR/i.test(s)) return "desktop-chrome";
  if (/Safari/i.test(s) && /Macintosh/i.test(s) && !/Chrome|Chromium/i.test(s)) return "desktop-safari";
  return "other";
}

// Salt rotation day: US Eastern site day (CLAUDE.md: never a UTC toISOString slice).
function utcDay(now) { return siteTodayStr(new Date(now)); }

/** sha256(daySalt|ip|ua) hex[0..32]; null when the service key is missing. */
export function bucketHash({ ip, ua, now = Date.now(), env = process.env } = {}) {
  const key = env && env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const daySalt = sha256(key + "|" + utcDay(now));
  return sha256(daySalt + "|" + String(ip || "") + "|" + String(ua || "")).slice(0, 32);
}

/** sha256(placeId|surface|bucket|floor(ts/10000)) — same visitor+place within 10s collides. */
export function idempotencyKey({ placeId, surface, bucket, now = Date.now() } = {}) {
  return sha256([placeId || "", surface || "", bucket || "", Math.floor(now / 10000)].join("|"));
}

function cfg(env) {
  const raw = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

const short = (v, n = 80) => (v == null || v === "" ? null : String(v).slice(0, n));

/**
 * Record one purchase decision. fields: { placeId, surface, requestId, idempotencyKey,
 * ledgerReason, upstream, retried, refunded, bucketHash, uaClass, sfs }.
 * opts: { fetchImpl, env }. Never throws; true only on a confirmed write.
 */
export async function recordPhotoPurchase(fields, opts = {}) {
  try {
    const env = opts.env || process.env;
    const f = fields || {};
    if (String(env.VERCEL_ENV || "").trim().toLowerCase() !== "production") return false; // preview/dev: no-op
    const placeId = short(f.placeId, 200);
    const s = cfg(env);
    if (!placeId || !s) return false;
    const row = {
      place_id: placeId,
      surface: f.surface === "card" || f.surface === "detail" ? f.surface : null,
      request_id: short(f.requestId, 120),
      idempotency_key: short(f.idempotencyKey, 64),
      ledger_reason: short(f.ledgerReason, 40),
      upstream: short(f.upstream, 40),
      retried: typeof f.retried === "boolean" ? f.retried : null,
      refunded: Number.isFinite(f.refunded) ? Math.max(0, Math.min(32767, Math.trunc(f.refunded))) : null,
      bucket_hash: short(f.bucketHash, 64),
      ua_class: short(f.uaClass, 24),
      sfs: short(f.sfs, 24),
      env: "production",
      deployment_id: short(env.VERCEL_DEPLOYMENT_ID, 80),
    };
    const doFetch = opts.fetchImpl || fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await doFetch(s.url + "/rest/v1/wf_photo_purchase", {
        method: "POST",
        headers: { "Content-Type": "application/json", Prefer: "return=minimal", apikey: s.key, Authorization: "Bearer " + s.key },
        body: JSON.stringify(row),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      return !!(r && r.ok);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}
