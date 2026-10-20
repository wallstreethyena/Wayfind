// Display distances are derived exclusively from a current device fix. Search
// centers and API distMi values have different meanings and must never enter here.
function coordinateNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function normalizeCoordinates(value) {
  if (!value || typeof value !== 'object') return null;
  const short = 'lat' in value || 'lng' in value;
  const lat = coordinateNumber(short ? value.lat : value.latitude);
  const lng = coordinateNumber(short ? value.lng : value.longitude);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function distanceMiles(origin, destination) {
  const a = normalizeCoordinates(origin);
  const b = normalizeCoordinates(destination);
  if (!a || !b) return null;
  const rad = Math.PI / 180;
  const sinLat = Math.sin((b.lat - a.lat) * rad / 2);
  const sinLng = Math.sin((b.lng - a.lng) * rad / 2);
  const h = sinLat ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * sinLng ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

export function formatDistanceMiles(miles) {
  return typeof miles === 'number' && Number.isFinite(miles) && miles >= 0 ? miles.toFixed(1) : null;
}
