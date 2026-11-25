// app/api/intelligence/florida/route.js — read-only live intelligence feed for
// What is Trending in Florida and Holiday Special picks.
//
// Zero LLM calls on visitor traffic: reads the Gemini-monitored shared server
// cache written by /api/cron/florida-intelligence (or builds the zero-LLM
// deterministic snapshot if cache is cold), geo-filtered for the reader.
// Guarded in middleware.js (same-origin + per-IP rate limit).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { readFloridaIntelligence } from "../../../../lib/floridaIntelligenceServer.js";

const parseNum = (v) => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const lat = parseNum(searchParams.get("lat"));
    const lng = parseNum(searchParams.get("lng"));
    const mi = parseNum(searchParams.get("mi")) || 60;
    const holidayKey = String(searchParams.get("holiday") || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || null;

    if ((lat != null && (lat < -90 || lat > 90)) || (lng != null && (lng < -180 || lng > 180))) {
      return Response.json({ ok: false, error: "invalid_coordinates" }, { status: 400, headers: { "cache-control": "no-store" } });
    }

    const data = await readFloridaIntelligence({ lat, lng, radiusMi: mi, holidayKey });
    // Command Center and cron can see private diagnostics. The public feed
    // must not disclose provider errors, AI audit notes or board receipts.
    const { monitor, qualityAudit, posterPlan, ...content } = data;
    const publicMonitor = monitor ? { aiActive: monitor.aiActive === true } : null;
    return Response.json(
      { ok: true, ...content, monitor: publicMonitor },
      {
        status: 200,
        headers: {
          "cache-control": lat != null && lng != null ? "private, no-store, max-age=0" : "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch {
    return Response.json({ ok: false, error: "intelligence_unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
