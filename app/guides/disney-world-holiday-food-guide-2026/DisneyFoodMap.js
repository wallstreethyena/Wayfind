"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MapCategoryPin from "../../components/MapCategoryPin";
import styles from "./DisneyFoodMap.module.css";

// This is an editorial orientation diagram. Its authored shapes, labels and
// pin positions are schematic; they do not encode GPS locations or routes.
export default function DisneyFoodMap({ parks, stops }) {
  const [parkId, setParkId] = useState("all");
  const [selectedId, setSelectedId] = useState(stops[0].id);
  const scrollerRef = useRef(null);
  const visibleStops = parkId === "all" ? stops : stops.filter((stop) => stop.parkId === parkId);
  const selected = visibleStops.find((stop) => stop.id === selectedId) || visibleStops[0];
  const selectedPark = selected && parks.find((park) => park.id === selected.parkId);

  const centerOn = useCallback((stop, animate) => {
    const scroller = scrollerRef.current;
    if (!scroller || !stop) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (max <= 1) return;
    const left = Math.min(max, Math.max(0, stop.mapX / 100 * scroller.scrollWidth - scroller.clientWidth / 2));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left, behavior: animate && !reducedMotion ? "smooth" : "auto" });
  }, []);

  useEffect(() => { centerOn(stops[0], false); }, [centerOn, stops]);

  const choose = (stop) => {
    setSelectedId(stop.id);
    centerOn(stop, true);
  };

  const filterPark = (id) => {
    setParkId(id);
    const first = stops.find((stop) => id === "all" || stop.parkId === id);
    if (first) choose(first);
  };

  return (
    <section id="disney-food-map" className={styles.mapSection} aria-labelledby="disney-food-map-title">
      <div className={styles.mapHeading}>
        <div>
          <p className={styles.kicker}>Find your holiday stop</p>
          <h2 id="disney-food-map-title">A taste of the World</h2>
          <p>Pick a destination, then a food pin. Each stop links to its details below.</p>
        </div>
        <span className={styles.mapProof}>Schematic • Not to scale</span>
      </div>

      <div className={styles.filters} role="group" aria-label="Filter food stops by destination">
        <button type="button" aria-pressed={parkId === "all"} onClick={() => filterPark("all")}>All destinations</button>
        {parks.map((park) => (
          <button key={park.id} type="button" aria-pressed={parkId === park.id} onClick={() => filterPark(park.id)}>{park.shortName}</button>
        ))}
      </div>

      <div className={styles.mapBoard}>
        <div className={styles.mapFrame}>
          <div ref={scrollerRef} className={styles.mapScroller} tabIndex={0} aria-label="Holiday food schematic. Scroll sideways to explore all destinations." aria-describedby="disney-food-map-note">
            <div className={styles.mapCanvas}>
              <svg className={styles.mapArt} viewBox="0 0 900 560" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                <rect width="900" height="560" fill="#15231d" />
                <path d="M-30 290C70 225 150 290 220 265S345 180 430 226S560 345 645 280S790 212 930 265L930 340C800 288 733 312 652 358S485 350 422 291S320 290 235 325S76 290-30 365Z" fill="#1b3d40" />
                <path d="M-30 315C65 258 152 315 228 291S345 213 425 254S563 371 651 308S794 241 930 293" fill="none" stroke="#3d6663" strokeWidth="1.5" opacity=".4" />
                {parks.map((park, index) => (
                  <g key={park.id} transform={`translate(${park.x * 9} ${park.y * 5.6})`} opacity={parkId === "all" || parkId === park.id ? 1 : 0.38}>
                    <path d="M-118-24C-76-47-29-29 10-33S105-28 123 5S143 82 102 111S27 132-17 122S-119 121-135 78S-151 0-118-24Z" fill={index % 2 === 0 ? "#293b29" : "#26372d"} stroke="#55644b" strokeWidth="1.3" />
                    <path d="M-103 11C-64-8-16 10 25 2S99 11 104 43" fill="none" stroke="#809073" strokeWidth="1" opacity=".26" />
                    <circle cx="-98" cy="77" r="14" fill="#344932" /><circle cx="-80" cy="88" r="9" fill="#3c5036" />
                    <circle cx="95" cy="78" r="12" fill="#344932" /><circle cx="107" cy="67" r="8" fill="#3c5036" />
                  </g>
                ))}
              </svg>
              {parks.map((park) => (
                <span key={park.id} className={styles.regionLabel} data-muted={parkId !== "all" && parkId !== park.id} style={{ left: park.x + "%", top: park.y + "%" }}>{park.name}</span>
              ))}
              {visibleStops.map((stop) => {
                const active = stop.id === selectedId;
                return (
                  <button key={stop.id} type="button" className={styles.stopPin} data-active={active} aria-pressed={active} aria-label={stop.venue + ": " + stop.title} style={{ left: stop.mapX + "%", top: stop.mapY + "%" }} onClick={() => choose(stop)}>
                    <span className={styles.pinMark}><MapCategoryPin family="food" height={36} /></span>
                    <span className={styles.pinLabel} aria-hidden="true">{stop.shortName || stop.venue}</span>
                  </button>
                );
              })}
              <span className={styles.canvasNote} aria-hidden="true">Holiday food • Destination overview</span>
            </div>
          </div>
          <p id="disney-food-map-note" className={styles.mapNote}>An orientation diagram, with schematic food pins. Use the destination and venue names to plan your visit. On smaller screens, swipe the map sideways.</p>
        </div>

        <div className={styles.stopDetail} aria-live="polite" aria-atomic="true">
          {selected ? (
            <>
              <div className={styles.detailTitle}>
                <MapCategoryPin family="food" height={34} />
                <div><small>{selectedPark?.name}</small><h3>{selected.venue}</h3></div>
              </div>
              <p className={styles.detailFood}>{selected.title}</p>
              <dl className={styles.detailFacts}>
                <div><dt>Location</dt><dd>{selected.location}</dd></div>
                <div><dt>Admission</dt><dd>{selected.admission}</dd></div>
              </dl>
              <p>{selected.mapNote}</p>
              <a className={styles.readLink} href={"#" + selected.id}>Read this stop <span aria-hidden="true">↓</span></a>
            </>
          ) : <p>No food stops in this destination.</p>}
        </div>

        <div className={styles.stopList}>
          <p className={styles.listHeading}>{visibleStops.length} {visibleStops.length === 1 ? "stop" : "stops"} to explore</p>
          <ul aria-label="Holiday food stops">
            {visibleStops.map((stop) => (
              <li key={stop.id}>
                <button type="button" aria-pressed={stop.id === selectedId} onClick={() => choose(stop)}>
                  <MapCategoryPin family="food" height={22} />
                  <span><strong>{stop.venue}</strong><small>{parks.find((park) => park.id === stop.parkId)?.shortName}</small></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
