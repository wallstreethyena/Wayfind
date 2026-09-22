"use client";

import { useMemo, useState } from "react";
import CreatorAppleMap from "../../components/CreatorAppleMap";
import MapCategoryPin from "../../components/MapCategoryPin";
import styles from "./page.module.css";

const FARM = {
  id: "ChIJUczTK5XC2YgRRt4Jp6N3B70",
  name: "Pinto's Farm",
  lat: 25.559785,
  lng: -80.41664,
  category: "attractions",
  primaryType: "farm",
  mapFamily: "outdoors"
};

const ZONES = [
  { id: "restrooms", name: "Restrooms", family: "other", x: 25, y: 19, note: "Stable guest facility shown on the farm layout." },
  { id: "horse-barns", name: "Horse barns", family: "outdoors", x: 52, y: 13, note: "Barn area shown toward the upper middle of the farm layout." },
  { id: "pony-rides", name: "Pony rides", family: "outdoors", x: 69, y: 22, note: "Fall admission includes pony rides for children up to 75 lb and 48 in tall." },
  { id: "petting-zoo", name: "Petting zoo", family: "outdoors", x: 82, y: 31, note: "Do this early. Animal encounters close at 6 PM during the 2026 fall season." },
  { id: "fruit-trees", name: "Fruit trees", family: "outdoors", x: 91, y: 47, note: "Tree area shown along the east side of the farm layout." },
  { id: "playground", name: "Play area", family: "fitness", x: 42, y: 46, note: "Central play zone on the farm layout. The 2026 fall ticket also includes a bounce pad." },
  { id: "boat", name: "Boat ride / pond", family: "water", x: 18, y: 58, note: "The boat ride is included with the regular 2026 fall ticket." },
  { id: "shake-truck", name: "Shake Truck", family: "food", x: 17, y: 83, note: "Milkshakes and smoothies are one of the farm's posted on-site food options." },
  { id: "parking", name: "Parking / arrival", family: "other", x: 49, y: 88, note: "Main arrival zone on the farm layout." },
  { id: "race-track", name: "Race track", family: "fitness", x: 78, y: 83, note: "The race track is included with the regular 2026 fall ticket." }
];

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
  const [selectedId, setSelectedId] = useState("petting-zoo");
  const selected = useMemo(() => ZONES.find((zone) => zone.id === selectedId) || ZONES[0], [selectedId]);

  return (
    <section className={styles.mapSection} aria-labelledby="farm-map-title">
      <div className={styles.mapHeading}>
        <div>
          <p className={styles.kicker}>Plan the farm</p>
          <h2 id="farm-map-title">Pinto's Farm map</h2>
          <p>Use the layout to orient the day, then use the live Wayfind map for the exact farm location and driving directions.</p>
        </div>
        <div className={styles.mapProof}>
          <span>Orientation map</span>
          <span>Not to scale</span>
          <span>Seasonal zones can move</span>
        </div>
      </div>

      <div className={styles.farmBoard}>
        <div className={styles.farmField} aria-label="Orientation diagram of Pinto's Farm">
          <div className={styles.fieldBand} aria-hidden="true" />
          <div className={styles.pond} aria-hidden="true"><span>Pond</span></div>
          <div className={styles.entryRoad} aria-hidden="true"><span>SW 216th St</span></div>
          {ZONES.map((zone) => {
            const active = selected && selected.id === zone.id;
            return (
              <button
                type="button"
                key={zone.id}
                className={styles.zonePin}
                data-active={active ? "true" : "false"}
                style={{ left: zone.x + "%", top: zone.y + "%" }}
                onClick={() => setSelectedId(zone.id)}
                aria-label={zone.name}
              >
                <MapCategoryPin family={zone.family} height={active ? 36 : 31} />
                <span>{zone.name}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.zoneDetail} aria-live="polite">
          <div className={styles.zoneDetailTitle}>
            <MapCategoryPin family={selected.family} height={34} />
            <div><small>Farm zone</small><strong>{selected.name}</strong></div>
          </div>
          <p>{selected.note}</p>
          <p className={styles.mapCaveat}>Use this for orientation, not turn by turn navigation inside the property. Pinto's can change seasonal placements.</p>
        </div>
      </div>

      <div className={styles.seasonalBlock}>
        <div>
          <p className={styles.kicker}>Fall 2026</p>
          <h3>Current seasonal activities</h3>
          <p>These are confirmed for the 2026 fall experience. Their exact on-property positions are not published clearly enough for Wayfind to invent a pin.</p>
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
            <p>The pin below is the real geographic farm location. The activity diagram above is intentionally separate because individual attractions do not have verified GPS coordinates.</p>
          </div>
          <a
            href="https://maps.apple.com/?daddr=25.559785,-80.41664&dirflg=d"
            target="_blank"
            rel="noopener"
            className={styles.primaryAction}
          >
            Driving directions ↗
          </a>
        </div>
        <div className={styles.appleMapWrap}><CreatorAppleMap places={[FARM]} /></div>
      </div>
    </section>
  );
}
