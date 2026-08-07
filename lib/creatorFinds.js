// lib/creatorFinds.js — the ordering and the coverage rule behind the
// "Finds from local creators" row.
//
// v6.98. This is pure logic deliberately kept OUT of app/components/CreatorFinds.js.
// check-home-answer-first.mjs says it in its own comment: a guard cannot parse
// JSX, "and pure logic that a guard must EXECUTE belongs in lib/ anyway". The
// coverage rule below is exactly that kind of logic — a grep can prove the
// constant exists, only a run can prove the rule holds.
import { creatorBoostFor } from "./creatorBoost.js";

export const CREATOR_FINDS_MAX = 8;
// Below this many local finds a horizontal shelf reads as broken rather than
// as sparse. Same number as RANKING_AND_FEATURING_SPEC.md §4's coverage
// threshold, deliberately.
export const CREATOR_FINDS_MIN = 3;
// How far "worth the drive" can honestly reach. Beyond this it is a different
// trip, not a suggestion.
export const CREATOR_BRIDGE_MAX_MI = 90;

// The row is named LOCAL finds, so distance is the FIRST key (2026-08-07,
// owner screenshot from Parrish: the row led with a Bradenton TikTok spot
// while his own town's creator spots existed — reach-weighted boost outranked
// nearness, which is backwards for this surface's whole promise). Distance
// sorts in 8-mile bands rather than raw miles so a few hundred feet of GPS
// jitter cannot reshuffle the row between renders; within a band the old
// judgement stands (boost, then score).
export const CREATOR_FINDS_BAND_MI = 8;
function distBand(p) {
  const d = p && isFinite(p.distMi) ? p.distMi : null;
  if (d == null) return 99; // unknown distance sorts after every known one — never guessed closer
  return Math.floor(Math.max(0, d) / CREATOR_FINDS_BAND_MI);
}

/**
 * Order the row: nearest distance band first, then the places the creator
 * boost actually MOVED (strongest first — the same judgement the ranked list
 * above made), then score. Places below the quality floor still appear (the
 * creator's work is still shown) but sort after within their band.
 */
export function orderFinds(items) {
  return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
    const da = distBand(a && a.p);
    const db = distBand(b && b.p);
    if (da !== db) return da - db;
    const ba = creatorBoostFor(a && a.p) || 0;
    const bb = creatorBoostFor(b && b.p) || 0;
    if (ba !== bb) return bb - ba;
    return ((b.p && b.p.wfScore) || 0) - ((a.p && a.p.wfScore) || 0);
  });
}

/**
 * The nearest covered city worth sending a thin reader to, or null.
 *
 * The row was built to render nothing when empty, which is right. It was not
 * built for ONE: a reader in Parrish got a single orphan card with dead space
 * beside it, which reads as a broken feature rather than as thin coverage.
 *
 * The limit is not the creator library, it is the PLACE POOL — `videoPlaces`
 * can only hold places Google already loaded near the reader (17 mi by
 * default), so curated spots 30 miles up the road are invisible though they
 * exist. RANKING_AND_FEATURING_SPEC.md §4 already ruled on this: below three
 * qualifying places, do not render a thin local list — offer the nearest
 * covered metro. "A thin list teaches someone the ranking is bad; an honest
 * empty state teaches them it is careful."
 *
 * `byCity` is spotsByCity(center) from lib/creatorVideos — already grouped and
 * already sorted nearest-first — so the first qualifying group IS the nearest.
 *
 * Two honesty rules, both load-bearing:
 *
 *  1. The target must itself have CREATOR_FINDS_MIN spots. Sending someone
 *     thirty miles to see one card is the same disappointment one town over,
 *     and it also means the count printed can never be a restatement of a card
 *     the reader is already looking at — no overlap arithmetic, nothing to get
 *     subtly wrong.
 *  2. A group with no distance (no coordinates for that city) is skipped, never
 *     guessed. Same fail-closed rule as beachMilesFrom() in lib/beaches.js.
 *
 * The distance itself is NEVER rendered. CITY_COORDS in lib/creatorVideos.js
 * says in its own comment that those coordinates sort and are "never shown to a
 * user"; a "35 mi" label built from a city centroid would break that contract
 * and claim a precision the data cannot back up.
 */
export function bridgeCity(byCity, rowCount) {
  if (!(rowCount < CREATOR_FINDS_MIN)) return null;
  for (const g of Array.isArray(byCity) ? byCity : []) {
    if (!g || !Array.isArray(g.spots) || g.spots.length < CREATOR_FINDS_MIN) continue;
    if (typeof g.distMi !== "number" || !isFinite(g.distMi) || g.distMi > CREATOR_BRIDGE_MAX_MI) continue;
    return { city: g.city, count: g.spots.length };
  }
  return null;
}
