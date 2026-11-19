"use client";

import { useEffect, useMemo, useState } from "react";
import DisneyFoodGeographicMap from "./DisneyFoodGeographicMap";
import { revealFoodDestination } from "../../../lib/disneyFoodMapController.js";
import locations from "../../../lib/disneyChristmasFoodLocations2026.json";
import styles from "./DisneyFoodMap.module.css";

const initialPark = "animal-kingdom";


export default function DisneyFoodMap({ parks, stops, panels }) {
  const [parkId, setParkId] = useState(initialPark);

  const [selectedId, setSelectedId] = useState(null);
  const places = useMemo(() => stops
    .filter((stop) => stop.parkId === parkId && locations[stop.id])
    .map((stop) => ({
      id: stop.id,
      lat: locations[stop.id].lat,
      lng: locations[stop.id].lng,
      name: locations[stop.id].label,
      city: stop.title,
      category: "food",
    })), [parkId, stops]);

  function openStop(id) {
    if (!id) return;
    setSelectedId(id);
    if (window.location.hash === "#" + id) revealFoodDestination(id);
    else window.location.hash = id;
  }

  // Deep links and the browser's Back button also open the park containing the food.
  useEffect(() => {
    let frame;
    const followHash = () => {
      const id = window.location.hash.slice(1);
      const stop = stops.find((item) => item.id === id);
      const park = parks.find((item) => id === "park-" + item.id);
      if (!stop && !park) return;
      setParkId(stop ? stop.parkId : park.id);
      setSelectedId(stop?.id || null);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (stop) revealFoodDestination(id);
        else document.getElementById(id)?.scrollIntoView({ block: "start" });
      });
    };
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => {
      window.removeEventListener("hashchange", followHash);
      cancelAnimationFrame(frame);
    };
  }, [parks, stops]);

  function changePark(id) {
    setParkId(id);
    setSelectedId(null);
    window.history.replaceState(window.history.state, "", "#park-" + id);
  }

  return <section id="disney-food-map" className={styles.explorer} aria-labelledby="disney-food-map-title">
    <p className={styles.eyebrow}>Your holiday food atlas</p>
    <h2 id="disney-food-map-title">A little magic. A real place.</h2>
    <p className={styles.intro}>Choose your park, then tap a numbered pin for the treat, price and details. Paths and landmarks stay on the map, so you can find your way.</p>
    <div role="group" aria-label="Choose your park" className={styles.menu}>
      {parks.map((park) => <label className={styles.choice} key={park.id}>
        <input type="radio" name="disney-food-park" value={park.id} checked={parkId === park.id} onChange={() => changePark(park.id)} />
        <span>{park.shortName}</span>
      </label>)}
    </div>
    {parks.map((park) => {
      const parkStops = stops.filter((stop) => stop.parkId === park.id);
      return <div className={styles.panel} key={park.id} data-park={park.id} id={"park-" + park.id}>
        <div className={styles.mapHeading}><h3>{park.shortName}</h3><span>{parkStops.length} food {parkStops.length === 1 ? "stop" : "stops"}</span></div>
        {park.id === parkId && <div className={styles.geographicFrame} aria-label={"Food locations in " + park.name}>
          <DisneyFoodGeographicMap parkId={parkId} places={places} selectedId={selectedId} onSelect={openStop} />
        </div>}
        <ol className={styles.keyList}>{parkStops.map((stop, index) => <li key={stop.id} data-selected={selectedId === stop.id}>
          <a href={"#" + stop.id} onClick={event => { event.preventDefault(); openStop(stop.id); }}><span className={styles.stopNumber} aria-hidden="true">{index + 1}</span><span><strong>{stop.venue}</strong><small>{stop.title}</small></span><span aria-hidden="true">↗</span></a>
          {locations[stop.id]?.landmark && <small className={styles.mapNote}>Pin at {locations[stop.id].label} · {locations[stop.id].landmark}</small>}
        </li>)}</ol>
        <div key={parkId === park.id ? "active" : "idle"}>{panels[park.id]}</div>
      </div>;
    })}
  </section>;
}
