// lib/viatorBookings.js — Viator Affiliate Partner API booking ingestion
// (`/partner/bookings/modified-since`), normalization, exact click-token
// reconciliation, and strict financial separation.
//
// FINANCIAL SEPARATION INVARIANTS
// -------------------------------
// Customer spend (`gross_booking_value`), `estimated_commission`,
// `confirmed_commission`, and `paid_commission` are four distinct columns.
// This module NEVER invents a commission percentage from customer spend and
// NEVER labels `gross_booking_value` as Wayfind revenue.
//
// ATTRIBUTION INVARIANTS
// ----------------------
// A booking is matched to an outbound click ONLY when its returned
// `campaignValue` carries an exact `wfv_<32hex>` token that exists in
// `public.wf_viator_clicks` within its 30-day attribution window.
// Bookings without a token (`unmatched_no_token`), with an unknown token
// (`unmatched_unknown_token`), or with an expired token (`unmatched_expired`)
// remain explicitly unmatched — never guessed by timestamp, tour, or amount.

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

function cleanCurrency(v) {
  if (typeof v !== "string") return "USD";
  const u = v.trim().toUpperCase();
  return CURRENCY_RX.test(u) ? u : "USD";
}

export function normalizeBookingStatus(rawStatus, rawEventType) {
  const s = String(rawStatus || rawEventType || "").trim().toUpperCase();
  if (s === "CONFIRMED" || s === "BOOKING_CONFIRMED" || s === "COMPLETED") {
    return { status: "confirmed", event_type: "CONFIRMED" };
  }
  if (s === "AMENDED" || s === "BOOKING_AMENDED" || s === "MODIFIED") {
    return { status: "amended", event_type: "AMENDED" };
  }
  if (
    s === "CANCELLED" ||
    s === "CANCELED" ||
    s === "BOOKING_CANCELLED" ||
    s === "BOOKING_CANCELED"
  ) {
    return { status: "cancelled", event_type: "CANCELLED" };
  }
  if (s === "REJECTED" || s === "BOOKING_REJECTED" || s === "FAILED") {
    return { status: "rejected", event_type: "REJECTED" };
  }
  if (s === "PENDING" || s === "IN_PROGRESS") {
    return { status: "pending", event_type: "PENDING" };
  }
  return { status: "unknown", event_type: s || "UNKNOWN" };
}

/**
 * Normalize a single booking item from Viator `/partner/bookings/modified-since`.
 * Preserves strict separation between `gross_booking_value`,
 * `estimated_commission`, `confirmed_commission`, and `paid_commission`.
 */
