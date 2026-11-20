// lib/clippOffers.js — the Clipp market registry: WHICH clipp.com pages we are
// willing to send a user to, and the evidence that each one is real.
//
// WHY A REGISTRY AND NOT A URL TEMPLATE
// clipp.com is behind Akamai and 403s every non-browser fetcher — pages,
// robots.txt and sitemap.xml alike. So nothing in CI, no cron, and no health
// probe can ever tell us whether a clipp.com page exists: a 403 is returned for
// the real Sarasota page and for a made-up one identically. A template like
// `/states/fl/cities/${slug}` would therefore mint confident links to pages
// nobody has ever loaded, and the first evidence of a bad one would be a user
// landing on an error page with our affiliate tracking attached.
//
// So membership in this list IS the claim, and every row carries the browser
// verification that backs it. Adding a market means opening it in a real browser
// and recording what was on the page — not editing a slug.
//
// THE SHAPE MISTAKE THIS LIST EXISTS TO PREVENT
// The path shape /local-coupons/<st>/<city> looks right and was in the original
// hand-off notes. It renders Clipp's own "Sorry, something went wrong!" page.
// The shape that actually serves inventory is /states/<st>/cities/<city>.
// Both were confirmed in a browser on 2026-07-29.
//
// REGISTRY RULE (WORK_ORDER_DEALS_SHARECARDS.md §2): every deal that enters code
// also gets a row in the off-repo project registry (claude/wayfind-deals-registry.md)
// with a scheduled expiry robot. The coupon cards auto-hide on `expires`; the
// robots clean up the data. A row here is NOT a substitute for that.
import { clippDeepLink, isClippDest } from "./deals.js";
import {
  isQuarantinedPartnerOffer,
  applyRuntimePartnerQuarantine,
  resetRuntimePartnerQuarantine,
  _CLIPP_OVERLAYS as _RUNTIME_EVIDENCE_BY_ID,
  _setClippHydrateHook,
} from "./partnerOfferHolds.js";
import {
  OFFER_HEALTH_STATUS,
  EVIDENCE_STRENGTH,
  isOfferStatusServeable,
  classifyClippLandingPage,
  evaluateOfferHealthTransition,
  evaluateClippOfferFreshness,
} from "./commerceHealth.js";



// One row per verified market. `verified` is evidence, not decoration:
//   on        — the date a human/browser actually loaded the page
//   dealsSeen — how many offers were on it (0 would mean "exists but is empty",
//               which is NOT shippable — we would be sending users to a blank)
//   sample    — merchants seen on the page, so a future audit can tell
//               "inventory rotated" apart from "the page broke"
export const CLIPP_AUDIT_AS_OF = "2026-11-12T00:00:00.000Z";
export const CLIPP_LAST_MANUAL_AUDIT_AT = "2026-11-18T23:19:12.000Z";
export const CLIPP_VERIFICATION_MODE = "manual";
export const CLIPP_AUDIT_EXPIRY = "2026-11-23";

const _E = /*#__PURE__*/ Object.freeze([]);
const _AO = "https://www.clipp.com/all-offers/";
const _stamp = (r) =>
  Object.freeze({
    verifiedAt: CLIPP_LAST_MANUAL_AUDIT_AT,
    verificationMode: CLIPP_VERIFICATION_MODE,
    ...r,
  });

export const CLIPP_MARKETS = /*#__PURE__*/ (() =>
  Object.freeze(
    [
      ["sarasota", "Sarasota", "2026-07-29", ["Five-O Donut Co", "Rodizio Grill Brazilian Steakhouse Sarasota", "Clean Eatz - Sarasota", "The Glossie River"]],
      ["bradenton", "Bradenton", "2026-07-29", ["Orange Blossom Coffee", "El Warike Peruvian Cuisine", "Geckos Grill & Pub - Bradenton", "The Peach Cobbler Factory"]],
      ["tampa", "Tampa", "2026-07-31", ["Bavaro's Pizza Napoletana & Pastaria", "Brown Bag Coffee Company", "The Poke Company", "Pacific Counter - Downtown Tampa"]],
      ["orlando", "Orlando", "2026-07-31", ["Dave & Buster's Orlando", "Vicky Bakery", "Pokemoto - Dr. Phillips", "Fusion Bar & Grill"]],
    ].map(([slug, city, on, sample]) =>
      _stamp({
        offerId: `clipp-fl-${slug}`,
        city,
        area: city,
        state: "FL",
        dest: `https://www.clipp.com/states/fl/cities/${slug}`,
        verified: Object.freeze({
          on,
          title: `Local Savings, Deals, Coupons and More in ${city}, FL`,
          dealsSeen: 36,
          sample: Object.freeze(sample),
        }),
      })
    )
  ))();

