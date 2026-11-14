// lib/commerceHealth.js — General Commerce Health & Automatic Offer Quarantine
// State Machine (Phases 3, 4, 12).
//
// Evaluates every exposed offer across Clipp, Viator, Travelpayouts (Tiqets,
// Klook, GoCity), TicketNetwork, Undercover Tourist, Ticketmaster, and Stay22
// into a canonical health state with evidence-weighted quarantine transitions.

export const OFFER_HEALTH_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  ALMOST_GONE: "ALMOST_GONE",
  SOLD_OUT: "SOLD_OUT",
  EXPIRED: "EXPIRED",
  REDIRECTED: "REDIRECTED",
  WRONG_PRODUCT: "WRONG_PRODUCT",
  WRONG_LOCATION: "WRONG_LOCATION",
  PRICE_CHANGED: "PRICE_CHANGED",
  TERMS_CHANGED: "TERMS_CHANGED",
  UNVERIFIED: "UNVERIFIED",
  QUARANTINED: "QUARANTINED",
});

export const EVIDENCE_STRENGTH = Object.freeze({
  STRONG: "strong",
  WEAK: "weak",
  INCONCLUSIVE: "inconclusive",
});

export const WEAK_FAILURE_QUARANTINE_THRESHOLD = 2;

const TERMINAL_UNSAFE_STATUSES = new Set([
  OFFER_HEALTH_STATUS.SOLD_OUT,
  OFFER_HEALTH_STATUS.EXPIRED,
  OFFER_HEALTH_STATUS.REDIRECTED,
  OFFER_HEALTH_STATUS.WRONG_PRODUCT,
  OFFER_HEALTH_STATUS.WRONG_LOCATION,
  OFFER_HEALTH_STATUS.TERMS_CHANGED,
  OFFER_HEALTH_STATUS.QUARANTINED,
]);

/**
 * Determine whether an offer status is safe to show and redirect a consumer to.
 * Fail-closed on SOLD_OUT, EXPIRED, REDIRECTED, WRONG_PRODUCT, WRONG_LOCATION,
 * TERMS_CHANGED, QUARANTINED, and unverified PRICE_CHANGED hikes.
 */
export function isOfferStatusServeable(status, meta = {}) {
  const st = String(status || OFFER_HEALTH_STATUS.ACTIVE).toUpperCase().trim();
  if (TERMINAL_UNSAFE_STATUSES.has(st)) return false;
  if (st === OFFER_HEALTH_STATUS.ACTIVE || st === OFFER_HEALTH_STATUS.ALMOST_GONE) {
    return true;
  }
  if (st === OFFER_HEALTH_STATUS.PRICE_CHANGED) {
    // A promotional price drop in the buyer's favor (same merchant, same face value,
    // lower buy price) remains serveable; a discount removal or price hike fails closed.
    return meta?.priceChangeKind === "promo_drop";
  }
  if (st === OFFER_HEALTH_STATUS.UNVERIFIED) {
    // Stay22 hotels are strictly fail-closed on UNVERIFIED; table-backed Viator/UT
    // rows with link_ok === null remain serveable until first probe ("unknown is not dead").
    return meta?.failClosedOnUnverified !== true;
  }
  return false;
}

/**
 * Recommended re-verification TTL in milliseconds for a given offer health status.
 */
export function reverifyTtlMsForOfferStatus(status) {
  const st = String(status || OFFER_HEALTH_STATUS.ACTIVE).toUpperCase().trim();
  if (st === OFFER_HEALTH_STATUS.ALMOST_GONE) return 24 * 60 * 60 * 1000; // 24h
  if (st === OFFER_HEALTH_STATUS.PRICE_CHANGED) return 48 * 60 * 60 * 1000; // 48h
  if (st === OFFER_HEALTH_STATUS.QUARANTINED) return 12 * 60 * 60 * 1000; // 12h recheck
  return 7 * 24 * 60 * 60 * 1000; // 7d default
}

function normTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(the|and|for|restaurant|grill|cafe|bar|company|inc|llc)$/.test(w));
}

/**
 * Inspect a Clipp landing page response (status, finalUrl, HTML body) against
 * expected offer metadata and classify its health state and evidence strength.
 */
export function classifyClippLandingPage({
  httpStatus = 200,
  finalUrl = "",
  html = "",
  expectedDealId = "",
  expectedMerchant = "",
  expectedCity = "",
  storedBuyPrice = null,
  storedFaceValue = null,
} = {}) {
  // 1. Transient bot wall / rate-limit / upstream 5xx -> INCONCLUSIVE (never false-positive quarantine)
  if (
    httpStatus === 401 ||
    httpStatus === 403 ||
    httpStatus === 429 ||
    httpStatus >= 500 ||
    httpStatus === 0
  ) {
    return {
      status: OFFER_HEALTH_STATUS.UNVERIFIED,
      evidence: EVIDENCE_STRENGTH.INCONCLUSIVE,
      reason: `http_${httpStatus || "network_error"}_inconclusive`,
    };
  }

  // 2. Hard 404/410
  if (httpStatus === 404 || httpStatus === 410) {
    return {
      status: OFFER_HEALTH_STATUS.EXPIRED,
      evidence: EVIDENCE_STRENGTH.WEAK,
      reason: `http_${httpStatus}`,
    };
  }

  // 3. Redirected away from specific deal page to generic hub or error route
  if (finalUrl) {
    if (/\/local-coupons\//i.test(finalUrl)) {
      return {
        status: OFFER_HEALTH_STATUS.REDIRECTED,
        evidence: EVIDENCE_STRENGTH.STRONG,
        reason: "redirected_to_dead_local_coupons_path",
      };
    }
    if (expectedDealId) {
      const idStr = String(expectedDealId).trim();
      const dealMatch = /-deal-(\d+)(?:[/?#]|$)/i.exec(finalUrl);
      if (!dealMatch) {
        return {
          status: OFFER_HEALTH_STATUS.REDIRECTED,
          evidence: EVIDENCE_STRENGTH.STRONG,
          reason: "redirected_to_generic_hub",
        };
      }
      if (dealMatch[1] !== idStr) {
        return {
          status: OFFER_HEALTH_STATUS.WRONG_PRODUCT,
          evidence: EVIDENCE_STRENGTH.STRONG,
          reason: `deal_id_mismatch_${dealMatch[1]}_expected_${idStr}`,
        };
      }
    }
  }

  const body = String(html || "");
  if (!body.trim()) {
    return {
      status: OFFER_HEALTH_STATUS.UNVERIFIED,
      evidence: EVIDENCE_STRENGTH.INCONCLUSIVE,
      reason: "empty_body",
    };
  }

  // 4. Clipp error shell
  if (/Sorry,\s*something\s+went\s+wrong/i.test(body)) {
    return {
      status: OFFER_HEALTH_STATUS.EXPIRED,
      evidence: EVIDENCE_STRENGTH.STRONG,
      reason: "clipp_error_shell",
    };
  }

  // 5. Explicit Sold Out banner on Clipp
  if (
    /\bTHIS\s+DEAL\s+IS\s+SOLD\s+OUT\b/i.test(body) ||
    /\bSold\s+Out\s+for\s+Now\b/i.test(body) ||
    /\bDeal\s+Sold\s+Out\b/i.test(body)
  ) {
    return {
      status: OFFER_HEALTH_STATUS.SOLD_OUT,
      evidence: EVIDENCE_STRENGTH.STRONG,
      reason: "explicit_sold_out_banner",
    };
  }

  // 6. Verify merchant identity when expectedMerchant is provided
  if (expectedMerchant) {
    const tokens = normTokens(expectedMerchant);
    const bodyLower = body.toLowerCase();
    if (tokens.length > 0 && !tokens.some((t) => bodyLower.includes(t))) {
      return {
        status: OFFER_HEALTH_STATUS.WRONG_PRODUCT,
        evidence: EVIDENCE_STRENGTH.STRONG,
        reason: "merchant_name_absent_from_page",
      };
    }
  }

  // 7. Verify city/location when expectedCity is provided and page has location text
  if (expectedCity && /<title>/i.test(body)) {
    const cityNorm = String(expectedCity).toLowerCase().trim();
    const bodyLower = body.toLowerCase();
    if (cityNorm && !bodyLower.includes(cityNorm) && !bodyLower.includes("florida") && !bodyLower.includes(", fl")) {
      return {
        status: OFFER_HEALTH_STATUS.WRONG_LOCATION,
        evidence: EVIDENCE_STRENGTH.STRONG,
        reason: "expected_city_absent_from_page",
      };
    }
  }

  // 8. Check for "Almost Gone" scarcity signal
  if (/\bAlmost\s+Gone\b/i.test(body)) {
    return {
      status: OFFER_HEALTH_STATUS.ALMOST_GONE,
      evidence: EVIDENCE_STRENGTH.STRONG,
      reason: "almost_gone_badge_present",
    };
  }

  // 9. Check for price change if liveBuyPrice is extracted or passed
  const priceMatch = /\$\s*(\d+(?:\.\d{1,2})?)\s+for\s+\$\s*(\d+(?:\.\d{1,2})?)/i.exec(body);
  if (priceMatch && Number.isFinite(Number(storedBuyPrice))) {
    const liveBuy = Number(priceMatch[1]);
    const liveFace = Number(priceMatch[2]);
    const baseBuy = Number(storedBuyPrice);
    const baseFace = Number.isFinite(Number(storedFaceValue)) ? Number(storedFaceValue) : liveFace;
    if (liveFace === baseFace && liveBuy < baseBuy) {
      return {
        status: OFFER_HEALTH_STATUS.PRICE_CHANGED,
        priceChangeKind: "promo_drop",
        livePrice: liveBuy,
        faceValue: liveFace,
        evidence: EVIDENCE_STRENGTH.STRONG,
        reason: "promo_price_drop_in_buyer_favor",
      };
    }
    if (liveBuy >= liveFace || (liveFace === baseFace && liveBuy > baseBuy * 1.25)) {
      return {
        status: OFFER_HEALTH_STATUS.PRICE_CHANGED,
        priceChangeKind: "discount_gone",
        livePrice: liveBuy,
        faceValue: liveFace,
        evidence: EVIDENCE_STRENGTH.STRONG,
        reason: "discount_eroded_or_price_hiked",
      };
    }
  }

  return {
    status: OFFER_HEALTH_STATUS.ACTIVE,
    evidence: EVIDENCE_STRENGTH.STRONG,
    reason: "verified_active",
  };
}

/**
 * Phase 4: Automatic Offer Quarantine State Transition Engine.
 *
 * Protects against both:
 * - False negatives (sending users to a sold-out / redirected / wrong-merchant page)
 * - False positives (deleting a valid offer because of a single transient network blip)
 */
export function evaluateOfferHealthTransition({
  currentStatus = OFFER_HEALTH_STATUS.ACTIVE,
  currentFailureCount = 0,
  probeResult = {},
  now = new Date(),
} = {}) {
  const nowIso = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const prevFails = Number.isFinite(Number(currentFailureCount))
    ? Math.max(0, Number(currentFailureCount))
    : 0;
  const probeStatus = String(probeResult.status || OFFER_HEALTH_STATUS.UNVERIFIED).toUpperCase();
  const evidence = probeResult.evidence || EVIDENCE_STRENGTH.INCONCLUSIVE;

  // Case 1: Inconclusive probe (timeout, 403 bot wall, 429, 5xx)
  // Do NOT increment failure_count and do NOT quarantine a currently healthy offer.
  if (evidence === EVIDENCE_STRENGTH.INCONCLUSIVE) {
    const alreadyDead = !isOfferStatusServeable(currentStatus, probeResult);
    return {
      nextStatus: alreadyDead ? currentStatus : currentStatus || OFFER_HEALTH_STATUS.ACTIVE,
      failureCount: prevFails,
      serveable: !alreadyDead,
      quarantined: alreadyDead,
      transition: "preserved_on_inconclusive_probe",
      reason: probeResult.reason || "inconclusive_probe",
      evaluatedAt: nowIso,
    };
  }

  // Case 2: Healthy active / almost-gone / buyer-favorable promo_drop
  if (isOfferStatusServeable(probeStatus, probeResult) && probeStatus !== OFFER_HEALTH_STATUS.UNVERIFIED) {
    return {
      nextStatus: probeStatus,
      priceChangeKind: probeResult.priceChangeKind || null,
      livePrice: probeResult.livePrice ?? null,
      failureCount: 0,
      serveable: true,
      quarantined: false,
      transition: currentStatus === OFFER_HEALTH_STATUS.QUARANTINED ? "restored_from_quarantine" : "verified_healthy",
      reason: probeResult.reason || "verified_healthy",
      reverifyAt: new Date(
        (now instanceof Date ? now.getTime() : Date.now()) + reverifyTtlMsForOfferStatus(probeStatus)
      ).toISOString(),
      evaluatedAt: nowIso,
    };
  }

  // Case 3: Strong negative evidence (explicit SOLD_OUT, REDIRECTED to generic hub,
  // WRONG_PRODUCT, WRONG_LOCATION, TERMS_CHANGED, or discount_gone) -> Immediate Quarantine!
  if (evidence === EVIDENCE_STRENGTH.STRONG) {
    const terminalStatus = TERMINAL_UNSAFE_STATUSES.has(probeStatus)
      ? probeStatus
      : OFFER_HEALTH_STATUS.QUARANTINED;
    return {
      nextStatus: terminalStatus,
      priceChangeKind: probeResult.priceChangeKind || null,
      failureCount: prevFails + 1,
      serveable: false,
      quarantined: true,
      transition: "immediate_quarantine_on_strong_evidence",
      reason: probeResult.reason || `strong_${terminalStatus.toLowerCase()}`,
      reverifyAt: new Date(
        (now instanceof Date ? now.getTime() : Date.now()) +
          reverifyTtlMsForOfferStatus(OFFER_HEALTH_STATUS.QUARANTINED)
      ).toISOString(),
      evaluatedAt: nowIso,
    };
  }

  // Case 4: Weak negative evidence (e.g. single HTTP 404/410 without body confirmation)
  // Increment failure_count; quarantine only when failure_count >= WEAK_FAILURE_QUARANTINE_THRESHOLD (2).
  const nextFails = prevFails + 1;
  if (nextFails >= WEAK_FAILURE_QUARANTINE_THRESHOLD) {
    return {
      nextStatus: OFFER_HEALTH_STATUS.QUARANTINED,
      failureCount: nextFails,
      serveable: false,
      quarantined: true,
      transition: "quarantined_after_repeated_weak_failures",
      reason: probeResult.reason || "repeated_weak_failures",
      reverifyAt: new Date(
        (now instanceof Date ? now.getTime() : Date.now()) +
          reverifyTtlMsForOfferStatus(OFFER_HEALTH_STATUS.QUARANTINED)
      ).toISOString(),
      evaluatedAt: nowIso,
    };
  }

  return {
    nextStatus: currentStatus || OFFER_HEALTH_STATUS.ACTIVE,
    failureCount: nextFails,
    serveable: isOfferStatusServeable(currentStatus, probeResult),
    quarantined: false,
    transition: "strike_recorded_awaiting_recheck",
    reason: probeResult.reason || "weak_failure_strike_1",
    evaluatedAt: nowIso,
  };
}
