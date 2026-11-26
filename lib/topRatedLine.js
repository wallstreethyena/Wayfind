// lib/topRatedLine.js — the short "Top rated on Wayfind" line beside a ticket
// or booking button. PURE.
//
// WHY (owner, 2026-11-25, conversion pass): a short Top rated line next to the
// ticket button, from Wayfind's existing score only. It rests on exactly the
// merit the Top Rated badge uses (lib/topRatedBadge.js): the canonical Wayfind
// Score from rating + review count (lib/wayfindScore.js), at or above
// BADGE_MIN_SCORE (9.0). No creator boost, no partner, no commission.
//
// Like the badge, the line prints NO number: card scores carry small boosts
// the base score does not, so a number here could disagree with a card. An
// unrated place (score null) gets no line, never a placeholder.
import { wayfindScore } from "./wayfindScore.js";
import { BADGE_MIN_SCORE } from "./topRatedBadge.js";

export const TOP_RATED_LINE = "Top rated on Wayfind";

export function topRatedLine(p) {
  if (!p || typeof p !== "object") return null;
  const s = wayfindScore(p.rating, p.reviews);
  return typeof s === "number" && Number.isFinite(s) && s >= BADGE_MIN_SCORE ? TOP_RATED_LINE : null;
}
