"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapCategoryPin from "../../components/MapCategoryPin";
import styles from "./page.module.css";

// Owner decision 2026-09-22: ONE map on this page, an illustrated farm map
// drawn from the real aerial layout (parking lot off SW 216th St at the top,
// pond to the east, paddocks and barns to the south, open field to the west).
// The art carries no text, so every label on it is ours and editable. Pins are
// approximate spots on the illustration, not GPS points.
const FARM_MAP = {
  src: "/guides/pintos-farm-miami-2026/farm-map-illustrated-2000.webp",
  srcSet: "/guides/pintos-farm-miami-2026/farm-map-illustrated-1200.webp 1200w, /guides/pintos-farm-miami-2026/farm-map-illustrated-2000.webp 2000w",
  width: 2000,
  height: 1247,
};

// Verified 2026-09-22 against Apple Maps: the street address and the Pinto's
// Farm place both land on SW 216th St at SW 149th Ave. The coordinate this
// button used before sent drivers to a different property about a mile away.
const DIRECTIONS_URL = "https://maps.apple.com/?daddr=14890%20SW%20216th%20St%2C%20Miami%2C%20FL%2033170&dirflg=d";

const ZONES = [
  { id: "parking", name: "Parking / arrival", family: "other", x: 39.8, y: 20.7, note: "Park in the main lot off SW 216th St, on the north side of the farm." },
  { id: "brewhouse", name: "Pinto's Brewhouse", family: "drinks", x: 52.8, y: 19.5, note: "Home of Pumpkins & Pints, Fri to Sun, 6 PM to 9 PM during the fall season." },
  { id: "shake-truck", name: "Shake Truck", family: "food", x: 59.5, y: 33.7, note: "Milkshakes and smoothies are one of the farm's posted on-site food options." },
  { id: "boat", name: "Boat ride / pond", family: "water", x: 76, y: 36.5, note: "The boat ride is included with the regular 2026 fall ticket." },
  { id: "race-track", name: "Race track", family: "fitness", x: 71.6, y: 49.9, note: "The race track is included with the regular 2026 fall ticket." },
  { id: "playground", name: "Play area", family: "fitness", x: 76.2, y: 63.7, note: "Open lawn for kids to run. The 2026 fall ticket also includes a bounce pad." },
  { id: "petting-zoo", name: "Petting zoo", family: "outdoors", x: 80.2, y: 78.2, note: "Do this early. Animal encounters close at 6 PM during the 2026 fall season." },
  { id: "pony-rides", name: "Pony rides", family: "outdoors", x: 51.4, y: 70.6, note: "Fall admission includes pony rides for children up to 75 lb and 48 in tall." },
  { id: "horse-barns", name: "Horse barns", family: "outdoors", x: 36.9, y: 70.4, note: "The barns sit beside the paddocks where the horses and ponies are kept." },
  { id: "fruit-trees", name: "Fruit trees", family: "outdoors", x: 52.1, y: 61.6, note: "A shady row of fruit trees between the main barn and the paddocks." },
  { id: "restrooms", name: "Restrooms", family: "other", x: 45.8, y: 57.2, note: "Guest restrooms by the main farm buildings." },
  { id: "pumpkin-patch", name: "Pumpkin patch", family: "event", x: 17, y: 24.3, note: "The fall pumpkin patch sets up on the open field. Seasonal layouts change, so check the day's map at the entrance." }
];

const DEFAULT_ZONE = ZONES.find((zone) => zone.id === "petting-zoo");

const SEASONAL = [
  ["Corn maze", "Included with regular fall admission"],
  ["Bounce pad", "Included with regular fall admission"],
  ["Fall photo spots", "Included with regular fall admission"],
  ["Pumpkin patch", "Fall season feature"],
  ["Pumpkins & Pints", "Brewhouse area, Fri to Sun, 6 PM to 9 PM"],
  ["Goat Yoga", "Limited-date experience"],
  ["Oktoberfest", "Oct 3, 4 PM to 9 PM, age 21+"]
];

