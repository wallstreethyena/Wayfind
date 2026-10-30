// lib/commandCenter/sources/stay22.js — provider-confirmed hotel affiliate
// results from the Stay22 Hub Data Reporting API.
//
// API contract (verified against Stay22 Hub Data Reporting documentation):
//   GET https://api.stay22.com/v1/reporting/transactions
//   Header X-API-KEY: <STAY22_REPORTING_API_KEY | STAY22_API_KEY>
//   Query: startDate/endDate (YYYY-MM-DD), dateFilter=bookedDate, format=json,
//   page (zero-based), limit (1..500). Contract checked 2026-10-30:
//   https://dev.stay22.com/docs/reporting/transactions
//   Canonical rows use bookingId, bookingStatus, campaignId, lastUpdatedDate.
//   The documented response has no payout status or gross booking value; those
//   totals remain unknown unless a response explicitly supplies the fields.
//
// Definitions enforced here:
//   - A click (first-party commerce_cta_clicked / provider_redirect_started) is
//     never treated as a booking or commission.
//   - Booking approval (confirmed/approved) and commission payout (paid) are
//     tracked as separate states.
//   - Canceled, rejected, or reversed transactions are counted separately and
//     never mixed into confirmed or paid totals.
//   - Repeated sync runs or paginated updates deduplicate by transaction id,
//     allowing status transitions (e.g. pending -> approved -> paid, or
//     approved -> canceled/reversed) without duplicating rows.
//   - Non-USD rows without a provider-supplied USD amount are bucketed by
//     currency and mark the USD aggregate partial rather than adding foreign
//     currency face values as USD.

import { memTTL } from "../cache.js";
import { dayStr, SITE_TZ } from "../time.js";
import { srcOk, srcMissing, srcError } from "../respond.js";

const NAME = "Stay22";
const NEXT = "Add STAY22_REPORTING_API_KEY (Stay22 Hub → Data Reporting API → X-API-KEY) to the Vercel production environment. Hotel clicks are tracked first-party either way; this key adds provider-reported bookings and approval status. Paid commission remains unknown when the response does not include payment status.";
const API = "https://api.stay22.com/v1/reporting/transactions";
const DEFAULT_PAGE_LIMIT = 500;
const MAX_PAGE_LIMIT = 500;
const MAX_PAGES = 100;
const WARN_TTL_MS = 5 * 60 * 1000;
const WARNED = globalThis.__wfCcSourceWarnings || (globalThis.__wfCcSourceWarnings = new Map());

export const STAY22_REPORTING_LAG_NOTE =
  "Stay22 transaction reporting lags click-throughs until the provider reports the booking. Booking approval is separate from payment; checkout alone is not proof of paid commission.";

export const STAY22_REPORTING_WINDOW_NOTE =
  "Stay22 uses calendar-date filters. Exact intraday cutoffs and the provider reporting timezone are not verified by its API documentation.";

