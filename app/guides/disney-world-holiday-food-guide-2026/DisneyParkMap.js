'use client';

import { useEffect, useRef, useState } from 'react';
import { loadAppleMapKit } from '../../../lib/appleMapsRuntime.js';
import { createDisneyFoodMap } from '../../../lib/disneyFoodMapController.js';
import styles from './DisneyFoodMap.module.css';

export default function DisneyParkMap({ places, selectedId, onSelect }) {
  const host = useRef(null);
  const controller = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [state, setState] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let dead = false;
    let instance;
    setState('loading');
    loadAppleMapKit(process.env.NEXT_PUBLIC_APPLE_MAPS_TOKEN).then(mapkit => {
      if (dead || !host.current) return;
      instance = createDisneyFoodMap({ mapkit, container: host.current, places,
        className: styles.foodPin, onSelect: id => onSelectRef.current(id) });
      controller.current = instance;
      instance.select(selectedRef.current);
      setState('ready');
    }).catch(() => { if (!dead) setState('error'); });
    return () => { dead = true; instance?.destroy(); if (controller.current === instance) controller.current = null; };
  }, [places, attempt]);
  useEffect(() => { controller.current?.select(selectedId); }, [selectedId]);
  return <>
    <div ref={host} className={styles.mapHost} aria-label="Geographic park map with numbered food stops" />
    {state !== 'ready' && <div className={styles.mapStatus} role="status">
      <p>{state === 'error' ? 'The map could not load. Every food stop is still available in the numbered list below.' : 'Opening the park map…'}</p>
      {state === 'error' && <button type="button" onClick={() => setAttempt(value => value + 1)}>Retry map</button>}
    </div>}
    {state === 'ready' && <button type="button" className={styles.fitButton} onClick={() => controller.current?.fit()}>Show all stops</button>}
  </>;
}
