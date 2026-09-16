// lib/photoOutcomes.js — WHY every photo-serve attempt ended the way it did,
// counted (2026-09-16).
//
// September's photos ledger read 1,170 counted this month while Google's own
// console showed a manual daily override of 32 (real usage 34/32, 100%+) —
// the ledger recorded every ATTEMPT, but nothing recorded which of them
// Google actually refused, or why. recordPhotoOutcome is the fire-and-forget
// write half of that visibility: one row per (day, class) in
// public.wf_photo_outcome_daily, bumped +1 by the RPC
// public.wf_photo_outcome_bump (supabase/migrations/
// 20260916120000_wf_spend_refund_and_photo_outcomes.sql).
//
// FAIL-SOFT, ALWAYS. A telemetry write must never be why a photo response is
// slow or fails: bounded to a 400ms timeout, and this function NEVER throws —
// every failure (missing config, unreachable ledger, migration not yet
// applied so the RPC 404s) resolves to `false` and changes nothing else
// about the response already computed. Callers (app/api/photo/route.js) fire
// this AFTER the response's outcome is already decided, never gating on it.
//
// `day` is the VENUE-local (America/New_York) calendar day — lib/siteTime.js
// siteTodayStr, the SAME "today" every other date cutoff in this app uses.
// This is deliberately NOT Google's Pacific quota-reset clock (see
// lib/placePhotoServe.js msUntilNextPacificMidnight for that one) — this
// table answers "how many of today's Wayfind reads ended in each class", an
// operator/owner-facing question anchored to the venue's own day, not
// Google's billing clock.
import { siteTodayStr } from "./siteTime.js";

const CLASS_RX = /^[a-z0-9:_-]{1,40}$/;
const TIMEOUT_MS = 400;

function cfg() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

/**
 * Bump today's (venue-local) count for `cls` by one. Never throws; returns
 * true only on a confirmed successful write. `cls` must match
 * ^[a-z0-9:_-]{1,40}$ (the same shape the migration's CHECK constraint
 * enforces) or this is a same-process no-op — never a message, ref, key, or
 * URL, only a short class tag.
 */
export async function recordPhotoOutcome(cls, now = Date.now()) {
  try {
    const safeCls = String(cls || "").trim();
    if (!CLASS_RX.test(safeCls)) return false;
    const s = cfg();
    if (!s) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(s.url + "/rest/v1/rpc/wf_photo_outcome_bump", {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: s.key, Authorization: "Bearer " + s.key },
        body: JSON.stringify({ p_day: siteTodayStr(new Date(now)), p_class: safeCls }),
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      return r.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // Belt-and-suspenders: recordPhotoOutcome must NEVER throw into a caller
    // that awaits it inline in a response path.
    return false;
  }
}
