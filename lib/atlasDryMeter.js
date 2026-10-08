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
// Per-call increment bound: keep every wf_spend_take increment small (its p_n bound is not
// in the migrations directory, only the sibling wf_spend_refund's 1..10 is).
const MAX_N_PER_CALL = 10;

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
  try {
    const r = await fetchImpl(`${s.url}/rest/v1/wf_spend_ledger?month=eq.${encodeURIComponent(ledgerMonthUtc(now))}&sku=eq.${ATLAS_DRY_CENTS_SKU}&select=used`, {
      headers: { apikey: s.key, Authorization: "Bearer " + s.key }, cache: "no-store",
    });
    if (!r || !r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    if (!rows.length) return 0;
    const used = Number(rows[0] && rows[0].used);
    return Number.isSafeInteger(used) && used >= 0 ? used : null;
  } catch { return null; }
}

/** Add `cents` to the meter (atomic RPC, in small steps). true only if every step was granted. */
export async function recordDryCents(s, cents, fetchImpl = globalThis.fetch) {
  let left = Math.floor(Number(cents));
  if (!Number.isSafeInteger(left) || left < 0) return false;
  try {
    while (left > 0) {
      const n = Math.min(left, MAX_N_PER_CALL);
      const r = await fetchImpl(`${s.url}/rest/v1/rpc/wf_spend_take`, {
        method: "POST", cache: "no-store",
        headers: { "Content-Type": "application/json", apikey: s.key, Authorization: "Bearer " + s.key },
        body: JSON.stringify({ p_sku: ATLAS_DRY_CENTS_SKU, p_cap: COUNTER_CAP, p_n: n }),
      });
      if (!r || !r.ok || (await r.json()) !== true) return false;
      left -= n;
    }
    return true;
  } catch { return false; }
}
