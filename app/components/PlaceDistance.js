'use client';

import { useSyncExternalStore } from 'react';
import { deviceLocationStore } from '../../lib/deviceLocationStore.js';
import { distanceMiles, formatDistanceMiles } from '../../lib/deviceDistance.js';

export function useDeviceLocation() {
  return useSyncExternalStore(deviceLocationStore.subscribe, deviceLocationStore.getSnapshot, deviceLocationStore.getServerSnapshot);
}

export function usePlaceDistance(place) {
  return distanceMiles(useDeviceLocation(), place);
}

export default function PlaceDistance({ place, prefix = '', suffix = ' mi', ...spanProps }) {
  const label = formatDistanceMiles(usePlaceDistance(place));
  if (label === null) return null;
  return <span title="Straight-line distance from your current location" aria-label={`${label} miles straight-line distance from your current location`} {...spanProps}>{prefix}{label}{suffix}</span>;
}
