// lib/trendSources/pinterestTrends.js — SERVER-ONLY adapter for the licensed
// keyword-trends API this app is approved to read (read-only; connect-app of
// 2026-08-11, app id 1599896).
//
// PROVIDER-ANONYMOUS IN PUBLIC, PROVENANCE INTERNAL: output is factor DATA
// keyed by concept. The provider name lives in the `source` column of
// wf_trend_signals (service-role only) and never in user-facing copy —
// lib/trendDisclosure.js bans it, and scripts/check-trend-sources.mjs executes
// this module to prove the contract rather than reading it.
//
// TOKEN HYGIENE: the access token is read from env AT CALL TIME, sent only as
// an Authorization header to PINTEREST_API_HOST, never logged, never placed in
// a URL, and this module must never be reachable from a client bundle
// (guard-checked: nothing under app/ outside app/api may import trendSources).
// The trial token expires every 24h until the app's trial review clears; an
// expired token surfaces as { ok:false, status:401 } and the cron reports the
// source as degraded instead of throwing.

import { conceptForKeyword } from "./keywordMatch.js";

export const PINTEREST_API_HOST = "https://api.pinterest.com";
export const PINTEREST_REGION = "US";
export const PINTEREST_TREND_TYPES = ["growing", "monthly"];

const finite = (v) => typeof v === "number" && Number.isFinite(v);

export function pinterestConfigured() {
  return Boolean((process.env.PINTEREST_ACCESS_TOKEN || "").trim());
}

// Both documented response shapes normalize here: the analytics shape
// { trends: [{ keyword, pct_growth_wow/mom/yoy, time_series: {date: idx} }] }
// and the keywords shape { keywords: [{ keyword, data: [{date, value}] }] }.
// Series values are a normalized 0..100 interest index, so demandIndex is
// latest/peak (how close to its own high the keyword sits) — never a volume.
export function normalizeTrendRows(payload) {
  const rows = Array.isArray(payload && payload.trends) ? payload.trends
    : Array.isArray(payload && payload.keywords) ? payload.keywords
    : [];
  const out = [];
  for (const r of rows) {
    if (!r || typeof r.keyword !== "string" || !r.keyword.trim()) continue;
    let series = [];
    if (r.time_series && typeof r.time_series === "object" && !Array.isArray(r.time_series)) {
      series = Object.entries(r.time_series)
        .filter(([d, v]) => finite(Number(v)) && !Number.isNaN(Date.parse(d)))
        .map(([d, v]) => ({ date: d, value: Number(v) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    } else if (Array.isArray(r.data)) {
      series = r.data
        .filter((p) => p && finite(Number(p.value)))
        .map((p) => ({ date: p.date, value: Number(p.value) }));
    }
    const latest = series.length ? series[series.length - 1].value : null;
    const peak = series.length ? Math.max(...series.map((p) => p.value)) : null;
    out.push({
      keyword: r.keyword.trim(),
      growthWow: finite(r.pct_growth_wow) ? r.pct_growth_wow : null,
      growthMom: finite(r.pct_growth_mom) ? r.pct_growth_mom : null,
      growthYoy: finite(r.pct_growth_yoy) ? r.pct_growth_yoy : null,
      demandIndex: latest != null && peak != null && peak > 0
        ? Math.max(0, Math.min(1, latest / peak))
        : null,
      seriesPoints: series.length,
    });
  }
  return out;
}

export async function fetchPinterestTrends({ trendType = "growing", limit = 50, includeKeywords = null, fetchImpl = fetch } = {}) {
  const token = (process.env.PINTEREST_ACCESS_TOKEN || "").trim();
  if (!token) return { ok: false, status: 0, error: "unconfigured", rows: [] };
  if (!PINTEREST_TREND_TYPES.includes(trendType)) {
    return { ok: false, status: 0, error: `unknown trendType "${trendType}"`, rows: [] };
  }
  const u = new URL(`${PINTEREST_API_HOST}/v5/trends/keywords/${PINTEREST_REGION}/top/${trendType}`);
  u.searchParams.set("limit", String(Math.max(1, Math.min(50, Number(limit) || 50))));
  if (Array.isArray(includeKeywords) && includeKeywords.length) {
    u.searchParams.set("include_keywords", includeKeywords.slice(0, 25).join(","));
  }
  let r;
  try {
    r = await fetchImpl(u.toString(), {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, error: "network", rows: [] };
  }
  if (!r.ok) return { ok: false, status: r.status, error: `http ${r.status}`, rows: [] };
  let j = null;
  try { j = await r.json(); } catch (e) {
    return { ok: false, status: r.status, error: "bad json", rows: [] };
  }
  return { ok: true, status: r.status, error: null, rows: normalizeTrendRows(j) };
}

/** Pure: normalized rows -> per-concept signal records (unmatched rows drop). */
export function conceptSignalsFromRows(rows, { observedAt } = {}) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const m = conceptForKeyword(row && row.keyword);
    if (!m.key) continue;
    out.push({
      source: "pinterest",
      conceptKey: m.key,
      keyword: row.keyword,
      matchConfidence: m.confidence,
      growthWow: row.growthWow,
      growthMom: row.growthMom,
      growthYoy: row.growthYoy,
      demandIndex: row.demandIndex,
      observedAt: observedAt || new Date().toISOString(),
    });
  }
  return out;
}
