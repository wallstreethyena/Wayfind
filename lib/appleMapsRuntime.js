import { isValidCoordinate, routeSummary, validateRouteInput } from "./appleEventRouting.js";
import { eventMapColor, eventMapGlyph } from "./eventMapPlaces.js";
import { appleMapsTokenUsable } from "./appleMapsToken.js";

// MapKit JS 6 loads only the services and full-map libraries this event surface
// uses. Apple calls the script callback after both initialization and library
// loading complete, so a map is never constructed from the core-only namespace.
const MAPKIT_SRC = "https://cdn.apple-mapkit.com/mk/6/mapkit.core.js";
const MAPKIT_LIBRARIES = ["services", "full-map"];
const MAPKIT_CALLBACK = "wayfindMapKitReady";
let mapkitPromise = null;

function cancelledError() {
  const error = new Error("The previous route request was cancelled.");
  error.name = "AbortError";
  return error;
}

export function loadAppleMapKit(token) {
  if (typeof window === "undefined") return Promise.reject(new Error("Apple Maps is browser-only"));
  // 2026-09-08: an expired token is refused HERE, before the script tag exists.
  // Loading MapKit with a dead token costs a CDN fetch, a 401 from Apple's
  // bootstrap, and the caller's full 12s watchdog before the reader sees the
  // fallback. lib/appleMapsToken.js reads the lifetime from the token itself.
  if (!appleMapsTokenUsable(token)) return Promise.reject(new Error("NEXT_PUBLIC_APPLE_MAPS_TOKEN is not configured or has expired"));
  if (window.mapkit && typeof window.mapkit.Map === "function") return Promise.resolve(window.mapkit);
  if (mapkitPromise) return mapkitPromise;

  mapkitPromise = new Promise((resolve, reject) => {
    let script = document.querySelector("script[data-wayfind-mapkit]");
    let timeout;
    const cleanUp = () => {
      clearTimeout(timeout);
      if (script) script.removeEventListener("error", onError);
      if (window[MAPKIT_CALLBACK] === onReady) delete window[MAPKIT_CALLBACK];
    };
    const fail = (error) => {
      cleanUp();
      if (script && script.parentNode) script.parentNode.removeChild(script);
      mapkitPromise = null;
      reject(error instanceof Error ? error : new Error("Apple Maps failed to load"));
    };
    const onError = () => fail(new Error("Apple Maps SDK failed to load"));
    const onReady = () => {
      try {
        if (!window.mapkit || typeof window.mapkit.Map !== "function") throw new Error("Apple Maps SDK did not load its required libraries");
        cleanUp();
        resolve(window.mapkit);
      } catch (error) { fail(error); }
    };

    window[MAPKIT_CALLBACK] = onReady;
    if (script) {
      script.addEventListener("error", onError, { once: true });
    } else {
      script = document.createElement("script");
      script.src = MAPKIT_SRC;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.dataset.wayfindMapkit = "1";
      script.dataset.callback = MAPKIT_CALLBACK;
      script.dataset.libraries = MAPKIT_LIBRARIES.join(",");
      script.dataset.token = token;
      script.addEventListener("error", onError, { once: true });
      document.head.appendChild(script);
    }
    timeout = setTimeout(() => fail(new Error("Apple Maps SDK did not finish loading")), 15000);
  });
  return mapkitPromise;
}

// Exposed only for deterministic tests; production code always shares one
// loading promise for the lifetime of the page.
export function resetAppleMapKitLoaderForTests() { mapkitPromise = null; }

