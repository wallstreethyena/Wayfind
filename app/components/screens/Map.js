"use client";
// Extracted from app/home.js (G4, July 2026 decomposition). Render-only.
// tasteBoost is exclusive to the map's default ranking blend and moves with it.
import { useEffect, useMemo, useRef, useState } from "react";
import { C, scoreLabel, PlaceScoreChip, WayfindScoreBadge, BrandedImageFallback } from "../kit";
import { shouldApplyMapDefault } from "../../../lib/mapExplorer";
import { selectMapPlaces, mergeMapAreaContext, validMapBounds, keepMapPreview, placeInMapBounds } from "../../../lib/mapAreaData.js";
import { byGovernedScore } from "../../../lib/lawfulOrder.js";
import { eventMapPoint } from "../../../lib/eventLocation.js";
import { readCompleteMapArea } from "../../../lib/mapAreaRead.js";
import { accountListOnMap } from "../../../lib/mapListAccounting.js";
import { mapListSource, enteredMapFromList, mapListIdsOf, listScopeTruth, selectListMapPlaces, readMapList } from "../../../lib/mapListScope.js";
import { NO_PERMITTED_COORDINATE, creditsForPins } from "../../../lib/coordProvenance.js";
import { MAP_NOTE_OFFSET, MAPLIBRE_ATTRIBUTION_LIFT, SEARCH_PILL_NOTE_LIFT } from "../../../lib/mapSafeArea.js";
import AppleExplorerMap from "../AppleExplorerMap";
import useMissingPlacePhotos from "../useMissingPlacePhotos";
import { tbPhotoUrl } from "../../../lib/todaysBest";
import { hasPlacePhotoRef, ownedPlacePhotoSrc } from "../../../lib/placePhoto";
import { useCuratorPicks, applyCuratorPicks } from "../../../lib/curatorPicks";
import { shareCard } from "../../../lib/cardActions";
import { openShareFlow } from "../../../lib/shareFlow.js";
import useAppleMapRecovery from "../useAppleMapRecovery.js";
import { usePlaceDistance } from "../PlaceDistance.js";
import { formatDistanceMiles } from "../../../lib/deviceDistance.js";
import { businessStatus } from "../../../lib/businessStatus.js";
import { directionsHref } from "../../../lib/directions.js";
import { toHookLine } from "../../../lib/editorialHook.js";
import { coarseCat } from "../../../lib/ranking.js";
import { toDisplayScore } from "../../../lib/score.js";
import { wayfindScore } from "../../../lib/google.js";
import {
  MAX_AREA_PAGES,
  validPoint,
  resolveLocationTruth,
  resolveMapScopeMode,
  resolvePlaceDistanceSemantics,
  clampMapViewportBounds,
  buildMapDeepLink,
} from "../../../lib/mapLocationTruth.js";
import {
  requestAppleDriveEstimate,
  searchDestinationParking,
} from "../../../lib/mapRouting.js";
import {
  MAP_MOMENT_LENSES,
  evaluateEventEligibility,
  evaluateMapCandidate,
  rankMapCandidates,
  buildMapDecisionReason,
  aggregateActionabilityCoverage,
  buildMapTruthTrace,
  diagnoseExcludedPlace,
} from "../../../lib/mapDecisionEngine.js";
import {
  buildAroundThisSuggestions,
  analyzeItineraryOnMap,
  identifyStrongestPockets,
} from "../../../lib/mapPlanning.js";
import { createMapSessionTracker } from "../../../lib/mapAnalytics.js";

import SafeImg from "../SafeImg.js";
import { styleHtml } from "../../../lib/styleHtml.js";

function mapPreviewPhotoUrl(p) {
  if (!p) return null;
  if (typeof p.photo === "string" && p.photo) return p.photo;
  const ref = p.photoRef || p.photo_ref;
  if (hasPlacePhotoRef(ref)) return tbPhotoUrl(ref, 480);
  return ownedPlacePhotoSrc(p.place_id || p.id, 480, !!p.photoNoSpend) || null;
}

function MapCompactPreviewCard({
  place,
  editorial,
  aiSummary,
  distanceInfo,
  decisionReason,
  liveDrive,
  isPlanned,
  onTogglePlan,
  onDirections,
  onOpen,
  onSave,
  onLike,
  onDislike,
  onShare,
}) {
  const userDistance = usePlaceDistance(place);
  if (!place) return null;
  const src = mapPreviewPhotoUrl(place);
  const score = toDisplayScore(Number.isFinite(place.governed_score) ? place.governed_score : place.wfScore != null ? place.wfScore : wayfindScore(place.rating, place.reviews));
  const status = businessStatus({
    ...place,
    oh: place.oh || place.regularOpeningHours || null,
    utcOffset: place.utcOffset != null ? place.utcOffset : place.utcOffsetMinutes,
  });
  const openState = status.open === true ? "Open" : status.open === false ? "Closed" : null;
  const resolvedDist = distanceInfo && distanceInfo.miles != null
    ? distanceInfo.miles
    : userDistance;
  const distanceText = liveDrive && Number.isFinite(liveDrive.driveMinEst)
    ? `${(liveDrive.roadMiEst ?? resolvedDist) != null ? `${formatDistanceMiles(liveDrive.roadMiEst ?? resolvedDist)} mi · ` : ""}${liveDrive.isEstimate ? `~${liveDrive.driveMinEst}m` : `${liveDrive.driveMinEst}m`}`
    : distanceInfo && distanceInfo.text
      ? distanceInfo.text
      : resolvedDist != null
        ? `${formatDistanceMiles(resolvedDist)} mi`
        : null;
  const take = toHookLine(editorial, place.name);
  const aiLine = !take && aiSummary && typeof aiSummary === "object" && aiSummary.card_line_1 ? aiSummary.card_line_1 : null;
  const catLabel = place.cuisine || place.cardCategory || coarseCat(place) || place.primaryType || "Local pick";
  const reasonLine = place.trending && place.trend_reason ? "🔥 " + place.trend_reason
    : (decisionReason || take || aiLine || (place._members && place._members.ownerPick ? "Curator pick \u00b7 Top local standout" : `${catLabel}${place.reviews ? ` \u00b7 ${Number(place.reviews).toLocaleString()} reviews` : ""}`));
  const dirHref = directionsHref(place);
  const eventHref = place.kind === "event" && typeof place.href === "string" ? place.href : null;
  return (
    <div className="wf-map-preview-card" data-wf-map-preview-card={place.id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 12px 6px", minWidth: 0 }}>
      <button type="button" onClick={onOpen} aria-label={`Open details for ${place.name}`} style={{ display: "flex", alignItems: "center", gap: 11, flex: 1, minWidth: 0, padding: 0, border: "none", background: "transparent", color: "inherit", textAlign: "left", cursor: "pointer" }}>
        <div style={{ width: 64, height: 64, borderRadius: 12, overflow: "hidden", flexShrink: 0, position: "relative", background: "#141B26", border: "1px solid rgba(255,255,255,.09)" }}>
          <SafeImg src={src} alt={place.name || "Place photo"} category={place.category || coarseCat(place)} compact style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
            <span style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.25 }}>{place.name}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4, fontSize: 11.5, lineHeight: 1.3 }}>
            <WayfindScoreBadge score={score} size={0.82} staticRoot />
            {distanceText && <span data-wf-preview-distance data-wf-distance-mode={(distanceInfo && distanceInfo.kind) || "from_you"} style={{ color: C.light, fontWeight: 700 }}>{distanceText}</span>}
            {openState && (
              <span data-wf-preview-open={openState.toLowerCase()} style={{ color: openState === "Open" ? "#4ADE80" : "#F87171", fontWeight: 800 }}>
                {openState}
              </span>
            )}
          </div>
          {reasonLine && (
            <div data-wf-preview-reason style={{ fontSize: 11.5, color: C.muted, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.3 }}>
              {reasonLine}
            </div>
          )}
        </div>
      </button>
      <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0, marginTop: 14 }}>
        <button type="button" onClick={onOpen} style={{ minHeight: 30, padding: "4px 11px", borderRadius: 9, border: "1px solid rgba(249,115,22,.55)", background: "rgba(249,115,22,.16)", color: "#FDBA74", fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>{eventHref ? "Event" : "Details"}</button>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {dirHref && (
            <a href={dirHref} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.stopPropagation(); if (onDirections) onDirections(); }} style={{ minHeight: 28, padding: "4px 8px", borderRadius: 9, border: `1px solid ${C.border}`, background: "rgba(255,255,255,.05)", color: C.light, fontSize: 11, fontWeight: 700, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap" }}>Directions</a>
          )}
          {onTogglePlan && !eventHref && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onTogglePlan(place); }} aria-label={isPlanned ? `In trip plan: ${place.name}` : `Add ${place.name} to trip plan`} title={isPlanned ? "Added to trip plan" : "Add to trip plan"} style={{ height: 28, padding: "0 7px", borderRadius: 9, border: `1px solid ${isPlanned ? "rgba(74,222,128,.45)" : C.border}`, background: isPlanned ? "rgba(74,222,128,.14)" : "rgba(255,255,255,.05)", color: isPlanned ? "#4ADE80" : C.light, fontSize: 11, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{isPlanned ? "\u2713" : "+"}</button>
          )}
          {onShare && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onShare(place); }} aria-label={`Share ${place.name}`} style={{ width: 28, height: 28, borderRadius: 9, border: `1px solid ${C.border}`, background: "rgba(255,255,255,.05)", color: C.light, fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>&#8599;</button>
          )}
        </div>
      </div>
    </div>
  );
}

// v6.71 (Wave 2): same flame + water-quality read as every other beach
// surface, sourced from the SAME `beachSignals` batch home.js already
// computes for the visible PlaceCards (isBeach + beachSignals both arrive
// via ctx) — no separate fetch for the map screen.
function BeachChips({ p, isBeach, beachSignals }) {
  // 2026-08-08: the 🔥 is the UNIFIED trend signal (lib/trendSignal.js) —
  // any category, the signal's own level-honest reason — and the disclosure
  // for the +0.6 trending component. The beach-only popularity flame is
  // folded into it; water quality stays a beach-signal read.
  const sig = isBeach && isBeach(p) && beachSignals ? beachSignals[p.id] : null;
  const wq = sig && sig.water ? (sig.water.advisory ? { t: "Advisory", c: C.red } : sig.water.result === "Good" ? { t: "Water: Good", c: C.green } : sig.water.result === "Moderate" ? { t: "Water: Moderate", c: "#E8B84B" } : sig.water.result ? { t: "Water: Poor", c: C.red } : null) : null;
  const trending = !!(p && p.trending && p.trend_reason);
  if (!trending && !wq) return null;
  return (
    <>
      {trending ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "#FB923C" }} title={"Trending — " + p.trend_reason}>🔥 {p.trend_reason}</span> : null}
      {wq ? <span style={{ fontSize: 11.5, fontWeight: 700, color: wq.c }}>🏖️ {wq.t}</span> : null}
    </>
  );
}

