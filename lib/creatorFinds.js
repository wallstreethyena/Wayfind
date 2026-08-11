// lib/creatorFinds.js — the ordering and the coverage rule behind the
// "Finds from local creators" row.
//
// v6.98. This is pure logic deliberately kept OUT of app/components/CreatorFinds.js.
// check-home-answer-first.mjs says it in its own comment: a guard cannot parse
// JSX, "and pure logic that a guard must EXECUTE belongs in lib/ anyway". The
// coverage rule below is exactly that kind of logic — a grep can prove the
// constant exists, only a run can prove the rule holds.
import { governedScoreOf } from "./lawfulOrder.js";

// v7.07 (owner, 2026-08-09): twenty cards, not eight. Eight was sized for a row
// whose inventory was only the Google pool — places Google happened to load near
// the reader. The registry's 200 scouted spots are now first-class inventory
// (see mergeCreatorInventory below), so the shelf has enough real cards to fill.
export const CREATOR_FINDS_MAX = 20;
// How far a creator find can be and still belong on a row called "local".
// 25 mi is the owner's number. It applies to the REGISTRY side, whose distance
// is a city centroid — pool rows already carry their own measured distance.
export const CREATOR_FINDS_RADIUS_MI = 25;
// Below this many local finds a horizontal shelf reads as broken rather than
// as sparse. Same number as RANKING_AND_FEATURING_SPEC.md §4's coverage
// threshold, deliberately.
export const CREATOR_FINDS_MIN = 3;
// How far "worth the drive" can honestly reach. Beyond this it is a different
// trip, not a suggestion.
export const CREATOR_BRIDGE_MAX_MI = 90;

// Distance is a tie-break only. The visible governed Wayfind Score is the
// primary key on every list, including creator finds.
export const CREATOR_FINDS_BAND_MI = 8;
function distBand(p) {
  const d = p && isFinite(p.distMi) ? p.distMi : null;
  if (d == null) return 99; // unknown distance sorts after every known one — never guessed closer
  return Math.floor(Math.max(0, d) / CREATOR_FINDS_BAND_MI);
}

/**
 * Order the row by governed score first, then local distance among equal-score
 * cards. This keeps the rank number and displayed score in agreement.
 */
export function orderFinds(items) {
  return (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
    const ga = governedScoreOf(a && a.p);
    const gb = governedScoreOf(b && b.p);
    if (ga !== gb) return (gb == null ? -Infinity : gb) > (ga == null ? -Infinity : ga) ? 1 : -1;
    const da = distBand(a && a.p);
    const db = distBand(b && b.p);
    if (da !== db) return da - db;
    return ((b.p && b.p.reviews) || 0) - ((a.p && a.p.reviews) || 0);
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

/**
 * The registry-hydrated cards to show when the loaded pool surfaced NO
 * creator-video place (owner, 2026-08-07: "I don't see creators on Sarasota").
 * Returns the bridge city's OWN scouted spots — the ones the registry holds but
 * Google did not load nearby — so the differentiator row shows real spots
 * instead of a lone arrow. Empty unless the pool is empty AND a bridge city
 * with spots exists; that keeps the pool-hydrated (with-photo) path unchanged.
 * Pure and executed by scripts/check-home-answer-first.mjs.
 */
export function scoutedSpots(byCity, bridge, rowCount, max = CREATOR_FINDS_MAX) {
  if (rowCount > 0 || !bridge || !Array.isArray(byCity)) return [];
  const group = byCity.find((g) => g && g.city === bridge.city);
  if (!group || !Array.isArray(group.spots)) return [];
  return group.spots.slice(0, max);
}

/**
 * ONE inventory for the creator row (v7.07).
 *
 * THE OLD SHAPE, and why it capped the row. Registry spots were a FALLBACK:
 * scoutedSpots() returned [] unless the pool was completely empty. So a reader
 * with three pool finds saw three cards while the registry held twenty more
 * spots within the same 25 miles — the shelf looked thin because of a branch,
 * not because of coverage. The owner's diagnosis is the correct one: "the
 * limiter is the place pool, not the library."
 *
 * So registry spots are promoted to first-class inventory and merged with the
 * pool rows, nearest cities first, up to `max`.
 *
 * TWO HONESTY RULES, both load-bearing:
 *
 *  1. A registry group with no distance is SKIPPED, never guessed — the same
 *     fail-closed rule bridgeCity() uses. And a group beyond radiusMi is out:
 *     a row called "local" may not reach 60 miles for filler.
 *  2. A registry row carries NO score and NO measured distance. Its city
 *     centroid sorts it and is never rendered (lib/creatorVideos.js's CITY_COORDS
 *     promises exactly that). `hydrated` rows — resolved against the real Google
 *     place by name+city — DO carry a real rating and real coordinates, because
 *     those were looked up, not invented. The distinction is the whole point:
 *     omit what you do not have, show what you genuinely resolved.
 *
 * Dedupe is by normalised name: when the same venue is in both the pool and the
 * registry, the POOL row wins — it has a measured distance and a real score,
 * and showing the same place twice on one shelf is the defect this prevents.
 */
const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// v7.08 (owner screenshot, 2026-08-11): "Circles Waterfront" (registry spot)
// and "Circles Waterfront Restaurant" (pool place) rendered as cards 7 AND 8
// of the same rail — one venue, twice, because dedup demanded EXACT normalised
// equality. Same venue, one word of suffix apart. sameVenueName() treats
// token-boundary containment as identity, but ONLY when the shorter name is
// substantial (>=2 tokens and >=10 chars): registry match roots are often
// deliberately short single tokens ("Ryan", "Dolce") that would otherwise
// swallow unrelated businesses sharing a first word.
export function sameVenueName(a, b) {
  const x = normName(a), y = normName(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const shorter = x.length <= y.length ? x : y;
  const longer = x.length <= y.length ? y : x;
  if (shorter.length < 10 || shorter.split(" ").length < 2) return false;
  return longer === shorter || longer.startsWith(shorter + " ") || longer.endsWith(" " + shorter);
}

export function mergeCreatorInventory({ pool, byCity, radiusMi = CREATOR_FINDS_RADIUS_MI, max = CREATOR_FINDS_MAX } = {}) {
  const poolRows = orderFinds(pool).map((r) => ({ kind: "pool", key: (r.p && r.p.id) || null, row: r }));
  const seen = new Set(poolRows.map((r) => normName(r.row && r.row.p && r.row.p.name)).filter(Boolean));

  const registryRows = [];
  for (const g of Array.isArray(byCity) ? byCity : []) {
    if (!g || !Array.isArray(g.spots)) continue;
    // Rule 1: no distance -> skipped, never guessed. Beyond radius -> out.
    if (typeof g.distMi !== "number" || !isFinite(g.distMi) || g.distMi > radiusMi) continue;
    for (const spot of g.spots) {
      if (!spot || !spot.name) continue;
      const n = normName(spot.name);
      if (!n || seen.has(n)) continue; // the pool row already represents it
      // v7.08: containment counts as the same venue — see sameVenueName().
      let dupe = false;
      for (const s of seen) { if (sameVenueName(s, n)) { dupe = true; break; } }
      if (dupe) continue;
      seen.add(n);
      registryRows.push({ kind: "registry", key: spot.key || n, spot, cityDistMi: g.distMi });
    }
  }
  // Pool first (measured distance, real score), then registry by city nearness.
  registryRows.sort((a, b) => a.cityDistMi - b.cityDistMi);
  return poolRows.concat(registryRows).slice(0, max);
}
