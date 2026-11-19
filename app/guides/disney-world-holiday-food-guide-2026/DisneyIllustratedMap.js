"use client";

// The owner-supplied illustrated park map for one Disney park, with the
// guide's numbered food pins. Keeps the behavior of the geographic map it
// replaces: "Food area" / "Whole area" views (where the park has a close-up),
// zoom, pins that open the food stop, and a numbered-list fallback.
import { useState } from "react";
import IllustratedParkMap from "../../components/IllustratedParkMap";
import { DISNEY_PARK_VIEWS, DISNEY_FOOD_PINS, parkMapImage } from "../../../lib/parkMaps2026.js";
import styles from "./DisneyIllustratedMap.module.css";

export default function DisneyIllustratedMap({ parkId, parkName, stops, selectedId, onSelect }) {
  // Keyed so a park change resets the view.
  return <ParkView key={parkId} parkId={parkId} parkName={parkName} stops={stops} selectedId={selectedId} onSelect={onSelect} />;
}

function ParkView({ parkId, parkName, stops, selectedId, onSelect }) {
  const views = DISNEY_PARK_VIEWS[parkId];
  if (!views) throw new Error("Missing illustrated map views for " + parkId);
  const [whole, setWhole] = useState(false);
  const mapKey = whole && views.whole ? views.whole : views.food;
  const positions = DISNEY_FOOD_PINS[mapKey] || {};
  const pins = stops.map((stop, index) => positions[stop.id] ? { id: stop.id, number: index + 1, label: stop.venue + ", " + stop.title, left: positions[stop.id][0], top: positions[stop.id][1] } : null).filter(Boolean);
  return <section className={styles.map} aria-label={parkName + " illustrated food map"}>
    {views.whole ? <div className={styles.switcher} role="group" aria-label="Map view">
      <button type="button" aria-pressed={!whole} onClick={() => setWhole(false)}>Food area</button>
      <button type="button" aria-pressed={whole} onClick={() => setWhole(true)}>Whole park</button>
    </div> : null}
    <IllustratedParkMap key={mapKey} image={parkMapImage(mapKey)} pins={pins} selectedId={selectedId} onSelect={onSelect}
      label={parkName + " illustrated map"}
      hint="Tap a number for the treat, price and details. Zoom in, then scroll to explore."
      note="Illustrated guide, not an official Disney map; positions are approximate. Follow park signs for directions and accessibility."
      fallback="The park map could not load. Every food stop is still in the numbered list below." />
  </section>;
}
