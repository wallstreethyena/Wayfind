// GET /api/trending/social — the "Trending on social" shelf of the Trending
// Now poster, ranked server side by the Wayfind Trend Score
// (lib/trendEngine.js, lib/trendingSocial.js). The browser receives only the
// cards for the page it shows; the catalogue and the scoring stay here.
//
//   ?lat&lng          optional origin for local relevance (rounded to 2 dp)
//   ?limit&offset     paging (limit 1..48, default 24)
//   ?audit=1          reconciliation report for the monitors: counts, and the
//                     eligible / present / missing / excluded ids with reasons.
//                     Public data only (post links and Wayfind page ids).
// No metered upstream: two Supabase reads cached 10 minutes in the lambda.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

import { trendingSocial } from "../../../../lib/trendingSocialServer.js";

const round2 = (v) => Math.round(Number(v) * 100) / 100;

export async function GET(request) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const origin = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat: round2(lat), lng: round2(lng) } : null;
  try {
    const { items, audit, socialTable, reconciled } = await trendingSocial({ origin });
    if (url.searchParams.get("audit") === "1") {
      const ok = audit.missing.length === 0 && audit.unknown.length === 0 && audit.broken.length === 0
        && audit.duplicates.length === 0 && audit.excludedWithoutReason.length === 0;
      return Response.json({ ok, socialTable, lastReconciledAt: reconciled && reconciled.at, reconciledFrom: reconciled && reconciled.source, ...audit,
        cards: items.map((it) => ({ rank: it.rank, id: it.id, entity: it.entity.type + ":" + it.entity.id, alternates: it.alternates.map((a) => a.id), score: it.trend.score })) },
      { headers: { "cache-control": "no-store" } });
    }
    const limit = Math.max(1, Math.min(48, Number(url.searchParams.get("limit")) || 24));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const page = items.slice(offset, offset + limit).map(({ trend, ...it }) => ({
      ...it,
      // The receipt is for operators; cards get the score and the honest labels.
      trend: { score: trend.score, labels: trend.labels, distanceMi: trend.distanceMi, ...(url.searchParams.get("why") === "1" ? { receipt: trend.receipt } : {}) },
    }));
    return Response.json({ total: items.length, offset, limit, hasMore: offset + limit < items.length, items: page },
      { headers: { "cache-control": origin ? "private, max-age=300" : "public, s-maxage=300, stale-while-revalidate=3600" } });
  } catch (error) {
    console.error("[api/trending/social] unavailable", { message: String(error && error.message || error) });
    return Response.json({ error: "Trending social is temporarily unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
