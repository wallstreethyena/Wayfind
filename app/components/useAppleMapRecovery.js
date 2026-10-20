"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createAppleMapRecovery, createAppleMapSearch, planAppleMapRecovery } from "../../lib/appleMapRecovery.js";

// Cache validity and effect restarts must agree on the evidence that actually
// governs recovery. Photo, editorial and calculation-receipt updates cannot
// invalidate a successful session coordinate or spend another search attempt.
function recoveryEvidence(place) {
  const address = place.address;
  return JSON.stringify({
    identity: [place.id, place.name, place.city, place.locality,
      typeof address === "string" ? address : [address?.street, address?.locality],
      place.formattedAddress, place.formatted_address, place.subThoroughfare, place.thoroughfare,
      place.isChain, place.is_chain, place.chain, place.chainName, place.chain_name],
    taxonomy: [place.category, place.secondaryCategories, place.secondary_categories,
      place.primaryType, place.primary_type, place.type, place.types, place.google_types, place.googleTypes,
      place.tags, place.cuisine, place.cuisines, place.adjudicatedSection, place.status, place.businessStatus],
    score: [place.governed_score, place.wfScore, place.rating, place.reviews, place.userRatingCount,
      place.creator_video, place.trending, place.trend_reason, place.distMi, place.distance_mi,
      place.kind, place._wfScoreRaw, place._members?.ownerPick],
    mapCoord: place.mapCoord ? [place.mapCoord.ok, place.mapCoord.source, place.mapCoord.until] : null,
  });
}

// Only this mounted Apple map owns the results. No storage, API writes, or
// Google fallback. Origin changes invalidate the old distance/score context.
export default function useAppleMapRecovery({ places, existing, bounds, origin, category, sub, mapkit, enabled, ready }) {
  const engine = useRef(null);
  const [resolved, setResolved] = useState({ origin: "", places: [] });
  const [progress, setProgress] = useState({ key: "", status: "idle", stats: null });
  const originKey = `${origin?.lat}|${origin?.lng}`;
  const evidence = new Map((places || []).map((p) => [p.id, recoveryEvidence(p)]));
  const existingIds = new Set((existing || []).map((p) => p.id));
  const alreadyRecovered = resolved.origin === originKey ? resolved.places.filter((entry) => entry.evidence === evidence.get(entry.place.id)).map((entry) => entry.place) : [];
  for (const p of alreadyRecovered) existingIds.add(p.id);
  const candidates = (places || []).filter((p) => !existingIds.has(p.id));
  const identityContext = [...(places || []), ...(existing || [])];
  const planned = planAppleMapRecovery({ places: candidates, identityContext, bounds, category, sub });
  // Evidence changes, rather than array identity or a progressive accepted pin,
  // define a new search. Do not restart a batch when its first result arrives.
  const evidenceKey = JSON.stringify([(places || []).map(recoveryEvidence), (existing || []).map(recoveryEvidence)]);
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
      // Counts only: browser diagnostics distinguish service failure from
      // rejected identity matches without exposing queries or Apple content.
      try {
        console.info("[Wayfind Apple recovery]", JSON.stringify({
          eligible: stats.eligible, planned: stats.planned, calls: stats.calls, recovered: stats.recovered,
          rejected: stats.rejected, errors: stats.errors, timedOut: stats.timedOut,
          batchLimited: stats.batchLimited, remainingCandidates: stats.remainingCandidates,
          budgetExhausted: stats.budgetExhausted, capacityLimited: stats.capacityLimited, aborted: stats.aborted,
        }));
      } catch {}
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