// EVENTS CONTROL — FLAGGED OFF, NOT DELETED (owner, 2026-08-06). Removing the
// control takes event pins off the map, which is a deliberate consequence: Events
// remains its own tab. mapMode/setMapMode and MapView's events/onSelectEvent props
// are untouched, so restoring this is one env var and no code change.
const MAP_EVENTS_ON = String(process.env.NEXT_PUBLIC_MAP_EVENTS || "").trim() === "1";

export default function MapScreen({ ctx }) {
  const mapCardTouch = useRef(0);
  const curatorSnap = useCuratorPicks(); // lib/curatorPicks.js: owner picks applied to the map's own pools BEFORE their score sort/slice
  // v7.17 — "Search this area" (owner-approved): MapView reports the map
  // center once the viewport has genuinely left the search origin (null
  // retracts). Tapping the pill re-anchors the WHOLE discovery engine there
  // via ctx.searchMapArea — the same manual-recenter path area search uses.
  const [areaOffer, setAreaOffer] = useState(null);
  const {
    searchMapArea, mapMode, setMapMode, mapBrowse, setMapBrowse, mapPool, mapListOverride,
    map3D, setMap3D, mapRetryKey, setMapRetryKey, cat, setCat, sub, setSub, setVibe, sortBy,
    center, deviceLoc: rawDeviceLoc, locApprox, mapCameraRef, mapSearch, setMapSearch,
    mapUrlLens, setMapUrlLens, mapUrlPlaceId, setMapUrlPlaceId,
    mapFocus, setMapFocus, setMapSearchOpen, events, eventsLoading, eventsUnavailable,
    mapDate, setMapDate, mapPreview, setMapPreview, mapDrawer, setMapDrawer,
    eventPreview, setEventPreview, suggested, places, liked, disliked, view: contextualView,
    featuredBoost, MapView, CategoryMenu, FallbackImg, iconForPlace, liveOpen, logEvent,
    loadEvents, openDetail, openVenue, ticketUrl, Hol, recenterToMe, isBeach, beachSignals,
    PlaceCard, isSaved, toggleLike, toggleDislike, quickSaveFavorite, addShared, giveawayMark,
    blurbs, openExperience, openCuisine, cityNow, locName, weather,
    trips, setTrips, activeTrip, isOnTrip, addToItinerary, showToast,
    mapDefaultAppliedRef, categoryChosenRef } = ctx;
  const { searchMode } = ctx;
  // Physical GPS truth ONLY: an IP-derived fallback (`locApprox === true`) must
  // never paint a "Your location" dot, claim "Near me" lock, or report user distance.
  const deviceLoc = !locApprox && validPoint(rawDeviceLoc) ? rawDeviceLoc : null;
  const [areaOnly, setAreaOnly] = useState(false);
  // LIST SCOPE (lib/mapListScope.js): opened from a list, search, category or
  // rail, the map draws THAT result set with no hidden 9.2 floor. Decided once
  // per mount, before the first-open default below can touch the category.
  const [enteredFromList] = useState(() => enteredMapFromList({ chosen: !!(categoryChosenRef && categoryChosenRef.current), searchMode, override: mapListOverride }));
  const listSource = mapMode === "places" && !mapSearch ? mapListSource({ areaOnly, override: mapListOverride, enteredFromList, list: contextualView }) : null;
  const explicitList = !!listSource;
  // The area map reads too, for the list places it cannot draw, so their
  // stored Apple Place IDs arrive FRESH (never only via the list's day-long
  // edge cache, which may predate tonight's backfill).
  const listIds = useMemo(() => mapListIdsOf(listSource || (mapMode === "places" ? (contextualView || []).filter((p) => p && p.mapCoord && p.mapCoord.ok === false) : [])), [listSource, mapMode, contextualView]);
  const listKey = listIds.join(",");
  const [listRead, setListRead] = useState({ key: "", status: "loading", places: [], appleIds: {} });
  const [listRetry, setListRetry] = useState(0);
  const stableList = useRef({ k: null, pins: [] });
  const [activeLens, setActiveLens] = useState("all");
  const effectiveLens = activeLens === "all" ? null : activeLens;
  const activeLensMeta = MAP_MOMENT_LENSES.find((l) => l.id === activeLens) || { id: "all", label: "All" };
  const rankingLabel = mapSearch && mapSearch.query
    ? `\u201c${mapSearch.query}\u201d \u00b7 Wayfind Score`
    : explicitList
      ? "Selected list · Wayfind Score"
      : effectiveLens
        ? `${activeLensMeta.label} · Wayfind Score 9.2+`
        : "Wayfind Score 9.2+";
  const [allCategories, setAllCategories] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const mapCategory = allCategories ? "all" : cat;
  const [showRings, setShowRings] = useState(false);
  const [hoveredPinId, setHoveredPinId] = useState(null);
  const [drawerFilter, setDrawerFilter] = useState("");
  const [viewport, setViewport] = useState(null);
  const [areaPlaces, setAreaPlaces] = useState([]);
  const [areaStatus, setAreaStatus] = useState("loading");
  const [settledArea, setSettledArea] = useState(null);
  const areaReadKey = JSON.stringify([viewport, center?.lat, center?.lng]);
  const [areaRetry, setAreaRetry] = useState(0);
  const [liveDrive, setLiveDrive] = useState(null);
  const [parkingState, setParkingState] = useState({ placeId: null, status: "idle", items: [], fallbackHref: null });
  const [planContextPlace, setPlanContextPlace] = useState(null);
  // Keep renderer failure separate from area inventory. An attempt identity
  // changes on retry AND on every 2D/3D switch (including a switch back), so
  // a late failure from an old Apple mount cannot hide the new map's status.
  const rendererAttempt = useMemo(() => ({}), [map3D, mapRetryKey]);
  const currentRendererAttempt = useRef(rendererAttempt);
  currentRendererAttempt.current = rendererAttempt;
  const [failedRendererAttempt, setFailedRendererAttempt] = useState(null);
  const appleMapFailed = !map3D && failedRendererAttempt === rendererAttempt;
  const [appleSDK, setAppleSDK] = useState(null);

  const sessionTrackerRef = useRef(null);
  if (!sessionTrackerRef.current) sessionTrackerRef.current = createMapSessionTracker(logEvent);
  useEffect(() => () => sessionTrackerRef.current?.dispose(), []);

  const cameraCenter = useMemo(() => {
    if (validMapBounds(viewport)) {
      return {
        lat: (Number(viewport.north) + Number(viewport.south)) / 2,
        lng: (Number(viewport.east) + Number(viewport.west)) / 2,
      };
    }
    return center && Number.isFinite(Number(center.lat)) && Number.isFinite(Number(center.lng))
      ? { lat: Number(center.lat), lng: Number(center.lng) }
      : null;
  }, [viewport, center]);

  if (mapCameraRef && typeof mapCameraRef === "object") {
    mapCameraRef.current = { center: cameraCenter, bounds: viewport };
  }

  const cityNowLabel = typeof cityNow === "string" ? cityNow : (cityNow && cityNow.name) || "";
  const locationTruth = useMemo(() => resolveLocationTruth({
    rawDeviceLoc,
    locApprox: !!locApprox,
    discoveryCenter: center,
    locName: locName || cityNowLabel,
    manual: Boolean((locName || cityNowLabel) && !deviceLoc),
    viewport,
    areaOffer,
    queryGeo: mapSearch && mapSearch.center ? { ...mapSearch.center, name: mapSearch.query || "" } : null,
    screen: "map",
  }), [rawDeviceLoc, locApprox, center, locName, cityNowLabel, deviceLoc, viewport, areaOffer, mapSearch]);

  const scopeMode = useMemo(() => resolveMapScopeMode(locationTruth), [locationTruth]);

  useEffect(() => {
    if (mapUrlLens && MAP_MOMENT_LENSES.some((l) => l.id === mapUrlLens)) {
      setActiveLens(mapUrlLens);
      setAreaOnly(true);
      if (setMapUrlLens) setMapUrlLens(null);
    }
  }, [mapUrlLens, setMapUrlLens]);

  // The settled renderer viewport is authoritative. A center-derived initial
  // box also provides a discoverable results list when MapKit cannot load.
  useEffect(() => {
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return;
    const dLat = .36, dLng = .42;
    setViewport({ north: center.lat + dLat, south: center.lat - dLat, east: center.lng + dLng, west: center.lng - dLng });
  }, [center?.lat, center?.lng]);
  const coveredAreaRef = useRef({ key: "", originKey: "", boxes: [] });
  const areaReqSeq = useRef(0);
  useEffect(() => {
    if (!validMapBounds(viewport) || !center || explicitList) return undefined;
    const originKey = `${center?.lat}|${center?.lng}`;
    const coverageKey = `${originKey}|${areaRetry}|${curatorSnap.v}`;
    const originChanged = coveredAreaRef.current.originKey !== originKey;
    if (coveredAreaRef.current.key !== coverageKey) {
      coveredAreaRef.current = { key: coverageKey, originKey, boxes: [] };
    }
    const queryBounds = clampMapViewportBounds(viewport) || viewport;
    const eps = 1e-4;
    const isCovered = coveredAreaRef.current.boxes.some(
      (cb) => queryBounds.north <= cb.north + eps && queryBounds.south >= cb.south - eps && queryBounds.east <= cb.east + eps && queryBounds.west >= cb.west - eps
    );
    if (isCovered) {
      setAreaStatus("ready");
      setSettledArea(areaReadKey);
      return undefined;
    }
    const reqId = ++areaReqSeq.current;
    const controller = new AbortController();
    let dead = false;
    setAreaStatus("loading");
    if (originChanged) {
      setAreaPlaces([]);
    }
    const timer = setTimeout(() => {
      readCompleteMapArea({ bounds: queryBounds, origin: center, signal: controller.signal, maxPages: MAX_AREA_PAGES,
        onPage: (rows) => {
          if (dead || controller.signal.aborted || areaReqSeq.current !== reqId) return;
          setAreaPlaces((existing) => {
            if (originChanged || !existing.length) return rows;
            const byId = new Map(existing.map((r) => [r.id || r.place_id, r]));
            for (const r of rows) byId.set(r.id || r.place_id, r);
            return [...byId.values()];
          });
        } })
        .then((rows) => {
          if (dead || controller.signal.aborted || areaReqSeq.current !== reqId || !Array.isArray(rows)) return;
          setAreaPlaces((existing) => {
            if (originChanged || !existing.length) return rows;
            const outside = existing.filter((r) => !placeInMapBounds(r, viewport));
            const byId = new Map(outside.map((r) => [r.id || r.place_id, r]));
            for (const r of rows) byId.set(r.id || r.place_id, r);
            return [...byId.values()];
          });
          if (coveredAreaRef.current.key === coverageKey) {
            coveredAreaRef.current = {
              key: coverageKey,
              originKey,
              boxes: [
                ...coveredAreaRef.current.boxes,
                { north: queryBounds.north, south: queryBounds.south, east: queryBounds.east, west: queryBounds.west },
              ],
            };
          }
          setAreaStatus("ready");
          setSettledArea(areaReadKey);
        })
        .catch(() => { if (!dead && !controller.signal.aborted && areaReqSeq.current === reqId) setAreaStatus("error"); });
    }, 250);
    return () => { dead = true; clearTimeout(timer); controller.abort(); };
  }, [viewport?.north, viewport?.south, viewport?.east, viewport?.west, center?.lat, center?.lng, areaRetry, curatorSnap.v, explicitList]);
  useEffect(() => {
    if (!center || !listKey) return undefined;
    const controller = new AbortController();
    setListRead({ key: listKey, status: "loading", places: [], appleIds: {} });
    readMapList({ ids: listIds, origin: center, signal: controller.signal })
      .then((r) => { if (!controller.signal.aborted) setListRead({ key: listKey, status: "ready", places: r.places, appleIds: r.appleIds }); })
      .catch(() => { if (!controller.signal.aborted) setListRead({ key: listKey, status: "error", places: [], appleIds: {} }); });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, center?.lat, center?.lng, listRetry]);
  const listStatus = listRead.key === listKey ? listRead.status : "loading";
  const listPins = listRead.key === listKey ? listRead.places : [];
  const listTruth = useMemo(() => (explicitList ? listScopeTruth(listSource, listPins, listStatus, listRead.key === listKey ? listRead.appleIds : null) : null), [explicitList, listSource, listPins, listStatus, listRead, listKey]);
  const mapStatus = explicitList ? listStatus : areaStatus;
  const contextPool = useMemo(() => [...(contextualView || []), ...(mapPool || []), ...(suggested || []), ...(places || [])], [contextualView, mapPool, suggested, places]);
  const inventoryAreaPlaces = useMemo(() => mergeMapAreaContext(areaPlaces, contextPool), [areaPlaces, contextPool]);
  const listInventory = useMemo(() => (explicitList ? mergeMapAreaContext(listPins, contextPool) : []), [explicitList, listPins, contextPool]);
  const recoveryCandidates = useMemo(() => applyCuratorPicks((explicitList ? listTruth : listScopeTruth(contextualView, [], "area", listRead.key === listKey ? listRead.appleIds : null)) || [], curatorSnap), [explicitList, listTruth, contextualView, listRead, listKey, curatorSnap]);
  // Apple recovery runs in BOTH scopes; a list-scoped map tries every list
  // place with no permitted coordinate regardless of score (minScore null),
  // inside the same per-batch, per-mount and daily-ledger budgets.
  const appleRecovery = useAppleMapRecovery({ places: recoveryCandidates, existing: explicitList ? listInventory : inventoryAreaPlaces,
    bounds: viewport, origin: center, category: explicitList ? "all" : mapCategory, sub: explicitList || allCategories ? "all" : sub,
    mapkit: appleSDK?.mapkit, minScore: explicitList ? null : undefined,
    enabled: appleSDK?.attempt === rendererAttempt && !map3D && !appleMapFailed && mapMode === "places", ready: explicitList ? listStatus === "ready" : areaStatus === "ready" && (settledArea === areaReadKey || coveredAreaRef.current.boxes.length > 0) });
  const liveAreaPlaces = useMemo(() => {
    const owned = new Set(inventoryAreaPlaces.map((p) => p.id));
    return [...inventoryAreaPlaces, ...appleRecovery.places.filter((p) => !owned.has(p.id))];
  }, [inventoryAreaPlaces, appleRecovery.places]);
  // Apple lookups are display-only. Saves, sharing, detail fetches and analytics
  // receive the existing Wayfind identity, never the temporary Apple point.
  const actionPlace = (p) => p?.coordSource === "apple_live" ? (contextPool.find((source) => source.id === p.id) || { id: p.id, name: p.name }) : p;
  const cardPlace = (p) => p?.coordSource === "apple_live" ? { ...p, lat: null, lng: null, coordSource: undefined, mapCoord: undefined } : p;

  const mapSearchPins = useMemo(() => {
    if (!mapSearch || !Array.isArray(mapSearch.cards)) return null;
    const byLiveId = new Map(liveAreaPlaces.map((p) => [p.id, p]));
    const lensForSearch = effectiveLens
      || (mapSearch.constraints && mapSearch.constraints.when === "tonight" ? "tonight" : (/\btonight\b/i.test(mapSearch.query || "") ? "tonight" : null));
    const out = [];
    const seen = new Set();
    for (const card of mapSearch.cards) {
      if (!card || !card.id || seen.has(card.id)) continue;
      if (card.approx === true) continue;
      const liveMatch = byLiveId.get(card.id);
      const pinPt = validPoint(card) || (liveMatch ? validPoint(liveMatch) : null);
      if (!pinPt) continue;
      const { lat, lng } = pinPt;
      const isEventCard = card.kind === "event" || !!card._isEventCard;
      if (isEventCard) {
        const evCheck = evaluateEventEligibility({ ...card, _isEventCard: true });
        if (evCheck && (evCheck.state === "ended" || (lensForSearch === "tonight" && !evCheck.activeToday))) continue;
      }
      seen.add(card.id);
      const baseScore = liveMatch && Number.isFinite(liveMatch.governed_score)
        ? liveMatch.governed_score
        : (card.wfScore != null ? card.wfScore : wayfindScore(card.rating, card.reviews));
      out.push({
        ...(liveMatch || {}),
        ...card,
        _isEventCard: isEventCard,
        lat,
        lng,
        wfScore: baseScore,
        governed_score: baseScore,
      });
    }
    return applyCuratorPicks(out, curatorSnap).sort(byGovernedScore);
  }, [mapSearch, liveAreaPlaces, effectiveLens, curatorSnap]);

  // Owner picks are applied before qualification and sorting. The shared
  // category/subcategory promises still apply; an All button is map-local.
  const rankedBundle = useMemo(() => {
    if (mapSearchPins) {
      const searchLens = effectiveLens
        || (mapSearch?.constraints?.when === "tonight" || /\btonight\b/i.test(mapSearch?.query || "") ? "tonight" : null);
      const res = rankMapCandidates(mapSearchPins, {
        verifiedDeviceLoc: deviceLoc,
        referenceCenter: cameraCenter || center,
        weather,
        beachSignals,
        lens: searchLens,
        category: "all",
        sub: "all",
        skipScoreFloor: true,
      });
      return { ...res, rawPool: mapSearchPins };
    }
    if (explicitList) {
      const owned = new Set(listInventory.map((p) => p.id));
      const rawList = applyCuratorPicks([...listInventory, ...appleRecovery.places.filter((p) => !owned.has(p.id))], curatorSnap);
      const pins = selectListMapPlaces(listIds, rawList);
      return { places: pins, evaluated: new Map(), exclusions: new Map(), rawPool: rawList };
    }
    const selected = selectMapPlaces(applyCuratorPicks(liveAreaPlaces, curatorSnap), mapCategory, viewport, allCategories ? "all" : sub);
    const modeSelected = mapMode === "fifa" ? selected.filter((p) => Hol.fitFor("worldcup", p) >= 8) : selected;
    const res = rankMapCandidates(modeSelected, {
      verifiedDeviceLoc: deviceLoc,
      referenceCenter: cameraCenter || center,
      weather,
      beachSignals,
      lens: effectiveLens,
      category: "all",
      sub: "all",
    });
    return { ...res, rawPool: liveAreaPlaces };
  }, [mapSearchPins, mapSearch, liveAreaPlaces, curatorSnap, mapCategory, viewport, allCategories, sub, mapMode, Hol, explicitList, listIds, listInventory, appleRecovery.places, effectiveLens, deviceLoc, cameraCenter, center, weather, beachSignals]);

  const view = useMemo(() => {
    // Same pins, same array: the list's parent re-renders must not re-fit the
    // map under the reader's finger (fit re-runs on every places change).
    const pins = rankedBundle.places || [];
    const k = pins.map((p) => `${p.id}|${p.lat}|${p.lng}|${p.governed_score}|${p.category || ""}|${activeLens}`).join(";");
    if (stableList.current.k !== k) stableList.current = { k, pins };
    return stableList.current.pins;
  }, [rankedBundle, activeLens]);

  useEffect(() => {
    if (!mapUrlPlaceId || !view.length) return;
    const match = view.find((p) => p && String(p.id) === String(mapUrlPlaceId));
    if (match) {
      setMapPreview(match);
      setMapFocus({ lat: match.lat, lng: match.lng, coordSource: match.coordSource, ts: Date.now() });
      if (setMapUrlPlaceId) setMapUrlPlaceId(null);
    }
  }, [mapUrlPlaceId, view, setMapPreview, setMapFocus, setMapUrlPlaceId]);

  useEffect(() => {
    if (!mapPreview || map3D || !appleSDK?.mapkit || !deviceLoc) {
      setLiveDrive(null);
      return undefined;
    }
    let cancelled = false;
    requestAppleDriveEstimate(appleSDK.mapkit, deviceLoc, mapPreview)
      .then((est) => { if (!cancelled) setLiveDrive(est || null); })
      .catch(() => { if (!cancelled) setLiveDrive(null); });
    return () => { cancelled = true; };
  }, [mapPreview, map3D, appleSDK, deviceLoc]);

  const currentMetroId = locationTruth.mapCenter?.metro || "unknown";
  useEffect(() => {
    sessionTrackerRef.current?.noteOpen({
      mode: scopeMode.mode,
      metro: currentMetroId,
      hasGps: !!deviceLoc,
      category: mapCategory,
    });
    sessionTrackerRef.current?.noteModeChange({
      mode: scopeMode.mode,
      metro: currentMetroId,
      hasGps: !!deviceLoc,
    });
  }, [scopeMode.mode, currentMetroId, deviceLoc, mapCategory]);

  useEffect(() => {
    if (!settledArea) return;
    sessionTrackerRef.current?.noteCameraSettled({
      metro: currentMetroId,
    });
  }, [settledArea, currentMetroId]);

  // LIST/MAP ACCOUNTING (2026-10-14, lib/mapListAccounting.js): every card on
  // the list gets exactly one map status. A place the map may not pin (no
  // coordinate inside its source's permitted window, lib/coordProvenance.js)
  // is counted and said on screen, never silently missing.
  const listAccounting = useMemo(() => (mapMode === "places"
    ? accountListOnMap({ listPlaces: (explicitList ? listTruth : contextualView) || [], pins: view, areaPlaces: explicitList ? listInventory : liveAreaPlaces, areaStatus: mapStatus, appleOutcomes: appleRecovery.stats && appleRecovery.stats.outcomes })
    : null), [mapMode, explicitList, listTruth, listInventory, mapStatus, contextualView, view, liveAreaPlaces, appleRecovery.stats]);
  const unpinnedForCoord = listAccounting ? listAccounting.counts[NO_PERMITTED_COORDINATE] : 0;
  const unpinnedNote = unpinnedForCoord > 0
    ? `${unpinnedForCoord} of ${listAccounting.total} places not pinned yet${explicitList ? ", still in your list" : ", confirming locations"}${appleRecovery.status === "loading" ? ". Checking Apple Maps…" : ""}`
    : null;
  // Licence credit for any independently sourced pin on screen (OpenStreetMap's
  // ODbL requires the credit wherever its coordinates are shown).
  const mapCredits = useMemo(() => (mapMode === "places" ? creditsForPins(view) : []), [mapMode, view]);

  const activeTripObj = useMemo(() => {
    if (!Array.isArray(trips) || !trips.length) return null;
    if (activeTrip) {
      const match = trips.find((t) => t && t.id === activeTrip);
      if (match) return match;
    }
    return trips[0] || null;
  }, [trips, activeTrip]);

  const itineraryAnalysis = useMemo(() => {
    const rawStops = activeTripObj && Array.isArray(activeTripObj.items)
      ? activeTripObj.items
      : (activeTripObj && Array.isArray(activeTripObj.stops) ? activeTripObj.stops : []);
    if (!rawStops.length) return null;
    const byId = new Map([...liveAreaPlaces, ...contextPool].filter(Boolean).map((p) => [p.id, p]));
    const resolvedStops = rawStops.map((item) => {
      const id = item && (item.id || item.place_id);
      const known = id ? byId.get(id) : null;
      return known ? { ...known, ...item, lat: item.lat ?? known.lat, lng: item.lng ?? known.lng } : item;
    });
    return analyzeItineraryOnMap(resolvedStops, { startOrigin: deviceLoc || cameraCenter });
  }, [activeTripObj, liveAreaPlaces, contextPool, deviceLoc, cameraCenter]);

  const aroundSuggestions = useMemo(() => {
    const anchor = planContextPlace || mapPreview;
    if (!anchor) return [];
    return buildAroundThisSuggestions(anchor, liveAreaPlaces, { weather });
  }, [planContextPlace, mapPreview, liveAreaPlaces, weather]);

  // Diagnostic only (the synthetic monitor reads it next to __wfMapPins).
  const wfMapListPayload = listAccounting
    ? { scope: explicitList ? "list" : "area", listIds: listAccounting.rows.map((r) => r.id), pinned: listAccounting.rows.filter((r) => r.status === "pinned").map((r) => r.id), unmapped: listAccounting.unmapped, counts: listAccounting.counts, apple: listAccounting.apple, note: unpinnedNote, unpinnedNote, at: Date.now() }
    : null;
  if (typeof window !== "undefined") {
    try { window.__wfMapList = wfMapListPayload; } catch (e) {}
  }
  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      window.__wfMapList = wfMapListPayload;
      window.__wfAppleRecovery = { status: appleRecovery.status, ...appleRecovery.stats, recoveredIds: appleRecovery.places.map((p) => p.id) };
      window.__wfMapTruth = {
        at: Date.now(),
        scopeMode,
        lens: activeLens,
        searchQuery: mapSearch?.query || null,
        locationTruth: {
          hasPhysicalDeviceLocation: !!locationTruth.deviceLocation,
          deviceSource: locationTruth.deviceLocation?.source || "none",
          mapCenter: locationTruth.mapCenter ? { lat: +locationTruth.mapCenter.lat.toFixed(4), lng: +locationTruth.mapCenter.lng.toFixed(4), metro: locationTruth.mapCenter.metro, areaLabel: locationTruth.mapCenter.areaLabel } : null,
          searchLocation: locationTruth.searchLocation ? { source: locationTruth.searchLocation.source, label: locationTruth.searchLocation.label || null, lat: +locationTruth.searchLocation.lat.toFixed(4), lng: +locationTruth.searchLocation.lng.toFixed(4) } : null,
          selectedArea: locationTruth.selectedArea?.label || null,
          bootstrapActive: !!locationTruth.bootstrapCenter?.active,
        },
        coverage: aggregateActionabilityCoverage(view, rankedBundle.evaluated),
        pockets: identifyStrongestPockets(view, rankedBundle.evaluated),
        itinerary: itineraryAnalysis ? { stopCount: itineraryAnalysis.stopCount, totalDriveMinutes: itineraryAnalysis.totalDriveMin, hasBacktracking: itineraryAnalysis.hasBacktracking, savedMinutes: itineraryAnalysis.savedDriveMin } : null,
        trace: (id) => buildMapTruthTrace(String(id || ""), rankedBundle, locationTruth),
        whyNot: (queryOrId) => {
          const direct = diagnoseExcludedPlace(queryOrId, rankedBundle, [...liveAreaPlaces, ...contextPool]);
          if (direct && direct.status !== "excluded_upstream") return direct;
          const needle = String(queryOrId || "").trim().toLowerCase();
          const cand = [...liveAreaPlaces, ...contextPool].find((p) => p && (String(p.id || "").toLowerCase() === needle || String(p.name || "").toLowerCase().includes(needle)));
          if (!cand) return direct;
          const ev = evaluateMapCandidate(cand, {
            verifiedDeviceLoc: deviceLoc,
            referenceCenter: cameraCenter || center,
            weather,
            beachSignals,
            lens: effectiveLens,
            bounds: viewport,
            category: mapCategory,
            sub: allCategories ? "all" : sub,
          });
          return { status: "excluded", id: cand.id, name: cand.name, reason: ev.exclusionReason || "filtered_before_candidate_pool", detail: ev };
        },
      };
    } catch (e) {}
  }, [listAccounting, unpinnedNote, appleRecovery, wfMapListPayload, scopeMode, activeLens, effectiveLens, mapSearch, locationTruth, view, rankedBundle, itineraryAnalysis, liveAreaPlaces, contextPool, deviceLoc, cameraCenter, center, weather, beachSignals, viewport, mapCategory, allCategories, sub]);

  useEffect(() => {
    if (mapSearchPins) { if (mapPreview && !view.some((p) => p.id === mapPreview.id)) setMapPreview(null); return; }
    if (explicitList) { if (mapPreview && !view.some((p) => p.id === mapPreview.id)) setMapPreview(null); return; }
    if (mapPreview && !keepMapPreview(mapPreview, view, mapCategory, areaStatus)) setMapPreview(null);
  }, [mapPreview, view, mapCategory, areaStatus, setMapPreview, explicitList, mapSearchPins]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKey = (e) => {
      const tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key === "Escape") {
        if (mapPreview) { setMapPreview(null); return; }
        if (eventPreview) { setEventPreview(null); return; }
        if (planContextPlace) { setPlanContextPlace(null); return; }
        if (mapDrawer) { setMapDrawer(false); return; }
        if (filtersExpanded) { setFiltersExpanded(false); }
      } else if (mapPreview && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
        const ranked = (view || []).filter((x) => x && x.id);
        const idx = ranked.findIndex((x) => x.id === mapPreview.id);
        if (idx < 0 || !ranked.length) return;
        e.preventDefault();
        const dir = e.key === "ArrowRight" ? 1 : -1;
        const next = ranked[(idx + dir + ranked.length) % ranked.length];
        if (next) {
          setMapPreview(next);
          setMapFocus({ lat: next.lat, lng: next.lng, coordSource: next.coordSource, ts: Date.now() });
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mapPreview, eventPreview, planContextPlace, mapDrawer, filtersExpanded, view, setMapPreview, setEventPreview, setMapDrawer, setMapFocus]);

  const photoWants = [];
  if (mapPreview) photoWants.push(mapPreview);
  if (mapDrawer && Array.isArray(view)) for (const p of view.slice(0, 12)) photoWants.push(p);
  const healCenter = (mapPreview && mapPreview.coordSource !== "apple_live" && Number.isFinite(Number(mapPreview.lat)) && Number.isFinite(Number(mapPreview.lng)))
    ? { lat: Number(mapPreview.lat), lng: Number(mapPreview.lng) }
    : center;
  const photoRefFor = useMissingPlacePhotos(photoWants.filter((p) => p.coordSource !== "apple_live"), healCenter, mapMode === "places");
  const withPhoto = (p) => {
    if (!p) return p;
    p = cardPlace(p);
    const own = p.photoRef || p.photo_ref;
    if (hasPlacePhotoRef(own) && typeof p.photo === "string" && p.photo) return p;
    if (hasPlacePhotoRef(own)) {
      const url = tbPhotoUrl(own, 480);
      return url ? { ...p, photoRef: own, photo: url } : p;
    }
    const ref = photoRefFor(p);
    if (!ref) return p;
    const url = tbPhotoUrl(ref, 480);
    return url ? { ...p, photoRef: ref, photo: url } : p;
  };

  useEffect(() => {
    if (!mapDefaultAppliedRef || mapDefaultAppliedRef.current) return;
    mapDefaultAppliedRef.current = true;
    if (shouldApplyMapDefault({ cat, chosen: !!(categoryChosenRef && categoryChosenRef.current) })) { setCat("attractions"); setSub("all"); setVibe("all"); setMapBrowse(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const requestParkingFor = (place) => {
    if (!place) return;
    setParkingState({ placeId: place.id, status: "loading", items: [], fallbackHref: null });
    searchDestinationParking(appleSDK?.mapkit, place).then((res) => {
      setParkingState({
        placeId: place.id,
        status: res.status === "ready" && res.items.length ? "ready" : "empty",
        items: res.items || [],
        fallbackHref: res.fallbackHref || null,
      });
    }).catch(() => {
      setParkingState({ placeId: place.id, status: "empty", items: [], fallbackHref: null });
    });
  };

  const applyOptimizedItinerary = () => {
    if (!itineraryAnalysis || !itineraryAnalysis.hasBacktracking || !activeTripObj || !setTrips) return;
    const orderIds = itineraryAnalysis.optimizedIds || [];
    setTrips((prev) => (Array.isArray(prev) ? prev.map((t) => {
      if (!t || t.id !== activeTripObj.id) return t;
      const key = Array.isArray(t.items) ? "items" : (Array.isArray(t.stops) ? "stops" : null);
      if (!key) return t;
      const sorted = [...t[key]].sort((a, b) => {
        const ia = orderIds.indexOf(a.id || a.place_id || a.place?.id);
        const ib = orderIds.indexOf(b.id || b.place_id || b.place?.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
      return { ...t, [key]: sorted };
    }) : prev));
    if (showToast) try { showToast(`Route optimized · saves ~${itineraryAnalysis.savedDriveMin} min`); } catch (e) {}
  };

  const dateChips = [];
  const now = new Date();
  const monthIdx = now.getMonth();
  const showHolidayLens = monthIdx === 10 || monthIdx === 11 || activeLens === "christmas";
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    dateChips.push({ value, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], day: d.getDate() });
  }
  let mapEvents = [];
  if (mapMode === "events") {
    const src = (events || []).filter((e) => eventMapPoint(e) && (mapDate === "all" || e.date === mapDate));
    const seen = new Set();
    for (const e of src) { const k = `${e.lat.toFixed(3)},${e.lng.toFixed(3)}`; if (!seen.has(k)) { seen.add(k); mapEvents.push(e); } }
  }
  const tchip = (on) => ({ flexShrink: 0, minWidth: 44, padding: "5px 9px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "center", background: on ? C.light : "transparent", color: on ? "#fff" : C.light, fontWeight: 700 });
  const activeHoverId = mapDrawer && !mapPreview && view.some((p) => p.id === hoveredPinId) ? hoveredPinId : null;
  const filterTrim = drawerFilter.trim().toLowerCase();
  const matchesDrawerFilter = (p) => !filterTrim || `${p?.name || ""} ${p?.type || ""} ${p?.sub || ""} ${p?.cuisine || ""} ${p?.city || ""}`.toLowerCase().includes(filterTrim);
  const filteredView = filterTrim ? view.filter(matchesDrawerFilter) : view;
  const nearbyAllPlaces = (!explicitList && mapMode === "places")
    ? selectMapPlaces(applyCuratorPicks(liveAreaPlaces, curatorSnap), "all", viewport, "all")
    : [];
  const activeCategoryName = { food: "Food", nightlife: "Nightlife", attractions: "Activities", beach: "Beach", hotels: "Hotels", shopping: "Shopping" }[cat] || "this filter";
  const subsVisible = filtersExpanded && !mapPreview && !allCategories;
  const visibleLenses = [{ id: "all", label: "All" }, ...MAP_MOMENT_LENSES.filter((l) => l.id !== "christmas" || showHolidayLens)];
  const areaButtonLabel = scopeMode.mode === "explore_here" && scopeMode.areaLabel && scopeMode.areaLabel !== "Map area" && scopeMode.areaLabel !== "Area"
    ? scopeMode.areaLabel
    : (cityNowLabel || scopeMode.areaLabel || "Area");
  const shouldShowOrigin = explicitList || showRings || !!deviceLoc;

  return (
    <div className="wf-map-explorer" style={{ position: "relative", width: "100%", height: "100%" }}>
      <style dangerouslySetInnerHTML={styleHtml(`html.wf-santa-docked .wf-scrollarea[data-analytics-page="map"] { padding-bottom: calc(78px + env(safe-area-inset-bottom)) !important; } @media (min-width: 1024px) { html.wf-santa-docked .wf-scrollarea[data-analytics-page="map"] { padding-bottom: calc(118px + env(safe-area-inset-bottom)) !important; } } @media (min-width: 760px) { .wf-map-explorer .wf-map-results { width: 390px; right: auto !important; } .wf-map-explorer .wf-map-results.is-drawer-open { max-height: calc(100% - 294px) !important; width: 390px; right: auto !important; } .wf-map-explorer .wf-map-note { width: 390px; right: auto !important; } } .wf-map-explorer .maplibregl-ctrl-bottom-left, .wf-map-explorer .maplibregl-ctrl-bottom-right { margin-bottom: ${MAPLIBRE_ATTRIBUTION_LIFT}px; }`)} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 30, padding: "6px 10px 0" }}>
        <CategoryMenu compact activeCat={cat} subsExpanded={subsVisible} sub={sub}
          onCat={(id, label) => {
            try { logEvent("intent_chip", null, { intent: label, layer: 1, src: "map" }); } catch (e) {}
            sessionTrackerRef.current?.noteLensChange({ category: id, lens: effectiveLens });
            setAreaOnly(true);
            setAllCategories(false);
            setDrawerFilter("");
            setHoveredPinId(null);
            setMapPreview(null);
            if (id === cat && !allCategories) setFiltersExpanded((v) => !v);
            else setFiltersExpanded(true);
            setMapBrowse(true); setCat(id); setSub("all"); setVibe("all");
          }}
          onSub={(v) => {
            sessionTrackerRef.current?.noteLensChange({ category: cat, lens: effectiveLens });
            setAreaOnly(true);
            setAllCategories(false);
            setHoveredPinId(null);
            setSub(v);
          }}
          trailing={
            <button
              type="button"
              onClick={() => setFiltersExpanded((v) => !v)}
              aria-expanded={subsVisible ? "true" : "false"}
              aria-label={subsVisible ? "Collapse sub-filters" : "Expand sub-filters"}
              data-wf-filter-toggle
              style={{ flex: "none", background: "none", border: 0, padding: "6px 0", cursor: "pointer", display: "block" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 32, padding: "0 10px", borderRadius: 16, background: subsVisible || activeLens !== "all" ? "rgba(249,115,22,.16)" : "rgba(255,255,255,.06)", border: `1px solid ${subsVisible || activeLens !== "all" ? "rgba(249,115,22,.42)" : "rgba(255,255,255,.1)"}`, color: subsVisible || activeLens !== "all" ? "#FDBA74" : C.light, fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap" }}>
                {subsVisible ? "Less \u25B4" : (activeLens !== "all" ? `${activeLensMeta.label} \u25BE` : "Filters \u25BE")}
              </span>
            </button>
          }
        />
        {subsVisible && (
          <div role="group" aria-label="Right-now moment lenses" data-wf-map-lenses style={{ display: "flex", alignItems: "center", gap: 6, overflowX: "auto", overscrollBehaviorX: "contain", padding: "5px 8px 6px", marginTop: 4, borderRadius: 12, background: "rgba(11,16,24,.92)", border: "1px solid rgba(255,255,255,.1)", WebkitOverflowScrolling: "touch" }}>
            {visibleLenses.map((lens) => {
              const on = activeLens === lens.id;
              return (
                <button
                  key={lens.id}
                  type="button"
                  aria-pressed={on}
                  data-wf-lens={lens.id}
                  onClick={() => {
                    const nextLens = on && lens.id !== "all" ? "all" : lens.id;
                    setActiveLens(nextLens);
                    setAreaOnly(true);
                    setHoveredPinId(null);
                    sessionTrackerRef.current?.noteLensChange({ category: mapCategory, lens: nextLens === "all" ? null : nextLens });
                  }}
                  style={{ flexShrink: 0, padding: "4px 10px", borderRadius: 999, border: `1px solid ${on ? "rgba(249,115,22,.6)" : "rgba(255,255,255,.12)"}`, background: on ? "rgba(249,115,22,.2)" : "rgba(255,255,255,.04)", color: on ? "#FDBA74" : C.light, fontSize: 11.5, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  {lens.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button type="button" onClick={() => { setAreaOnly(true); setAllCategories((on) => !on); setFiltersExpanded(false); setDrawerFilter(""); setHoveredPinId(null); setMapPreview(null); }} aria-pressed={allCategories} style={{ position: "absolute", top: 164, left: 12, zIndex: 5, minHeight: 40, padding: "6px 12px", borderRadius: 999, background: allCategories ? "linear-gradient(160deg, #FDBA74, #F97316)" : "rgba(13,18,26,.88)", border: `1px solid ${allCategories ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.14)"}`, color: allCategories ? "#0B0F14" : C.light, fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,.28)" }}>All places · 9.2+</button>
      {/* Unified right-edge map control rail: one radius, one size (46px),
          one spacing rhythm (164 / 220 / 276), and one icon language
          (strokeWidth 2, round caps/joins). */}
      <button onClick={() => setMapSearchOpen(true)} aria-label="Search for a location" title="Search"
        style={{ position: "absolute", top: 276, right: 12, zIndex: 5, width: 46, height: 46, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(160deg, rgba(255,255,255,.97), rgba(240,243,248,.9))", border: "1px solid rgba(255,255,255,.9)", boxShadow: "0 6px 18px rgba(15,23,35,.22), 0 1px 2px rgba(15,23,35,.16), inset 0 1px 0 rgba(255,255,255,.9)" }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" /></svg>
      </button>
      <button onClick={recenterToMe} aria-label="Near me \u2014 recenter the map to your current location" title="Near me" aria-pressed={!!deviceLoc}
        style={{ position: "absolute", top: 164, right: 12, zIndex: 5, width: 46, height: 46, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", ...(deviceLoc ? { background: "linear-gradient(160deg, #FDBA74, #F97316)", border: "1px solid rgba(255,255,255,.75)", boxShadow: "0 6px 18px rgba(249,115,22,.34), 0 1px 2px rgba(15,23,35,.16), inset 0 1px 0 rgba(255,255,255,.55)" } : { background: "linear-gradient(160deg, rgba(255,255,255,.97), rgba(240,243,248,.9))", border: "1px solid rgba(255,255,255,.9)", boxShadow: "0 6px 18px rgba(15,23,35,.22), 0 1px 2px rgba(15,23,35,.16), inset 0 1px 0 rgba(255,255,255,.9)" }) }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 2.6c-4.1 0-7.4 3.3-7.4 7.4 0 5 6.4 10.7 6.9 11.1a.8.8 0 0 0 1 0c.5-.4 6.9-6.1 6.9-11.1 0-4.1-3.3-7.4-7.4-7.4Z"
                fill="none" stroke={deviceLoc ? "#FFFFFF" : "#F97316"} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="12" cy="9.8" r="2.5" fill={deviceLoc ? "#FFFFFF" : "#F97316"} />
        </svg>
      </button>
      {map3D ? <MapView key={mapRetryKey} onRetry={() => setMapRetryKey((k) => k + 1)} onAreaChange={setAreaOffer} onViewportChange={setViewport} rings={showRings} showOrigin={shouldShowOrigin} styleMode="3d" fit={explicitList || !!mapSearchPins} places={mapMode === "events" ? [] : view} events={mapEvents} center={center} category={mapCategory} deviceLoc={deviceLoc} focus={map3D && mapFocus?.coordSource === "apple_live" ? null : mapFocus} selectedId={mapPreview && mapPreview.id ? mapPreview.id : activeHoverId} onSelect={(p) => { setHoveredPinId(null); setFiltersExpanded(false); setPlanContextPlace(null); setMapPreview(p); setMapDrawer(false); const rk = 1 + view.findIndex((x) => x.id === p.id); sessionTrackerRef.current?.notePinSelected(actionPlace(p), { rank: rk, lens: effectiveLens }); try { logEvent("map_pin_tap", actionPlace(p), { rank: rk }); } catch (e) {} }} onSelectEvent={(e) => { setMapPreview(null); setEventPreview(e); }} />
        : <AppleExplorerMap onReady={(mapkit) => { if (currentRendererAttempt.current === rendererAttempt) setAppleSDK({ attempt: rendererAttempt, mapkit }); }} fit={explicitList || !!mapSearchPins} key={mapRetryKey} onRetry={() => setMapRetryKey((k) => k + 1)} onLoadError={() => { if (currentRendererAttempt.current === rendererAttempt) setFailedRendererAttempt(rendererAttempt); }} onAreaChange={setAreaOffer} onViewportChange={setViewport} rings={showRings} showOrigin={shouldShowOrigin} places={mapMode === "events" ? [] : view} events={mapEvents} center={center} category={mapCategory} deviceLoc={deviceLoc} focus={map3D && mapFocus?.coordSource === "apple_live" ? null : mapFocus} selectedId={mapPreview && mapPreview.id ? mapPreview.id : activeHoverId} onSelect={(p) => { setHoveredPinId(null); setFiltersExpanded(false); setPlanContextPlace(null); setMapPreview(p); setMapDrawer(false); const rk = 1 + view.findIndex((x) => x.id === p.id); sessionTrackerRef.current?.notePinSelected(actionPlace(p), { rank: rk, lens: effectiveLens }); try { logEvent("map_pin_tap", actionPlace(p), { rank: rk }); logEvent("map_pin_selected", actionPlace(p), {}); } catch (e) {} }} onSelectEvent={(e) => { setMapPreview(null); setEventPreview(e); }} />}
      {mapMode === "places" && !appleMapFailed && (mapStatus === "loading" ? !view.length : (mapStatus === "error" || !view.length)) && (
        <div role="status" data-wf-map-empty-state={mapStatus === "ready" && !view.length ? (nearbyAllPlaces.length > 0 ? "recovery" : "empty") : mapStatus} style={{ position: "absolute", left: "50%", transform: view.length && !mapDrawer && !mapPreview ? "translate(-50%, -48px)" : "translateX(-50%)", bottom: 76, maxWidth: "calc(100% - 24px)", zIndex: 19, background: "rgba(11,16,24,.94)", border: "1px solid rgba(255,255,255,.12)", color: C.text, borderRadius: 999, padding: "8px 15px", fontSize: 12, fontWeight: 700, boxShadow: "0 10px 26px rgba(0,0,0,.42)", display: "inline-flex", alignItems: "center", gap: 10, whiteSpace: "nowrap", pointerEvents: mapStatus === "loading" ? "none" : "auto" }}>
          {mapStatus === "loading" && (
            <>
              <span aria-hidden="true" style={{ display: "inline-block", width: 7, height: 7, borderRadius: 999, background: "#F97316", boxShadow: "0 0 8px #F97316" }} />
              <span>Loading nearby…</span>
            </>
          )}
          {mapStatus === "error" && (
            <>
              <span>{explicitList ? "Could not load this list" : "Could not load this area"}</span>
              <button type="button" onClick={() => (explicitList ? setListRetry : setAreaRetry)((n) => n + 1)} style={{ padding: "3px 10px", borderRadius: 999, background: "rgba(249,115,22,.16)", border: "1px solid rgba(249,115,22,.45)", color: "#FDBA74", cursor: "pointer", fontSize: 11.5, fontWeight: 800 }}>{explicitList ? "Retry" : "Retry area"}</button>
            </>
          )}
          {mapStatus === "ready" && !view.length && nearbyAllPlaces.length > 0 && (
            <>
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.25 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>Nothing in {activeLens !== "all" ? `${activeLensMeta.label} · ${activeCategoryName}` : activeCategoryName} nearby</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{nearbyAllPlaces.length} great place{nearbyAllPlaces.length === 1 ? "" : "s"} {nearbyAllPlaces.length === 1 ? "is" : "are"} still close to you</span>
              </div>
              <button type="button" onClick={() => { setAreaOnly(true); setAllCategories(true); setActiveLens("all"); if (setMapSearch) setMapSearch(null); setSub("all"); setDrawerFilter(""); setHoveredPinId(null); setMapPreview(null); }} style={{ padding: "5px 11px", borderRadius: 999, background: C.accent, border: "none", color: "#0B0F14", cursor: "pointer", fontSize: 11.5, fontWeight: 800, flexShrink: 0 }}>Show nearby</button>
            </>
          )}
          {mapStatus === "ready" && !view.length && nearbyAllPlaces.length === 0 && (
            <>
              <span>Nothing nearby matches this filter</span>
              <button type="button" onClick={() => { setAreaOnly(true); setAllCategories(true); setActiveLens("all"); if (setMapSearch) setMapSearch(null); setSub("all"); setDrawerFilter(""); setHoveredPinId(null); setMapPreview(null); }} style={{ padding: "4px 10px", borderRadius: 999, background: "rgba(249,115,22,.16)", border: "1px solid rgba(249,115,22,.45)", color: "#FDBA74", cursor: "pointer", fontSize: 11.5, fontWeight: 800, flexShrink: 0 }}>{allCategories && sub === "all" && activeLens === "all" && !mapSearch && !drawerFilter ? "Clear filters" : "Show all"}</button>
            </>
          )}
        </div>
      )}
      {/* ONE column above Apple's logo/Legal band, positioned from lib/mapSafeArea.js:
          renders the required ODbL licence credit when an OpenStreetMap coordinate pin is shown. */}
      {mapCredits.length > 0 && <div className="wf-map-note" data-wf-map-notes style={{ position: "absolute", left: MAP_NOTE_OFFSET.left, right: MAP_NOTE_OFFSET.right, bottom: MAP_NOTE_OFFSET.bottom + (mapMode !== "events" && areaOffer && searchMapArea ? SEARCH_PILL_NOTE_LIFT : 0), zIndex: 17, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, pointerEvents: "none" }}>
        <div data-wf-map-credit={mapCredits.join(" | ")} style={{ fontSize: 10, lineHeight: 1.3, color: "rgba(255,255,255,.92)", background: "rgba(15,23,35,.78)", borderRadius: 6, padding: "2px 6px", maxWidth: "100%" }}>{mapCredits.join(" · ")}</div>
      </div>}
      {/* The Events/FIFA stack. With Events flagged off (ticket 1) and the World
          Cup out of season this container rendered as an EMPTY dark box
          floating on the map — a control with nothing in it. Only mount it
          when it would actually hold a button. */}
      {(MAP_EVENTS_ON || Hol.worldCup(new Date())) && <div style={{ position: "absolute", top: 220, left: 12, zIndex: 5, display: "flex", flexDirection: "column", background: "rgba(10,16,27,.88)", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
        {Hol.worldCup(new Date()) ? <button onClick={() => setMapMode(mapMode === "fifa" ? "places" : "fifa")} style={{ padding: "7px 13px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "fifa" ? C.light : "transparent", color: mapMode === "fifa" ? "#fff" : C.light }}>⚽ FIFA</button> : null}
        {MAP_EVENTS_ON ? <button onClick={() => { if (mapMode === "events") { setMapMode("places"); } else { setMapMode("events"); if (!events) loadEvents(); } }} style={{ padding: "7px 15px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "events" ? C.light : "transparent", color: mapMode === "events" ? "#fff" : C.light }}>🎟️ Events</button> : null}
      </div>}
      {mapMode === "places" && (
        <button onClick={() => setMap3D((v) => !v)} aria-label={map3D ? "Switch to flat map" : "Switch to 3D map"} title={map3D ? "3D on \u2014 tap for flat map" : "Tap for 3D buildings"} aria-pressed={!!map3D}
          style={{ position: "absolute", top: 220, right: 12, zIndex: 5, width: 46, height: 46, borderRadius: 999, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, ...(map3D ? { background: "linear-gradient(160deg, #FDBA74, #F97316)", border: "1px solid rgba(255,255,255,.75)", boxShadow: "0 6px 18px rgba(249,115,22,.34), 0 1px 2px rgba(15,23,35,.16), inset 0 1px 0 rgba(255,255,255,.55)" } : { background: "linear-gradient(160deg, rgba(255,255,255,.97), rgba(240,243,248,.9))", border: "1px solid rgba(255,255,255,.9)", boxShadow: "0 6px 18px rgba(15,23,35,.22), 0 1px 2px rgba(15,23,35,.16), inset 0 1px 0 rgba(255,255,255,.9)" }) }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={map3D ? "#FFFFFF" : "#F97316"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
          <span style={{ fontSize: 8.5, fontWeight: 800, color: map3D ? "#FFFFFF" : "#0F172A", letterSpacing: ".2px", lineHeight: 1 }}>{map3D ? "3D" : "2D"}</span>
        </button>
      )}
      {mapMode !== "events" && areaOffer && searchMapArea && (
        <button
          onClick={() => { const a = areaOffer; setDrawerFilter(""); setHoveredPinId(null); setAreaOffer(null); searchMapArea(a); try { logEvent("map_search_area_tap", null, { metro: currentMetroId }); } catch (e) {} }}
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 150, zIndex: 17, padding: "10px 18px", borderRadius: 999, border: "1px solid rgba(255,255,255,.85)", cursor: "pointer", background: "linear-gradient(160deg, rgba(255,255,255,.97), rgba(240,243,248,.92))", color: "#0B0F14", fontSize: 13.5, fontWeight: 800, boxShadow: "0 8px 22px rgba(15,23,35,.3), inset 0 1px 0 rgba(255,255,255,.9)", display: "inline-flex", alignItems: "center", gap: 7, whiteSpace: "nowrap" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2.4" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" /></svg>
          Search this area
        </button>
      )}
      {mapMode === "events" && (
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, zIndex: 5, padding: "0 12px" }}>
          {!eventsLoading && !eventsUnavailable && (
            <div style={{ fontSize: 11.5, color: "#fff", fontWeight: 700, textAlign: "center", marginBottom: 6, textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>{mapEvents.length} venue{mapEvents.length === 1 ? "" : "s"}{mapDate === "all" ? " coming up" : " that day"}</div>
          )}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", overscrollBehaviorX: "contain", background: "rgba(13,17,23,.9)", border: `1px solid ${C.border}`, borderRadius: 14, padding: 8, WebkitOverflowScrolling: "touch" }}>
            <button onClick={() => setMapDate("all")} style={tchip(mapDate === "all")}><div style={{ fontSize: 10, opacity: 0.85 }}>Any</div><div style={{ fontSize: 13 }}>All</div></button>
            {dateChips.map((d) => (
              <button key={d.value} onClick={() => setMapDate(d.value)} style={tchip(mapDate === d.value)}><div style={{ fontSize: 10, opacity: 0.85 }}>{d.top}</div><div style={{ fontSize: 13 }}>{d.day}</div></button>
            ))}
          </div>
          {eventsUnavailable && <div style={{ fontSize: 11.5, color: "#fff", textAlign: "center", marginTop: 6, textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>Add a Ticketmaster key in Vercel to switch events on.</div>}
        </div>
      )}
      {mapMode !== "events" && mapPreview && (!map3D || mapPreview.coordSource !== "apple_live") && (() => {
        const mp = mapPreview;
        const activeSet = filterTrim && filteredView.some((x) => x && x.id === mp.id) ? filteredView : view;
        const ranked = (activeSet || []).filter((x) => x && x.id);
        const idx = ranked.findIndex((x) => x.id === mp.id);
        const pos = idx >= 0 ? idx + 1 : null;
        const step = (dir) => {
          if (idx < 0 || !ranked.length) return;
          const next = ranked[(idx + dir + ranked.length) % ranked.length];
          if (!next) return;
          setMapPreview(next);
          setMapFocus({ lat: next.lat, lng: next.lng, coordSource: next.coordSource, ts: Date.now() });
          try { logEvent("map_card_page", actionPlace(next), { direction: dir > 0 ? "next" : "prev", rank: 1 + ranked.indexOf(next) }); } catch (e) {}
        };
        const blurb = blurbs && blurbs[mp.id];
        const previewDistanceInfo = resolvePlaceDistanceSemantics(mp, {
          verifiedDeviceLoc: deviceLoc,
          areaCenter: cameraCenter,
          pinPoint: mp,
          allowAreaFallback: false,
        });
        const baseEval = rankedBundle.evaluated.get(mp.id) || evaluateMapCandidate(mp, {
          verifiedDeviceLoc: deviceLoc,
          referenceCenter: cameraCenter || center,
          liveRoute: liveDrive,
          weather,
          beachSignals,
          lens: effectiveLens,
          skipScoreFloor: true,
        });
        const evalWithLiveDrive = liveDrive ? { ...baseEval, driveEstimate: { ...liveDrive, hasPhysicalOrigin: !!deviceLoc } } : baseEval;
        const decisionReason = buildMapDecisionReason(mp, evalWithLiveDrive, {
          editorial: typeof blurb === "string" ? blurb : null,
          aiSummary: blurb && typeof blurb === "object" ? blurb : null,
        });
        return (
          <div className="wf-map-results"
            onTouchStart={(e) => { mapCardTouch.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              const dy = e.changedTouches[0].clientY - (mapCardTouch.current || 0);
              if (dy > 60) setMapPreview(null);
            }}
            style={{ position: "absolute", left: 12, right: 12, bottom: 76, zIndex: 18, maxHeight: 168, overflow: "hidden", background: "rgba(11,15,22,.94)", border: "1px solid rgba(255,255,255,.12)", borderRadius: 16, boxShadow: "0 10px 28px rgba(0,0,0,.45)" }}>
            <div aria-hidden="true" style={{ width: 32, height: 3.5, borderRadius: 2, background: "rgba(255,255,255,.22)", margin: "6px auto 0" }} />
            <button onClick={() => setMapPreview(null)} aria-label="Close" style={{ position: "absolute", top: 2, right: 2, width: 36, height: 36, border: "none", background: "transparent", color: C.muted, fontSize: 13, cursor: "pointer", zIndex: 3 }}>&#10005;</button>
            <MapCompactPreviewCard
              place={withPhoto(mp)}
              editorial={typeof blurb === "string" ? blurb : null}
              aiSummary={blurb && typeof blurb === "object" ? blurb : null}
              distanceInfo={previewDistanceInfo}
              decisionReason={decisionReason}
              liveDrive={liveDrive}
              isPlanned={isOnTrip ? !!isOnTrip(mp.id) : false}
              onTogglePlan={addToItinerary ? () => {
                try {
                  addToItinerary(actionPlace(mp));
                  sessionTrackerRef.current?.noteDecisionExecution("itinerary_add", actionPlace(mp), { rank: pos, lens: effectiveLens });
                } catch (er) {}
              } : null}
              onDirections={() => {
                sessionTrackerRef.current?.noteDecisionExecution("directions", actionPlace(mp), { rank: pos, lens: effectiveLens });
              }}
              onOpen={() => {
                try { logEvent("map_card_cta", actionPlace(mp), { rank: pos }); } catch (e) {}
                if (mp.kind !== "event" || !mp.href) openDetail(actionPlace(mp));
                else if (typeof window !== "undefined") window.location.assign(mp.href);
                sessionTrackerRef.current?.noteDecisionExecution(mp.kind === "event" && mp.href ? "ticket_click" : "detail_open", actionPlace(mp), { rank: pos, lens: effectiveLens });
              }}
              onSave={(e) => { try { quickSaveFavorite(actionPlace(mp)); sessionTrackerRef.current?.noteDecisionExecution("save", actionPlace(mp), { rank: pos, lens: effectiveLens }); } catch (er) {} }}
              onShare={(place) => { const target = (place && place.id) ? place : actionPlace(mp); try { addShared(actionPlace(mp)); giveawayMark && giveawayMark(mp.id); } catch (er) {} try { shareCard(target, { surface: "map_preview" }); } catch (er) {} }}
              onLike={(e) => { try { toggleLike(e, actionPlace(mp)); } catch (er) {} }}
              onDislike={(e) => { try { toggleDislike(e, actionPlace(mp)); } catch (er) {} }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, padding: "5px 12px 7px", borderTop: "1px solid rgba(255,255,255,.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                <button type="button" onClick={() => { setMapPreview(null); setMapDrawer(true); }} style={{ padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(249,115,22,.45)", background: "rgba(249,115,22,.14)", color: "#FDBA74", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>&#9776; List ({ranked.length})</button>
                <button type="button" onClick={() => { setPlanContextPlace(mp); requestParkingFor(mp); setMapPreview(null); setMapDrawer(true); }} aria-label={`Parking and nearby pairings for ${mp.name}`} style={{ padding: "3px 8px", borderRadius: 999, border: `1px solid ${C.border}`, background: "rgba(255,255,255,.05)", color: C.light, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>Park · Pair</button>
                <span style={{ fontSize: 11, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pos ? `${pos} of ${ranked.length} \u00b7 ${rankingLabel}` : rankingLabel}</span>
              </div>
              <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => step(-1)} aria-label="Previous place" style={{ width: 30, height: 26, border: `1px solid ${C.border}`, background: "transparent", color: C.light, borderRadius: 8, cursor: "pointer" }}>&#8249;</button>
                <button onClick={() => step(1)} aria-label="Next place" style={{ width: 30, height: 26, border: `1px solid ${C.border}`, background: "transparent", color: C.light, borderRadius: 8, cursor: "pointer" }}>&#8250;</button>
              </span>
            </div>
          </div>
        );
      })()}
      {mapMode === "events" && eventPreview && (() => {
        const ev = eventPreview;
        const dl = ev.date ? (() => { try { return new Date(ev.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch { return ev.date; } })() : "";
        return (
          <div className="wf-map-event-preview" style={{ position: "absolute", left: 12, right: 12, bottom: 76, zIndex: 6 }}>
            <div style={{ position: "relative", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 34px rgba(0,0,0,.6)" }}>
              {ev.dest ? (
                <a href={ev.destKind === "internal" ? ev.dest : ticketUrl(ev.dest)} {...(ev.destKind === "internal" ? {} : { target: "_blank", rel: "noreferrer" })} onClick={() => { try { logEvent("event_open", null, { id: ev.id, kind: ev.destKind, src: "map_preview" }); } catch (e2) {} }} style={{ display: "flex", minWidth: 0, textDecoration: "none" }}>
                  <FallbackImg src={ev.image} icon="🎫" style={{ width: 96, height: 96, objectFit: "cover", flexShrink: 0, display: "block" }} />
                  <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 22 }}>{ev.name}</div>
                    {(dl || ev.time) && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.light, marginTop: 4 }}>{dl}{ev.time ? " · " + ev.time : ""}</div>}
                    {ev.venue && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {ev.venue}</div>}
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: C.light, marginTop: 5 }}>View event →</div>
                  </div>
                </a>
              ) : null}
              {ev.venue && (
                <button onClick={() => openVenue(ev)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: `1px solid ${C.border}`, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: C.light, cursor: "pointer" }}>📍 View venue on Wayfind ›</button>
              )}
              {ev.dest && (
                <button onClick={() => { try { logEvent("share", null, { id: ev.id, kind: "map_event_preview" }); } catch (e2) {} try { openShareFlow({ title: ev.name, url: ev.destKind === "internal" ? ev.dest : ticketUrl(ev.dest), text: ev.name + (ev.venue ? " at " + ev.venue : "") + ". Found on Wayfind." }); } catch (e2) {} }} style={{ display: "block", width: "100%", minHeight: 44, textAlign: "left", background: "transparent", border: "none", borderTop: `1px solid ${C.border}`, padding: "8px 12px", fontSize: 12.5, fontWeight: 800, color: C.text, cursor: "pointer" }}>↗ Share this event</button>
              )}
              <button onClick={(ev2) => { ev2.stopPropagation(); setEventPreview(null); }} aria-label="Dismiss" style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
          </div>
        );
      })()}
      {mapMode === "places" && !mapPreview && view.length > 0 && (
        <div className={`wf-map-results${mapDrawer ? " is-drawer-open" : ""}`} style={{ position: "absolute", left: 12, right: 12, bottom: 76, zIndex: 18, width: mapDrawer ? undefined : "fit-content", maxWidth: "calc(100% - 24px)", margin: mapDrawer ? undefined : "0 auto", background: "rgba(11,16,24,.92)", border: "1px solid rgba(255,255,255,.12)", borderRadius: mapDrawer ? 18 : 999, boxShadow: "0 10px 28px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.08)", maxHeight: mapDrawer ? "min(58%, 460px)" : 40, transition: "max-height .24s cubic-bezier(.4,0,.2,1)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <button onClick={() => { setHoveredPinId(null); setMapDrawer((o) => !o); }} aria-expanded={mapDrawer ? "true" : "false"} aria-label={mapDrawer ? "Collapse list" : "Expand list"} style={{ flexShrink: 0, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
            {mapDrawer && <div style={{ width: 32, height: 3.5, background: C.border, borderRadius: 2, margin: "7px auto 4px" }} />}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, width: "100%", padding: mapDrawer ? "2px 16px 10px" : "9px 14px" }}>
              <span style={{ fontSize: 12, lineHeight: "18px", fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><span style={{ color: "#FB923C" }}>{filterTrim ? `${filteredView.length} of ${view.length}` : view.length}</span> place{view.length === 1 ? "" : "s"} in view · {mapStatus === "ready" ? rankingLabel : mapStatus === "error" ? "partial results" : explicitList ? "loading list" : "loading area"}</span>
              <span style={{ flexShrink: 0, fontSize: 11.5, lineHeight: "17px", color: C.accent, fontWeight: 800 }}>{mapDrawer ? "Hide list ▾" : "Browse list ▴"}</span>
            </div>
          </button>
          {mapDrawer && (
            <>
              {mapSearch && mapSearch.query && (
                <div data-wf-map-search-banner style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 14px 8px", padding: "6px 10px", borderRadius: 10, background: "rgba(249,115,22,.14)", border: "1px solid rgba(249,115,22,.38)", fontSize: 11.5, color: "#FDBA74", fontWeight: 700 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Showing map results for &ldquo;{mapSearch.query}&rdquo;{scopeMode.areaLabel && scopeMode.areaLabel !== "Map area" ? ` in ${scopeMode.areaLabel}` : ""}</span>
                  <button type="button" onClick={() => { if (setMapSearch) setMapSearch(null); }} style={{ flexShrink: 0, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(249,115,22,.45)", background: "transparent", color: "#FDBA74", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Clear ×</button>
                </div>
              )}
              {itineraryAnalysis && itineraryAnalysis.hasBacktracking && (
                <div data-wf-map-itinerary-opt style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "0 14px 8px", padding: "7px 10px", borderRadius: 10, background: "rgba(14,165,233,.14)", border: "1px solid rgba(56,189,248,.36)", fontSize: 11.5, color: "#BAE6FD", fontWeight: 700 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Trip stops backtrack · save ~{itineraryAnalysis.savedDriveMin}m drive</span>
                  <button type="button" onClick={applyOptimizedItinerary} style={{ flexShrink: 0, padding: "3px 9px", borderRadius: 999, border: "none", background: "#38BDF8", color: "#0B0F14", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>Optimize</button>
                </div>
              )}
              {planContextPlace && (
                <div data-wf-map-plan-panel style={{ margin: "0 14px 10px", padding: "9px 11px", borderRadius: 12, background: "rgba(15,23,42,.86)", border: `1px solid ${C.border}`, fontSize: 11.5 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <strong style={{ color: C.text, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Around {planContextPlace.name}</strong>
                    <button type="button" onClick={() => setPlanContextPlace(null)} aria-label="Close planning context" style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 12 }}>✕</button>
                  </div>
                  <div style={{ marginTop: 6, color: C.light }}>
                    <span style={{ fontWeight: 800, color: "#FDBA74" }}>Parking: </span>
                    {parkingState.status === "loading" && <span>Checking nearby garages &amp; lots…</span>}
                    {parkingState.status === "empty" && (
                      <a href={parkingState.fallbackHref || `https://maps.apple.com/?q=Parking&sll=${encodeURIComponent(`${planContextPlace.lat},${planContextPlace.lng}`)}`} target="_blank" rel="noopener noreferrer" onClick={() => sessionTrackerRef.current?.noteDecisionExecution("parking_open", actionPlace(planContextPlace), { lens: effectiveLens })} style={{ color: "#38BDF8", textDecoration: "none", fontWeight: 700 }}>Open nearby parking in Maps ↗</a>
                    )}
                    {parkingState.status === "ready" && parkingState.items[0] && (
                      <span>
                        {parkingState.items[0].name}{parkingState.items[0].distanceLabel ? ` (${parkingState.items[0].distanceLabel})` : ""} ·{" "}
                        <a href={parkingState.items[0].driveHref || parkingState.fallbackHref} target="_blank" rel="noopener noreferrer" onClick={() => sessionTrackerRef.current?.noteDecisionExecution("parking_open", actionPlace(planContextPlace), { lens: effectiveLens })} style={{ color: "#38BDF8", textDecoration: "none", fontWeight: 700 }}>Park here ↗</a>
                      </span>
                    )}
                  </div>
                  {aroundSuggestions.length > 0 && (
                    <div style={{ marginTop: 7 }}>
                      <div style={{ fontWeight: 800, color: C.muted, marginBottom: 4 }}>Pairs well nearby</div>
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", overscrollBehaviorX: "contain", WebkitOverflowScrolling: "touch" }}>
                        {aroundSuggestions.map((s) => (
                          <button key={s.place.id} type="button" onClick={() => { setPlanContextPlace(null); setMapPreview(s.place); setMapFocus({ lat: s.place.lat, lng: s.place.lng, coordSource: s.place.coordSource, ts: Date.now() }); setMapDrawer(false); }} style={{ flexShrink: 0, padding: "5px 9px", borderRadius: 9, border: `1px solid ${C.border}`, background: "rgba(255,255,255,.04)", color: C.text, fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                            <div>{s.place.name}</div>
                            <div style={{ fontSize: 10, color: C.muted }}>{s.reason}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px 10px", flexShrink: 0 }}>
                <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
                  <input
                    type="search"
                    value={drawerFilter}
                    onChange={(e) => setDrawerFilter(e.target.value)}
                    placeholder="Filter places in view…"
                    aria-label="Filter places in view"
                    style={{ width: "100%", padding: drawerFilter ? "6px 26px 6px 10px" : "6px 10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(15,23,42,.78)", color: C.text, fontSize: 12, fontWeight: 600, outline: "none" }}
                  />
                  {drawerFilter && (
                    <button type="button" onClick={() => setDrawerFilter("")} aria-label="Clear filter" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 22, height: 22, borderRadius: 999, border: "none", background: "transparent", color: C.muted, fontSize: 11, cursor: "pointer" }}>&#10005;</button>
                  )}
                </div>
                <button type="button" onClick={() => setMapSearchOpen(true)} title={scopeMode.label} style={{ padding: "6px 10px", borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(15,23,42,.78)", color: C.light, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>&#128205; {areaButtonLabel}</button>
                <button type="button" onClick={() => setShowRings((r) => !r)} aria-pressed={showRings} title="Toggle 5/10/15/20 mi distance rings" style={{ padding: "6px 9px", borderRadius: 10, border: `1px solid ${showRings ? "#F97316" : C.border}`, background: showRings ? "rgba(249,115,22,.18)" : "rgba(15,23,42,.78)", color: showRings ? "#FDBA74" : C.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>&#9678; Rings</button>
                <button type="button" onClick={() => {
                  const url = buildMapDeepLink({ city: areaButtonLabel !== "Area" ? areaButtonLabel : "", cat: allCategories ? "all" : cat, sub: sub !== "all" ? sub : "", lens: effectiveLens, q: mapSearch?.query || null });
                  try { openShareFlow({ title: `${areaButtonLabel} Map · Wayfind`, url, text: `Explore top-rated places in ${areaButtonLabel} on Wayfind.` }); } catch (e) {}
                }} aria-label="Share this map view" title="Share map view" style={{ padding: "6px 9px", borderRadius: 10, border: `1px solid ${C.border}`, background: "rgba(15,23,42,.78)", color: C.light, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>&#8599;</button>
              </div>
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 12px 16px" }}>
                {filterTrim && filteredView.length === 0 && (
                  <div style={{ padding: "18px 12px", textAlign: "center", color: C.muted, fontSize: 12.5 }}>
                    No places in view match &ldquo;{drawerFilter.trim()}&rdquo;.
                    <button type="button" onClick={() => setDrawerFilter("")} style={{ marginLeft: 8, color: "#FDBA74", background: "transparent", border: "none", fontWeight: 800, cursor: "pointer" }}>Clear filter</button>
                  </div>
                )}
                {view.map((p, i) => matchesDrawerFilter(p) && (
                  <div key={p.id} onMouseEnter={() => setHoveredPinId(p.id)} onMouseLeave={() => setHoveredPinId((prev) => (prev === p.id ? null : prev))}>
                    <PlaceCard p={withPhoto(p)} rank={i + 1} saved={isSaved(p.id)} liked={!!(liked && liked[p.id])} disliked={!!(disliked && disliked[p.id])} onDetail={() => { setHoveredPinId(null); setFiltersExpanded(false); setMapPreview(p); setMapFocus({ lat: p.lat, lng: p.lng, coordSource: p.coordSource, ts: Date.now() }); setMapDrawer(false); }} onSave={() => quickSaveFavorite(actionPlace(p))} onLike={(e) => toggleLike(e, actionPlace(p))} onDislike={(e) => toggleDislike(e, actionPlace(p))} onShareCard={(pl) => { try { addShared(actionPlace(p)); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id] || p.line} onBadge={openExperience} onCuisineTap={openCuisine} beachSignal={beachSignals && beachSignals[p.id]} city={cityNowLabel || p.locality || p.city} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
