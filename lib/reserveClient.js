// lib/reserveClient.js — the EAGER half of "Reserve a table" (client only).
//
// The place card imports this file and the card is eager on "/", where the JS
// budget is a ratchet with about a kilobyte of headroom. So this file is only
// the hook. The partner list loader (lib/reservePartners.js), the opener and
// analytics (lib/reserveOpen.js), the wide button (app/components/ReserveCta.js),
// the API wrappers and form rules (lib/reserveApi.js) and the sheet are all
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
 * true only for a Wayfind reservation partner. False on the server and on the
 * hydrating render (getServerSnapshot), so server HTML and the first client
 * render agree and the update arrives right after. A falsy id opts out entirely:
 * no subscription, no fetch (a card whose caller filled the CTA slot itself).
 */
export function useReservePartner(placeId) {
  const on = !!placeId;
  return useSyncExternalStore(on ? subscribe : off, () => !!mod && mod.isPartner(placeId), () => false);
}