// Command Center passes UTC instants describing an Eastern [from, to) window.
// Convert the instants at their ET dates, not their UTC dates. Subtract one
// millisecond from the exclusive endpoint, rather than 24 hours: a local day
// can be 23 or 25 hours at DST transitions. These are the requested inclusive
// calendar dates; the provider's undocumented timezone/cutoff remains explicit.
export function stay22DateWindow(from, to) {
  const start = new Date(from);
  const end = new Date(to);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    throw Object.assign(new Error("stay22 reporting requires a non-empty valid date range"), { category: "invalid_range" });
  }
  return { fromDay: dayStr(start), toDay: dayStr(new Date(end.getTime() - 1)) };
}
const numeric = (value) => {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function warnFailure(category, status = null) {
  const key = `stay22:${category}:${status === null ? "none" : status}`;
  const now = Date.now();
  if (now - (WARNED.get(key) || 0) < WARN_TTL_MS) return;
  WARNED.set(key, now);
  console.warn("command_center_source_failure", { source: "stay22", category, ...(status === null ? {} : { status }) });
}

export function stay22Token(env = process.env) {
  return String(env.STAY22_REPORTING_API_KEY || env.STAY22_API_KEY || "").trim();
}

export function stay22Configured(env = process.env) {
  return stay22Token(env).length > 0;
}

export const stay22Missing = () => ({ source: srcMissing(NAME, NEXT), data: null });

const APPROVED_STATES = new Set(["confirmed", "approved", "completed", "paid"]);
const PENDING_STATES = new Set(["pending", "created", "booked", "on_hold", "processing"]);
const REVERSED_STATES = new Set(["canceled", "cancelled", "rejected", "reversed", "refunded", "voided"]);

function classifyTransactionState(row) {
  const rawStatus = String(row.bookingStatus || row.status || row.booking_status || row.state || "").trim().toLowerCase();
  const payoutStatus = String(row.paymentStatus || row.payoutStatus || row.payout_status || row.payment_status || "").trim().toLowerCase();
  const isPaid = payoutStatus === "paid" || payoutStatus === "settled" || Boolean(row.paidAt || row.paid_at);
  const paymentKnown = isPaid || ["pending", "ready", "canceled", "cancelled"].includes(payoutStatus);
  if (REVERSED_STATES.has(rawStatus) || REVERSED_STATES.has(payoutStatus)) {
    return { bucket: "reversed", isPaid: false, paymentKnown: true, rawStatus: rawStatus || payoutStatus };
  }
  if (APPROVED_STATES.has(rawStatus)) {
    return { bucket: "approved", isPaid, paymentKnown, rawStatus };
  }
  if (PENDING_STATES.has(rawStatus)) {
    return { bucket: "pending", isPaid: false, paymentKnown, rawStatus };
  }
  return { bucket: "unknown", isPaid: false, rawStatus };
}

function parsePage(payload, expectedPage, pageLimit) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("stay22 response was not an object");
  }
  if (numeric(payload.statusCode) >= 400 || payload.error) {
    throw new Error("stay22 returned a provider error envelope");
  }
  if (!Array.isArray(payload.data)) throw new Error("stay22 response missing data array");
  const rows = payload.data;
  if (rows.length > pageLimit) throw new Error("stay22 response exceeded requested page limit");
  const returnedPage = numeric(payload.page);
  if (returnedPage !== null && returnedPage !== expectedPage) {
    throw new Error(`stay22 response returned page ${returnedPage} for requested page ${expectedPage}`);
  }
  // Reporting does not document a total/has_more cursor. A short (or empty)
  // page is the only completion receipt; a full last page needs one extra read.
  return { rows, hasMore: rows.length === pageLimit };
}

/**
 * Reconcile one or more batches of Stay22 transaction rows idempotently.
 * Later rows with the same transaction_id (by updated_at timestamp or arrival
 * order) overwrite earlier state, so repeated syncs or status transitions
 * (pending -> approved -> paid, or approved -> canceled/reversed) never double-count.
 */
