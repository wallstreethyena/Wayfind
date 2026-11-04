import { SEASONAL_SEARCH_HUBS, activeSeasonalHubs } from "../../lib/seasonalSearch";
import { siteTodayStr } from "../../lib/siteTime";

// Hubs with a past endsOn (e.g. Halloween after Nov 1) drop out of every nav
// (layout footer, /guides "Florida by season", guide pages). The hub page stays live.
export default function SeasonalSearchNav({ hubs = SEASONAL_SEARCH_HUBS }) {
  const active = activeSeasonalHubs(hubs, siteTodayStr());
  if (!active.length) return null;
  return <nav aria-label="Florida seasonal guides" style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", margin: "16px 0" }}>
    {active.map((hub) => <a key={hub.slug} href={"/" + hub.slug} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: hub.accent, textUnderlineOffset: 5 }}>{hub.label}</a>)}
  </nav>;
}
