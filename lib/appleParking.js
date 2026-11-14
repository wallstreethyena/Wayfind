// MapKit JS 6 uses search(options): Promise<PointsOfInterestSearchResponse>.
// https://developer.apple.com/documentation/mapkitjs/pointsofinterestsearch/search
// https://developer.apple.com/documentation/mapkitjs/pointofinterestfilter/including
// Results are kept only in this venue-scoped instance, never in persistent storage.
const INITIAL_RADIUS_METERS = 804.672;
const EXPANDED_RADIUS_METERS = 1609.344;
import { mapFailureReason } from "./mapDiagnostics.js";

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

// Frame parking from coordinates, independent of asynchronously sized image
// annotations and any camera animation left over from the ordinary place map.
export function parkingMapRegion(venue, parking = []) {
  const center = coordinate(venue);
  if (!center) return null;
  const points = parking.map(coordinate).filter(Boolean);
  if (!points.length) return { center, latitudeDelta: 0.018, longitudeDelta: 0.018 };
  let south = center.lat, north = center.lat, west = 0, east = 0;
  for (const point of points) {
    south = Math.min(south, point.lat); north = Math.max(north, point.lat);
    const offset = ((point.lng - center.lng + 540) % 360) - 180;
    west = Math.min(west, offset); east = Math.max(east, offset);
  }
  const latitudeDelta = Math.min(180, Math.max(0.008, (north - south) * 1.6));
  const longitudeDelta = Math.min(360, Math.max(0.008, (east - west) * 1.6));
  return { center: {
    lat: Math.max(-90 + latitudeDelta / 2, Math.min(90 - latitudeDelta / 2, (north + south) / 2)),
    lng: ((center.lng + (east + west) / 2 + 540) % 360) - 180,
  }, latitudeDelta, longitudeDelta };
}

export function parkingDirectionsUrl(parking, venue, mode = "drive") {
  const destination = coordinate(mode === "walk" ? venue : parking);
  const start = mode === "walk" ? coordinate(parking) : null;
  if (!destination || (mode === "walk" && !start) || !["drive", "walk"].includes(mode)) return "";
  const query = new URLSearchParams({ daddr: `${destination.lat},${destination.lng}`, dirflg: mode === "walk" ? "w" : "d" });
  if (start) query.set("saddr", `${start.lat},${start.lng}`);
  return `https://maps.apple.com/?${query}`;
}

