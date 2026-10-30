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
      // When rings are enabled, frame the 20-mile outer ring; otherwise open at
      // a clean metro/neighborhood span so pins are legible without over-clustering.
      rings ? new mapkit.CoordinateSpan(0.72, 0.84) : new mapkit.CoordinateSpan(0.24, 0.28),
    );
  }
  const map = new mapkit.Map(container, options);
  const clusterMembers = new WeakMap();
  // Custom cluster annotation replaces Apple's default pink balloon circle with
  // a cohesive dark-obsidian + orange Wayfind count badge.
  map.annotationForCluster = (cluster) => {
    const members = (cluster && Array.isArray(cluster.memberAnnotations)) ? cluster.memberAnnotations : [];
    if (!members.length || typeof mapkit.ImageAnnotation !== "function") return null;
    const count = members.length;
    const clusterAnn = new mapkit.ImageAnnotation(cluster.coordinate, {
      title: `${count} places`,
      subtitle: "Tap to zoom in",
      image: { 1: appleClusterPinUrl(count) },
      accessibilityLabel: `${count} places clustered here`,
    });
    clusterMembers.set(clusterAnn, members);
    return clusterAnn;
  };
  // Keep Apple's own attribution and controls out from under Wayfind's header,
  // floating control stack, collapsed results drawer, and bottom navigation.
  // `padding` is MapKit's supported content-inset API; attribution stays native.
  if (typeof mapkit.Padding === "function") map.padding = new mapkit.Padding(MAP_SAFE_PADDING.top, MAP_SAFE_PADDING.right, MAP_SAFE_PADDING.bottom, MAP_SAFE_PADDING.left);
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

  const emitViewport = () => {
    if (dead) return;
    const region = map.region;
    const c = region && region.center;
    const current = c ? { lat: Number(c.latitude), lng: Number(c.longitude) } : null;
    const bounds = appleMapBounds(map);
    if (bounds && onViewportChange) onViewportChange(bounds);
    if (current && Number.isFinite(current.lat) && Number.isFinite(current.lng) && onAreaChange) {
      onAreaChange(areaMoved(searchOrigin, current) ? { ...current, bounds } : null);
    }
  };

  const select = (event) => {
    if (dead) return;
    const annotation = event && event.annotation;
    const cluster = annotation && (annotation.memberAnnotations || clusterMembers.get(annotation));
    if (placeByAnnotation.has(annotation)) onSelect && onSelect(placeByAnnotation.get(annotation));
    else if (eventByAnnotation.has(annotation)) onSelectEvent && onSelectEvent(eventByAnnotation.get(annotation));
    else if (Array.isArray(cluster) && cluster.length) {
      const members = cluster;
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
    const prevPlaceById = new Map();
    for (const ann of placeAnnotations) {
      if (ann && ann.__wayfindId) prevPlaceById.set(ann.__wayfindId, ann);
    }
    removeMany(map, "removeAnnotations", "removeAnnotation", [...eventAnnotations, ...originAnnotations, ...ringLabels]);
    removeMany(map, "removeOverlays", "removeOverlay", ringOverlays);
    eventAnnotations = [];
    originAnnotations = [];
    ringLabels = [];
    ringOverlays = [];
    placeByAnnotation = new Map();
    eventByAnnotation = new Map();

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

    const nextPlaceAnnotations = [];
    const addedPlaceAnnotations = [];
    const keptIds = new Set();
    const retainedAnnotations = new Set();

    // Do not cap results here. The area endpoint and category filter own the
    // result set; MapKit clusters the complete matching set in the viewport.
    nextPlaces.forEach((place, index) => {
      const point = finitePoint(place);
      if (!point) return;
      const id = String(place.id || `apple-place-${index}`);
      if (keptIds.has(id)) return;
      keptIds.add(id);
      // The list/card and its pin must show the same governed score. Keep raw
      // wfScore as the fallback for callers that have not stamped the shared
      // lawful-order value yet; both inputs remain on the stored 0-100 scale.
      const score = toDisplayScore(Number.isFinite(place.governed_score) ? place.governed_score : place.wfScore);
      const scoreText = score == null ? null : formatScore(score);
      const type = place.primaryType || place.primary_type;
      const placeCategory = place.category || nextCategory;
      const family = eventMapFamily(place, placeCategory);
      const isSelected = nextSelectedId === id;
      const sig = `${point.lat}|${point.lng}|${family}|${scoreText || ""}`;
      const title = place.name || "Place";
      const subtitle = `${score == null ? `#${index + 1}` : `Wayfind ${scoreText}/10`}${type ? ` · ${String(type).replaceAll("_", " ")}` : ""}`;
      const accessibilityLabel = `${title}${score == null ? "" : `, Wayfind score ${scoreText} out of 10`}`;
      const existing = prevPlaceById.get(id);
      if (existing && existing.__wayfindSig === sig) {
        retainedAnnotations.add(existing);
        existing.title = title;
        existing.subtitle = subtitle;
        existing.accessibilityLabel = accessibilityLabel;
        if (existing.selected !== isSelected) {
          existing.selected = isSelected;
          existing.image = applePinOptions(mapkit, family, { selected: isSelected }).image;
        }
        nextPlaceAnnotations.push(existing);
        placeByAnnotation.set(existing, place);
        return;
      }
      const annotation = new mapkit.ImageAnnotation(coordinate(mapkit, point), {
        title,
        subtitle,
        ...applePinOptions(mapkit, family, { selected: isSelected }),
        clusteringIdentifier: "wayfind-places",
        displayPriority: score != null ? Math.min(1000, Math.max(500, Math.round(score * 100))) : 750,
        accessibilityLabel,
      });
      annotation.__wayfindId = id;
      annotation.__wayfindFamily = family;
      annotation.__wayfindScore = scoreText;
      annotation.__wayfindSig = sig;
      annotation.selected = isSelected;
      nextPlaceAnnotations.push(annotation);
      addedPlaceAnnotations.push(annotation);
      placeByAnnotation.set(annotation, place);
    });

    // A changed location/score can keep its ID but require a new annotation.
    // Retain native objects, not IDs, so replacements remove their old marker.
    const stalePlaceAnnotations = placeAnnotations.filter((ann) => !retainedAnnotations.has(ann));
    if (stalePlaceAnnotations.length) {
      removeMany(map, "removeAnnotations", "removeAnnotation", stalePlaceAnnotations);
    }
    placeAnnotations = nextPlaceAnnotations;

    nextEvents.forEach((event, index) => {
      const point = finitePoint(event);
      if (!point) return;
      const annotation = new mapkit.ImageAnnotation(coordinate(mapkit, point), {
        title: event.venue || event.name || "Event",
        subtitle: event.name || "Event",
        ...applePinOptions(mapkit, "event"),
        clusteringIdentifier: "wayfind-events",
      });
      annotation.__wayfindEvent = String(event.id || `apple-event-${index}`);
      eventAnnotations.push(annotation);
      eventByAnnotation.set(annotation, event);
    });

    const origin = nextDevice || nextCenter;
    if (next.showOrigin !== false && origin) {
      const annotation = new mapkit.ImageAnnotation(coordinate(mapkit, origin), {
        title: nextDevice ? "Your location" : "Search center",
        ...applePinOptions(mapkit, nextDevice ? "location" : "event"),
      });
      originAnnotations.push(annotation);
    }

    if (next.rings && origin && typeof mapkit.CircleOverlay === "function") {
      ringOverlays = MAP_RING_MILES.map((miles) => {
        const overlay = new mapkit.CircleOverlay(coordinate(mapkit, origin), miles * MILES_TO_METERS);
        if (typeof mapkit.Style === "function") overlay.style = new mapkit.Style({
          strokeColor: "#F97316", strokeOpacity: 0.72, lineWidth: 2,
          fillColor: "#F97316", fillOpacity: 0.025,
        });
        overlay.__wayfindMiles = miles;
        return overlay;
      });
      if (typeof mapkit.Annotation === "function") {
        ringLabels = MAP_RING_MILES.map((miles) => {
          const northEdge = { lat: origin.lat + miles / 69, lng: origin.lng };
          return new mapkit.Annotation(coordinate(mapkit, northEdge), () => {
            const label = document.createElement("span");
            label.textContent = `${miles} mi`;
            label.style.cssText = "display:block;padding:2px 6px;border-radius:999px;background:rgba(15,23,42,.82);color:#FFF7ED;font:700 11px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;white-space:nowrap;box-shadow:0 1px 4px rgba(15,23,42,.25);pointer-events:none";
            return label;
          }, { accessibilityLabel: `${miles} mile distance ring` });
        });
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

    const annotationsToAdd = [...addedPlaceAnnotations, ...eventAnnotations, ...originAnnotations, ...ringLabels];
    addMany(map, "addAnnotations", "addAnnotation", annotationsToAdd);
    addMany(map, "addOverlays", "addOverlay", ringOverlays);
    const allAnnotations = [...placeAnnotations, ...eventAnnotations, ...originAnnotations, ...ringLabels];
    if (next.fit && allAnnotations.length && typeof map.showItems === "function") {
      map.showItems([...allAnnotations, ...ringOverlays], { animate: false, padding: new mapkit.Padding(64, 36, 92, 36) });
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
    for (const annotation of placeAnnotations) {
      annotation.selected = wanted != null && annotation.__wayfindId === wanted;
      annotation.image = applePinOptions(mapkit, annotation.__wayfindFamily, { selected: annotation.selected }).image;
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
