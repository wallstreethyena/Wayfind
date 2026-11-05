// lib/viatorBookings.js — Viator Affiliate Partner API booking ingestion
// (`/partner/bookings/modified-since`), normalization, exact click-token
// reconciliation, sync lease protection, and strict financial separation.
//
// FINANCIAL SEPARATION INVARIANTS
// -------------------------------
// Customer spend (`gross_booking_value`), `estimated_commission`,
// `confirmed_commission`, and `paid_commission` are four distinct columns.
// This module NEVER invents a commission percentage from customer spend and
// NEVER labels `gross_booking_value` as Wayfind revenue.
//
// ATTRIBUTION & LIFECYCLE INVARIANTS
// ----------------------------------
// 1. A booking is matched to an outbound click ONLY when its returned
//    `campaignValue` carries an exact `wfv_<32hex>` token that exists in
//    `public.wf_viator_clicks` and `original_booking_at <= click.expires_at`.
// 2. Once a booking is matched, later `AMENDMENT`, `CANCELLATION`, or
//    `CUSTOMER_CANCELLATION` events preserve that established match even if
//    they arrive after `click.expires_at` or after 90-day identifier redaction,
//    and even if the partial event omits `campaignValue` or `totalPrice`.
// 3. Viator raw `eventType` values (`CONFIRMATION`, `REJECTION`, `AMENDMENT`,
//    `CANCELLATION`, `CUSTOMER_CANCELLATION`) are explicitly distinguished from
//    internal normalized statuses (`confirmed`, `rejected`, `amended`,
//    `cancelled`, `pending`, `unrecognized`). Unfamiliar records are preserved
//    with `status = "unrecognized"` and `needs_investigation = true`, never
//    silently treated as confirmed bookings.

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
 * Normalize a single booking item from Viator `/partner/bookings/modified-since`.
 * Preserves strict separation between `gross_booking_value`,
 * `estimated_commission`, `confirmed_commission`, and `paid_commission`, and
 * distinguishes `original_booking_at` from `provider_modified_at`.
 */
