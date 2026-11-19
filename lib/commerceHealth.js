// lib/commerceHealth.js — General Commerce Health & Automatic Offer Quarantine
// State Machine (Phases 3, 4, 12).

export const OFFER_HEALTH_STATUS = /*#__PURE__*/ Object.freeze({
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

export const EVIDENCE_STRENGTH = /*#__PURE__*/ Object.freeze({
  STRONG: "strong",
  WEAK: "weak",
  INCONCLUSIVE: "inconclusive",
});

export const WEAK_FAILURE_QUARANTINE_THRESHOLD = 2;

const TERMINAL_UNSAFE_STATUSES = /*#__PURE__*/ new Set([
  "SOLD_OUT",
  "EXPIRED",
  "REDIRECTED",
  "WRONG_PRODUCT",
  "WRONG_LOCATION",
  "TERMS_CHANGED",
  "QUARANTINED",
]);

export function isOfferStatusServeable(status, meta = {}) {
  const st = String(status || "ACTIVE").toUpperCase().trim();
  if (TERMINAL_UNSAFE_STATUSES.has(st)) return false;
  if (st === "ACTIVE" || st === "ALMOST_GONE") return true;
  if (st === "PRICE_CHANGED") return meta?.priceChangeKind === "promo_drop";
  if (st === "UNVERIFIED") return meta?.failClosedOnUnverified !== true;
  return false;
}

export function reverifyTtlMsForOfferStatus(status) {
  const st = String(status || "ACTIVE").toUpperCase().trim();
  if (st === "ALMOST_GONE") return 86400000;
  if (st === "PRICE_CHANGED") return 172800000;
  if (st === "QUARANTINED") return 43200000;
  return 604800000;
}

function normTokens(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !/^(the|and|for|restaurant|grill|cafe|bar|company|inc|llc)$/.test(w));
}

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
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 429 || httpStatus >= 500 || httpStatus === 0) {
    return { status: "UNVERIFIED", evidence: "inconclusive", reason: `http_${httpStatus || "network_error"}_inconclusive` };
  }
  if (httpStatus === 404 || httpStatus === 410) {
    return { status: "EXPIRED", evidence: "weak", reason: `http_${httpStatus}` };
  }
  if (finalUrl) {
    if (/\/local-coupons\//i.test(finalUrl)) {
      return { status: "REDIRECTED", evidence: "strong", reason: "redirected_to_dead_local_coupons_path" };
    }
    if (expectedDealId) {
      const idStr = String(expectedDealId).trim();
      const m = /-deal-(\d+)(?:[/?#]|$)/i.exec(finalUrl);
      if (!m) return { status: "REDIRECTED", evidence: "strong", reason: "redirected_to_generic_hub" };
      if (m[1] !== idStr) return { status: "WRONG_PRODUCT", evidence: "strong", reason: `deal_id_mismatch_${m[1]}_expected_${idStr}` };
    }
  }
  const body = String(html || "");
  if (!body.trim()) return { status: "UNVERIFIED", evidence: "inconclusive", reason: "empty_body" };
  if (/Sorry,\s*something\s+went\s+wrong/i.test(body)) {
    return { status: "EXPIRED", evidence: "strong", reason: "clipp_error_shell" };
  }
  if (/\bTHIS\s+DEAL\s+IS\s+SOLD\s+OUT\b|\bSold\s+Out\s+for\s+Now\b|\bDeal\s+Sold\s+Out\b/i.test(body)) {
    return { status: "SOLD_OUT", evidence: "strong", reason: "explicit_sold_out_banner" };
  }
  if (expectedMerchant) {
    const tokens = normTokens(expectedMerchant);
    const low = body.toLowerCase();
    if (tokens.length > 0 && !tokens.some((t) => low.includes(t))) {
      return { status: "WRONG_PRODUCT", evidence: "strong", reason: "merchant_name_absent_from_page" };
    }
  }
  if (expectedCity && /<title>/i.test(body)) {
    const c = String(expectedCity).toLowerCase().trim();
    const low = body.toLowerCase();
    if (c && !low.includes(c) && !low.includes("florida") && !low.includes(", fl")) {
      return { status: "WRONG_LOCATION", evidence: "strong", reason: "expected_city_absent_from_page" };
    }
  }
  if (/\bAlmost\s+Gone\b/i.test(body)) {
    return { status: "ALMOST_GONE", evidence: "strong", reason: "almost_gone_badge_present" };
  }
  const pm = /\$\s*(\d+(?:\.\d{1,2})?)\s+for\s+\$\s*(\d+(?:\.\d{1,2})?)/i.exec(body);
  if (pm && Number.isFinite(Number(storedBuyPrice))) {
    const liveBuy = Number(pm[1]);
    const liveFace = Number(pm[2]);
    const baseBuy = Number(storedBuyPrice);
    const baseFace = Number.isFinite(Number(storedFaceValue)) ? Number(storedFaceValue) : liveFace;
    if (liveFace === baseFace && liveBuy < baseBuy) {
      return { status: "PRICE_CHANGED", priceChangeKind: "promo_drop", livePrice: liveBuy, faceValue: liveFace, evidence: "strong", reason: "promo_price_drop_in_buyer_favor" };
    }
    if (liveBuy >= liveFace || (liveFace === baseFace && liveBuy > baseBuy * 1.25)) {
      return { status: "PRICE_CHANGED", priceChangeKind: "discount_gone", livePrice: liveBuy, faceValue: liveFace, evidence: "strong", reason: "discount_eroded_or_price_hiked" };
    }
  }
  return { status: "ACTIVE", evidence: "strong", reason: "verified_active" };
}

export function evaluateOfferHealthTransition({
  currentStatus = "ACTIVE",
  currentPriceChangeKind = "promo_drop",
  currentFailureCount = 0,
  probeResult = {},
  now = new Date(),
} = {}) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const nowIso = new Date(nowMs).toISOString();
  const prevFails = Number.isFinite(Number(currentFailureCount)) ? Math.max(0, Number(currentFailureCount)) : 0;
  const probeStatus = String(probeResult.status || "UNVERIFIED").toUpperCase();
  const evidence = probeResult.evidence || "inconclusive";
  const currentMeta = { ...probeResult, priceChangeKind: probeResult?.priceChangeKind || currentPriceChangeKind };

  if (evidence === "inconclusive") {
    const dead = !isOfferStatusServeable(currentStatus, currentMeta);
    return {
      nextStatus: dead ? currentStatus : currentStatus || "ACTIVE",
      priceChangeKind: currentStatus === "PRICE_CHANGED" ? currentPriceChangeKind : null,
      failureCount: prevFails,
      serveable: !dead,
      quarantined: dead,
      reverifyAt: null,
      transition: "preserved_on_inconclusive_probe",
      reason: probeResult.reason || "inconclusive_probe",
      evaluatedAt: nowIso,
    };
  }

  if (isOfferStatusServeable(probeStatus, probeResult) && probeStatus !== "UNVERIFIED") {
    const wasDead = !isOfferStatusServeable(currentStatus, currentMeta);
    return {
      nextStatus: probeStatus,
      priceChangeKind: probeResult.priceChangeKind || null,
      livePrice: probeResult.livePrice ?? null,
      failureCount: 0,
      serveable: true,
      quarantined: false,
      transition: wasDead ? "restored_from_quarantine" : "verified_healthy",
      reason: probeResult.reason || "verified_healthy",
      reverifyAt: new Date(nowMs + reverifyTtlMsForOfferStatus(probeStatus)).toISOString(),
      evaluatedAt: nowIso,
    };
  }

  if (evidence === "strong") {
    const term = TERMINAL_UNSAFE_STATUSES.has(probeStatus) ? probeStatus : "QUARANTINED";
    return {
      nextStatus: term,
      priceChangeKind: probeResult.priceChangeKind || null,
      failureCount: prevFails + 1,
      serveable: false,
      quarantined: true,
      transition: "immediate_quarantine_on_strong_evidence",
      reason: probeResult.reason || `strong_${term.toLowerCase()}`,
      reverifyAt: new Date(nowMs + 43200000).toISOString(),
      evaluatedAt: nowIso,
    };
  }

  const nextFails = prevFails + 1;
  if (nextFails >= WEAK_FAILURE_QUARANTINE_THRESHOLD) {
    return {
      nextStatus: "QUARANTINED",
      failureCount: nextFails,
      serveable: false,
      quarantined: true,
      transition: "quarantined_after_repeated_weak_failures",
      reason: probeResult.reason || "repeated_weak_failures",
      reverifyAt: new Date(nowMs + 43200000).toISOString(),
      evaluatedAt: nowIso,
    };
  }

  const ok = isOfferStatusServeable(currentStatus, currentMeta);
  return {
    nextStatus: currentStatus || "ACTIVE",
    priceChangeKind: currentStatus === "PRICE_CHANGED" ? currentPriceChangeKind : null,
    failureCount: nextFails,
    serveable: ok,
    quarantined: !ok,
    transition: "strike_recorded_awaiting_recheck",
    reason: probeResult.reason || "weak_failure_strike_1",
    evaluatedAt: nowIso,
  };
}

