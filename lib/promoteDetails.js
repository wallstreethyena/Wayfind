// lib/promoteDetails.js — the ONE Place Details request shape used to promote an
// index place into wf_inventory, shared by app/api/cron/promote-index/route.js
// and scripts/promote-worker.mjs. PURE: no network, no clock, no env.
//
// WHY THIS FILE EXISTS (2026-09-01). Promotion was billing every place at
// Google's Enterprise + Atmosphere tier because the field mask carried
// editorialSummary (Atmosphere) and rating/userRatingCount/priceLevel
// (Enterprise). That tier has a 1,000/month free allowance; the ledger showed
// 333 used on the FIRST day of September with 7,346 places still queued. At
// that tier the backlog costs ~$0.025/place and the free allowance clears
// ~950 places a month — the drain was never going to catch up.
//
// THE FIX is to split the request the way the data already splits:
//
//   CORE (this mask)   what a place NEEDS to become a card: identity (id,
//                      displayName), geography (location), classification
//                      (types, primaryType), the closed-listing gate
//                      (businessStatus), and a photo reference. Highest SKU
//                      in the mask is Pro (displayName, primaryType,
//                      businessStatus); location/types are Essentials and
//                      photos is Essentials IDs-only. Pro: 5,000 free/month
//                      (ledger cap 4,800), $0.017/record over.
//
//   RATING + REVIEWS   already on the index. wf_place_ids.signals carries
//                      {rating, reviews} for every queued place (measured
//                      2026-09-01: 7,346 of 7,346 pending rows). Re-buying it
//                      from Details is what pushed the SKU to Enterprise.
//                      withIndexSignals() below hydrates the Details resource
//                      with those values so buildInventoryRow sees the same
//                      shape it always did.
//
//   ENRICHMENT         priceLevel and editorialSummary are NOT needed for a
//                      card to exist. They are fetched later, on demand, by
//                      lib/placeDetails.js (details_enterprise) when a user
//                      opens the place — and never gate promotion.
//
// scripts/check-promote-spend-gate.mjs locks the mask at Pro tier: adding any
// Enterprise/Atmosphere field here silently multiplies the cost of every
// promoted place and drains a 1,000/month allowance instead of a 5,000 one.
export const CORE_DETAILS_FIELDS = Object.freeze([
  "id", "displayName", "location", "types", "primaryType", "businessStatus", "photos",
]);
export const CORE_DETAILS_MASK = CORE_DETAILS_FIELDS.join(",");

// The ledger SKU every promotion Details call is charged against. Must match
// the tier CORE_DETAILS_MASK bills at — see lib/spendGate.js CAPS.
export const PROMOTE_SKU = "details_pro";

// Fields whose presence in a Details mask raises the SKU above Pro. Kept here
// (not only in the guard) so the guard and any future caller share one list.
export const ABOVE_PRO_FIELDS = Object.freeze([
  "rating", "userRatingCount", "priceLevel", "priceRange", "editorialSummary",
  "reviews", "regularOpeningHours", "currentOpeningHours", "websiteUri",
  "nationalPhoneNumber", "internationalPhoneNumber", "allowsDogs", "servesBeer",
  "servesWine", "outdoorSeating", "reservable", "goodForChildren", "liveMusic",
  "takeout", "delivery", "dineIn", "servesBreakfast", "servesLunch", "servesDinner",
  "paymentOptions", "parkingOptions",
]);

// withIndexSignals — hydrate a CORE Details resource with the rating/reviews the
// index already holds, in the exact property names buildInventoryRow →
// extractPlaceFields reads (p.rating, p.userRatingCount). Never overwrites a
// value Google returned (a caller may still pass the full mask); never invents
// one (a missing/invalid index signal stays absent → rating null, reviews 0,
// which is what extractPlaceFields already produces for a place Google has no
// rating for). Returns a NEW object; the input is not mutated.
export function withIndexSignals(place, signals) {
  if (!place || typeof place !== "object") return place;
  const out = { ...place };
  const s = signals && typeof signals === "object" ? signals : null;
  if (s) {
    if (typeof out.rating !== "number" && typeof s.rating === "number" && isFinite(s.rating)) out.rating = s.rating;
    if (typeof out.userRatingCount !== "number" && typeof s.reviews === "number" && isFinite(s.reviews) && s.reviews >= 0) {
      out.userRatingCount = Math.floor(s.reviews);
    }
  }
  return out;
}

// maskTier — the SKU tier Google bills a Details request at, derived from its
// field mask. Used by the guard; exported so a test can prove the mask.
export function maskTier(mask) {
  const fields = String(mask || "").split(",").map((f) => f.trim()).filter(Boolean);
  if (fields.some((f) => ABOVE_PRO_FIELDS.includes(f))) return "enterprise";
  if (fields.some((f) => ["displayName", "primaryType", "businessStatus", "primaryTypeDisplayName", "googleMapsUri", "utcOffsetMinutes", "accessibilityOptions"].includes(f))) return "pro";
  return "essentials";
}
