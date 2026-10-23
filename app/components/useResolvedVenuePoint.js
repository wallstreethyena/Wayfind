"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { readVenueResolution, shouldReanchor, subscribeVenueResolution } from "../../lib/venueResolutionStore.js";

const NO_ANSWER = () => null;

/**
 * The point to rank nearby things from for one provider venue.
 *
 * Returns the provider point as given with `corrected: false` until the
 * browser's Apple check (EventVenueMap) has published a CORRECTED answer for
 * THIS venue (same name and same provider point) that moved it by more than
 * 300 m; then returns Apple's point with `corrected: true`. On the server and
 * on the first client render there is no answer, so the markup always matches
 * what the server rendered. `driftMeters` is the published answer's drift
 * (0 when there is none).
 *
 * @param {{name?: string, lat: number|string, lng: number|string}} venue the PROVIDER venue, exactly as the page rendered it
 * `resolved` is true once ANY answer (confirmed, corrected or kept) has been
 * published for this venue: a caller that would rather make one request from
 * the best point than two (EventPlan's metered rails) waits on it.
 *
 * @returns {{point: {lat: number, lng: number}, corrected: boolean, resolved: boolean, driftMeters: number}}
 */
export function useResolvedVenuePoint({ name, lat, lng } = {}) {
  const venue = useMemo(() => ({ name, lat, lng }), [name, lat, lng]);
  const subscribe = useCallback((listener) => subscribeVenueResolution(venue, listener), [venue]);
  const getSnapshot = useCallback(() => readVenueResolution(venue), [venue]);
  const answer = useSyncExternalStore(subscribe, getSnapshot, NO_ANSWER);
  const providerLat = Number(lat);
  const providerLng = Number(lng);
  return useMemo(() => {
    if (answer && shouldReanchor(answer)) {
      return { point: { lat: answer.point.lat, lng: answer.point.lng }, corrected: true, resolved: true, driftMeters: answer.driftMeters };
    }
    return { point: { lat: providerLat, lng: providerLng }, corrected: false, resolved: !!answer, driftMeters: answer ? answer.driftMeters : 0 };
  }, [answer, providerLat, providerLng]);
}

export default useResolvedVenuePoint;
