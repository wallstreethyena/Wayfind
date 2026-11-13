// lib/partnerRevenueEngine.js — SERVER-ONLY Commercial & Trust Engine for
// Direct Sponsored Placements on Wayfind.
//
// GOVERNING COMMERCIAL & EDITORIAL LAWS:
//   1. PRIMARY CONVERSION: Agreed Measurable Paid Pilot (collected partner
//      revenue + measurable partner value WITHOUT altering organic Wayfind
//      scores or editorial rankings).
//   2. THE FIREWALL IS ABSOLUTE: Partner Fit Score and campaign payment status
//      are strictly internal commercial records. Neither may ever be imported
//      by or passed into lib/wayfindScore.js, lib/rankPlaces.js, or any
//      editorial guide selector.
//   3. HONEST ATTRIBUTION: Server-witnessed human clicks are reported under
//      `observed`; range models under `estimated`; uninstrumented downstream
//      bookings or revenue are ALWAYS `"unknown"`, never `0`.
//   4. NO BANNED AFFILIATION BADGES: Every sponsored surface uses the FTC-clear
//      `"Sponsored · Paid partner"` label and passes claimsAffiliation() from
//      lib/creatorRights.js.

import { readFileSync } from "node:fs";
import { wayfindScore } from "./wayfindScore.js";
import { siteTodayStr } from "./siteTime.js";
import { claimsAffiliation } from "./creatorRights.js";
import {
  SPONSORED_DEFAULT_RADIUS_MI,
  SPONSORED_SNAPSHOT_MAX_DAYS,
  RAILS_NOT_FOR_SALE,
  isSafeSponsoredUrl,
  sponsoredHref,
  partnerOutboundHref,
  sponsoredFailureReason,
  sponsoredSnapshotFresh,
  sponsorHasPage,
  sponsorPagePath,
} from "./sponsoredPlaces.js";

const GAP_MATRIX_URL = new URL("../data/partners/market-gap-matrix.json", import.meta.url);
const PROSPECT_QUEUE_URL = new URL("../data/partners/florida-prospect-queue.json", import.meta.url);
const FLAGSHIP_PILOTS_URL = new URL("../data/partners/flagship-pilots.json", import.meta.url);

let cachedGapMatrix = null;
let cachedProspectQueue = null;
let cachedFlagshipPilots = null;

function readJsonAsset(urlObj) {
  try {
    return JSON.parse(readFileSync(urlObj, "utf8"));
  } catch {
    return null;
  }
}

export function loadMarketGapMatrix() {
  if (!cachedGapMatrix) cachedGapMatrix = readJsonAsset(GAP_MATRIX_URL) || { regions: [], categories: [] };
  return cachedGapMatrix;
}

export function loadProspectQueue() {
  if (!cachedProspectQueue) cachedProspectQueue = readJsonAsset(PROSPECT_QUEUE_URL) || { prospects: [] };
  return cachedProspectQueue;
}

export function loadFlagshipPilots() {
  if (!cachedFlagshipPilots) cachedFlagshipPilots = readJsonAsset(FLAGSHIP_PILOTS_URL) || { pilots: [], hardTestPackage: null };
  return cachedFlagshipPilots;
}

export function getProspectById(idOrPlaceId) {
  const needle = String(idOrPlaceId || "").trim().toLowerCase();
  if (!needle) return null;
  const list = loadProspectQueue().prospects || [];
  return (
    list.find(
      (p) =>
        String(p.id || "").toLowerCase() === needle ||
        String(p.placeId || "").toLowerCase() === needle ||
        String(p.name || "").toLowerCase() === needle
    ) || null
  );
}

// ── PHASE 0 & PHASE 8: COMMERCIAL TRUTH & PRICING AUDIT ─────────────────────

export const APPROVED_PACKAGES = Object.freeze({
  weekly: Object.freeze({
    id: "weekly",
    name: "Weekly Spotlight",
    priceUsd: 99,
    durationDays: 7,
    effectiveDailyUsd: 14.14,
    promoLabel: null,
    bestFor: "Pop-up markets, single-weekend festivals, holiday concert weekends, and flash launches.",
    includedDeliverables: Object.freeze([
      "Clearly labeled 'Sponsored · Paid partner' placement within agreed local geo-radius",
      "Direct 0%-commission UTM link to business booking/ticketing or official page",
      "Server-witnessed outbound click summary at flight end",
    ]),
  }),
  monthly: Object.freeze({
    id: "monthly",
    name: "Monthly Featured",
    priceUsd: 199,
    durationDays: 30,
    effectiveDailyUsd: 6.63,
    promoLabel: null,
    bestFor: "30-day seasonal holiday light runs, excursion trains, spa gift-card windows, and first-time measurable pilots.",
    includedDeliverables: Object.freeze([
      "Clearly labeled 'Sponsored · Paid partner' placement within agreed local geo-radius",
      "Crawlable /partners/<slug> showcase page when full verified business profile is supplied",
      "Direct 0%-commission UTM link to business booking/ticketing checkout",
      "30-day observed click & surface breakdown report with renewal review",
    ]),
  }),
  quarterly: Object.freeze({
    id: "quarterly",
    name: "Quarterly Growth",
    priceUsd: 299,
    durationDays: 90,
    effectiveDailyUsd: 3.32,
    promoLabel: "Holiday Promo",
    bestFor: "Boat/kayak charters, botanical gardens, museums, experiential dining, and boutique hotels across peak Florida winter season.",
    includedDeliverables: Object.freeze([
      "90-day 'Sponsored · Paid partner' placement within agreed local geo-radius (~$3.32/day)",
      "Permanent crawlable /partners/<slug> SEO showcase page on gowayfind.com",
      "Direct 0%-commission UTM link to business booking/ticketing checkout",
      "30/60/90-day honest attribution check-ins + renewal recommendation",
    ]),
  }),
});

export const COMMERCIAL_TRUTH = Object.freeze({
  asOf: "2026-11-13",
  primaryConversion: "AGREED_MEASURABLE_PAID_PARTNER_PILOT",
  contactDestination: "hello@gowayfind.com",
  secondaryAlertMailbox: "info@gowayfind.com",
  commissionPctOnDirectBookings: 0,
  billingMechanismToday: "manual_invoice_after_qualification_and_creative_approval",
  automatedStripeCheckoutLive: false,
  confirmedCollectedPartnerRevenueUsd: 0,
  confirmedAffiliateRevenueUsd: 0,
  activeFloridaPaidSponsorsCount: 0,
  activeNonFloridaPaidSponsorsCount: 1,
  historicalExpiredFloridaSponsorsCount: 1,
  proofGapDisclosure:
    "Live partner showcase (/partners/rio-body-wax-gastonia) is a real operating studio in Gastonia, NC (active since 2026-08-23; Google score snapshot currently withheld past 30-day freshness window). Florida sales pitches rely on live first-party Florida demand telemetry (16,018 servable FL places, 59 active guides, 6,351 30-day detail opens) rather than claiming an existing Florida paid case study.",
  disclosureStandard: "Sponsored · Paid partner",
  editorialFirewallSummary:
    "Paid sponsorship never creates, raises, or alters a Wayfind Score, never alters organic sort order (rank stays null), never buys inclusion in attributed creator shelves (chef, cindy), and never suppresses competitors.",
  internalSlas: Object.freeze({
    inboundQualificationTargetHours: 4,
    inboundFirstReplyMaxHours: 24,
    cardPreviewTurnaroundHours: 48,
    postApprovalLaunchHours: 24,
  }),
  inventoryCapacityRules: Object.freeze({
    maxHomeColumnSponsorsPerGeoRadius: 1,
    maxSponsorsPerEligibleRailPerGeoRadius: 1,
    defaultGeoRadiusMi: SPONSORED_DEFAULT_RADIUS_MI,
    maxSnapshotAgeDays: SPONSORED_SNAPSHOT_MAX_DAYS,
    railsNeverForSale: RAILS_NOT_FOR_SALE,
  }),
  pricingAudit: Object.freeze({
    livePublicPriceskeptUnchanged: true,
    packages: APPROVED_PACKAGES,
    unitEconomicsAssessment:
      "At ~2 hours of founder/ops onboarding + copy corroboration (~$100 internal cost), the $99 Weekly flight is near break-even operationally unless scoped to card-only (no bespoke /partners/<slug> page), whereas $199 Monthly and $299 Quarterly Holiday Promo (~$3.32/day) are irresistible entry pilots for Florida charter, attraction, and hospitality owners whose average basket is $60–$350.",
    postProofRateCardRecommendation:
      "Keep $99 / $199 / $299 unchanged until 5 paid Florida pilots complete with verified renewal data; once 5 Florida case studies are proven with partner consent, graduate the $299 Holiday Promo back to $399–$449/quarter while grandfathering founding Florida pilot partners at $299/quarter.",
  }),
});

// ── DATE HELPERS ─────────────────────────────────────────────────────────────

