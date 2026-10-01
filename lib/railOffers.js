// lib/railOffers.js — "which Viator products is IntentPartnerPick already showing".
//
// WHY. On /things-to-do/<city> and /beaches/<city> the same Viator product could
// render twice: once in IntentPartnerPick ("Bookable highlights", surface
// intent_partner_rail) and again in TourStrip ("Book an experience", surface
// tour_strip). Measured 2026-09-30 on live SSR HTML: same provider, same product
// code, same title/score/price, and the SAME resolved partner URL (both go links
// resolve the wf_experiences row through PROVIDERS.viator.track, which ignores the
// surface sub-id), so the pair differs only by our own surface/content params.
// One offer, one slot per page experience: the rail (higher placement, up to 30
// cards) owns it and the strip steps aside.
//
// Pure module, no React, safe on server and client. Two channels feed the same
// exclusion so hydration cannot reintroduce a duplicate:
//   - SERVER: railViatorCodes() predicts the rail's set from the same seed.
//   - CLIENT: the rail publishes what it ACTUALLY rendered; the strip subscribes.
export const RAIL_OFFERS_EVENT = "wf:rail-offers";

export function normalizeCodes(codes) {
  const out = new Set();
  for (const c of (codes && typeof codes[Symbol.iterator] === "function" ? codes : [])) {
    const v = String(c == null ? "" : c).trim();
    if (v) out.add(v);
  }
  return out;
}

/** Publish the viator product codes the rail rendered (client only; no-op on the server). */
export function publishRailOffers(codes, target = typeof window !== "undefined" ? window : null) {
  if (!target) return;
  const set = normalizeCodes(codes);
  try { target.__wfRailOffers = set; } catch {}
  try { target.dispatchEvent(new CustomEvent(RAIL_OFFERS_EVENT, { detail: { codes: [...set] } })); } catch {}
}

export function readRailOffers(target = typeof window !== "undefined" ? window : null) {
  try { return target && target.__wfRailOffers instanceof Set ? target.__wfRailOffers : new Set(); } catch { return new Set(); }
}

/** Subscribe to rail publications; returns an unsubscribe. */
export function subscribeRailOffers(cb, target = typeof window !== "undefined" ? window : null) {
  if (!target || typeof target.addEventListener !== "function") return () => {};
  const h = (e) => cb(normalizeCodes(e && e.detail && e.detail.codes));
  target.addEventListener(RAIL_OFFERS_EVENT, h);
  return () => target.removeEventListener(RAIL_OFFERS_EVENT, h);
}
