// lib/plannerCompanionBridge.js — Lightweight client bridge connecting
// BooCompanion/Santa, ItineraryScreen, AuthWall, and standalone pages to the
// lazy-loaded `WayfindPlannerSheet` and `app/home.js` trip state.

import { safeLocalStorage } from "./safeStorage.js";

function isCompanionPlannerIntent(message, { hasActiveTrip = false } = {}) {
  const raw = String(message || "").trim();
  if (!raw || raw.length < 4) return false;
  const lower = raw.toLowerCase();
  if (hasActiveTrip && /\b(?:swap|replace|instead\s+of|remove|drop|skip|delete|move\s+.+\s+to|add|include|squeeze\s+in|work\s+in|cheaper|budget|free|kid[\s-]*friendly|less\s+driving|closer|nearby|more\s+christmas|lights|festive|optimize|reorder|organize\s+(?:these|my)|group\s+by\s+area|route\s+order)\b/i.test(raw)) {
    return true;
  }
  if (/\b(?:\d{4}-\d{2}-\d{2}\s*(?:to|through|thru|[-–—])\s*\d{4}-\d{2}-\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}\s*(?:to|through|thru|[-–—])\s*(?:[a-z]+\s+)?\d{1,2}|(?:[2-7]|two|three|four|five|six|seven)\s*[-\s]?days?|(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\s+(?:to|through|thru|[-–—])\s+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|(?:this|next)\s+weekend)\b/i.test(raw)) {
    return true;
  }
  if (/\b(?:build\s+(?:me\s+)?(?:a\s+)?(?:trip|itinerary|day|weekend|plan)|plan\s+(?:my|our|a)\s+(?:trip|weekend|itinerary|day|visit|christmas)|create\s+(?:an?\s+)?itinerary|day\s+by\s+day|multi\s*day|organize\s+these\s+into\s+days)\b/i.test(lower)) {
    return true;
  }
  return false;
}

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
  if (!isCompanionPlannerIntent(message, { hasActiveTrip })) return false;
  return openWayfindPlanner({
    prompt: message,
    voice: santa ? "santa" : "wayfind",
    surface: santa ? "santa_companion" : "companion",
    pathname,
  });
}
