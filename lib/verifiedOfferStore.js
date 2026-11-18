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

// Phase 4, cron-only variant of getStaleLiveOffers above. The plain function
// above deliberately swallows every failure into [] -- correct for a
// user-facing degrade-to-no-op dependency, wrong for a scheduled job whose
// entire purpose is that sweep: a swallowed failure there reads as "nothing
// to re-verify" instead of "could not check." This does NOT change
// getStaleLiveOffers's contract (still used nowhere but by callers that want
// the old no-op shape) -- it is a second, additive read path for
// app/api/cron/verify-offers alone, so /api/viator/go and /api/viator/tours
// (which never call either of these) are untouched.
//
// Three outcomes, matching the three terminal states the cron must report:
//   dependencyMissing: true  -- no SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY at
//                               all; the persistence dependency itself is absent.
//   ok: false (dependencyMissing false) -- credentials exist but the read
//                               failed (e.g. verified_offers is not a table
//                               PostgREST knows about -- the migration was
//                               never applied -- or a transient DB error).
//   ok: true                -- the query ran; rows may legitimately be [].
export async function getStaleLiveOffersStatus(limit = 25) {
  const s = sb();
  if (!s) return { dependencyMissing: true, ok: false, rows: [], error: "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set" };
  try {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
    const nowIso = new Date().toISOString();
    const u = `${s.url}/rest/v1/verified_offers?status=eq.live&expires_at=lt.${encodeURIComponent(nowIso)}&select=*&limit=${Math.max(1, Math.min(200, limit))}`;
    const r = await fetch(u, { headers: h, cache: "no-store" });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { dependencyMissing: false, ok: false, rows: [], error: `verified_offers query failed: ${r.status} ${body.slice(0, 200)}` };
    }
    const rows = await r.json();
    return { dependencyMissing: false, ok: true, rows: Array.isArray(rows) ? rows : [], error: null };
  } catch (e) {
    return { dependencyMissing: false, ok: false, rows: [], error: String((e && e.message) || e).slice(0, 200) };
  }
}

// Phase 4: a re-check that no longer clears the bar must be written back as
// suppressed explicitly -- persistOffer only ever upserts a freshly-scored
// offer, it never removes a stale "live" claim on its own.
export async function suppressOffer(placeId, productProvider, productCode) {
  const s = sb();
  if (!s || !productCode) return false;
  try {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "return=representation" };
    const u = `${s.url}/rest/v1/verified_offers?place_id=eq.${encodeURIComponent(placeId)}&product_provider=eq.${encodeURIComponent(productProvider || "viator")}&product_code=eq.${encodeURIComponent(productCode)}&select=place_id,product_provider,product_code`;
    const r = await fetch(u, { method: "PATCH", headers: h, body: JSON.stringify({ status: "suppressed" }), cache: "no-store" });
    if (!r.ok) return false;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length === 1 && rows[0]?.place_id === placeId &&
      rows[0]?.product_provider === (productProvider || "viator") && rows[0]?.product_code === productCode;
  } catch (e) {
    return false;
  }
}

// Upserts a VerifiedOffer (lib/verifiedOffers.js shape) keyed on
// (place_id, product_provider, product_code). Silent no-op without a
// service key or a product_code -- persistence is observability/fan-out
// input, never a rendering dependency, so it must never block a response.
function notStored(reason) {
  console.warn(JSON.stringify({ tag: "verified_offer_write", outcome: "not_stored", reason }));
  return false;
}

function venueNameKey(name) {
  return typeof name === "string" ? name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase() : "";
}

// Only the exact inventory key and its matching venue name are evidence. Do not infer it from a city,
// search string, venue alias, or product title. Share lookups only within
// one request, including concurrent writes for the same place.
async function canonicalPlace(s, id) {
  const url = new URL(s.url + "/rest/v1/wf_inventory");
  url.search = new URLSearchParams({ place_id: "eq." + id, select: "place_id,name", limit: "1" });
  const r = await fetch(url, { headers: { apikey: s.key, Authorization: `Bearer ${s.key}` }, cache: "no-store", signal: AbortSignal.timeout(3000) });
  if (!r.ok) return { reason: "lookup_failed" };
  const row = (await r.json())?.[0];
  return row?.place_id === id ? { name: row.name } : { reason: "unmapped_place" };
}

export async function persistOffer(offer, placeLookups = new Map()) {
  if (!offer || !offer.productCode) return false;
  const id = offer.placeId;
  if (typeof id !== "string" || !id.trim() || id.startsWith("q:")) return notStored("unmapped_place");
  const s = sb();
  if (!s) return false;
  try {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" };
    if (!placeLookups.has(id)) placeLookups.set(id, canonicalPlace(s, id));
    const place = await placeLookups.get(id);
    if (place.reason) return notStored(place.reason);
    const name = venueNameKey(place.name);
    if (!name || name !== venueNameKey(offer.placeName)) return notStored("venue_name_mismatch");
    const row = {
      place_id: offer.placeId,
      place_name: place.name,
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
    return r.ok || notStored("write_rejected");
  } catch (e) {
    return notStored("request_failed");
  }
}
