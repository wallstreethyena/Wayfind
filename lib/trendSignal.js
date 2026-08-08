// lib/trendSignal.js — ONE unified trend signal for every ranking sheet
// (owner directive 2026-08-07: "every ranking sheet should surface what's
// trending... the moment they are trending... one algorithm").
//
// This module is the single brain. Each surface asks it the same question —
// "is this place trending right now?" — and gets back one normalized answer:
//
//   { trendScore: 0..1, trending: boolean, trendReason: string|null, sources: [] }
//
// THE INTEGRITY CONTRACT (non-negotiable — scripts/check-trend-signal.mjs):
//   • Inputs are REAL DEMAND DATA ONLY: Foursquare venue foot traffic
//     (wf_place_popularity_scored.tier2_popularity, refreshed by the
//     popularity cron), PredictHQ major-event proximity (rank/attendance
//     from the events feed), BestTime live busyness (when its key exists),
//     Google Trends topic momentum (optional). NEVER an affiliate,
//     commission, booking, or any monetized field — a paid signal in here
//     is the one thing that breaks "no paid placement."
//   • Fail soft, always. A missing key, a down API, an empty table — every
//     absence reads as "not trending," never a throw, never a zero-penalty.
//     An empty provider must be indistinguishable from a quiet venue.
//   • trending ⇒ a non-null human-readable trendReason, because the score
//     bump this feeds (lib/wayfindScore.js TRENDING_BONUS) is only allowed
//     when it is DISCLOSED on the card (🔥 + reason).
//
// FRESHNESS: results are cached per place per hour (POP_CACHE below), so a
// place that crosses the threshold is picked up within the hour, and the
// event-proximity input is computed live from whatever events feed the
// caller is already holding — no extra latency on the render path.
import { supabase } from "./supabase.js";

// Haversine, same math as lib/popularity.js distMi. Inlined (not imported) so
// this module — which client components reach through lib/todaysBest.js —
// never drags popularity.js's server-side fetchers (env-keyed Yelp/Foursquare/
// TripAdvisor calls) into the client bundle graph.
const EARTH_R_MI = 3958.8;
function distMi(aLat, aLng, bLat, bLng) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return EARTH_R_MI * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Threshold per the owner-approved spec (start ~0.66; tune with data).
export const TREND_THRESHOLD = 0.66;

// Blend weights. Missing sources are ABSENT (renormalized), never zero.
// popularity — Foursquare foot traffic percent-rank (metro-relative, 0..1)
// busynow    — BestTime "busy right now" (Phase 2b; absent until keyed)
// nearby_event — a high-attendance event within EVENT_NEARBY_MI
// topic      — Google Trends momentum (optional; absent until wired)
export const TREND_SOURCE_WEIGHTS = {
  popularity: 0.5,
  busynow: 0.35,
  nearby_event: 0.35,
  topic: 0.15,
};

// The disclosed reason, per source — whichever source contributes most wins.
// VOCAB DOCTRINE (test-trend-vocab.mjs, audit F1–F3): tier2_popularity is a
// popularity LEVEL with no baseline, so its reason must be level-honest
// ("Popular…"), never a velocity claim ("Trending…"). Event proximity and
// busy-now describe live conditions; topic momentum is a real delta and may
// speak of rising interest when it is wired.
export const TREND_REASONS = {
  popularity: "Popular with locals",
  busynow: "Busy right now",
  nearby_event: "Near a major event",
  topic: "Interest is rising",
};

// An event boosts places within this radius (walkable spillover, not a metro).
export const EVENT_NEARBY_MI = 2;

const clamp01 = (v) => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : null);

/**
 * The pure core. Takes normalized 0..1 inputs (null/undefined/NaN = source
 * absent) and returns the unified signal. Only the whitelisted keys above are
 * ever read — unknown keys (and any monetized field) are ignored by
 * construction.
 */
export function computeTrendSignal(inputs) {
  try {
    const src = inputs || {};
    const values = {
      popularity: clamp01(src.popularity),
      busynow: clamp01(src.busyNow != null ? src.busyNow : src.busynow),
      nearby_event: clamp01(src.nearbyEvent != null ? src.nearbyEvent : src.nearby_event),
      topic: clamp01(src.topicMomentum != null ? src.topicMomentum : src.topic),
    };
    let wSum = 0, vSum = 0;
    const sources = [];
    let bestKey = null, bestContrib = -1;
    for (const k of Object.keys(TREND_SOURCE_WEIGHTS)) {
      const v = values[k];
      if (v == null) continue;
      const w = TREND_SOURCE_WEIGHTS[k];
      wSum += w;
      vSum += w * v;
      sources.push(k);
      const contrib = w * v;
      if (contrib > bestContrib) { bestContrib = contrib; bestKey = k; }
    }
    if (!wSum) return { trendScore: 0, trending: false, trendReason: null, sources: [] };
    const trendScore = Math.max(0, Math.min(1, vSum / wSum));
    const trending = trendScore >= TREND_THRESHOLD;
    return {
      trendScore,
      trending,
      trendReason: trending && bestKey ? TREND_REASONS[bestKey] : null,
      sources,
    };
  } catch (e) {
    return { trendScore: 0, trending: false, trendReason: null, sources: [] };
  }
}

