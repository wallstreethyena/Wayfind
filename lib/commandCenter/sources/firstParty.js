// lib/commandCenter/sources/firstParty.js — Wayfind's own pooled event log
// (public.events) + Supabase Auth, read exclusively through the wf_cc_*
// aggregate RPCs. This is the dashboard's always-on source: it works with no
// third-party keys, counts are exact (no sampling), and nothing row-level
// crosses the wire.
//
// Every helper returns { source, data } — source is srcOk/srcMissing/srcError
// so the UI can label first-party numbers and their freshness precisely.

import { rpc, sbAdmin } from "../supabaseAdmin.js";
import { memTTL } from "../cache.js";
import { srcOk, srcMissing, srcError } from "../respond.js";

const NAME = "Supabase (first-party events)";
const NEXT = "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Vercel environment (Server → Environment Variables).";

function missing() { return { source: srcMissing(NAME, NEXT), data: null }; }

async function call(cacheKey, ttlMs, fn) {
  if (!sbAdmin()) return missing();
  try {
    const data = await memTTL(cacheKey, ttlMs, fn);
    return { source: srcOk(NAME, data && data._stale ? { confidence: "stale-cache" } : {}), data };
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
