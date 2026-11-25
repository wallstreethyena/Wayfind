"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import { visiblePosterSubjectKey } from "../../lib/posterDaypartPlan.js";
import { businessStatus, isOperational } from "../../lib/businessStatus.js";

const Spotlight = createContext(null);
const Snapshot = createContext(null);

export function PosterPlanSeed({ plan, children }) {
  return createElement(Snapshot.Provider, { value: plan }, children);
}

export function usePosterPlan() {
  return useContext(Snapshot);
}

// Each eligible rendered card claims its exact typed subject. Select one
// matching card via model priority, not score changes, new rows or DOM scraping.
export function PosterSpotlightProvider({ shortlist, children }) {
  const [visible, setVisible] = useState(() => new Map());
  const register = useCallback((instance, subject) => {
    setVisible((prev) => new Map(prev).set(instance, subject));
    return () => setVisible((prev) => {
      if (!prev.has(instance)) return prev;
      const next = new Map(prev);
      next.delete(instance);
      return next;
    });
  }, []);
  const value = useMemo(() => {
    if (!shortlist.length) return null;
    for (const subject of shortlist) {
      for (const [instance, key] of visible) {
        if (key === subject) return { shortlist, register, winner: instance };
      }
    }
    return { shortlist, register, winner: null };
  }, [visible, register, shortlist]);
  return createElement(Spotlight.Provider, { value }, children);
}

export function usePosterSpotlight({ place = null, href = null, actionItem = null, liveWhen = null, excluded = false } = {}) {
  const context = useContext(Spotlight);
  const instance = useId();
  const key = context && !excluded ? visiblePosterSubjectKey(place, href, actionItem) : null;
  let eligible = Boolean(key && context.shortlist.includes(key));
  if (eligible && key.startsWith("pl:")) {
    const status = businessStatus(place);
    eligible = isOperational(place) && status.open === true && !status.stale;
  } else if (eligible) {
    eligible = liveWhen?.label === "Open now";
  }
  const register = context?.register;
  useEffect(() => eligible && register ? register(instance, key) : undefined, [eligible, instance, key, register]);
  return Boolean(eligible && context.winner === instance);
}

export function PosterSpotlightBadge() {
  return createElement("span", {
    "data-poster-spotlight": "true",
    style: { color: "#FFD296", fontSize: "10px", fontWeight: 750, lineHeight: 1.1 },
  }, "Daypart pick");
}
