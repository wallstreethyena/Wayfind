// lib/trendSources/googleTrendsRss.js — keyless daily trending-searches feed
// (public RSS, geo=US). No auth, no quota contract. Treated as a WEAK
// corroboration source: it says "this phrase spiked in general search today",
// which for niche concepts is rare — absence here means NOTHING and must never
// read as "not trending". Same rule as every trendSources module: data out,
// no user-facing copy, provider name internal-only.

import { conceptForKeyword } from "./keywordMatch.js";

export const GOOGLE_TRENDS_RSS_URL = "https://trends.google.com/trending/rss?geo=US";

// "200K+" / "1M+" / "20,000+" -> number, else null. The feed's traffic figure
// is an order-of-magnitude estimate, which is exactly how it is consumed.
export function parseApproxTraffic(s) {
  const t = String(s == null ? "" : s).trim().toUpperCase().replace(/[+,]/g, "");
  const m = t.match(/^(\d+(?:\.\d+)?)([KM])?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2] === "M" ? n * 1e6 : m[2] === "K" ? n * 1e3 : n;
}

export function parseTrendingRss(xml) {
  const items = [];
  const txt = String(xml || "");
  const rx = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = rx.exec(txt))) {
    const block = m[1];
    const pick = (tag) => {
      const t = block.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`));
      return t && t[1] ? t[1].trim() : null;
    };
    const title = pick("title");
    if (!title) continue;
    items.push({
      title,
      approxTraffic: parseApproxTraffic(pick("ht:approx_traffic")),
      pubDate: pick("pubDate"),
    });
  }
  return items;
}

export async function fetchGoogleTrendingRss({ fetchImpl = fetch } = {}) {
  let r;
  try {
    r = await fetchImpl(GOOGLE_TRENDS_RSS_URL, {
      headers: { Accept: "application/rss+xml,text/xml,application/xml" },
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, error: "network", items: [] };
  }
  if (!r.ok) return { ok: false, status: r.status, error: `http ${r.status}`, items: [] };
  const xml = await r.text();
  return { ok: true, status: r.status, error: null, items: parseTrendingRss(xml) };
}

/** Pure: RSS items -> per-concept signal records (unmatched titles drop). */
export function conceptSignalsFromItems(items, { observedAt } = {}) {
  const out = [];
  for (const it of Array.isArray(items) ? items : []) {
    const m = conceptForKeyword(it && it.title);
    if (!m.key) continue;
    const t = it.approxTraffic;
    // log scale: 10k ~ 0.57, 100k ~ 0.71, 1M ~ 0.86, 10M+ -> 1. An
    // order-of-magnitude feed deserves an order-of-magnitude normalization.
    const demandIndex = typeof t === "number" && t > 0 ? Math.min(1, Math.log10(t) / 7) : null;
    out.push({
      source: "google_trends",
      conceptKey: m.key,
      keyword: it.title,
      matchConfidence: m.confidence,
      growthWow: null,
      growthMom: null,
      growthYoy: null,
      demandIndex,
      observedAt: observedAt || new Date().toISOString(),
    });
  }
  return out;
}
