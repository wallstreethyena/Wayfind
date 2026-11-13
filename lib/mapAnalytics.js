// lib/mapAnalytics.js — Privacy-Safe Map Decision Completion & Session Telemetry.
//
// PRIVACY CONTRACT (Phase 26 & 41):
// - NEVER emit raw or precise user coordinates (`lat`/`lng`) in telemetry.
// - Debounce/aggregate camera pans so exploring does not spam analytics.
// - Measure MAP DECISION COMPLETION (open -> selection -> execution).

export const DECISION_EXECUTION_ACTIONS = Object.freeze(new Set([
  "directions",
  "detail_open",
  "save",
  "itinerary_add",
  "ask_someone",
  "parking_open",
  "ticket_click",
]));

export function createMapSessionTracker(logEvent) {
  const startedAt = Date.now();
  let openedLogged = false;
  let panCount = 0;
  let pinsSelected = 0;
  let lensChanges = 0;
  let completedCount = 0;
  let currentMode = "explore_here";
  let currentMetro = "unknown";
  let panTimer = null;

  const emit = (eventName, place, extra = {}) => {
    if (typeof logEvent !== "function") return;
    const safeExtra = { ...extra };
    // Never leak coordinates even if passed accidentally
    delete safeExtra.lat;
    delete safeExtra.lng;
    delete safeExtra.latitude;
    delete safeExtra.longitude;
    try {
      logEvent(eventName, place || null, safeExtra);
    } catch {}
  };

  return {
    noteOpen({ mode = "explore_here", metro = "unknown", hasGps = false, category = "all" } = {}) {
      currentMode = mode;
      currentMetro = metro || "unknown";
      if (openedLogged) return;
      openedLogged = true;
      emit("map_open", null, {
        location_mode: currentMode,
        metro: currentMetro,
        has_gps: !!hasGps,
        category: String(category || "all"),
      });
    },
    noteModeChange({ mode, metro = "unknown", hasGps = false } = {}) {
      if (!mode || mode === currentMode) return;
      currentMode = mode;
      currentMetro = metro || currentMetro;
      emit(mode === "near_me" ? "map_near_me" : "map_explore_here", null, {
        location_mode: currentMode,
        metro: currentMetro,
        has_gps: !!hasGps,
      });
    },
    noteCameraSettled({ metro = "unknown", zoomChanged = false } = {}) {
      panCount += 1;
      if (metro) currentMetro = metro;
      if (panTimer) clearTimeout(panTimer);
      panTimer = setTimeout(() => {
        panTimer = null;
        emit("map_pan_settled", null, {
          location_mode: currentMode,
          metro: currentMetro,
          pans_in_session: panCount,
          zoom_changed: !!zoomChanged,
        });
      }, 2500);
    },
    noteLensChange({ lens = null, category = "all" } = {}) {
      lensChanges += 1;
      emit("map_filter_change", null, {
        lens: lens || "none",
        category: String(category || "all"),
        location_mode: currentMode,
      });
    },
    notePinSelected(place, { rank = null, lens = null } = {}) {
      pinsSelected += 1;
      emit("map_preview_viewed", place, {
        rank: Number.isFinite(rank) ? rank : null,
        lens: lens || "none",
        location_mode: currentMode,
        pins_viewed: pinsSelected,
      });
    },
    noteDecisionExecution(executionType, place, { rank = null, lens = null } = {}) {
      if (!DECISION_EXECUTION_ACTIONS.has(executionType)) return;
      completedCount += 1;
      emit("map_decision_complete", place, {
        execution_type: executionType,
        decision_ms: Date.now() - startedAt,
        pins_viewed: pinsSelected,
        pans_count: panCount,
        lens_changes: lensChanges,
        decisions_in_session: completedCount,
        rank: Number.isFinite(rank) ? rank : null,
        lens: lens || "none",
        location_mode: currentMode,
        metro: currentMetro,
      });
    },
    dispose() {
      if (panTimer) {
        clearTimeout(panTimer);
        panTimer = null;
      }
    },
    snapshot() {
      return {
        sessionAgeMs: Date.now() - startedAt,
        panCount,
        pinsSelected,
        lensChanges,
        completedCount,
        currentMode,
        currentMetro,
      };
    },
  };
}
