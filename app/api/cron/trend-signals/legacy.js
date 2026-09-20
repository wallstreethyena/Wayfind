// app/api/cron/trend-signals/route.js — the daily live-signal ingest: the two
// wired external feeds -> wf_trend_signals -> re-scored Trend Momentum Scores
// on the latest snapshot's topics.
//
// This is the job that makes the score MOVE between monthly CSV imports. The
// CSV stays authoritative for long-window growth; this job adds short-window
// velocity, live demand, freshness and cross-source corroboration
// (lib/trendSources/blend.js doctrine: signals fill absent factors and refresh
// freshness — they never overwrite what the licensed snapshot measured).
//
// FAILURE SHAPE (inherits trend-maintenance's law):
//   • a source being down/unconfigured is DEGRADED, reported per-source with
//     its status — never a throw, and never silently "no trends"
//   • a selector that fails is NOT an empty queue -> 503
//   • succeeded counts WORK ACCOMPLISHED (rows written, topics scored)
//   • both sources failing while configured -> non-200, job-watch sees it
//
// PROVIDER ANONYMITY: provider names stop at wf_trend_signals.source
// (service-role only). This route never writes public copy — public_explanation
// is written nowhere here, and labels come from the config row's PUBLIC_LABELS.

import { recordPulse } from "../../../../lib/jobPulse";
import { sbEnv } from "../../../../lib/serverCache";
import { CONCEPTS, EXPLODING_NEARBY_KEYS } from "../../../../lib/trendTaxonomy";
import { fetchPinterestTrends, conceptSignalsFromRows, pinterestConfigured, PINTEREST_TREND_TYPES } from "../../../../lib/trendSources/pinterestTrends";
import { fetchGoogleTrendingRss, conceptSignalsFromItems } from "../../../../lib/trendSources/googleTrendsRss";
import { blendSignalFactors } from "../../../../lib/trendSources/blend";
import { trendFactors, trendMomentumScore, DEFAULT_WEIGHTS, MOMENTUM_THRESHOLDS, PUBLIC_LABELS } from "../../../../lib/trendScore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const JOB = "trend-signals";
const SIGNAL_WINDOW_DAYS = 7;
const TOPIC_SCORE_CAP = 200;

// One primary alias per owner-universe concept: the targeted include_keywords
// filter (the API caps how many we can pass; 20 < the adapter's 25 cap).
function universePrimaryAliases() {
  const out = [];
  for (const key of EXPLODING_NEARBY_KEYS) {
    const c = CONCEPTS[key];
    if (c && Array.isArray(c.aliases) && c.aliases.length) out.push(c.aliases[0]);
  }
  return out;
}