export function normalizeViatorBookingEvent(item, nowIso = new Date().toISOString()) {
  if (!item || typeof item !== "object") return null;

  const bookingItem =
    item.booking && typeof item.booking === "object" ? item.booking : item;

  const bookingRef = String(
    item.bookingRef ??
      item.booking_ref ??
      bookingItem.bookingRef ??
      bookingItem.booking_ref ??
      item.transactionRef ??
      bookingItem.transactionRef ??
      item.itineraryId ??
      bookingItem.itineraryId ??
      "",
  ).trim();
  if (!bookingRef || bookingRef.length > 120) return null;

  const {
    raw_event_type,
    event_type,
    status,
    cancellation_actor,
    needs_investigation,
  } = normalizeBookingStatus(
    item.status ?? item.bookingStatus ?? bookingItem.status ?? bookingItem.bookingStatus,
    item.eventType ?? item.event_type ?? bookingItem.eventType ?? bookingItem.event_type,
  );

  const campaignValueRaw =
    item.campaignValue ??
    item.campaign_value ??
    item.campaign ??
    bookingItem.campaignValue ??
    bookingItem.campaign_value ??
    bookingItem.campaign ??
    item.partnerBookingRef ??
    bookingItem.partnerBookingRef ??
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
    bookingItem.productCode ??
    bookingItem.product_code ??
    (item.item && item.item.productCode) ??
    (bookingItem.item && bookingItem.item.productCode) ??
    (Array.isArray(item.items) && item.items[0] && item.items[0].productCode) ??
    (Array.isArray(bookingItem.items) &&
      bookingItem.items[0] &&
      bookingItem.items[0].productCode) ??
    null;
  const productCode =
    typeof productCodeRaw === "string" && productCodeRaw.trim()
      ? productCodeRaw.trim().slice(0, 64)
      : null;

  // Financial extraction — never invent a commission % from gross_booking_value.
  const totalPriceNode = item.totalPrice ?? bookingItem.totalPrice ?? null;
  const grossBookingValue = finiteAmount(
    item.grossBookingValue ??
      item.gross_booking_value ??
      bookingItem.grossBookingValue ??
      totalPriceNode?.price?.recommendedRetailPrice ??
      totalPriceNode?.price?.partnerTotalPrice ??
      totalPriceNode?.amount ??
      item.bookingValue ??
      bookingItem.bookingValue,
  );

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
  if (status === "cancelled" || status === "rejected") {
    estimatedCommission = 0;
    confirmedCommission = 0;
  }

  const explicitCurrency = cleanCurrencyOrNull(
    item.currency ??
      bookingItem.currency ??
      totalPriceNode?.currency ??
      totalPriceNode?.price?.currency ??
      commissionObj.currency ??
      item.cancellationPolicy?.refundEligibility?.[0]?.currency,
  );
  const currency = explicitCurrency || "USD";

  // Distinguish original booking creation timestamp from modification timestamp.
  const explicitOriginalBookingAt = cleanIsoTimestamp(
    item.bookingDate ??
      bookingItem.bookingDate ??
      item.createdAt ??
      bookingItem.createdAt ??
      item.originalBookingAt ??
      item.original_booking_at ??
      (status === "confirmed" ? item.transactionDate ?? item.transaction_at : null),
  );

  const providerModifiedAt =
    cleanIsoTimestamp(
      item.lastModified ??
        bookingItem.lastModified ??
        item.modifiedAt ??
        bookingItem.modifiedAt ??
        item.eventTimestamp ??
        bookingItem.eventTimestamp ??
        item.acknowledgeBy ??
        item.provider_modified_at ??
        item.transactionDate ??
        item.transaction_at,
    ) ||
    explicitOriginalBookingAt ||
    nowIso;

  const transactionAt =
    cleanIsoTimestamp(
      item.transactionDate ??
        bookingItem.transactionDate ??
        item.bookingDate ??
        bookingItem.bookingDate ??
        item.createdAt ??
        bookingItem.createdAt ??
        item.transaction_at,
    ) || providerModifiedAt;

  const originalBookingAt = explicitOriginalBookingAt || transactionAt;

  const cancellationAt =
    status === "cancelled"
      ? cleanIsoTimestamp(
          item.cancellationDate ??
            bookingItem.cancellationDate ??
            item.cancelledAt ??
            bookingItem.cancelledAt ??
            item.cancellation_at,
        ) || providerModifiedAt
      : null;

  const providerEventId =
    typeof item.eventId === "string" && item.eventId.trim()
      ? item.eventId.trim().slice(0, 80)
      : typeof item.notificationId === "string" && item.notificationId.trim()
        ? item.notificationId.trim().slice(0, 80)
        : null;

  const eventKey = [
    bookingRef,
    raw_event_type,
    providerEventId || providerModifiedAt,
    grossBookingValue === null ? "na" : grossBookingValue.toFixed(2),
    estimatedCommission === null ? "na" : estimatedCommission.toFixed(2),
    confirmedCommission === null ? "na" : confirmedCommission.toFixed(2),
    paidCommission === null ? "na" : paidCommission.toFixed(2),
  ].join("|");

  return {
    event_key: eventKey,
    booking_ref: bookingRef,
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
    currency,
    currency_explicit: Boolean(explicitCurrency),
    original_booking_at: originalBookingAt,
    original_booking_at_explicit: Boolean(explicitOriginalBookingAt),
    transaction_at: transactionAt,
    provider_modified_at: providerModifiedAt,
    cancellation_at: cancellationAt,
    raw_summary: {
      booking_ref: bookingRef,
      raw_event_type,
      event_type,
      status,
      cancellation_actor,
      needs_investigation,
      product_code: productCode,
      campaign_value: campaignValue,
      currency,
      currency_explicit: Boolean(explicitCurrency),
      gross_booking_value: grossBookingValue,
      estimated_commission: estimatedCommission,
      confirmed_commission: confirmedCommission,
      paid_commission: paidCommission,
      original_booking_at: originalBookingAt,
      transaction_at: transactionAt,
      provider_modified_at: providerModifiedAt,
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
        : null;

  return {
    ok: true,
    status: res.status,
    rawBookings: rawList,
    nextCursor,
  };
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
      .map((item) => normalizeViatorBookingEvent(item, nowIso))
      .filter(Boolean);
    return {
      ok: true,
      dry_run: true,
      http_status: probe.status,
      raw_booking_count: probe.rawBookings.length,
      has_next_cursor: Boolean(probe.nextCursor),
      sample_event_types: sampleNormalized.map((x) => ({
        raw_event_type: x.raw_event_type,
        status: x.status,
        has_campaign_value: Boolean(x.campaign_value),
        has_click_token: Boolean(x.click_token),
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
    if (!leaseRes.ok) {
      return { ok: false, reason: `sync_lease_http_${leaseRes.status}` };
    }
    {
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
          unrecognized_events: 0,
        };
      }
      if (leaseBody?.acquired !== true || !Number.isSafeInteger(Number(leaseBody.sync_epoch)) || Number(leaseBody.sync_epoch) <= 0) {
        return { ok: false, reason: "sync_lease_invalid_response" };
      }
      {
        syncEpoch = Number(leaseBody.sync_epoch);
        if (leaseBody.next_cursor !== undefined) {
          currentCursor = leaseBody.next_cursor || null;
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
    unrecognized_events: totalUnrecognized,
    next_cursor: currentCursor,
    watermark: latestModifiedIso,
  };
}
