// lib/viatorBookings.js — Viator Affiliate Partner API booking ingestion
// (`/partner/bookings/modified-since`), normalization, exact click-token
// reconciliation, sync lease protection, and strict financial separation.
//
// FINANCIAL SEPARATION INVARIANTS
// -------------------------------
// Customer spend (`gross_booking_value`), `estimated_commission`,
// `confirmed_commission`, and `paid_commission` are four distinct columns.
// This module NEVER invents a commission percentage from customer spend, NEVER
// substitutes `gross_booking_value` for missing commission, and keeps missing
// commission visibly `null` (`commission_unknown: true`).
//
// TIMESTAMP & CURRENCY VISIBILITY INVARIANTS
// ------------------------------------------
// 1. Official Viator `/partner/bookings/modified-since` records carry
//    `transactionRef` (modification event identity), `bookingRef` (booking
//    identity), `partnerBookingRef` (partner internal ref, distinct from
//    `campaignValue`), `lastUpdated` (modification timestamp), and
//    `acknowledgeBy` (merchant acknowledgment deadline).
// 2. `acknowledgeBy` is a future deadline and is NEVER used as
//    `provider_modified_at`, `transaction_at`, or `original_booking_at`.
// 3. Missing provider timestamps (`original_booking_at`, `transaction_at`,
//    `provider_modified_at`) and missing `currency` remain visibly `null`
//    rather than silently becoming `new Date().toISOString()` or `"USD"`.

import { randomUUID } from "node:crypto";
import {
  extractViatorClickToken,
  extractPlacementFromCampaignValue,
  isValidViatorClickToken,
} from "./viatorAttribution.js";

export const VIATOR_BOOKINGS_MODIFIED_SINCE_URL =
  "https://api.viator.com/partner/bookings/modified-since";

const CURRENCY_RX = /^[A-Z]{3}$/;

function finiteAmount(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function cleanIsoTimestamp(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = Date.parse(v.trim());
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function cleanCurrencyOrNull(v) {
  if (typeof v !== "string" || !v.trim()) return null;
  const u = v.trim().toUpperCase();
  return CURRENCY_RX.test(u) ? u : null;
}

function cleanRef(v, maxLen = 120) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s.length > maxLen) return null;
  return s;
}

/**
 * Explicitly distinguish raw provider `eventType` / `status` values from
 * Wayfind's internal normalized status and event category.
 *
 * Viator documents `eventType` values on `/partner/bookings/modified-since`:
 *   - `CONFIRMATION`
 *   - `REJECTION`
 *   - `AMENDMENT`
 *   - `CANCELLATION`
 *   - `CUSTOMER_CANCELLATION`
 */
export function normalizeBookingStatus(rawStatus, rawEventType) {
  const rawEv = String(rawEventType || "").trim().toUpperCase();
  const rawSt = String(rawStatus || "").trim().toUpperCase();
  const primary = rawEv || rawSt;
  const raw_event_type = primary || "MISSING_EVENT_TYPE";

  if (
    primary === "CONFIRMATION" ||
    primary === "CONFIRMED" ||
    primary === "BOOKING_CONFIRMED" ||
    primary === "COMPLETED"
  ) {
    return {
      raw_event_type,
      event_type: "CONFIRMED",
      status: "confirmed",
      cancellation_actor: null,
      needs_investigation: false,
    };
  }
  if (
    primary === "AMENDMENT" ||
    primary === "AMENDED" ||
    primary === "BOOKING_AMENDED" ||
    primary === "MODIFIED"
  ) {
    return {
      raw_event_type,
      event_type: "AMENDED",
      status: "amended",
      cancellation_actor: null,
      needs_investigation: false,
    };
  }
  if (primary === "CUSTOMER_CANCELLATION") {
    return {
      raw_event_type: "CUSTOMER_CANCELLATION",
      event_type: "CANCELLED",
      status: "cancelled",
      cancellation_actor: "customer",
      needs_investigation: false,
    };
  }
  if (
    primary === "CANCELLATION" ||
    primary === "CANCELLED" ||
    primary === "CANCELED" ||
    primary === "BOOKING_CANCELLED" ||
    primary === "BOOKING_CANCELED"
  ) {
    return {
      raw_event_type,
      event_type: "CANCELLED",
      status: "cancelled",
      cancellation_actor: "provider_or_operator",
      needs_investigation: false,
    };
  }
  if (
    primary === "REJECTION" ||
    primary === "REJECTED" ||
    primary === "BOOKING_REJECTED" ||
    primary === "FAILED"
  ) {
    return {
      raw_event_type,
      event_type: "REJECTED",
      status: "rejected",
      cancellation_actor: null,
      needs_investigation: false,
    };
  }
  if (primary === "PENDING" || primary === "IN_PROGRESS") {
    return {
      raw_event_type,
      event_type: "PENDING",
      status: "pending",
      cancellation_actor: null,
      needs_investigation: false,
    };
  }

  // Unfamiliar provider event types must NEVER be silently treated as confirmed
  // bookings; preserve them for operator investigation.
  return {
    raw_event_type,
    event_type: "UNRECOGNIZED",
    status: "unrecognized",
    cancellation_actor: null,
    needs_investigation: true,
  };
}

