// MapKit JS 6 uses search(options): Promise<PointsOfInterestSearchResponse>.
// https://developer.apple.com/documentation/mapkitjs/pointsofinterestsearch/search
// https://developer.apple.com/documentation/mapkitjs/pointofinterestfilter/including
// Results are kept only in this venue-scoped instance, never in persistent storage.
const INITIAL_RADIUS_METERS = 804.672;
const EXPANDED_RADIUS_METERS = 1609.344;

function coordinate(point) {
  const source = point?.coordinate || point;
  if (!source || typeof source !== "object") return null;
  const lat = source.lat ?? source.latitude;
  const lng = source.lng ?? source.longitude;
  const isNumeric = (value) => (typeof value === "number" || typeof value === "string")
    && String(value).trim() !== "" && Number.isFinite(Number(value));
  if (!isNumeric(lat) || !isNumeric(lng)) return null;
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || (latitude === 0 && longitude === 0)) return null;
  return { lat: latitude, lng: longitude };
}

export function hasParkingCoordinate(point) {
  return coordinate(point) !== null;
}

export function parkingDirectionsUrl(parking, venue, mode = "drive") {
  const destination = coordinate(mode === "walk" ? venue : parking);
  const start = mode === "walk" ? coordinate(parking) : null;
  if (!destination || (mode === "walk" && !start) || !["drive", "walk"].includes(mode)) return "";
  const query = new URLSearchParams({ daddr: `${destination.lat},${destination.lng}`, dirflg: mode === "walk" ? "w" : "d" });
  if (start) query.set("saddr", `${start.lat},${start.lng}`);
  return `https://maps.apple.com/?${query}`;
}

function parkingError(name, code, message, cause) {
  const error = new Error(message);
  error.name = name;
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function abortError() {
  return parkingError("AbortError", "PARKING_ABORTED", "Parking search canceled.");
}

function distanceMeters(a, b) {
  const radians = (value) => value * Math.PI / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function normalizeResponse(response, center, radiusMeters) {
  if (!response || !Array.isArray(response.places)) {
    throw parkingError("ParkingProviderError", "PARKING_MALFORMED", "Apple Maps returned an invalid parking response.");
  }
  let validCount = 0;
  const places = [];
  for (const place of response.places) {
    const point = coordinate(place);
    const name = typeof place?.name === "string" ? place.name.trim() : "";
    if (!point || !name) continue;
    validCount += 1;
    const distance = distanceMeters(center, point);
    if (distance > radiusMeters) continue;
    const sourceId = typeof place.id === "string" || typeof place.id === "number" ? String(place.id).trim() : "";
    places.push({
      id: sourceId || `parking:${name.toLowerCase()}:${point.lat},${point.lng}`,
      name, ...point, distanceMeters: distance, mapKind: "parking",
    });
  }
  if (response.places.length && !validCount) {
    throw parkingError("ParkingProviderError", "PARKING_MALFORMED", "Apple Maps returned parking results without usable names or coordinates.");
  }
  return places;
}

function closestUnique(places) {
  const ids = new Set();
  const locations = new Set();
  return places.slice().sort((a, b) => a.distanceMeters - b.distanceMeters).filter((place) => {
    const location = `${place.name.toLowerCase()}:${place.lat.toFixed(6)},${place.lng.toFixed(6)}`;
    if (ids.has(place.id) || locations.has(location)) return false;
    ids.add(place.id);
    locations.add(location);
    return true;
  }).slice(0, 5);
}

export function createParkingSearch({ mapkit, venue, requestTimeoutMs = 10000 }) {
  // Snapshot the venue so a caller cannot move a running search to another venue.
  const center = coordinate(venue);
  let pending = null;
  let cached = null;
  let destroyed = false;

  function cancel() {
    if (!pending) return;
    const attempt = pending;
    pending = null;
    attempt.controller.abort();
    attempt.finish(abortError());
  }

  function search() {
    if (destroyed) return Promise.reject(abortError());
    if (cached) return Promise.resolve(cached);
    if (pending) return pending.promise;
    if (!center) return Promise.reject(parkingError("ParkingCoordinateError", "PARKING_COORDINATE", "Parking search needs valid venue coordinates."));
    if (!mapkit || typeof mapkit.PointsOfInterestSearch !== "function"
      || typeof mapkit.Coordinate !== "function" || typeof mapkit.PointOfInterestFilter?.including !== "function"
      || !mapkit.PointOfInterestCategory?.Parking || typeof AbortController !== "function") {
      return Promise.reject(parkingError("ParkingUnsupportedError", "PARKING_UNSUPPORTED", "Apple Maps parking search is unavailable."));
    }
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
      return Promise.reject(parkingError("ParkingTimeoutError", "PARKING_TIMEOUT", "Parking search needs a positive request deadline."));
    }

    const attempt = { controller: new AbortController(), promise: null, finish: null };
    attempt.promise = new Promise((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        attempt.controller.abort();
        attempt.finish(parkingError("ParkingTimeoutError", "PARKING_TIMEOUT", "Apple Maps parking search timed out."));
      }, requestTimeoutMs);
      attempt.finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (pending === attempt) pending = null;
        if (error) reject(error);
        else { cached = result; resolve(result); }
      };
    });
    pending = attempt;

    // Starting on the next microtask makes pending deduplication deterministic,
    // including when a provider throws synchronously.
    Promise.resolve().then(async () => {
      const isCurrent = () => pending === attempt && !attempt.controller.signal.aborted && !destroyed;
      if (!isCurrent()) return;
      try {
        const provider = new mapkit.PointsOfInterestSearch();
        if (typeof provider.search !== "function") {
          throw parkingError("ParkingUnsupportedError", "PARKING_UNSUPPORTED", "Apple Maps parking search is unavailable.");
        }
        const options = {
          center: new mapkit.Coordinate(center.lat, center.lng),
          pointOfInterestFilter: mapkit.PointOfInterestFilter.including([mapkit.PointOfInterestCategory.Parking]),
          signal: attempt.controller.signal,
        };
        let places = [];
        for (const radiusMeters of [INITIAL_RADIUS_METERS, EXPANDED_RADIUS_METERS]) {
          const request = provider.search({ ...options, radius: radiusMeters });
          if (!request || typeof request.then !== "function") {
            throw parkingError("ParkingUnsupportedError", "PARKING_UNSUPPORTED", "Apple Maps parking search requires the MapKit JS promise API.");
          }
          const response = await request;
          if (!isCurrent()) return;
          places = closestUnique([...places, ...normalizeResponse(response, center, radiusMeters)]);
          if (places.length >= 3 || radiusMeters === EXPANDED_RADIUS_METERS) {
            const result = Object.freeze({ places: Object.freeze(places.map((place) => Object.freeze(place))), radiusMeters });
            attempt.finish(null, result);
            return;
          }
        }
      } catch (error) {
        if (!isCurrent()) return;
        attempt.finish(error?.code?.startsWith?.("PARKING_") || error?.name === "AbortError" ? error
          : parkingError("ParkingProviderError", "PARKING_PROVIDER", "Apple Maps could not load nearby parking.", error));
      }
    });
    return attempt.promise;
  }

  return {
    search,
    cancel,
    destroy() { destroyed = true; cancel(); cached = null; },
  };
}
