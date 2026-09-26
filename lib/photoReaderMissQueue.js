// lib/photoReaderMissQueue.js — reader-visible photo misses feed the existing
// free repair lane instead of disappearing as one-off 404s.
//
// This never calls Google and never changes a spend ceiling. It only records
// the exact place that a REAL reader just failed to see. The existing repair
// worker decides later whether same-place cache or a free licensed photo can
// recover it. Probe traffic is excluded because photo-monitor already owns
// sampled probe queueing and its cold-cache rules.
import { mergeQueueUpsert } from "./photoCoverage.js";

const PLACE_ID_RX = /^[A-Za-z0-9_-]{10,}$/;
const PHOTO_REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

export function readerPhotoMissCandidate({ placeId, currentRef, result, probe = false } = {}) {
  if (probe || !PLACE_ID_RX.test(String(placeId || "")) || !result) return null;
  const reason = String(result.reason || "");
  let failureReason = null;

  if (result.type === "empty" && reason === "no-photo") failureReason = "no-source";
  else if (result.type === "miss" && reason === "owned-miss") failureReason = "owned-miss";
  else if (result.type === "miss" && ["spend-denied", "quota-open", "negative-cached"].includes(reason)) {
    failureReason = "source-unavailable";
  }

  // gate-shut and unconfigured are global outages, not place defects.
  // probe-no-spend is monitor-owned and cannot occur for a real reader.
  if (!failureReason) return null;
  return {
    placeId: String(placeId),
    currentRef: PHOTO_REF_RX.test(String(currentRef || "")) ? String(currentRef) : null,
    failureReason,
  };
}

function supabaseEnv(env) {
  const raw = String(env?.SUPABASE_URL || env?.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!raw || !key) return null;
  const url = /^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw;
  return { url, key };
}

export async function recordReaderPhotoMiss(input, deps = {}) {
  const candidate = readerPhotoMissCandidate(input);
  if (!candidate) return false;

  const s = supabaseEnv(deps.env || process.env);
  if (!s) return false;
  const fetchImpl = deps.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return false;

  const timeoutMs = Math.max(50, Number(deps.timeoutMs) || 450);
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const headers = { apikey: s.key, Authorization: "Bearer " + s.key };

  try {
    const id = encodeURIComponent(candidate.placeId);
    const existingResponse = await fetchImpl(
      `${s.url}/rest/v1/wf_photo_repair_queue?place_id=eq.${id}&select=place_id,status,detections`,
      { headers, cache: "no-store", ...(controller ? { signal: controller.signal } : {}) }
    );
    if (!existingResponse?.ok) return false;
    const existing = await existingResponse.json();
    const body = mergeQueueUpsert(existing, [candidate], deps.nowIso || new Date().toISOString());
    if (!body.length) return false;

    const writeResponse = await fetchImpl(`${s.url}/rest/v1/wf_photo_repair_queue`, {
      method: "POST",
      cache: "no-store",
      headers: {
        ...headers,
        "content-type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
      ...(controller ? { signal: controller.signal } : {}),
    });
    return !!writeResponse?.ok;
  } catch {
    // A repair breadcrumb is best-effort. Never turn a missing photo into a
    // broken page because the queue itself is unavailable.
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
