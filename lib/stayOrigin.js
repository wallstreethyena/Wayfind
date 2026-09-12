export function validStayOrigin(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 24 && lat <= 31.1 && lng >= -87.7 && lng <= -79.8;
}
