// Pure validation and presentation helpers for event routes. Keep provider
// objects out of this module so the same route summary can be used by web UI
// and a future native bridge without implying that this JS UI is reusable in
// Swift.

export const MAX_STARTING_POINT_LENGTH = 200;

export function isValidCoordinate(point) {
  return !!point
    && Number.isFinite(Number(point.lat))
    && Number.isFinite(Number(point.lng))
    && Math.abs(Number(point.lat)) <= 90
    && Math.abs(Number(point.lng)) <= 180
    && !(Number(point.lat) === 0 && Number(point.lng) === 0);
}

export function normalizeStartingPoint(value) {
  if (isValidCoordinate(value)) return { lat: Number(value.lat), lng: Number(value.lng) };
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length > 0 && text.length <= MAX_STARTING_POINT_LENGTH ? text : "";
}

export function validateRouteInput(origin, destination) {
  const start = normalizeStartingPoint(origin);
  if (!start) return { ok: false, reason: "starting-point" };
  if (!isValidCoordinate(destination)) return { ok: false, reason: "destination" };
  return { ok: true, origin: start, destination: { lat: Number(destination.lat), lng: Number(destination.lng) } };
}

export function formatDistance(meters) {
  if (!Number.isFinite(Number(meters)) || Number(meters) < 0) return "";
  const miles = Number(meters) / 1609.344;
  if (miles < 0.1) return "Less than 0.1 mi";
  return `${miles.toFixed(1)} mi`;
}

export function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return "";
  const minutes = Math.round(Number(seconds) / 60);
  if (minutes < 1) return "Less than 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function routeSummary(route) {
  if (!route || !route.polyline || !Number.isFinite(Number(route.distance)) || Number(route.distance) < 0 || !Number.isFinite(Number(route.expectedTravelTime)) || Number(route.expectedTravelTime) < 0) return null;
  const distanceMeters = Number(route.distance);
  const expectedTravelTimeSeconds = Number(route.expectedTravelTime);
  return {
    distanceMeters,
    expectedTravelTimeSeconds,
    distanceLabel: formatDistance(distanceMeters),
    etaLabel: formatDuration(expectedTravelTimeSeconds),
  };
}
