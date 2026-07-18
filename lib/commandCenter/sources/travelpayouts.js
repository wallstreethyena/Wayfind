// lib/commandCenter/sources/travelpayouts.js — provider-confirmed affiliate
// results from the Travelpayouts statistics API (the ONLY affiliate network
// with a server token configured today; Stay22 / Impact / direct-Viator have
// no reporting credentials yet and stay "Not connected" — clicks for those are
// first-party only and are never presented as bookings or revenue).
//
// API (verified against the provider docs 2026-07-18):
//   POST https://api.travelpayouts.com/statistics/v1/execute_query
//   Header X-Access-Token: <TRAVELPAYOUTS_TOKEN>
//   Body: { fields, filters (date filter required), limit }
//   Rows: action_id, date, state (paid | processing | canceled),
//         price_usd, profit_usd / paid_profit_usd, campaign name fields.
//
// Definitions enforced here (mirrors the dashboard glossary):
//   confirmed bookings = rows with state processing or paid (provider-confirmed;
//                        canceled rows are counted separately, never mixed in)
//   revenue            = sum of profit for PAID rows ("verified attributed
//                        commission"); processing profit is shown as PENDING,
//                        clearly split, never merged into revenue.

import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";

const NAME = "Travelpayouts";
const NEXT = "Add TRAVELPAYOUTS_TOKEN (Travelpayouts → Profile → API token) to the Vercel environment. Clicks are tracked first-party either way; this token adds provider-confirmed bookings + commission.";
const API = "https://api.travelpayouts.com/statistics/v1/execute_query";

const day = (d) => new Date(d).toISOString().slice(0, 10);

export function tpConfigured(env = process.env) {
  return String(env.TRAVELPAYOUTS_TOKEN || "").trim().length > 0;
}
export const tpMissing = () => ({ source: srcMissing(NAME, NEXT), data: null });

// Aggregate window stats. Returns null data + labeled source on any failure —
// a provider hiccup must read as "unavailable", never as zero revenue.
export async function tpStats(from, to, opts = {}) {
  const env = opts.env || process.env;
  const token = String(env.TRAVELPAYOUTS_TOKEN || "").trim();
  if (!token) return tpMissing();
  const fetchImpl = opts.fetchImpl || fetch;

  try {
    const data = await memTTL(`tp:${day(from)}:${day(to)}`, 15 * 60 * 1000, async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 12000);
      try {
        const r = await fetchImpl(API, {
          method: "POST",
          headers: { "X-Access-Token": token, "Content-Type": "application/json" },
          body: JSON.stringify({
            // Field list verified against the live API: it rejects unknown
            // fields with 400 ("wrong field: profit_usd"), so only documented
            // ones are requested; paid_profit_usd carries the commission.
            fields: ["action_id", "date", "state", "price_usd", "paid_profit_usd", "campaign_name"],
            filters: [
              { field: "date", op: "ge", value: day(from) },
              { field: "date", op: "le", value: day(to) },
            ],
            limit: 1000,
          }),
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(`travelpayouts ${r.status}: ${t.slice(0, 140)}`);
        }
        const d = await r.json();
        const rows = Array.isArray(d) ? d : d.data || d.results || d.rows || [];
        const num = (v) => { const n = Number(v); return isFinite(n) ? n : 0; };
        const agg = {
          confirmed_bookings: 0, canceled: 0,
          revenue_paid_usd: 0, revenue_pending_usd: 0, order_value_usd: 0,
          by_campaign: {},
        };
        for (const row of rows) {
          const state = String(row.state || "").toLowerCase();
          const camp = String(row.campaign_name || "campaign " + (row.campaign_id || "?"));
          const profit = num(row.paid_profit_usd) || num(row.profit_usd);
          if (state === "canceled" || state === "cancelled") { agg.canceled += 1; continue; }
          if (state === "paid" || state === "processing") {
            agg.confirmed_bookings += 1;
            agg.order_value_usd += num(row.price_usd);
            if (state === "paid") agg.revenue_paid_usd += profit;
            else agg.revenue_pending_usd += profit;
            const c = (agg.by_campaign[camp] = agg.by_campaign[camp] || { bookings: 0, profit_usd: 0 });
            c.bookings += 1; c.profit_usd += profit;
          }
        }
        const total = agg.confirmed_bookings + agg.canceled;
        agg.cancellation_rate = total > 0 ? agg.canceled / total : null;
        agg.rows_seen = rows.length;
        return agg;
      } finally { clearTimeout(timer); }
    });
    return { source: srcOk(NAME, { confidence: "provider-reported" }), data };
  } catch (e) {
    return { source: srcError(NAME, e && e.message), data: null };
  }
}