/**
 * Major-event proximity, 0..1 or null. Reads ONLY demand fields the events
 * feed carries (PredictHQ local_rank / rank 0–100, phq_attendance) — never a
 * ticket URL, price, or any monetized field. An event with no demand data or
 * no coordinates contributes nothing.
 */
export function nearbyEventScore(place, events) {
  try {
    if (!place || !isFinite(place.lat) || !isFinite(place.lng)) return null;
    let best = null;
    for (const e of Array.isArray(events) ? events : []) {
      if (!e || !isFinite(e.lat) || !isFinite(e.lng)) continue;
      const rank = isFinite(e.local_rank) ? e.local_rank : isFinite(e.rank) ? e.rank : null;
      const att = isFinite(e.phq_attendance) ? e.phq_attendance : null;
      if (rank == null && att == null) continue; // no demand data → not a signal
      if (distMi(place.lat, place.lng, e.lat, e.lng) > EVENT_NEARBY_MI) continue;
      // rank is already 0–100; attendance normalizes on a log scale where
      // 100k+ expected ≈ 1.0 (a stadium event), 10k ≈ 0.8, 1k ≈ 0.6.
      const v = rank != null ? rank / 100 : Math.min(1, Math.log10(Math.max(1, att)) / 5);
      if (best == null || v > best) best = v;
    }
    return best == null ? null : clamp01(best);
  } catch (e) {
    return null;
  }
}

// ── Foursquare popularity, cached per place per hour ────────────────────────
// wf_place_popularity_scored.tier2_popularity is the metro-relative percent
// rank the flame threshold has always read. The cron refreshes the table; the
// hourly cache key means a place that starts trending is picked up within the
// hour without re-querying on every render.
const POP_CACHE = new Map(); // place_id -> { v: number|null, h: hourKey }
const hourKey = () => Math.floor(Date.now() / 3600000);

export async function fetchPopularityByIds(ids) {
  const out = {};
  try {
    if (!supabase || !Array.isArray(ids) || !ids.length) return out;
    const h = hourKey();
    const missing = [];
    for (const id of ids) {
      if (!id) continue;
      const c = POP_CACHE.get(id);
      if (c && c.h === h) { if (c.v != null) out[id] = c.v; }
      else missing.push(id);
    }
    if (missing.length) {
      const { data, error } = await supabase
        .from("wf_place_popularity_scored")
        .select("place_id,tier2_popularity")
        .in("place_id", missing);
      if (!error && Array.isArray(data)) {
        const got = new Map(data.map((r) => [r.place_id, r.tier2_popularity]));
        for (const id of missing) {
          const v = got.has(id) && typeof got.get(id) === "number" ? got.get(id) : null;
          POP_CACHE.set(id, { v, h }); // negative-cache misses too — no refetch storm
          if (v != null) out[id] = v;
        }
      }
    }
  } catch (e) {}
  return out;
}

/**
 * Decorate ranked-list rows IN PLACE with the unified signal, BEFORE the sort
 * runs, so the governed score (lib/wayfindScore.js) can include the trending
 * bump and "shown == sorted" holds. Mutates rows (adds trending /
 * trend_reason / trend_score / trend_sources); returns the same array.
 *
 * Viator/experience rows are skipped BY DESIGN: they are monetized inventory,
 * and the trending bump must never touch anything with a commission attached.
 * Fails soft: on any error the rows come back exactly as they went in.
 */
export async function attachTrendSignals(rows, opts) {
  try {
    if (!Array.isArray(rows) || !rows.length) return rows;
    const events = opts && opts.events;
    const placeRows = rows.filter((r) => r && r.kind !== "experience");
    const idOf = (r) => r.place_id || r.id || null;
    const ids = [...new Set(placeRows.map(idOf).filter(Boolean))];
    const pop = await fetchPopularityByIds(ids);
    for (const r of placeRows) {
      const id = idOf(r);
      const sig = computeTrendSignal({
        popularity: id != null && pop[id] != null ? pop[id] : null,
        nearbyEvent: nearbyEventScore(r, events),
      });
      if (sig.trending) {
        r.trending = true;
        r.trend_reason = sig.trendReason;
      }
      r.trend_score = sig.trendScore;
      r.trend_sources = sig.sources;
    }
  } catch (e) {}
  return rows;
}
