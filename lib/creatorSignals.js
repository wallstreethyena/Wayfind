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
// What CAN change is which module answers "does this place have a
// creator video, and how far did it reach" — that only needs three fields
// per video (platform, creator handle, reach) plus whether it's LIVE
// (renderable() in creatorVideos.js gates on a non-empty url; this reads a
// precomputed `live` boolean instead of the url text itself). It does not
// need the url, the caption, the address, or the display name — all of
// which live only in lib/creatorVideos.js, used by app/components/sheets/
// Detail.js and SocialFind.js, already next/dynamic(ssr:false) and so
// already off the eager path.
//
// lib/creatorSignalsData.generated.js is regenerated FROM lib/creatorVideos.js
// (scripts/gen-creator-signals.mjs) — never hand-edited, never a second
// source of truth for what's curated. This file is hand-written: the SAME
// resolver algorithm lib/creatorVideos.js's creatorVideosFor() runs (exact
// place_id match first, then a name+city prefix match, longest wins), just
// over the lean data, so the two modules can never disagree about which
// places match — only about which FIELDS of the match they hand back.
import { LEAN_CURATED } from "./creatorSignalsData.generated.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

function cityMatches(place, locName, city) {
  if (!city) return true;
  const hay = norm([place && place.city, place && place.address, locName].filter(Boolean).join(" "));
  return hay.includes(norm(city));
}

// Only LIVE videos (a real url exists in the source registry) count as
// "renderable" here too — same rule as lib/creatorVideos.js's renderable(),
// same reason: a mid-curation entry must never count as "has a video" for
// the ranking boost.
function renderable(videos) {
  return (videos || []).filter((v) => v && v.live === true);
}

// THE RESOLVER INDEX — mirrors lib/creatorVideos.js's BY_PLACE_ID/BY_NAME,
// built once at module load. See that file for the measured-perf reasoning.
const BY_PLACE_ID = new Map();
const BY_NAME = [];
for (const e of LEAN_CURATED) {
  if (e.placeId && !BY_PLACE_ID.has(String(e.placeId))) BY_PLACE_ID.set(String(e.placeId), e);
  if (e.match && e.match.name) {
    const cnm = norm(e.match.name);
    if (cnm) BY_NAME.push({ e, cnm, len: cnm.length });
  }
}

/**
 * Lean creator videos for a place: {platform, creator, reach, live} objects,
 * LIVE ones only — no url, no caption, no address. Same two-pass resolution
 * as lib/creatorVideos.js's creatorVideosFor() (place_id exact match, then
 * name+city prefix match, longest/earliest-in-string wins, city-gated).
 */
export function creatorVideosFor(place, locName) {
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
export function hasCreatorVideoAtLean(place, locName) {
  try { return creatorVideosFor(place, locName).length > 0; } catch (e) { return false; }
}

/**
 * How many DISTINCT creators filmed this place — the corroboration signal
 * lib/trendSignal.js reads. Mirrors lib/creatorVideos.js's creatorCountFor()
 * exactly (unattributed videos count for nothing).
 */
export function creatorCountFor(place, locName) {
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
