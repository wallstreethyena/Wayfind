// lib/plannerEntitlement.js — Clean entitlement boundary for Wayfind Planner.
//
// Future subscription readiness: AI trip generation and conversational trip
// optimization sit behind `ai_itinerary_planner` so App Store / web subscription
// gating can be turned on later without changing a single line of the manual
// itinerary store (`lib/trips.js`, `lib/tripDays.js`, `lib/itinerarySync.js`)
// or `ItineraryScreen`.
//
// Today: the capability is 100% free (`paywallActive: false`, `allowed: true`),
// and manual itinerary functionality is permanently free (`manualItineraryFree: true`).

export const PLANNER_ENTITLEMENT = "ai_itinerary_planner";

export function checkPlannerEntitlement(user = null, opts = {}) {
  const paywallActive = opts && opts.paywallActive === true;
  if (!paywallActive) {
    return {
      allowed: true,
      entitlement: PLANNER_ENTITLEMENT,
      tier: user && user.id ? "member_free" : "guest_free",
      paywallActive: false,
      manualItineraryFree: true,
      reason: null,
    };
  }
  const entitlements = Array.isArray(user && user.entitlements)
    ? user.entitlements
    : Array.isArray(opts && opts.entitlements)
    ? opts.entitlements
    : [];
  const hasEntitlement = entitlements.includes(PLANNER_ENTITLEMENT);
  return {
    allowed: hasEntitlement,
    entitlement: PLANNER_ENTITLEMENT,
    tier: hasEntitlement ? "subscriber" : (user && user.id ? "member_free" : "guest_free"),
    paywallActive: true,
    manualItineraryFree: true,
    reason: hasEntitlement ? null : "subscription_required",
  };
}

export function canUseManualItinerary() {
  return true;
}