export const CLIPP_MERCHANT_OFFERS = /*#__PURE__*/ (() =>
  Object.freeze(
    [
      ["chez-leon", "🍽️", "Chez Leon", "Tampa", 0, "$15 for $30 of casual dining", "30-casual-dining-tampa-fl-deal-12863814", "ChIJF9UDDXDFwogRKZRJ9asRgQo"],
      ["dip-and-happy", "🫕", "Dip and Happy", "Tampa", 0, "$20 for $40 of casual dining", "40-casual-dining-tampa-fl-deal-12863594", "ChIJ_7PQ3B_FwogRe-JJpGpKs38"],
      ["brown-bag-coffee", "☕", "Brown Bag Coffee Company", "Tampa", 0, "$10 for $20 of cafe dining", "20-cafe-dining-tampa-fl-deal-12869689", "ChIJ-0q1Cp3FwogRFt9UWUtxFcQ"],
      ["poke-company", "🍣", "The Poke Company", "Tampa", 0, "$10 for $20 of poke bowls & more", "20-poke-bowls-more-tampa-fl-deal-12869690", "ChIJ8TYSe2bFwogRv1zoFgdBVdc"],
      ["ticos-bakery", "🥐", "Tico's Bakery", "Tampa", 0, "$10 for $20 of bakery items", "20-bakery-items-tampa-fl-deal-12868978", "ChIJl9FkZADFwogRGUeMYiHU80M"],
      ["toastique", "🥪", "Toastique - E Cumberland", "Tampa", 0, "$10 for $20 of gourmet toast & smoothies", "20-gourmet-toast-smoothies-more-tampa-fl-deal-12829757", "ChIJd2Qw71vFwogRQITXSYyjiZA"],
      ["eleven80-cafe", "☕", "Eleven80 Cafe", "Tampa", 0, "$10 for $20 of cafe dining", "20-cafe-dining-tampa-fl-deal-12869317", "ChIJoWDfRyPDwogR4qmTsaY4eZs"],
      ["blind-goat", "🍽️", "The Blind Goat", "Tampa", 0, "$15 for $30 of casual dining", "30-casual-dining-tampa-fl-deal-12868827", "ChIJeadUwiPDwogRu8Gq_Qf8cLw"],
      ["marcos-fletcher", "🍕", "Marco's Pizza - Fletcher Ave", "Tampa", 0, "$15 for $30 of casual dining", "30-casual-dining-tampa-fl-deal-12866091", "ChIJCwCS6DXHwogRhUKlA53KGZU"],
      ["ubuntu", "🍽️", "Ubuntu", "St. Petersburg", 0, "$10 for $20 of casual dining", "20-casual-dining-st-petersburg-fl-deal-12875701", "ChIJo6xRYhnxwogRTinjrpTceN0", 0, 0, "saint-petersburg"],
      ["4th-street-pizza", "🍕", "4th Street Pizza", "St. Petersburg", 0, "$15 for $30 of pizza & more", "30-pizza-more-st-petersburg-fl-deal-12869854", "ChIJe2RtO13hwogRJDqo5cJ4x-s", 0, 0, "saint-petersburg", 0, "ALMOST_GONE"],
      ["lucid-coffee-kava", "☕", "Lucid Coffee and Kava", "St. Petersburg", 0, "$10 for $20 of coffee & kava", "20-casual-dining-st-petersburg-fl-deal-12876294", "ChIJR8nS5vvnwogRs-fqIIdVTpk", 0, 0, "saint-petersburg"],
      ["outcast-brewing", "🍺", "Outcast Brewing Company", "St. Petersburg", 0, "$15 for $30 of beverages", "30-beverages-st-petersburg-fl-deal-12861133", "ChIJTTxhRh3jwogRqkl3aF6iKG8", 0, 0, "saint-petersburg"],
      ["pinellas-ale-works", "🍺", "Pinellas Ale Works", "St. Petersburg", 0, "$15 for $30 of beverages", "30-beverages-st-petersburg-fl-deal-12876296", "ChIJe5tp6THiwogRnj98j2gP4xg", 0, 0, "saint-petersburg"],
      ["cinnaholic-stpete", "🧁", "Cinnaholic St. Petersburg", "St. Petersburg", 0, "$10 for $20 of gourmet cinnamon rolls", "20-cinnamon-rolls-more-st-petersburg-fl-deal-12870653", "ChIJmVWoF1bhwogRKpe0VhnzTSw", 0, 0, "saint-petersburg"],
      ["mcdonalds-66th", "🍔", "McDonald's - 66th Street N", "Pinellas Park", 0, "$10 for $20 of burgers & fries", "20-burgers-fries-more-pinellas-park-fl-deal-12842350", "ChIJWaOLldHkwogRqvp-ReHaI7Q"],
      ["katch-bistro", "🐟", "Katch Bistro", "Clearwater", 0, "$25 for $50 of casual dining", "50-casual-dining-clearwater-fl-deal-12824312", "ChIJ70r8flXlwogRFDnkMX9G0dE"],
      ["chill-cawfee", "☕", "Chill Cawfee", "Lithia", 0, "$10 for $20 of coffee & more", "20-coffee-more-lithia-fl-deal-12871286", "ChIJ0ScRB4PTwogR7f3MteEkjX8"],
      ["marcos-lithia", "🍕", "Marco's Pizza - Lithia", "Lithia", 0, "$15 for $30 of pizza & subs", "30-pizza-subs-more-lithia-fl-deal-12853410", "ChIJ58_X4y4t3YgRiG24cVR1c5M"],
      ["village-inn-lol", "🥞", "Village Inn - Land O' Lakes", "Land O' Lakes", 0, "$15 for $30 of casual dining", "30-casual-dining-land-o-lakes-fl-deal-12865739", "ChIJqdfnINi7wogRxMrYLHz7Qis"],
      ["orange-blossom", "☕", "Orange Blossom Coffee", "Bradenton", 0, "$10 for $20 of coffee & more", "20-coffee-more-bradenton-fl-deal-12824076", "ChIJPfVM-xIXw4gRiT1_XuUakks", 0, 0, "parrish"],
      ["el-warike", "🥘", "El Warike Peruvian Cuisine", "Bradenton", 0, "$20 for $40 of casual dining", "40-casual-dining-bradenton-fl-deal-12831352", "ChIJ1-3fCmwWw4gRZ3jzqZZumVM", 0, 0, "parrish"],
      ["peach-cobbler-bradenton", "🧁", "The Peach Cobbler Factory - Bradenton", "Bradenton", 0, "$10 for $20 of cobbler & ice cream", "20-cobbler-ice-cream-more-bradenton-fl-deal-12829469", "ChIJ6TpnBFYXw4gR9SKCJeTnIjY", 0, 0, "parrish"],
      ["clean-eatz-sarasota", "🥗", "Clean Eatz - Sarasota", "Sarasota", 0, "$10 for $20 of prepared meals & wraps", "20-prepared-meals-wraps-more-sarasota-fl-deal-12869518", "ChIJQ2lqiihBw4gRKikqAzm9Lhc", 0, 0, "parrish"],
      ["five-o-donut", "🍩", "Five-O Donut Co", "Sarasota", 0, "$10 for $20 of donuts", "20-donuts-deal-12515586", "ChIJ0-3_7GRAw4gRmttY9pKuGss", 0, 0, "parrish"],
      ["rosys-ice-cream", "🍦", "Rosy's Ice Cream", "Osprey", 0, "$10 for $20 of ice cream & more", "20-ice-cream-more-osprey-fl-deal-12832419", "ChIJ2aQyshdDw4gRmmFabE8pyLY", 0, 0, "bradenton"],
      ["ismash-brandon", "🔨", "iSmash", "Brandon", 1, "$40 for two starter smash sessions (reg. $80)", "80-for-two-starter-smash-sessions-brandon-fl-deal-12829427", "ChIJP3St-uTTwogRYDZFgRQGuNI", 0, ["iSmash Tampa"]],
      ["t4-kartplex", "🏎️", "T4 KartPlex", "Palmetto", 1, "$35 for a standard go-kart session for 2 (reg. $70)", "70-for-standard-session-go-kart-rental-for-2-people-palmetto-fl-deal-12856611", "ChIJX_xfN8sjw4gRk4k8uynBAnQ", 0, 0, "saint-petersburg"],
      ["back-nine", "⛳", "The Back Nine", "Bradenton", 1, "$99.50 for a one-month membership for new members (reg. $199)", "199-for-one-month-membership-for-new-members-bradenton-fl-deal-12789349", "ChIJKVRP_EYXw4gRac5SKnbSMKo", 0, 0, "parrish"],
      ["bananas-axe-cabana", "🪓", "Bananas' Axe Cabana", "Orlando", 1, "$16 for 1-hour axe throwing", "32-for-1-hour-axe-throwing-orlando-fl-deal-12774124", "ChIJzaJ16EOB3YgRRKM6TF4tpKg", 1, 0, "orlando", "2026-08-23"],
      ["handels-oviedo", "🍦", "Handel's Ice Cream - Oviedo", "Oviedo", 0, "$10 for $20 of ice cream & more", "20-ice-cream-more-oviedo-fl-deal-12864145", "ChIJg68gQRBp54gRWy9izCqAECI", 1, 0, "orlando", "2026-08-23"],
      ["little-greek-oviedo", "🥙", "Little Greek Oviedo", "Oviedo", 0, "$10 for $20 of casual dining", "20-casual-dining-oviedo-fl-deal-12810346", "ChIJUc_6jvpp54gR54FpEEe3P3M", 1, 0, "orlando", "2026-08-23"],
      ["cleaneatz-windermere", "🥗", "CleanEatz Windermere", "Winter Garden", 0, "$15 for $30 of dining or meal plan orders", "30-dining-or-meal-plan-orders-winter-garden-fl-deal-12828013", "ChIJFwU2hb6H54gRML-xr9aJnUw", 1, 0, "orlando", "2026-08-23"],
    ].map(([id, icon, merchant, area, act, title, slug, pid, pidOnly, match, seenOn, on, status]) =>
      _stamp({
        offerId: `clipp-m-${id}`,
        icon,
        merchant,
        area,
        kind: act ? "activity" : "dining",
        title,
        badge: "50% off",
        ...(status ? { status } : {}),
        dest: _AO + slug,
        ...(pidOnly ? { placeId: pid } : { photoRef: `places/${pid}/photos/wfplacediscovery` }),
        match: match ? Object.freeze(match) : _E,
        verified: Object.freeze({ on: on || "2026-08-07", seenOn: seenOn || "tampa" }),
      })
    )
  ))();