export function evaluateClippOfferFreshness(
  offer,
  { now = new Date(), auditExpiry = "2026-11-23", auditBaseline = "2026-11-12T00:00:00.000Z" } = {}
) {
  if (!offer || typeof offer !== "object") {
    return { serveable: false, hardExpired: false, scarcityFresh: false, promoFresh: false, effectiveStatus: "UNVERIFIED", needsReverify: true, reason: "invalid_offer" };
  }
  const nowMs = typeof now === "number" ? now : now instanceof Date ? now.getTime() : Date.parse(String(now));
  const rawStatus = String(offer.status || "ACTIVE").toUpperCase().trim();
  const priceChangeKind = offer.priceChangeKind || "promo_drop";

  if (offer.quarantined === true || !isOfferStatusServeable(rawStatus, { priceChangeKind })) {
    return { serveable: false, hardExpired: false, scarcityFresh: false, promoFresh: false, effectiveStatus: rawStatus, needsReverify: true, reason: "protective_hold_retained" };
  }

  const verifiedIso =
    offer.runtimeVerifiedAt ||
    offer.verifiedAt ||
    (offer.verified?.on && offer.verified.on >= "2026-11-01" ? `${offer.verified.on}T00:00:00.000Z` : auditBaseline);
  const expiryMs = Date.parse(`${String(offer.auditExpiry || auditExpiry).slice(0, 10)}T23:59:59.999Z`);

  if (Number.isFinite(nowMs) && Number.isFinite(expiryMs) && nowMs > expiryMs && (!offer.runtimeVerifiedAt || Date.parse(offer.runtimeVerifiedAt) <= expiryMs)) {
    return { serveable: false, hardExpired: true, scarcityFresh: false, promoFresh: false, effectiveStatus: "UNVERIFIED", needsReverify: true, verifiedAt: verifiedIso, reason: "audit_window_expired" };
  }

  const verifiedMs = Date.parse(verifiedIso);
  const ageMs = Number.isFinite(nowMs) && Number.isFinite(verifiedMs) ? Math.max(0, nowMs - verifiedMs) : 0;
  let effectiveStatus = rawStatus, scarcityFresh = true, promoFresh = true, needsReverify = false;

  if (rawStatus === "ALMOST_GONE") {
    scarcityFresh = ageMs <= 86400000;
    if (!scarcityFresh) { effectiveStatus = "ACTIVE"; needsReverify = true; }
  } else if (rawStatus === "PRICE_CHANGED") {
    promoFresh = ageMs <= 172800000;
    if (!promoFresh) { effectiveStatus = "ACTIVE"; needsReverify = true; }
  } else {
    effectiveStatus = "ACTIVE";
    needsReverify = ageMs > 604800000;
  }

  return { serveable: true, hardExpired: false, scarcityFresh, promoFresh, effectiveStatus, needsReverify, verifiedAt: verifiedIso, ageMs, reason: "within_audit_window" };
}
