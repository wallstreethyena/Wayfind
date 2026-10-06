import { toDisplayScore } from "./score.js";
import { wayfindScore } from "./wayfindScore.js";

// Read the score IconicPlaceCard actually displays. This is presentation order,
// not a second scorer: upstream governed stamps remain authoritative and no
// distance, affinity, slot fit, or commercial term is added here.
export function placeRecommendationDisplayScore(place) {
  if (!place) return null;
  return toDisplayScore(Number.isFinite(place.governed_score)
    ? place.governed_score
    : place.wfScore != null ? place.wfScore : wayfindScore(place.rating, place.reviews));
}

// Admission and selection belong to the caller. Reorder only the selected
// rows, without mutating them or their array. Equal displayed badges retain
// their original order, including scores that round to the same tenth.
export function orderPlaceRecommendations(places = []) {
  return (Array.isArray(places) ? places : [])
    .map((place, index) => ({ place, index, score: placeRecommendationDisplayScore(place) }))
    .sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.index - b.index)
    .map(({ place }) => place);
}