/**
 * Redact a raw Viator `/partner/bookings/modified-since` record for safe
 * diagnostic inspection without exposing customer PII or full tokens.
 */
export function redactViatorRawBookingSample(item) {
  if (!item || typeof item !== "object") return null;
  const bookingRef = cleanRef(
    item.bookingRef ?? item.booking_ref ?? item.bookingReference,
  );
  const transactionRef = cleanRef(item.transactionRef ?? item.transaction_ref);
  const partnerBookingRef = cleanRef(
    item.partnerBookingRef ?? item.partner_booking_ref,
  );
  const bookedItem =
    item.bookedItem && typeof item.bookedItem === "object"
      ? item.bookedItem
      : item.item && typeof item.item === "object"
        ? item.item
        : null;
  const cancellation =
    item.cancellation && typeof item.cancellation === "object"
      ? item.cancellation
      : null;

  return {
    top_level_keys: Object.keys(item).sort(),
    eventType: item.eventType ?? item.event_type ?? null,
    status: item.status ?? item.bookingStatus ?? null,
    bookingRef_prefix: bookingRef ? `${bookingRef.slice(0, 6)}***` : null,
    transactionRef_prefix: transactionRef
      ? `${transactionRef.slice(0, 4)}***`
      : null,
    has_partnerBookingRef: Boolean(partnerBookingRef),
    has_campaignValue: Boolean(
      item.campaignValue ?? item.campaign_value ?? item.campaign,
    ),
    lastUpdated: item.lastUpdated ?? item.lastModified ?? null,
    acknowledgeBy: item.acknowledgeBy ?? null,
    bookedItem_keys: bookedItem ? Object.keys(bookedItem).sort() : null,
    productCode:
      bookedItem?.productCode ?? item.productCode ?? item.product_code ?? null,
    travelDate: bookedItem?.travelDate ?? item.travelDate ?? null,
    cancellation_keys: cancellation ? Object.keys(cancellation).sort() : null,
    cancellationReasonCode: cancellation?.cancellationReasonCode ?? null,
    refundDetails_currencyCode:
      cancellation?.refundDetails?.currencyCode ??
      cancellation?.refundDetails?.currency ??
      null,
  };
}

/**
 * Normalize a single booking item from Viator `/partner/bookings/modified-since`.
 *
 * Preserves strict separation between:
 *   - `booking_ref` (`bookingRef` / `bookingReference`) vs `transaction_ref` (`transactionRef`)
 *   - `campaign_value` (`campaignValue`) vs `partner_booking_ref` (`partnerBookingRef`)
 *   - `provider_modified_at` (`lastUpdated` / `lastModified`) vs `acknowledge_by` (`acknowledgeBy`)
 *   - `gross_booking_value` vs `estimated_commission`, `confirmed_commission`, `paid_commission`
 *   - Missing timestamps and missing currencies remain visibly `null`.
 */