export function normalizeViatorBookingEvent(item, nowIso = new Date().toISOString()) {
  if (!item || typeof item !== "object") return null;

  const bookingRef = String(
    item.bookingRef ??
      item.booking_ref ??
      item.transactionRef ??
      item.itineraryId ??
      "",
  ).trim();
  if (!bookingRef || bookingRef.length > 120) return null;

  const { status, event_type } = normalizeBookingStatus(
    item.status ?? item.bookingStatus,
    item.eventType ?? item.event_type,
  );

  const campaignValueRaw =
    item.campaignValue ??
    item.campaign_value ??
    item.campaign ??
    item.partnerBookingRef ??
    null;
  const campaignValue =
    typeof campaignValueRaw === "string" && campaignValueRaw.trim()
      ? campaignValueRaw.trim().slice(0, 200)
      : null;

  const clickToken = extractViatorClickToken(campaignValue);
  const placementCampaign = extractPlacementFromCampaignValue(campaignValue);

  const productCodeRaw =
    item.productCode ??
    item.product_code ??
    (item.item && item.item.productCode) ??
    (Array.isArray(item.items) && item.items[0] && item.items[0].productCode) ??
    null;
  const productCode =
    typeof productCodeRaw === "string" && productCodeRaw.trim()
      ? productCodeRaw.trim().slice(0, 64)
      : null;

  // Financial extraction — never invent a commission % from gross_booking_value.
  const grossBookingValue = finiteAmount(
    item.grossBookingValue ??
      item.gross_booking_value ??
      item.totalPrice?.price?.recommendedRetailPrice ??
      item.totalPrice?.price?.partnerTotalPrice ??
      item.totalPrice?.amount ??
      item.bookingValue,
  );

  const commissionObj =
    item.commission && typeof item.commission === "object" ? item.commission : {};
  const commissionStatus = String(
    item.commissionStatus ?? commissionObj.status ?? "",
  )
    .trim()
    .toUpperCase();

  let estimatedCommission = finiteAmount(
    item.estimatedCommission ??
      item.estimated_commission ??
      commissionObj.estimatedAmount ??
      commissionObj.estimated ??
      (commissionStatus !== "CONFIRMED" && commissionStatus !== "PAID"
        ? commissionObj.amount ?? item.partnerCommission
        : null),
  );

  let confirmedCommission = finiteAmount(
    item.confirmedCommission ??
      item.confirmed_commission ??
      commissionObj.confirmedAmount ??
      commissionObj.confirmed ??
      (commissionStatus === "CONFIRMED" || commissionStatus === "EARNED"
        ? commissionObj.amount ?? item.partnerCommission
        : null),
  );

  let paidCommission = finiteAmount(
    item.paidCommission ??
      item.paid_commission ??
      commissionObj.paidAmount ??
      commissionObj.paid ??
      (commissionStatus === "PAID"
        ? commissionObj.amount ?? item.partnerCommission
        : null),
  );

  // On cancellation or rejection, active earned/estimated commission is zeroed.
  if (status === "cancelled" || status === "rejected") {
    if (estimatedCommission !== null) estimatedCommission = 0;
    if (confirmedCommission !== null) confirmedCommission = 0;
  }

  const currency = cleanCurrency(
    item.currency ??
      item.totalPrice?.currency ??
      commissionObj.currency ??
      "USD",
  );

  const transactionAt =
    cleanIsoTimestamp(
      item.transactionDate ??
        item.bookingDate ??
        item.createdAt ??
        item.transaction_at,
    ) || nowIso;

  const providerModifiedAt =
    cleanIsoTimestamp(
      item.lastModified ??
        item.modifiedAt ??
        item.eventTimestamp ??
        item.provider_modified_at,
    ) || transactionAt;

  const cancellationAt =
    status === "cancelled"
      ? cleanIsoTimestamp(
          item.cancellationDate ?? item.cancelledAt ?? item.cancellation_at,
        ) || providerModifiedAt
      : null;

  const eventKey = [
    bookingRef,
    event_type,
    providerModifiedAt,
    grossBookingValue === null ? "na" : grossBookingValue.toFixed(2),
    estimatedCommission === null ? "na" : estimatedCommission.toFixed(2),
    confirmedCommission === null ? "na" : confirmedCommission.toFixed(2),
    paidCommission === null ? "na" : paidCommission.toFixed(2),
  ].join("|");

  return {
    event_key: eventKey,
    booking_ref: bookingRef,
    event_type,
    status,
    product_code: productCode,
    campaign_value: campaignValue,
    click_token: isValidViatorClickToken(clickToken) ? clickToken : null,
    placement_campaign: placementCampaign,
    gross_booking_value: grossBookingValue,
    estimated_commission: estimatedCommission,
    confirmed_commission: confirmedCommission,
    paid_commission: paidCommission,
    currency,
    transaction_at: transactionAt,
    provider_modified_at: providerModifiedAt,
    cancellation_at: cancellationAt,
    raw_summary: {
      booking_ref: bookingRef,
      event_type,
      status,
      product_code: productCode,
      campaign_value: campaignValue,
      currency,
      gross_booking_value: grossBookingValue,
      estimated_commission: estimatedCommission,
      confirmed_commission: confirmedCommission,
      paid_commission: paidCommission,
      transaction_at: transactionAt,
      provider_modified_at: providerModifiedAt,
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
    return {
      ok: false,
      reason: `viator_http_${res.status}`,
      status: res.status,
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
        : null;

  return {
    ok: true,
    status: res.status,
    rawBookings: rawList,
    nextCursor,
  };
}

/**
 * Sync modified bookings from Viator across pages, reconciling each page
 * durably BEFORE advancing the stored cursor in `wf_viator_sync_state`.
 */
export async function syncViatorBookings(
  {
    apiKey,
    sb,
    maxPages = 5,
    defaultModifiedSince,
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

  // 1. Read durable cursor state from wf_viator_sync_state (id = 1).
  let currentCursor = null;
  let currentWatermark = fallbackModifiedSince;
  try {
    const stateRes = await f(
      `${sb.url}/rest/v1/wf_viator_sync_state?id=eq.1&select=next_cursor,modified_since_watermark`,
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

  let pagesProcessed = 0;
  let eventsNormalized = 0;
  let totalInsertedEvents = 0;
  let totalMatched = 0;
  let totalUnmatchedNoToken = 0;
  let totalUnmatchedUnknown = 0;
  let totalUnmatchedExpired = 0;
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
          }),
          cache: "no-store",
        });
      } catch {}
      return {
        ok: false,
        reason: page.reason,
        status: page.status,
        pagesProcessed,
      };
    }

    const normalized = [];
    for (const rawItem of page.rawBookings) {
      const n = normalizeViatorBookingEvent(rawItem, nowIso);
      if (n) {
        normalized.push(n);
        if (n.provider_modified_at && n.provider_modified_at > latestModifiedIso) {
          latestModifiedIso = n.provider_modified_at;
        }
      }
    }
    eventsNormalized += normalized.length;

    // 2. Reconcile this page's normalized events via RPC wf_viator_reconcile
    //    BEFORE advancing the cursor.
    let reconcileSummary;
    try {
      const rpcRes = await f(`${sb.url}/rest/v1/rpc/wf_viator_reconcile`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          p_events: normalized,
          p_next_cursor: page.nextCursor || currentCursor,
          p_watermark: latestModifiedIso,
          p_synced_at: nowIso,
        }),
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

    // 3. Only now advance local cursor for next page iteration.
    if (!page.nextCursor || page.nextCursor === currentCursor || page.rawBookings.length === 0) {
      currentCursor = page.nextCursor || currentCursor;
      break;
    }
    currentCursor = page.nextCursor;
  }

  return {
    ok: true,
    pages_processed: pagesProcessed,
    events_normalized: eventsNormalized,
    events_inserted: totalInsertedEvents,
    matched: totalMatched,
    unmatched_no_token: totalUnmatchedNoToken,
    unmatched_unknown_token: totalUnmatchedUnknown,
    unmatched_expired: totalUnmatchedExpired,
    next_cursor: currentCursor,
    watermark: latestModifiedIso,
  };
}
