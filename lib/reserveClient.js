// lib/reserveClient.js — the EAGER half of "Reserve a table" (client only).
//
// The place card imports this file and the card is eager on "/", where the JS
// budget is a ratchet with about a kilobyte of headroom. So this file is only
// the hook. The partner list loader (lib/reservePartners.js), the opener and
// analytics (lib/reserveOpen.js), the wide button (app/components/ReserveCta.js, carried inside the partners chunk),
// the API wrappers and form rules (lib/reserveClientApi.js) and the sheet are all
// separate chunks fetched when needed.
import { useSyncExternalStore } from "react";

let mod = null;
let pending = null;
const listeners = new Set();

function subscribe(cb) {
  listeners.add(cb);
  // First subscriber starts the one fetch, after hydration and never during render. The loader never rejects.
  pending = pending || import("./reservePartners.js").then((m) => { mod = m; return m.loadReservePartners(); }).then(() => listeners.forEach((l) => l()), () => {});
  return () => { listeners.delete(cb); };
}
const off = () => () => {};

/**
 * For a Wayfind reservation partner this returns the button slot component (truthy), otherwise false.
 * The slot lives in the lazy partners chunk, so the card needs no lazy(), no Suspense and no second import().
 * False on the server and on the hydrating render (getServerSnapshot), so server HTML and the first client
 * render agree and the update arrives right after. A falsy id opts out entirely: no subscription, no fetch
 * (a card whose caller filled the CTA slot itself). Detail treats the result as a boolean.
 */
export function useReservePartner(placeId) {
  return useSyncExternalStore(placeId ? subscribe : off, () => !!mod && mod.isPartner(placeId) && mod.ReserveCtaSlot, () => false);
}

/**
 * The capability to CTA entry for a place card: { lane, label, Slot } or false (see lib/reserveCapability.js).
 * False while the list loads, on the server and on the hydrating render; a failed list still gives "Ask about a table"
 * to sit down restaurants (the concierge checks live) and never a verified label. A falsy place opts out entirely: no
 * subscription, no fetch (a card whose caller filled the CTA slot itself).
 */
export function useReserveEntry(place) {
  const on = !!(place && (place.id || place.place_id));
  return useSyncExternalStore(on ? subscribe : off, () => (mod ? mod.entryFor(place) : false), () => false);
}
