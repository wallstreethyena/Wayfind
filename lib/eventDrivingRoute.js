// Maps Embed directions is a no-charge SKU. Never use the paid Routes/Maps JS APIs.
// https://developers.google.com/maps/documentation/embed/usage-and-billing
export function drivingEmbedUrl(key, origin, destination) {
  if (!key || /placeholder/i.test(key)) return null;
  const valid = p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && !(p.lat === 0 && p.lng === 0);
  const from = typeof origin === "string" ? origin.trim() : valid(origin) ? `${origin.lat},${origin.lng}` : "";
  if (!from || from.length > 200 || !valid(destination)) return null;
  const q = new URLSearchParams({ key, origin: from, destination: `${destination.lat},${destination.lng}`, mode: "driving", units: "imperial" });
  return "https://www.google.com/maps/embed/v1/directions?" + q;
}
