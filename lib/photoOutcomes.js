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

// ── WHICH ENVIRONMENT PRODUCED THIS COUNT (2026-09-30) ────────────────────
//
// THE PROBLEM. A Preview deployment and a local `next dev` run against the
// SAME production Supabase and the same key as gowayfind.com, so their photo
// outcomes land in this same table. On 2026-09-29 production served 163
// photos while 134 requests recorded `ledger-denied` against a ceiling with
// 1,213 grants free — and there was no way to tell from this table whether
// those denials were production (a real defect) or a Preview URL being
// correctly refused by spendAllowPhotosNonprodBlocked (nothing at all).
// The same ambiguity made the Sep 24-27 blackout slower to diagnose.
//
// THE FIX, AND WHY IT IS A PREFIX AND NOT A COLUMN. Non-production writes get
// a namespaced class (`preview:ledger-denied`, `dev:ok`). Production keeps its
// bare class names, so every existing reader, alert and guard that sums
// `ledger-denied` is untouched and its history stays comparable — it simply
// stops being polluted. The alternative, an `env` column, needs a migration
// and a primary-key change on a live table, and would leave every historical
// row mislabelled or unknown. The prefix is splittable on ":" whenever a
// column is actually wanted.
//
// The class CHECK is ^[a-z0-9:_-]{1,40}$ and already carries colons
// (`fresh-failed:quota`), so a namespace needs no schema change at all.
export function photoOutcomeEnv() {
  const env = String(process.env.VERCEL_ENV || "").trim().toLowerCase();
  if (env === "production") return "";            // bare names: the series everything already reads
  if (env === "preview") return "preview";
  if (env) return env.replace(/[^a-z0-9_-]/g, "").slice(0, 12) || "other";
  return "dev";                                    // no VERCEL_ENV at all: a laptop
}
/** `cls` as it will be written, namespaced when this is not production. */
export function photoOutcomeClass(cls) {
  const bare = String(cls || "").trim();
  if (!bare) return "";
  const env = photoOutcomeEnv();
  return env ? `${env}:${bare}` : bare;
}

// ── THE CEILING THAT REFUSED (2026-09-30) ─────────────────────────────────
//
// wf_spend_take writes the cap it was given ONLY on a successful grant (the
// UPDATE carries `used + n <= cap`), so during the Sep 24-27 blackout the
// ledger recorded nothing at all about which ceiling was doing the refusing.
// The exact value that broke it is permanently unrecoverable. That is the gap
// this closes: on a denial, record the ceiling that was in force as its own
// low-cardinality class, so a future blackout reads
// `denied-ceiling:950` — and 950 against a five-figure counter names the
// cause on sight.
//
// MEMOISED per (day, env, ceiling) in-process, so a blackout day costs one
// extra write per lambda instance rather than one per denied request. The
// table is one row per distinct ceiling per day either way.
const ceilingSeen = new Set();
export function resetDeniedCeilingMemo() { ceilingSeen.clear(); }
export async function recordPhotoDeniedCeiling(ceiling, now = Date.now()) {
  const n = Number(ceiling);
  // A null/absent ceiling means photos cannot be bought at all (gate shut or
  // unconfigured), which is already its own reason elsewhere; `0` is recorded
  // as `none` rather than silently skipped so the state is still visible.
  const tag = Number.isSafeInteger(n) && n > 0 ? String(n) : "none";
  const day = siteTodayStr(new Date(now));
  const memoKey = `${day}|${photoOutcomeEnv()}|${tag}`;
  if (ceilingSeen.has(memoKey)) return false;
  ceilingSeen.add(memoKey);
  // Bounded: one write, and the same never-throws contract as every other
  // call here. If it fails, the memo has already been set, so a failed
  // telemetry write can never turn into a retry storm on the denial path.
  return recordPhotoOutcome(`denied-ceiling:${tag}`, now);
}

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
    // Namespaced when this is not production (see photoOutcomeClass). The
    // shape check runs on the FINAL string, so a namespace can never push a
    // class past the 40-char CHECK the migration enforces.
    const safeCls = photoOutcomeClass(cls);
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
