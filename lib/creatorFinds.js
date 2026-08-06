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

/**
 * Order the row. Places the creator boost actually MOVED come first, strongest
 * boost first, because that is the same judgement the ranked list above made —
 * two surfaces on one screen disagreeing about which creator pick matters most
 * is the drift this codebase keeps having to fix. Places below the quality
 * floor still appear (her work is still shown) but sort after.
 */
export function orderFinds(items) {
  return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
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
