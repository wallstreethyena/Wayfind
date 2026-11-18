"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

export const UNIVERSAL_STOPS = [
  { n: 1, title: "Grinchmas", park: "islands", family: "shows", x: 21.94, y: 43.95, target: "grinchmas-seuss-landing" },
  { n: 2, title: "Grinch sandwich", park: "islands", family: "treats", x: 22.53, y: 52.34, target: "hop-on-pop" },
  { n: 3, title: "Savory tots", park: "islands", family: "food", x: 31.84, y: 50.88, target: "green-eggs-and-ham" },
  { n: 4, title: "Grinch breakfast", park: "islands", family: "characters", x: 26.95, y: 46.39, target: "grinch-character-breakfast" },
  { n: 5, title: "Hogsmeade", park: "islands", family: "photos", x: 29.04, y: 25.20, target: "hogsmeade-christmas" },
  { n: 6, title: "Holiday parade", park: "studios", family: "shows", x: 40.82, y: 26.37, target: "studios-holiday-parade" },
  { n: 7, title: "Holiday kiosks", park: "studios", family: "food", x: 44.14, y: 25.39, target: "new-york-holiday-kiosks" },
  { n: 8, title: "Diagon Alley", park: "studios", family: "photos", x: 62.76, y: 25.20, target: "diagon-alley-christmas" },
  { n: 9, title: "Gingy cake", park: "studios", family: "treats", x: 62.76, y: 49.41, target: "gingy-gingerbread-cake" },
  { n: 10, title: "Mario cake", park: "epic", family: "treats", x: 77.47, y: 46.97, target: "toadstool-cafe" },
  { n: 11, title: "Owl sundae", park: "epic", family: "treats", x: 81.25, y: 28.71, target: "frosty-moon" },
  { n: 12, title: "Snoggletog cone", park: "epic", family: "food", x: 94.47, y: 45.80, target: "hooligans-grog-and-gruel" },
  { n: 13, title: "Noir Holiday Supper", park: "epic", family: "food", x: 94.66, y: 31.35, target: "le-gobelet-noir" },
  { n: 14, title: "Burning Blade", park: "epic", family: "food", x: 76.37, y: 29.98, target: "burning-blade-tavern" },
  { n: 15, title: "Celestial Park lights", park: "epic", family: "photos", x: 84.83, y: 42.77, target: "celestial-park-after-dark" },
  { n: 16, title: "Coconut Club", park: "citywalk", family: "food", x: 40.10, y: 63.28, target: "green-red-coconut-club" },
  { n: 17, title: "Arrival & parking", park: "citywalk", family: "parking", x: 78.65, y: 74.70, target: "parking-and-arrival" },
];

const VIEWS = [{ id: "all", title: "Whole map", x: 50, y: 44 }, { id: "islands", title: "Islands", x: 21, y: 36 }, { id: "studios", title: "Studios", x: 52, y: 33 }, { id: "epic", title: "Epic", x: 85, y: 38 }, { id: "citywalk", title: "CityWalk", x: 48, y: 67 }];

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
  const [view, setView] = useState("all");
  const [zoom, setZoom] = useState(false);
  const scroller = useRef(null);
  function focusView(next) {
    setView(next.id);
    setZoom(next.id !== "all");
    requestAnimationFrame(() => {
      const node = scroller.current;
      if (!node) return;
      const canvas = node.firstElementChild;
      const left = next.id === "all" ? 0 : Math.max(0, canvas.clientWidth * next.x / 100 - node.clientWidth / 2);
      const top = next.id === "all" ? 0 : Math.max(0, canvas.clientHeight * next.y / 100 - node.clientHeight / 2);
      node.scrollTo({ left, top, behavior: "auto" });
    });
  }
  useEffect(() => {
    if (window.matchMedia("(max-width: 760px)").matches) focusView(VIEWS[1]);
  }, []);
  function choose(stop) {
    setSelected(stop.n);
    const target = document.getElementById(stop.target);
    if (!target) return;
    document.dispatchEvent(new CustomEvent("universal-guide-jump", { detail: { target: stop.target } }));
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }
  const visible = view === "all" ? UNIVERSAL_STOPS : UNIVERSAL_STOPS.filter(stop => stop.park === view);
  return <section className={styles.mapSection} aria-labelledby="explore-the-park" data-universal-map>
    <p className={styles.kicker}>Your park, your next stop</p>
    <h2 id="explore-the-park" tabIndex={-1}>Explore Universal</h2>
    <p>Tap a marker to open its guide entry. Choose a park for a closer look, then pan around the illustration.</p>
    <div className={styles.mapViews} aria-label="Map view">
      {VIEWS.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => focusView(item)}>{item.title}</button>)}
      <button type="button" onClick={() => { const next = !zoom; setZoom(next); }} aria-pressed={zoom} aria-label={zoom ? "Zoom out" : "Zoom in"}>{zoom ? "−" : "+"}</button>
    </div>
    <div ref={scroller} className={styles.mapScroller} tabIndex={0} role="region" aria-label="Illustrated Universal map. Scroll to pan; named guide links follow below.">
      <div className={styles.universalMapCanvas} data-zoomed={zoom ? "true" : "false"}>
        <img data-guide-map-canvas src="/guides/universal-orlando-christmas-2026/universal-illustrated-map.webp" width={1536} height={1024} alt="Illustrated Universal Orlando holiday atlas with Islands of Adventure and Studios above CityWalk, and Epic Universe in a separate panel. Seventeen numbered markers match the guide links below." loading="lazy" decoding="async" draggable={false} />
        {UNIVERSAL_STOPS.map(stop => <a key={stop.n} className={styles.mapHotspot} data-selected={selected === stop.n} data-map-stop={stop.target} href={"#" + stop.target} aria-label={stop.n + ". " + stop.title + ": read guide"} style={{ left: stop.x + "%", top: stop.y + "%" }} onClick={() => choose(stop)}><span>{stop.n}</span></a>)}
      </div>
    </div>
    <p className={styles.mapNote}>Illustrated guide, approximate layout. <a href="https://www.universalorlando.com/web/en/us/plan-your-visit/resort-maps" target="_blank" rel="noopener noreferrer">Official maps for walking directions</a>.</p>
    <div className={styles.mapStops} aria-label="Guide stops">
      {visible.map(stop => <a key={stop.n} href={"#" + stop.target} data-map-stop={stop.target} onClick={() => choose(stop)} aria-current={selected === stop.n ? "location" : undefined}><b>{stop.n}</b><StopIcon family={stop.family} /><span>{stop.title}</span><i aria-hidden="true">↗</i></a>)}
    </div>
  </section>;
}
