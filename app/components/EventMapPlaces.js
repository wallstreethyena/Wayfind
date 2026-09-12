"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { eventStayMapPins } from "../../lib/eventMapPlaces.js";

const EventMapPlacesContext = createContext(null);

// The streamed hotel rail publishes its exact displayed list to this event's
// map. No second search and no global store that can leak another event's pins.
export default function EventMapPlaces({ children }) {
  const [stays, setStays] = useState([]);
  const value = useMemo(() => ({ stays, setStays }), [stays]);
  return <EventMapPlacesContext.Provider value={value}>{children}</EventMapPlacesContext.Provider>;
}
export function useEventMapPlaces() { return useContext(EventMapPlacesContext); }
export { eventStayMapPins };
