// lib/plannerCompanionBridge.js — Lightweight client bridge connecting
// BooCompanion/Santa, ItineraryScreen, AuthWall, and standalone pages to the
// lazy-loaded `WayfindPlannerSheet` and `app/home.js` trip state.

import { isPlannerIntent } from "./plannerParse.js";
import { safeLocalStorage } from "./safeStorage.js";

export const PLANNER_OPEN_EVENT = "wf:planner-open";
export const PLANNER_COMMIT_EVENT = "wf:planner-commit";

export function openWayfindPlanner(detail = {}) {
  if (typeof window === "undefined") return false;
  try {
    window.__wfPendingPlannerOpen = detail;
    window.dispatchEvent(new CustomEvent(PLANNER_OPEN_EVENT, { detail }));
    return true;
  } catch {
    return false;
  }
}

export function broadcastPlannerTripCommit(detail = {}) {
  if (typeof window === "undefined") return false;
  try {
    window.dispatchEvent(new CustomEvent(PLANNER_COMMIT_EVENT, { detail }));
    return true;
  } catch {
    return false;
  }
}

export function readStoredTripsSnapshot() {
  const store = safeLocalStorage();
  if (!store) return {};
  try {
    const raw = store.getItem("wayfind_trips");
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Used by BooCompanion's chat sheet: if a user sends a multi-stop / multi-day
 * trip-planning request (e.g. "Orlando Nov 20 to 23, two adults, Christmas and food"),
 * hands off seamlessly to Wayfind Planner in the active seasonal voice.
 */
export function maybeHandoffCompanionToPlanner(message, { santa = false, pathname = "/" } = {}) {
  const trips = readStoredTripsSnapshot();
  const hasActiveTrip = Object.values(trips).some((t) => t && Array.isArray(t.items) && t.items.length > 0);
  if (!isPlannerIntent(message, { hasActiveTrip })) return false;
  return openWayfindPlanner({
    prompt: message,
    voice: santa ? "santa" : "wayfind",
    surface: santa ? "santa_companion" : "companion",
    pathname,
  });
}
