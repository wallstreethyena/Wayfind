export const SUMMER_SPORTS_RAIL = Object.freeze({
  id: "sports",
  title: "Sports Events",
  deck: "The best games worth showing up for.",
});

/** Replace the old tour-backed "events" shelf with real sports events and put
 * it third. The other nine summer answers keep their original order. */
export function withSummerSportsRail(rails, cards, { pending = false, failed = false } = {}) {
  const base = (Array.isArray(rails) ? rails : []).filter((rail) => rail?.id !== "events" && rail?.id !== SUMMER_SPORTS_RAIL.id);
  const sport = { ...SUMMER_SPORTS_RAIL, cards: Array.isArray(cards) ? cards : [], total: Array.isArray(cards) ? cards.length : 0, pending, failed };
  return [...base.slice(0, 2), sport, ...base.slice(2)];
}
