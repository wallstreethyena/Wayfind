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
import { creatorCountFor } from "./creatorVideos.js";

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
// corroboration — how many DISTINCT creators independently filmed this place
//   (lib/creatorVideos.js creatorCountFor). Weighted like foot traffic because
//   it is the same kind of fact measured a different way: people going, and
//   saying so in public, under their own names, with a link anyone can check.
//   It is not monetized — no creator in the library is paid, which is the claim
//   app/how-wayfind-ranks/page.js prints and the reason this is allowed in here
//   at all. If creators ever become paid, this source must come straight back
//   out and that page has to change with it.
export const TREND_SOURCE_WEIGHTS = {
  popularity: 0.5,
  busynow: 0.35,
  nearby_event: 0.35,
  topic: 0.15,
  corroboration: 0.5,
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
  // The generic form. computeTrendSignal replaces it with the COUNT whenever it
  // has one ("Filmed by 3 local creators") — a number a reader can go and check
  // against the creator page is worth more than an adjective. This entry still
  // has to exist: check-trend-signal asserts every weighted source has a reason,
  // so a source can never trend undisclosed.
  corroboration: "Filmed by local creators",
};

// An event boosts places within this radius (walkable spillover, not a metro).
export const EVENT_NEARBY_MI = 2;

// ── CORROBORATION (owner, 2026-08-23) ───────────────────────────────────────
// "If a place has multiple influencers then make sure to make it rank higher
//  and add a trending badge on it."
//
// Built as a SOURCE in this module rather than as a new badge or a new score
// term, on purpose. Every ranking sheet already reads this one brain, and
// lib/wayfindScore.js already turns a trending verdict into +0.6 on the number
// the reader sees AND on the sort key. So one source here is the whole ask:
// the place ranks higher and it carries the 🔥 with a reason, on every surface
// at once, with no second definition of "trending" to drift out of sync.
//
// TWO is the bar because two is the smallest number that can be independent.
// One creator with two posts is a person with a favourite; two creators who
// found the same place separately is the town noticing. creatorCountFor()
// counts DISTINCT handles for exactly this reason.
export const CORROBORATION_MIN_CREATORS = 2;
// Four is where the curve saturates — beyond that the marginal creator says
// little, and a place with nine posts should not outrun the whole blend.
export const CORROBORATION_FULL_CREATORS = 4;
// What two creators is worth on the 0..1 scale. High, and deliberately so:
// see the floor in computeTrendSignal for why a low number here would be a
// lie of omission rather than caution.
export const CORROBORATION_BASE = 0.75;

const clamp01 = (v) => (typeof v === "number" && isFinite(v) ? Math.max(0, Math.min(1, v)) : null);

/**
 * Distinct-creator count → a 0..1 source value, or null when the place has not
 * cleared the bar. NULL, not 0: one creator is not weak corroboration, it is no
 * corroboration, and a zero would drag a genuine popularity signal down through
 * the blend for the crime of having been filmed once.
 */
export function corroborationFromCount(creators) {
  const c = typeof creators === "number" && isFinite(creators) ? Math.floor(creators) : 0;
  if (c < CORROBORATION_MIN_CREATORS) return null;
  const span = CORROBORATION_FULL_CREATORS - CORROBORATION_MIN_CREATORS;
  const w = span > 0 ? Math.min(1, (c - CORROBORATION_MIN_CREATORS) / span) : 1;
  return clamp01(CORROBORATION_BASE + (1 - CORROBORATION_BASE) * w);
}