export async function GET(req) {
  const started = Date.now();
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  if (!secret || (auth !== "Bearer " + secret && url.searchParams.get("key") !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const s = sbEnv();
  if (!s || !s.url || !s.key) {
    await recordPulse(JOB, { attempted: 0, succeeded: 0, note: "no supabase service env" });
    return Response.json({ ok: false, error: "no supabase service env" }, { status: 503 });
  }
  const svcH = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const out = {
    ok: true, job: JOB,
    sources: { pinterest: null, google_trends: null },
    signals: { matched: 0, written: 0 },
    scoring: { topics: 0, scored: 0, skipped: 0 },
  };
  const signals = [];

  // ── 1. Pinterest: growing top-50 (the broad wave) + monthly filtered to the
  //       owner universe (the targeted read). Each call degrades independently.
  if (!pinterestConfigured()) {
    out.sources.pinterest = { ok: false, status: 0, error: "unconfigured (PINTEREST_ACCESS_TOKEN unset)" };
  } else {
    const calls = [
      { trendType: PINTEREST_TREND_TYPES[0] },
      { trendType: PINTEREST_TREND_TYPES[1], includeKeywords: universePrimaryAliases() },
    ];
    const statuses = [];
    for (const c of calls) {
      const r = await fetchPinterestTrends(c);
      statuses.push({ trendType: c.trendType, ok: r.ok, status: r.status, error: r.error, rows: r.rows.length });
      if (r.ok) signals.push(...conceptSignalsFromRows(r.rows, { observedAt: nowIso }));
    }
    out.sources.pinterest = { ok: statuses.some((x) => x.ok), calls: statuses };
  }

  // ── 2. Google Trends daily RSS (keyless; weak corroboration by design).
  {
    const r = await fetchGoogleTrendingRss({});
    out.sources.google_trends = { ok: r.ok, status: r.status, error: r.error, items: r.items.length };
    if (r.ok) signals.push(...conceptSignalsFromItems(r.items, { observedAt: nowIso }));
  }

  // Both sources down while at least one is configured -> the job did nothing
  // it exists to do. Non-200 so job-watch pages, per failure shape (a).
  const anySourceOk = Boolean((out.sources.pinterest && out.sources.pinterest.ok) || (out.sources.google_trends && out.sources.google_trends.ok));
  if (!anySourceOk) {
    await recordPulse(JOB, { attempted: 1, succeeded: 0, note: "ALL SOURCES FAILED: " + JSON.stringify(out.sources).slice(0, 180) });
    return Response.json({ ...out, ok: false, error: "all-sources-failed" }, { status: 503 });
  }

  // ── 3. Persist observations (idempotent per source x concept x keyword x day).
  out.signals.matched = signals.length;
  if (signals.length) {
    const rows = signals.map((g) => ({
      source: g.source,
      concept_key: g.conceptKey,
      keyword: g.keyword.slice(0, 200),
      region: "US",
      match_confidence: g.matchConfidence,
      growth_wow: g.growthWow,
      growth_mom: g.growthMom,
      growth_yoy: g.growthYoy,
      demand_index: g.demandIndex,
      observed_at: g.observedAt,
      observed_on: String(g.observedAt).slice(0, 10),
    }));
    try {
      const r = await fetch(`${s.url}/rest/v1/wf_trend_signals?on_conflict=source,concept_key,keyword,observed_on`, {
        method: "POST",
        headers: { ...svcH, Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(rows), cache: "no-store",
      });
      if (r.ok) { const j = await r.json(); out.signals.written = Array.isArray(j) ? j.length : 0; }
      else out.signals.writeError = `http ${r.status}`;
    } catch (e) { out.signals.writeError = "write threw"; }
  }

  // ── 4. Re-score the latest snapshot's concept-mapped topics with the fresh
  //       signal window blended in. A selector failure here is a 503 — writing
  //       signals and then silently not scoring is how a job "succeeds" at half
  //       its purpose.
  let snap = null, selectorError = null;
  try {
    const r = await fetch(`${s.url}/rest/v1/wf_trend_snapshots?status=in.(complete,partial)&order=observed_at.desc&limit=1`, { headers: svcH, cache: "no-store" });
    if (!r.ok) selectorError = `snapshot select http ${r.status}`;
    else { const j = await r.json(); snap = Array.isArray(j) && j.length ? j[0] : null; }
  } catch (e) { selectorError = "snapshot select threw"; }
  if (selectorError) {
    await recordPulse(JOB, { attempted: 1, succeeded: out.signals.written ? 1 : 0, note: "SELECTOR UNREACHABLE: " + selectorError });
    return Response.json({ ...out, ok: false, error: "selector-unreachable", detail: selectorError }, { status: 503 });
  }

  if (snap) {
    let topics = [], config = null, recent = [];
    try {
      const [tr, cr, sr] = await Promise.all([
        fetch(`${s.url}/rest/v1/wf_trend_topics?snapshot_id=eq.${snap.id}&concept_key=not.is.null&limit=${TOPIC_SCORE_CAP}`, { headers: svcH, cache: "no-store" }),
        fetch(`${s.url}/rest/v1/wf_trend_score_config?active=is.true&limit=1`, { headers: svcH, cache: "no-store" }),
        fetch(`${s.url}/rest/v1/wf_trend_signals?observed_at=gte.${encodeURIComponent(new Date(nowMs - SIGNAL_WINDOW_DAYS * 864e5).toISOString())}&limit=1000`, { headers: svcH, cache: "no-store" }),
      ]);
      topics = tr.ok ? await tr.json() : [];
      const cj = cr.ok ? await cr.json() : [];
      config = Array.isArray(cj) && cj.length ? cj[0] : null;
      recent = sr.ok ? await sr.json() : [];
    } catch (e) {}

    const byConcept = new Map();
    for (const g of Array.isArray(recent) ? recent : []) {
      if (!g || !g.concept_key) continue;
      if (!byConcept.has(g.concept_key)) byConcept.set(g.concept_key, []);
      byConcept.get(g.concept_key).push(g);
    }

    const weights = (config && config.weights) || DEFAULT_WEIGHTS;
    const thresholds = (config && config.thresholds) || MOMENTUM_THRESHOLDS;
    const labels = (config && config.labels) || PUBLIC_LABELS;
    const modelVersion = (config && config.version) || "tms-v1";

    out.scoring.topics = Array.isArray(topics) ? topics.length : 0;
    for (const t of Array.isArray(topics) ? topics : []) {
      const base = trendFactors(t, { nowMs });
      const { factors, sourceCount } = blendSignalFactors(base, byConcept.get(t.concept_key) || [], { nowMs });
      const scored = trendMomentumScore(factors, weights, thresholds, labels);
      if (!scored) { out.scoring.skipped++; continue; }
      try {
        const r = await fetch(`${s.url}/rest/v1/wf_trend_topics?id=eq.${t.id}`, {
          method: "PATCH", headers: { ...svcH, Prefer: "return=minimal" },
          body: JSON.stringify({
            trend_score: scored.score,
            momentum: scored.momentum,
            public_label: scored.publicLabel,
            component_scores: { ...scored.components, _sourceCount: sourceCount, _coverage: scored.coverage },
            model_version: scored.modelVersion === modelVersion ? scored.modelVersion : modelVersion,
          }),
          cache: "no-store",
        });
        if (r.ok) out.scoring.scored++;
      } catch (e) {}
    }
  } else {
    out.scoring.note = "no snapshot imported yet — signals stored, nothing to score";
  }

  const attempted = 2 + out.scoring.topics;
  const succeeded = (out.signals.written ? 1 : 0) + (anySourceOk ? 1 : 0) + out.scoring.scored;
  // The pulse note is the ONLY observable a dashboard-triggered run leaves
  // behind (the JSON response goes to the cron runner and vanishes), so it
  // carries the per-source verdicts — a "0 written" without WHY is exactly the
  // silent degradation this job's failure shape forbids.
  const srcNote = (k, v) => !v ? `${k}:absent`
    : v.calls ? `${k}:${v.calls.map((c) => `${c.trendType}=${c.ok ? c.rows + "rows" : (c.error || c.status)}`).join(",")}`
    : `${k}:${v.ok ? (v.items != null ? v.items + "items" : "ok") : (v.error || v.status)}`;
  await recordPulse(JOB, {
    attempted, succeeded,
    note: `signals ${out.signals.written}/${out.signals.matched} written; topics ${out.scoring.scored}/${out.scoring.topics} scored | ${srcNote("P", out.sources.pinterest)} ${srcNote("G", out.sources.google_trends)}${out.signals.writeError ? " | writeError " + out.signals.writeError : ""}${snap ? "" : " | no snapshot"}`.slice(0, 240),
  });
  out.tookMs = Date.now() - started;
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
