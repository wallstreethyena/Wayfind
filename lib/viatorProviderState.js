// lib/viatorProviderState.js — NON-SECRET reason classes for an empty
// `/api/viator/tours` response. Boolean/presence-style only: never a key
// value, never a cap number, never a ledger balance.
//
// Why this exists: the route used to collapse no_key / no_cap / gate_shut /
// ledger_denied / upstream_error / zero_candidates / integrity_rejected into
// the same `{items:[]}`, so an empty Family rail could not tell "spend gate"
// from "no products in this market".

export const VIATOR_PROVIDER_STATES = Object.freeze([
  "no_key",
  "no_cap",
  "gate_shut",
  "ledger_denied",
  "upstream_error",
  "zero_candidates",
  "integrity_rejected",
  "success",
]);

const STATE_SET = new Set(VIATOR_PROVIDER_STATES);

export function isViatorProviderState(value) {
  return STATE_SET.has(value);
}

/** Outcome AFTER a spend grant and an upstream search body. */
export function viatorSearchOutcomeState({ candidateCount = 0, verifiedCount = 0 } = {}) {
  if (!(Number(candidateCount) > 0)) return "zero_candidates";
  if (!(Number(verifiedCount) > 0)) return "integrity_rejected";
  return "success";
}

export function viatorProviderLog(provider_state, item_count) {
  return {
    tag: "viator_provider_state",
    provider_state,
    item_count: Number.isFinite(item_count) ? item_count : 0,
  };
}