// These links remain usable without the embedded SDK or a location permission.
// A facility pin is a location, not a promise about its public entrance.
export function parkingMapsUrl(place, searchNearby = false) {
  const point = coordinate(place);
  if (!point) return "";
  const query = new URLSearchParams({
    ll: `${point.lat},${point.lng}`,
    q: searchNearby ? "parking" : String(place.name || "Parking"),
  });
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
    // The request is filtered, but a provider reply must not turn a restaurant
    // or address into a parking recommendation. Missing category is allowed
    // for older MapKit responses that still honor the request's Parking filter.
    if (place.pointOfInterestCategory && place.pointOfInterestCategory !== "Parking") continue;
    const distance = distanceMeters(center, point);
    if (distance > radiusMeters) continue;
    const sourceId = typeof place.id === "string" || typeof place.id === "number" ? String(place.id).trim() : "";
    places.push({
      id: sourceId || `parking:${name.toLowerCase()}:${point.lat},${point.lng}`,
      name, ...point, distanceMeters: distance, mapKind: "parking",
      ...(typeof place.formattedAddress === "string" && place.formattedAddress.trim()
        ? { address: place.formattedAddress.trim().slice(0, 300) } : {}),
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

const RESTRICTED_LOT_RX = /\b(cast|cast\s+member|employee|employees|staff|crew|team\s+member|backstage|permit|permits\s+only|resident|residents\s+only|tenant|tenants\s+only|hoa|private|authorized\s+only|official\s+use|police|fire\s+dept|maintenance|service\s+lot|loading|delivery|fleet|commercial|bus\s+only|bus\s+lot|rideshare\s+staging|cell\s+phone\s+lot|valet\s+storage)\b/i;
const HOTEL_RESORT_RX = /\b(resort|hotel|inn|suites|lodge|villas)\b/i;
const THEME_PARK_RX = /\b(magic kingdom|epcot|hollywood studios|animal kingdom|universal studios|islands of adventure|epic universe|busch gardens|seaworld|legoland)\b/i;
const PUBLIC_SIGNAL_RX = /\b(public\s+(?:parking|garage|lot|deck)|municipal|city\s+(?:parking|garage|lot|deck)|county\s+(?:parking|garage|lot)|state\s+park\s+parking|downtown\s+public|visitor\s+(?:parking|garage|lot)|visitors?\s+lot|beach\s+(?:access\s+)?parking|metered\s+parking|public\s+pay\s+lot|ticket and transportation)\b/i;

export function classifyParkingAccess(lot, venue = null) {
  if (!lot || typeof lot.name !== "string") return { accessStatus: "unknown_access", accessReason: "missing_lot_name" };
  const name = lot.name.trim();
  const nameLower = name.toLowerCase();
  const address = typeof lot.address === "string" ? lot.address.trim().toLowerCase() : "";
  const combinedHaystack = `${nameLower} ${address}`;

  // 1. Explicit restricted matches (including address check)
  if (RESTRICTED_LOT_RX.test(combinedHaystack)) {
    return { accessStatus: "restricted", accessReason: "restricted_keyword" };
  }

  // 2. Hotel / Resort guest restriction mismatch for ALL venues (unless explicitly public)
  if (HOTEL_RESORT_RX.test(nameLower)) {
    let isSameResort = false;
    if (venue && typeof venue.name === "string") {
      const venueNameLower = venue.name.toLowerCase();
      const cleanedLotName = nameLower.replace(/\b(parking|garage|lot|resort|hotel|inn|suites|lodge|villas)\b/gi, "").trim();
      const cleanedVenueName = venueNameLower.replace(/\b(resort|hotel|park|attraction|center|museum|beach)\b/gi, "").trim();
      if (cleanedLotName.length >= 3 && cleanedVenueName.length >= 3) {
        isSameResort = venueNameLower.includes(cleanedLotName) || nameLower.includes(cleanedVenueName);
      }
    }
    const isExplicitPublic = PUBLIC_SIGNAL_RX.test(nameLower);
    if (!isSameResort && !isExplicitPublic) {
      return { accessStatus: "restricted", accessReason: "resort_or_hotel_guests_only" };
    }
  }

  // 3. Theme park backstage / perimeter trap when venue is a gated theme park
  if (venue && typeof venue.name === "string" && THEME_PARK_RX.test(venue.name.toLowerCase())) {
    const isThemeParkVisitorLot = /\b(ticket and transportation|theme park parking|universal boulevard garage|visitor parking|guest parking|main parking)\b/i.test(nameLower);
    if (!isThemeParkVisitorLot && !PUBLIC_SIGNAL_RX.test(nameLower)) {
      if (/\b(cast|staff|employee|backstage|resort|hotel)\b/i.test(combinedHaystack)) {
        return { accessStatus: "restricted", accessReason: "restricted_theme_park_perimeter" };
      }
      return { accessStatus: "unknown_access", accessReason: "theme_park_perimeter_unverified" };
    }
  }

  // 4. Public verified criteria
  const distance = Number(lot.distanceMeters);
  const validDistance = !Number.isFinite(distance) || distance <= 900;
  if (validDistance) {
    if (PUBLIC_SIGNAL_RX.test(nameLower)) {
      return { accessStatus: "public_verified", accessReason: "explicit_public_signal" };
    }
    if (venue && typeof venue.name === "string" && venue.name.trim().length >= 4) {
      const venueBase = venue.name.toLowerCase().replace(/\b(park|resort|hotel|attraction|center|museum|beach)\b/g, "").trim();
      if (venueBase.length >= 3 && nameLower.includes(venueBase) && /\b(parking|garage|lot)\b/i.test(nameLower)) {
        return { accessStatus: "public_verified", accessReason: "destination_matching_public_lot" };
      }
    }
  }

  return { accessStatus: "unknown_access", accessReason: "insufficient_public_evidence" };
}



export function createParkingSearch({ mapkit, venue, requestTimeoutMs = 10000, providerTimeoutMs = 4000, onDiagnostic = () => {} }) {
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
    if (!mapkit || typeof mapkit.Coordinate !== "function" || typeof mapkit.PointOfInterestFilter?.including !== "function"
      || !mapkit.PointOfInterestCategory?.Parking || typeof AbortController !== "function") {
      return Promise.reject(parkingError("ParkingUnsupportedError", "PARKING_UNSUPPORTED", "Apple Maps parking search is unavailable."));
    }
    if (!Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
      return Promise.reject(parkingError("ParkingTimeoutError", "PARKING_TIMEOUT", "Parking search needs a positive request deadline."));
    }

    const attempt = { controller: new AbortController(), poiController: new AbortController(), promise: null, finish: null, fallbackReason: null };
    const cancelPoi = () => attempt.poiController.abort();
    attempt.controller.signal.addEventListener("abort", cancelPoi, { once: true });
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
        attempt.controller.signal.removeEventListener("abort", cancelPoi);
        if (pending === attempt) pending = null;
        // A rejected POI request is not yet a failed parking operation. Report
        // recovery only after the fallback returns a complete valid response;
        // aborted/superseded work makes no claim about provider health.
        if (attempt.fallbackReason && error?.name !== "AbortError") {
          try { onDiagnostic({ provider: "points-of-interest", reason: attempt.fallbackReason, outcome: error ? "failed" : "recovered" }); } catch {}
        }
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
        let provider = null;
        let useTextSearch = typeof mapkit.PointsOfInterestSearch !== "function";
        const textSearchAvailable = typeof mapkit.Search === "function" && typeof mapkit.CoordinateRegion === "function" && typeof mapkit.CoordinateSpan === "function";
        const options = {
          center: new mapkit.Coordinate(center.lat, center.lng),
          pointOfInterestFilter: mapkit.PointOfInterestFilter.including([mapkit.PointOfInterestCategory.Parking]),
          signal: attempt.controller.signal,
        };
        const textSearch = async (radiusMeters) => {
          const latitudeDelta = radiusMeters / 111195.08 * 2;
          const longitudeDelta = latitudeDelta / Math.max(0.01, Math.cos(center.lat * Math.PI / 180));
          const region = new mapkit.CoordinateRegion(options.center, new mapkit.CoordinateSpan(latitudeDelta, longitudeDelta));
          return new mapkit.Search({ region }).search("parking", {
            pointOfInterestFilter: options.pointOfInterestFilter, signal: options.signal,
            region, regionPriority: mapkit.RegionPriority?.Required || "required",
            includeAddresses: false, includePointsOfInterest: true,
          });
        };
        let places = [];
        for (const radiusMeters of [INITIAL_RADIUS_METERS, EXPANDED_RADIUS_METERS]) {
          let response;
          if (!useTextSearch) {
            try {
              provider ||= new mapkit.PointsOfInterestSearch();
              // MapKit serializes radius verbatim. The rejected production
              // nearbyPoi request carried radius=804.672. Send whole meters
              // while preserving the exact half/one-mile circle in the result
              // filter below; rounding up cannot omit a boundary location.
              const request = provider.search({ ...options, radius: Math.ceil(radiusMeters), signal: attempt.poiController.signal });
              if (!request || typeof request.then !== "function") throw parkingError("ParkingUnsupportedError", "PARKING_UNSUPPORTED", "Apple POI promise API unavailable");
              let providerTimer;
              let rejectOnAbort;
              try {
                const cancelled = new Promise((_, reject) => {
                  rejectOnAbort = () => reject(attempt.poiController.signal.reason || abortError());
                  attempt.poiController.signal.addEventListener("abort", rejectOnAbort, { once: true });
                });
                const deadline = new Promise((_, reject) => {
                  providerTimer = setTimeout(() => {
                    const error = parkingError("ParkingTimeoutError", "PARKING_POI_TIMEOUT", "Apple POI search timed out.");
                    attempt.poiController.abort(error);
                    reject(error);
                  }, Math.min(requestTimeoutMs, Math.max(1, Number(providerTimeoutMs) || 4000)));
                });
                response = await Promise.race([request, deadline, cancelled]);
              } finally {
                clearTimeout(providerTimer);
                attempt.poiController.signal.removeEventListener("abort", rejectOnAbort);
              }
              // A malformed provider reply is a provider failure, never an
              // authoritative empty answer. The independent search may recover.
              normalizeResponse(response, center, radiusMeters);
            } catch (error) {
              if (!isCurrent()) return;
              if (!textSearchAvailable) throw error;
              useTextSearch = true;
              attempt.fallbackReason = mapFailureReason(error);
            }
          }
          if (useTextSearch) {
            if (!textSearchAvailable) {
              throw parkingError("ParkingUnsupportedError", "PARKING_UNSUPPORTED", "Apple Maps parking search is unavailable.");
            }
            // The general Apple search service is a separate supported path.
            // Retain the parking-only filter and enforce the exact circle below;
            // an unfiltered business search is never a substitute for parking.
            response = await textSearch(radiusMeters);
          }
          if (!isCurrent()) return;
          places = closestUnique([...places, ...normalizeResponse(response, center, radiusMeters)]);
          // Some venues have no POI listings but do have general Search hits.
          // Check the independent path before claiming no nearby listings. Two
          // POI requests plus this final lookup retain the three-call budget.
          if (!places.length && radiusMeters === EXPANDED_RADIUS_METERS && !useTextSearch && textSearchAvailable) {
            const recovered = await textSearch(radiusMeters);
            if (!isCurrent()) return;
            places = closestUnique(normalizeResponse(recovered, center, radiusMeters));
          }
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