export function normalizeViatorBookingEvent(item) {
  if (!item || typeof item !== "object") return null;

  const bookingItem =
    item.booking && typeof item.booking === "object" ? item.booking : item;

  // Booking identity (`bookingRef` / `bookingReference` / `itineraryId`).
  // Never fall back to `transactionRef` as `booking_ref`.
  const bookingRef = cleanRef(
    item.bookingRef ??
      item.booking_ref ??
      item.bookingReference ??
      bookingItem.bookingRef ??
      bookingItem.booking_ref ??
      bookingItem.bookingReference ??
      item.itineraryId ??
      bookingItem.itineraryId,
    120,
  );
  if (!bookingRef) return null;

  const transactionRef = cleanRef(
    item.transactionRef ??
      item.transaction_ref ??
      bookingItem.transactionRef ??
      bookingItem.transaction_ref,
    120,
  );

  const partnerBookingRef = cleanRef(
    item.partnerBookingRef ??
      item.partner_booking_ref ??
      bookingItem.partnerBookingRef ??
      bookingItem.partner_booking_ref,
    120,
  );

  const {
    raw_event_type,
    event_type,
    status,
    cancellation_actor,
    needs_investigation: statusNeedsInvestigation,
  } = normalizeBookingStatus(
    item.status ?? item.bookingStatus ?? bookingItem.status ?? bookingItem.bookingStatus,
    item.eventType ?? item.event_type ?? bookingItem.eventType ?? bookingItem.event_type,
  );

  // Campaign value is strictly affiliate campaign metadata, NEVER partnerBookingRef.
  const trackingNode =
    item.tracking && typeof item.tracking === "object"
      ? item.tracking
      : bookingItem.tracking && typeof bookingItem.tracking === "object"
        ? bookingItem.tracking
        : null;
  const campaignValueRaw =
    item.campaignValue ??
    item.campaign_value ??
    item.campaign ??
    item.partnerCampaign ??
    bookingItem.campaignValue ??
    bookingItem.campaign_value ??
    bookingItem.campaign ??
    bookingItem.partnerCampaign ??
    trackingNode?.campaignValue ??
    trackingNode?.campaign ??
    null;
  const campaignValue =
    typeof campaignValueRaw === "string" && campaignValueRaw.trim()
      ? campaignValueRaw.trim().slice(0, 200)
      : null;

  const clickToken = extractViatorClickToken(campaignValue);
  const placementCampaign = extractPlacementFromCampaignValue(campaignValue);

  const bookedItemNode =
    item.bookedItem && typeof item.bookedItem === "object"
      ? item.bookedItem
      : bookingItem.bookedItem && typeof bookingItem.bookedItem === "object"
        ? bookingItem.bookedItem
        : item.item && typeof item.item === "object"
          ? item.item
          : bookingItem.item && typeof bookingItem.item === "object"
            ? bookingItem.item
            : null;

  const productCodeRaw =
    item.productCode ??
    item.product_code ??
    bookingItem.productCode ??
    bookingItem.product_code ??
    bookedItemNode?.productCode ??
    bookedItemNode?.product_code ??
    (Array.isArray(item.items) && item.items[0] && item.items[0].productCode) ??
    (Array.isArray(bookingItem.items) &&
      bookingItem.items[0] &&
      bookingItem.items[0].productCode) ??
    null;
  const productCode =
    typeof productCodeRaw === "string" && productCodeRaw.trim()
      ? productCodeRaw.trim().slice(0, 64)
      : null;

  const productOptionCode = cleanRef(
    bookedItemNode?.productOptionCode ??
      item.productOptionCode ??
      bookingItem.productOptionCode,
    64,
  );
  const travelDate = cleanRef(
    bookedItemNode?.travelDate ?? item.travelDate ?? bookingItem.travelDate,
    32,
  );
  const travelTime = cleanRef(
    bookedItemNode?.travelTime ?? item.travelTime ?? bookingItem.travelTime,
    32,
  );

  const cancellationNode =
    item.cancellation && typeof item.cancellation === "object"
      ? item.cancellation
      : bookingItem.cancellation && typeof bookingItem.cancellation === "object"
        ? bookingItem.cancellation
        : null;
  const refundDetailsNode =
    cancellationNode?.refundDetails &&
    typeof cancellationNode.refundDetails === "object"
      ? cancellationNode.refundDetails
      : null;
  const cancellationReasonCode = cleanRef(
    cancellationNode?.cancellationReasonCode ??
      item.cancellationReasonCode ??
      bookingItem.cancellationReasonCode,
    120,
  );

  // Financial extraction — never invent a commission % from gross_booking_value
  // and never substitute gross_booking_value when commission is missing.
  const totalPriceNode = item.totalPrice ?? bookingItem.totalPrice ?? null;
  const grossBookingValue = finiteAmount(
    item.grossBookingValue ??
      item.gross_booking_value ??
      bookingItem.grossBookingValue ??
      totalPriceNode?.price?.recommendedRetailPrice ??
      totalPriceNode?.price?.partnerTotalPrice ??
      totalPriceNode?.amount ??
      (typeof totalPriceNode === "number" ? totalPriceNode : null) ??
      item.bookingValue ??
      bookingItem.bookingValue ??
      refundDetailsNode?.itemPrice,
  );

  const refundAmount = finiteAmount(refundDetailsNode?.refundAmount);
  const refundPercentage = finiteAmount(refundDetailsNode?.refundPercentage);

  const commissionObj =
    item.commission && typeof item.commission === "object"
      ? item.commission
      : bookingItem.commission && typeof bookingItem.commission === "object"
        ? bookingItem.commission
        : {};
  const commissionStatus = String(
    item.commissionStatus ??
      bookingItem.commissionStatus ??
      commissionObj.status ??
      "",
  )
    .trim()
    .toUpperCase();

  let estimatedCommission = finiteAmount(
    item.estimatedCommission ??
      item.estimated_commission ??
      bookingItem.estimatedCommission ??
      commissionObj.estimatedAmount ??
      commissionObj.estimated ??
      (commissionStatus !== "CONFIRMED" &&
      commissionStatus !== "EARNED" &&
      commissionStatus !== "PAID"
        ? commissionObj.amount ??
          item.partnerCommission ??
          bookingItem.partnerCommission ??
          totalPriceNode?.price?.partnerTotalCommission
        : null),
  );

  let confirmedCommission = finiteAmount(
    item.confirmedCommission ??
      item.confirmed_commission ??
      bookingItem.confirmedCommission ??
      commissionObj.confirmedAmount ??
      commissionObj.confirmed ??
      (commissionStatus === "CONFIRMED" || commissionStatus === "EARNED"
        ? commissionObj.amount ??
          item.partnerCommission ??
          bookingItem.partnerCommission ??
          totalPriceNode?.price?.partnerTotalCommission
        : null),
  );

  let paidCommission = finiteAmount(
    item.paidCommission ??
      item.paid_commission ??
      bookingItem.paidCommission ??
      commissionObj.paidAmount ??
      commissionObj.paid ??
      (commissionStatus === "PAID"
        ? commissionObj.amount ??
          item.partnerCommission ??
          bookingItem.partnerCommission
        : null),
  );

  // On cancellation or rejection, active earned/estimated commission is zeroed.
  // On active (confirmed/amended/pending) events, missing commission remains NULL.
  if (status === "cancelled" || status === "rejected") {
    estimatedCommission = 0;
    confirmedCommission = 0;
  }

  const commissionUnknown =
    status !== "cancelled" &&
    status !== "rejected" &&
    estimatedCommission === null &&
    confirmedCommission === null &&
    paidCommission === null;

  // Currency extraction across top-level, totalPrice, commission, bookedItem, and
  // cancellation.refundDetails.currencyCode (e.g. "AUD" in Viator's official example).
  // Never silently defaults to "USD" when absent.
  const explicitCurrency = cleanCurrencyOrNull(
    item.currency ??
      item.currencyCode ??
      bookingItem.currency ??
      bookingItem.currencyCode ??
      totalPriceNode?.currency ??
      totalPriceNode?.currencyCode ??
      totalPriceNode?.price?.currency ??
      totalPriceNode?.price?.currencyCode ??
      commissionObj.currency ??
      commissionObj.currencyCode ??
      refundDetailsNode?.currencyCode ??
      refundDetailsNode?.currency ??
      bookedItemNode?.currencyCode ??
      bookedItemNode?.currency ??
      item.cancellationPolicy?.refundEligibility?.[0]?.currency ??
      item.cancellationPolicy?.refundEligibility?.[0]?.currencyCode,
  );
  const currency = explicitCurrency;

  // Acknowledge deadline (`acknowledgeBy`) is stored separately and NEVER used
  // as `provider_modified_at`, `transaction_at`, or `original_booking_at`.
  const acknowledgeBy = cleanIsoTimestamp(
    item.acknowledgeBy ??
      item.acknowledge_by ??
      bookingItem.acknowledgeBy ??
      bookingItem.acknowledge_by,
  );

  // Provider modification timestamp (`lastUpdated` in Viator `/bookings/modified-since`).
  // Never falls back to `acknowledgeBy` or `new Date().toISOString()`.
  const providerModifiedAt = cleanIsoTimestamp(
    item.lastUpdated ??
      item.last_updated ??
      bookingItem.lastUpdated ??
      bookingItem.last_updated ??
      item.lastModified ??
      bookingItem.lastModified ??
      item.modifiedAt ??
      bookingItem.modifiedAt ??
      item.eventTimestamp ??
      bookingItem.eventTimestamp ??
      item.provider_modified_at ??
      item.transactionDate ??
      bookingItem.transactionDate ??
      item.transaction_at,
  );

  // Explicit booking creation timestamp (`bookingDate` / `createdAt` / `bookedAt`).
  // On a `CONFIRMED` event where only `transactionDate` or `lastUpdated` is supplied,
  // that confirmation timestamp represents the booking confirmation time.
  // On `AMENDMENT`, `CANCELLATION`, `CUSTOMER_CANCELLATION`, or `REJECTION`,
  // `lastUpdated` is the modification time, NOT `original_booking_at`.
  const explicitOriginalBookingAt = cleanIsoTimestamp(
    item.bookingDate ??
      item.booking_date ??
      bookingItem.bookingDate ??
      bookingItem.booking_date ??
      item.createdAt ??
      item.created_at ??
      bookingItem.createdAt ??
      bookingItem.created_at ??
      item.bookedAt ??
      bookingItem.bookedAt ??
      item.originalBookingAt ??
      item.original_booking_at,
  );

  const originalBookingAt =
    explicitOriginalBookingAt ||
    (event_type === "CONFIRMED"
      ? cleanIsoTimestamp(
          item.transactionDate ??
            bookingItem.transactionDate ??
            item.transaction_at ??
            providerModifiedAt,
        )
      : null);

  const transactionAt =
    cleanIsoTimestamp(
      item.transactionDate ??
        bookingItem.transactionDate ??
        item.transaction_at,
    ) ||
    providerModifiedAt ||
    explicitOriginalBookingAt ||
    null;

  const cancellationAt =
    status === "cancelled"
      ? cleanIsoTimestamp(
          item.cancellationDate ??
            bookingItem.cancellationDate ??
            item.cancelledAt ??
            bookingItem.cancelledAt ??
            cancellationNode?.cancelledAt ??
            cancellationNode?.cancellationDate ??
            item.cancellation_at,
        ) ||
        providerModifiedAt ||
        null
      : null;

  const providerEventId = cleanRef(
    item.eventId ?? item.notificationId,
    80,
  );

  const missingAllTimestamps =
    providerModifiedAt === null &&
    transactionAt === null &&
    originalBookingAt === null;

  const missingCurrencyWithAmount =
    currency === null &&
    (grossBookingValue !== null ||
      estimatedCommission !== null ||
      confirmedCommission !== null ||
      paidCommission !== null);

  const needs_investigation =
    Boolean(statusNeedsInvestigation) ||
    missingAllTimestamps ||
    missingCurrencyWithAmount;

  const eventKey = [
    bookingRef,
    transactionRef || "no_tx_ref",
    raw_event_type,
    providerEventId || providerModifiedAt || "missing_ts",
    grossBookingValue === null ? "na" : grossBookingValue.toFixed(2),
    estimatedCommission === null ? "na" : estimatedCommission.toFixed(2),
    confirmedCommission === null ? "na" : confirmedCommission.toFixed(2),
    paidCommission === null ? "na" : paidCommission.toFixed(2),
  ].join("|");

  return {
    event_key: eventKey,
    booking_ref: bookingRef,
    transaction_ref: transactionRef,
    partner_booking_ref: partnerBookingRef,
    raw_event_type,
    event_type,
    status,
    cancellation_actor,
    needs_investigation,
    product_code: productCode,
    campaign_value: campaignValue,
    click_token: isValidViatorClickToken(clickToken) ? clickToken : null,
    placement_campaign: placementCampaign,
    gross_booking_value: grossBookingValue,
    estimated_commission: estimatedCommission,
    confirmed_commission: confirmedCommission,
    paid_commission: paidCommission,
    commission_unknown: commissionUnknown,
    currency,
    currency_explicit: Boolean(explicitCurrency),
    original_booking_at: originalBookingAt,
    original_booking_at_explicit: Boolean(explicitOriginalBookingAt),
    transaction_at: transactionAt,
    provider_modified_at: providerModifiedAt,
    acknowledge_by: acknowledgeBy,
    cancellation_at: cancellationAt,
    raw_summary: {
      booking_ref: bookingRef,
      transaction_ref: transactionRef,
      partner_booking_ref: partnerBookingRef,
      raw_event_type,
      event_type,
      status,
      cancellation_actor,
      cancellation_reason_code: cancellationReasonCode,
      needs_investigation,
      product_code: productCode,
      product_option_code: productOptionCode,
      travel_date: travelDate,
      travel_time: travelTime,
      campaign_value: campaignValue,
      currency,
      currency_explicit: Boolean(explicitCurrency),
      gross_booking_value: grossBookingValue,
      refund_amount: refundAmount,
      refund_percentage: refundPercentage,
      estimated_commission: estimatedCommission,
      confirmed_commission: confirmedCommission,
      paid_commission: paidCommission,
      commission_unknown: commissionUnknown,
      original_booking_at: originalBookingAt,
      original_booking_at_explicit: Boolean(explicitOriginalBookingAt),
      transaction_at: transactionAt,
      provider_modified_at: providerModifiedAt,
      acknowledge_by: acknowledgeBy,
      cancellation_at: cancellationAt,
    },
  };
}

