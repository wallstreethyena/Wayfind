// Finite spend controls for non-Google, non-event providers reachable from
// customer routes. A configured credential is never an unlimited budget.
//
// Each provider needs its own explicit, positive safe-integer monthly cap.
// `WAYFIND_GATE=shut`, a malformed cap, or a ledger failure all deny the
// request. An absent cap also denies, except Viator: an empty VIATOR_MONTH_CAP
// falls back to VIATOR_MONTH_CAP_FALLBACK. A set env value replaces that
// fallback, so production keeps its current VIATOR_MONTH_CAP until that var
// is changed. Call `providerSpendAllow()` immediately before the provider
// fetch, after any cache lookup, so a cache hit never consumes budget.
import { gateMode, takeFromLedger } from "./spendGate.js";

// Approved monthly ceiling when VIATOR_MONTH_CAP is absent or empty.
// A configured env var still wins over this number.
export const VIATOR_MONTH_CAP_FALLBACK = 3000;

const PROVIDERS = Object.freeze({
  viator: { env: "VIATOR_MONTH_CAP", sku: "provider_viator", fallback: VIATOR_MONTH_CAP_FALLBACK },
  foursquare: { env: "FOURSQUARE_MONTH_CAP", sku: "provider_foursquare" },
  tripadvisor: { env: "TRIPADVISOR_MONTH_CAP", sku: "provider_tripadvisor" },
  youtube: { env: "YOUTUBE_MONTH_CAP", sku: "provider_youtube" },
  pexels: { env: "PEXELS_MONTH_CAP", sku: "provider_pexels" },
});

export function providerMonthlyCap(provider, env = process.env) {
  const entry = PROVIDERS[provider];
  if (!entry) return null;
  const raw = String(env && env[entry.env] || "").trim();
  if (raw) {
    if (!/^[1-9]\d*$/.test(raw)) return null;
    const cap = Number(raw);
    return Number.isSafeInteger(cap) ? cap : null;
  }
  const fallback = entry.fallback;
  return Number.isSafeInteger(fallback) && fallback > 0 ? fallback : null;
}

// `deps.take` is test-only dependency injection. Production callers use the
// atomic Supabase ledger exported by spendGate.
//
// `providerSpendDecision` names the deny class without exposing cap numbers
// or ledger balances: no_cap | gate_shut | ledger_denied | (allow:true).
// `providerSpendAllow` stays a boolean wrapper so existing callers are unchanged.
export async function providerSpendDecision(provider, deps = {}) {
  const entry = PROVIDERS[provider];
  const cap = providerMonthlyCap(provider, deps.env || process.env);
  if (!entry || !cap) return { allow: false, reason: "no_cap" };
  if (gateMode() === "shut") return { allow: false, reason: "gate_shut" };
  try {
    const ok = (await (deps.take || takeFromLedger)(entry.sku, cap)) === true;
    return ok ? { allow: true, reason: "granted" } : { allow: false, reason: "ledger_denied" };
  } catch {
    return { allow: false, reason: "ledger_denied" };
  }
}

export async function providerSpendAllow(provider, deps = {}) {
  return (await providerSpendDecision(provider, deps)).allow;
}