export const QUARANTINED_CLIPP_OFFERS = /*#__PURE__*/ (() =>
  Object.freeze(
    [
      ["pizza-kitchen", "Pizza Kitchen", "Tampa", "$10 for $20 of casual dining", "20-casual-dining-tampa-fl-deal-12875835", "ChIJrd5cMw_DwogRgRc4JgnCIBw", "2026-11-12", "Clipp deal page 12875835 renders 'THIS DEAL IS SOLD OUT' / 'Sold Out for Now' with Add to Cart and Buy Now removed"],
      ["marcos-riverview", "Marco's Pizza - Riverview", "Riverview", "$15 for $30 of casual dining", "30-casual-dining-riverview-fl-deal-12853657", "ChIJPXKIA6PRwogR1RMJ-1_IMbc", "2026-11-18", "Live Clipp deal page 12853657 displays 'Sold Out for Now' with no purchase CTA during 2026-11-18 manual Chrome check"],
    ].map(([id, merchant, area, title, slug, pid, quarantinedAt, reason]) =>
      _stamp({
        offerId: `clipp-m-${id}`,
        icon: "🍕",
        merchant,
        area,
        kind: "dining",
        title,
        badge: "50% off",
        dest: _AO + slug,
        photoRef: `places/${pid}/photos/wfplacediscovery`,
        status: "SOLD_OUT",
        quarantinedAt,
        evidenceStrength: "strong",
        reason,
      })
    )
  ))();

