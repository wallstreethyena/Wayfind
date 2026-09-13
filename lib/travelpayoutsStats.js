// Server-only Travelpayouts booking-statistics reader and reconciler.
// The provider response is treated as an accounting input: identity fields,
// pagination and totals must all reconcile before any database write occurs.
import { normalizeTpSubId } from "./travelpayoutsAttribution.js";
import { TP_PROGRAMS } from "./travelpayouts.js";

export const TP_CAMPAIGNS = Object.freeze(
  ["tiqets", "klook", "gocity"].map((provider) => positiveInt(TP_PROGRAMS[provider]?.campaignId, `${provider} campaignId`)),
);
// Contract: https://support.travelpayouts.com/hc/en-us/articles/360019864079
const ENDPOINT = "https://api.travelpayouts.com/statistics/v1/execute_query";
const PAGE_SIZE = 1000;
const MAX_PAGES_PER_CAMPAIGN = 5;
const MAX_ROWS = PAGE_SIZE * MAX_PAGES_PER_CAMPAIGN * TP_CAMPAIGNS.length;
const REQUIRED_FIELDS = Object.freeze([
  "sub_id", "action_id", "campaign_id", "date", "created_at", "updated_at", "state", "action_type",
]);
const OPTIONAL_MONEY_FIELDS = Object.freeze(["profit_usd", "paid_profit_usd", "price_usd"]);

export function travelpayoutsUtcDate(value) {
  if (!(value instanceof Date) && (typeof value !== "string" || !value.trim())) {
    throw new Error("Travelpayouts date is invalid");
  }
  const d = value instanceof Date ? value : new Date(timestamp(value, "Travelpayouts date"));
  if (!Number.isFinite(d.getTime())) throw new Error("Travelpayouts date is invalid");
  return d.toISOString().slice(0, 10);
}

function positiveInt(value, label, { allowZero = false, numericOnly = false } = {}) {
  if (typeof value !== "number" && (numericOnly || typeof value !== "string" || !/^\d+$/.test(value))) {
    throw new Error(`${label} is not a valid integer`);
  }
  const n = Number(value);
  if (!Number.isSafeInteger(n) || (allowZero ? n < 0 : n <= 0)) throw new Error(`${label} is not a valid integer`);
  return n;
}

function bookingDate(value, label = "date") {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} is invalid`);
  const d = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new Error(`${label} is invalid`);
  return value;
}

function timestamp(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is missing`);
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(raw)) {
    throw new Error(`${label} is invalid`);
  }
  bookingDate(raw.slice(0, 10), label);
  // The provider example omits a zone. UTC is our explicit interpretation;
  // the provider documentation does not specify the timezone for those values.
  const explicit = raw.length === 10 ? `${raw}T00:00:00Z`
    : raw.replace(" ", "T") + (/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? "" : "Z");
  const d = new Date(explicit);
  if (!Number.isFinite(d.getTime()) || (raw.length > 10 && Number(raw.slice(11, 13)) > 23)) {
    throw new Error(`${label} is invalid`);
  }
  return d.toISOString();
}

// Keep one caller-owned deadline active through both headers and body reads,
// and through database thenables even if a transport ignores cancellation.
async function withSignal(operation, signal) {
  if (!signal) return await operation();
  signal.throwIfAborted();
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason || new Error("Travelpayouts deadline exceeded"));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(operation), aborted]); }
  finally { signal.removeEventListener("abort", onAbort); }
}

function money(value, label) {
  if (value == null || value === "") return null;
  const raw = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw))) throw new Error(`${label} is not finite money`);
  return raw;
}

