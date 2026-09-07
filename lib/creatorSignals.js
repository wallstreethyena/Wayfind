// lib/creatorSignals.js — the LEAN, ranking-safe mirror of lib/creatorVideos.js
// (WO9, 2026-09-02: scripts/check-bundle.mjs was failing — "Homepage bundle
// ratchet" — because lib/creatorBoost.js and lib/trendSignal.js import
// creatorVideosFor from lib/creatorVideos.js, and that import is NOT
// optional: lib/lawfulOrder.js's governedScoreOf() — the ONE comparator
// every ranked list on the site uses (client and server, via lib/ranking.js
// and lib/sources.js, both eager on "/") — calls hasCreatorVideoAt() and
// corroborationTrend() synchronously, on every row, to compute the score a
// reader sees and the order the list renders in. That is genuinely
// ranking-critical: it cannot be made a dynamic import() without changing
// which places outrank which during the load window, which is a real
// behavior change, not a bundling detail.
//
// 2026-09-07 — COMPACTED FURTHER. app/components/CreatorCardMark.js's
// creatorHeads() is a sixth eager reader (via app/home.js and
// app/components/RailCard.js) and it needs the ORIGINAL creator handle
// string + platform, per video — not just a boolean and a reach number. So
// what CAN change is only the ENCODING: lib/creatorSignalsData.generated.js
// now stores one compact positional tuple per curated entry/video (see
// scripts/gen-creator-signals.mjs's header for the full format and why the
// data is kept per-video rather than pre-aggregated — two of the eager
// consumers dedupe creators by different rules and an aggregate can only
// encode one of those answers). This file decodes those tuples back into
// EXACTLY the object shape the resolver below has always worked with —
// { placeId, match: { name, city }, videos: [{ creator, platform, reach }] }
// — so the resolver algorithm itself (below) needed almost no changes.
//
// lib/creatorSignalsData.generated.js is regenerated FROM lib/creatorVideos.js
// (scripts/gen-creator-signals.mjs) — never hand-edited, never a second
// source of truth for what's curated. This file is hand-written: the SAME
// resolver algorithm lib/creatorVideos.js's creatorVideosFor() runs (exact
// place_id match first, then a name+city prefix match, longest wins), just
// over the lean data, so the two modules can never disagree about which
// places match — only about which FIELDS of the match they hand back.
import { LEAN_CURATED, PLATFORMS } from "./creatorSignalsData.generated.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

function cityMatches(place, locName, city) {
  if (!city) return true;
  const hay = norm([place && place.city, place && place.address, locName].filter(Boolean).join(" "));
  return hay.includes(norm(city));
}

// `0` is the codegen's "field absent" sentinel in every string/nullable-reach
// slot (see scripts/gen-creator-signals.mjs) — decode it back to `null` so
// every downstream reader (this file, lib/creatorBoost.js, lib/trendSignal.js,
// CreatorCardMark.js) sees exactly the values it always has.
const unsentinel = (v) => (v === 0 ? null : v);

/**
 * Decode a (leanCurated, platforms) pair — the exact shape
 * scripts/gen-creator-signals.mjs writes to lib/creatorSignalsData.generated.js
 * — into a bound { creatorVideosFor, hasCreatorVideoAtLean, creatorCountFor }
 * resolver. Factored out from module scope so
 * scripts/check-creator-signal-equivalence.mjs can build a SECOND resolver
 * over synthetic tuples (a staged-only entry, a name-collision pair, …) and
 * run the REAL resolver algorithm against fixtures the committed data doesn't
 * happen to contain, rather than a hand-copied mirror of it. The module's own
 * exports below are just this factory applied once, to the real committed
 * data, at load time — production behavior is unchanged.
 */