export function addDaysIso(isoDateStr, daysToAdd) {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(String(isoDateStr || "")) ? String(isoDateStr) : siteTodayStr();
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Number(daysToAdd || 0)));
  return (
    dt.getUTCFullYear() +
    "-" +
    String(dt.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(dt.getUTCDate()).padStart(2, "0")
  );
}

// ── PHASE 1 & PHASE 54: EDITORIAL & TRUST FIREWALL ──────────────────────────

const SUPERLATIVE_CLAIM_PATTERNS = [
  /\b#1\s+(?:in|rated|best)\b/i,
  /\bbest\s+in\s+florida\b/i,
  /\bhighest[- ]rated\s+in\b/i,
  /\bguaranteed\s+(?:bookings|roi|revenue|sales|#1)\b/i,
  /\bofficial\s+wayfind\s+pick\b/i,
];

export function evaluateEditorialFirewall(request = {}) {
  const violations = [];
  const r = request && typeof request === "object" ? request : {};

  if (r.modifyWayfindScore === true || r.requestedScoreOverride != null) {
    violations.push({
      code: "SCORE_NOT_FOR_SALE",
      message: "Wayfind Score is computed exclusively by wayfindScore(rating, reviews) and can never be purchased, overridden, or boosted.",
    });
  }
  if (r.boostOrganicRank === true || (r.requestedRank != null && r.requestedRank !== null)) {
    violations.push({
      code: "ORGANIC_RANK_NOT_FOR_SALE",
      message: "Paid placements render in dedicated disclosed slots with rank: null and never reorder organic search, map, or rail rankings.",
    });
  }
  if (r.buyEditorialGuideInclusion === true) {
    violations.push({
      code: "EDITORIAL_GUIDES_INDEPENDENT",
      message: "Inclusion in editorial guides is determined independently by editorial merit and is never sold.",
    });
  }
  if (r.suppressCompetitors === true || r.removeNegativeSignals === true) {
    violations.push({
      code: "COMPETITOR_SUPPRESSION_FORBIDDEN",
      message: "Sponsorship never hides competing venues or alters organic quality signals.",
    });
  }
  if (r.hideDisclosure === true || (r.label !== undefined && String(r.label || "").trim() !== COMMERCIAL_TRUTH.disclosureStandard)) {
    violations.push({
      code: "DISCLOSURE_MANDATORY",
      message: `Every paid placement must carry the exact visible disclosure "${COMMERCIAL_TRUTH.disclosureStandard}".`,
    });
  }
  if (r.rail && RAILS_NOT_FOR_SALE.includes(String(r.rail))) {
    violations.push({
      code: "ATTRIBUTED_CREATOR_RAIL_NOT_FOR_SALE",
      message: `Rail "${r.rail}" is an attributed personal shelf and is permanently off-limits to paid placement.`,
    });
  }

  const copyBlob = [r.label, r.headline, r.body, r.claim, r.cta, r.notes]
    .filter((v) => typeof v === "string" && v.trim())
    .join(" \n ");

  if (copyBlob && claimsAffiliation(copyBlob)) {
    violations.push({
      code: "BANNED_AFFILIATION_WORDING",
      message: "Copy contains banned membership/endorsement wording under Lanham Act s. 43(a) policy; use 'Sponsored · Paid partner'.",
    });
  }
  for (const rx of SUPERLATIVE_CLAIM_PATTERNS) {
    if (rx.test(copyBlob)) {
      violations.push({
        code: "UNVERIFIED_SUPERLATIVE_OR_GUARANTEE",
        message: `Copy matched prohibited superlative or guaranteed-outcome pattern (${rx.source}).`,
      });
      break;
    }
  }

  const textNotes = String(r.inquiryText || r.notes || "").toLowerCase();
  if (
    /\b(?:raise|boost|change|increase|buy|fix)\s+(?:my\s+|our\s+)?(?:wayfind\s+)?(?:score|rating|rank|ranking)\b/.test(textNotes) ||
    /\bput\s+us\s+#?1\s+in\s+organic\b/.test(textNotes) ||
    /\bno\s+sponsored\s+(?:tag|label|badge)\b/.test(textNotes)
  ) {
    violations.push({
      code: "INQUIRY_REQUESTS_EDITORIAL_MANIPULATION",
      message: "Prospect requested paid manipulation of score, organic rank, or mandatory sponsorship disclosure.",
    });
  }

  return {
    allowed: violations.length === 0,
    violations,
  };
}

// ── PHASE 2 & PHASE 3: IDEAL PARTNER PROFILE & INTERNAL FIT SCORE ────────────

export const FIT_BANDS = Object.freeze({
  STRONG_FIT: "STRONG_FIT",
  POSSIBLE_FIT: "POSSIBLE_FIT",
  WEAK_FIT: "WEAK_FIT",
  DO_NOT_SELL: "DO_NOT_SELL",
});

const NATIONAL_CHAIN_PATTERNS = [
  /\bmcdonald'?s\b/i,
  /\bstarbucks\b/i,
  /\bwalmart\b/i,
  /\btarget\b/i,
  /\bapplebee'?s\b/i,
  /\bchili'?s\b/i,
  /\bolive\s+garden\b/i,
  /\bcheesecake\s+factory\b/i,
  /\bchick-fil-a\b/i,
  /\btaco\s+bell\b/i,
  /\bburger\s+king\b/i,
  /\bwendy'?s\b/i,
  /\bcvs\b/i,
  /\bwalgreens\b/i,
  /\bshell\s+station\b/i,
];

const UNSUPPORTED_PREDATORY_PATTERNS = [
  /\bpayday\s+loan/i,
  /\bcash\s+advance/i,
  /\bonline\s+casino/i,
  /\bcrypto\s+pump/i,
  /\badult\s+escort/i,
  /\bstrip\s+club/i,
  /\btimeshare\s+exit/i,
];

const HIGH_FIT_CATEGORIES = new Set([
  "christmas",
  "holiday",
  "charter",
  "boat",
  "kayak",
  "eco_tour",
  "attraction",
  "museum",
  "garden",
  "aquarium",
  "experiential_dining",
  "restaurant",
  "spa",
  "wellness",
  "boutique_hotel",
  "hotel",
  "comedy",
  "performing_arts",
]);

/**
 * Computes the INTERNAL-ONLY Partner Fit Score (0–100) and Fit Band.
 * Never exposed on public cards and never connected to wayfindScore().
 */
export function scorePartnerFit(candidate = {}) {
  const c = candidate && typeof candidate === "object" ? candidate : {};
  const vetoes = [];
  const positives = [];
  const cautions = [];

  const nameAndNotes = [c.name, c.businessName, c.category, c.notes, c.inquiryText]
    .filter(Boolean)
    .join(" ");

  const firewall = evaluateEditorialFirewall(c);
  if (!firewall.allowed) {
    for (const v of firewall.violations) vetoes.push(v.code + ": " + v.message);
  }

  if (c.businessClosed === true || String(c.status || "").toUpperCase() === "CLOSED_PERMANENTLY") {
    vetoes.push("BUSINESS_CLOSED: Permanently closed businesses cannot buy sponsored placement.");
  }
  if (c.deceptiveOrUnsafe === true || UNSUPPORTED_PREDATORY_PATTERNS.some((rx) => rx.test(nameAndNotes))) {
    vetoes.push("TRUST_SAFETY_VETO: Category violates consumer trust and safety standards.");
  }
  if (c.isNationalChain === true || NATIONAL_CHAIN_PATTERNS.some((rx) => rx.test(String(c.name || c.businessName || "")))) {
    vetoes.push("GENERIC_CHAIN_VETO: Generic national fast-food/big-box chains dilute discovery quality.");
  }
  if (c.bookingUrl && !isSafeSponsoredUrl(c.bookingUrl)) {
    vetoes.push("UNSAFE_DESTINATION_URL: Provided destination URL must be valid public HTTPS.");
  }
  if (c.outsideSupportedGeo === true) {
    vetoes.push("UNSUPPORTED_GEO: Business is outside active or launch-ready local coverage.");
  }

  const rating = c.rating != null && Number.isFinite(Number(c.rating)) ? Number(c.rating) : null;
  const reviews = c.reviews != null && Number.isFinite(Number(c.reviews)) ? Number(c.reviews) : null;
  const isSeasonalEvent = Boolean(c.eventId && rating === null);

  if (rating !== null && rating < 4.0 && c.newVenueVerifiedException !== true) {
    vetoes.push(`ORGANIC_QUALITY_FLOOR: Google rating ${rating} is below the 4.0 minimum floor.`);
  }
  if (reviews !== null && reviews < 5 && !isSeasonalEvent && c.newVenueVerifiedException !== true) {
    vetoes.push(`THIN_REVIEW_FLOOR: Review count (${reviews}) is below 5 without verified new-venue exception.`);
  }

  if (vetoes.length > 0) {
    return {
      internalOnly: true,
      score: 0,
      band: FIT_BANDS.DO_NOT_SELL,
      vetoes,
      positives,
      cautions,
    };
  }

  let score = 40;

  // 1. Organic reputation quality (up to +20)
  if (rating !== null) {
    if (rating >= 4.7) {
      score += 15;
      positives.push(`Strong organic rating (${rating}★)`);
    } else if (rating >= 4.4) {
      score += 11;
      positives.push(`Solid organic rating (${rating}★)`);
    } else {
      score += 6;
    }
    if (reviews !== null && reviews >= 500) {
      score += 5;
      positives.push(`Established review depth (${reviews} reviews)`);
    } else if (reviews !== null && reviews >= 100) {
      score += 3;
    }
  } else if (isSeasonalEvent) {
    score += 12;
    positives.push("Verified dated seasonal attraction in wf_events");
  } else {
    cautions.push("Google rating/review snapshot not yet verified");
  }

  // 2. Direct conversion / checkout path (up to +18, or friction deduction)
  const hasOnlineBooking = c.onlineBookingAvailable !== false && Boolean(c.bookingUrl || c.website);
  if (c.onlineBookingAvailable === false) {
    score -= 10;
    cautions.push("Walk-up or phone-only booking model — pitch awareness/directions/group charters only, never online cart ROI");
  } else if (hasOnlineBooking) {
    score += 16;
    positives.push("Direct online booking/ticketing destination available at 0% Wayfind commission");
  } else {
    cautions.push("Direct booking URL still needs verification before proposal");
  }

  // 3. Category & basket economics (up to +14)
  const catLower = String(c.category || "").toLowerCase();
  const matchedHighFit = Array.from(HIGH_FIT_CATEGORIES).some((k) => catLower.includes(k.replace("_", " ")) || catLower.includes(k));
  if (matchedHighFit) {
    score += 12;
    positives.push("High-intent leisure/experience category where 2–8 customers cover pilot cost");
  } else if (/parking|laundromat|dentist|accounting|plumbing|storage/i.test(catLower)) {
    score -= 22;
    cautions.push("Utilitarian non-leisure category has weak discovery intent");
  }

  // 4. Existing first-party Wayfind demand signal (up to +12)
  const ev = c.wayfindEvidence || {};
  const signalPoints =
    (Number(ev.detailOpens || 0) >= 15 ? 5 : Number(ev.detailOpens || 0) >= 5 ? 3 : 0) +
    (Number(ev.primaryCtaNulls || 0) >= 10 ? 4 : 0) +
    (Number(ev.freeOrganizerClicks || 0) >= 5 ? 4 : 0) +
    (Number(ev.stopAdds || 0) + Number(ev.saves || 0) >= 3 ? 3 : 0) +
    (Array.isArray(ev.guides) && ev.guides.length > 0 ? 3 : 0);
  if (signalPoints > 0) {
    score += Math.min(12, signalPoints);
    positives.push("Backed by existing first-party Wayfind consumer demand");
  }

  // 5. Market readiness check
  const flags = Array.isArray(c.flags) ? c.flags : (c.publicContact && c.publicContact.flags) || [];
  if (flags.some((f) => String(f).includes("HELD_GATE"))) {
    score -= 8;
    cautions.push("Local city landing gate is currently held pending feed density");
  }
  if (flags.some((f) => String(f).includes("REQUEST_FORM_NOT_INSTANT_CART"))) {
    score -= 5;
    cautions.push("Uses request form + phone confirmation rather than instant cart");
  }

  const bounded = Math.max(1, Math.min(99, Math.round(score)));
  let band = FIT_BANDS.WEAK_FIT;
  if (bounded >= 82 && c.onlineBookingAvailable !== false && !flags.some((f) => String(f).includes("HELD_GATE"))) {
    band = FIT_BANDS.STRONG_FIT;
  } else if (bounded >= 62) {
    band = FIT_BANDS.POSSIBLE_FIT;
  }

  return {
    internalOnly: true,
    score: bounded,
    band,
    vetoes,
    positives,
    cautions,
  };
}

// ── PHASE 9: PACKAGE-FIT RECOMMENDER ─────────────────────────────────────────

export function recommendPartnerPackage(candidate = {}, todayStr) {
  const day = todayStr || siteTodayStr();
  const cat = String(candidate.category || "").toLowerCase();
  const notes = String(candidate.notes || candidate.inquiryText || "").toLowerCase();
  const requested = String(candidate.packageId || "").toLowerCase();

  if (
    requested === "weekly" ||
    /\b(?:weekend|pop[- ]?up|two[- ]night|one[- ]week|festival)\b/.test(cat + " " + notes) ||
    (candidate.eventDurationDays && Number(candidate.eventDurationDays) <= 10)
  ) {
    const pkg = APPROVED_PACKAGES.weekly;
    return {
      packageId: pkg.id,
      packageName: pkg.name,
      priceUsd: pkg.priceUsd,
      measurementPeriodDays: pkg.durationDays,
      decisionDate: addDaysIso(day, pkg.durationDays),
      rationale: "Short-window event or pop-up run matches the 7-day Weekly Spotlight ($99) without paying for post-event days.",
    };
  }

  if (
    requested === "monthly" ||
    /\b(?:christmas|holiday|lights|north pole|dazzling|nightgarden|night lights|gift card|spa)\b/.test(cat + " " + notes)
  ) {
    const pkg = APPROVED_PACKAGES.monthly;
    return {
      packageId: pkg.id,
      packageName: pkg.name,
      priceUsd: pkg.priceUsd,
      measurementPeriodDays: pkg.durationDays,
      decisionDate: addDaysIso(day, pkg.durationDays),
      rationale: "30-day seasonal window or first-time validation pilot fits Monthly Featured ($199) with a clean 30-day review gate before upgrading to Quarterly.",
    };
  }

  const pkg = APPROVED_PACKAGES.quarterly;
  return {
    packageId: pkg.id,
    packageName: pkg.name,
    priceUsd: pkg.priceUsd,
    measurementPeriodDays: pkg.durationDays,
    decisionDate: addDaysIso(day, pkg.durationDays),
    rationale: "Evergreen attraction, charter, dining, or hotel operator gets best daily economics on Quarterly Growth ($299 / 90 days ≈ $3.32/day) plus a permanent crawlable /partners/<slug> showcase page.",
  };
}

// ── PHASE 17: SYNTHETIC / TEST LEAD ISOLATION ────────────────────────────────

const SYNTHETIC_EMAIL_DOMAINS = [
  "@example.com",
  "@example.org",
  "@example.net",
  "@wayfind.test",
  "@gowayfind.test",
  "@test.invalid",
  "@localhost",
];

export function detectSyntheticPartnerLead(input = {}, headers = {}) {
  const reasons = [];
  const h = (k) => {
    if (!headers) return "";
    if (typeof headers.get === "function") return String(headers.get(k) || "");
    return String(headers[k] || headers[k.toLowerCase()] || "");
  };

  if (input.isTest === true || input.synthetic === true || String(input.wf_test || "") === "1") {
    reasons.push("explicit_test_flag");
  }
  if (h("x-wayfind-qa") === "1" || h("x-wf-synthetic") === "1") {
    reasons.push("qa_header");
  }
  const ua = h("user-agent");
  if (/WayfindVerify|HeadlessChrome|Playwright|Cypress|Puppeteer/i.test(ua)) {
    reasons.push("automation_user_agent");
  }
  const contact = String(input.contact || input.email || "").trim().toLowerCase();
  if (SYNTHETIC_EMAIL_DOMAINS.some((d) => contact.endsWith(d))) {
    reasons.push("synthetic_email_domain");
  }
  const combined = [input.businessName, input.cityMarket, input.contact, input.notes]
    .filter(Boolean)
    .join(" ");
  if (/\[(?:TEST|SYNTHETIC|QA)\]|wf-synthetic-probe|wayfind-qa-lead/i.test(combined)) {
    reasons.push("synthetic_marker_token");
  }

  return {
    isSynthetic: reasons.length > 0,
    reasons,
  };
}

// ── PHASE 18: INBOUND QUALIFICATION ENGINE ───────────────────────────────────

export const INBOUND_CLASSIFICATIONS = Object.freeze({
  STRONG_FIT: "STRONG_FIT",
  NEED_MORE_INFO: "NEED_MORE_INFO",
  WRONG_FIT: "WRONG_FIT",
  EDITORIAL_CONFLICT: "EDITORIAL_CONFLICT",
  UNSUPPORTED_CATEGORY: "UNSUPPORTED_CATEGORY",
  UNSUPPORTED_MARKET: "UNSUPPORTED_MARKET",
  TRUST_RISK: "TRUST_RISK",
});

const SUPPORTED_FLORIDA_MARKETS_RX =
  /\b(?:sarasota|bradenton|anna maria|siesta key|lakewood ranch|venice|parrish|longboat|cortez|tampa|ybor|lakeland|dade city|crystal river|lake wales|st\.?\s*pete|saint petersburg|clearwater|dunedin|madeira beach|john'?s pass|gulfport|tarpon springs|orlando|winter park|kissimmee|melbourne|space coast|daytona|ocala|miami|coral gables|fort lauderdale|hollywood|boca raton|west palm|fort myers|naples|cape coral|sanibel|jacksonville|st\.?\s*augustine|amelia island|tallahassee|panama city beach|destin|30a|pensacola|fort walton|key west|islamorada|marathon|key largo|florida|\bfl\b)\b/i;

export function qualifyInboundLead(input = {}, todayStr) {
  const day = todayStr || siteTodayStr();
  const businessName = String(input.businessName || input.name || "").trim();
  const cityMarket = String(input.cityMarket || input.city || "").trim();
  const category = String(input.category || "").trim();
  const bookingUrl = String(input.bookingUrl || input.website || "").trim();
  const notes = String(input.notes || input.inquiryText || "").trim();

  const firewall = evaluateEditorialFirewall({
    ...input,
    inquiryText: notes,
  });

  if (!firewall.allowed) {
    return {
      classification: INBOUND_CLASSIFICATIONS.EDITORIAL_CONFLICT,
      fit: { internalOnly: true, score: 0, band: FIT_BANDS.DO_NOT_SELL, vetoes: firewall.violations.map((v) => v.code) },
      firewall,
      recommendedPackage: null,
      internalSlaHours: COMMERCIAL_TRUTH.internalSlas.inboundFirstReplyMaxHours,
      nextAction: "Send polite editorial-independence refusal; do not issue invoice.",
      draftResponse: `Thanks for reaching out about ${businessName || "your business"}. Paid placements on Wayfind are strictly separated from our editorial rankings and Wayfind Score — we never sell score boosts, organic rank positions, or unlabeled placements. If you ever want a clearly labeled "Sponsored · Paid partner" card with direct 0%-commission booking links while keeping organic rankings untouched, let us know.`,
    };
  }

  if (UNSUPPORTED_PREDATORY_PATTERNS.some((rx) => rx.test(businessName + " " + category + " " + notes))) {
    return {
      classification: INBOUND_CLASSIFICATIONS.TRUST_RISK,
      fit: { internalOnly: true, score: 0, band: FIT_BANDS.DO_NOT_SELL, vetoes: ["TRUST_SAFETY_VETO"] },
      firewall,
      recommendedPackage: null,
      internalSlaHours: COMMERCIAL_TRUTH.internalSlas.inboundFirstReplyMaxHours,
      nextAction: "Close as DO_NOT_SELL (trust/safety risk).",
      draftResponse: "Thank you for contacting Wayfind. Your business category falls outside the leisure and local discovery categories eligible for sponsored placement.",
    };
  }

  if (bookingUrl && !isSafeSponsoredUrl(bookingUrl)) {
    return {
      classification: INBOUND_CLASSIFICATIONS.TRUST_RISK,
      fit: { internalOnly: true, score: 0, band: FIT_BANDS.DO_NOT_SELL, vetoes: ["UNSAFE_DESTINATION_URL"] },
      firewall,
      recommendedPackage: null,
      internalSlaHours: COMMERCIAL_TRUTH.internalSlas.inboundQualificationTargetHours,
      nextAction: "Request valid public HTTPS booking/website URL before qualifying.",
      draftResponse: `Thanks for reaching out about ${businessName || "your venue"}. Before we review a placement, please reply with your official HTTPS website or direct booking link so we can verify the customer checkout experience.`,
    };
  }

  if (NATIONAL_CHAIN_PATTERNS.some((rx) => rx.test(businessName)) || /\b(?:plumbing|roofing|hvac|bail bonds|personal injury|auto insurance)\b/i.test(category + " " + notes)) {
    return {
      classification: INBOUND_CLASSIFICATIONS.UNSUPPORTED_CATEGORY,
      fit: { internalOnly: true, score: 15, band: FIT_BANDS.DO_NOT_SELL, vetoes: ["UNSUPPORTED_CATEGORY"] },
      firewall,
      recommendedPackage: null,
      internalSlaHours: COMMERCIAL_TRUTH.internalSlas.inboundFirstReplyMaxHours,
      nextAction: "Politely decline unsupported non-discovery category.",
      draftResponse: `Thanks for thinking of Wayfind for ${businessName || "your business"}. We only accept sponsorships from Florida experiences, attractions, charters, dining, wellness, and hospitality venues where readers are actively planning an outing, so we wouldn't be able to deliver strong value for your category.`,
    };
  }

  if (cityMarket && !SUPPORTED_FLORIDA_MARKETS_RX.test(cityMarket)) {
    return {
      classification: INBOUND_CLASSIFICATIONS.UNSUPPORTED_MARKET,
      fit: { internalOnly: true, score: 25, band: FIT_BANDS.WEAK_FIT, vetoes: ["UNSUPPORTED_GEO"] },
      firewall,
      recommendedPackage: null,
      internalSlaHours: COMMERCIAL_TRUTH.internalSlas.inboundFirstReplyMaxHours,
      nextAction: "Hold in expansion waitlist; refuse taking money where local geo-gated traffic is not live.",
      draftResponse: `Thanks for reaching out from ${cityMarket}. Wayfind's active partner placements are geo-gated to Florida markets where we have live local discovery density, and we don't take partner dollars in markets before our local audience can justify the spend. We'll keep your note on file as we expand.`,
    };
  }

  const matchedProspect = getProspectById(businessName);
  const fit = scorePartnerFit({
    name: businessName,
    category: category || (matchedProspect && matchedProspect.category) || "",
    bookingUrl: bookingUrl || (matchedProspect && matchedProspect.publicContact && matchedProspect.publicContact.bookingUrl) || "",
    rating: input.rating ?? (matchedProspect ? matchedProspect.rating : null),
    reviews: input.reviews ?? (matchedProspect ? matchedProspect.reviews : null),
    wayfindEvidence: matchedProspect ? matchedProspect.wayfindEvidence : undefined,
    notes,
  });
  const rec = recommendPartnerPackage(
    {
      packageId: input.packageId,
      category: category || (matchedProspect && matchedProspect.category) || "",
      notes,
    },
    day
  );

  if (!bookingUrl && !category && !matchedProspect) {
    return {
      classification: INBOUND_CLASSIFICATIONS.NEED_MORE_INFO,
      fit,
      firewall,
      recommendedPackage: rec,
      internalSlaHours: COMMERCIAL_TRUTH.internalSlas.inboundQualificationTargetHours,
      nextAction: "Reply within 4 business hours requesting official website/booking link and target flight dates.",
      draftResponse: `Thanks for reaching out about ${businessName} in ${cityMarket}! To put together your exact card preview and confirm fit for the ${rec.packageName} ($${rec.priceUsd}), reply with (1) the direct link where guests book or view menus/tickets and (2) your ideal start date.`,
    };
  }

  if (fit.band === FIT_BANDS.DO_NOT_SELL || fit.band === FIT_BANDS.WEAK_FIT) {
    return {
      classification: INBOUND_CLASSIFICATIONS.WRONG_FIT,
      fit,
      firewall,
      recommendedPackage: null,
      internalSlaHours: COMMERCIAL_TRUTH.internalSlas.inboundFirstReplyMaxHours,
      nextAction: "Decline politely — organic quality or conversion setup below pilot threshold.",
      draftResponse: `Thanks for reaching out about ${businessName}. We review every sponsorship inquiry to make sure the venue's booking path and local category fit can realistically pay back the placement, and right now we don't think a paid flight is the right move.`,
    };
  }

  return {
    classification: INBOUND_CLASSIFICATIONS.STRONG_FIT,
    fit,
    firewall,
    recommendedPackage: rec,
    internalSlaHours: COMMERCIAL_TRUTH.internalSlas.inboundQualificationTargetHours,
    nextAction: `Look up Google Place ID, build ${rec.packageName} ($${rec.priceUsd}) card preview within 48h, and send pilot proposal.`,
    draftResponse: `Thanks for reaching out about ${businessName} in ${cityMarket}! Your venue is a strong fit for our ${rec.packageName} ($${rec.priceUsd} flat for ${rec.measurementPeriodDays} days, 0% Wayfind commission on direct bookings). Next step: we'll assemble your 'Sponsored · Paid partner' card preview for your approval before any invoice is sent.`,
  };
}

// ── PHASE 10 & PHASE 16: 12-STAGE EVIDENCE-GATED CRM PIPELINE ────────────────

export const PIPELINE_STAGES = Object.freeze([
  "RESEARCHED",
  "CONTACT_READY",
  "CONTACTED",
  "REPLIED",
  "FIT_ESTABLISHED",
  "PROPOSAL",
  "AGREED",
  "LIVE",
  "REPORTING",
  "RENEWAL",
  "CLOSED_WON",
  "CLOSED_LOST",
]);

export const LOST_REASONS = Object.freeze({
  NO_BUDGET: "NO_BUDGET",
  TIMING_SEASONAL: "TIMING_SEASONAL",
  NO_BOOKING_FLOW: "NO_BOOKING_FLOW",
  WRONG_CATEGORY: "WRONG_CATEGORY",
  WANTED_RANKING_BOOST: "WANTED_RANKING_BOOST",
  LOW_FIT_SCORE: "LOW_FIT_SCORE",
  NO_RESPONSE: "NO_RESPONSE",
  CHOSE_SOCIAL_ADS: "CHOSE_SOCIAL_ADS",
  TOO_EARLY_FOR_MARKET: "TOO_EARLY_FOR_MARKET",
});

const STAGE_EVIDENCE_REQUIREMENTS = Object.freeze({
  RESEARCHED: () => null,
  CONTACT_READY: (ev) => (ev && (ev.publicContactVerified || ev.contact) ? null : "Requires verified public business contact channel."),
  CONTACTED: (ev) => (ev && ev.outreachLoggedAt ? null : "Requires outreachLoggedAt timestamp and channel."),
  REPLIED: (ev) => (ev && ev.replyReceivedAt ? null : "Requires replyReceivedAt evidence from business."),
  FIT_ESTABLISHED: (ev) => (ev && ev.fitBand && ev.fitBand !== FIT_BANDS.DO_NOT_SELL ? null : "Requires non-vetoed Partner Fit assessment."),
  PROPOSAL: (ev) => (ev && ev.packageId && ev.priceUsd ? null : "Requires concrete pilot packageId and priceUsd."),
  AGREED: (ev) => (ev && ev.ownerApprovedTerms && ev.invoiceOrPaymentRef ? null : "Requires written partner agreement + invoiceOrPaymentRef."),
  LIVE: (ev) => (ev && ev.campaignSlug && ev.qaPassed === true ? null : "Requires campaignSlug passing 12-point pre-launch QA."),
  REPORTING: (ev) => (ev && ev.reportGeneratedAt ? null : "Requires generated honest campaign report."),
  RENEWAL: (ev) => (ev && ev.renewalDecision ? null : "Requires explicit renewalDecision evaluation."),
  CLOSED_WON: (ev) => (ev && ev.collectedRevenueUsd > 0 ? null : "CLOSED_WON requires collectedRevenueUsd > 0."),
  CLOSED_LOST: (ev) => (ev && LOST_REASONS[ev.lostReason] ? null : "CLOSED_LOST requires a normalized LOST_REASON code."),
});

export function createPartnerLeadRecord(input = {}, opts = {}) {
  const createdAt = opts.createdAt || new Date().toISOString();
  const day = createdAt.slice(0, 10);
  const syntheticCheck = detectSyntheticPartnerLead(input, opts.headers);
  const qualification = qualifyInboundLead(input, day);
  const pkgId = String(input.packageId || (qualification.recommendedPackage && qualification.recommendedPackage.packageId) || "quarterly").toLowerCase();
  const pkg = APPROVED_PACKAGES[pkgId] || APPROVED_PACKAGES.quarterly;

  const initialStage =
    qualification.classification === INBOUND_CLASSIFICATIONS.EDITORIAL_CONFLICT ||
    qualification.classification === INBOUND_CLASSIFICATIONS.TRUST_RISK ||
    qualification.classification === INBOUND_CLASSIFICATIONS.UNSUPPORTED_CATEGORY
      ? "CLOSED_LOST"
      : qualification.classification === INBOUND_CLASSIFICATIONS.STRONG_FIT
      ? "FIT_ESTABLISHED"
      : "REPLIED";

  const autoLostReason =
    qualification.classification === INBOUND_CLASSIFICATIONS.EDITORIAL_CONFLICT
      ? LOST_REASONS.WANTED_RANKING_BOOST
      : qualification.classification === INBOUND_CLASSIFICATIONS.UNSUPPORTED_CATEGORY ||
        qualification.classification === INBOUND_CLASSIFICATIONS.TRUST_RISK
      ? LOST_REASONS.WRONG_CATEGORY
      : null;

  const idSeed = `${input.businessName || "lead"}-${day}-${Math.random().toString(36).slice(2, 7)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return {
    leadId: opts.leadId || `plead_${idSeed}`,
    createdAt,
    source: opts.source || "partners_web_form",
    businessName: String(input.businessName || "").trim(),
    cityMarket: String(input.cityMarket || "").trim(),
    contact: String(input.contact || "").trim(),
    category: String(input.category || "").trim() || null,
    bookingUrl: String(input.bookingUrl || "").trim() || null,
    notes: String(input.notes || "").trim() || null,
    packageId: pkg.id,
    packageName: pkg.name,
    priceUsd: pkg.priceUsd,
    stage: initialStage,
    lostReason: autoLostReason,
    classification: qualification.classification,
    fitScoreInternal: qualification.fit.score,
    fitBand: qualification.fit.band,
    nextAction: qualification.nextAction,
    synthetic: syntheticCheck.isSynthetic,
    excludedFromSalesMetrics: syntheticCheck.isSynthetic,
    collectedRevenueUsd: 0,
    history: [
      {
        at: createdAt,
        stage: initialStage,
        note: `Created via ${opts.source || "partners_web_form"} (${qualification.classification})`,
      },
    ],
  };
}

export function transitionPipelineStage(record, nextStage, evidence = {}) {
  if (!record || typeof record !== "object") {
    return { ok: false, error: "Missing lead record." };
  }
  const target = String(nextStage || "").toUpperCase();
  if (!PIPELINE_STAGES.includes(target)) {
    return { ok: false, error: `Unknown pipeline stage: ${nextStage}` };
  }
  const checker = STAGE_EVIDENCE_REQUIREMENTS[target];
  const err = checker ? checker(evidence) : null;
  if (err) {
    return { ok: false, error: err };
  }
  const at = evidence.at || new Date().toISOString();
  const updated = {
    ...record,
    stage: target,
    lostReason: target === "CLOSED_LOST" ? evidence.lostReason : record.lostReason,
    collectedRevenueUsd:
      typeof evidence.collectedRevenueUsd === "number" ? evidence.collectedRevenueUsd : record.collectedRevenueUsd,
    history: [
      ...(Array.isArray(record.history) ? record.history : []),
      {
        at,
        stage: target,
        note: String(evidence.note || `Transitioned to ${target}`),
      },
    ],
  };
  return { ok: true, record: updated };
}

/**
 * Encodes a structured partner lead into `wf_feedback.message` (1800-char safe)
 * so existing production Supabase tables persist full CRM metadata cleanly.
 */
export function formatPartnerLeadStorageMessage(leadRecord) {
  const tag = leadRecord.synthetic ? "[PARTNER LEAD · SYNTHETIC]" : `[PARTNER LEAD · ${leadRecord.packageName.toUpperCase()}]`;
  const header = [
    tag,
    `LeadId: ${leadRecord.leadId}`,
    `Stage: ${leadRecord.stage}`,
    `Class: ${leadRecord.classification}`,
    `Fit: ${leadRecord.fitBand} (${leadRecord.fitScoreInternal})`,
    `Package: ${leadRecord.packageName} ($${leadRecord.priceUsd})`,
    `Business: ${leadRecord.businessName}`,
    `Market: ${leadRecord.cityMarket}`,
    `Contact: ${leadRecord.contact}`,
    leadRecord.category ? `Category: ${leadRecord.category}` : null,
    leadRecord.bookingUrl ? `BookingURL: ${leadRecord.bookingUrl}` : null,
    leadRecord.lostReason ? `LostReason: ${leadRecord.lostReason}` : null,
    leadRecord.notes ? `Notes: ${leadRecord.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return header.slice(0, 1780);
}

export function parsePartnerLeadStorageRow(row) {
  if (!row || typeof row.message !== "string") return null;
  const msg = row.message;
  if (!msg.startsWith("[PARTNER LEAD") && !msg.startsWith("[PARTNER INQUIRY") && row.path !== "/partners") {
    return null;
  }
  const pick = (label) => {
    const m = new RegExp(`^${label}:\\s*(.+)$`, "mi").exec(msg);
    return m ? m[1].trim() : null;
  };
  const synthetic = /SYNTHETIC|\[TEST\]|@example\.com|@wayfind\.test/i.test(msg);
  const fitMatch = /^Fit:\s*([A-Z_]+)(?:\s*\((\d+)\))?/mi.exec(msg);
  const pkgMatch = /\$(99|199|299)\b/.exec(msg);
  return {
    id: row.id,
    createdAt: row.created_at,
    leadId: pick("LeadId") || `wf_fb_${row.id}`,
    stage: pick("Stage") || (row.handled ? "CONTACTED" : "REPLIED"),
    classification: pick("Class") || "NEED_MORE_INFO",
    fitBand: fitMatch ? fitMatch[1] : "POSSIBLE_FIT",
    fitScoreInternal: fitMatch && fitMatch[2] ? Number(fitMatch[2]) : null,
    businessName: pick("Business") || row.place || "Inbound Business",
    cityMarket: pick("Market") || row.loc_name || "Florida",
    contact: pick("Contact") || null,
    category: pick("Category") || null,
    bookingUrl: pick("BookingURL") || null,
    lostReason: pick("LostReason") || null,
    notes: pick("Notes") || null,
    priceUsd: pkgMatch ? Number(pkgMatch[1]) : null,
    handled: Boolean(row.handled),
    synthetic,
    excludedFromSalesMetrics: synthetic,
  };
}

// ── PHASE 6 & PHASE 19–22: PROPOSAL, CAMPAIGN, TRUTH PACK & CARD PREVIEW ────

export function buildPilotProposal(prospectOrLead = {}, opts = {}) {
  const today = opts.today || siteTodayStr();
  const rec = recommendPartnerPackage(prospectOrLead, today);
  const pkg = APPROVED_PACKAGES[rec.packageId] || APPROVED_PACKAGES.quarterly;
  const startsOn = opts.startsOn || addDaysIso(today, 3);
  const endsOn = addDaysIso(startsOn, pkg.durationDays - 1);
  const onlineOk =
    prospectOrLead.onlineBookingAvailable !== false &&
    !(prospectOrLead.publicContact && prospectOrLead.publicContact.onlineBookingAvailable === false);

  return {
    proposalId: `prop_${String(prospectOrLead.id || prospectOrLead.leadId || "pilot").slice(0, 32)}_${startsOn}`,
    businessName: prospectOrLead.name || prospectOrLead.businessName || "Prospective Business",
    cityMarket: prospectOrLead.city || prospectOrLead.cityMarket || "Florida",
    packageId: pkg.id,
    packageName: pkg.name,
    priceUsd: pkg.priceUsd,
    durationDays: pkg.durationDays,
    effectiveDailyUsd: pkg.effectiveDailyUsd,
    commissionPct: 0,
    proposedFlight: {
      startsOn,
      endsOn,
      reviewDecisionDate: addDaysIso(endsOn, 1),
    },
    salesStoryChain: {
      audience: `Active locals and Florida trip-planners browsing within ${opts.radiusMi || SPONSORED_DEFAULT_RADIUS_MI} miles of ${prospectOrLead.city || prospectOrLead.cityMarket || "your venue"}.`,
      intent:
        prospectOrLead.whyYouBrief ||
        "Visitors opening local discovery rails, guides, and multi-stop trip builders while deciding what to book.",
      placement:
        pkg.id === "weekly"
          ? "Geo-gated 'Sponsored · Paid partner' card in local Wayfind discovery."
          : "Geo-gated 'Sponsored · Paid partner' card + crawlable /partners/<slug> business showcase page.",
      action: onlineOk
        ? "Direct 0%-commission UTM handoff via /api/partner/outbound straight to your official booking/ticketing checkout."
        : "Direct handoff to your official visitor info, dock directions, and group-reservation phone line (walk-up flow disclosed honestly).",
      measurement:
        "Server-witnessed non-bot outbound clicks split by card vs showcase page, paired with UTM source=wayfind visibility in your own analytics.",
      review: `End-of-flight review on ${addDaysIso(endsOn, 1)} separating observed clicks from any partner-reconciled bookings before any renewal decision.`,
    },
    includedDeliverables: pkg.includedDeliverables,
    editorialIndependenceClause: COMMERCIAL_TRUTH.editorialFirewallSummary,
    noFakeGuaranteesClause:
      "Wayfind guarantees exact geo-gated delivery, verified links, and honest server-witnessed click reporting. Wayfind never fabricates impression minimums or guaranteed booking counts.",
  };
}

export function buildCampaignObject(input = {}, todayStr) {
  const day = todayStr || siteTodayStr();
  const pkg = APPROVED_PACKAGES[String(input.packageId || "monthly").toLowerCase()] || APPROVED_PACKAGES.monthly;
  const slug = String(input.slug || input.id || input.businessName || "florida-pilot")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const startsOn = input.startsOn || day;
  const endsOn = input.endsOn === null ? null : input.endsOn || addDaysIso(startsOn, pkg.durationDays - 1);
  const href = String(input.href || input.bookingUrl || "").trim();

  const entry = {
    id: slug,
    slug,
    advertiser: String(input.advertiser || input.businessName || input.name || "").trim(),
    label: COMMERCIAL_TRUTH.disclosureStandard,
    status: input.status || "draft",
    packageId: pkg.id,
    priceUsd: input.priceUsd != null ? Number(input.priceUsd) : pkg.priceUsd,
    placeId: input.placeId || null,
    eventId: input.eventId || null,
    name: String(input.name || input.businessName || "").trim(),
    venueLine: String(input.venueLine || `${input.name || input.businessName || ""} · ${input.city || input.cityMarket || "Florida"}`).trim(),
    address: String(input.address || "").trim(),
    lat: Number(input.lat),
    lng: Number(input.lng),
    center: {
      lat: Number(input.center?.lat ?? input.lat),
      lng: Number(input.center?.lng ?? input.lng),
    },
    radiusMi: Number(input.radiusMi || SPONSORED_DEFAULT_RADIUS_MI),
    rail: input.rail || null,
    scoreSnapshotOn: input.scoreSnapshotOn || day,
    rating: input.rating != null ? Number(input.rating) : null,
    reviews: input.reviews != null ? Number(input.reviews) : null,
    headline: String(input.headline || "").trim(),
    body: String(input.body || "").trim(),
    claim: String(input.claim || "").trim(),
    cta: String(input.cta || "Book direct").trim(),
    href,
    phone: input.phone || null,
    staticPhoto: input.staticPhoto || null,
    photoOwnerApproved: Boolean(input.photoOwnerApproved),
    copyFactCheckedAgainstSource: input.copyFactCheckedAgainstSource || href || null,
    startsOn,
    endsOn,
    businessClosed: Boolean(input.businessClosed),
    urlFailed: Boolean(input.urlFailed),
    offerSoldOut: Boolean(input.offerSoldOut),
    page: input.page || null,
  };

  return {
    ...entry,
    derivedWayfindScore: entry.rating != null ? wayfindScore(entry.rating, entry.reviews) : null,
    rank: null,
    utmCardHref: sponsoredHref(entry, "sponsored_card"),
    utmPageHref: sponsoredHref(entry, "partner_page"),
    outboundCardRoute: partnerOutboundHref(entry, "sponsored_card"),
    outboundPageRoute: partnerOutboundHref(entry, "partner_page"),
    pagePath: sponsorPagePath(entry),
  };
}

export function buildPartnerTruthPack(campaign) {
  if (!campaign) return null;
  return {
    campaignId: campaign.id,
    advertiser: campaign.advertiser,
    verifiedFactsOnly: {
      placeId: campaign.placeId,
      officialDestination: campaign.href,
      corroboratedAgainst: campaign.copyFactCheckedAgainstSource,
      geoGateRadiusMi: campaign.radiusMi,
      flightStartsOn: campaign.startsOn,
      flightEndsOn: campaign.endsOn,
      disclosureLabel: campaign.label,
      photoConsentOrBusinessOwned: campaign.photoOwnerApproved,
      organicScoreDerivedNotBought: campaign.derivedWayfindScore,
      hoursPolicy:
        campaign.page && campaign.page.hoursNote
          ? campaign.page.hoursNote
          : "Publish hours only when Google and official booking calendar agree; otherwise defer to live booking calendar.",
    },
  };
}

/**
 * Generates an exact preview payload matching <SponsoredPlaceCard /> props.
 * Explicitly ignores any caller-supplied `wfScore` override so previews can
 * never promise a manipulated Wayfind Score.
 */
export function buildPartnerCardPreview(input = {}, todayStr) {
  const day = todayStr || siteTodayStr();
  const rest = { ...(input || {}) };
  delete rest.wfScore;
  delete rest.wayfindScoreOverride;
  const c = buildCampaignObject({ ...rest, status: "live" }, day);
  const fresh = sponsoredSnapshotFresh(c, day);
  const computedScore = fresh && c.rating != null ? wayfindScore(c.rating, c.reviews) : null;

  return {
    isSamplePreview: input.isSamplePreview !== false,
    sampleDisclosure:
      input.isSamplePreview !== false
        ? "Preview mockup for partner review — organic Wayfind Score is computed strictly from public Google reviews and never modified by sponsorship."
        : null,
    card: {
      id: c.id,
      placeId: c.placeId,
      advertiser: c.advertiser,
      label: COMMERCIAL_TRUTH.disclosureStandard,
      venueLine: c.venueLine,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      headline: c.headline,
      body: c.body,
      claim: c.claim,
      cta: c.cta,
      rating: fresh ? c.rating : null,
      reviews: fresh ? c.reviews : null,
      wfScore: computedScore,
      scoreWithheld: !fresh,
      rank: null,
      radiusMi: c.radiusMi,
      outboundHref: c.utmCardHref,
      outboundTrackHref: c.outboundCardRoute,
      pagePath: c.pagePath,
    },
  };
}

// ── PHASE 23, 24 & 55: CAMPAIGN SAFETY & 12-POINT PRE-LAUNCH QA GATE ────────

export function validatePartnerCampaignForLaunch(campaign = {}, todayStr) {
  const day = todayStr || siteTodayStr();
  const checks = [];
  const add = (id, ok, detail) => checks.push({ id, ok: Boolean(ok), detail });

  const fw = evaluateEditorialFirewall(campaign);
  add("editorial_firewall", fw.allowed, fw.allowed ? "Passes score/rank/affiliation firewall" : fw.violations.map((v) => v.code).join(", "));
  add("disclosure_label", campaign.label === COMMERCIAL_TRUTH.disclosureStandard, `Label must equal "${COMMERCIAL_TRUTH.disclosureStandard}"`);
  add("safe_https_destination", isSafeSponsoredUrl(campaign.href), "Destination href must be public HTTPS URL");
  add("geo_gate_finite", Number.isFinite(campaign.lat) && Number.isFinite(campaign.lng) && campaign.radiusMi > 0 && campaign.radiusMi <= 35, "Valid lat/lng and radiusMi (1..35mi)");
  add("flight_window_explicit", /^\d{4}-\d{2}-\d{2}$/.test(String(campaign.startsOn || "")) && (campaign.endsOn === null || /^\d{4}-\d{2}-\d{2}$/.test(String(campaign.endsOn || ""))), "startsOn and explicit endsOn (or documented null) required");
  add("rank_remains_null", campaign.rank === null || campaign.rank === undefined, "Paid card rank must remain null");
  add("creator_rail_protected", !campaign.rail || !RAILS_NOT_FOR_SALE.includes(campaign.rail), "Attributed creator rails (chef, cindy) cannot be sold");
  add("snapshot_fresh_or_event", Boolean(campaign.eventId && campaign.rating === null) || sponsoredSnapshotFresh(campaign, day), "Google rating snapshot must be <=30 days old at launch");
  add("copy_complete", Boolean(campaign.headline && campaign.body && campaign.cta && campaign.venueLine), "Headline, body, CTA, and venueLine present");
  add("source_corroborated", Boolean(campaign.copyFactCheckedAgainstSource), "Advertiser claims corroborated against official source");
  add("photo_cleared", Boolean(campaign.staticPhoto || campaign.photoRef || campaign.eventId) && campaign.photoOwnerApproved !== false, "Asset present and cleared for commercial display");
  const failReason = sponsoredFailureReason({ ...campaign, status: "live" }, day);
  add("live_gate_ready", failReason === null || failReason === "before_flight_window", `Gate check: ${failReason || "ready"}`);

  const failed = checks.filter((c) => !c.ok);
  return {
    ready: failed.length === 0,
    passedCount: checks.length - failed.length,
    totalChecks: checks.length,
    checks,
    failed,
  };
}

// ── PHASE 14, 34 & 35: OUTREACH GENERATOR & 10-OBJECTION PLAYBOOK ───────────

export const OWNER_OBJECTION_PLAYBOOK = Object.freeze({
  NOT_HEARD_OF_WAYFIND:
    "Totally fair — Wayfind is a newer Florida-focused discovery platform (35 live Florida cities, 59 curated guides, 6,350+ venue opens in the last 30 days). That is why we price entry pilots at $199/month or $299/quarter with 0% booking commission and show you our exact live clicks on your venue before you spend a dollar.",
  HOW_MANY_BOOKINGS_WILL_I_GET:
    "We never invent guaranteed booking counts because final checkout happens on your site. What we guarantee is geo-gated placement to active local planners, 0% Wayfind commission, and a transparent report separating verified human outbound clicks from the UTM bookings you see in your own dashboard.",
  ALREADY_BOOST_INSTAGRAM:
    "Instagram boosts hit people passively scrolling on the couch. Wayfind reaches people actively filtering 'things to do tonight', building multi-stop Florida itineraries, or reading local guides within driving radius of your front door — and sends them straight to your booking page.",
  DONT_NEED_MORE_WEEKEND_TRAFFIC:
    "Most great Florida operators don't have a Saturday 7 PM problem — they have a Tuesday–Thursday or off-peak departure problem. We tailor your card headline and CTA specifically around weekday slots, early seatings, or shoulder departures where marginal profit is highest.",
  CAN_WE_PAY_COMMISSION_INSTEAD:
    "We intentionally charge a tiny flat fee ($199/mo or $299/90 days ≈ $3.32/day) with 0% commission so you keep 100% of every ticket, charter, or table check and own the direct customer relationship.",
  WILL_THIS_IMPROVE_OUR_RANKING:
    "No — and that firewall is actually why readers trust cards on Wayfind. Paid sponsorship never changes your Wayfind Score or organic ranking; it gives you a clearly labeled 'Sponsored · Paid partner' spotlight at the top of the local geo-gate plus a crawlable showcase page.",
  TOO_BUSY_TO_SET_THIS_UP:
    "Zero lift on your side. Send us the single booking URL you want guests to use; our team builds the card and showcase page from your verified site, sends you a 60-second preview link, and only goes live once you reply 'approved'.",
  CALL_US_NEXT_SEASON:
    "Happy to time this to your real demand window — we don't want a dollar during an off-month. Let's lock a calendar check-in 3 weeks before your peak window opens so your showcase page is indexed ahead of the rush.",
  SEND_ME_A_CASE_STUDY:
    "You can inspect our live partner build right now at gowayfind.com/partners/rio-body-wax-gastonia to see the exact card and crawlable page craftsmanship. Because we are launching our founding Florida pilot cohort now, we back your proposal with your own venue's live Wayfind opens rather than generic agency claims.",
  WE_ONLY_TAKE_WALK_INS:
    "If you run walk-up only, we never pretend to track online checkout carts. Instead we point your CTA to dock/door directions, hours, or private-group phone inquiries and measure verified local taps honestly.",
});

export function generateSalesMessages(prospect = {}, todayStr) {
  const day = todayStr || siteTodayStr();
  const proposal = buildPilotProposal(prospect, { today: day });
  const contact = prospect.publicContact || {};
  const name = prospect.name || prospect.businessName || "your venue";
  const city = prospect.city || prospect.cityMarket || "Florida";
  const whyLine =
    prospect.whyYouBrief ||
    `Wayfind readers in ${city} are actively browsing ${prospect.category || "local experiences"} with zero direct partner placement in your slot.`;

  const scoreNote =
    prospect.wayfindScore != null
      ? `Your organic Wayfind Score (${(prospect.wayfindScore / 10).toFixed(1)}) is earned from public reviews and never changes whether you sponsor or not.`
      : "Paid placements are clearly labeled 'Sponsored · Paid partner' and never alter organic Wayfind rankings.";

  return {
    prospectId: prospect.id || null,
    publicChannelToUse: contact.publicEmail || contact.contactFormUrl || contact.instagram || "hello@gowayfind.com",
    channelComplianceNote: contact.publicEmail
      ? `Verified public business email: ${contact.publicEmail}`
      : `No public email listed on site — use official contact form (${contact.contactFormUrl || "on website"}) only.`,
    coldEmail: {
      subject: `${name} on Wayfind (${city}) — direct 0%-commission bookings`,
      body: [
        `Hi ${name} team,`,
        "",
        whyLine,
        "",
        `We're opening one geo-gated '${COMMERCIAL_TRUTH.disclosureStandard}' slot in ${city}: ${proposal.packageName} ($${proposal.priceUsd} flat for ${proposal.durationDays} days, 0% Wayfind commission on direct bookings).`,
        "",
        `Every tap routes straight to ${contact.bookingUrl || contact.officialWebsite || "your official booking page"} with UTM tags so you can verify traffic in your own dashboard. ${scoreNote}`,
        "",
        "Would it be useful if I sent over a 60-second card preview showing how your placement would look to local visitors?",
        "",
        "Best,",
        "Partnerships — Wayfind Team",
        "hello@gowayfind.com | https://www.gowayfind.com/partners",
      ].join("\n"),
    },
    instagramDm: `Hi ${name} team! ${whyLine} We'd love to send over a quick preview of a geo-gated placement in ${city} ($${proposal.priceUsd} flat / ${proposal.durationDays}d, 0% booking commission). Who handles partnerships on your team?`,
    followUp: `Quick follow-up in case this got buried during a busy week at ${name} — happy to send the no-obligation ${city} card preview whenever timing makes sense, or circle back next season if your calendar is full.`,
    proposalSummary: proposal,
    ownerFaq: [
      { q: "Does Wayfind take a cut of tickets or reservations?", a: "0%. Guests check out directly on your own booking system." },
      { q: "Does paying change our Wayfind Score or guide picks?", a: "Never. Scores and editorial guides are 100% independent." },
      { q: "What happens if we don't renew?", a: "Your paid card retires cleanly at flight end while your normal organic listing stays completely intact." },
    ],
    objectionReplies: OWNER_OBJECTION_PLAYBOOK,
    renewalNote: `Hi ${name} team — your ${proposal.durationDays}-day Wayfind flight wraps on ${proposal.proposedFlight.endsOn}. Attached is your verified click breakdown separating observed Wayfind handoffs from your own checkout data so you can decide cleanly whether to renew, adjust creative, or pause.`,
  };
}

// ── PHASE 26–29: HONEST REPORTING, HEALTH GUARD, RENEWAL & CASE STUDIES ──────

/**
 * Generates an honest partner performance report.
 * CRITICAL RULE: Downstream bookings and revenue are `"unknown"` unless
 * explicitly provided via `reconciled` partner checkout evidence — NEVER `0`.
 */
export function generatePartnerReport(campaign = {}, telemetry = {}, reconciled = null) {
  const cardClicks = Number(telemetry.cardOutboundClicks || 0);
  const pageClicks = Number(telemetry.pageOutboundClicks || 0);
  const totalHumanOutbound =
    telemetry.verifiedHumanOutboundClicks != null
      ? Number(telemetry.verifiedHumanOutboundClicks)
      : cardClicks + pageClicks;

  const hasReconciledBookings =
    reconciled && typeof reconciled === "object" && typeof reconciled.confirmedBookings === "number";
  const hasReconciledRevenue =
    reconciled && typeof reconciled === "object" && typeof reconciled.confirmedGrossRevenueUsd === "number";

  const priceUsd = Number(campaign.priceUsd || APPROVED_PACKAGES.monthly.priceUsd);
  const costPerVerifiedClickUsd =
    totalHumanOutbound > 0 ? Number((priceUsd / totalHumanOutbound).toFixed(2)) : null;

  const basketMid = Number(campaign.estimatedBasketUsd || 0);
  const estimatedRange =
    basketMid > 0 && totalHumanOutbound > 0
      ? {
          basis: `Illustrative 3%–8% checkout conversion applied to ${totalHumanOutbound} observed human clicks at ~$${basketMid} basket (model only, not observed checkout truth).`,
          illustrativeBookingsLow: Math.floor(totalHumanOutbound * 0.03),
          illustrativeBookingsHigh: Math.ceil(totalHumanOutbound * 0.08),
        }
      : null;

  return {
    campaignId: campaign.id || campaign.slug || "unknown",
    advertiser: campaign.advertiser || campaign.name || "Sponsored Venue",
    flightWindow: {
      startsOn: campaign.startsOn || null,
      endsOn: campaign.endsOn || null,
      packagePriceUsd: priceUsd,
    },
    observed: {
      verifiedHumanOutboundClicks: totalHumanOutbound,
      cardOutboundClicks: cardClicks,
      partnerPageOutboundClicks: pageClicks,
      suppressedBotOrSyntheticHits: Number(telemetry.suppressedSyntheticOrBotHits || 0),
      partnerPageViews: telemetry.partnerPageViews != null ? Number(telemetry.partnerPageViews) : "unknown",
      directionsClicks: telemetry.directionsClicks != null ? Number(telemetry.directionsClicks) : "unknown",
      phoneClicks: telemetry.phoneClicks != null ? Number(telemetry.phoneClicks) : "unknown",
      costPerVerifiedOutboundClickUsd: costPerVerifiedClickUsd,
    },
    reconciledWithPartner: {
      confirmedBookings: hasReconciledBookings ? reconciled.confirmedBookings : "unknown",
      confirmedGrossRevenueUsd: hasReconciledRevenue ? reconciled.confirmedGrossRevenueUsd : "unknown",
      reconciliationSource: hasReconciledBookings ? String(reconciled.source || "partner_utm_dashboard") : "not_reconciled",
    },
    estimated: estimatedRange,
    unknownDisclosures: [
      !hasReconciledBookings
        ? "Completed bookings on the partner's external domain are 'unknown' (not 0) unless reconciled from the partner's booking dashboard."
        : null,
      "Walk-in visits and word-of-mouth referrals initiated after viewing Wayfind are not directly observable without a partner promo code or post-visit survey.",
    ].filter(Boolean),
  };
}

export function evaluatePartnerHealth(campaign = {}, telemetry = {}, todayStr) {
  const day = todayStr || siteTodayStr();
  const alerts = [];

  const failReason = sponsoredFailureReason(campaign, day);
  if (
    failReason === "business_closed" ||
    failReason === "url_failed" ||
    failReason === "offer_sold_out" ||
    failReason === "unsafe_or_missing_url"
  ) {
    return {
      status: "AUTO_PAUSE",
      alerts: [`CRITICAL_SAFETY_STOP: ${failReason}`],
      recommendedAction: "Keep placement suppressed from live surfaces; organic place record remains untouched.",
    };
  }

  if (failReason === "expired_flight_window") {
    return {
      status: "EXPIRED",
      alerts: [`Flight ended on ${campaign.endsOn}`],
      recommendedAction: "Generate final report and run evaluateRenewalDecision().",
    };
  }

  if (!campaign.eventId && !sponsoredSnapshotFresh(campaign, day)) {
    alerts.push(
      `Google rating/review snapshot (${campaign.scoreSnapshotOn || "missing"}) is older than ${SPONSORED_SNAPSHOT_MAX_DAYS} days — public Wayfind Score is currently withheld on card.`
    );
  }

  const daysElapsed = Number(telemetry.daysElapsed || 0);
  const clicks = Number(telemetry.verifiedHumanOutboundClicks || 0);
  const redirectFailures = Number(telemetry.redirectFailures || 0);

  if (redirectFailures > 0) {
    alerts.push(`Observed ${redirectFailures} outbound redirect failure(s) — verify destination URL health immediately.`);
  }
  if (daysElapsed >= 10 && clicks === 0) {
    alerts.push(`Zero verified human outbound clicks after ${daysElapsed} days — review geo-radius, CTA wording, or seasonal fit.`);
  }

  if (redirectFailures >= 3) {
    return {
      status: "DEGRADED",
      alerts,
      recommendedAction: "Inspect destination checkout URL and consider extending flight days to make partner whole.",
    };
  }
  if (alerts.length > 0) {
    return {
      status: "WATCH",
      alerts,
      recommendedAction: "Refresh stale snapshot or tighten creative/CTA copy at mid-flight check-in.",
    };
  }
  return {
    status: "HEALTHY",
    alerts: [],
    recommendedAction: "Continue normal flight monitoring.",
  };
}

export function evaluateRenewalDecision(campaign = {}, report = {}, health = {}) {
  if (health.status === "AUTO_PAUSE") {
    return {
      decision: "DO_NOT_RENEW",
      reason: `Safety or quality gate triggered (${(health.alerts || []).join("; ")}). Do not take renewal payment.`,
    };
  }
  const clicks = Number(report?.observed?.verifiedHumanOutboundClicks || 0);
  const confirmedBookings = report?.reconciledWithPartner?.confirmedBookings;
  const pkgId = String(campaign.packageId || "monthly").toLowerCase();

  if (typeof confirmedBookings === "number" && confirmedBookings >= 3) {
    return {
      decision: pkgId === "quarterly" ? "RENEW" : "CHANGE_PACKAGE",
      recommendedNextPackage: "quarterly",
      reason: `Confirmed ${confirmedBookings} direct partner bookings; lock in Quarterly Growth ($299 / 90d ≈ $3.32/day) for compounding returns.`,
    };
  }
  if (clicks >= 25) {
    return {
      decision: pkgId === "weekly" ? "CHANGE_PACKAGE" : "RENEW",
      recommendedNextPackage: pkgId === "weekly" ? "monthly" : pkgId,
      reason: `Strong verified local intent (${clicks} human outbound clicks); share UTM reconciliation prompt and renew.`,
    };
  }
  if (clicks >= 8) {
    return {
      decision: "CHANGE_PACKAGE",
      recommendedNextPackage: "monthly",
      reason: `Moderate click volume (${clicks} human outbound clicks); refresh offer hook/CTA or align timing to peak seasonal window before renewing.`,
    };
  }
  return {
    decision: "PAUSE",
    recommendedNextPackage: null,
    reason: `Low observed click volume (${clicks} clicks). Do not push blind renewal — pause or offer complimentary creative/seasonality adjustment first.`,
  };
}

export function generateCaseStudyDraft(campaign = {}, report = {}, opts = {}) {
  if (opts.partnerPermissionGranted !== true) {
    return {
      publishable: false,
      blockedReason: "WRITTEN_PARTNER_PERMISSION_REQUIRED: Never publish partner campaign metrics or quotes publicly without explicit written approval.",
      internalSummaryOnly: {
        campaignId: campaign.id || null,
        observedClicks: report?.observed?.verifiedHumanOutboundClicks ?? 0,
      },
    };
  }
  const isFlorida = /\b(?:FL|Florida)\b/i.test(String(campaign.address || campaign.venueLine || ""));
  return {
    publishable: true,
    marketScopeDisclosure: isFlorida
      ? "Verified Florida direct sponsorship pilot."
      : "Out-of-state direct sponsorship showcase (Gastonia, NC) — disclosed clearly and never represented as a Florida market metric.",
    headline: `${campaign.name || campaign.advertiser}: Direct 0%-Commission Discovery on Wayfind`,
    verifiedFacts: {
      packageId: campaign.packageId || "custom",
      flightStartsOn: campaign.startsOn,
      flightEndsOn: campaign.endsOn,
      verifiedHumanOutboundClicks: report?.observed?.verifiedHumanOutboundClicks ?? 0,
      reconciledBookings: report?.reconciledWithPartner?.confirmedBookings ?? "unknown",
      editorialFirewallMaintained: true,
    },
  };
}
