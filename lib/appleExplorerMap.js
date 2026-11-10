import { applePinOptions, appleClusterPinUrl } from "./mapPinStandard.js";
import { eventMapFamily } from "./eventMapPlaces.js";
import { eventMapPoint } from "./eventLocation.js";
import { areaMoved, MAP_RING_MILES } from "./mapExplorer.js";
import { formatScore, toDisplayScore } from "./score.js";
import { MAP_SAFE_PADDING } from "./mapSafeArea.js";

const MILES_TO_METERS = 1609.344;

function finitePoint(point) {
  if (!point) return null;
  if (point.lat == null || point.lng == null) return null;
  if (typeof point.lat === "string" && !point.lat.trim()) return null;
  if (typeof point.lng === "string" && !point.lng.trim()) return null;
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function coordinate(mapkit, point) {
  return new mapkit.Coordinate(point.lat, point.lng);
}

export function appleMapBounds(map) {
  const region = map && map.region;
  const center = region && region.center;
  const span = region && region.span;
  if (!center || !span) return null;
  const lat = Number(center.latitude);
  const lng = Number(center.longitude);
  const latDelta = Math.abs(Number(span.latitudeDelta));
  const lngDelta = Math.abs(Number(span.longitudeDelta));
  if (![lat, lng, latDelta, lngDelta].every(Number.isFinite)) return null;
  return {
    north: Math.min(90, lat + latDelta / 2),
    south: Math.max(-90, lat - latDelta / 2),
    east: lng + lngDelta / 2,
    west: lng - lngDelta / 2,
  };
}

function removeMany(map, method, singular, values) {
  if (!values.length) return;
  if (typeof map[method] === "function") map[method](values);
  else if (typeof map[singular] === "function") values.forEach((value) => map[singular](value));
}

function addMany(map, method, singular, values) {
  if (!values.length) return;
  if (typeof map[method] === "function") map[method](values);
  else if (typeof map[singular] === "function") values.forEach((value) => map[singular](value));
}

// NO NATIVE CALLOUT on any pin (Sentry WAYFIND-12 / 1B / 1C / 1D / R, 2344+ events,
// iOS Safari and Chrome, /map and /):
//   TypeError: undefined is not an object (evaluating 'e.width')
//   positionForCallout > updateAccessoryPositionWithTailShift >
//   showAccessoryForAnnotation > selectedAnnotationDidMoveToMap > updateSize
// Our pins are SVG data-URL images with no size MapKit can measure until they
// load (or while a clustered member has no view), and a selected annotation with
// a title asks MapKit to position Apple's bubble around them. The throw aborts
// the annotation add loop. We always select in code (selectedId, focusOn,
// selectId) and often BEFORE the annotation is on the map, and the app's own
// place card is already the detail view, so Apple's bubble only repeats it. Same
// cure as lib/creatorAppleMap.js (2026-09-22): selection still works and select
// still fires, only the bubble is gone. Locked by scripts/test-apple-explorer-map.mjs.
function withoutCallout(annotation) {
  annotation.calloutEnabled = false;
  return annotation;
}

export function createAppleExplorerController({
  mapkit, container, center, places = [], category, deviceLoc, events = [],
  onSelect, onSelectEvent, selectedId, fit = false, rings = false,
  showOrigin = true, onAreaChange, onViewportChange,
}) {
  if (!mapkit || typeof mapkit.Map !== "function") throw new Error("Apple Maps SDK is unavailable");
  const initial = finitePoint(center);
  if (!initial) throw new Error("A valid map center is required");

  const options = {
    center: coordinate(mapkit, initial),
    showsMapTypeControl: false,
    isRotationEnabled: false,
  };
  if (typeof mapkit.CoordinateRegion === "function" && typeof mapkit.CoordinateSpan === "function") {
    options.region = new mapkit.CoordinateRegion(
      options.center,
      // When rings are enabled, start ~50 miles tall so the 20-mile ring fits;
      // otherwise start at a clean metro-discovery zoom (~16 miles tall).
      rings ? new mapkit.CoordinateSpan(0.72, 0.84) : new mapkit.CoordinateSpan(0.24, 0.28),
    );
  }
  const map = new mapkit.Map(container, options);
  // Keep Apple's own attribution and controls out from under Wayfind's header,
  // floating control stack, collapsed results drawer, and bottom navigation.
  // `padding` is MapKit's supported content-inset API; attribution stays native.
  if (typeof mapkit.Padding === "function") map.padding = new mapkit.Padding(MAP_SAFE_PADDING.top, MAP_SAFE_PADDING.right, MAP_SAFE_PADDING.bottom, MAP_SAFE_PADDING.left);
  // Style native cluster pins with Wayfind's dark-obsidian + orange-rimmed cluster badge.
  map.annotationForCluster = (clusterAnnotation) => {
    const members = (clusterAnnotation && clusterAnnotation.memberAnnotations) || [];
    const count = members.length;
    if (count < 2) return null;
    const coord = clusterAnnotation.coordinate || (members[0] && members[0].coordinate);
    if (!coord) return null;
    return withoutCallout(new mapkit.ImageAnnotation(coord, {
      title: `${count} places`,
      subtitle: "Tap to zoom in",
      image: { 1: appleClusterPinUrl(count) },
      accessibilityLabel: `Cluster of ${count} places`,
      displayPriority: 1000,
    }));
  };
  let dead = false;
  let placeAnnotations = [];
  let eventAnnotations = [];
  let originAnnotations = [];
  let ringLabels = [];
  let ringOverlays = [];
  let placeByAnnotation = new Map();
  let eventByAnnotation = new Map();
  let searchOrigin = finitePoint(deviceLoc) || initial;
  let centerKey = `${initial.lat}|${initial.lng}`;
  let originKey = "";
  let ringsKey = "";
  let lastFitKey = "";
  let syncingSelection = false;
  // PROGRAMMATIC FIT IS NOT A PAN (2026-11-03). In list mode (`fit`) the
  // renderer frames the list's pins with showItems. #2079 made that frame fit
  // the PLACE pins only (no origin marker, no rings), so the settled center can
  // sit well past AREA_MOVE_THRESHOLD_MI from the search origin — and the
  // region-change-end that follows raised "Search this area" on a map nobody
  // had touched. That button also hides the unpinned note (Map.js gates the
  // note on `!(areaOffer && searchMapArea)`), which is how the synthetic
  // monitor's surface-parity scenario went red on every run from 2026-10-31
  // 22:44Z. So: the settle after a fit never offers, and later pans are
  // measured from the FITTED center, not the pre-fit origin.
  let fitSettle = null;  // "pending" between showItems and its settle
  let fitOrigin = null;  // the center the fit achieved; the pan baseline in fit mode
  const regionCenter = () => {
    const c = map.region && map.region.center;
    const p = c ? { lat: Number(c.latitude), lng: Number(c.longitude) } : null;
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? p : null;
  };

  const emitViewport = () => {
    if (dead) return;
    const current = regionCenter();
    const bounds = appleMapBounds(map);
    if (bounds && onViewportChange) onViewportChange(bounds);
    if (current && onAreaChange) {
      if (fitSettle === "pending") {
        // The settle of the fit itself: adopt it as the pan baseline, never offer.
        fitSettle = "settled";
        fitOrigin = current;
        onAreaChange(null);
        return;
      }
      onAreaChange(areaMoved(fitOrigin || searchOrigin, current) ? { ...current, bounds } : null);
    }
  };

  const select = (event) => {
    if (dead || syncingSelection) return;
    const annotation = event && event.annotation;
    if (placeByAnnotation.has(annotation)) onSelect && onSelect(placeByAnnotation.get(annotation));
    else if (eventByAnnotation.has(annotation)) onSelectEvent && onSelectEvent(eventByAnnotation.get(annotation));
    else if (annotation && Array.isArray(annotation.memberAnnotations) && annotation.memberAnnotations.length) {
      const members = annotation.memberAnnotations;
      const uniqueCoordinates = new Set(members.map((member) => {
        const c = member && member.coordinate;
        return c ? `${Number(c.latitude).toFixed(7)}|${Number(c.longitude).toFixed(7)}` : "";
      }));
      // Apple documents `memberAnnotations` as the way to inspect a selected
      // native cluster. Spread normal clusters with showItems. Exact-coordinate
      // clusters cannot spread at any zoom, so open their first real place;
      // the shared results drawer/pager keeps every co-located member reachable.
      if (uniqueCoordinates.size > 1 && typeof map.showItems === "function") {
        map.showItems(members, { animate: true, padding: new mapkit.Padding(MAP_SAFE_PADDING.top, MAP_SAFE_PADDING.right, MAP_SAFE_PADDING.bottom, MAP_SAFE_PADDING.left) });
      } else {
        const first = members.find((member) => placeByAnnotation.has(member));
        if (first && onSelect) onSelect(placeByAnnotation.get(first));
      }
    }
  };
  if (typeof map.addEventListener === "function") {
    map.addEventListener("select", select);
    map.addEventListener("region-change-end", emitViewport);
  }

  const update = (next = {}) => {
    if (dead) return;
    syncingSelection = true;
    try {

    const nextPlaces = Array.isArray(next.places) ? next.places : [];
    const nextEvents = Array.isArray(next.events) ? next.events.filter((e) => e && eventMapPoint(e)) : [];
    const nextCategory = next.category || "";
    const nextSelectedId = next.selectedId == null ? null : String(next.selectedId);
    const nextDevice = finitePoint(next.deviceLoc);
    const nextCenter = finitePoint(next.center) || initial;
    // A typed search establishes the new area origin even when a device GPS
    // fix still exists. Otherwise "Search this area" compares every pan to the
    // old GPS point and cannot retract after the named-location search settles.
    searchOrigin = nextCenter;
    const nextCenterKey = `${nextCenter.lat}|${nextCenter.lng}`;
    if (nextCenterKey !== centerKey) {
      centerKey = nextCenterKey;
      if (typeof map.setCenterAnimated === "function") map.setCenterAnimated(coordinate(mapkit, nextCenter), true);
      else map.center = coordinate(mapkit, nextCenter);
    }

    const existingPlacesById = new Map();
    for (const ann of placeAnnotations) {
      if (ann.__wayfindId && !existingPlacesById.has(ann.__wayfindId)) existingPlacesById.set(ann.__wayfindId, ann);
    }
    const nextPlaceAnnotations = [];
    const nextPlaceByAnnotation = new Map();
    const keptPlaceAnnotations = new Set();
    const annotationsToAdd = [];

    // Do not cap results here. The area endpoint and category filter own the
    // result set; MapKit clusters the complete matching set in the viewport.
    nextPlaces.forEach((place, index) => {
      const point = finitePoint(place);
      if (!point) return;
      const id = String(place.id || `apple-place-${index}`);
      // The list/card and its pin must show the same governed score. Keep raw
      // wfScore as the fallback for callers that have not stamped the shared
      // lawful-order value yet; both inputs remain on the stored 0-100 scale.
      const score = toDisplayScore(Number.isFinite(place.governed_score) ? place.governed_score : place.wfScore);
      const scoreText = score == null ? null : formatScore(score);
      const type = place.primaryType || place.primary_type;
      const placeCategory = place.category || nextCategory;
      const family = eventMapFamily(place, placeCategory);
      const title = place.name || "Place";
      const subtitle = `${score == null ? `#${index + 1}` : `Wayfind ${scoreText}/10`}${type ? ` · ${String(type).replaceAll("_", " ")}` : ""}`;
      const accessibilityLabel = `${place.name || "Place"}${score == null ? "" : `, Wayfind score ${scoreText} out of 10`}`;
      const displayPriority = score != null ? Math.min(1000, Math.max(500, Math.round(score * 100))) : 750;
      const sig = `${point.lat}|${point.lng}|${family}|${scoreText || ""}|${title}|${subtitle}|${accessibilityLabel}|${displayPriority}`;
      const isSelected = nextSelectedId === id;
      const existing = existingPlacesById.get(id);
      if (existing && existing.__wayfindSig === sig && !keptPlaceAnnotations.has(existing)) {
        keptPlaceAnnotations.add(existing);
        if (existing.selected !== isSelected) {
          existing.selected = isSelected;
          existing.image = applePinOptions(mapkit, family, { selected: isSelected, score: scoreText }).image;
        }
        nextPlaceAnnotations.push(existing);
        nextPlaceByAnnotation.set(existing, place);
        return;
      }
      const annotation = withoutCallout(new mapkit.ImageAnnotation(coordinate(mapkit, point), {
        title,
        subtitle,
        ...applePinOptions(mapkit, family, { selected: isSelected, score: scoreText }),
        clusteringIdentifier: "wayfind-places",
        accessibilityLabel,
        displayPriority,
      }));
      annotation.__wayfindId = id;
      annotation.__wayfindFamily = family;
      annotation.__wayfindScore = scoreText;
      annotation.__wayfindSig = sig;
      annotation.selected = isSelected;
      nextPlaceAnnotations.push(annotation);
      nextPlaceByAnnotation.set(annotation, place);
      annotationsToAdd.push(annotation);
    });

    const existingEventsById = new Map();
    for (const ann of eventAnnotations) {
      if (ann.__wayfindEvent && !existingEventsById.has(ann.__wayfindEvent)) existingEventsById.set(ann.__wayfindEvent, ann);
    }
    const nextEventAnnotations = [];
    const nextEventByAnnotation = new Map();
    const keptEventAnnotations = new Set();

    nextEvents.forEach((event, index) => {
      const point = finitePoint(event);
      if (!point) return;
      const evId = String(event.id || `apple-event-${index}`);
      const title = event.venue || event.name || "Event";
      const subtitle = event.name || "Event";
      const sig = `${point.lat}|${point.lng}|${title}|${subtitle}`;
      const existing = existingEventsById.get(evId);
      if (existing && existing.__wayfindSig === sig && !keptEventAnnotations.has(existing)) {
        keptEventAnnotations.add(existing);
        nextEventAnnotations.push(existing);
        nextEventByAnnotation.set(existing, event);
        return;
      }
      const annotation = withoutCallout(new mapkit.ImageAnnotation(coordinate(mapkit, point), {
        title,
        subtitle,
        ...applePinOptions(mapkit, "event"),
        clusteringIdentifier: "wayfind-events",
        accessibilityLabel: `${title}${subtitle && subtitle !== title ? `, ${subtitle}` : ""}`,
      }));
      annotation.__wayfindEvent = evId;
      annotation.__wayfindSig = sig;
      nextEventAnnotations.push(annotation);
      nextEventByAnnotation.set(annotation, event);
      annotationsToAdd.push(annotation);
    });

    const annotationsToRemove = [
      ...placeAnnotations.filter((ann) => !keptPlaceAnnotations.has(ann)),
      ...eventAnnotations.filter((ann) => !keptEventAnnotations.has(ann)),
    ];
    placeAnnotations = nextPlaceAnnotations;
    placeByAnnotation = nextPlaceByAnnotation;
    eventAnnotations = nextEventAnnotations;
    eventByAnnotation = nextEventByAnnotation;

    const origin = nextDevice || nextCenter;
    const nextOriginKey = next.showOrigin !== false && origin ? `${origin.lat}|${origin.lng}|${nextDevice ? "device" : "center"}` : "";
    if (nextOriginKey !== originKey) {
      annotationsToRemove.push(...originAnnotations);
      originAnnotations = [];
      originKey = nextOriginKey;
      if (nextOriginKey) {
        const annotation = withoutCallout(new mapkit.ImageAnnotation(coordinate(mapkit, origin), {
          title: nextDevice ? "Your location" : "Search center",
          ...applePinOptions(mapkit, nextDevice ? "location" : "event"),
          accessibilityLabel: nextDevice ? "Your location" : "Search center",
        }));
        originAnnotations.push(annotation);
        annotationsToAdd.push(annotation);
      }
    }

    const nextRingsKey = next.rings && origin && typeof mapkit.CircleOverlay === "function" ? `${origin.lat}|${origin.lng}` : "";
    let overlaysToRemove = [];
    let overlaysToAdd = [];
    if (nextRingsKey !== ringsKey) {
      annotationsToRemove.push(...ringLabels);
      overlaysToRemove = ringOverlays;
      ringLabels = [];
      ringOverlays = [];
      ringsKey = nextRingsKey;
      if (nextRingsKey) {
        ringOverlays = MAP_RING_MILES.map((miles) => {
          const overlay = new mapkit.CircleOverlay(coordinate(mapkit, origin), miles * MILES_TO_METERS);
          if (typeof mapkit.Style === "function") overlay.style = new mapkit.Style({
            strokeColor: "#F97316", strokeOpacity: 0.42, lineWidth: 1.5,
            fillColor: "#F97316", fillOpacity: 0.008,
          });
          overlay.__wayfindMiles = miles;
          return overlay;
        });
        overlaysToAdd = ringOverlays;
        if (typeof mapkit.Annotation === "function") {
          const cosLat = Math.max(0.2, Math.cos((origin.lat * Math.PI) / 180));
          const diag = Math.SQRT1_2;
          ringLabels = MAP_RING_MILES.map((miles) => {
            const neEdge = {
              lat: origin.lat + (miles / 69) * diag,
              lng: origin.lng + (miles / (69 * cosLat)) * diag,
            };
            return new mapkit.Annotation(coordinate(mapkit, neEdge), () => {
              const label = document.createElement("span");
              label.textContent = `${miles} mi`;
              label.style.cssText = "display:block;padding:1px 5px;border-radius:999px;background:rgba(15,23,42,.64);color:rgba(255,247,237,.92);font:700 10px/1.25 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:nowrap;box-shadow:0 1px 3px rgba(15,23,42,.2);pointer-events:none";
              return label;
            }, { accessibilityLabel: `${miles} mile distance ring`, enabled: false });
          });
          annotationsToAdd.push(...ringLabels);
        }
      }
    }

    // Diagnostic only, never a UI change. Same contract MapView.redraw() has
    // always published (and the synthetic monitor + surface-parity audit read):
    // the ids of every place pin this frame. Restored 2026-10-13: #1636 made
    // MapKit the default flat renderer and dropped the hook, so the live
    // parity check saw hasRyans:false on every Apple-rendered map.
    try {
      if (typeof window !== "undefined") {
        window.__wfMapPins = { ids: placeAnnotations.map((a) => a.__wayfindId), at: Date.now() };
      }
    } catch (e) {}

    removeMany(map, "removeAnnotations", "removeAnnotation", annotationsToRemove);
    removeMany(map, "removeOverlays", "removeOverlay", overlaysToRemove);
    addMany(map, "addAnnotations", "addAnnotation", annotationsToAdd);
    addMany(map, "addOverlays", "addOverlay", overlaysToAdd);

    const annotations = [...placeAnnotations, ...eventAnnotations, ...originAnnotations, ...ringLabels];
    const fitTargets = placeAnnotations.length ? placeAnnotations : [...annotations, ...ringOverlays];
    const nextFitKey = next.fit ? fitTargets.map((a) => a.__wayfindId || a.__wayfindEvent || "").join("|") : "";
    if (next.fit && fitTargets.length && nextFitKey !== lastFitKey && typeof map.showItems === "function") {
      lastFitKey = nextFitKey;
      fitSettle = "pending";
      fitOrigin = null;
      map.showItems(fitTargets, { animate: false, padding: new mapkit.Padding(64, 36, 92, 36) });
    } else if (!next.fit) {
      lastFitKey = "";
      fitSettle = null;
      fitOrigin = null;
    }
    } finally {
      syncingSelection = false;
    }
  };

  const focusOn = (point, id) => {
    if (dead) return;
    const target = finitePoint(point);
    if (!target) return;
    selectId(id);
    if (typeof map.setCenterAnimated === "function") map.setCenterAnimated(coordinate(mapkit, target), true);
    else map.center = coordinate(mapkit, target);
  };

  const selectId = (id) => {
    if (dead) return;
    const wanted = id == null ? null : String(id);
    syncingSelection = true;
    try {
      for (const annotation of placeAnnotations) {
        const isSelected = wanted != null && annotation.__wayfindId === wanted;
        if (annotation.selected !== isSelected) {
          annotation.selected = isSelected;
          annotation.image = applePinOptions(mapkit, annotation.__wayfindFamily, { selected: isSelected, score: annotation.__wayfindScore }).image;
        }
      }
    } finally {
      syncingSelection = false;
    }
  };

  update({ places, category, deviceLoc, center, events, selectedId, fit, rings, showOrigin });
  // MapKit establishes its final region during construction. Emit after this
  // turn as well as on settled region changes so the first area fetch is real.
  const initialViewportTimer = setTimeout(emitViewport, 0);

  const destroy = () => {
    if (dead) return;
    dead = true;
    clearTimeout(initialViewportTimer);
    if (typeof map.removeEventListener === "function") {
      map.removeEventListener("select", select);
      map.removeEventListener("region-change-end", emitViewport);
    }
    removeMany(map, "removeAnnotations", "removeAnnotation", [...placeAnnotations, ...eventAnnotations, ...originAnnotations, ...ringLabels]);
    removeMany(map, "removeOverlays", "removeOverlay", ringOverlays);
    if (typeof map.destroy === "function") map.destroy();
  };

  return { map, update, focusOn, selectId, emitViewport, destroy };
}
