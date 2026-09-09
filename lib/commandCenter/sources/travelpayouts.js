// lib/commandCenter/sources/travelpayouts.js — provider-confirmed affiliate
// results from the Travelpayouts statistics API (the ONLY affiliate network
// with a server token configured today; Stay22 / Impact / direct-Viator have
// no reporting credentials yet and stay "Not connected" — clicks for those are
// first-party only and are never presented as bookings or revenue).
//
// API (verified against the provider docs 2026-09-09):
//   POST https://api.travelpayouts.com/statistics/v1/execute_query
//   Header X-Access-Token: <TRAVELPAYOUTS_TOKEN>
//   Body: { fields, filters (date filter required), offset, limit }
//   Response: { results, fields, total_rows, offset, limit }
//   limit defaults to 100 and has a documented maximum of 10,000.
//
// Definitions enforced here (mirrors the dashboard glossary):
//   confirmed bookings = rows with state processing or paid (provider-confirmed;
//                        canceled rows are counted separately, never mixed in)
//   paid revenue       = paid_profit_usd on PAID rows only
//   pending revenue    = profit_usd on PROCESSING rows only

import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";

const NAME = "Travelpayouts";
const NEXT = "Add TRAVELPAYOUTS_TOKEN (Travelpayouts → Profile → API token) to the Vercel environment. Clicks are tracked first-party either way; this token adds provider-confirmed bookings + commission.";
const API = "https://api.travelpayouts.com/statistics/v1/execute_query";
const INITIAL_FIELDS = ["action_id", "date", "state", "price_usd", "paid_profit_usd", "profit_usd", "campaign_id"];
const IDENTITY_FIELDS = new Set(["action_id", "date", "state"]);
const PAGE_LIMIT = 10000;
const MAX_PAGES = 100;
const WARN_TTL_MS = 5 * 60 * 1000;
const WARNED = globalThis.__wfCcSourceWarnings || (globalThis.__wfCcSourceWarnings = new Map());

const day = (d) => new Date(d).toISOString().slice(0, 10);
const numeric = (value) => {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function warnFailure(category, status = null) {
  const key = `travelpayouts:${category}:${status === null ? "none" : status}`;
  const now = Date.now();
  if (now - (WARNED.get(key) || 0) < WARN_TTL_MS) return;
  WARNED.set(key, now);
  console.warn("command_center_source_failure", { source: "travelpayouts", category, ...(status === null ? {} : { status }) });
}

export function tpConfigured(env = process.env) {
  return String(env.TRAVELPAYOUTS_TOKEN || "").trim().length > 0;
}
export const tpMissing = () => ({ source: srcMissing(NAME, NEXT), data: null });

function parsePage(payload, expectedOffset) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("travelpayouts response was not an object");
  if (!Array.isArray(payload.results)) throw new Error("travelpayouts response missing results array");
  if (!Array.isArray(payload.fields)) throw new Error("travelpayouts response missing returned fields");
  const totalRows = numeric(payload.total_rows);
  if (totalRows === null || totalRows < 0 || !Number.isInteger(totalRows)) throw new Error("travelpayouts response missing valid total_rows");
  const offset = numeric(payload.offset);
  if (offset === null || !Number.isInteger(offset) || offset !== expectedOffset) throw new Error(`travelpayouts response returned offset ${String(payload.offset)} for requested offset ${expectedOffset}`);
  const fields = payload.fields.map(String);
  for (const required of IDENTITY_FIELDS) {
    if (!fields.includes(required)) throw new Error(`travelpayouts response missing required field ${required}`);
  }
  return { results: payload.results, fields, totalRows };
}

function missingReason(fields, invalidPaid, invalidPending) {
  const missing = [];
  if (!fields.includes("paid_profit_usd") || invalidPaid) missing.push("paid_profit_usd");
  if (!fields.includes("profit_usd") || invalidPending) missing.push("profit_usd");
  if (!missing.length) return null;
  return {
    reason: "commission_fields_unavailable",
    missingFields: missing,
    note: `Travelpayouts did not provide usable ${missing.join(" and ")}; affected commission totals are unknown.`,
  };
}