/** Normalize one booking. Non-Wayfind sub_ids return null; malformed wf_ ids fail. */
export function normalizeTravelpayoutsBooking(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("booking row is not an object");
  for (const field of REQUIRED_FIELDS) {
    if (!Object.hasOwn(row, field) || (field !== "sub_id" && (row[field] == null || row[field] === ""))) {
      throw new Error(`booking ${field} is missing`);
    }
  }
  if (row.action_type !== "booking") throw new Error("booking action_type is not booking");
  const campaignId = positiveInt(row.campaign_id, "campaign_id");
  if (!TP_CAMPAIGNS.includes(campaignId)) throw new Error("booking campaign_id is not supported");
  const actionId = row.action_id;
  if (typeof actionId !== "string" || !/^[A-Za-z0-9_.:-]{1,160}$/.test(actionId)) throw new Error("action_id is invalid");
  const createdAt = timestamp(row.created_at, "created_at");
  const updatedAt = timestamp(row.updated_at, "updated_at");
  if (new Date(updatedAt).getTime() < new Date(createdAt).getTime()) throw new Error("updated_at precedes created_at");
  bookingDate(row.date);
  if (typeof row.state !== "string") throw new Error("booking state is unknown");
  const rawState = row.state.trim().toLowerCase();
  const state = rawState === "cancelled" ? "canceled" : rawState === "processing" ? "pending" : rawState;
  if (!["pending", "paid", "canceled"].includes(state)) throw new Error("booking state is unknown");
  if (row.sub_id != null && typeof row.sub_id !== "string") throw new Error("booking sub_id is invalid");
  const rawSubId = (row.sub_id || "").trim();
  const token = normalizeTpSubId(rawSubId);
  if (!token) {
    if (/^\.*wf_/i.test(rawSubId)) throw new Error("Wayfind sub_id is malformed");
    return null;
  }

  return {
    network: "travelpayouts",
    campaign_id: campaignId,
    action_id: actionId,
    sub_id: token,
    action_type: "booking",
    action_created_at: createdAt,
    provider_updated_at: updatedAt,
    state,
    profit_usd: money(row.profit_usd, "profit_usd"),
    paid_profit_usd: money(row.paid_profit_usd, "paid_profit_usd"),
    price_usd: money(row.price_usd, "price_usd"),
  };
}

function unsupportedOptionalField(status, detail, fields) {
  if (status !== 400) return null;
  const text = String(detail || "");
  // Only an explicit named field error can shrink the requested schema.
  return OPTIONAL_MONEY_FIELDS.find((field) => fields.includes(field) && (
    new RegExp(`(?:wrong|unknown|invalid|unsupported)\\s+field(?:\\s+name)?[\\s:"'\\[\\]]+${field}\\b`, "i").test(text)
    || new RegExp(`\\b${field}[\\s:"'\\[\\]]+(?:is\\s+)?(?:an?\\s+)?(?:unknown|invalid|unsupported)\\s+field\\b`, "i").test(text)
  )) || null;
}

async function requestPage({ campaignId, from, through, offset, fields, token, fetchImpl, signal }) {
  const response = await withSignal(() => fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { "X-Access-Token": token, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      fields,
      filters: [
        { field: "type", op: "eq", value: "action" },
        { field: "action_type", op: "eq", value: "booking" },
        { field: "campaign_id", op: "eq", value: campaignId },
        { field: "date", op: "ge", value: from },
        { field: "date", op: "le", value: through },
      ],
      sort: [{ field: "updated_at", order: "asc" }],
      offset,
      limit: PAGE_SIZE,
    }),
    cache: "no-store",
    signal,
  }), signal);
  const bodyText = await withSignal(() => response.text(), signal);
  if (!response.ok) return { error: true, status: response.status, detail: bodyText };
  let body;
  try { body = JSON.parse(bodyText); } catch { throw new Error("Travelpayouts statistics returned invalid JSON"); }
  if (!body || body.success === false || !Array.isArray(body.results) || !Array.isArray(body.fields)) {
    throw new Error("Travelpayouts statistics response shape changed");
  }
  if (body.fields.length !== fields.length || new Set(body.fields).size !== fields.length
      || fields.some((field) => !body.fields.includes(field))) {
    throw new Error("Travelpayouts response fields did not match the request");
  }
  const metaOffset = positiveInt(body.offset, "response offset", { allowZero: true, numericOnly: true });
  const metaLimit = positiveInt(body.limit, "response limit", { numericOnly: true });
  const total = positiveInt(body.total_rows, "response total", { allowZero: true, numericOnly: true });
  if (metaOffset !== offset || metaLimit !== PAGE_SIZE) throw new Error("Travelpayouts pagination echo did not match the request");
  if (total > PAGE_SIZE * MAX_PAGES_PER_CAMPAIGN) throw new Error(`Travelpayouts campaign ${campaignId} exceeded the pagination cap`);
  const expected = Math.min(PAGE_SIZE, Math.max(0, total - offset));
  if (body.results.length !== expected) throw new Error("Travelpayouts page length did not match its total");
  return { data: body.results, total };
}

