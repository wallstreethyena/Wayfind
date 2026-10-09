// lib/atlasDryMeter.js - the PERSISTENT dollar meter for Atlas dry samples.
//
// atlas-build has maxDuration 60, so a dry sample runs ONE place per request, many
// requests in a row. The dollar ceiling must therefore be a TOTAL across requests, kept in
// the existing spend ledger (public.wf_spend_ledger, one row per UTC month and sku), not in
// process memory. Unit: whole cents (ceil'd, so the meter never under-counts).
//
// RESERVE BEFORE SEND, THEN RECONCILE. The old design (read used, compare, send, record)
// was not safe under concurrent requests: two requests could both read the same `used`,
// both pass the check and jointly overshoot the cap. Now, before any paid call:
//   1. reserveDryCents: ONE wf_spend_take(p_sku, p_cap = cap, p_n = worst-case cents).
//      wf_spend_take is a single conditional UPDATE (used = used + n WHERE used + n <= cap),
//      row-locked, so concurrent callers serialize and can never jointly exceed the cap.
//      Granted -> the worst case is already paid for on the ledger; denied -> spend nothing.
//   2. After the call, refundDryCents gives back (reserved - actual). A refund that fails
//      leaves the ledger OVER-counted, which is the safe direction (the cap only gets
//      tighter, never looser).
// Everything here FAILS CLOSED: a reservation whose outcome is unknown returns null and the
// route then spends nothing.
export const ATLAS_DRY_CENTS_SKU = "atlas_dry_cents";
// wf_spend_refund(p_sku, p_n) rejects p_n < 1 or > 10 (verified live 2026-10-08).
export const DRY_REFUND_CHUNK_CENTS = 10;
//
// TIME BUDGET (atlas-build maxDuration = 60s), dry worst case, every step at its timeout:
//   reserve 3s + search-sku grant 3s + [paidAi grant + Anthropic, one 35s timer]
//   + refund 3s (ONE timer for all chunks) + Census geocode 3s = 47s, leaving 13s for the
//   response. A step that times out ends the run earlier, so this is the upper bound.
export const DRY_IO_TIMEOUT_MS = 3000;
export const DRY_ANTHROPIC_TIMEOUT_MS = 35000;

/** UTC YYYY-MM, the same key wf_spend_take / photoRepair.ledgerMonth() use. */
export function ledgerMonthUtc(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Whole cents, rounded UP (epsilon absorbs float noise like 0.3*100 = 30.000000000000004). */
export function usdToCents(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.ceil(n * 100 - 1e-6));
}

const rpcInit = (s, signal, body) => ({
  method: "POST", cache: "no-store", signal,
  headers: { "Content-Type": "application/json", apikey: s.key, Authorization: "Bearer " + s.key },
  body: JSON.stringify(body),
});

/**
 * Atomically reserve `n` cents against `capCents` for this month: ONE wf_spend_take call.
 * true = granted (the cents are on the ledger now), false = denied (the budget cannot cover
 * n), null = transport / parse failure or bad input (outcome unknown: caller fails closed).
 */
export async function reserveDryCents(s, capCents, n, fetchImpl = globalThis.fetch) {
  if (!Number.isSafeInteger(n) || n <= 0 || !Number.isSafeInteger(capCents) || capCents <= 0) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DRY_IO_TIMEOUT_MS);
  try {
    const r = await fetchImpl(`${s.url}/rest/v1/rpc/wf_spend_take`, rpcInit(s, ctrl.signal, { p_sku: ATLAS_DRY_CENTS_SKU, p_cap: capCents, p_n: n }));
    if (!r || !r.ok) return null;
    const v = await r.json();
    return v === true ? true : v === false ? false : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/**
 * Give back `n` cents via wf_spend_refund, in chunks of <= 10 (the RPC's limit), one shared
 * DRY_IO_TIMEOUT_MS timer for the whole sequence. Stops at the first chunk that fails and
 * returns the cents actually refunded. A short refund leaves the ledger OVER-counted, which
 * is safe: it can only make the cap stricter.
 */
export async function refundDryCents(s, n, fetchImpl = globalThis.fetch) {
  if (!Number.isSafeInteger(n) || n <= 0) return 0;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DRY_IO_TIMEOUT_MS);
  let done = 0;
  try {
    while (done < n) {
      const chunk = Math.min(DRY_REFUND_CHUNK_CENTS, n - done);
      const r = await fetchImpl(`${s.url}/rest/v1/rpc/wf_spend_refund`, rpcInit(s, ctrl.signal, { p_sku: ATLAS_DRY_CENTS_SKU, p_n: chunk }));
      if (!r || !r.ok || (await r.json()) !== true) break;
      done += chunk;
    }
  } catch { /* stop: the remainder stays reserved (over-count, safe) */ } finally { clearTimeout(timer); }
  return done;
}
