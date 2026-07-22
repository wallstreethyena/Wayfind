export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// Tier-2 popularity cron — rolling batch over the ~100 stalest places
// (wf_popularity_stale_batch, service-role only), category-routed fetchers
// from lib/popularity, one oriented metric per source upserted into
// wf_place_popularity. wf_best_picks auto-blends via
// wf_place_popularity_scored — no ranker change. Every 6 hours (vercel.json)
// ≈ 400 places/day; TripAdvisor hard-capped (free tier is 5k calls/month,
// 2 calls per place). CRON_SECRET-gated like /api/cron/cwv.
import { createClient } from "@supabase/supabase-js";
import { FETCHERS, sourcesFor, SOURCE_CAPS, CONFIDENCE_FLOOR } from "../../../../lib/popularity";

const BATCH = 100;
const PARALLEL = 5;

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return Response.json({ error: "no service key" }, { status: 200 });
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const { data: places, error } = await db.rpc("wf_popularity_stale_batch", { p_n: BATCH });
  if (error || !Array.isArray(places)) return Response.json({ error: "batch failed" }, { status: 200 });

  const spent = {}; // per-source call budget used this run
  const stats = { places: places.length, upserts: 0, skipped_low_confidence: 0, skipped_no_data: 0, by_source: {} };
  const rows = [];

  const work = places.map((p) => async () => {
    for (const src of sourcesFor(p.category)) {
      const cap = SOURCE_CAPS[src];
      if (cap != null && (spent[src] || 0) >= cap) continue;
      spent[src] = (spent[src] || 0) + 1;
      let out = null;
      try { out = await FETCHERS[src](p); } catch (e) { out = null; }
      if (!out || out.metric_value == null) { stats.skipped_no_data++; continue; }
      if (!(out.match_confidence >= CONFIDENCE_FLOOR)) { stats.skipped_low_confidence++; continue; }
      rows.push({
        place_id: p.place_id,
        source: src,
        metric_value: out.metric_value,
        raw: out.raw || null,
        external_id: out.external_id || null,
        match_confidence: out.match_confidence,
        fetched_at: new Date().toISOString(),
      });
      stats.by_source[src] = (stats.by_source[src] || 0) + 1;
    }
  });

  // small rolling pool — kind to every rate limit involved
  let i = 0;
  const runners = Array.from({ length: PARALLEL }, async () => {
    while (i < work.length) { const j = i++; await work[j](); }
  });
  await Promise.all(runners);

  for (let k = 0; k < rows.length; k += 200) {
    const { error: upErr } = await db.from("wf_place_popularity").upsert(rows.slice(k, k + 200), { onConflict: "place_id,source" });
    if (!upErr) stats.upserts += Math.min(200, rows.length - k);
  }

  try { console.log(JSON.stringify({ tag: "popularity_cron", ...stats })); } catch (e) {}
  return Response.json(stats, { status: 200 });
}