export default function PintosFarmMap() {
  const [selectedId, setSelectedId] = useState(DEFAULT_ZONE.id);
  const selected = useMemo(() => ZONES.find((zone) => zone.id === selectedId) || DEFAULT_ZONE, [selectedId]);
  const scrollerRef = useRef(null);
  const listRef = useRef(null);

  // On narrow screens the map is wider than the screen and scrolls sideways.
  // Bring the chosen pin to the middle of the map window with map-local
  // scrolling only, so the page itself never jumps away from the map.
  const centerOn = useCallback((zone, animate) => {
    const scroller = scrollerRef.current;
    if (!scroller || !zone) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (max <= 1) return;
    const left = Math.min(max, Math.max(0, (zone.x / 100) * scroller.scrollWidth - scroller.clientWidth / 2));
    let smooth = animate;
    try { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) smooth = false; } catch (e) {}
    scroller.scrollTo({ left, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => { centerOn(DEFAULT_ZONE, false); }, [centerOn]);

  // On phones the spot list is a sideways rail above the map; keep the chosen
  // spot's chip in view inside that rail, again without moving the page.
  const revealChip = useCallback((zone) => {
    const list = listRef.current;
    const chip = list && zone ? list.querySelector('[data-zone="' + zone.id + '"]') : null;
    if (!list || !chip || list.scrollWidth - list.clientWidth <= 1) return;
    const left = chip.offsetLeft - (list.clientWidth - chip.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, []);

  const choose = (zone) => {
    setSelectedId(zone.id);
    centerOn(zone, true);
    revealChip(zone);
  };

  return (
    <section className={styles.mapSection} aria-labelledby="farm-map-title">
      <div className={styles.mapHeading}>
        <div>
          <p className={styles.kicker}>Plan the farm</p>
          <h2 id="farm-map-title">Pinto's Farm map</h2>
          <p>Where everything is, from the parking lot to the petting zoo. Pick a spot to see what is there.</p>
        </div>
        <div className={styles.mapProof}>
          <span>Illustrated map</span>
          <span>Not to scale</span>
          <span>Seasonal zones can move</span>
        </div>
      </div>

      <div className={styles.farmBoard}>
        <div className={styles.farmMapFrame}>
          <div ref={scrollerRef} className={styles.farmMapScroller}>
            <div className={styles.farmMapCanvas}>
              <img
                src={FARM_MAP.src}
                srcSet={FARM_MAP.srcSet}
                sizes="(max-width: 520px) 190vw, (max-width: 700px) 150vw, (max-width: 850px) 100vw, 780px"
                width={FARM_MAP.width}
                height={FARM_MAP.height}
                alt="Illustrated map of Pinto's Farm: the parking lot by SW 216th St, the Brewhouse, the pond with its island, the barns and paddocks, the play lawn and the open field"
                loading="lazy"
                decoding="async"
                draggable={false}
                className={styles.farmMapImg}
              />
              <span className={styles.roadTag} aria-hidden="true">SW 216th St</span>
              {ZONES.map((zone) => {
                const active = zone.id === selected.id;
                return (
                  <button
                    type="button"
                    key={zone.id}
                    className={styles.zonePin}
                    data-active={active ? "true" : "false"}
                    data-label={zone.y < 30 ? "below" : "above"}
                    aria-pressed={active}
                    aria-label={zone.name}
                    style={{ left: zone.x + "%", top: zone.y + "%" }}
                    onClick={() => choose(zone)}
                  >
                    <span className={styles.zonePinMark}><MapCategoryPin family={zone.family} height={34} /></span>
                    <span className={styles.zoneLabel} aria-hidden="true">{zone.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.zoneDetail}>
          <div aria-live="polite">
            <div className={styles.zoneDetailTitle}>
              <MapCategoryPin family={selected.family} height={34} />
              <div><small>Approximate spot</small><strong>{selected.name}</strong></div>
            </div>
            <p>{selected.note}</p>
          </div>
          <p className={styles.mapCaveat}>Pins mark the approximate spot on an illustrated map. Pinto's can move seasonal setups, so check the day's layout at the entrance.</p>
        </div>
        <div ref={listRef} className={styles.zoneList} role="group" aria-label="Places on the farm">
          {ZONES.map((zone) => {
            const active = zone.id === selected.id;
            return (
              <button
                type="button"
                key={zone.id}
                data-zone={zone.id}
                className={styles.zoneChip}
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                onClick={() => choose(zone)}
              >
                <MapCategoryPin family={zone.family} height={18} />
                <span>{zone.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.seasonalBlock}>
        <div>
          <p className={styles.kicker}>Fall 2026</p>
          <h3>Current seasonal activities</h3>
          <p>These are confirmed for the 2026 fall experience. Their exact on-property positions are not published clearly enough to pin, so ask at the entrance where each one is set up.</p>
        </div>
        <div className={styles.seasonalGrid}>
          {SEASONAL.map(([name, note]) => (
            <div key={name} className={styles.seasonalItem}>
              <span>{name}</span>
              <small>{note}</small>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.driveMap}>
        <div className={styles.driveCopy}>
          <div>
            <p className={styles.kicker}>Getting there</p>
            <h3>14890 SW 216th Street, Miami</h3>
            <p>The main lot is off SW 216th St at SW 149th Ave, on the north side of the farm.</p>
          </div>
          <a href={DIRECTIONS_URL} target="_blank" rel="noopener" className={styles.primaryAction}>
            Driving directions ↗
          </a>
        </div>
      </div>
    </section>
  );
}
