// lib/commandCenter/sources/firstParty.js — Wayfind's own pooled event log
// (public.events) + Supabase Auth, normally read through the wf_cc_* aggregate
// RPCs. This is the dashboard's always-on source: it works with no third-party
// keys, counts are exact (no sampling), and no event rows cross the wire.
//
// Every helper returns { source, data } — source is srcOk/srcMissing/srcError
// so the UI can label first-party numbers and their freshness precisely.

import { rpc, sbAdmin } from "../supabaseAdmin.js";
import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";

const NAME = "Supabase (first-party events)";
const NEXT = "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel environment (Server → Environment Variables).";
const FEEDBACK_NAME = "Supabase (team feedback inbox)";
const FEEDBACK_NEXT = "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel environment so the owner-only Command Center can read saved feedback.";

function missing() { return { source: srcMissing(NAME, NEXT), data: null }; }
function feedbackMissing() { return { source: srcMissing(FEEDBACK_NAME, FEEDBACK_NEXT), data: null }; }

function text(value, limit) {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

function feedbackRow(row) {
  const message = text(row && row.message, 2000);
  return {
    message,
    kind: /^place recommendation:/i.test(message) ? "recommendation" : "feedback",
    sentiment: row && (row.sentiment === "up" || row.sentiment === "down") ? row.sentiment : null,
    path: text(row && row.path, 200),
    place: text(row && row.place, 200),
    created_at: text(row && row.created_at, 64),
    handled: !!(row && row.handled),
  };
}

async function call(cacheKey, ttlMs, fn) {
  if (!sbAdmin()) return missing();
  try {
    const data = await memTTL(cacheKey, ttlMs, fn);
    return { source: srcOk(NAME, {
      ...(data && data._stale ? { confidence: "stale-cache" } : {}),
      note: "Known owner accounts and their linked devices are left out. Older events do not record bot details, so this source cannot remove all past bot visits.",
    }), data };
  } catch (e) {
    return { source: srcError(NAME, e && e.message), data: null };
  }
}

const iso = (d) => new Date(d).toISOString();

// KPI counts for an arbitrary [from,to) window -> { sessions, active_devices, … }
export async function kpis(from, to) {
  return call(`kpis:${+from}:${+to}`, 60 * 1000, async () => {
    const rows = await rpc("wf_cc_kpis", { _from: iso(from), _to: iso(to) });
    const out = {};
    for (const r of rows || []) out[r.metric] = Number(r.n) || 0;
    return out;
  });
}

export async function daily(from, to) {
  return call(`daily:${+from}:${+to}`, 5 * 60 * 1000, () =>
    rpc("wf_cc_daily", { _from: iso(from), _to: iso(to) }));
}

export async function minutes(from, to) {
  return call(`minutes:${+from}:${+to}`, 30 * 1000, () =>
    rpc("wf_cc_minutes", { _from: iso(from), _to: iso(to) }));
}

export async function liveNow() {
  const to = new Date();
  const from = new Date(to.getTime() - 5 * 60 * 1000);
  return call(`live:${Math.floor(to.getTime() / 30000)}`, 25 * 1000, async () => {
    const rows = await rpc("wf_cc_kpis", { _from: iso(from), _to: iso(to) });
    const m = {};
    for (const r of rows || []) m[r.metric] = Number(r.n) || 0;
    return { devices: m.active_devices || 0 };
  });
}

export async function topPlaces(from, to, bucket, limit = 5) {
  return call(`top:${bucket}:${limit}:${+from}:${+to}`, 5 * 60 * 1000, () =>
    rpc("wf_cc_top_places", { _from: iso(from), _to: iso(to), _bucket: bucket, _limit: limit }));
}

export async function breakdown(from, to, kind, limit = 10) {
  return call(`bk:${kind}:${limit}:${+from}:${+to}`, 5 * 60 * 1000, () =>
    rpc("wf_cc_breakdown", { _from: iso(from), _to: iso(to), _kind: kind, _limit: limit }));
}

export async function funnel(from, to) {
  return call(`funnel:${+from}:${+to}`, 5 * 60 * 1000, () =>
    rpc("wf_cc_funnel", { _from: iso(from), _to: iso(to) }));
}

export async function signups(from, to) {
  return call(`signups:${+from}:${+to}`, 5 * 60 * 1000, () =>
    rpc("wf_cc_signups", { _from: iso(from), _to: iso(to) }));
}

export async function userTotals() {
  return call("userTotals", 5 * 60 * 1000, async () => {
    const rows = await rpc("wf_cc_user_totals", {});
    const out = {};
    for (const r of rows || []) out[r.metric] = Number(r.n) || 0;
    return out;
  });
}

export async function retention(from, to) {
  return call(`ret:${+from}:${+to}`, 10 * 60 * 1000, () =>
    rpc("wf_cc_retention", { _from: iso(from), _to: iso(to) }));
}

export async function cohortsWeekly(weeks = 8) {
  return call(`cohorts:${weeks}`, 10 * 60 * 1000, () =>
    rpc("wf_cc_cohorts_weekly", { _weeks: weeks }));
}

export async function newReturning(from, to) {
  return call(`nvr:${+from}:${+to}`, 10 * 60 * 1000, () =>
    rpc("wf_cc_new_returning", { _from: iso(from), _to: iso(to) }));
}

// ── OWNER-EYES-ONLY identity panels (explicit owner decision 2026-07-18) ────
// The ONE deliberate exception to the aggregates-only rule: account emails +
// sharer attribution, served exclusively to the server-verified owner. The
// SQL twin lives in supabase/command-center.sql §12 (same server-only lock).

export async function recentSignups(limit = 50) {
  return call(`recentSignups:${limit}`, 60 * 1000, () =>
    rpc("wf_cc_recent_signups", { _limit: limit }));
}

export async function recentShares(limit = 30) {
  return call(`recentShares:${limit}`, 60 * 1000, () =>
    rpc("wf_cc_recent_shares", { _limit: limit }));
}

// Existing wf_feedback is service-role-only. Its inbox view is deliberately
// narrow: no ids, account identifiers, user agent, location, or build leave
// the server, and the owner route remains read-only.
export async function feedbackInbox(limit = 50, opts = {}) {
  const take = Math.max(1, Math.min(50, Number(limit) || 50));
  const s = sbAdmin(opts.env);
  if (!s) return feedbackMissing();
  try {
    const data = await memTTL(`feedback-inbox:${take}`, 30 * 1000, async () => {
      const fetchImpl = opts.fetchImpl || fetch;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
      try {
        const qs = new URLSearchParams({
          select: "message,sentiment,path,place,created_at,handled",
          order: "created_at.desc",
          limit: String(take),
        });
        const r = await fetchImpl(`${s.url}/rest/v1/wf_feedback?${qs.toString()}`, {
          headers: { apikey: s.key, Authorization: `Bearer ${s.key}` },
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`feedback ${r.status}`);
        const rows = await r.json();
        if (!Array.isArray(rows)) throw new Error("feedback_invalid_response");
        return { limit: take, rows: rows.slice(0, take).map(feedbackRow) };
      } finally {
        clearTimeout(timer);
      }
    });
    return {
      source: srcOk(FEEDBACK_NAME, {
        ...(data && data._stale ? { confidence: "stale-cache" } : {}),
        note: `Latest ${take} saved messages. The inbox is read-only: saved feedback is the source of truth, while email notifications are secondary.`,
      }),
      data,
    };
  } catch (e) {
    return { source: srcError(FEEDBACK_NAME, e && e.message), data: null };
  }
}

// ── v1.3 additions ──────────────────────────────────────────────────────────
// Time to first meaningful action (median/p75 seconds) for a window.
export async function timeToAction(from, to) {
  return call(`tta:${+from}:${+to}`, 5 * 60 * 1000, async () => {
    const rows = await rpc("wf_cc_time_to_action", { _from: iso(from), _to: iso(to) });
    return rows && rows[0] ? rows[0] : { devices_measured: 0, median_s: null, p75_s: null };
  });
}

// Inventory/score coverage (all-time catalog quality context).
export async function scoreCoverage() {
  return call("scoreCoverage", 10 * 60 * 1000, async () => {
    const rows = await rpc("wf_cc_score_coverage", {});
    const out = {};
    for (const r of rows || []) out[r.metric] = Number(r.n) || 0;
    return out;
  });
}
