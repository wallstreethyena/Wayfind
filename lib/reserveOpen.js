// lib/reserveOpen.js — the one global opener for the "Reserve a table" sheet, plus its analytics.
// Any surface calls openReserveSheet(place). The sheet is a separate chunk fetched on the first
// tap. Analytics carry no names and no notes, ever.
import { track } from "./track.js";

export function trackReserve(event, params) { try { track(event, params); } catch (e) {} }

export function openReserveSheet(place, opts) {
  if (typeof window === "undefined" || !place || !place.id) return;
  const surface = (opts && opts.surface) || "place_card";
  trackReserve("reserve_cta_clicked", { surface, place_id: place.id });
  import("../app/components/ReserveSheet.js")
    .then((m) => m.showReserveSheet({ id: place.id, name: place.name || "this restaurant" }, { surface }))
    .catch((e) => { try { console.warn("[reserve] sheet failed to load:", e && e.message); } catch (er) {} });
}
