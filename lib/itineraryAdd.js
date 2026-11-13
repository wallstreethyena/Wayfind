// lib/itineraryAdd.js — one add path for surfaces that do not have home.js
// logEvent in scope (the event page, guide cards). Returns the next trips
// object plus the analytics events the caller should emit. Already-present
// stops emit nothing.

import { addPlaceToTrips, nearestStopIndex, tripMetaForPlace } from "./trips.js";

export function addStopToStoredTrips(trips, place, ts, opts) {
  const before = trips && typeof trips === "object" ? trips : {};
  if (!place || !place.id) return { trips: before, events: [], already: false };
  const meta = tripMetaForPlace(place);
  const cleanDay = typeof place.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(place.day.trim()) ? place.day.trim() : "";
  const existed = !!before[meta.key];
  const already = !!(existed && before[meta.key].items && before[meta.key].items.some((it) => it && it.id === place.id));
  if (already) {
    if (cleanDay && before[meta.key] && Array.isArray(before[meta.key].items)) {
      const updated = {
        ...before,
        [meta.key]: {
          ...before[meta.key],
          items: before[meta.key].items.map((it) =>
            it && it.id === place.id && !it.day ? { ...it, day: cleanDay } : it
          ),
        },
      };
      return { trips: updated, events: [], already: true };
    }
    return { trips: before, events: [], already: true };
  }
  const existingItems = existed && before[meta.key].items ? before[meta.key].items : [];
  const plan = opts && opts.autoOrder ? nearestStopIndex(existingItems, place) : { auto: false };
  const insertion = opts && opts.autoOrder && plan.auto ? "auto" : "manual";
  let next = addPlaceToTrips(before, place, ts, opts);
  if ((cleanDay || place.note) && next[meta.key] && Array.isArray(next[meta.key].items)) {
    next = {
      ...next,
      [meta.key]: {
        ...next[meta.key],
        items: next[meta.key].items.map((it) =>
          it && it.id === place.id
            ? {
                ...it,
                ...(cleanDay ? { day: it.day || cleanDay } : {}),
                ...(place.note && !it.note ? { note: place.note } : {}),
              }
            : it
        ),
      },
    };
  }
  const src = (opts && opts.addedVia) || null;
  const events = [];
  if (!existed) {
    events.push({ name: "trip_create", props: { key: meta.key, city: meta.city, state: meta.state, src } });
  }
  events.push({
    name: "stop_add",
    props: { key: meta.key, city: meta.city, state: meta.state, src, place_id: place.id, place_name: place.name || null, insertion },
  });
  events.push({
    name: "itinerary_item_added",
    props: { source: src, insertion, key: meta.key, place_id: place.id },
  });
  return { trips: next, events, already: false, insertion };
}
