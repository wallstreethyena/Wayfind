// lib/spendGate.js - the ONE switch + ledger for ALL metered Google Places spend.
//
// WAYFIND_GATE values (Vercel env, flip without code changes):
//   "shut" - ZERO paid Google calls anywhere. Cache / owned inventory / fallback art.
//   "free" - paid calls allowed ONLY inside Google's monthly free tier, enforced by
//            an atomic Supabase counter (wf_spend_take). FAIL-CLOSED: if the ledger
//            is unreachable or says no, the call does not happen.
//   unset/other - "open": normal behavior. Console quota caps still apply.
//
// Free-tier budgets (March-2025 pricing, verified against Google's pricing page
// 2026-08-25; caps sit ~5% under Google's line so drift can never bill):
//   text_pro 4800/5000 - details_enterprise 950/1000 - details_pro 4800/5000
//   photos 950/1000 - nearby_pro 4800/5000
// The ledger lives in public.wf_spend_ledger, one row per (month, sku).
// August 2026 seeded with what was already consumed (photos marked exhausted).
export function gateMode() {
  const v = String(process.env.WAYFIND_GATE || "").trim().toLowerCase();
  return v === "shut" ? "shut" : v === "free" ? "free" : "open";
}
export function gateShut() { return gateMode() === "shut"; }
export function gateFree() { return gateMode() === "free"; }

const CAPS = { text_pro: 4800, details_enterprise: 950, details_pro: 4800, photos: 950, nearby_pro: 4800 };

function cfg() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

// May a paid call of this SKU family happen right now?
// open -> yes. shut -> no. free -> one atomic ledger grant, fail-closed.
export async function spendAllow(sku) {
  const mode = gateMode();
  if (mode === "shut") return false;
  if (mode === "open") return true;
  const cap = CAPS[sku];
  if (!cap) return false;
  const s = cfg();
  if (!s) return false;
  try {
    const r = await fetch(s.url + "/rest/v1/rpc/wf_spend_take", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: s.key, Authorization: "Bearer " + s.key },
      body: JSON.stringify({ p_sku: sku, p_cap: cap }),
      cache: "no-store",
    });
    if (!r.ok) return false;
    return (await r.json()) === true;
  } catch { return false; }
}
