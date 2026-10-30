// Where the seasonal Movies rail sits among a poster's content rails (owner, 2026-10-29):
// in the MIDDLE, right after the 5th content rail (Fall has 10 content rails, Halloween 9,
// Christmas 9), not at the end. Pure; no imports. If a poster ever renders 5 or fewer
// content rails the movies rail simply follows the last one.
export const MOVIES_AFTER_RAIL_COUNT = 5;

export function withMoviesRail(railNodes, moviesNode) {
  const nodes = Array.isArray(railNodes) ? railNodes : [];
  const at = Math.min(MOVIES_AFTER_RAIL_COUNT, nodes.length);
  return [...nodes.slice(0, at), moviesNode, ...nodes.slice(at)];
}
