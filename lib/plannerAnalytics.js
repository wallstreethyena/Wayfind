// lib/plannerAnalytics.js — Privacy-safe funnel & outcome instrumentation for
// Wayfind Planner. Never records raw private user conversation text, emails,
// or personal notes.

import { captureOrQueue } from "./browserAnalytics.js";

export const PLANNER_EVENTS = Object.freeze({
  OPENED: "planner_opened",
  REQUEST: "planner_request",
  PLAN_GENERATED: "planner_plan_generated",
  PLAN_SAVED: "planner_plan_saved",
  STOP_ADDED: "planner_stop_added",
  STOP_REMOVED: "planner_stop_removed",
  STOP_REPLACED: "planner_stop_replaced",
  DAY_OPTIMIZED: "planner_day_optimized",
  PLAN_ABANDONED: "planner_plan_abandoned",
  ITINERARY_OPENED_AFTER_PLAN: "itinerary_opened_after_plan",
  HIGH_INTENT_FROM_PLANNED_STOP: "planner_planned_stop_action",
});

const FORBIDDEN_TEXT_KEYS = new Set([
  "message",
  "raw_message",
  "prompt",
  "raw_prompt",
  "conversation",
  "note",
  "notes",
  "query_text",
  "email",
]);

const ALLOWED_ENUM_STRINGS = {
  surface: 40,
  voice: 24,
  mode: 32,
  intent_kind: 32,
  source_mode: 32,
  city_slug: 48,
  trip_key: 64,
  action_kind: 40,
  stop_id: 120,
  trigger: 40,
};

export function sanitizePlannerAnalyticsProps(raw = {}) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (FORBIDDEN_TEXT_KEYS.has(key)) continue;
    if (val == null) continue;
    if (typeof val === "boolean") {
      out[key] = val;
    } else if (typeof val === "number" && Number.isFinite(val)) {
      out[key] = Math.round(val * 100) / 100;
    } else if (typeof val === "string" && ALLOWED_ENUM_STRINGS[key]) {
      const cleaned = val.trim().slice(0, ALLOWED_ENUM_STRINGS[key]);
      if (cleaned && !cleaned.includes("@") && !/\s{2,}/.test(cleaned)) {
        out[key] = cleaned;
      }
    }
  }
  return out;
}

export function trackPlannerEvent(eventName, rawProps = {}, { logEvent, win } = {}) {
  if (!eventName || typeof eventName !== "string") return null;
  const props = {
    feature: "wayfind_planner",
    ...sanitizePlannerAnalyticsProps(rawProps),
  };
  if (typeof logEvent === "function") {
    try {
      logEvent(eventName, null, props);
      return { event: eventName, props, sink: "logEvent" };
    } catch {
      // fall through to captureOrQueue
    }
  }
  const targetWin = win !== undefined ? win : (typeof window !== "undefined" ? window : null);
  if (targetWin) {
    try {
      captureOrQueue(targetWin, eventName, props);
      return { event: eventName, props, sink: "captureOrQueue" };
    } catch {
      // ignore analytics transport errors
    }
  }
  return { event: eventName, props, sink: "noop" };
}

export function isPlannedStopItem(item) {
  if (!item || typeof item !== "object") return false;
  if (item.addedVia === "wayfind_planner") return true;
  if (item.place && item.place.addedVia === "wayfind_planner") return true;
  return false;
}
