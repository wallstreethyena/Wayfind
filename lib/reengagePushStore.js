// lib/reengagePushStore.js: SERVER-ONLY. Writes one re-engagement push
// subscription to wf_reengage_push_subs (service role only, RLS on).
//
// The endpoint and the keys are stored SEALED (lib/reengagePushCrypto.js:
// AES-256-GCM under a key derived from the VAPID private key) and looked up by
// endpoint_hash, so a database read alone cannot turn a row into a way to push to
// a browser. They are opened only in memory, at send time, by the dispatcher.
//
// Never logs, never returns the endpoint, never puts it in a URL. The table is not
// wf_web_push_subscriptions (member daily picks); this file never touches that one.
import { sbEnv } from "./serverCache.js";
import { endpointHash, sealField } from "./reengagePushCrypto.js";

const T_PUSH = "wf_reengage_push_subs";
export const PLATFORMS = Object.freeze(["desktop", "android", "ios_pwa", "other"]);

/**
 * Upsert on endpoint_hash. A browser that subscribes again, or comes back under a
 * new anonymous id, updates its one row and clears revoked_at.
 * Returns { ok: true } or { ok: false, reason }.
 */
export async function savePushSubscription(
  { anonId, endpoint, p256dh, auth, platform, tz },
  { sb = sbEnv(), env = process.env, fetchImpl = fetch, now = Date.now() } = {},
) {
  try {
    if (!sb) return { ok: false, reason: "unconfigured" };
    const endpointEnc = sealField(endpoint, "endpoint", { env });
    const keysEnc = sealField(JSON.stringify({ p256dh, auth }), "keys", { env });
    if (!endpointEnc || !keysEnc) return { ok: false, reason: "unconfigured" };
    const row = {
      anon_id: anonId,
      endpoint_hash: endpointHash(endpoint),
      endpoint_enc: endpointEnc,
      keys_enc: keysEnc,
      platform: PLATFORMS.includes(platform) ? platform : null,
      tz,
      revoked_at: null,
      updated_at: new Date(now).toISOString(),
    };
    const r = await fetchImpl(`${sb.url}/rest/v1/${T_PUSH}?on_conflict=endpoint_hash`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
      headers: {
        apikey: sb.key, Authorization: `Bearer ${sb.key}`, "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });
    return r.ok ? { ok: true } : { ok: false, reason: "write_failed" };
  } catch (err) {
    console.error("[reengage] push store error");
    return { ok: false, reason: "error" };
  }
}
