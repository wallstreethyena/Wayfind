// Keep first paint small without hiding inventory. The first response carries
// a useful ranked window and the exact total. A reader can request the full
// cached answer without repeating database work.
export const FIRST_RAIL_WINDOW = 12;

/** True when a horizontal rail is close enough to its end to prefetch more. */
export function railScrollNeedsMore(element, thresholdPx = 180) {
  if (!element) return false;
  const left = Number(element.scrollLeft) || 0;
  const width = Number(element.clientWidth) || 0;
  const total = Number(element.scrollWidth) || 0;
  return total > width && left + width >= total - Math.max(0, Number(thresholdPx) || 0);
}

export function windowRailAnswer(answer, full = false, size = FIRST_RAIL_WINDOW) {
  if (full || !answer || !Array.isArray(answer.rails)) return answer;
  let hasMore = false;
  const rails = answer.rails.map((rail) => {
    const field = Array.isArray(rail.places) ? "places" : (Array.isArray(rail.cards) ? "cards" : null);
    if (!field) return rail;
    const rows = rail[field];
    if (rows.length > size) hasMore = true;
    return { ...rail, total: rows.length, [field]: rows.slice(0, size) };
  });
  return { ...answer, rails, hasMore };
}
