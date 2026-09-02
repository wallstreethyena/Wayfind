// Keep first paint small without hiding inventory. The first response carries
// a useful ranked window and the exact total. A reader can request the full
// cached answer without repeating database work.
export const FIRST_RAIL_WINDOW = 12;

export function windowRailAnswer(answer, full = false, size = FIRST_RAIL_WINDOW) {
  if (full || !answer || !Array.isArray(answer.rails)) return answer;
  let hasMore = false;
  const rails = answer.rails.map((rail) => {
    const places = Array.isArray(rail.places) ? rail.places : [];
    if (places.length > size) hasMore = true;
    return { ...rail, total: places.length, places: places.slice(0, size) };
  });
  return { ...answer, rails, hasMore };
}