function coordinate(mapkit, point) {
  return new mapkit.Coordinate(point.lat, point.lng);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function createAppleMapController({ mapkit, container, venue, picks = [], onSelect, onError, requestTimeoutMs = 15000 }) {
  if (!mapkit || typeof mapkit.Map !== "function") throw new Error("Apple Maps SDK is unavailable");
  const destination = { lat: Number(venue.lat), lng: Number(venue.lng) };
  const map = new mapkit.Map(container, { center: coordinate(mapkit, destination), showsMapTypeControl: false, isRotationEnabled: false, pitchEnabled: false });
  let dead = false;
  let requestId = 0;
  let routeOverlay = null;
  let pending = null;
  const timeoutMs = Number.isFinite(requestTimeoutMs) && requestTimeoutMs > 0 ? requestTimeoutMs : 15000;
  const annotations = new Map();
  const all = [];
  let pickAnnotations = [];
  const add = (point, options, id) => {
    const annotation = new mapkit.MarkerAnnotation(coordinate(mapkit, point), options);
    if (id) { annotation.__wayfindId = id; annotations.set(id, annotation); }
    all.push(annotation);
    return annotation;
  };
  const addPicks = (places) => {
    const seen = new Set();
    pickAnnotations = (Array.isArray(places) ? places : []).filter((p) => {
      const id = String(p?.id ?? "").trim();
      if (!id || seen.has(id) || !Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) return false;
      seen.add(id);
      return true;
    }).map((p) => add(p, {
      title: p.name,
      subtitle: p.mapKind === "stay" ? `Stay ${p.mapRank} · Hotel` : p.cat || "Nearby",
      color: eventMapColor(p),
      glyphColor: "#FFFFFF",
      glyphText: eventMapGlyph(p),
    }, String(p.id)));
  };
  addPicks(picks);
  add(destination, { title: venue.name, color: "#F97316", glyphText: "★" });
  map.addAnnotations ? map.addAnnotations(all) : all.forEach((annotation) => map.addAnnotation(annotation));
  if (typeof map.showItems === "function") map.showItems(all, { animate: !prefersReducedMotion(), padding: new mapkit.Padding(60, 25, 60, 25) });
  // Hotel data can stream after map creation. Update only place annotations,
  // preserving the venue, current route and driving controls.
  const setPicks = (places) => {
    if (dead) return;
    if (typeof map.removeAnnotations === "function") map.removeAnnotations(pickAnnotations);
    else pickAnnotations.forEach(a => map.removeAnnotation?.(a));
    for (const a of pickAnnotations) {
      annotations.delete(a.__wayfindId);
      const index = all.indexOf(a);
      if (index >= 0) all.splice(index, 1);
    }
    addPicks(places);
    map.addAnnotations ? map.addAnnotations(pickAnnotations) : pickAnnotations.forEach(a => map.addAnnotation(a));
    if (!routeOverlay && typeof map.showItems === "function") map.showItems(all, { animate: !prefersReducedMotion(), padding: new mapkit.Padding(60, 25, 60, 25) });
  };
  const select = (event) => {
    if (dead || !onSelect) return;
    const id = event && event.annotation && event.annotation.__wayfindId;
    onSelect(id || null);
  };
  if (typeof map.addEventListener === "function") map.addEventListener("select", select);

  const showError = (message) => { if (!dead && onError) onError(message); };
  const cancelPending = () => {
    requestId += 1;
    if (pending) {
      const current = pending;
      pending = null;
      current.cancel();
      current.reject(cancelledError());
    }
  };
  const clearRoute = () => {
    cancelPending();
    if (routeOverlay && typeof map.removeOverlay === "function") map.removeOverlay(routeOverlay);
    routeOverlay = null;
  };
  const applyRoute = (route) => {
    if (route.polyline && mapkit.Style) {
      route.polyline.style = new mapkit.Style({ lineWidth: 5, strokeColor: "#0F9F8A", strokeOpacity: 0.95, lineCap: "round", lineJoin: "round" });
    }
    if (typeof map.addOverlay === "function") map.addOverlay(route.polyline);
    routeOverlay = route.polyline;
    if (typeof map.showItems === "function") map.showItems([...all, route.polyline], { animate: !prefersReducedMotion(), padding: new mapkit.Padding(60, 25, 60, 25) });
    else if (typeof map.setVisibleMapRectAnimated === "function" && route.polyline.boundingMapRect) map.setVisibleMapRectAnimated(route.polyline.boundingMapRect, !prefersReducedMotion());
  };
  const routeFromCoordinate = (origin) => {
    const checked = validateRouteInput(origin, destination);
    if (!checked.ok) return Promise.reject(new Error(checked.reason === "destination" ? "The venue location is unavailable." : "Enter a starting point."));
    if (!isValidCoordinate(checked.origin)) return Promise.reject(new Error("A map location is required to calculate the route."));
    if (typeof mapkit.Directions !== "function" || !mapkit.Directions.Transport || !mapkit.Directions.Transport.Automobile) return Promise.reject(new Error("Apple driving directions are unavailable."));
    clearRoute();
    const current = requestId;
    return new Promise((resolve, reject) => {
      let directions;
      let routeRequest;
      let timeout;
      const cancel = () => {
        clearTimeout(timeout);
        if (directions && routeRequest && typeof directions.cancel === "function") directions.cancel(routeRequest);
      };
      pending = { id: current, reject, cancel };
      const finishError = (error) => {
        if (dead || current !== requestId || !pending || pending.id !== current) return;
        pending = null;
        cancel();
        const message = error instanceof Error ? error : new Error("Apple could not calculate a driving route.");
        showError(message.message);
        reject(message);
      };
      try {
        directions = new mapkit.Directions();
        routeRequest = directions.route({ origin: coordinate(mapkit, checked.origin), destination: coordinate(mapkit, destination), transportType: mapkit.Directions.Transport.Automobile });
        timeout = setTimeout(() => finishError(new Error("Apple driving directions timed out. Try again.")), timeoutMs);
        Promise.resolve(routeRequest).then((response) => {
          if (dead || current !== requestId || !pending || pending.id !== current) return;
          const route = response && response.routes && response.routes[0];
          const summary = routeSummary(route);
          if (!summary) { finishError(new Error("Apple did not return a usable driving route.")); return; }
          pending = null;
          clearTimeout(timeout);
          applyRoute(route);
          resolve({ ...summary, route });
        }, () => finishError(new Error("Apple could not calculate a driving route.")));
      } catch (error) { finishError(error); }
    });
  };
  const searchAndRoute = (query) => {
    const text = typeof query === "string" ? query.trim() : "";
    if (!text || text.length > 200) return Promise.reject(new Error("Enter a starting point."));
    if (typeof mapkit.Search !== "function") return Promise.reject(new Error("Apple location search is unavailable."));
    clearRoute();
    const current = requestId;
    return new Promise((resolve, reject) => {
      let search;
      let searchRequest;
      let timeout;
      const cancel = () => {
        clearTimeout(timeout);
        if (search && searchRequest && typeof search.cancel === "function") search.cancel(searchRequest);
      };
      pending = { id: current, reject, cancel };
      const fail = (message) => {
        if (dead || current !== requestId || !pending || pending.id !== current) return;
        pending = null;
        cancel();
        const error = new Error(message);
        showError(message);
        reject(error);
      };
      try {
        search = new mapkit.Search();
        searchRequest = search.search(text);
        timeout = setTimeout(() => fail("Apple location search timed out. Try again."), timeoutMs);
        Promise.resolve(searchRequest).then((data) => {
          if (dead || current !== requestId || !pending || pending.id !== current) return;
          if (!data || !Array.isArray(data.places) || !data.places[0] || !data.places[0].coordinate) { fail("Apple could not find that starting point."); return; }
          pending = null;
          clearTimeout(timeout);
          const point = data.places[0].coordinate;
          routeFromCoordinate({ lat: Number(point.latitude), lng: Number(point.longitude) }).then(resolve, reject);
        }, () => fail("Apple could not find that starting point."));
      } catch (error) { fail(error && error.message ? error.message : "Apple location search is unavailable."); }
    });
  };
  const destroy = () => {
    if (dead) return;
    dead = true;
    cancelPending();
    if (typeof map.removeEventListener === "function") map.removeEventListener("select", select);
    if (routeOverlay && typeof map.removeOverlay === "function") map.removeOverlay(routeOverlay);
    if (typeof map.removeAnnotations === "function") map.removeAnnotations(all);
    if (typeof map.destroy === "function") map.destroy();
  };
  return { map, setPicks, routeFromCoordinate, searchAndRoute, clearRoute, destroy };
}
