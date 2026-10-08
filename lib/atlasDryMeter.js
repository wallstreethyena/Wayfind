// lib/atlasDryMeter.js - the PERSISTENT dollar meter for Atlas dry samples.
//
// atlas-build has maxDuration 60, so a dry sample runs ONE place per request, many
// requests in a row. The dollar ceiling must therefore be a TOTAL across requests, kept in
// the existing spend ledger (public.wf_spend_ledger, one row per UTC month and sku), not in
// process memory. Unit: whole cents (ceil'd, so the meter never under-counts).
//
// Read before a place, record after it. Everything here FAILS CLOSED: a read that cannot be
// trusted returns null (the route then spends nothing); a record that cannot be confirmed
// returns false (the route then stops and says meter_record_failed).
export const ATLAS_DRY_CENTS_SKU = "atlas_dry_cents";
export const DRY_RESERVE_FLOOR_CENTS = 40; // worst-case place: up to 3 searches + 3x8k fetched pages re-read across server-tool passes + 2k output
// Effectively unlimited: this row is a counter, the dollar cap is enforced by the caller
// before each place. (wf_spend_take returns false only if used + n would pass this.)
const COUNTER_CAP = 1000000;
// wf_spend_take(p_sku text, p_cap int, p_n int default 1) has no bound on p_n (verified live
// 2026-10-08), so a place's cents are recorded in ONE atomic call.
//
// TIME BUDGET (atlas-build maxDuration = 60s), dry worst case, every step at its timeout:
//   ledger read 3s + search-sku grant 3s + [paidAi grant + Anthropic, one 35s timer]
//   + meter record 3s + Census geocode 3s = 47s, leaving 13s for the response. A step that
//   times out ends the run earlier (read/record fail closed), so this is the upper bound.
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

/** What the next place may cost at worst: max(floor, highest per-place cents seen this request). */
export function reserveCents(seenCents) {
  return Math.max(DRY_RESERVE_FLOOR_CENTS, ...(seenCents || []));
}

/** Month's used cents for the dry meter. Missing row = 0. Anything unreadable = null (fail closed). */
export async function readDryUsedCents(s, fetchImpl = globalThis.fetch, now = new Date()) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DRY_IO_TIMEOUT_MS);
  try {
    const r = await fetchImpl(`${s.url}/rest/v1/wf_spend_ledger?month=eq.${encodeURIComponent(ledgerMonthUtc(now))}&sku=eq.${ATLAS_DRY_CENTS_SKU}&select=used`, {
      headers: { apikey: s.key, Authorization: "Bearer " + s.key }, cache: "no-store", signal: ctrl.signal,
    });
    if (!r || !r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    if (!rows.length) return 0;
    const used = Number(rows[0] && rows[0].used);
    return Number.isSafeInteger(used) && used >= 0 ? used : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Add `cents` to the meter in ONE atomic RPC (p_n = cents). true only if granted. 0 cents = nothing to record. */
export async function recordDryCents(s, cents, fetchImpl = globalThis.fetch) {
  const n = Math.floor(Number(cents));
  if (!Number.isSafeInteger(n) || n < 0) return false;
  if (n === 0) return true;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DRY_IO_TIMEOUT_MS);
  try {
    const r = await fetchImpl(`${s.url}/rest/v1/rpc/wf_spend_take`, {
      method: "POST", cache: "no-store", signal: ctrl.signal,
      headers: { "Content-Type": "application/json", apikey: s.key, Authorization: "Bearer " + s.key },
      body: JSON.stringify({ p_sku: ATLAS_DRY_CENTS_SKU, p_cap: COUNTER_CAP, p_n: n }),
    });
    return !!(r && r.ok && (await r.json()) === true);
  } catch { return false; } finally { clearTimeout(timer); }
}