/**
 * Fetch one page from Viator's `/partner/bookings/modified-since` endpoint.
 */
export async function fetchViatorBookingsPage(
  { apiKey, cursor, modifiedSince, count = 500 } = {},
  { fetch: f = globalThis.fetch, endpoint = VIATOR_BOOKINGS_MODIFIED_SINCE_URL } = {},
) {
  if (!apiKey || typeof apiKey !== "string") {
    return { ok: false, reason: "viator_missing_api_key", status: null };
  }
  const u = new URL(endpoint);
  if (cursor) {
    u.searchParams.set("cursor", String(cursor));
  } else if (modifiedSince) {
    u.searchParams.set("modified-since", String(modifiedSince));
  }
  if (count && Number.isFinite(Number(count))) {
    u.searchParams.set("count", String(Math.min(500, Math.max(1, Number(count)))));
  }

  let res;
  try {
    res = await f(u.toString(), {
      method: "GET",
      headers: {
        "exp-api-key": apiKey,
        Accept: "application/json;version=2.0",
        "Accept-Language": "en-US",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    return {
      ok: false,
      reason: `viator_network_error:${e?.message || "fetch"}`,
      status: null,
    };
  }

  if (!res.ok) {
    let errorCode = null;
    try {
      const errJson = await res.json();
      errorCode = errJson?.code || errJson?.errorCode || errJson?.message || null;
    } catch {}
    return {
      ok: false,
      reason: `viator_http_${res.status}`,
      status: res.status,
      provider_error_code: errorCode ? String(errorCode).slice(0, 120) : null,
    };
  }

  let body;
  try {
    body = await res.json();
  } catch {
    return {
      ok: false,
      reason: "viator_invalid_json",
      status: res.status,
    };
  }

  const rawList = Array.isArray(body?.bookings)
    ? body.bookings
    : Array.isArray(body?.data)
      ? body.data
      : null;

  if (!rawList) {
    return {
      ok: false,
      reason: "viator_schema_invalid",
      status: res.status,
    };
  }

  const nextCursor =
    typeof body.nextCursor === "string" && body.nextCursor.trim()
      ? body.nextCursor.trim()
      : typeof body.next_cursor === "string" && body.next_cursor.trim()
        ? body.next_cursor.trim()
        : typeof body.cursor === "string" && body.cursor.trim()
          ? body.cursor.trim()
          : null;

  return {
    ok: true,
    status: res.status,
    topLevelKeys: Object.keys(body || {}).sort(),
    rawBookings: rawList,
    nextCursor,
  };
}

const EVENT_STAGE_ORDER = Object.freeze({
  CONFIRMED: 1,
  PENDING: 2,
  AMENDED: 3,
  CANCELLED: 4,
  REJECTED: 5,
  UNRECOGNIZED: 6,
  UNKNOWN: 7,
});

export function sortNormalizedViatorEvents(events) {
  if (!Array.isArray(events)) return [];
  return events
    .map((ev, index) => ({ ev, index }))
    .sort((a, b) => {
      const ta = a.ev?.provider_modified_at
        ? Date.parse(a.ev.provider_modified_at)
        : Number.POSITIVE_INFINITY;
      const tb = b.ev?.provider_modified_at
        ? Date.parse(b.ev.provider_modified_at)
        : Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      const sa = EVENT_STAGE_ORDER[a.ev?.event_type] || 99;
      const sb = EVENT_STAGE_ORDER[b.ev?.event_type] || 99;
      if (sa !== sb) return sa - sb;
      return a.index - b.index;
    })
    .map((x) => x.ev);
}

/**
 * Sync modified bookings from Viator across pages, acquiring an exclusive
 * sync lease (`wf_viator_acquire_sync_lease`) and reconciling each page
 * durably (`wf_viator_reconcile` with `p_expected_epoch`) BEFORE advancing
 * the stored cursor in `wf_viator_sync_state`.
 */
export async function syncViatorBookings(
  {
    apiKey,
    sb,
    maxPages = 5,
    defaultModifiedSince,
    workerId = `wf-viator-sync-${randomUUID()}`,
    leaseTtlSeconds = 180,
    dryRun = false,
    now = new Date(),
  } = {},
  deps = {},
) {
  if (!apiKey) {
    return { ok: false, reason: "viator_missing_api_key" };
  }
  if (!sb) {
    return { ok: false, reason: "missing_supabase_admin" };
  }

  const f = deps.fetch || globalThis.fetch;
  const nowDate = now instanceof Date ? now : new Date(now);
  const nowIso = nowDate.toISOString();
  const fallbackModifiedSince =
    defaultModifiedSince ||
    new Date(nowDate.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const headers = {
    apikey: sb.key,
    Authorization: `Bearer ${sb.key}`,
    "Content-Type": "application/json",
  };

  // Read durable cursor state from wf_viator_sync_state (id = 1).
  let currentCursor = null;
  let currentWatermark = fallbackModifiedSince;
  try {
    const stateRes = await f(
      `${sb.url}/rest/v1/wf_viator_sync_state?id=eq.1&select=next_cursor,modified_since_watermark,sync_epoch,lease_owner,lease_expires_at`,
      { method: "GET", headers, cache: "no-store" },
    );
    if (!stateRes.ok) {
      return { ok: false, reason: `sync_state_read_http_${stateRes.status}` };
    }
    const rows = await stateRes.json();
    if (Array.isArray(rows) && rows[0]) {
      currentCursor = rows[0].next_cursor || null;
      currentWatermark = rows[0].modified_since_watermark || fallbackModifiedSince;
    }
  } catch (e) {
    return { ok: false, reason: `sync_state_read_error:${e?.message || "err"}` };
  }

  // Secret-safe dry-run probe mode: verifies authenticated access and response
  // schema against `/partner/bookings/modified-since` without mutating state.
  if (dryRun) {
    const probe = await fetchViatorBookingsPage(
      {
        apiKey,
        cursor: currentCursor,
        modifiedSince: currentCursor ? null : currentWatermark,
        count: 10,
      },
      { fetch: f, endpoint: deps.endpoint },
    );
    if (!probe.ok) {
      return {
        ok: false,
        dry_run: true,
        reason: probe.reason,
        http_status: probe.status,
        provider_error_code: probe.provider_error_code || null,
      };
    }
    const sampleNormalized = probe.rawBookings
      .slice(0, 5)
      .map((item) => normalizeViatorBookingEvent(item))
      .filter(Boolean);
    const redactedSamples = probe.rawBookings
      .slice(0, 3)
      .map((item) => redactViatorRawBookingSample(item))
      .filter(Boolean);
    return {
      ok: true,
      dry_run: true,
      http_status: probe.status,
      top_level_keys: probe.topLevelKeys || [],
      raw_booking_count: probe.rawBookings.length,
      has_next_cursor: Boolean(probe.nextCursor),
      redacted_sample_records: redactedSamples,
      sample_event_types: sampleNormalized.map((x) => ({
        raw_event_type: x.raw_event_type,
        status: x.status,
        has_transaction_ref: Boolean(x.transaction_ref),
        has_partner_booking_ref: Boolean(x.partner_booking_ref),
        has_campaign_value: Boolean(x.campaign_value),
        has_click_token: Boolean(x.click_token),
        currency: x.currency,
        commission_unknown: x.commission_unknown,
        provider_modified_at: x.provider_modified_at,
        acknowledge_by: x.acknowledge_by,
        needs_investigation: x.needs_investigation,
      })),
    };
  }

  // Acquire exclusive sync lease so overlapping pollers cannot race or regress
  // the cursor watermark.
  let syncEpoch = null;
  try {
    const leaseRes = await f(
      `${sb.url}/rest/v1/rpc/wf_viator_acquire_sync_lease`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_worker_id: workerId,
          p_now: nowIso,
          p_ttl_seconds: leaseTtlSeconds,
        }),
        cache: "no-store",
      },
    );
    if (leaseRes.ok) {
      const leaseBody = await leaseRes.json();
      if (leaseBody && leaseBody.acquired === false) {
        return {
          ok: true,
          skipped_locked: true,
          reason: leaseBody.reason || "lease_held_by_active_worker",
          active_lease_owner: leaseBody.lease_owner || null,
          sync_epoch: leaseBody.sync_epoch ?? null,
          pages_processed: 0,
          events_normalized: 0,
          events_inserted: 0,
          matched: 0,
          unmatched_no_token: 0,
          unmatched_unknown_token: 0,
          unmatched_expired: 0,
          unmatched_missing_booking_timestamp: 0,
          unrecognized_events: 0,
        };
      }
      if (leaseBody && Number.isFinite(Number(leaseBody.sync_epoch))) {
        syncEpoch = Number(leaseBody.sync_epoch);
        if (leaseBody.next_cursor !== undefined) {
          currentCursor = leaseBody.next_cursor || currentCursor;
        }
        if (leaseBody.modified_since_watermark) {
          currentWatermark = leaseBody.modified_since_watermark;
        }
      }
    }
  } catch (e) {
    return { ok: false, reason: `sync_lease_error:${e?.message || "err"}` };
  }

  let pagesProcessed = 0;
  let eventsNormalized = 0;
  let totalInsertedEvents = 0;
  let totalMatched = 0;
  let totalUnmatchedNoToken = 0;
  let totalUnmatchedUnknown = 0;
  let totalUnmatchedExpired = 0;
  let totalUnmatchedMissingTs = 0;
  let totalUnrecognized = 0;
  let latestModifiedIso = currentWatermark;

  for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
    const page = await fetchViatorBookingsPage(
      {
        apiKey,
        cursor: currentCursor,
        modifiedSince: currentCursor ? null : currentWatermark,
      },
      { fetch: f, endpoint: deps.endpoint },
    );

    if (!page.ok) {
      // Record failure timestamp on wf_viator_sync_state without advancing cursor.
      try {
        await f(`${sb.url}/rest/v1/wf_viator_sync_state?id=eq.1`, {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify({
            last_error: page.reason,
            last_attempt_at: nowIso,
            lease_expires_at: nowIso,
          }),
          cache: "no-store",
        });
      } catch {}
      return {
        ok: false,
        reason: page.reason,
        status: page.status,
        provider_error_code: page.provider_error_code || null,
        pagesProcessed,
      };
    }

    const rawNormalized = [];
    for (const rawItem of page.rawBookings) {
      const n = normalizeViatorBookingEvent(rawItem);
      if (n) {
        rawNormalized.push(n);
        if (n.provider_modified_at && n.provider_modified_at > latestModifiedIso) {
          latestModifiedIso = n.provider_modified_at;
        }
      }
    }
    const normalized = sortNormalizedViatorEvents(rawNormalized);
    eventsNormalized += normalized.length;

    // Reconcile this page's normalized events via RPC wf_viator_reconcile
    // BEFORE advancing the cursor, passing `p_expected_epoch` so a delayed
    // stale worker can never overwrite newer booking state or regress the cursor.
    let reconcileSummary;
    try {
      const rpcPayload = {
        p_events: normalized,
        p_next_cursor: page.nextCursor || currentCursor,
        p_watermark: latestModifiedIso,
        p_synced_at: nowIso,
      };
      if (syncEpoch !== null) {
        rpcPayload.p_expected_epoch = syncEpoch;
        rpcPayload.p_worker_id = workerId;
      }
      const rpcRes = await f(`${sb.url}/rest/v1/rpc/wf_viator_reconcile`, {
        method: "POST",
        headers,
        body: JSON.stringify(rpcPayload),
        cache: "no-store",
      });
      if (!rpcRes.ok) {
        return {
          ok: false,
          reason: `reconcile_rpc_http_${rpcRes.status}`,
          status: rpcRes.status,
          pagesProcessed,
        };
      }
      reconcileSummary = await rpcRes.json();
    } catch (e) {
      return {
        ok: false,
        reason: `reconcile_rpc_error:${e?.message || "err"}`,
        pagesProcessed,
      };
    }

    if (!reconcileSummary || reconcileSummary.ok !== true) {
      return {
        ok: false,
        reason: reconcileSummary?.reason || "reconcile_not_ok",
        pagesProcessed,
      };
    }

    pagesProcessed += 1;
    totalInsertedEvents += Number(reconcileSummary.events_inserted || 0);
    totalMatched += Number(reconcileSummary.matched || 0);
    totalUnmatchedNoToken += Number(reconcileSummary.unmatched_no_token || 0);
    totalUnmatchedUnknown += Number(reconcileSummary.unmatched_unknown_token || 0);
    totalUnmatchedExpired += Number(reconcileSummary.unmatched_expired || 0);
    totalUnmatchedMissingTs += Number(
      reconcileSummary.unmatched_missing_booking_timestamp || 0,
    );
    totalUnrecognized += Number(reconcileSummary.unrecognized_events || 0);

    // Only now advance local cursor for next page iteration.
    if (!page.nextCursor || page.nextCursor === currentCursor || page.rawBookings.length === 0) {
      currentCursor = page.nextCursor || currentCursor;
      break;
    }
    currentCursor = page.nextCursor;
  }

  return {
    ok: true,
    sync_epoch: syncEpoch,
    worker_id: workerId,
    pages_processed: pagesProcessed,
    events_normalized: eventsNormalized,
    events_inserted: totalInsertedEvents,
    matched: totalMatched,
    unmatched_no_token: totalUnmatchedNoToken,
    unmatched_unknown_token: totalUnmatchedUnknown,
    unmatched_expired: totalUnmatchedExpired,
    unmatched_missing_booking_timestamp: totalUnmatchedMissingTs,
    unrecognized_events: totalUnrecognized,
    next_cursor: currentCursor,
    watermark: latestModifiedIso,
  };
}
