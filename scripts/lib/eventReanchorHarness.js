// scripts/lib/eventReanchorHarness.js: ONE module graph for the event re-anchor
// guard (scripts/test-event-reanchor-render.mjs). scripts/lib/jsxLoad.mjs gives
// each loadComponent() call its own copies of every module, so the store, the
// EventMapPlaces context and the components must all be compiled from a single
// entry or they would not share a store or a context. Re-exports only.
export { default as EventMapPlaces, useEventMapPlaces, useEventMapPins } from "../../app/components/EventMapPlaces.js";
export { default as EventNearbyReanchor, venueNearbyUrl } from "../../app/components/EventNearbyReanchor.js";
export { default as EventNearbyCards } from "../../app/components/EventNearbyCards.js";
export { default as EventStayCards } from "../../app/components/EventStayCards.js";
export { default as EventPlan } from "../../app/events/[city]/[slug]/EventPlan.js";
export { useResolvedVenuePoint } from "../../app/components/useResolvedVenuePoint.js";
export * as venueStore from "../../lib/venueResolutionStore.js";
