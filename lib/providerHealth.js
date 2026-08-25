// lib/providerHealth.js — classify AI-provider failures and hold a circuit
// breaker, so a billing outage costs ONE failed call instead of 579.
//
// THE INCIDENT THIS ANSWERS. Between 2026-08-14 and 2026-08-22 atlas-build
// called Anthropic 579 times and every call returned the same status 400:
// "Your credit balance is too low." A billing failure is DETERMINISTIC — the
// 2nd through 579th calls could never have succeeded, and each one burned a
// Places Details call and an official-page fetch to feed a model that was
// never going to answer. wf_job_pulse noticed only as a generic dead-run
// streak; nothing distinguished "provider is refusing payment" (fix: a human
// adds credits — no retry helps) from "model had a bad hour" (retrying is
// correct).
//
// Two pieces, both fail-soft:
//   classifyProviderFailure(status, msg)  — pure; names the failure class.
//   breaker helpers                       — persist "provider is down for a
//     deterministic reason" in the shared server cache so EVERY warm instance
//     and EVERY subsequent cron run skips the provider until the cooldown
//     passes, instead of rediscovering the same 400 at full batch cost.
//
// The pulse-note contract: a run halted by the breaker records a note starting
// "billing:" — lib/jobPulse.classifyHealth escalates that prefix to an
// incident after ONE dead run (billing cannot be a transient blip), where
// generic failures still wait for DEAD_RUN_THRESHOLD.

import { cget, cset } from "./serverCache.js";

// A deterministic, human-actionable refusal — retrying cannot help.
//   billing — out of credits / payment required. Human adds money.
//   quota   — hard plan/usage quota exhausted (NOT a transient 429 rate limit;
//             plain rate limits stay retryable and never trip the breaker).
export function classifyProviderFailure(status, msg) {
  const m = String(msg || "").toLowerCase();
  if (status === 402) return "billing";
  if (status === 400 && /credit balance|billing|purchase credits|payment/i.test(m)) return "billing";
  if (status === 403 && /billing|payment|suspended/.test(m)) return "billing";
  if (status === 429 && /quota|monthly usage|usage limit/.test(m)) return "quota";
  return null;
}

// How long a tripped breaker holds. Long enough that an hourly cron does not
// re-spend a whole batch on a dead provider; short enough that a top-up is
// picked up within the hour without a deploy.
export const BREAKER_COOLDOWN_MS = 30 * 60 * 1000;

const key = (provider) => "provider-breaker|v1|" + provider;

/**
 * Is the breaker open for this provider? Returns { reason, kind } when open,
 * null when closed (or when the cache is unreachable — fail OPEN toward doing
 * work: a broken cache must never stop a healthy pipeline).
 */
export async function breakerOpen(provider) {
  try {
    const hit = await cget(key(provider));
    if (hit && hit.v && typeof hit.v === "object" && hit.v.kind) return hit.v;
    return null;
  } catch (e) {
    return null;
  }
}

/** Trip the breaker. Fail-soft: a cache write failure only loses the optimization. */
export async function tripBreaker(provider, kind, reason, cooldownMs = BREAKER_COOLDOWN_MS) {
  try {
    await cset(key(provider), { kind, reason: String(reason || "").slice(0, 200), at: new Date().toISOString() }, cooldownMs);
    return true;
  } catch (e) {
    return false;
  }
}
