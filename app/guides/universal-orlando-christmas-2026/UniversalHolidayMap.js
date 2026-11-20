"use client";

import GuideMapExplorer from "../../components/GuideMapExplorer";
import IllustratedParkMap from "../../components/IllustratedParkMap";
import { UNIVERSAL_VIEW_MAPS, parkMapImage } from "../../../lib/parkMaps2026.js";

// Pin TIPS in percent of each park's owner-supplied illustration
// (lib/parkMaps2026.js, UNIVERSAL_VIEW_MAPS). Stops sit on the illustration's
// own land pin where it has one; Circus McGurkus (the circus tent in Seuss
// Landing), Frosty Moon, the Celestial Park fountain and the CityWalk parking
// marker are placed on the illustrated building or symbol itself.
export const UNIVERSAL_STOPS = [
  { n: 1, title: "Grinchmas", park: "islands", family: "shows", x: 81.47, y: 34.62, target: "grinchmas-seuss-landing" },
  { n: 2, title: "Grinch sandwich", park: "islands", family: "treats", x: 80.42, y: 45.97, target: "hop-on-pop" },
  { n: 3, title: "Savory tots", park: "islands", family: "food", x: 85.71, y: 27.58, target: "green-eggs-and-ham" },
  { n: 4, title: "Grinch breakfast", park: "islands", family: "characters", x: 74.5, y: 47.0, target: "grinch-character-breakfast" },
  { n: 5, title: "Hogsmeade", park: "islands", family: "photos", x: 26.82, y: 30.76, target: "hogsmeade-christmas" },
  { n: 6, title: "Holiday parade", park: "studios", family: "shows", x: 32.91, y: 71.59, target: "studios-holiday-parade" },
  { n: 7, title: "Holiday kiosks", park: "studios", family: "food", x: 32.74, y: 35.99, target: "new-york-holiday-kiosks" },
  { n: 8, title: "Diagon Alley", park: "studios", family: "photos", x: 60.54, y: 46.36, target: "diagon-alley-christmas" },
  { n: 9, title: "Gingy cake", park: "studios", family: "treats", x: 18.88, y: 88.62, target: "gingy-gingerbread-cake" },
  { n: 10, title: "Mario cake", park: "epic", family: "treats", x: 36.14, y: 61.31, target: "toadstool-cafe" },
  { n: 11, title: "Owl sundae", park: "epic", family: "treats", x: 53.5, y: 62.0, target: "frosty-moon" },
  { n: 12, title: "Snoggletog cone", park: "epic", family: "food", x: 59.74, y: 70.12, target: "hooligans-grog-and-gruel" },
  { n: 13, title: "Noir Holiday Supper", park: "epic", family: "food", x: 55.7, y: 55.37, target: "le-gobelet-noir" },
  { n: 14, title: "Burning Blade", park: "epic", family: "food", x: 38.14, y: 50.97, target: "burning-blade-tavern" },
  { n: 15, title: "Celestial Park lights", park: "epic", family: "photos", x: 45.0, y: 55.0, target: "celestial-park-after-dark" },
  { n: 16, title: "Coconut Club", park: "citywalk", family: "food", x: 73.5, y: 30.54, target: "green-red-coconut-club" },
  { n: 17, title: "Arrival & parking", park: "citywalk", family: "parking", x: 64.0, y: 72.0, target: "parking-and-arrival" },
];

const VIEWS = [{ id: "islands", title: "Islands" }, { id: "studios", title: "Studios" }, { id: "epic", title: "Epic" }, { id: "citywalk", title: "CityWalk" }];
const PIN_FAMILY = { food: "food", treats: "cafe", shows: "shows", characters: "shows", photos: "culture", parking: "parking" };

const FAMILY_TILE = {
  food: { icon: "🍽️", tint: "linear-gradient(160deg,#4A2A10,#1E1207)" },
  treats: { icon: "🍪", tint: "linear-gradient(160deg,#7A0E1C,#2A040B)" },
  shows: { icon: "🎭", tint: "linear-gradient(160deg,#2A1B4D,#141026)" },
  characters: { icon: "✨", tint: "linear-gradient(160deg,#5A0A1A,#1E0509)" },
  photos: { icon: "📸", tint: "linear-gradient(160deg,#143246,#0A1722)" },
  parking: { icon: "🅿️", tint: "linear-gradient(160deg,#25303D,#11161D)" },
};
const FAMILY_LABEL = { food: "Holiday food", treats: "Holiday treat", shows: "Holiday show", characters: "Character meal", photos: "Photo stop", parking: "Arrival" };

// The Universal map on the ONE shared guide map card (GuideMapExplorer), the
// same card the Disney guide and the template guides use (owner 2026-11-20:
// no beige box around the map, zoom inside the map, places in the standard
// card rail). Pins keep the guide's own stop numbers; a card opens its entry.
export function universalSpots() {
  return UNIVERSAL_STOPS.map((stop) => ({ id: stop.target, name: stop.title, rank: stop.n, eyebrow: FAMILY_LABEL[stop.family] || "Guide stop", city: VIEWS.find((v) => v.id === stop.park).title, href: "#" + stop.target, groups: [stop.park], photoFallbackCategory: "christmas", placeholder: { ...(FAMILY_TILE[stop.family] || FAMILY_TILE.food), label: FAMILY_LABEL[stop.family] || "Guide stop" } }));
}

export default function UniversalHolidayMap() {
  const byTarget = Object.fromEntries(UNIVERSAL_STOPS.map((stop) => [stop.target, stop]));
  return <div id="explore-the-park" tabIndex={-1} data-universal-map>
    <GuideMapExplorer
      spots={universalSpots()}
      filters={VIEWS.map((view) => ({ id: view.id, label: view.title, family: "culture" }))}
      kicker="Your park, your next stop"
      heading="Explore Universal"
      description="Choose a park, then swipe the cards or tap a numbered pin. Open a card to jump to its guide entry."
      proof={[UNIVERSAL_STOPS.length + " stops", "Four park maps", "Numbers match the guide"]}
      pagePath="/guides/universal-orlando-christmas-2026"
      note="Illustrated guide, approximate layout. Use the official resort maps for walking directions."
      railIdPrefix="universal-map"
      filterForHash={(hash) => byTarget[hash]?.park || null}
      renderMap={({ active, visible, selectedId, onSelect }) => <IllustratedParkMap
        key={active}
        image={parkMapImage(UNIVERSAL_VIEW_MAPS[active])}
        pins={visible.map((spot) => { const stop = byTarget[spot.id]; return { id: stop.target, number: stop.n, label: stop.title, left: stop.x, top: stop.y, family: PIN_FAMILY[stop.family] }; })}
        selectedId={selectedId}
        onSelect={onSelect}
        label={"Illustrated " + VIEWS.find((view) => view.id === active).title + " map"}
        note={<a href="https://www.universalorlando.com/web/en/us/plan-your-visit/resort-maps" target="_blank" rel="noopener noreferrer">Official maps for walking directions</a>}
        fallback="The park map could not load. Every stop is on the cards beside it."
      />}
    />
  </div>;
}
