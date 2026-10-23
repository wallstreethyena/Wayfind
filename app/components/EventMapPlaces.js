"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { eventStayMapPins, mergeEventMapPlaces } from "../../lib/eventMapPlaces.js";

const EventMapPlacesContext = createContext(null);
const NO_PINS = Object.freeze([]);

// The streamed hotel rail publishes its exact displayed list to this event's
// map. No second search and no global store that can leak another event's pins.
//
// RE-ANCHOR (2026-10-22). When the browser's Apple check moves a provider venue
// point (lib/venueResolutionStore.js), EventNearbyReanchor fetches the nearby
// picks and stays for the CORRECTED point and hands them here in ONE state
// update, so the cards, the stays rail and the map pins all swap together:
//   picks           null until a re-anchor lands, then the admitted nearby rows
//                   (EventNearbyCards and the map draw these instead of the
//                   server's list)
//   reanchoredStays null until a re-anchor lands, then the stay rows the rail
//                   shows (EventStayCards draws these and publishes the pins for
//                   exactly what it shows, so a stale list can never overwrite them)
//   corrected       true once a re-anchor landed
// `stays`/`setStays` keep their original meaning: the MAP PINS for the stays the
// rail currently displays.
export default function EventMapPlaces({ children }) {
  const [stays, setStays] = useState([]);
  const [reanchor, setReanchor] = useState(null);
  const applyReanchor = useCallback((next) => {
    const picks = next && Array.isArray(next.picks) ? next.picks : null;
    const reanchoredStaysList = next && Array.isArray(next.stays) ? next.stays : null;
    if (!picks && !reanchoredStaysList) return;
    setReanchor((current) => ({
      picks: picks || (current && current.picks) || null,
      stays: reanchoredStaysList || (current && current.stays) || null,
      point: next.point || null,
    }));
  }, []);
  const clearReanchor = useCallback(() => setReanchor(null), []);
  const value = useMemo(() => ({
    stays, setStays,
    picks: reanchor ? reanchor.picks : null,
    reanchoredStays: reanchor ? reanchor.stays : null,
    corrected: !!reanchor,
    applyReanchor, clearReanchor,
  }), [stays, reanchor, applyReanchor, clearReanchor]);
  return <EventMapPlacesContext.Provider value={value}>{children}</EventMapPlacesContext.Provider>;
}
export function useEventMapPlaces() { return useContext(EventMapPlacesContext); }

// The pins the venue map draws: the re-anchored nearby picks when a re-anchor
// landed (otherwise the server's), merged with the stays the rail displays.
export function useEventMapPins(serverPicks) {
  const places = useEventMapPlaces();
  const stays = (places && places.stays) || NO_PINS;
  const picks = places && Array.isArray(places.picks) ? places.picks : serverPicks;
  return useMemo(() => mergeEventMapPlaces(picks, stays), [picks, stays]);
}
export { eventStayMapPins };