/** The disclosed reason, with the real number in it. Null below the bar. */
export function corroborationReason(creators) {
  const c = typeof creators === "number" && isFinite(creators) ? Math.floor(creators) : 0;
  if (c < CORROBORATION_MIN_CREATORS) return null;
  return `Filmed by ${c} local creators`;
}

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
      // The COUNT is the input, not a pre-normalized 0..1 — the curve belongs
      // to this module, so no caller can invent a different one.
      corroboration: corroborationFromCount(
        src.corroborationCreators != null ? src.corroborationCreators : src.corroboration_creators),
    };
    const creatorCount = typeof src.corroborationCreators === "number" ? src.corroborationCreators
      : typeof src.corroboration_creators === "number" ? src.corroboration_creators : null;
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
    let trendScore = Math.max(0, Math.min(1, vSum / wSum));

    // ── THE CORROBORATION FLOOR ─────────────────────────────────────────────
    // Corroboration is a LEADING signal. tier2_popularity is a LAGGING one —
    // it is a foot-traffic percent-rank computed from a table that learns about
    // a place months after people start going. The entire value of two creators
    // finding the same room in the same season is that it happens BEFORE the
    // popularity table knows, so averaging the two destroys precisely the
    // information the leading one carries: a brand-new corroborated cafe scores
    // (0.5·0.15 + 0.5·0.75) / 1.0 = 0.45 and reads "quiet" on the strength of a
    // number that is quiet because it is stale.
    //
    // So corroboration BOTH rides the blend (it can lift a borderline place)
    // AND floors the verdict at the bar (it can clear it alone). It only ever
    // raises — Math.max, never a ceiling — so a place already trending on real
    // foot traffic keeps its own, higher score and its own, truer reason.
    //
    // The floor is honest because it is disclosed as itself: when it is what
    // made the call, the reason the reader sees is the creator count, not
    // "Popular with locals". A floor that borrowed someone else's reason would
    // be the lie; a floor that names its own evidence is a claim they can check.
    if (values.corroboration != null && trendScore < TREND_THRESHOLD) {
      trendScore = TREND_THRESHOLD;
      bestKey = "corroboration";
    }

    const trending = trendScore >= TREND_THRESHOLD;
    let trendReason = trending && bestKey ? TREND_REASONS[bestKey] : null;
    if (trending && bestKey === "corroboration") {
      trendReason = corroborationReason(creatorCount) || TREND_REASONS.corroboration;
    }
    return { trendScore, trending, trendReason, sources };
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
 * Distinct creators behind a row, tolerating the app's two id field shapes.
 *
 * The shim matters: creatorVideosFor() resolves on `place.id` in PASS 1, and a
 * row that carries only `place_id` would fall through to the NAME path — which
 * is the one path that can attribute a video to the wrong venue. Rows arrive in
 * both shapes across the ranking surfaces, so the id is normalized here once
 * rather than hoped for at every call site.
 */
function creatorsBehind(row, locName) {
  if (!row) return 0;
  const id = row.id != null ? row.id : (row.place_id != null ? row.place_id : null);
  const shaped = row.id != null ? row : { ...row, id };
  return creatorCountFor(shaped, locName || row.city || null);
}

/**
 * v8.42 — the SYNCHRONOUS corroboration verdict, for the pools that mint their
 * own rows and never await this module (lib/railsData.js, lib/nearbyPool.js).
 *
 * Every one of those sites hard-coded `trending: false, trend_reason: null`
 * because the only signals available were async (a Supabase read) and those
 * pools are built on the render path. Corroboration is neither async nor
 * remote — it is a Set over a committed file — so those rows can carry a real
 * verdict for the first time, which is what makes the owner's rule true on the
 * rails and not only on the ranked sheets.
 *
 * Returns the SAME field names the async decorator writes, so a row is
 * indistinguishable downstream no matter which path built it.
 */
export function corroborationTrend(place, locName) {
  try {
    const sig = computeTrendSignal({ corroborationCreators: creatorsBehind(place, locName) });
    if (!sig.trending) return { trending: false, trend_reason: null };
    return { trending: true, trend_reason: sig.trendReason };
  } catch (e) {
    return { trending: false, trend_reason: null };
  }
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
        corroborationCreators: creatorsBehind(r, opts && opts.locName),
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
