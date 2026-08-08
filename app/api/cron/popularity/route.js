export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// Tier-2 popularity cron — rolling batch over the ~100 stalest places
// (wf_popularity_stale_batch, service-role only), category-routed fetchers
// from lib/popularity, one oriented metric per source upserted into
// wf_place_popularity. wf_best_picks auto-blends via
// wf_place_popularity_scored — no ranker change. Every 2 hours (vercel.json,
// accelerated 2026-08-08 to rebuild coverage after the Foursquare v3 sunset
// left the table wikipedia-only) ≈ 1,200 places/day — full-inventory cycle
// ≈ 3 days, and a NEW market's never-fetched places jump the queue on the
// very next run (stale_batch orders null-fetch first, newest seen first).
// Rate-limit exposure is deliberate and OBSERVABLE, not guessed: Yelp's free
// tier (~500/day) may 429 late in the day — that shows up as http_429 in the
// outcomes log and a partial pulse, both visible, neither silent. TripAdvisor
// stays hard-capped per run (free tier is 5k calls/month, 2 calls per
// place). CRON_SECRET-gated like /api/cron/cwv.
import { createClient } from "@supabase/supabase-js";
import { FETCHERS, sourcesFor, SOURCE_CAPS, CONFIDENCE_FLOOR, POP_DIAG, resetPopDiag } from "../../../../lib/popularity";
import { recordPulse } from "../../../../lib/jobPulse";

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
  resetPopDiag(); // per-run outcome tally — see lib/popularity POP_DIAG
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

  try { console.log(JSON.stringify({ tag: "popularity_cron", ...stats, outcomes: POP_DIAG })); } catch (e) {}
  // ── the self-healing loop's alarm (2026-08-08) ────────────────────────────
  // The trend-signal audit found Foursquare's fetcher dead for ~3 MONTHS (v3
  // API sunset) while the cron returned 200 and wikipedia's trickle kept the
  // aggregate "upserts" number nonzero — the exact atlas-build failure shape
  // jobPulse exists for, one level down: the JOB looked alive while whole
  // SOURCES were dead. So each source records its OWN pulse:
  //   attempted  = real API calls made for that source this run
  //   succeeded  = calls that produced a metric row ("ok" in POP_DIAG)
  //   note       = the dominant failure outcome (http_401, network, no_match…)
  // A source with a missing key pulses attempted:0 (idle — "not configured"
  // is a state, not a failure; envAudit doctrine), so removing a key on
  // purpose never pages anyone, while a key that stops WORKING flatlines its
  // pulse and /api/cron/job-watch emails with the source's name and reason.
  // As the site grows this scales by itself: new places enter wf_inventory,
  // wf_popularity_stale_batch feeds them to the very next run (never-fetched
  // first, newest first), and any link in that chain that stops producing
  // shows up here within DEAD_RUN_THRESHOLD runs instead of next quarter.
  for (const src of Object.keys(spent)) {
    const o = POP_DIAG[src] || {};
    const onlyNoKey = o.no_key && Object.keys(o).length === 1;
    const dominant = Object.entries(o).filter(([k]) => k !== "ok").sort((a, b) => b[1] - a[1])[0];
    await recordPulse("popularity:" + src, {
      attempted: onlyNoKey ? 0 : spent[src] || 0,
      succeeded: o.ok || 0,
      note: dominant ? dominant[0] + " x" + dominant[1] : null,
    });
  }
  return Response.json(stats, { status: 200 });
}
