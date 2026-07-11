// Booking-CTA integrity, Phase 1/2 -- server-only persistence for
// VerifiedOffer rows (supabase/verified-offers.sql). Same raw-REST +
// service-role pattern as app/api/signals/likes/route.js; no supabase-js
// client is used server-side in this codebase. Every function here
// degrades to a no-op/empty result if the service key is absent, so a
// missing env var can never crash a request -- it just means fan-out
// scoring runs blind (treated as fanout=1, see lib/bookingResolver.js) and
// nothing gets persisted, exactly like every other optional dependency in
// this repo's API routes.
export function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

// Distinct place count a given product has already matched -- the raw
// input to the resolver's specificity signal. Returns 1 (neutral, not a
// penalty) when the store is unreachable or the product is new.
export async function getFanoutCount(productProvider, productCode) {
  if (!productCode) return 1;
  const s = sb();
  if (!s) return 1;
  try {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
    const u = `${s.url}/rest/v1/verified_offers?product_provider=eq.${encodeURIComponent(productProvider || "viator")}&product_code=eq.${encodeURIComponent(productCode)}&select=place_id&limit=2000`;
    const r = await fetch(u, { headers: h, cache: "no-store" });
    if (!r.ok) return 1;
    const rows = await r.json();
    const distinct = new Set((Array.isArray(rows) ? rows : []).map((x) => x.place_id).filter(Boolean));
    return Math.max(1, distinct.size);
  } catch (e) {
    return 1;
  }
}

// Phase 4: rows the self-healing cron should re-check -- previously LIVE,
// past their expiry. Returns [] (never throws) if the store is unreachable,
// so a cron run with a broken key just does nothing rather than crashing.
export async function getStaleLiveOffers(limit = 25) {
  const s = sb();
  if (!s) return [];
  try {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
    const nowIso = new Date().toISOString();
    const u = `${s.url}/rest/v1/verified_offers?status=eq.live&expires_at=lt.${encodeURIComponent(nowIso)}&select=*&limit=${Math.max(1, Math.min(200, limit))}`;
    const r = await fetch(u, { headers: h, cache: "no-store" });
    if (!r.ok) return [];
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  } catch (e) {
    return [];
  }
}

// Phase 4: a re-check that no longer clears the bar must be written back as
// suppressed explicitly -- persistOffer only ever upserts a freshly-scored
// offer, it never removes a stale "live" claim on its own.
export async function suppressOffer(placeId, productProvider, productCode) {
  const s = sb();
  if (!s || !productCode) return false;
  try {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "return=minimal" };
    const u = `${s.url}/rest/v1/verified_offers?place_id=eq.${encodeURIComponent(placeId)}&product_provider=eq.${encodeURIComponent(productProvider || "viator")}&product_code=eq.${encodeURIComponent(productCode)}`;
    const r = await fetch(u, { method: "PATCH", headers: h, body: JSON.stringify({ status: "suppressed" }), cache: "no-store" });
    return r.ok;
  } catch (e) {
    return false;
  }
}

// Upserts a VerifiedOffer (lib/verifiedOffers.js shape) keyed on
// (place_id, product_provider, product_code). Silent no-op without a
// service key or a product_code -- persistence is observability/fan-out
// input, never a rendering dependency, so it must never block a response.
export async function persistOffer(offer) {
  if (!offer || !offer.productCode) return false;
  const s = sb();
  if (!s) return false;
  try {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
    const row = {
      place_id: offer.placeId,
      place_name: offer.placeName || null,
      region: offer.region || null,
      kind: offer.kind || null,
      product_provider: offer.productProvider || "viator",
      product_code: offer.productCode,
      product_url: offer.productUrl,
      commissionable: !!offer.commissionable,
      bookable_now: !!offer.bookableNow,
      confidence: offer.confidence,
      evidence: offer.evidence || {},
      status: offer.status,
      verified_at: offer.verifiedAt,
      expires_at: offer.expiresAt || null,
    };
    const r = await fetch(`${s.url}/rest/v1/verified_offers?on_conflict=place_id,product_provider,product_code`, {
      method: "POST",
      headers: h,
      body: JSON.stringify(row),
      cache: "no-store",
    });
    return r.ok;
  } catch (e) {
    return false;
  }
}