export function reconcileStay22Transactions(rows = [], { fromDay = null, toDay = null } = {}) {
  if (!Array.isArray(rows)) throw new Error("stay22 transactions input must be an array");
  const byId = new Map();

  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`stay22 row ${index} was not an object`);
    }
    const txId = String(row.bookingId ?? row.transaction_id ?? row.booking_id ?? row.id ?? "").trim();
    if (!txId) throw new Error(`stay22 row ${index} missing bookingId`);
    const state = classifyTransactionState(row);
    if (state.bucket === "unknown") {
      throw new Error(`stay22 row ${index} (${txId}) has unrecognized status '${state.rawStatus}'`);
    }
    const updatedAt = row.lastUpdatedDate || row.updated_at || row.modified_at || row.bookedDate || row.created_at || row.booked_at || null;
    const updatedMs = updatedAt ? Date.parse(String(updatedAt)) : NaN;
    const identity = JSON.stringify([String(row.provider || "").toLowerCase(), txId]);
    const prev = byId.get(identity);
    if (prev && Number.isFinite(prev.updatedMs) && Number.isFinite(updatedMs) && updatedMs < prev.updatedMs) {
      continue; // Ignore out-of-order older snapshot for the same transaction_id
    }
    byId.set(identity, { row, state, updatedMs, txId });
  }

  let confirmedBookings = 0;
  let paidBookings = 0;
  let pendingBookings = 0;
  let canceledBookings = 0;
  let commissionApprovedUsd = 0;
  let commissionPaidUsd = 0;
  let commissionPendingUsd = 0;
  let commissionReversedUsd = 0;
  let grossBookingValueUsd = 0;
  let invalidGrossUsd = false;
  let paymentStatusUnavailable = false;
  let unconvertedForeignCurrency = false;
  const byCurrency = Object.create(null);
  const byCampaign = Object.create(null);

  for (const { row, state } of byId.values()) {
    const currency = String(row.commission_currency || row.currency || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("stay22 transaction missing valid currency");
    const rawCommission = numeric(row.commission ?? row.affiliate_commission ?? row.profit ?? row.payout);
    const explicitUsdCommission = numeric(row.commission_usd ?? row.paid_profit_usd ?? row.profit_usd);
    const usdCommission = currency === "USD" ? (explicitUsdCommission ?? rawCommission) : explicitUsdCommission;

    const rawGross = numeric(row.gross_booking_value ?? row.booking_value ?? row.total_price ?? row.amount);
    const explicitUsdGross = numeric(row.gross_booking_value_usd ?? row.price_usd);
    const usdGross = currency === "USD" ? (explicitUsdGross ?? rawGross) : explicitUsdGross;

    const curBucket = (byCurrency[currency] = byCurrency[currency] || {
      approved_bookings: 0,
      paid_bookings: 0,
      pending_bookings: 0,
      canceled_bookings: 0,
      commission_approved: 0,
      commission_paid: 0,
      commission_pending: 0,
      commission_reversed: 0,
    });

    const campaignId = String(row.campaignId || (Array.isArray(row.campaignIds) && row.campaignIds.length === 1 ? row.campaignIds[0] : "") || row.campaign || row.sub_id || row.click_id || "(unattributed)").trim() || "(unattributed)";
    const campBucket = (byCampaign[campaignId] = byCampaign[campaignId] || {
      approved_bookings: 0,
      paid_bookings: 0,
      pending_bookings: 0,
      canceled_bookings: 0,
      commission_approved_usd: 0,
      commission_paid_usd: 0,
      commission_pending_usd: 0,
    });

    if (state.bucket === "reversed") {
      canceledBookings += 1;
      curBucket.canceled_bookings += 1;
      campBucket.canceled_bookings += 1;
      if (rawCommission !== null) curBucket.commission_reversed = Number((curBucket.commission_reversed + rawCommission).toFixed(4));
      if (usdCommission !== null) {
        commissionReversedUsd = Number((commissionReversedUsd + usdCommission).toFixed(4));
      } else if (rawCommission !== null && currency !== "USD") {
        unconvertedForeignCurrency = true;
      }
      continue;
    }

    if (state.bucket === "pending") {
      pendingBookings += 1;
      curBucket.pending_bookings += 1;
      campBucket.pending_bookings += 1;
      if (rawCommission !== null) curBucket.commission_pending = Number((curBucket.commission_pending + rawCommission).toFixed(4));
      if (usdCommission !== null && commissionPendingUsd !== null) {
        commissionPendingUsd = Number((commissionPendingUsd + usdCommission).toFixed(4));
        if (campBucket.commission_pending_usd !== null) {
          campBucket.commission_pending_usd = Number((campBucket.commission_pending_usd + usdCommission).toFixed(4));
        }
      } else {
        commissionPendingUsd = null;
        campBucket.commission_pending_usd = null;
        if (currency !== "USD") unconvertedForeignCurrency = true;
      }
      continue;
    }

    // state.bucket === "approved"
    confirmedBookings += 1;
    curBucket.approved_bookings += 1;
    campBucket.approved_bookings += 1;

    if (usdGross !== null && !invalidGrossUsd) {
      grossBookingValueUsd = Number((grossBookingValueUsd + usdGross).toFixed(4));
    } else {
      invalidGrossUsd = true;
      grossBookingValueUsd = null;
    }

    if (rawCommission !== null) {
      curBucket.commission_approved = Number((curBucket.commission_approved + rawCommission).toFixed(4));
    }
    if (usdCommission !== null && commissionApprovedUsd !== null) {
      commissionApprovedUsd = Number((commissionApprovedUsd + usdCommission).toFixed(4));
      if (campBucket.commission_approved_usd !== null) {
        campBucket.commission_approved_usd = Number((campBucket.commission_approved_usd + usdCommission).toFixed(4));
      }
    } else {
      commissionApprovedUsd = null;
      campBucket.commission_approved_usd = null;
      if (currency !== "USD") unconvertedForeignCurrency = true;
    }

    if (!state.paymentKnown) paymentStatusUnavailable = true;
    if (state.isPaid) {
      paidBookings += 1;
      curBucket.paid_bookings += 1;
      campBucket.paid_bookings += 1;
      if (rawCommission !== null) {
        curBucket.commission_paid = Number((curBucket.commission_paid + rawCommission).toFixed(4));
      }
      if (usdCommission !== null && commissionPaidUsd !== null) {
        commissionPaidUsd = Number((commissionPaidUsd + usdCommission).toFixed(4));
        if (campBucket.commission_paid_usd !== null) {
          campBucket.commission_paid_usd = Number((campBucket.commission_paid_usd + usdCommission).toFixed(4));
        }
      } else {
        commissionPaidUsd = null;
        campBucket.commission_paid_usd = null;
        if (currency !== "USD") unconvertedForeignCurrency = true;
      }
    }
  }

  const totalResolved = confirmedBookings + canceledBookings;
  const partial = unconvertedForeignCurrency
    ? {
        reason: "multi_currency_unconverted",
        note: "One or more Stay22 transactions were reported in a non-USD currency without a USD conversion field; see by_currency for exact native amounts.",
      }
    : null;

  return {
    agg: {
      confirmed_bookings: confirmedBookings,
      paid_bookings: paymentStatusUnavailable ? null : paidBookings,
      pending_bookings: pendingBookings,
      canceled: canceledBookings,
      commission_approved_usd: commissionApprovedUsd,
      revenue_paid_usd: paymentStatusUnavailable ? null : commissionPaidUsd,
      payment_status_available: !paymentStatusUnavailable,
      revenue_pending_usd: commissionPendingUsd,
      commission_reversed_usd: commissionReversedUsd,
      order_value_usd: invalidGrossUsd ? null : grossBookingValueUsd,
      cancellation_rate: totalResolved > 0 ? canceledBookings / totalResolved : null,
      by_currency: byCurrency,
      by_campaign: byCampaign,
      unique_transactions: byId.size,
      rows_seen: rows.length,
      covered_period: fromDay && toDay ? { from: fromDay, to: toDay, date_filter: "bookedDate", request_timezone: SITE_TZ, granularity: "calendar-date", note: STAY22_REPORTING_WINDOW_NOTE } : null,
      reporting_lag_note: STAY22_REPORTING_LAG_NOTE,
    },
    partial,
  };
}