let _byId = null;
const _getById = () =>
  (_byId ||= new Map([
    ...CLIPP_MARKETS.map((m) => [m.offerId, m]),
    ...CLIPP_MERCHANT_OFFERS.map((m) => [m.offerId, m]),
  ]));
const _Q_IDS = /*#__PURE__*/ new Set(["clipp-m-pizza-kitchen", "clipp-m-marcos-riverview"]);
let _qMap = null;
const _getQ = () => (_qMap ||= new Map(QUARANTINED_CLIPP_OFFERS.map((m) => [m.offerId, m])));
let _adapter = null;

export function registerClippPersistenceAdapter(a) {
  _adapter = a && typeof a === "object" ? a : null;
  _setClippHydrateHook(_adapter?.hydrateSync || null);
}

const _hydrate = () => { try { _adapter?.hydrateSync?.(); } catch {} };
const _persist = (m) => { try { _adapter?.persistSync?.(exportClippRuntimeSnapshot(), m); } catch {} };
const _dealId = (d) => (/-deal-(\d+)(?:[/?#]|$)/i.exec(String(d || "")) || [])[1] || "";

function parseStoredPrices(t) {
  const m = /\$\s*(\d+(?:\.\d{1,2})?)\s+(?:for\s+\$|.*?\(reg\.\s*\$)\s*(\d+(?:\.\d{1,2})?)/i.exec(String(t || ""));
  return m ? { storedBuyPrice: Number(m[1]), storedFaceValue: Number(m[2]) } : { storedBuyPrice: null, storedFaceValue: null };
}

export function validateClippRuntimeOverlay(offerId, ov) {
  const id = String(offerId || "").trim();
  const base = id && !/^(?:test|fixture|mock|fake|sample|dummy)[-_]/i.test(id) && (_getById().get(id) || (_Q_IDS.has(id) ? { status: "SOLD_OUT" } : null));
  if (!base || !ov || typeof ov !== "object") return null;
  if (ov.isFixture === true || /^fixture$/i.test(String(ov.verificationMode || "")) || /^fixture$/i.test(String(ov.source || ""))) return null;
  const inc = ov.evidence === EVIDENCE_STRENGTH.INCONCLUSIVE || /inconclusive|http_(?:401|403|408|429|5\d\d|0|network_error)|_or_challenge|empty_body/i.test(String(ov.reason || ov.lastProbeReason || ""));
  if (inc && (ov.runtimeVerifiedAt || (_Q_IDS.has(id) && ov.quarantined === false))) return null;
  const status = String(ov.status || base.status || "ACTIVE").toUpperCase().trim();
  if (!OFFER_HEALTH_STATUS[status]) return null;
  const quarantined = Boolean(ov.quarantined);
  return {
    status,
    priceChangeKind: ov.priceChangeKind || null,
    livePrice: ov.livePrice != null && Number.isFinite(Number(ov.livePrice)) ? Number(ov.livePrice) : null,
    quarantined,
    serveable: ov.serveable !== undefined ? Boolean(ov.serveable) : !quarantined,
    failureCount: Number.isFinite(Number(ov.failureCount)) ? Math.max(0, Number(ov.failureCount)) : 0,
    reason: ov.reason ? String(ov.reason) : null,
    quarantinedAt: ov.quarantinedAt ? String(ov.quarantinedAt) : null,
    runtimeVerifiedAt: !inc && ov.runtimeVerifiedAt ? String(ov.runtimeVerifiedAt) : undefined,
    updatedAt: ov.updatedAt ? String(ov.updatedAt) : null,
    lastProbeAt: ov.lastProbeAt ? String(ov.lastProbeAt) : undefined,
    lastProbeReason: ov.lastProbeReason ? String(ov.lastProbeReason) : undefined,
    verificationMode: ov.verificationMode ? String(ov.verificationMode) : undefined,
    source: ov.source ? String(ov.source) : undefined,
  };
}

export function exportClippRuntimeSnapshot() {
  return {
    version: 1,
    auditAsOf: CLIPP_AUDIT_AS_OF,
    lastManualAuditAt: CLIPP_LAST_MANUAL_AUDIT_AT,
    auditExpiry: CLIPP_AUDIT_EXPIRY,
    overlays: Object.fromEntries(_RUNTIME_EVIDENCE_BY_ID.entries()),
  };
}

const _META_KEYS = /*#__PURE__*/ new Set(["version", "updatedAt", "auditAsOf", "lastManualAuditAt", "auditExpiry", "receipts"]);

export function applyClippRuntimeSnapshot(snap, { replace = false } = {}) {
  if (replace) { _RUNTIME_EVIDENCE_BY_ID.clear(); resetRuntimePartnerQuarantine(); }
  const raw = snap && typeof snap === "object" ? (snap.overlays && typeof snap.overlays === "object" ? snap.overlays : snap) : {};
  let applied = 0, rejected = 0;
  for (const [id, ov] of Object.entries(raw)) {
    if (_META_KEYS.has(id)) continue;
    const v = validateClippRuntimeOverlay(id, ov);
    if (!v) { rejected++; continue; }
    _RUNTIME_EVIDENCE_BY_ID.set(id, v);
    if (v.quarantined) applyRuntimePartnerQuarantine(id, { status: v.status, evidence: "strong", httpStatus: 200 });
    else if (v.serveable && v.runtimeVerifiedAt) applyRuntimePartnerQuarantine(id, { status: v.status, evidence: "strong", httpStatus: 200, release: true });
    applied++;
  }
  return { ok: true, applied, rejected };
}

export function ingestClippOfferEvidence(offerId, probeInput = {}, { now = new Date(), persist = true } = {}) {
  _hydrate();
  const id = String(offerId || "").trim();
  const qMap = _getQ();
  const base = _getById().get(id) || qMap.get(id);
  if (!id || !base) return { ok: false, reason: "unknown_offer_id" };
  if (
    probeInput?.isFixture === true ||
    /^fixture$/i.test(String(probeInput?.verificationMode || "")) ||
    /^fixture$/i.test(String(probeInput?.source || ""))
  ) {
    return { ok: false, reason: "fixture_evidence_rejected" };
  }

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const nowIso = new Date(nowMs).toISOString();
  const prev = _RUNTIME_EVIDENCE_BY_ID.get(id) || null;
  const isQ = isQuarantinedPartnerOffer(id) || (qMap.has(id) && !prev?.serveable);

  let obsMs = nowMs;
  if (probeInput && probeInput.observedAt != null) {
    obsMs = Date.parse(String(probeInput.observedAt));
    if (!Number.isFinite(obsMs) || obsMs > nowMs + 60000) {
      return { ok: false, reason: "invalid_observed_at" };
    }
    const prevRuntimeMs = Date.parse(prev?.runtimeVerifiedAt || prev?.updatedAt || "");
    const baseVerifiedMs = Date.parse(base.verifiedAt || CLIPP_LAST_MANUAL_AUDIT_AT || "");
    const isOlderThanRuntime = Number.isFinite(prevRuntimeMs) && obsMs < prevRuntimeMs;
    const isOlderThanBase = Number.isFinite(baseVerifiedMs) && (isQ ? obsMs <= baseVerifiedMs && probeInput?.hasSoldOut === false : obsMs < baseVerifiedMs);
    if (nowMs - obsMs > 86400000 || isOlderThanRuntime || isOlderThanBase) {
      return { ok: false, stale: true, reason: "stale_snapshot_rejected" };
    }
  }
  const obsIso = new Date(obsMs).toISOString();

  const currentStatus = prev?.status || (isQ ? base.status || OFFER_HEALTH_STATUS.QUARANTINED : base.status || OFFER_HEALTH_STATUS.ACTIVE);
  const currentPriceChangeKind = prev?.priceChangeKind || base.priceChangeKind || "promo_drop";
  const prices = parseStoredPrices(base.title);
  const probeResult =
    probeInput?.status && probeInput?.evidence && probeInput.html === undefined && probeInput.httpStatus === undefined
      ? probeInput
      : classifyClippLandingPage({
          expectedDealId: _dealId(base.dest),
          expectedMerchant: base.merchant || base.city || "",
          expectedCity: base.area || base.city || "",
          ...prices,
          ...probeInput,
        });

  if (
    probeInput &&
    probeInput.observedAt != null &&
    isQ &&
    probeResult.evidence === EVIDENCE_STRENGTH.STRONG &&
    isOfferStatusServeable(probeResult.status, probeResult)
  ) {
    const qFloorMs = Date.parse(prev?.updatedAt || base.verifiedAt || CLIPP_LAST_MANUAL_AUDIT_AT || "");
    if (Number.isFinite(qFloorMs) && obsMs <= qFloorMs) {
      return { ok: false, stale: true, reason: "stale_snapshot_cannot_unquarantine" };
    }
  }

  const transition = evaluateOfferHealthTransition({
    currentStatus,
    currentPriceChangeKind,
    currentFailureCount: prev?.failureCount ?? 0,
    probeResult,
    now,
  });

  const vMode = probeInput.verificationMode || prev?.verificationMode || CLIPP_VERIFICATION_MODE;
  const src = probeInput.source || prev?.source || "runtime_probe";
  let next;

  if (probeResult.evidence === EVIDENCE_STRENGTH.INCONCLUSIVE) {
    next = {
      ...(prev || {}),
      status: transition.nextStatus,
      priceChangeKind: transition.priceChangeKind ?? prev?.priceChangeKind ?? base.priceChangeKind ?? null,
      quarantined: transition.quarantined,
      serveable: transition.serveable,
      failureCount: transition.failureCount,
      reason: prev?.reason || null,
      lastProbeAt: nowIso,
      lastProbeReason: probeResult.reason,
      verificationMode: vMode,
      source: src,
    };
  } else if (transition.quarantined) {
    applyRuntimePartnerQuarantine(id, { status: transition.nextStatus, evidence: probeResult.evidence, httpStatus: probeInput.httpStatus });
    next = {
      ...(prev || {}),
      status: transition.nextStatus,
      priceChangeKind: transition.priceChangeKind || null,
      quarantined: true,
      serveable: false,
      failureCount: transition.failureCount,
      reason: transition.reason,
      quarantinedAt: obsIso.slice(0, 10),
      updatedAt: obsIso,
      verificationMode: vMode,
      source: src,
    };
  } else if (probeResult.evidence === EVIDENCE_STRENGTH.STRONG && transition.serveable) {
    applyRuntimePartnerQuarantine(id, { status: transition.nextStatus, evidence: "strong", httpStatus: probeInput.httpStatus ?? 200, release: true });
    const isPC = transition.nextStatus === OFFER_HEALTH_STATUS.PRICE_CHANGED;
    next = {
      status: transition.nextStatus,
      priceChangeKind: transition.priceChangeKind || (isPC ? "promo_drop" : null),
      livePrice: transition.livePrice ?? (isPC ? base.livePrice ?? null : null),
      quarantined: false,
      serveable: true,
      failureCount: 0,
      runtimeVerifiedAt: obsIso,
      reason: transition.reason,
      updatedAt: obsIso,
      verificationMode: vMode,
      source: src,
    };
  } else {
    next = {
      ...(prev || {}),
      status: transition.nextStatus,
      priceChangeKind: transition.priceChangeKind ?? prev?.priceChangeKind ?? base.priceChangeKind ?? null,
      quarantined: false,
      serveable: transition.serveable,
      failureCount: transition.failureCount,
      reason: transition.reason,
      updatedAt: obsIso,
      verificationMode: vMode,
      source: src,
    };
  }

  _RUNTIME_EVIDENCE_BY_ID.set(id, next);
  if (persist) _persist({ offerId: id, transition: transition.transition });
  return { ok: true, offerId: id, classification: probeResult, transition, overlay: next };
}

export function resetClippRuntimeEvidence({ clearDurable = false } = {}) {
  _RUNTIME_EVIDENCE_BY_ID.clear();
  resetRuntimePartnerQuarantine();
  if (clearDurable) { try { _adapter?.clearSync?.(); } catch {} }
}

export function isRegisteredClippOfferId(offerId) {
  _hydrate();
  const id = String(offerId || "").trim();
  return Boolean(id && (_getById().has(id) || _Q_IDS.has(id)));
}

export function clippOfferById(offerId, opts = {}) {
  _hydrate();
  const id = String(offerId || "").trim();
  if (!id || isQuarantinedPartnerOffer(id)) return null;
  const ov = _RUNTIME_EVIDENCE_BY_ID.get(id) || null;
  if (ov?.quarantined || (_Q_IDS.has(id) && !ov?.serveable)) return null;
  const base = _getById().get(id) || (ov?.serveable ? _getQ().get(id) : null);
  if (!base) return null;

  const merged = ov
    ? {
        ...base,
        status: ov.status || base.status || OFFER_HEALTH_STATUS.ACTIVE,
        ...(ov.priceChangeKind !== undefined ? { priceChangeKind: ov.priceChangeKind } : {}),
        ...(ov.livePrice !== undefined ? { livePrice: ov.livePrice } : {}),
        ...(ov.runtimeVerifiedAt ? { runtimeVerifiedAt: ov.runtimeVerifiedAt } : {}),
        ...(ov.verificationMode ? { verificationMode: ov.verificationMode } : {}),
      }
    : base;

  const hasNow = opts && opts.now !== undefined;
  const evalNow = hasNow ? opts.now : new Date();
  const evalMs = typeof evalNow === "number" ? evalNow : evalNow instanceof Date ? evalNow.getTime() : Date.parse(String(evalNow));
  const target = hasNow && !merged.runtimeVerifiedAt && merged.verifiedAt && Number.isFinite(evalMs) && evalMs < Date.parse(merged.verifiedAt)
    ? { ...merged, verifiedAt: CLIPP_AUDIT_AS_OF }
    : merged;

  const freshness = evaluateClippOfferFreshness(target, {
    now: evalNow,
    auditExpiry: opts?.auditExpiry || CLIPP_AUDIT_EXPIRY,
    auditBaseline: target.verifiedAt || CLIPP_AUDIT_AS_OF,
  });

  if ((hasNow || opts?.enforceAuditExpiry === true) && !freshness.serveable) return null;
  if (!freshness.scarcityFresh && merged.status === OFFER_HEALTH_STATUS.ALMOST_GONE) {
    return { ...merged, status: OFFER_HEALTH_STATUS.ACTIVE, scarcityExpired: true, health: freshness };
  }
  if (!freshness.promoFresh && merged.status === OFFER_HEALTH_STATUS.PRICE_CHANGED) {
    return { ...merged, status: OFFER_HEALTH_STATUS.ACTIVE, livePrice: null, promoExpired: true, health: freshness };
  }
  return hasNow ? { ...merged, health: freshness } : merged;
}

export function quarantinedClippOfferById(offerId) {
  _hydrate();
  const id = String(offerId || "").trim();
  if (!id) return null;
  const ov = _RUNTIME_EVIDENCE_BY_ID.get(id) || null;
  if (ov?.serveable && !isQuarantinedPartnerOffer(id)) return null;
  const qMap = _getQ();
  if (qMap.has(id)) return ov ? { ...qMap.get(id), ...ov } : qMap.get(id);
  const byId = _getById();
  if ((ov?.quarantined || isQuarantinedPartnerOffer(id)) && byId.has(id)) {
    return { ...byId.get(id), status: ov?.status || OFFER_HEALTH_STATUS.QUARANTINED, quarantinedAt: ov?.quarantinedAt || null, reason: ov?.reason || "runtime_quarantined" };
  }
  return null;
}

export function listActiveClippOffers(opts = {}) {
  _hydrate();
  const out = [];
  for (const id of new Set([..._getById().keys(), ..._Q_IDS])) {
    const r = clippOfferById(id, opts);
    if (r) out.push(r);
  }
  return out;
}

export function clippTrackedUrl(offerId, clickId, opts = {}) {
  const m = clippOfferById(offerId, opts);
  return m && isClippDest(m.dest) ? clippDeepLink(m.dest, clickId) : null;
}