/** Fetch every visible booking for the configured campaigns without silent truncation. */
export async function fetchTravelpayoutsBookings({ from, through = new Date(), token, fetchImpl = fetch, signal } = {}) {
  if (typeof token !== "string" || !token.trim()) throw new Error("TRAVELPAYOUTS_TOKEN is missing");
  if (!from) throw new Error("earliest Travelpayouts click is missing");
  from = travelpayoutsUtcDate(from);
  through = travelpayoutsUtcDate(through);
  if (from > through) throw new Error("Travelpayouts date range is reversed");
  const all = [];
  const identities = new Set();
  let fields = REQUIRED_FIELDS.concat(OPTIONAL_MONEY_FIELDS);
  let fieldRepairs = 0;

  for (const campaignId of TP_CAMPAIGNS) {
    let expectedTotal = null;
    let offset = 0;
    let pages = 0;
    while (expectedTotal == null || offset < expectedTotal) {
      if (pages >= MAX_PAGES_PER_CAMPAIGN) throw new Error(`Travelpayouts campaign ${campaignId} exceeded the pagination cap`);
      let page = await requestPage({ campaignId, from, through, offset, fields, token, fetchImpl, signal });
      while (page.error) {
        const removable = unsupportedOptionalField(page.status, page.detail, fields);
        if (offset !== 0 || !removable || fieldRepairs >= OPTIONAL_MONEY_FIELDS.length) {
          throw new Error(`Travelpayouts statistics HTTP ${page.status}`);
        }
        fieldRepairs += 1;
        fields = fields.filter((field) => field !== removable);
        page = await requestPage({ campaignId, from, through, offset, fields, token, fetchImpl, signal });
      }
      if (expectedTotal == null) expectedTotal = page.total;
      else if (page.total !== expectedTotal) throw new Error(`Travelpayouts campaign ${campaignId} total changed during pagination`);

      for (const raw of page.data) {
        const normalized = normalizeTravelpayoutsBooking(raw);
        if (positiveInt(raw.campaign_id, "campaign_id") !== campaignId) throw new Error("Travelpayouts row escaped its campaign filter");
        if (raw.date < from || raw.date > through) throw new Error("Travelpayouts row escaped its date filter");
        const actionIdentity = `${campaignId}:${raw.action_id}`;
        if (identities.has(actionIdentity)) throw new Error(`Travelpayouts duplicate action identity ${actionIdentity}`);
        identities.add(actionIdentity);
        if (normalized) all.push(normalized);
        if (identities.size > MAX_ROWS) throw new Error("Travelpayouts response exceeded the global row cap");
      }
      offset += page.data.length;
      pages += 1;
      if (!page.data.length && offset < expectedTotal) throw new Error("Travelpayouts pagination stopped before total");
    }
  }
  return all;
}

export async function earliestTravelpayoutsClick(db, { signal } = {}) {
  let query = db.from("wf_tp_clicks")
    .select("clicked_at")
    .eq("network", "travelpayouts")
    .order("clicked_at", { ascending: true })
    .limit(1);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await withSignal(() => query, signal);
  if (error) throw new Error(`wf_tp_clicks read failed: ${error.message || error}`);
  if (!Array.isArray(data) || data.length > 1) throw new Error("wf_tp_clicks returned an invalid earliest-click response");
  if (!data.length) return null;
  return timestamp(data[0].clicked_at, "earliest clicked_at");
}

function validatedCounts(value, expected) {
  if (Array.isArray(value) && value.length !== 1) throw new Error("wf_tp_reconcile returned invalid count rows");
  const row = Array.isArray(value) ? value[0] : value;
  const keys = ["received", "inserted", "updated", "stale", "unmatched", "invalid"];
  if (!row || typeof row !== "object") throw new Error("wf_tp_reconcile returned no counts");
  const out = {};
  for (const key of keys) {
    if (!Number.isSafeInteger(row[key]) || row[key] < 0) throw new Error(`wf_tp_reconcile returned invalid ${key}`);
    out[key] = row[key];
  }
  if (out.received !== expected || out.inserted + out.updated + out.stale + out.unmatched + out.invalid !== expected) {
    throw new Error("wf_tp_reconcile counts did not reconcile");
  }
  return out;
}

export async function reconcileTravelpayouts(db, rows, { signal } = {}) {
  if (!Array.isArray(rows)) throw new Error("Travelpayouts rows must be an array");
  if (rows.length > MAX_ROWS) throw new Error("Travelpayouts rows exceeded the global row cap");
  const totals = { received: 0, inserted: 0, updated: 0, stale: 0, unmatched: 0, invalid: 0 };
  for (let offset = 0; offset < rows.length; offset += 1000) {
    const batch = rows.slice(offset, offset + 1000);
    let query = db.rpc("wf_tp_reconcile", { p_rows: batch });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await withSignal(() => query, signal);
    if (error) throw new Error(`wf_tp_reconcile failed: ${error.message || error}`);
    const counts = validatedCounts(data, batch.length);
    for (const key of Object.keys(totals)) totals[key] += counts[key];
  }
  if (totals.invalid || totals.unmatched) {
    const error = new Error(`wf_tp_reconcile rejected rows: ${totals.invalid} invalid, ${totals.unmatched} unmatched`);
    error.counts = totals;
    throw error;
  }
  return totals;
}
