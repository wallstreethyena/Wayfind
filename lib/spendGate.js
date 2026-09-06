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

// details_ids_only: the Essentials IDs-Only SKU (id/photos/name) carries no
// charge; metered anyway so every cron path to Google has a counter in front
// of it (check-promote-spend-gate). 9,500 sits under Essentials' 10,000 line.
// 2026-09-04 — `autocomplete` added after the guard-honesty audit found THREE
// live Places callers with no gate at all (see check-spend-guard's discovery
// rewrite). Autocomplete (New) bills per request and /api/places/autocomplete
// is wired to the home search box, so it fires on typing: the highest-frequency
// ungated path in the app, and the same shape as the $1,878 August bill.
//
// THE NUMBER HERE IS A STOP-LOSS, NOT A VERIFIED FREE TIER. Google does not
// publish the Autocomplete free allowance on the usage-and-billing page, and
// this lane refused to invent one. 10,000 is a FINITE ceiling replacing NO
// ceiling; the owner confirms the real figure in the Google console and sets
// AUTOCOMPLETE_MONTH_CAP. Every other entry here IS a verified free tier ~5%
// under Google's published line.
const CAPS = { text_pro: 4800, details_enterprise: 950, details_pro: 4800, photos: 950, nearby_pro: 4800, details_ids_only: 9500, autocomplete: 10000 };

/** The Autocomplete ceiling actually in force. Owner-settable; finite always. */
export function autocompleteCap() {
  const n = Math.floor(Number(process.env.AUTOCOMPLETE_MONTH_CAP));
  return isFinite(n) && n > 0 ? n : CAPS.autocomplete;
}

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
  return takeFromLedger(sku, CAPS[sku]);
}

// spendAllowCapped — the SAME atomic ledger grant, but ALWAYS metered, in every
// gate mode. For a scheduled job that runs unattended (the promotion drain,
// 12x/hour) "open" must not mean "unbounded": the operator sets a monthly
// ceiling and this is what enforces it.
//
//   shut  -> false, always.
//   free  -> min(cap, Google's free tier for the SKU). The free tier is the
//            hard line; a bigger cap cannot buy past it in free mode.
//   open  -> cap, exactly. A finite number the ledger counts down atomically.
//
// A missing/invalid cap is FAIL-CLOSED (false), never "unlimited": the whole
// point is that no path to Google exists without a number in front of it.
export async function spendAllowCapped(sku, cap) {
  const mode = gateMode();
  if (mode === "shut") return false;
  const n = effectiveCap(sku, cap);
  if (!isFinite(n) || n <= 0) return false; // effectiveCap already fails closed; stated here too so the invariant reads in one place
  return takeFromLedger(sku, n);
}

/**
 * The number the ledger will actually be asked to honour for (sku, cap) in
 * the CURRENT gate mode — or null when the call cannot happen at all.
 * Exported so an operator-facing note can print the ceiling that applied,
 * not the one that was configured. 2026-09-02: the promotion drain sat idle
 * for 23 hours on Vercel (WAYFIND_GATE=free) while every release note read
 * "month_cap 7500 reached" — the ledger stood at 6,426/7,500. The line it
 * had hit was the free-tier 4,800, which this function makes visible.
 */
export function effectiveCap(sku, cap) {
  const mode = gateMode();
  if (mode === "shut") return null;
  const n = Math.floor(Number(cap));
  if (!isFinite(n) || n <= 0) return null;
  const free = CAPS[sku];
  if (mode === "free") return free ? Math.min(n, free) : null;
  return n;
}

async function takeFromLedger(sku, cap) {
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