// Aggregate window stats. Provider and contract failures return null data. If a
// commission field is unavailable, booking counts survive while only the
// affected money total becomes null and the source is explicitly marked partial.
export async function tpStats(from, to, opts = {}) {
  const env = opts.env || process.env;
  const token = String(env.TRAVELPAYOUTS_TOKEN || "").trim();
  if (!token) { warnFailure("not_configured"); return tpMissing(); }
  const fetchImpl = opts.fetchImpl || fetch;
  const pageLimit = Math.max(1, Math.min(PAGE_LIMIT, Math.floor(numeric(opts.pageLimit) || PAGE_LIMIT)));

  try {
    const data = await memTTL(`tp:${day(from)}:${day(to)}`, 15 * 60 * 1000, async () => {
      let fields = [...INITIAL_FIELDS];
      const omittedFields = [];

      const request = async (offset, allowFieldRepair = false) => {
        for (let attempt = 0; attempt <= INITIAL_FIELDS.length; attempt++) {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 12000);
          try {
            const response = await fetchImpl(API, {
              method: "POST",
              headers: { "X-Access-Token": token, "Content-Type": "application/json" },
              body: JSON.stringify({
                fields,
                filters: [
                  { field: "type", op: "eq", value: "action" },
                  { field: "date", op: "ge", value: day(from) },
                  { field: "date", op: "le", value: day(to) },
                ],
                sort: [{ field: "date", order: "asc" }],
                offset,
                limit: pageLimit,
              }),
              cache: "no-store",
              signal: ctrl.signal,
            });
            if (!response.ok) {
              const message = await response.text().catch(() => "");
              const bad = response.status === 400 ? (message.match(/wrong field:?\s*([\w.]+)/i) || [])[1] : null;
              const droppable = allowFieldRepair && bad && !IDENTITY_FIELDS.has(bad) && fields.includes(bad);
              if (droppable) {
                fields = fields.filter((field) => field !== bad);
                omittedFields.push(bad);
                continue;
              }
              throw Object.assign(new Error(`travelpayouts request failed with HTTP ${response.status}`), { category: "http_error", status: response.status });
            }
            return parsePage(await response.json(), offset);
          } finally {
            clearTimeout(timer);
          }
        }
        throw new Error("travelpayouts rejected too many requested fields");
      };

      const first = await request(0, true);
      const rows = [...first.results];
      let totalRows = first.totalRows;
      let returnedFields = first.fields;
      let pages = 1;
      while (rows.length < totalRows) {
        if (pages >= MAX_PAGES) throw new Error(`travelpayouts result exceeded ${MAX_PAGES} pages`);
        const page = await request(rows.length);
        if (!page.results.length) throw new Error(`travelpayouts pagination stopped at ${rows.length} of ${totalRows} rows`);
        rows.push(...page.results);
        totalRows = Math.max(totalRows, page.totalRows);
        returnedFields = returnedFields.filter((field) => page.fields.includes(field));
        pages += 1;
      }
      if (rows.length !== totalRows) throw new Error(`travelpayouts returned ${rows.length} rows for total_rows ${totalRows}`);

      const actionIds = new Set();
      const knownStates = new Set(["paid", "processing", "canceled", "cancelled"]);
      for (const [index, row] of rows.entries()) {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`travelpayouts row ${index} was not an object`);
        const actionId = row.action_id === null || row.action_id === undefined ? "" : String(row.action_id).trim();
        if (!actionId) throw new Error(`travelpayouts row ${index} missing action_id`);
        if (actionIds.has(actionId)) throw new Error(`travelpayouts returned duplicate action_id at row ${index}`);
        actionIds.add(actionId);
        const state = String(row.state || "").toLowerCase();
        if (!knownStates.has(state)) throw new Error(`travelpayouts row ${index} has unknown state`);
      }

      const verifiedFields = fields.filter((field) => returnedFields.includes(field));
      let invalidPaid = false;
      let invalidPending = false;
      const agg = {
        confirmed_bookings: 0,
        canceled: 0,
        revenue_paid_usd: verifiedFields.includes("paid_profit_usd") ? 0 : null,
        revenue_pending_usd: verifiedFields.includes("profit_usd") ? 0 : null,
        order_value_usd: verifiedFields.includes("price_usd") ? 0 : null,
        by_campaign: {},
        fields_used: verifiedFields,
        fields_omitted: omittedFields,
        rows_seen: rows.length,
        total_rows: totalRows,
        pages_fetched: pages,
      };
      for (const row of rows) {
        const state = String(row && row.state || "").toLowerCase();
        const camp = row && row.campaign_name ? String(row.campaign_name)
          : row && row.campaign_id != null ? "program " + row.campaign_id : "(all programs)";
        if (state === "canceled" || state === "cancelled") { agg.canceled += 1; continue; }
        if (state !== "paid" && state !== "processing") continue;

        agg.confirmed_bookings += 1;
        const price = numeric(row.price_usd);
        if (agg.order_value_usd !== null) {
          if (price === null) agg.order_value_usd = null;
          else agg.order_value_usd += price;
        }
        const profit = numeric(state === "paid" ? row.paid_profit_usd : row.profit_usd);
        if (state === "paid") {
          if (profit === null) { invalidPaid = true; agg.revenue_paid_usd = null; }
          else if (agg.revenue_paid_usd !== null) agg.revenue_paid_usd += profit;
        } else {
          if (profit === null) { invalidPending = true; agg.revenue_pending_usd = null; }
          else if (agg.revenue_pending_usd !== null) agg.revenue_pending_usd += profit;
        }
        const campaign = (agg.by_campaign[camp] = agg.by_campaign[camp] || {
          bookings: 0,
          paid_profit_usd: verifiedFields.includes("paid_profit_usd") ? 0 : null,
          pending_profit_usd: verifiedFields.includes("profit_usd") ? 0 : null,
        });
        campaign.bookings += 1;
        if (profit === null) {
          if (state === "paid") campaign.paid_profit_usd = null;
          else campaign.pending_profit_usd = null;
        } else {
          if (state === "paid" && campaign.paid_profit_usd !== null) campaign.paid_profit_usd += profit;
          else if (state === "processing" && campaign.pending_profit_usd !== null) campaign.pending_profit_usd += profit;
        }
      }
      const total = agg.confirmed_bookings + agg.canceled;
      agg.cancellation_rate = total > 0 ? agg.canceled / total : null;
      const partial = missingReason(verifiedFields, invalidPaid, invalidPending);
      return { agg, partial, fetchedAt: new Date().toISOString() };
    });
    return {
      source: srcOk(NAME, { confidence: "provider-reported", ...(data.partial || {}), fetchedAt: data.fetchedAt, stale: data._stale === true }),
      data: data.agg,
    };
  } catch (error) {
    const category = error && error.category || (error && error.name === "AbortError" ? "timeout" : "invalid_response");
    const status = error && Number.isInteger(error.status) ? error.status : null;
    warnFailure(category, status);
    return { source: srcError(NAME, error && error.message, { category, ...(status === null ? {} : { status }) }), data: null };
  }
}