export function buildLeanResolver(leanCurated, platforms) {
  // DECODE. Each tuple becomes the same entry shape lib/creatorVideos.js's
  // CURATED array always had (minus the fields no eager consumer reads: key,
  // url, caption, address, displayName, category).
  //
  // Every video in a decoded entry is LIVE BY CONSTRUCTION: the generator
  // only ever emits a video tuple for a source video whose url was real and
  // non-empty (renderable()'s exact rule). So `renderable()` below is a
  // pass-through, not a filter — see its own comment for why it still exists.
  const ENTRIES = leanCurated.map(([placeId, matchName, matchCity, videos]) => ({
    placeId: unsentinel(placeId),
    match: { name: unsentinel(matchName), city: unsentinel(matchCity) },
    videos: videos.map(([creator, platformIdx, reach]) => ({
      creator: unsentinel(creator),
      platform: platforms[platformIdx] || null,
      reach: reach === 0 ? null : reach,
    })),
  }));

  // Kept, and called exactly where lib/creatorVideos.js's renderable() is
  // called, so the two files read the same at every call site — but it no
  // longer FILTERS anything: the source registry's `live` gate (a real,
  // non-empty url) already ran once, at codegen time, in
  // scripts/gen-creator-signals.mjs, so every video reaching this module is
  // live by construction. Doing the same filter again per-lookup would just
  // be wasted work on an already-true condition.
  function renderable(videos) {
    return videos || [];
  }

  // THE RESOLVER INDEX — mirrors lib/creatorVideos.js's BY_PLACE_ID/BY_NAME,
  // built once (per resolver instance). See that file for the measured-perf
  // reasoning.
  //
  // CORRECTNESS NOTE: every decoded entry is indexed here, INCLUDING one
  // whose `videos` array came out empty (every one of its source videos was
  // staged). Dropping such an entry would change which OTHER entry wins a
  // name-match contest against it — a live ranking-attribution change — so
  // it stays in BY_PLACE_ID / BY_NAME exactly as lib/creatorVideos.js's
  // CURATED does, and simply resolves to `[]` when looked up, same as it
  // always has.
  const BY_PLACE_ID = new Map();
  const BY_NAME = [];
  for (const e of ENTRIES) {
    if (e.placeId && !BY_PLACE_ID.has(String(e.placeId))) BY_PLACE_ID.set(String(e.placeId), e);
    if (e.match && e.match.name) {
      const cnm = norm(e.match.name);
      if (cnm) BY_NAME.push({ e, cnm, len: cnm.length });
    }
  }

  /**
   * Lean creator videos for a place: {platform, creator, reach} objects, LIVE
   * ones only (guaranteed by construction — see the header) — no url, no
   * caption, no address. Same two-pass resolution as lib/creatorVideos.js's
   * creatorVideosFor() (place_id exact match, then name+city prefix match,
   * longest/earliest-in-string wins, city-gated).
   */
  function creatorVideosFor(place, locName) {
    if (!place) return [];
    const pid = place.id != null ? String(place.id) : "";
    if (pid) {
      const hit = BY_PLACE_ID.get(pid);
      if (hit) return renderable(hit.videos);
    }
    const nm = norm(place.name);
    if (!nm) return [];
    let best = null;
    let bestScore = 0;
    for (const idx of BY_NAME) {
      const at = nm.indexOf(idx.cnm);
      if (at < 0) continue;
      const score = (at === 0 ? 1000 : 0) + idx.len;
      if (score <= bestScore) continue;
      if (!cityMatches(place, locName, idx.e.match.city)) continue;
      best = idx.e;
      bestScore = score;
    }
    return best ? renderable(best.videos) : [];
  }

  /** Does this place carry a renderable creator video at all? */
  function hasCreatorVideoAtLean(place, locName) {
    try { return creatorVideosFor(place, locName).length > 0; } catch (e) { return false; }
  }

  /**
   * How many DISTINCT creators filmed this place — the corroboration signal
   * lib/trendSignal.js reads. Mirrors lib/creatorVideos.js's
   * creatorCountFor() exactly (unattributed videos count for nothing).
   */
  function creatorCountFor(place, locName) {
    try {
      const seen = new Set();
      for (const v of creatorVideosFor(place, locName)) {
        if (v && v.creator) seen.add(norm(v.creator));
      }
      return seen.size;
    } catch (e) {
      return 0;
    }
  }

  return { creatorVideosFor, hasCreatorVideoAtLean, creatorCountFor };
}

const DEFAULT_RESOLVER = buildLeanResolver(LEAN_CURATED, PLATFORMS);

export const creatorVideosFor = DEFAULT_RESOLVER.creatorVideosFor;
export const hasCreatorVideoAtLean = DEFAULT_RESOLVER.hasCreatorVideoAtLean;
export const creatorCountFor = DEFAULT_RESOLVER.creatorCountFor;
