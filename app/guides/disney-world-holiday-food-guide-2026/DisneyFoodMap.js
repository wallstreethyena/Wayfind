"use client";

import { useEffect, useState } from "react";
import MapCategoryPin from "../../components/MapCategoryPin";
import styles from "./DisneyFoodMap.module.css";

const initialPark = "animal-kingdom";

export default function DisneyFoodMap({ parks, stops, panels }) {
  const [parkId, setParkId] = useState(initialPark);

  // Deep links and the browser's Back button also open the park containing the food.
  useEffect(() => {
    let frame;
    const followHash = () => {
      const id = window.location.hash.slice(1);
      const stop = stops.find((item) => item.id === id);
      const park = parks.find((item) => id === "park-" + item.id);
      if (!stop && !park) return;
      setParkId(stop ? stop.parkId : park.id);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
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
    window.history.replaceState(window.history.state, "", "#park-" + id);
  }

  return <section id="disney-food-map" className={styles.explorer} aria-labelledby="disney-food-map-title">
    <h2 id="disney-food-map-title">Where are you eating?</h2>
    <div role="group" aria-label="Choose your park" className={styles.menu}>
      {parks.map((park) => <label className={styles.choice} key={park.id}>
        <input type="radio" name="disney-food-park" value={park.id} checked={parkId === park.id} onChange={() => changePark(park.id)} />
        <span>{park.shortName}</span>
      </label>)}
    </div>
    {parks.map((park) => {
      const parkStops = stops.filter((stop) => stop.parkId === park.id);
      return <div className={styles.panel} key={park.id} data-park={park.id} id={"park-" + park.id}>
        <h3>{park.shortName}</h3>
        <div className={styles.artboard}>
          <img data-guide-map-canvas alt={"Illustrated food areas in " + park.name} className={styles.art} width="766" height="340" src={"/guides/disney-christmas-maps/" + park.id + ".webp"} loading="lazy" />
          {parkStops.map((stop, index) => <a key={stop.id} className={styles.pin} href={"#" + stop.id}
            aria-label={stop.venue + " — " + stop.title} style={{ left: stop.mapX + "%", top: stop.mapY + "%" }}>
            <MapCategoryPin family="food" height={36} /><span>{index + 1}</span>
          </a>)}
        </div>
        <p className={styles.legend}>Illustrated food areas · Approximate locations</p>
        <ol className={styles.keyList}>{parkStops.map((stop) => <li key={stop.id}>
          <a href={"#" + stop.id}><strong>{stop.venue}</strong><small>{stop.title}</small></a>
        </li>)}</ol>
        <div key={parkId === park.id ? "active" : "idle"}>{panels[park.id]}</div>
      </div>;
    })}
  </section>;
}