export async function stay22Stats(from, to, opts = {}) {
  const env = opts.env || process.env;
  const token = stay22Token(env);
  if (!token) {
    warnFailure("not_configured");
    return stay22Missing();
  }
  const fetchImpl = opts.fetchImpl || fetch;
  const pageLimit = Math.max(1, Math.min(MAX_PAGE_LIMIT, Math.floor(numeric(opts.pageLimit) || DEFAULT_PAGE_LIMIT)));
  try {
    const { fromDay, toDay } = stay22DateWindow(from, to);
    const data = await memTTL(`stay22:v3:ET:bookedDate:${fromDay}:${toDay}`, 15 * 60 * 1000, async () => {
      const deadline = Date.now() + (opts.timeoutMs || 12000);
      const requestPage = async (pageIndex) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw Object.assign(new Error("stay22 reporting deadline exceeded"), { category: "timeout" });
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), remaining);
        try {
          const url = new URL(API);
          url.searchParams.set("startDate", fromDay);
          url.searchParams.set("endDate", toDay);
          url.searchParams.set("dateFilter", "bookedDate");
          url.searchParams.set("format", "json");
          url.searchParams.set("limit", String(pageLimit));
          url.searchParams.set("page", String(pageIndex));
          const response = await fetchImpl(url.toString(), {
            method: "GET",
            headers: {
              "X-API-KEY": token,
              Accept: "application/json",
            },
            cache: "no-store",
            signal: ctrl.signal,
          });
          if (!response.ok) {
            throw Object.assign(
              new Error(`stay22 request failed with HTTP ${response.status}`),
              { category: "http_error", status: response.status }
            );
          }
          return parsePage(await response.json(), pageIndex, pageLimit);
        } finally {
          clearTimeout(timer);
        }
      };

      const first = await requestPage(0);
      const rows = [...first.rows];
      let hasMore = first.hasMore;
      const fullPageReceipts = new Set(first.hasMore ? [JSON.stringify(first.rows)] : []);
      let pages = 1;

      while (hasMore) {
        if (pages >= MAX_PAGES) throw new Error(`stay22 result exceeded ${MAX_PAGES} pages`);
        const page = await requestPage(pages);
        if (page.hasMore) {
          const receipt = JSON.stringify(page.rows);
          if (fullPageReceipts.has(receipt)) throw new Error("stay22 pagination repeated a full page");
          fullPageReceipts.add(receipt);
        }
        rows.push(...page.rows);
        hasMore = page.hasMore;
        pages += 1;
      }

      const { agg, partial } = reconcileStay22Transactions(rows, { fromDay, toDay });
      agg.total_rows = rows.length;
      agg.pages_fetched = pages;
      return { agg, partial, fetchedAt: new Date().toISOString() };
    });

    return {
      source: srcOk(NAME, {
        confidence: "provider-reported",
        ...(data.partial || {}),
        fetchedAt: data.fetchedAt,
        stale: data._stale === true,
      }),
      data: data.agg,
    };
  } catch (error) {
    const category = (error && error.category) || (error && error.name === "AbortError" ? "timeout" : "invalid_response");
    const status = error && Number.isInteger(error.status) ? error.status : null;
    warnFailure(category, status);
    return {
      source: srcError(NAME, error && error.message, { category, ...(status === null ? {} : { status }) }),
      data: null,
    };
  }
}
