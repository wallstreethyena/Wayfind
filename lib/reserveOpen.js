// lib/reserveOpen.js — the one global opener for the "Reserve a table" sheet, plus its analytics.
// Any surface calls openReserveSheet(place). The sheet is a separate chunk fetched on the first
// tap. Analytics carry no names and no notes, ever.
import { track } from "./track.js";

export function trackReserve(event, params) { try { track(event, params); } catch (e) {} }

// Only the fields the sheet needs for directions and Add to itinerary; never the whole card object.
function sheetPlace(p) {
  const out = { id: p.id, name: p.name || "this restaurant" };
  for (const k of ["address", "city", "lat", "lng", "photo", "category"]) if (p[k] != null && p[k] !== "") out[k] = p[k];
  return out;
}

export function openReserveSheet(place, opts) {
  if (typeof window === "undefined" || !place || !place.id) return;
  const surface = (opts && opts.surface) || "place_card";
  const lane = (opts && opts.lane) || null;
  trackReserve("reserve_cta_clicked", lane ? { surface, place_id: place.id, lane } : { surface, place_id: place.id });
  import("../app/components/ReserveSheet.js")
    .then((m) => m.showReserveSheet(sheetPlace(place), { surface }))
    .catch((e) => { try { console.warn("[reserve] sheet failed to load:", e && e.message); } catch (er) {} });
}

// Sign in can be a full page redirect (Google), which would forget which restaurant the guest was booking.
// The concierge's sign in button saves {placeId, name} here; the home shell calls resumeReserveIntent() once a
// session exists and the sheet reopens on the same restaurant. Never holds names of people, never a note.
const PENDING_KEY = "wf_reserve_pending_v1";
const PENDING_MS = 30 * 60 * 1000;
export function savePendingReserve(place) {
  try { if (place && place.id) sessionStorage.setItem(PENDING_KEY, JSON.stringify({ placeId: place.id, name: place.name || "", t: Date.now() })); } catch (e) {}
}
export function clearPendingReserve() { try { sessionStorage.removeItem(PENDING_KEY); } catch (e) {} }
export function resumeReserveIntent() {
  if (typeof window === "undefined") return false;
  let v = null;
  try { v = JSON.parse(sessionStorage.getItem(PENDING_KEY)); } catch (e) {}
  if (!v || !v.placeId || !(Date.now() - v.t < PENDING_MS)) { if (v) clearPendingReserve(); return false; }
  if (document.querySelector("[data-reserve-concierge]")) return false; // the open sheet resumes itself
  clearPendingReserve();
  openReserveSheet({ id: v.placeId, name: v.name || "this restaurant" }, { surface: "signin_resume" });
  return true;
}
