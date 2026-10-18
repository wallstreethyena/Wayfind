"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createAppleMapRecovery, createAppleMapSearch, planAppleMapRecovery } from "../../lib/appleMapRecovery.js";

// Only this mounted Apple map owns the results. No storage, API writes, or
// Google fallback. Origin changes invalidate the old distance/score context.
export default function useAppleMapRecovery({ places, existing, bounds, origin, category, sub, mapkit, enabled, ready }) {
  const engine = useRef(null);
  const [resolved, setResolved] = useState({ origin: "", places: [] });
  const [progress, setProgress] = useState({ key: "", status: "idle", stats: null });
  const originKey = `${origin?.lat}|${origin?.lng}`;
  const evidence = new Map((places || []).map((p) => [p.id, JSON.stringify(p)]));
  const existingIds = new Set((existing || []).map((p) => p.id));
  const alreadyRecovered = resolved.origin === originKey ? resolved.places.filter((entry) => entry.evidence === evidence.get(entry.place.id)).map((entry) => entry.place) : [];
  for (const p of alreadyRecovered) existingIds.add(p.id);
  const candidates = (places || []).filter((p) => !existingIds.has(p.id));
  const identityContext = [...(places || []), ...(existing || [])];
  const planned = planAppleMapRecovery({ places: candidates, identityContext, bounds, category, sub });
  // Evidence changes, rather than array identity or a progressive accepted pin,
  // define a new search. Do not restart a batch when its first result arrives.
  const evidenceKey = JSON.stringify([(places || []).map((p) => [p.id, p.name, p.city, p.locality, p.address, p.governed_score, p.wfScore, p.mapCoord, p.category, p.primaryType, p.types, p.tags, p.secondaryCategories, p.status, p.businessStatus]),
    (existing || []).map((p) => [p.id, p.name, p.city, p.locality, p.address])]);
  const scopeKey = JSON.stringify([originKey, category, sub, bounds]);
  const key = `${scopeKey}|${evidenceKey}`;
  useEffect(() => {
    if (!mapkit) return undefined;
    const instance = createAppleMapRecovery({ search: createAppleMapSearch(mapkit) });
    engine.current = instance;
    return () => { instance.destroy(); if (engine.current === instance) engine.current = null; };
  }, [mapkit]);
  useEffect(() => {
    if (!enabled || !ready || !mapkit || !engine.current || !planned.length) return undefined;
    const controller = new AbortController();
    let live = true;
    setProgress({ key, status: "loading", stats: null });
    engine.current.recover({ places: candidates, identityContext, bounds, origin, category, sub, scope: originKey, signal: controller.signal,
      onPlace: (place) => {
        if (!live || controller.signal.aborted) return;
        setResolved((previous) => ({ origin: originKey, places: [...(previous.origin === originKey ? previous.places.filter((entry) => entry.place.id !== place.id) : []), { place, evidence: evidence.get(place.id) }] }));
      },
    }).then((stats) => {
      if (live) setProgress({ key, status: stats.errors || stats.timedOut || stats.capacityLimited ? "partial" : "ready", stats: { ...stats, places: undefined } });
    }).catch(() => { if (live) setProgress({ key, status: "error", stats: null }); });
    return () => { live = false; controller.abort(); };
    // key captures identity, scores, filter, bounds and origin. Results are
    // deliberately excluded, otherwise each accepted result cancels its batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ready, mapkit, key]);
  const activeProgress = enabled && progress.key === key ? progress : { status: "idle", stats: null };
  const recovered = enabled ? alreadyRecovered : [];
  return useMemo(() => ({ places: recovered, status: activeProgress.status, stats: activeProgress.stats }), [recovered, activeProgress.status, activeProgress.stats]);
}
