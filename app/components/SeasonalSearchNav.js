import { SEASONAL_SEARCH_HUBS } from "../../lib/seasonalSearch";

export default function SeasonalSearchNav({ hubs = SEASONAL_SEARCH_HUBS }) {
  if (!hubs.length) return null;
  return <nav aria-label="Florida seasonal guides" style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", margin: "16px 0" }}>
    {hubs.map((hub) => <a key={hub.slug} href={"/" + hub.slug} style={{ display: "inline-flex", alignItems: "center", minHeight: 44, color: hub.accent, textUnderlineOffset: 5 }}>{hub.label}</a>)}
  </nav>;
}
