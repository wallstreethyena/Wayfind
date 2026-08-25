// Booking-CTA integrity, Phase 1 (see BOOKING_INTEGRITY_DIAGNOSIS.md). The
// hard invariant: a VerifiedOffer may only be "live" (i.e. eligible to
// render a booking CTA anywhere in the app) when every one of these holds.
// This is the ONE place that decides live-eligibility — the resolver
// (lib/bookingResolver.js) scores candidates, but never decides "live" on
// its own; callers must always pass through isLiveEligible/buildVerifiedOffer.
import { isDeniedViatorSku, isViatorSearchOrHomeUrl } from "./viatorIntegrity.js";
export const CONFIDENCE_THRESHOLD = 0.72;
// Below this, a candidate has essentially no place-specific name evidence —
// category/specificity/geo alone can never make up for that. This is what
// makes "no proof -> no button" a hard floor instead of a soft weight.
export const ENTITY_FLOOR = 0.4;

export const STATUS = { LIVE: "live", SUPPRESSED: "suppressed" };

// Phase 4: how long a "live" verification is trusted before the
// self-healing cron re-checks it. A product can sell out or get delisted
// on Viator's side without Wayfind ever hearing about it directly.
export const REVERIFY_TTL_MS = 7 * 24 * 3600 * 1000;

export function isLiveEligible(offer) {
  if (!offer) return false;
  const { commissionable, bookableNow, confidence, evidence } = offer;
  // HOLD denylist is CODE. A later pin or a perfect score cannot revive
  // 236862P2 (Italy hop) or 22211P1 (unavailable H1).
  if (isDeniedViatorSku(offer.productCode || offer.productUrl)) return false;
  if (isViatorSearchOrHomeUrl(offer.productUrl)) return false;
  if (!commissionable || !bookableNow) return false;
  if (typeof confidence !== "number" || !(confidence >= CONFIDENCE_THRESHOLD)) return false;
  if (!evidence || typeof evidence.entityMatch !== "number" || !(evidence.entityMatch >= ENTITY_FLOOR)) return false;
  // v2 (booking-integrity): POSITIVE geography is a HARD gate. The product must name
  // the place's own region (evidence.geoConfirmed === true) or it cannot be live. A
  // missing region yields geoConfirmed=false and fails CLOSED — no guess. This is the
  // fix for the wrong-place redirects (Dalí->Barcelona, Ringling->Houston): the old
  // protection was a Florida-only blacklist, so any non-FL destination passed.
  if (evidence.geoConfirmed !== true) return false;
  // v5.83 (B2 region gate): a product whose title names a foreign destination
  // absent from the place's region is a cross-region leak (a generic geographic
  // token like "key" bought it false entity credit). Hard-reject regardless of
  // score — same class of floor as the entity evidence above.
  if (evidence.geoMismatch === true) return false;
  // Live-page inspect, when present, is a HARD gate. A fixture or fetch that
  // saw an unavailable H1, a dest hop, or a soft-404 cannot be live. Absence
  // of an inspect is not a pass — callers that have a page must set this.
  if (evidence.livePageOk === false) return false;
  if (evidence.destHop === true) return false;
  if (evidence.pageInspect && evidence.pageInspect.ok !== true) return false;
  return true;
}

// Builds a VerifiedOffer record. Status is derived, never set directly, so
// a caller cannot accidentally mark something "live" that fails the
// invariant — the only way in is through this function.
export function buildVerifiedOffer(input) {
  const verifiedAt = (input && input.verifiedAt) || new Date().toISOString();
  const offer = {
    placeId: String((input && input.placeId) || ""),
    // Phase 4: carried so the re-verification cron can rebuild the exact
    // query later without a separate places lookup.
    placeName: (input && input.placeName) || null,
    region: (input && input.region) || null,
    kind: (input && input.kind) || null,
    productProvider: (input && input.productProvider) || "viator",
    productCode: (input && input.productCode) || null,
    productUrl: (input && input.productUrl) || null,
    commissionable: !!(input && input.commissionable),
    bookableNow: !!(input && input.bookableNow),
    confidence: typeof (input && input.confidence) === "number" ? input.confidence : 0,
    evidence: (input && input.evidence) || {},
    verifiedAt,
    expiresAt: (input && input.expiresAt) || new Date(new Date(verifiedAt).getTime() + REVERIFY_TTL_MS).toISOString(),
  };
  offer.status = isLiveEligible(offer) ? STATUS.LIVE : STATUS.SUPPRESSED;
  return offer;
}
