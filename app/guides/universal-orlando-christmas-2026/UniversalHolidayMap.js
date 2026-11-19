"use client";

import { useState } from "react";
import IllustratedParkMap from "../../components/IllustratedParkMap";
import { UNIVERSAL_VIEW_MAPS, parkMapImage } from "../../../lib/parkMaps2026.js";
import styles from "./page.module.css";

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

function StopIcon({ family }) {
  const paths = {
    food: <><path d="M5 3v6m3-6v6M3 3v6q0 3 3 3v9m12-18v18m0-18q-5 6 0 9" /></>,
    treats: <><path d="M7 12l5 10 5-10M6 12h12M6 10a4 4 0 013-4 3 3 0 016 0 4 4 0 013 4" /></>,
    shows: <><path d="M3 4l8 2v7q-4 6-8-1zM13 5l8-2v9q-4 7-8 1" /><path d="M5 8h1m3 0h1m5 0h1m3 0h1M5 12q2 2 4 0m6 1q2-2 4 0" /></>,
    photos: <><path d="M3 7h5l2-3h4l2 3h5v13H3z" /><circle cx="12" cy="13" r="4" /></>,
    characters: <><path d="M4 21l12-12M15 2l1 4 4 1-4 1-1 4-1-4-4-1 4-1zM21 14v5m-2-2h4M5 2v5M3 4h4" /></>,
    parking: <><path d="M8 21V3h6a5 5 0 010 10H8" /></>,
  };
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[family] || paths.food}</svg>;
}

export default function UniversalHolidayMap() {
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("islands");
  function choose(stop) {
    setSelected(stop.n);
    const target = document.getElementById(stop.target);
    if (!target) return;
    document.dispatchEvent(new CustomEvent("universal-guide-jump", { detail: { target: stop.target } }));
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
  const visible = UNIVERSAL_STOPS.filter(stop => stop.park === view);
  const byTarget = Object.fromEntries(UNIVERSAL_STOPS.map(stop => [stop.target, stop]));
  const selectedTarget = UNIVERSAL_STOPS.find(stop => stop.n === selected)?.target || null;
  const pins = visible.map(stop => ({ id: stop.target, number: stop.n, label: stop.title + ": read guide", left: stop.x, top: stop.y, href: "#" + stop.target, family: PIN_FAMILY[stop.family] }));
  return <section className={styles.mapSection} aria-labelledby="explore-the-park" data-universal-map>
    <p className={styles.kicker}>Your park, your next stop</p>
    <h2 id="explore-the-park" tabIndex={-1}>Explore Universal</h2>
    <p>Choose a park, then tap a numbered pin to open its guide entry. Zoom in to explore the illustration.</p>
    <div className={styles.mapViews} aria-label="Map view">
      {VIEWS.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => setView(item.id)}>{item.title}</button>)}
    </div>
    <IllustratedParkMap key={view} image={parkMapImage(UNIVERSAL_VIEW_MAPS[view])} pins={pins} selectedId={selectedTarget} onSelect={(target) => byTarget[target] && choose(byTarget[target])}
      label={"Illustrated " + VIEWS.find(item => item.id === view).title + " map"}
      hint="Tap a number to open that stop in the guide. Zoom in, then scroll to explore."
      note={<>Illustrated guide, approximate layout. <a href="https://www.universalorlando.com/web/en/us/plan-your-visit/resort-maps" target="_blank" rel="noopener noreferrer">Official maps for walking directions</a></>}
      fallback="The park map could not load. Every stop is in the numbered list below." />
    <div className={styles.mapStops} aria-label="Guide stops">
      {visible.map(stop => <a key={stop.n} href={"#" + stop.target} data-map-stop={stop.target} onClick={() => choose(stop)} aria-current={selected === stop.n ? "location" : undefined}><b>{stop.n}</b><StopIcon family={stop.family} /><span>{stop.title}</span><i aria-hidden="true">↗</i></a>)}
    </div>
  </section>;
}
