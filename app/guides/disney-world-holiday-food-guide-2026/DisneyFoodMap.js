"use client";

import GuideMapExplorer from "../../components/GuideMapExplorer";
import IllustratedParkMap from "../../components/IllustratedParkMap";
import { DISNEY_FOOD_PINS, DISNEY_PARK_MAP, parkMapImage } from "../../../lib/parkMaps2026.js";

// The Disney food map on the ONE shared guide map card (GuideMapExplorer):
// park chips, the park's illustrated map with numbered pins, and the standard
// RailCard rail. Each card opens its full entry further down the page.
// Owner 2026-11-20: no beige panel or green header around the map, zoom inside
// the map, and the EPCOT Festival of the Holidays booths each on the map.
// Designed artwork for cards without a licensed photo: announced as an
// illustration (RailCard EventPlaceholderTile), never as a photo of the food.
const TREAT_TILE = { icon: "🎄", label: "Holiday treat", tint: "linear-gradient(160deg,#7A0E1C,#2A040B)" };
const BOOTH_TILE = { icon: "🍽️", label: "Festival booth", tint: "linear-gradient(160deg,#1E4A34,#0B1C14)" };
const STOP_TILE = { icon: "🍽️", label: "Festival menu", tint: "linear-gradient(160deg,#1E4A34,#0B1C14)" };
const PARK_ORDER = ["animal-kingdom", "epcot", "magic-kingdom", "hollywood-studios", "disney-springs"];

export function disneyFoodSpots(stops, festival) {
  const spots = [];
  for (const parkId of PARK_ORDER) {
    for (const stop of stops.filter((s) => s.parkId === parkId)) {
      spots.push({ id: stop.id, name: stop.title, eyebrow: "Holiday treat", city: stop.venue, when: stop.postedPrice ? "Posted price " + stop.postedPrice : null, detail: stop.summary, tip: stop.tip || null, href: "#" + stop.id, groups: [parkId], photoFallbackCategory: "christmas", placeholder: TREAT_TILE });
    }
    if (festival && festival.parkId === parkId) {
      for (const booth of festival.booths) {
        spots.push({ id: booth.id, name: booth.name, eyebrow: booth.kind === "stop" ? "Festival menu stop" : booth.isNew ? "New festival booth" : "Festival booth", city: booth.where, detail: booth.items.join(", "), href: "#booth-" + booth.id, groups: [parkId], photoFallbackCategory: "christmas", placeholder: booth.kind === "stop" ? STOP_TILE : BOOTH_TILE });
      }
    }
  }
  return spots;
}

export function disneyMapPins(parkId, visible) {
  const pins = DISNEY_FOOD_PINS[parkId] || {};
  return visible.filter((spot) => pins[spot.id]).map((spot) => ({ id: spot.id, number: visible.indexOf(spot) + 1, label: spot.name, left: pins[spot.id][0], top: pins[spot.id][1], family: "food" }));
}

export default function DisneyFoodMap({ parks, stops, festival }) {
  const byId = Object.fromEntries(parks.map((park) => [park.id, park]));
  const filters = PARK_ORDER.filter((id) => byId[id]).map((id) => ({ id, label: byId[id].shortName, family: "food" }));
  return <div id="disney-food-map">
    <GuideMapExplorer
      spots={disneyFoodSpots(stops, festival)}
      pagePath="/guides/disney-world-holiday-food-guide-2026"
      filters={filters}
      kicker="Choose a park, then swipe"
      heading="Holiday food, mapped by park."
      description="Every card matches a numbered pin on the park map. Swipe the cards or tap a pin, then open a card for the treat, price and ticket details."
      proof={["Creator posts", "Admission noted", "Festival menus mapped"]}
      note="Illustrated park maps are not to scale. Follow park signs on the day."
      railIdPrefix="disney-food"
      renderMap={({ active, visible, selectedId, onSelect }) => <IllustratedParkMap
        key={active}
        image={parkMapImage(DISNEY_PARK_MAP[active])}
        pins={disneyMapPins(active, visible)}
        selectedId={selectedId}
        onSelect={onSelect}
        label={(byId[active]?.name || "Park") + " holiday food map"}
        note={active === "epcot" ? "World Showcase pins sit on their pavilions. World Celebration pins are approximate." : null}
        fallback="The map image could not load. Every stop is on the cards beside it."
      />}
    />
  </div>;
}
