'use client';

import { useEffect, useRef, useState } from 'react';
import MapCategoryPin from '../../components/MapCategoryPin';
import viewports from './disney-map-viewports.json';
import styles from './DisneyFoodGeographicMap.module.css';

/** EPSG:3857, identical to the SVG renderer. Returns percentage anchor coordinates. */
export function projectPin({ lng, lat }, viewport) {
  const r = 6378137;
  const radians = Math.PI / 180;
  const x = (r * lng * radians - viewport.xMin) * viewport.scale;
  const y = (viewport.yMax - r * Math.log(Math.tan(Math.PI / 4 + lat * radians / 2))) * viewport.scale;
  return { left: x / viewport.width * 100, top: y / viewport.height * 100 };
}

// Parent provides park heading, stop list, detail anchors and focus/scroll callback.
export default function DisneyFoodGeographicMap({ parkId, places = [], selectedId, onSelect }) {
  // Keyed child resets the view and scrolling when the parent changes park tabs.
  return <ParkView key={parkId} parkId={parkId} places={places} selectedId={selectedId} onSelect={onSelect} />;
}

function ParkView({ parkId, places, selectedId, onSelect }) {
  const [whole, setWhole] = useState(false);
  const mapKey = `${parkId}${whole ? '-whole' : ''}`;
  const viewport = viewports[mapKey];
  if (!viewport) throw new Error('Missing geographic map viewport: ' + mapKey);
  const title = parkId.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ');
  return <section className={styles.map} aria-label={`${title} geographic food map`}>
    <div className={styles.switcher} role="group" aria-label="Map view">
      <button type="button" aria-pressed={!whole} onClick={() => setWhole(false)}>Food area</button>
      <button type="button" aria-pressed={whole} onClick={() => setWhole(true)}>Whole area</button>
    </div>
    <MapCanvas key={mapKey} mapKey={mapKey} title={title} viewport={viewport} places={places} selectedId={selectedId} onSelect={onSelect} />
    <div className={styles.legend} aria-label="Map legend">
      <span><i className={styles.water} />Water</span><span><i className={styles.green} />Green space</span>
      <span><i className={styles.building} />Buildings</span><span><i className={styles.path} />Paths</span>
    </div>
    <p className={styles.credit}><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href={`/guides/disney-food-2026/maps/data/${parkId}.geojson`}>Map data (ODbL)</a></p>
    <p className={styles.note}>Independent geographic reference, not an official Disney map. Paths and access may change. Check park signs for current directions and accessibility.</p>
  </section>;
}

function MapCanvas({ mapKey, title, viewport, places, selectedId, onSelect }) {
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  // The server-rendered basemap can fail BEFORE React hydrates, and that error
  // event is gone by the time onError is attached: check the image once after
  // mount too (a finished image with no pixels is a failed one).
  const basemap = useRef(null);
  useEffect(() => { const img = basemap.current; if (img && img.complete && img.naturalWidth === 0) setFailed(true); }, []);
  const pins = places.map((place, index) => ({place, number: index + 1, position: projectPin(place, viewport)})).filter(({position: p}) => Number.isFinite(p.left) && Number.isFinite(p.top) && p.left >= 0 && p.left <= 100 && p.top >= 0 && p.top <= 100);
  return <>
    <div className={styles.toolbar}>
      <p className={styles.hint}>Tap a number for food details. Zoom in, then scroll to explore.</p>
      <div className={styles.zoom} role="group" aria-label="Map zoom">
        <button type="button" disabled={failed || zoom <= 1} aria-label="Zoom out" onClick={() => setZoom(z => Math.max(1, z - .5))}>−</button>
        <button type="button" disabled={failed || zoom >= 3} aria-label="Zoom in" onClick={() => setZoom(z => Math.min(3, z + .5))}>+</button>
      </div>
    </div>
    <div className={styles.scroll} tabIndex={0} role="region" aria-label={`${title} map, scroll to explore when zoomed`}>
      <div className={styles.canvas} style={failed ? undefined : {width: `${zoom * 100}%`, aspectRatio: `${viewport.width} / ${viewport.height}`}}>
        {!failed && <img ref={basemap} data-guide-map-canvas width={viewport.width} height={viewport.height} className={styles.basemap} src={`/guides/disney-food-2026/maps/${mapKey}.svg`} alt={`${title}: mapped buildings, water, green areas and paths. North is up.`} onError={() => setFailed(true)} draggable={false} />}
        {failed && <p role="status" className={styles.failure}>The map image could not load. Choose a food stop from the numbered list below.</p>}
        {!failed && pins.map(({place, number, position}) => <button key={place.id} type="button" className={styles.pin} style={{left: `${position.left.toFixed(3)}%`, top: `${position.top.toFixed(3)}%`}} aria-label={`Stop ${number}: ${place.name}`} aria-pressed={selectedId === place.id} data-food-pin={place.id} onClick={() => onSelect(place.id)}><MapCategoryPin family="food" height={46} /><span>{number}</span></button>)}
      </div>
    </div>
  </>;
}
